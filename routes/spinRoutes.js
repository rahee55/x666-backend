const express = require('express');
const spinController = require('../controllers/spinController');
const auth = require('../middleware/auth');
const { spinLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(auth);

router.post('/spin', spinLimiter, spinController.spin);
router.get('/history', spinController.getHistory);
router.get('/result/:id', spinController.getResult);

module.exports = router;
