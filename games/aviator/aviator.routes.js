// games/aviator/aviator.routes.js
const express = require('express');
const router = express.Router();
const aviatorController = require('./aviator.controller');
// const { verifyToken } = require('../middlewares/auth'); // Ensure you have this

// Polling Endpoint for Frontend Display Updates
router.get('/state', aviatorController.getActiveState);

// Fetch User Bet History (Protected Route)
// Add verifyToken middleware here to protect the route
router.get('/getBetsById', /* verifyToken, */ aviatorController.getBetsById);

module.exports = router;