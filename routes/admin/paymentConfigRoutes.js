const express = require('express');
const adminPaymentConfigController = require('../../controllers/admin/adminPaymentConfigController');

const router = express.Router();

router.get('/bank-accounts', adminPaymentConfigController.listBankAccounts);
router.post('/bank-accounts', adminPaymentConfigController.createBankAccount);
router.put('/bank-accounts/:id', adminPaymentConfigController.updateBankAccount);
router.patch('/bank-accounts/:id/toggle', adminPaymentConfigController.toggleBankAccount);
router.get('/settings', adminPaymentConfigController.getSettings);
router.put('/settings', adminPaymentConfigController.updateSettings);

module.exports = router;
