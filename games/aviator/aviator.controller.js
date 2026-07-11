// games/aviator/aviator.controller.js
const { v4: uuidv4 } = require('uuid'); // Run 'npm i uuid' in your root terminal if not already installed
const aviatorService = require('./aviator.service');

// Stateful representation of the active game round (Use Redis or DB in high-concurrency production environments)
let currentRound = {
    roundId: null,
    targetCrashMultiplier: 1.00,
    currentMultiplier: 1.00,
    totalBetPool: 0,
    totalPayoutDistributed: 0,
    isActive: false,
    hasCrashed: false
};

// Global container to stream the last crash points to the UI client
let crashHistory = [];

const startNewRound = (req, res) => {
    try {
        currentRound.roundId = uuidv4();
        currentRound.targetCrashMultiplier = aviatorService.generateTargetMultiplier();
        currentRound.currentMultiplier = 1.00;
        currentRound.totalBetPool = 0;
        currentRound.totalPayoutDistributed = 0;
        currentRound.isActive = true;
        currentRound.hasCrashed = false;

        return res.status(200).json({
            success: true,
            message: "New Aviator round initiated successfully.",
            roundId: currentRound.roundId
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const placeBet = (req, res) => {
    try {
        const { betAmount } = req.body;

        if (!currentRound.isActive || currentRound.hasCrashed) {
            return res.status(400).json({ success: false, message: "Betting phase has ended for this round." });
        }

        if (!betAmount || betAmount <= 0) {
            return res.status(400).json({ success: false, message: "Invalid bet amount." });
        }

        // Add the stake to the aggregate round pool
        currentRound.totalBetPool += parseFloat(betAmount);

        return res.status(200).json({ 
            success: true, 
            message: "Bet successfully registered in the pool." 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const cashout = (req, res) => {
    try {
        const { betAmount, clientClaimedMultiplier } = req.body;

        if (currentRound.hasCrashed) {
            return res.status(400).json({ success: false, message: "Too late! The plane already crashed." });
        }

        // Safety evaluation: Check if client's claimed multiplier exceeds the engine's current execution status
        if (clientClaimedMultiplier > currentRound.targetCrashMultiplier) {
            triggerSystemCrash(currentRound.targetCrashMultiplier);
            return res.status(400).json({ success: false, message: "Crash occurred before cashout acknowledgment." });
        }

        const proposedPayout = parseFloat(betAmount) * parseFloat(clientClaimedMultiplier);
        
        // Evaluate the compulsory 60% rule before distributing the balance
        const theoreticalPayoutPool = currentRound.totalPayoutDistributed + proposedPayout;
        
        if (aviatorService.shouldForceCrash(currentRound.totalBetPool, theoreticalPayoutPool)) {
            triggerSystemCrash(clientClaimedMultiplier);
            return res.status(400).json({ 
                success: false, 
                message: "System Risk Limit reached. Round crashed.",
                crashedAt: clientClaimedMultiplier
            });
        }

        // Commit payout registration
        currentRound.totalPayoutDistributed += proposedPayout;

        // NOTE: Here you will run your database update queries. 
        // Example: await User.findByIdAndUpdate(req.user.id, { $inc: { balance: proposedPayout } });

        return res.status(200).json({
            success: true,
            message: "Cashout handled cleanly.",
            payout: parseFloat(proposedPayout.toFixed(2)),
            currentBalance: 0 // Replace with your actual user model balance output
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getGameState = (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            roundId: currentRound.roundId,
            currentMultiplier: currentRound.currentMultiplier,
            isCrashed: currentRound.hasCrashed,
            history: crashHistory.slice(-10) // Emits the 10 most recent historical records for the dashboard
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Internal utility function to process the crash sequence
const triggerSystemCrash = (finalCrashPoint) => {
    currentRound.isActive = false;
    currentRound.hasCrashed = true;
    
    // Track the final multiplier state for the history panel
    crashHistory.push(finalCrashPoint);
    
    if (crashHistory.length > 30) {
        crashHistory.shift(); 
    }
};

module.exports = {
    startNewRound,
    placeBet,
    cashout,
    getGameState
};