const dotenv = require("dotenv");
const preservedMongoUri = process.env.MONGODB_URI;
dotenv.config({ override: true });
if (preservedMongoUri) {
  process.env.MONGODB_URI = preservedMongoUri;
}
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/mongoose");
const sessionMiddleware = require("./middleware/session");

// 1. ADD THIS LINE: Import your new socket logic
const { initSocket } = require("./games/aviator/aviator.socket");

const app = express();

connectDB();

app.use(cors("*"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

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
