const express = require("express");
const walletController = require("../controllers/walletController");
const bankDetailController = require("../controllers/bankDetailController");
const auth = require("../middleware/auth");
const { otpLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.use(auth);

router.get("/payment-config", walletController.getPaymentConfig);
router.get("/balance", walletController.getBalance);
router.get("/transactions", walletController.getTransactions);

router.get("/bank-details", bankDetailController.listBankDetails);
router.post("/bank-details", bankDetailController.addBankDetail);
router.put("/bank-details/:id", bankDetailController.updateBankDetail);
router.delete("/bank-details/:id", bankDetailController.deleteBankDetail);
router.patch(
  "/bank-details/:id/default",
  bankDetailController.setDefaultBankDetail,
);
router.get("/withdraw/methods", bankDetailController.getWithdrawMethodOptions);

router.post("/send-otp", otpLimiter, walletController.sendOtp);
router.post("/withdraw", walletController.withdraw);
router.get("/withdraw/status/:id", walletController.getWithdrawStatus);
router.get("/withdraw/receipt/:id", walletController.getWithdrawReceipt);
router.get("/topup/receipt/:id", walletController.getTopupReceipt);

module.exports = router;
