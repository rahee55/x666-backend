// games/aviator/aviator.controller.js
const { getGameState } = require('./aviator.socket');
// Require your DB models here, e.g., const Bet = require('../models/Bet');

const getActiveState = (req, res) => {
    try {
        const currentState = getGameState();
        
        return res.status(200).json({
            success: true,
            roundId: currentState.roundId,
            status: currentState.status,
            currentMultiplier: currentState.currentMultiplier,
            history: currentState.history.slice(-10)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Fix for your Angular CONFIG.userBetsHistory 401 Error
const getBetsById = async (req, res) => {
    try {
        // req.user.id assumes you have an auth middleware extracting the JWT
        const userId = req.user.id; 
        
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized access" });
        }

        // Example DB query:
        // const userBets = await Bet.find({ userId: userId }).sort({ createdAt: -1 }).limit(50);
        
        // Placeholder response until you wire up Mongoose/Sequelize
        const userBets = []; 

        return res.status(200).json({
            success: true,
            data: userBets
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getActiveState,
    getBetsById
};