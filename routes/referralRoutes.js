const express = require('express');
const referralController = require('../controllers/referralController');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/', referralController.getReferrals);
router.get('/stats', referralController.getStats);
router.post('/claim-bonus', referralController.claimBonus);

module.exports = router;
