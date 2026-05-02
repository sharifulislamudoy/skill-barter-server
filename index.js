const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const adminUserRoutes = require('./routes/adminUsers');
const skillsRoutes = require('./routes/skills');
const adminSkillsRoutes = require('./routes/adminSkills');
const usersRoutes = require('./routes/users');
const connectionsRoutes = require('./routes/connections');
const adminLogsRoutes = require('./routes/adminLogs'); // new
const { seedCategories } = require('./models/Category');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/admin/skills', adminSkillsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/admin/logs', adminLogsRoutes); // new

app.get('/', (req, res) => {
  res.send('SkillBarter API is running 🚀');
});

seedCategories().catch(console.error);

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});