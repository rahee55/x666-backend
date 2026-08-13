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

const resolveApkCandidates = () =>
  [
    process.env.APK_FILE_PATH,
    path.join(__dirname, "public/x666.apk"),
    path.join(__dirname, "public/x666-1.apk"),
    path.join(__dirname, "../x666/public/x666.apk"),
    path.join(__dirname, "../x666/public/x666-1.apk"),
  ].filter(Boolean);

const findApkPath = (fileName = null) => {
  const candidates = resolveApkCandidates();

  if (fileName) {
    const matched = candidates.find(
      (candidate) =>
        path.basename(candidate).toLowerCase() === fileName.toLowerCase() &&
        fs.existsSync(candidate),
    );
    if (matched) return matched;
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const defaultApkPath = findApkPath();
if (defaultApkPath) {
  console.log(`[APK] Download ready: ${defaultApkPath}`);
} else {
  console.warn(
    "[APK] No APK file on server. Upload x666.apk to ~/X666-BACKEND/public/ or set APK_FILE_PATH in .env",
  );
}

app.get("/api/downloads/:fileName", (req, res) => {
  const apkPath = findApkPath(req.params.fileName);

  if (!apkPath) {
    return res.status(404).json({
      success: false,
      message: "APK file missing on server. Upload x666.apk to the backend public folder.",
    });
  }

  res.download(apkPath, path.basename(apkPath));
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
