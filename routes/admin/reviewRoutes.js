const express = require('express');
const adminReviewController = require('../../controllers/admin/adminReviewController');

const router = express.Router();

router.post('/list', adminReviewController.listPendingReviews);
router.get('/topup/:id', adminReviewController.getTopupDetail);
router.get('/topup/:id/screenshot', adminReviewController.getTopupScreenshot);
router.post('/:type/:id/approve', adminReviewController.approveReview);
router.post('/:type/:id/reject', adminReviewController.rejectReview);

module.exports = router;
