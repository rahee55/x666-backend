const fs = require("fs/promises");
const path = require("path");
const manualPayment = require("../config/manualPayment");

const ensureReceiptDir = async () => {
  await fs.mkdir(manualPayment.receiptDir, { recursive: true });
};

const buildReceiptNumber = (topupRequestId) => {
  const suffix = String(topupRequestId).slice(-8).toUpperCase();
  return `RCPT-${suffix}-${Date.now().toString(36).toUpperCase()}`;
};

const generateReceipt = async ({
  topupRequest,
  transaction,
  user,
}) => {
  await ensureReceiptDir();

  const receiptNumber =
    topupRequest.receiptNumber || buildReceiptNumber(topupRequest._id);
  const fileName = `${receiptNumber}.json`;
  const filePath = path.join(manualPayment.receiptDir, fileName);

  const payload = {
    receiptNumber,
    status: "success",
    referenceCode: topupRequest.referenceCode,
    requestedAmount: topupRequest.requestedAmount,
    creditedAmount: topupRequest.expectedAmount,
    currency: manualPayment.currency,
    user: {
      id: user._id,
      name: user.name,
      email: user.email || null,
      phone: user.phone || null,
    },
    transactionId: transaction._id,
    topupRequestId: topupRequest._id,
    approvedAt: topupRequest.reviewedAt,
    withdrawableAt: transaction.withdrawableAt,
    generatedAt: new Date().toISOString(),
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    receiptNumber,
    receiptPath: filePath,
    payload,
  };
};

const readReceipt = async (receiptPath) => {
  const raw = await fs.readFile(receiptPath, "utf8");
  return JSON.parse(raw);
};

module.exports = {
  buildReceiptNumber,
  generateReceipt,
  readReceipt,
};
