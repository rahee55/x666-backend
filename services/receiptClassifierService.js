const fs = require("fs");
const axios = require("axios");
const { Jimp } = require("jimp");
const Tesseract = require("tesseract.js");

const normalizeText = (text) =>
  String(text || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const PAYMENT_KEYWORDS = {
  providers: [
    "JAZZCASH",
    "JAZZ CASH",
    "EASYPAISA",
    "EASY PAISA",
    "SADAPAY",
    "NAYAPAY",
    "UPAISA",
    "FINJA",
    "PAYMAX",
  ],
  banks: [
    "FAYSALBANK",
    "FAYSAL BANK",
    "FAYSAL",
    "HBL",
    "UBL",
    "MCB",
    "MEEZAN",
    "ALLIED",
    "BANK AL HABIB",
    "ASKARI",
    "COMMERCIAL",
    "IBAN",
    "RAAST",
    "BANK",
    "ACCOUNT",
    "A/C",
    "CURRENT ACCOUNT",
  ],
  receipt: [
    "TRANSACTION",
    "TRANSFER",
    "PAYMENT",
    "RECEIPT",
    "SUCCESSFUL",
    "COMPLETED",
    "SUCCESS",
    "TID",
    "TXN",
    "TRANSACTION ID",
    "REFERENCE",
    "SENT TO",
    "RECEIVED",
    "MOBILE ACCOUNT",
    "WALLET",
    "REMARK",
    "DESCRIPTION",
    "BALANCE",
    "PURPOSE OF PAYMENT",
    "FROM",
    " TO ",
  ],
  currency: ["PKR", "RS.", "RS ", "RUPEES", "₨"],
};

const NON_RECEIPT_UI_KEYWORDS = [
  "LOGIN",
  "SIGN IN",
  "SIGNIN",
  "PASSWORD",
  "ADMIN PORTAL",
  "ADMIN",
  "DASHBOARD",
  "WELCOME BACK",
  "EMAIL ADDRESS",
  "FORGOT PASSWORD",
  "REGISTER HERE",
  "DEVTOOLS",
  "NETWORK",
  "LOCALHOST",
  "CHROME",
  "BOOKMARKS",
  "BROWSER",
  "GOOGLE",
  "GEMINI",
  "FACEBOOK",
  "INSTAGRAM",
  "WHATSAPP",
  "SELFIE",
  "CAMERA",
  "GALLERY",
];

const NON_RECEIPT_CAPTION_WORDS = [
  "selfie",
  "portrait",
  "person",
  "face",
  "landscape",
  "mountain",
  "beach",
  "food",
  "cat",
  "dog",
  "pet",
  "car",
  "building",
  "sky",
  "tree",
  "flower",
  "group of people",
  "smiling",
  "login",
  "computer screen",
  "laptop",
  "desktop",
  "web page",
  "website",
];

const PAYMENT_CAPTION_WORDS = [
  "receipt",
  "phone",
  "screen",
  "transaction",
  "payment",
  "bank",
  "transfer",
  "text",
  "document",
  "app",
  "mobile",
  "screenshot",
  "message",
  "statement",
];

const INVALID_RECEIPT_MESSAGE =
  "This image is not a valid payment receipt. Please upload a clear JazzCash, EasyPaisa, or bank transfer screenshot.";

const extractText = async (filePath) => {
  const { data } = await Tesseract.recognize(filePath, "eng", {
    logger: () => {},
  });
  return normalizeText(data?.text || "");
};

const analyzeImageStructure = async (filePath) => {
  const image = await Jimp.read(filePath);
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  const totalPixels = width * height;
  let brightPixels = 0;
  let darkPixels = 0;

  image.scan(0, 0, width, height, function scanPixel(_x, _y, idx) {
    const red = this.bitmap.data[idx];
    const green = this.bitmap.data[idx + 1];
    const blue = this.bitmap.data[idx + 2];
    const brightness = (red + green + blue) / 3;
    if (brightness >= 200) brightPixels += 1;
    if (brightness <= 60) darkPixels += 1;
  });

  return {
    width,
    height,
    aspectRatio: width / Math.max(height, 1),
    brightRatio: brightPixels / totalPixels,
    darkRatio: darkPixels / totalPixels,
    isPortrait: height > width,
    isLandscapeDesktopLike:
      width / Math.max(height, 1) >= 1.25 &&
      brightPixels / totalPixels < 0.2 &&
      darkPixels / totalPixels > 0.35,
  };
};

const scoreReceiptText = (text) => {
  let score = 0;
  const found = { providers: [], banks: [], receipt: [], currency: [] };

  Object.entries(PAYMENT_KEYWORDS).forEach(([category, keywords]) => {
    keywords.forEach((keyword) => {
      if (!text.includes(keyword)) return;

      if (category === "providers") {
        score += 4;
      } else if (category === "currency") {
        score += 2;
      } else if (category === "banks") {
        score += keyword.length >= 8 ? 3 : 2;
      } else {
        score += 2;
      }
      found[category].push(keyword);
    });
  });

  const uiKeywordHits = NON_RECEIPT_UI_KEYWORDS.filter((keyword) =>
    text.includes(keyword),
  );
  if (uiKeywordHits.length) {
    score -= uiKeywordHits.length * 4;
  }

  const digitCount = (text.match(/\d/g) || []).length;
  if (digitCount >= 10) score += 3;
  else if (digitCount >= 6) score += 2;
  else if (digitCount >= 3) score += 1;

  if (text.length >= 80) score += 2;
  else if (text.length >= 40) score += 1;
  else if (text.length < 20) score -= 6;

  return { score, found, digitCount, textLength: text.length, uiKeywordHits };
};

const classifyWithHuggingFace = async (filePath) => {
  const token = process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_KEY;
  const headers = { "Content-Type": "application/octet-stream" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const imageBuffer = fs.readFileSync(filePath);
    const response = await axios.post(
      "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base",
      imageBuffer,
      {
        headers,
        timeout: 45000,
      },
    );

    const caption = String(response.data?.[0]?.generated_text || "").toLowerCase();
    if (!caption) return null;

    const paymentHits = PAYMENT_CAPTION_WORDS.filter((word) =>
      caption.includes(word),
    ).length;
    const nonReceiptHits = NON_RECEIPT_CAPTION_WORDS.filter((word) =>
      caption.includes(word),
    ).length;

    return {
      caption,
      paymentHits,
      nonReceiptHits,
      source: token ? "huggingface" : "huggingface-public",
    };
  } catch {
    return null;
  }
};

const evaluateReceiptSignals = ({ textScore, imageMetrics, hfResult }) => {
  const hasProvider = textScore.found.providers.length > 0;
  const hasBank = textScore.found.banks.length > 0;
  const receiptKeywordCount = textScore.found.receipt.length;
  const hasCurrency = textScore.found.currency.length > 0;
  const hasReceiptSignal = receiptKeywordCount > 0 || hasCurrency;
  const hasStrongPaymentText =
    hasProvider ||
    hasBank ||
    (receiptKeywordCount >= 2 && textScore.digitCount >= 6) ||
    (hasCurrency && receiptKeywordCount >= 1 && textScore.digitCount >= 6);

  let isReceipt = textScore.score >= 8 && hasStrongPaymentText;
  let rejectReason = null;

  if (textScore.uiKeywordHits.length >= 1) {
    isReceipt = false;
    rejectReason = INVALID_RECEIPT_MESSAGE;
  }

  if (imageMetrics.isLandscapeDesktopLike && !hasBank && !hasProvider) {
    isReceipt = false;
    rejectReason = INVALID_RECEIPT_MESSAGE;
  }

  if (
    !hasProvider &&
    !hasBank &&
    receiptKeywordCount === 0 &&
    textScore.digitCount < 6
  ) {
    isReceipt = false;
    rejectReason = INVALID_RECEIPT_MESSAGE;
  }

  if (
    imageMetrics.isPortrait &&
    imageMetrics.brightRatio >= 0.35 &&
    hasStrongPaymentText
  ) {
    isReceipt = true;
  }

  if (hfResult) {
    if (
      hfResult.nonReceiptHits >= 1 &&
      hfResult.paymentHits === 0 &&
      !hasBank &&
      !hasProvider
    ) {
      isReceipt = false;
      rejectReason = INVALID_RECEIPT_MESSAGE;
    }

    if (hfResult.paymentHits >= 1 && hasStrongPaymentText) {
      isReceipt = true;
      rejectReason = null;
    }
  }

  if (isReceipt && !hasStrongPaymentText) {
    isReceipt = false;
    rejectReason = INVALID_RECEIPT_MESSAGE;
  }

  return {
    isReceipt,
    rejectReason,
    hasProvider,
    hasBank,
    hasReceiptSignal,
    hasStrongPaymentText,
  };
};

const classifyReceiptImage = async (filePath) => {
  const [normalizedText, imageMetrics] = await Promise.all([
    extractText(filePath),
    analyzeImageStructure(filePath),
  ]);
  const textScore = scoreReceiptText(normalizedText);
  const hfResult = await classifyWithHuggingFace(filePath);

  const evaluation = evaluateReceiptSignals({
    textScore,
    imageMetrics,
    hfResult,
  });

  const method = hfResult ? "ocr+image-ai" : "ocr+image";

  return {
    isReceipt: evaluation.isReceipt,
    confidence: Math.min(Math.max(textScore.score / 14, 0), 1),
    method,
    textScore,
    imageMetrics,
    hfCaption: hfResult?.caption || null,
    reason: evaluation.isReceipt
      ? "Payment receipt detected"
      : evaluation.rejectReason || INVALID_RECEIPT_MESSAGE,
  };
};

module.exports = {
  classifyReceiptImage,
  scoreReceiptText,
  analyzeImageStructure,
  INVALID_RECEIPT_MESSAGE,
};
