const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');

// GET /api/users/:slug – get public user info + their verified skills
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const db = await connectDB();
    
    const user = await db.collection('users').findOne({ slug });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Fetch user's verified skills
    const skills = await db.collection('skills')
      .find({ providerId: user._id, verificationStatus: 'verified' })
      .sort({ createdAt: -1 })
      .toArray();
    
    // Return safe user info (no password)
    const { password, ...safeUser } = user;
    res.json({ user: safeUser, skills });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;