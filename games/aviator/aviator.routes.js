// games/aviator/aviator.routes.js
const express = require('express');
const router = express.Router();
const aviatorController = require('./aviator.controller');

// Main Game Routine Actions
router.post('/start-round', aviatorController.startNewRound);
router.post('/place-bet', aviatorController.placeBet);
router.post('/cashout', aviatorController.cashout);

// Polling/Sync Endpoint for Frontend Display Updates
router.get('/state', aviatorController.getGameState);

module.exports = router;