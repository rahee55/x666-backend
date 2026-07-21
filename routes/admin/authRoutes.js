const express = require('express');
const adminAuthController = require('../../controllers/admin/adminAuthController');
const auth = require('../../middleware/auth');
const isAdmin = require('../../middleware/isAdmin');
const { authLimiter } = require('../../middleware/rateLimiter');

const router = express.Router();

router.post('/login', authLimiter, adminAuthController.login);
router.post('/logout', auth, isAdmin, adminAuthController.logout);
router.get('/me', auth, isAdmin, adminAuthController.me);

module.exports = router;
