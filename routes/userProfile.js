const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const slugify = require('slugify');
const cloudinary = require('../config/cloudinary');
const uploadImage = require('../middleware/uploadImage');

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

    if (email && email !== user.email) {
      const emailExists = await users.findOne({ email, _id: { $ne: new ObjectId(userId) } });
      if (emailExists) {
        errors.push('Email already in use');
      } else {
        updateData.email = email;
      }
    }

    if (name && name !== user.name) {
      updateData.name = name;
      const newSlug = await generateUniqueSlug(name, db, new ObjectId(userId));
      updateData.slug = newSlug;
    }

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
      errors.push('Both current password and new password are required');
    }

    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join(', ') });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No changes provided' });
    }

    updateData.updatedAt = new Date();
    
    await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateData }
    );

    const updatedUser = await users.findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );

    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/avatar', uploadImage.single('avatar'), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(401).json({ message: 'User ID required' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const db = await connectDB();
    const users = db.collection('users');
    const user = await users.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.avatarPublicId) {
      await cloudinary.uploader.destroy(user.avatarPublicId);
    }

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'skillbarter_avatars', transformation: [{ width: 200, height: 200, crop: 'fill' }] },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    const avatarUrl = result.secure_url;
    const avatarPublicId = result.public_id;

    await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { avatarUrl, avatarPublicId, updatedAt: new Date() } }
    );

    res.json({ message: 'Avatar updated successfully', avatarUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;