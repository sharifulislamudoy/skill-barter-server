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

// GET /user/:userId - Get all skills for a specific user (any status)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await connectDB();
    const skillsCol = db.collection('skills');
    const skills = await skillsCol.find({ providerId: new ObjectId(userId) }).sort({ createdAt: -1 }).toArray();
    res.json({ skills });
  } catch (error) {
    console.error('Error fetching user skills:', error);
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

// POST /:id/rate - Submit or update rating & feedback
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

    const skill = await skillsCol.findOne({ _id: new ObjectId(id) });
    if (!skill) return res.status(404).json({ message: 'Skill not found' });

    const usersCol = db.collection('users');
    const user = await usersCol.findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();

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

// PUT /:id - Update skill (owner only)
router.put('/:id', upload.single('video'), async (req, res) => {
  try {
    const { id } = req.params;
    const { skillName, skillCategory, description, userId } = req.body; // userId from auth

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const db = await connectDB();
    const skillsCol = db.collection('skills');

    const skill = await skillsCol.findOne({ _id: new ObjectId(id) });
    if (!skill) return res.status(404).json({ message: 'Skill not found' });

    // Check ownership: providerId must match userId
    if (skill.providerId.toString() !== userId) {
      return res.status(403).json({ message: 'You can only edit your own skills' });
    }

    const updateData = {};
    if (skillName) updateData.skillName = skillName;
    if (skillCategory) updateData.skillCategory = skillCategory;
    if (description) updateData.description = description;

    // Handle video replacement if a new file is uploaded
    if (req.file) {
      // Delete old video from Cloudinary
      if (skill.videoPublicId) {
        await cloudinary.uploader.destroy(skill.videoPublicId, { resource_type: 'video' });
      }
      // Upload new video
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
      updateData.videoUrl = result.secure_url;
      updateData.videoPublicId = result.public_id;
    }

    // If skillName or category changed, regenerate slug
    if ((skillName && skillName !== skill.skillName) || (skillCategory && skillCategory !== skill.skillCategory)) {
      const newBaseSlug = slugify(`${updateData.skillName || skill.skillName}-${updateData.skillCategory || skill.skillCategory}`, { lower: true, strict: true });
      let newSlug = newBaseSlug;
      let counter = 1;
      while (await skillsCol.findOne({ slug: newSlug, _id: { $ne: new ObjectId(id) } })) {
        newSlug = `${newBaseSlug}-${counter}`;
        counter++;
      }
      updateData.slug = newSlug;
    }

    updateData.updatedAt = new Date();

    await skillsCol.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    const updatedSkill = await skillsCol.findOne({ _id: new ObjectId(id) });
    res.json({ message: 'Skill updated successfully', skill: updatedSkill });
  } catch (error) {
    console.error('Skill update error:', error);
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
    const { userId } = req.body; // For ownership check

    const db = await connectDB();
    const skill = await db.collection('skills').findOne({ _id: new ObjectId(id) });
    if (!skill) return res.status(404).json({ message: 'Skill not found' });

    // Optional: check if userId matches providerId (owner) or user is admin
    if (userId && skill.providerId.toString() !== userId) {
      // You may also check for admin role here, but for simplicity we assume only owner can delete
      return res.status(403).json({ message: 'You can only delete your own skills' });
    }

    if (skill.videoPublicId) {
      await cloudinary.uploader.destroy(skill.videoPublicId, { resource_type: 'video' });
    }

    await db.collection('ratings').deleteMany({ skillId: new ObjectId(id) });
    await db.collection('skills').deleteOne({ _id: new ObjectId(id) });
    res.json({ message: 'Skill and associated ratings deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /:id/ratings/:ratingId - delete user's own rating
router.delete('/:id/ratings/:ratingId', async (req, res) => {
  try {
    const { id, ratingId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'userId required' });
    }

    const db = await connectDB();
    const ratingsCol = db.collection('ratings');
    const skillsCol = db.collection('skills');

    const rating = await ratingsCol.findOne({
      _id: new ObjectId(ratingId),
      skillId: new ObjectId(id),
      userId: new ObjectId(userId)
    });

    if (!rating) {
      return res.status(404).json({ message: 'Rating not found or not owned by you' });
    }

    await ratingsCol.deleteOne({ _id: new ObjectId(ratingId) });

    const aggregation = await ratingsCol.aggregate([
      { $match: { skillId: new ObjectId(id) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 }
        }
      }
    ]).toArray();

    const averageRating = aggregation.length > 0 ? Math.round(aggregation[0].averageRating * 10) / 10 : 0;
    const totalRatings = aggregation.length > 0 ? aggregation[0].totalRatings : 0;

    await skillsCol.updateOne(
      { _id: new ObjectId(id) },
      { $set: { averageRating, totalRatings } }
    );

    res.json({
      message: 'Rating deleted successfully',
      averageRating,
      totalRatings
    });
  } catch (error) {
    console.error('Delete rating error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;