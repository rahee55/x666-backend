const express = require('express');
const adminWithdrawalController = require('../../controllers/admin/adminWithdrawalController');

const router = express.Router();

router.get('/pending', adminWithdrawalController.listPendingWithdrawals);
router.post('/:id/approve', adminWithdrawalController.approveWithdraw);
router.post('/:id/reject', adminWithdrawalController.rejectWithdraw);

module.exports = router;
