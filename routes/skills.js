const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const cloudinary = require('../config/cloudinary');
const upload = require('../middleware/upload');
const slugify = require('slugify');

// POST / - Create a skill (skill_member only)
router.post('/', upload.single('video'), async (req, res) => {
  try {
    const { skillName, skillCategory, description, providerName, providerId } = req.body;
    if (!skillName || !skillCategory || !description || !providerName || !providerId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

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

    let baseSlug = slugify(`${skillName}-${skillCategory}`, { lower: true, strict: true });
    const db = await connectDB();
    const skillsCol = db.collection('skills');
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
      averageRating: 0,
      totalRatings: 0,
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

// GET / - Get all verified skills with optional search
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

// GET /pending - Get pending skills
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

// GET /slug/:slug - Get skill by slug (public detail)
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

// GET /:id/ratings - Get all ratings for a skill
router.get('/:id/ratings', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await connectDB();
    const ratingsCol = db.collection('ratings');
    const ratings = await ratingsCol.find({ skillId: new ObjectId(id) }).sort({ createdAt: -1 }).toArray();
    res.json({ ratings });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /:id/rate - Submit or update rating & feedback (requires userId in body)
router.post('/:id/rate', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, userName, rating, feedback } = req.body;

    if (!userId || !userName || !rating) {
      return res.status(400).json({ message: 'Missing required fields: userId, userName, rating' });
    }

    const numericRating = Number(rating);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const db = await connectDB();
    const skillsCol = db.collection('skills');
    const ratingsCol = db.collection('ratings');

    // Verify skill exists
    const skill = await skillsCol.findOne({ _id: new ObjectId(id) });
    if (!skill) return res.status(404).json({ message: 'Skill not found' });

    // Verify user exists
    const usersCol = db.collection('users');
    const user = await usersCol.findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();

    // Upsert rating
    const existingRating = await ratingsCol.findOne({
      skillId: new ObjectId(id),
      userId: new ObjectId(userId),
    });

    if (existingRating) {
      await ratingsCol.updateOne(
        { _id: existingRating._id },
        {
          $set: {
            rating: numericRating,
            feedback: feedback || '',
            updatedAt: now,
          },
        }
      );
    } else {
      await ratingsCol.insertOne({
        skillId: new ObjectId(id),
        userId: new ObjectId(userId),
        userName,
        rating: numericRating,
        feedback: feedback || '',
        createdAt: now,
        updatedAt: now,
      });
    }

    // Recalculate average rating
    const aggregation = await ratingsCol.aggregate([
      { $match: { skillId: new ObjectId(id) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 },
        },
      },
    ]).toArray();

    const averageRating = aggregation.length > 0 ? Math.round(aggregation[0].averageRating * 10) / 10 : 0;
    const totalRatings = aggregation.length > 0 ? aggregation[0].totalRatings : 0;

    await skillsCol.updateOne(
      { _id: new ObjectId(id) },
      { $set: { averageRating, totalRatings } }
    );

    res.json({
      message: existingRating ? 'Rating updated successfully' : 'Rating submitted successfully',
      averageRating,
      totalRatings,
    });
  } catch (error) {
    console.error('Rating submission error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH /:id/approve
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

// PATCH /:id/reject
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

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await connectDB();
    const skill = await db.collection('skills').findOne({ _id: new ObjectId(id) });
    if (!skill) return res.status(404).json({ message: 'Skill not found' });

    if (skill.videoPublicId) {
      await cloudinary.uploader.destroy(skill.videoPublicId, { resource_type: 'video' });
    }

    // Also delete all ratings for this skill
    await db.collection('ratings').deleteMany({ skillId: new ObjectId(id) });
    await db.collection('skills').deleteOne({ _id: new ObjectId(id) });
    res.json({ message: 'Skill and associated ratings deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;