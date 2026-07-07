require('dotenv').config();
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const startMemoryServer = async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('x666');
  console.log('In-memory MongoDB started');

  const shutdown = async () => {
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  require('./app');
};

startMemoryServer().catch((error) => {
  console.error('Failed to start in-memory MongoDB:', error.message);
  process.exit(1);
});
