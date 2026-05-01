const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const adminUserRoutes = require('./routes/adminUsers');
const skillsRoutes = require('./routes/skills');
const adminSkillsRoutes = require('./routes/adminSkills');
const usersRoutes = require('./routes/users');        // new
const connectionsRoutes = require('./routes/connections'); // new
const { seedCategories } = require('./models/Category');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/admin/skills', adminSkillsRoutes);
app.use('/api/users', usersRoutes);               // new
app.use('/api/connections', connectionsRoutes);   // new

// Health check
app.get('/', (req, res) => {
  res.send('SkillBarter API is running 🚀');
});

// Seed categories on server start
seedCategories().catch(console.error);

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});