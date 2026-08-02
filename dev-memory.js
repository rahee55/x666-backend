require('dotenv').config();
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const startMemoryServer = async () => {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: 'rs0' },
  });
  await replSet.waitUntilRunning();

  const memoryUri = replSet.getUri('x666');
  process.env.MONGODB_URI = memoryUri;
  console.log('In-memory MongoDB replica set started');

  const shutdown = async () => {
    await mongoose.disconnect();
    await replSet.stop();
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
