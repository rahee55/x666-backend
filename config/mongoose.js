const mongoose = require('mongoose');

const cleanupUserContactIndexes = async () => {
  const User = require('../models/Users');

  await User.updateMany({ $or: [{ phone: null }, { phone: '' }] }, { $unset: { phone: '' } });
  await User.updateMany({ $or: [{ email: null }, { email: '' }] }, { $unset: { email: '' } });
  await User.syncIndexes();
};

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/x666';

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
    await cleanupUserContactIndexes();
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    console.error('Start MongoDB with: npm run mongo:up  (requires Docker Desktop running)');
    process.exit(1);
  }
};

module.exports = connectDB;
