const dotenv = require("dotenv");
const preservedMemoryUri = process.env.MEMORY_MONGODB_URI;
const preservedMongoUri = preservedMemoryUri || process.env.MONGODB_URI;
dotenv.config({ override: true });
if (preservedMemoryUri) {
  process.env.MEMORY_MONGODB_URI = preservedMemoryUri;
}
if (preservedMongoUri) {
  process.env.MONGODB_URI = preservedMongoUri;
}
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const connectDB = require("./config/mongoose");
const sessionMiddleware = require("./middleware/session");

// 1. ADD THIS LINE: Import your new socket logic
const { initSocket } = require("./games/aviator/aviator.socket");

const app = express();

connectDB();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

const resolveApkPath = () => {
  const candidates = [
    process.env.APK_FILE_PATH,
    path.join(__dirname, "../x666/public/x666-1.apk"),
    path.join(__dirname, "public/x666-1.apk"),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
};

const APK_FILE_PATH = resolveApkPath();
const APK_FILE_NAME = path.basename(APK_FILE_PATH || "x666-1.apk");

app.get("/api/downloads/:fileName", (req, res) => {
  if (req.params.fileName !== APK_FILE_NAME) {
    return res.status(404).json({ success: false, message: "APK not found" });
  }

  if (!APK_FILE_PATH || !fs.existsSync(APK_FILE_PATH)) {
    return res.status(404).json({ success: false, message: "APK file missing on server" });
  }

  res.download(APK_FILE_PATH, APK_FILE_NAME);
});

const routes = require("./routes/index");
app.use("/api", routes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 3000;

const otpMode =
  ["true", "1"].includes(String(process.env.OTP_USE_FIXED_CODE || "").trim().toLowerCase()) &&
  process.env.OTP_DEV_FIXED_CODE
    ? `fixed test code (${process.env.OTP_DEV_FIXED_CODE})`
    : "random 6-digit";

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`[OTP] ${otpMode} codes enabled`);
});

initSocket(server);

module.exports = app;
