const express = require('express');
const router = express.Router();
const aviatorController = require('./aviator.controller');
const auth = require('../../middleware/auth'); // Adjust path if needed

router.get('/state', aviatorController.getActiveState);

// FIX: Changed from router.get to router.post to match your Angular frontend
router.post('/getBetsById', auth, aviatorController.getBetsById);

module.exports = router;