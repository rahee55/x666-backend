require('dotenv').config();
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const startMemoryServer = async () => {
  const mongod = await MongoMemoryServer.create();
  const memoryUri = mongod.getUri('x666');
  process.env.MONGODB_URI = memoryUri;
  console.log('In-memory MongoDB started');

  const dotenv = require('dotenv');
  const originalConfig = dotenv.config;
  dotenv.config = (opts) => {
    const savedUri = process.env.MONGODB_URI;
    const result = originalConfig(opts);
    process.env.MONGODB_URI = savedUri;
    return result;
  };

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
