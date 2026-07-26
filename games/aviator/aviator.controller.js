const { getGameState } = require('./aviator.socket');

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

const getBetsById = async (req, res) => {
    try {
        const userId = req.user.id; 
        
        // DB LOGIC HERE: Fetch bets for this user
        // const userBets = await Bets.find({ userId }).sort({ createdAt: -1 });
        const userBets = []; 

        return res.status(200).json({
            success: true,
            data: userBets
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getActiveState, getBetsById };