// backend/index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const adminUserRoutes = require('./routes/adminUsers');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin/users', adminUserRoutes); // 👈 new

app.get('/', (req, res) => {
  res.send('SkillBarter API is running 🚀');
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});