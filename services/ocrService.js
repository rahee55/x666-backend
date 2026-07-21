const Tesseract = require("tesseract.js");
const manualPayment = require("../config/manualPayment");

const normalizeText = (text) =>
  String(text || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const parseAmount = (text) => {
  const matches = text.match(/(?:RS\.?|PKR|₨)?\s*([\d,]+(?:\.\d{1,2})?)/gi);
  if (!matches) return null;

  const values = matches
    .map((match) => {
      const digits = match.replace(/[^\d.]/g, "");
      const value = Number.parseFloat(digits);
      return Number.isFinite(value) ? value : null;
    })
    .filter((value) => value !== null);

  return values.length ? Math.max(...values) : null;
};

const parseReference = (text, referenceCode) => {
  const normalized = normalizeText(text);
  const target = normalizeText(referenceCode);
  return normalized.includes(target);
};

const parseTimestamp = (text) => {
  const patterns = [
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})(?:[ T,]+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?))?/i,
    /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})(?:[ T,]+(\d{1,2}:\d{2}(?::\d{2})?))?/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const candidate = new Date(match[0].replace(/-/g, "/"));
    if (!Number.isNaN(candidate.getTime())) {
      return candidate;
    }
  }

  return null;
};

const parseSenderAccountLast4 = (text) => {
  const match = text.match(/(?:A\/C|ACCOUNT|ACC|FROM)[^\d]*(\d{4})\b/i);
  if (match) return match[1];

  const trailing = text.match(/\b(\d{4})\b/g);
  return trailing ? trailing[trailing.length - 1] : null;
};

const extractFromScreenshot = async (filePath) => {
  const { data } = await Tesseract.recognize(filePath, "eng", {
    logger: () => {},
  });

  const rawText = data?.text || "";

  return {
    rawText,
    amount: parseAmount(rawText),
    reference: null,
    timestamp: parseTimestamp(rawText),
    senderAccountLast4: parseSenderAccountLast4(rawText),
  };
};

const validateExtractedFields = ({
  extracted,
  referenceCode,
  expectedAmount,
  submittedAt = new Date(),
}) => {
  const windowMs = manualPayment.ocrTimestampWindowMinutes * 60 * 1000;
  const amountMatch =
    extracted.amount !== null &&
    Math.abs(extracted.amount - expectedAmount) < 0.01;
  const referenceMatch = parseReference(extracted.rawText || "", referenceCode);
  const timestampMatch =
    extracted.timestamp instanceof Date &&
    !Number.isNaN(extracted.timestamp.getTime()) &&
    Math.abs(submittedAt.getTime() - extracted.timestamp.getTime()) <= windowMs;

  const checks = {
    amount: {
      pass: amountMatch,
      expected: expectedAmount,
      found: extracted.amount,
      reason: amountMatch
        ? "Amount matches expected value"
        : "Expected amount not found in receipt text",
    },
    reference: {
      pass: referenceMatch,
      expected: referenceCode,
      found: referenceMatch ? referenceCode : null,
      reason: referenceMatch
        ? "Reference code found in receipt text"
        : "Reference code missing from receipt text",
    },
    timestamp: {
      pass: timestampMatch,
      expectedWithinMinutes: manualPayment.ocrTimestampWindowMinutes,
      found: extracted.timestamp,
      reason: timestampMatch
        ? "Receipt timestamp within allowed window"
        : "Receipt timestamp missing or outside allowed window",
    },
    senderAccountLast4: {
      pass: Boolean(extracted.senderAccountLast4),
      found: extracted.senderAccountLast4,
      reason: extracted.senderAccountLast4
        ? "Sender account digits detected"
        : "Sender account digits not detected (optional)",
    },
  };

  return {
    checks,
    overallPass: checks.amount.pass && checks.reference.pass,
  };
};

module.exports = {
  extractFromScreenshot,
  validateExtractedFields,
  parseAmount,
  parseReference,
  parseTimestamp,
};
