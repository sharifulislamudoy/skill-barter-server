const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');

const ADMIN_KEY = process.env.ADMIN_API_KEY;

router.use((req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_KEY) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
});

// GET /api/admin/logs?limit=100&type=skill_create
router.get('/', async (req, res) => {
  try {
    const { limit = 200, type } = req.query;
    const db = await connectDB();
    const logsCol = db.collection('logs');
    
    let filter = {};
    if (type) filter.type = type;
    
    const logs = await logsCol
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .toArray();
    
    res.json({ logs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;