const { MongoMemoryReplSet } = require('mongodb-memory-server');

const startMemoryServer = async () => {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: 'rs0' },
  });
  await replSet.waitUntilRunning();

  const memoryUri = replSet.getUri('x666');
  process.env.MEMORY_MONGODB_URI = memoryUri;
  process.env.MONGODB_URI = memoryUri;
  console.log('In-memory MongoDB replica set started');

  await new Promise((resolve) => setTimeout(resolve, 1500));

  const mongoose = require('mongoose');

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
