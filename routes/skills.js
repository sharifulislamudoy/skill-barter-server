// backend/routes/skills.js
const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const cloudinary = require('../config/cloudinary');
const upload = require('../middleware/upload');
const slugify = require('slugify');

// Create a skill (skill_member only)
router.post('/', upload.single('video'), async (req, res) => {
  try {
    const { skillName, skillCategory, description, providerName, providerId } = req.body;
    if (!skillName || !skillCategory || !description || !providerName || !providerId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Upload video to Cloudinary if file exists
    let videoUrl = '';
    let videoPublicId = '';
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'video',
            folder: 'dohhfubsa',
            upload_preset: 'react_unsigned',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      videoUrl = result.secure_url;
      videoPublicId = result.public_id;
    }

    // Generate unique slug: skillName-skillCategory, lowercased, replace spaces with hyphens
    let baseSlug = slugify(`${skillName}-${skillCategory}`, { lower: true, strict: true });
    const db = await connectDB();
    const skillsCol = db.collection('skills');
    // make slug unique by appending counter if needed
    let slug = baseSlug;
    let counter = 1;
    while (await skillsCol.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const newSkill = {
      skillName,
      skillCategory,
      description,
      providerName,
      providerId: new ObjectId(providerId),
      verificationStatus: 'pending',
      ratings: 0,
      feedback: [],
      videoUrl,
      videoPublicId,
      slug,
      createdAt: new Date(),
    };

    const result = await skillsCol.insertOne(newSkill);
    res.status(201).json({ message: 'Skill created successfully', skill: { ...newSkill, _id: result.insertedId } });
  } catch (error) {
    console.error('Skill creation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all verified skills (public /skills page) with optional search
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const db = await connectDB();
    const skillsCol = db.collection('skills');
    let filter = { verificationStatus: 'verified' };
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { skillName: regex },
        { skillCategory: regex },
      ];
    }
    const skills = await skillsCol.find(filter).sort({ createdAt: -1 }).toArray();
    res.json({ skills });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get pending skills (for verifier / admin)
router.get('/pending', async (req, res) => {
  try {
    const db = await connectDB();
    const skillsCol = db.collection('skills');
    const skills = await skillsCol.find({ verificationStatus: 'pending' }).sort({ createdAt: -1 }).toArray();
    res.json({ skills });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get skill by slug (public detail)
router.get('/slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const db = await connectDB();
    const skill = await db.collection('skills').findOne({ slug, verificationStatus: 'verified' });
    if (!skill) return res.status(404).json({ message: 'Skill not found' });
    res.json({ skill });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Approve a skill (verifier / admin)
router.patch('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await connectDB();
    const result = await db.collection('skills').updateOne(
      { _id: new ObjectId(id) },
      { $set: { verificationStatus: 'verified' } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: 'Skill not found' });
    res.json({ message: 'Skill approved' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Reject a skill (verifier / admin)
router.patch('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await connectDB();
    const result = await db.collection('skills').updateOne(
      { _id: new ObjectId(id) },
      { $set: { verificationStatus: 'rejected' } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: 'Skill not found' });
    res.json({ message: 'Skill rejected' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete a skill (admin only) - also remove video from cloudinary
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await connectDB();
    const skill = await db.collection('skills').findOne({ _id: new ObjectId(id) });
    if (!skill) return res.status(404).json({ message: 'Skill not found' });

    // Delete video from Cloudinary if exists
    if (skill.videoPublicId) {
      await cloudinary.uploader.destroy(skill.videoPublicId, { resource_type: 'video' });
    }

    await db.collection('skills').deleteOne({ _id: new ObjectId(id) });
    res.json({ message: 'Skill deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;