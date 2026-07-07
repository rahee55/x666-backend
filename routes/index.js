const express = require('express');

const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const walletRoutes = require('./walletRoutes');
const spinRoutes = require('./spinRoutes');
const referralRoutes = require('./referralRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.get('/user/referral-link', auth, userController.getReferralLink);
router.use('/wallet', walletRoutes);
router.use('/spin', spinRoutes);
router.use('/referrals', referralRoutes);

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'API is running' });
});

module.exports = router;
