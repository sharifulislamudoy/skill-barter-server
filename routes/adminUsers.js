// backend/routes/adminUsers.js
const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');

// Simple API key check (use a more robust auth in production)
const ADMIN_KEY = process.env.ADMIN_API_KEY;

router.use((req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_KEY) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
});

// GET all users (exclude passwords)
router.get('/', async (req, res) => {
  try {
    const users = await connectDB();
    const allUsers = await users.find({}, { projection: { password: 0 } }).toArray();
    res.json({ users: allUsers });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH update user role
router.patch('/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const validRoles = ['skill_member', 'skill_verifier', 'admin'];

    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const users = await connectDB();
    const result = await users.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updated = await users.findOne(
      { _id: new ObjectId(id) },
      { projection: { password: 0 } }
    );
    res.json({ message: 'Role updated', user: updated });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE a user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const users = await connectDB();
    const result = await users.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;