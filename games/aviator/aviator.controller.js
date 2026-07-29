const Transaction = require('../../models/Transaction');
const { getGameState } = require('./aviator.socket');

const getActiveState = (req, res) => {
    try {
        const currentState = getGameState();
        return res.status(200).json({
            success: true,
            roundId: currentState.roundId,
            status: currentState.status,
            currentMultiplier: currentState.currentMultiplier,
            history: currentState.history.slice(-10),
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const parseAviatorRef = (gatewayRef = '') => {
    if (gatewayRef.startsWith('AVIATOR-BET-')) {
        return { betId: gatewayRef.replace('AVIATOR-BET-', ''), kind: 'bet' };
    }
    if (gatewayRef.startsWith('AVIATOR-WIN-')) {
        return { betId: gatewayRef.replace('AVIATOR-WIN-', ''), kind: 'win' };
    }
    if (gatewayRef.startsWith('AVIATOR-CANCEL-')) {
        return { betId: gatewayRef.replace('AVIATOR-CANCEL-', ''), kind: 'cancel' };
    }
    return null;
};

const getBetsById = async (req, res) => {
    try {
        const userId = req.user._id;

        const transactions = await Transaction.find({
            userId,
            gatewayRef: { $regex: /^AVIATOR-/ },
            type: { $in: ['game_debit', 'game_credit'] },
            status: 'success',
        })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        const betMap = new Map();

        transactions.forEach((tx) => {
            const parsed = parseAviatorRef(tx.gatewayRef);
            if (!parsed) return;

            if (!betMap.has(parsed.betId)) {
                betMap.set(parsed.betId, {
                    betId: parsed.betId,
                    stake: 0,
                    payout: 0,
                    profit: 0,
                    status: 'lost',
                    createdAt: tx.createdAt,
                });
            }

            const bet = betMap.get(parsed.betId);

            if (parsed.kind === 'bet') {
                bet.stake = tx.amount;
                bet.createdAt = tx.createdAt;
            } else if (parsed.kind === 'win') {
                bet.payout = tx.amount;
                bet.profit = Math.round((tx.amount - bet.stake) * 100) / 100;
                bet.status = 'won';
            } else if (parsed.kind === 'cancel') {
                bet.status = 'cancelled';
                bet.payout = tx.amount;
            }
        });

        const userBets = Array.from(betMap.values()).sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        );

        return res.status(200).json({
            success: true,
            data: userBets,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getActiveState, getBetsById };
