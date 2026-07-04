const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');

router.get('/', walletController.getWalletData);
router.post('/deposit', walletController.deposit);
router.post('/withdraw', walletController.withdraw);

module.exports = router;