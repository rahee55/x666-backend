const express = require('express');
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const { otpLimiter, authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/signup', authLimiter, authController.signup);
router.post('/resend-signup-otp', otpLimiter, authController.resendSignupOtp);
router.post('/verify-signup-otp', authLimiter, authController.verifySignupOtp);
router.post('/login', authLimiter, authController.login);
router.post('/logout', auth, authController.logout);
router.post('/forgot-password', otpLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/change-password', auth, authController.changePassword);

module.exports = router;
