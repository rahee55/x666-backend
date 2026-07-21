const fs = require("fs");
const path = require("path");
const multer = require("multer");
const manualPayment = require("../config/manualPayment");

const uploadRoot = path.resolve(process.cwd(), manualPayment.uploadDir);

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png"].includes(ext) ? ext : ".jpg";
    cb(null, `receipt-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error("Only JPG and PNG receipt images are allowed"));
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: manualPayment.maxUploadBytes },
});
