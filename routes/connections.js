const express = require('express');
const router = express.Router();
const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const { logAction } = require('../utils/logger');

// POST /api/connections/request
router.post('/request', async (req, res) => {
  try {
    const { fromUserId, toUserId } = req.body;
    if (!fromUserId || !toUserId) {
      return res.status(400).json({ message: 'Missing user IDs' });
    }
    
    const db = await connectDB();
    const connections = db.collection('connections');
    const users = db.collection('users');
    
    const fromUser = await users.findOne({ _id: new ObjectId(fromUserId) });
    const toUser = await users.findOne({ _id: new ObjectId(toUserId) });
    
    const existing = await connections.findOne({
      $or: [
        { fromUserId: new ObjectId(fromUserId), toUserId: new ObjectId(toUserId) },
        { fromUserId: new ObjectId(toUserId), toUserId: new ObjectId(fromUserId) }
      ]
    });
    
    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ message: 'You are already connected' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ message: 'Connection request already sent' });
      }
    }
    
    const newRequest = {
      fromUserId: new ObjectId(fromUserId),
      toUserId: new ObjectId(toUserId),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await connections.insertOne(newRequest);
    
    // Log connection request
    await logAction({
      type: 'connection_request',
      description: `${fromUser?.name} sent connection request to ${toUser?.name}`,
      userId: fromUserId,
      userName: fromUser?.name,
      metadata: { fromUserId, toUserId, toUserName: toUser?.name }
    });
    
    res.status(201).json({ message: 'Connection request sent' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/connections/status (unchanged)
router.get('/status', async (req, res) => {
  try {
    const { userId, targetId } = req.query;
    if (!userId || !targetId) {
      return res.status(400).json({ message: 'Missing userId or targetId' });
    }
    const db = await connectDB();
    const connection = await db.collection('connections').findOne({
      $or: [
        { fromUserId: new ObjectId(userId), toUserId: new ObjectId(targetId) },
        { fromUserId: new ObjectId(targetId), toUserId: new ObjectId(userId) }
      ]
    });
    let status = 'none';
    if (connection) {
      if (connection.status === 'accepted') status = 'connected';
      else if (connection.status === 'pending') {
        if (connection.fromUserId.toString() === userId) status = 'pending_sent';
        else status = 'pending_received';
      }
    }
    res.json({ status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/connections/received/:userId
router.get('/received/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await connectDB();
    const requests = await db.collection('connections')
      .find({ toUserId: new ObjectId(userId), status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();
    const userIds = requests.map(r => r.fromUserId);
    const users = await db.collection('users')
      .find({ _id: { $in: userIds } })
      .toArray();
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const enriched = requests.map(r => ({
      ...r,
      fromUser: userMap.get(r.fromUserId.toString()) || null
    }));
    res.json({ requests: enriched });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/connections/connected/:userId
router.get('/connected/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await connectDB();
    const connections = await db.collection('connections')
      .find({
        status: 'accepted',
        $or: [
          { fromUserId: new ObjectId(userId) },
          { toUserId: new ObjectId(userId) }
        ]
      })
      .toArray();
    const otherUserIds = connections.map(conn => {
      if (conn.fromUserId.toString() === userId) return conn.toUserId;
      else return conn.fromUserId;
    });
    const users = await db.collection('users')
      .find({ _id: { $in: otherUserIds } })
      .toArray();
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const enriched = connections.map(conn => {
      const otherId = conn.fromUserId.toString() === userId ? conn.toUserId.toString() : conn.fromUserId.toString();
      return {
        connectionId: conn._id,
        user: userMap.get(otherId) || null,
        connectedAt: conn.updatedAt || conn.createdAt
      };
    }).filter(item => item.user !== null);
    res.json({ connections: enriched });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/connections/disconnect/:connectionId
router.delete('/disconnect/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const db = await connectDB();
    const conn = await db.collection('connections').findOne({ _id: new ObjectId(connectionId) });
    if (!conn) return res.status(404).json({ message: 'Connection not found' });
    
    const users = db.collection('users');
    const fromUser = await users.findOne({ _id: conn.fromUserId });
    const toUser = await users.findOne({ _id: conn.toUserId });
    
    await db.collection('connections').deleteOne({ _id: new ObjectId(connectionId) });
    
    await logAction({
      type: 'connection_disconnect',
      description: `Connection disconnected between ${fromUser?.name} and ${toUser?.name}`,
      userId: null,
      userName: 'System',
      metadata: { fromUserId: conn.fromUserId, toUserId: conn.toUserId }
    });
    
    res.json({ message: 'Disconnected successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH /api/connections/:id/accept
router.patch('/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await connectDB();
    const conn = await db.collection('connections').findOne({ _id: new ObjectId(id) });
    if (!conn) return res.status(404).json({ message: 'Request not found' });
    
    const result = await db.collection('connections').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'accepted', updatedAt: new Date() } }
    );
    
    const users = db.collection('users');
    const fromUser = await users.findOne({ _id: conn.fromUserId });
    const toUser = await users.findOne({ _id: conn.toUserId });
    
    await logAction({
      type: 'connection_accept',
      description: `${toUser?.name} accepted connection request from ${fromUser?.name}`,
      userId: conn.toUserId,
      userName: toUser?.name,
      metadata: { fromUserId: conn.fromUserId, fromUserName: fromUser?.name }
    });
    
    res.json({ message: 'Request accepted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH /api/connections/:id/reject
router.patch('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await connectDB();
    const conn = await db.collection('connections').findOne({ _id: new ObjectId(id) });
    if (!conn) return res.status(404).json({ message: 'Request not found' });
    
    const users = db.collection('users');
    const fromUser = await users.findOne({ _id: conn.fromUserId });
    const toUser = await users.findOne({ _id: conn.toUserId });
    
    await db.collection('connections').deleteOne({ _id: new ObjectId(id) });
    
    await logAction({
      type: 'connection_reject',
      description: `${toUser?.name} rejected connection request from ${fromUser?.name}`,
      userId: conn.toUserId,
      userName: toUser?.name,
      metadata: { fromUserId: conn.fromUserId, fromUserName: fromUser?.name }
    });
    
    res.json({ message: 'Request rejected and removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;