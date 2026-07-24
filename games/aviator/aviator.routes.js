const express = require('express');
const router = express.Router();
const aviatorController = require('./aviator.controller');
const auth = require('../../middleware/auth'); // Adjust path if needed

router.get('/state', aviatorController.getActiveState);

// This matches your frontend 401 issue: It requires auth to get the user's ID
router.get('/getBetsById', auth, aviatorController.getBetsById);

module.exports = router;