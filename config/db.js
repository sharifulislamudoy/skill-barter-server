const { MongoClient, ServerApiVersion } = require('mongodb');

const client = new MongoClient(process.env.DB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let usersCollection = null;

async function connectDB() {
  if (usersCollection) return usersCollection;
  await client.connect();
  const db = client.db('skillbarter'); // change DB name if needed
  usersCollection = db.collection('users');
  return usersCollection;
}

module.exports = { connectDB };