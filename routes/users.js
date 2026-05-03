const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');

router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const db = await connectDB();
    const usersCol = db.collection('users');
    const skillsCol = db.collection('skills');

    let query = { role: 'skill_member' };
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const users = await usersCol.find(query).toArray();

    const userIds = users.map(u => u._id);
    const skills = await skillsCol.find({ providerId: { $in: userIds }, verificationStatus: 'verified' }).toArray();

    const statsMap = new Map();
    for (const skill of skills) {
      const pid = skill.providerId.toString();
      if (!statsMap.has(pid)) {
        statsMap.set(pid, { totalSkills: 0, totalRatingsSum: 0, weightedRatingSum: 0 });
      }
      const stats = statsMap.get(pid);
      stats.totalSkills++;
      stats.totalRatingsSum += skill.totalRatings || 0;
      stats.weightedRatingSum += (skill.averageRating || 0) * (skill.totalRatings || 0);
    }

    const resultUsers = users.map(user => {
      const stats = statsMap.get(user._id.toString()) || { totalSkills: 0, totalRatingsSum: 0, weightedRatingSum: 0 };
      const overallAvg = stats.totalRatingsSum > 0 ? stats.weightedRatingSum / stats.totalRatingsSum : 0;
      return {
        _id: user._id,
        name: user.name,
        slug: user.slug,
        avatarUrl: user.avatarUrl,   // ✅ include avatar
        createdAt: user.createdAt,
        totalSkills: stats.totalSkills,
        totalRatings: stats.totalRatingsSum,
        averageRating: overallAvg
      };
    });

    res.json({ users: resultUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const db = await connectDB();

    const user = await db.collection('users').findOne({ slug });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const skills = await db.collection('skills')
      .find({ providerId: user._id, verificationStatus: 'verified' })
      .sort({ createdAt: -1 })
      .toArray();

    const { password, ...safeUser } = user;
    res.json({ user: safeUser, skills });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;