const express = require('express');
const auth = require('../../middleware/auth');
const isAdmin = require('../../middleware/isAdmin');
const adminAuthRoutes = require('./authRoutes');
const adminUserRoutes = require('./userRoutes');
const adminPaymentConfigRoutes = require('./paymentConfigRoutes');
const adminReviewRoutes = require('./reviewRoutes');
const adminDashboardController = require('../../controllers/admin/adminDashboardController');

const router = express.Router();

router.use('/auth', adminAuthRoutes);

router.use(auth, isAdmin);

router.use('/users', adminUserRoutes);
router.use('/payment-config', adminPaymentConfigRoutes);
router.use('/review', adminReviewRoutes);
router.get('/dashboard/stats', adminDashboardController.getStats);

module.exports = router;