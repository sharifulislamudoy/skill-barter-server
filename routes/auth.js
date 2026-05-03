const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { connectDB } = require('../config/db');
const slugify = require('slugify');
const { logAction } = require('../utils/logger');
const cloudinary = require('../config/cloudinary');
const uploadImage = require('../middleware/uploadImage');

async function generateUniqueSlug(baseName, db) {
  let slug = slugify(baseName, { lower: true, strict: true });
  let counter = 1;
  let existing = await db.collection('users').findOne({ slug });
  while (existing) {
    slug = `${slugify(baseName, { lower: true, strict: true })}-${counter}`;
    counter++;
    existing = await db.collection('users').findOne({ slug });
  }
  return slug;
}

router.post('/register', uploadImage.single('avatar'), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const db = await connectDB();
    const users = db.collection('users');

    const existing = await users.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const slug = await generateUniqueSlug(name, db);

    let avatarUrl = null;
    let avatarPublicId = null;
    if (req.file) {
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
      avatarUrl = result.secure_url;
      avatarPublicId = result.public_id;
    }

    const newUser = {
      name,
      email,
      password: hashed,
      role: 'skill_member',
      slug,
      avatarUrl,
      avatarPublicId,
      createdAt: new Date(),
    };

    const result = await users.insertOne(newUser);
    const { password: _, ...userOut } = newUser;

    await logAction({
      type: 'user_register',
      description: `New user registered: ${name} (${email})`,
      userId: result.insertedId,
      userName: name,
      metadata: { email, role: 'skill_member', hasAvatar: !!avatarUrl }
    });

    res.status(201).json({ message: 'Registration successful', user: { ...userOut, _id: result.insertedId } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const db = await connectDB();
    const users = db.collection('users');

    const user = await users.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await logAction({
      type: 'user_login',
      description: `User logged in: ${user.name} (${user.email})`,
      userId: user._id,
      userName: user.name,
      metadata: { email, role: user.role }
    });

    const { password: _, ...userOut } = user;
    res.json({ message: 'Login successful', user: userOut });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;