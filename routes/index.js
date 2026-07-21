const express = require("express");

const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const userController = require("../controllers/userController");
const auth = require("../middleware/auth");
const walletRoutes = require("./walletRoutes");
const topupRoutes = require("./topupRoutes");
const adminRoutes = require("./admin");
const spinRoutes = require("./spinRoutes");
const referralRoutes = require("./referralRoutes");

// NEW: Import the Aviator game routes from the games folder
const aviatorRoutes = require("../games/aviator/aviator.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.get("/user/referral-link", auth, userController.getReferralLink);
router.use("/wallet", walletRoutes);
router.use("/topup", topupRoutes);
router.use("/admin", adminRoutes);
router.use("/spin", spinRoutes);
router.use("/referrals", referralRoutes);

// NEW: Connect the Aviator game to the /games/aviator endpoint
router.use("/games/aviator", aviatorRoutes);

router.get("/health", (req, res) => {
  res.json({ success: true, message: "API is running" });
});

module.exports = router;
