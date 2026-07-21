const express = require('express');
const auth = require('../../middleware/auth');
const isAdmin = require('../../middleware/isAdmin');
const adminAuthRoutes = require('./authRoutes');
const adminUserRoutes = require('./userRoutes');
const adminTransactionRoutes = require('./transactionRoutes');
const adminPaymentConfigRoutes = require('./paymentConfigRoutes');
const adminWithdrawalRoutes = require('./withdrawalRoutes');
const adminDashboardController = require('../../controllers/admin/adminDashboardController');

const router = express.Router();

router.use('/auth', adminAuthRoutes);

router.use(auth, isAdmin);

router.use('/users', adminUserRoutes);
router.use('/transactions', adminTransactionRoutes);
router.use('/payment-config', adminPaymentConfigRoutes);
router.use('/withdrawals', adminWithdrawalRoutes);
router.get('/dashboard/stats', adminDashboardController.getStats);

module.exports = router;
