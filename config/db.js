// backend/config/db.js
const { MongoClient, ServerApiVersion } = require('mongodb');

const client = new MongoClient(process.env.DB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let dbInstance = null;

async function connectDB() {
  if (dbInstance) return dbInstance;
  await client.connect();
  dbInstance = client.db('skillbarter'); // change DB name if needed
  return dbInstance;
}

module.exports = { connectDB };