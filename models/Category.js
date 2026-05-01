// backend/models/Category.js
const { connectDB } = require('../config/db');

const categoriesList = [
  "Web Development", "Design", "Music", "Languages", "Marketing",
  "Photography", "Cooking", "Fitness", "Writing", "Data Science",
  "Machine Learning", "Mobile Development", "Game Development",
  "Digital Marketing", "SEO", "Graphic Design", "Illustration",
  "Video Editing", "Animation", "Public Speaking", "Finance",
  "Investing", "Entrepreneurship", "Project Management",
  "UI/UX Design", "Cybersecurity", "Networking", "Cloud Computing",
  "DevOps", "Blockchain", "AR/VR", "Robotics", "Math", "Physics",
  "Chemistry", "Biology", "History", "Philosophy", "Yoga", "Dancing"
];

async function seedCategories() {
  const db = await connectDB();
  const collection = db.collection('categories');
  const existing = await collection.countDocuments();
  if (existing === 0) {
    const docs = categoriesList.map(name => ({ name }));
    await collection.insertMany(docs);
    console.log('Categories seeded');
  }
}

module.exports = { seedCategories };