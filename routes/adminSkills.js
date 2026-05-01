// backend/routes/adminSkills.js
const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const cloudinary = require('../config/cloudinary');

const ADMIN_KEY = process.env.ADMIN_API_KEY;

router.use((req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_KEY) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
});

// GET all skills (including pending, verified, rejected) - admin overview
router.get('/', async (req, res) => {
  try {
    const db = await connectDB();
    const skills = await db.collection('skills').find().sort({ createdAt: -1 }).toArray();
    res.json({ skills });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Approve
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

// Reject
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

// Delete (with video removal)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await connectDB();
    const skill = await db.collection('skills').findOne({ _id: new ObjectId(id) });
    if (!skill) return res.status(404).json({ message: 'Skill not found' });

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