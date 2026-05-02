const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');

async function logAction({ type, description, userId, userName, metadata = {} }) {
  try {
    const db = await connectDB();
    const logsCol = db.collection('logs');
    await logsCol.insertOne({
      type,
      description,
      userId: userId ? new ObjectId(userId) : null,
      userName: userName || 'System',
      metadata,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

module.exports = { logAction };