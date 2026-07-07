const express = require('express');
const walletController = require('../controllers/walletController');
const auth = require('../middleware/auth');
const { otpLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Safepay callbacks — no JWT (Safepay redirects here)
router.get('/topup/callback', walletController.topupCallback);
router.post('/topup/callback', walletController.topupCallback);
router.get('/topup/cancel', walletController.topupCancel);
router.post('/topup/cancel', walletController.topupCancel);

router.use(auth);

router.get('/payment-config', walletController.getPaymentConfig);
router.get('/withdraw/methods', walletController.getWithdrawMethods);
router.get('/balance', walletController.getBalance);
router.get('/transactions', walletController.getTransactions);

router.get('/topup/status/:orderId', walletController.getTopupStatus);
router.get('/topup/transaction/:id', walletController.getTopupStatusById);

router.post('/topup', otpLimiter, walletController.topup);
router.post('/topup/verify', walletController.topupVerify);

router.post('/withdraw', otpLimiter, walletController.withdraw);
router.post('/withdraw/verify', walletController.withdrawVerify);
router.get('/withdraw/status/:id', walletController.getWithdrawStatus);

module.exports = router;
