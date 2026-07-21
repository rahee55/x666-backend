const express = require('express');
const adminTransactionController = require('../../controllers/admin/adminTransactionController');

const router = express.Router();

router.get('/', adminTransactionController.listTransactions);
router.get('/:id/screenshot', adminTransactionController.getScreenshot);
router.get('/:id', adminTransactionController.getTransaction);
router.patch('/:id/approve', adminTransactionController.approveTransaction);
router.patch('/:id/reject', adminTransactionController.rejectTransaction);

module.exports = router;
