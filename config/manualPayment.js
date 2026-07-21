const parseJsonEnv = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const DEFAULT_DEPOSIT_ACCOUNTS = [
  {
    bankName: "HBL",
    accountTitle: "x666 Official",
    iban: "PK00HBL0000000000000000",
    accountNumber: null,
    gateway: "bank",
    label: "HBL Bank Transfer",
    instructions:
      "Send the exact expected amount and put the TOPUP reference in the transfer note/remark field.",
  },
  {
    bankName: "JazzCash",
    accountTitle: "x666 Official",
    accountNumber: "03001234567",
    iban: null,
    gateway: "jazzcash",
    label: "JazzCash",
    instructions:
      "Send the exact expected amount and include the TOPUP reference in the comment.",
  },
  {
    bankName: "EasyPaisa",
    accountTitle: "x666 Official",
    accountNumber: "03001234567",
    iban: null,
    gateway: "easypaisa",
    label: "EasyPaisa",
    instructions:
      "Send the exact expected amount and include the TOPUP reference in the comment.",
  },
];

module.exports = {
  currency: process.env.PAYMENT_CURRENCY || "PKR",
  topupRequestTtlHours: Number(process.env.TOPUP_REQUEST_TTL_HOURS) || 24,
  ocrTimestampWindowMinutes:
    Number(process.env.OCR_TIMESTAMP_WINDOW_MINUTES) || 30,
  withdrawHoldHours: Number(process.env.WITHDRAW_HOLD_HOURS) || 48,
  maxTopupPerTransaction: Number(process.env.MAX_TOPUP_PER_TRANSACTION) || 50000,
  maxTopupPerDay: Number(process.env.MAX_TOPUP_PER_DAY) || 100000,
  maxTopupPerDayNewUser:
    Number(process.env.MAX_TOPUP_PER_DAY_NEW_USER) || 10000,
  newUserDays: Number(process.env.NEW_USER_DAYS) || 7,
  maxPendingTopupsPerUser:
    Number(process.env.MAX_PENDING_TOPUPS_PER_USER) || 5,
  phashSimilarityThreshold:
    Number(process.env.PHASH_SIMILARITY_THRESHOLD) || 10,
  uploadDir: process.env.UPLOAD_DIR || "uploads/receipts",
  receiptDir: process.env.RECEIPT_DIR || "uploads/payment-receipts",
  maxUploadBytes: Number(process.env.MAX_RECEIPT_UPLOAD_BYTES) || 5 * 1024 * 1024,
  seedAccounts: parseJsonEnv(
    process.env.PLATFORM_DEPOSIT_ACCOUNTS,
    DEFAULT_DEPOSIT_ACCOUNTS,
  ),
};
