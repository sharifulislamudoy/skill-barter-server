const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const { logAction } = require('../utils/logger');

const ADMIN_KEY = process.env.ADMIN_API_KEY;

router.use((req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_KEY) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
});

// GET all users
router.get('/', async (req, res) => {
  try {
    const db = await connectDB();
    const users = db.collection('users');
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
    const db = await connectDB();
    const users = db.collection('users');
    const userBefore = await users.findOne({ _id: new ObjectId(id) });
    if (!userBefore) return res.status(404).json({ message: 'User not found' });
    
    const result = await users.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    await logAction({
      type: 'role_change',
      description: `Role changed for ${userBefore.name} from ${userBefore.role} to ${role}`,
      userId: id,
      userName: userBefore.name,
      metadata: { oldRole: userBefore.role, newRole: role, changedBy: 'admin' }
    });
    
    const updated = await users.findOne({ _id: new ObjectId(id) }, { projection: { password: 0 } });
    res.json({ message: 'Role updated', user: updated });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE a user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await connectDB();
    const users = db.collection('users');
    const user = await users.findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const result = await users.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    await logAction({
      type: 'user_delete',
      description: `User deleted: ${user.name} (${user.email}) by admin`,
      userId: id,
      userName: user.name,
      metadata: { deletedBy: 'admin', role: user.role }
    });
    
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;