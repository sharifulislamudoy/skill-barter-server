const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// MongoDB setup (no usage yet)
const client = new MongoClient(process.env.DB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// basic route
app.get('/', (req, res) => {
  res.send('Hello World 🚀');
});

// start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});