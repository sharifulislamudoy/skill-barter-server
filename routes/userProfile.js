const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const slugify = require('slugify');

async function generateUniqueSlug(baseName, db, excludeId) {
  let slug = slugify(baseName, { lower: true, strict: true });
  let counter = 1;
  let existing = await db.collection('users').findOne({ slug, _id: { $ne: excludeId } });
  while (existing) {
    slug = `${slugify(baseName, { lower: true, strict: true })}-${counter}`;
    counter++;
    existing = await db.collection('users').findOne({ slug, _id: { $ne: excludeId } });
  }
  return slug;
}

router.put('/profile', async (req, res) => {
  try {
    const { userId, name, email, currentPassword, newPassword } = req.body;
    
    if (!userId) {
      return res.status(401).json({ message: 'User ID required' });
    }

    const db = await connectDB();
    const users = db.collection('users');
    
    const user = await users.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updateData = {};
    const errors = [];

    // Update email
    if (email && email !== user.email) {
      const emailExists = await users.findOne({ email, _id: { $ne: new ObjectId(userId) } });
      if (emailExists) {
        errors.push('Email already in use');
      } else {
        updateData.email = email;
      }
    }

    // Update name
    if (name && name !== user.name) {
      updateData.name = name;
      const newSlug = await generateUniqueSlug(name, db, new ObjectId(userId));
      updateData.slug = newSlug;
    }

    // Update password
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        errors.push('Current password is incorrect');
      } else if (newPassword.length < 6) {
        errors.push('New password must be at least 6 characters');
      } else {
        updateData.password = await bcrypt.hash(newPassword, 10);
      }
    } else if (currentPassword || newPassword) {
      errors.push('Both current password and new password are required to change password');
    }

    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join(', ') });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No changes provided' });
    }

    updateData.updatedAt = new Date();
    
    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ message: 'No changes were applied' });
    }

    const updatedUser = await users.findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );

    res.json({ 
      message: 'Profile updated successfully', 
      user: updatedUser 
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;