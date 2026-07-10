const express = require('express');
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const { otpLimiter, authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/signup', authLimiter, authController.signup);
router.post('/login', authLimiter, authController.login);
router.post('/logout', auth, authController.logout);
router.post('/forgot-password', otpLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

module.exports = router;
