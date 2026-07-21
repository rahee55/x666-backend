const mongoose = require("mongoose");
const manualPayment = require("./manualPayment");

const cleanupUserContactIndexes = async () => {
  const User = require("../models/Users");

  await User.updateMany(
    { $or: [{ phone: null }, { phone: "" }] },
    { $unset: { phone: "" } },
  );
  await User.updateMany(
    { $or: [{ email: null }, { email: "" }] },
    { $unset: { email: "" } },
  );
  await User.syncIndexes();
};

const seedBankAccounts = async () => {
  const BankAccount = require("../models/BankAccount");
  const count = await BankAccount.countDocuments();
  if (count > 0) return;

  await BankAccount.insertMany(
    manualPayment.seedAccounts.map((account) => ({
      bankName: account.bankName,
      accountTitle: account.accountTitle,
      accountNumber: account.accountNumber || null,
      iban: account.iban || null,
      gateway: account.gateway,
      label: account.label,
      instructions: account.instructions,
      isActive: true,
    })),
  );
};

const syncPaymentIndexes = async () => {
  const TopupRequest = require("../models/TopupRequest");
  const Transaction = require("../models/Transaction");
  await TopupRequest.syncIndexes();
  await Transaction.syncIndexes();
};

const { seedSettings } = require("../services/settingsService");

const seedAdminUser = async () => {
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) return;

  const User = require("../models/Users");
  const adminCount = await User.countDocuments({ role: "admin", deletedAt: null });
  if (adminCount > 0) return;

  await User.create({
    name: process.env.ADMIN_SEED_NAME || "Admin",
    email,
    password,
    role: "admin",
    status: "active",
  });

  console.log(`Seeded admin user: ${email}`);
};

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/x666";

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
    await cleanupUserContactIndexes();
    await seedBankAccounts();
    await seedSettings();
    await seedAdminUser();
    await syncPaymentIndexes();
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    console.error(
      "Start MongoDB with: npm run mongo:up  (requires Docker Desktop running)",
    );
    process.exit(1);
  }
};

module.exports = connectDB;
