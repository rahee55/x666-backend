const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const aviatorService = require('./aviator.service');
const User = require('../../models/Users');
const { creditWallet, debitWallet, getBalance } = require('../../services/walletService');
const { v4: uuidv4 } = require('uuid');

let wss;

const WS_PATH = process.env.WS_PATH || '/api/ws';

const isOriginAllowed = (origin) => {
    const allowedOrigins = (process.env.WS_ALLOWED_ORIGINS || '*')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    if (allowedOrigins.includes('*')) return true;
    if (!origin) return true;
    return allowedOrigins.includes(origin);
};

const gameState = {
    status: 'WAIT', 
    roundId: null,
    currentMultiplier: 1.00,
    targetCrash: null,
    timeRemaining: 5,
    totalBetPool: 0,
    totalPayoutDistributed: 0,
    history: []
};

// Tracks active bets to prevent double cashouts
const activeBets = new Map();

const sendWs = (ws, payload) => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
};

const normalizeToken = (rawToken) => {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const trimmed = rawToken.trim();
    if (trimmed.startsWith('Bearer ')) {
        return trimmed.slice(7).trim();
    }
    return trimmed;
};

const verifySocketToken = async (rawToken) => {
    const token = normalizeToken(rawToken);
    if (!token) {
        return { error: 'Access token required' };
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user || user.deletedAt) {
            return { error: 'User not found' };
        }

        if (user.status === 'banned') {
            return { error: 'Account is banned' };
        }

        if (user.status === 'suspended') {
            return { error: 'Account is suspended' };
        }

        return { user };
    } catch (error) {
        return { error: 'Invalid or expired token' };
    }
};

const attachUser = (ws, user) => {
    ws.authenticated = true;
    ws.user = user;
    ws.userId = user._id;
};

const requireAuth = (ws) => {
    if (!ws.authenticated || !ws.userId) {
        sendWs(ws, { key: 'authError', message: 'Authentication required' });
        return false;
    }
    return true;
};

const parseStake = (value) => {
    const stake = Number.parseFloat(value);
    if (!Number.isFinite(stake) || stake <= 0) {
        return null;
    }
    return Math.round(stake * 100) / 100;
};

const sendBetError = (ws, message) => {
    sendWs(ws, { key: 'betError', message });
};

const getBetForUser = (betId, userId) => {
    if (!betId || !activeBets.has(betId)) {
        return null;
    }

    const bet = activeBets.get(betId);
    if (String(bet.userId) !== String(userId)) {
        return null;
    }

    return bet;
};

const assignPendingBetsToRound = (roundId) => {
    activeBets.forEach((bet) => {
        if (bet.status === 'active' && !bet.roundId) {
            bet.roundId = roundId;
        }
    });
};

const authenticateSocket = async (ws, rawToken) => {
    const result = await verifySocketToken(rawToken);
    if (result.user) {
        attachUser(ws, result.user);
        const wallet = await getBalance(result.user._id);
        sendWs(ws, {
            key: 'auth',
            success: true,
            userId: String(result.user._id),
            balance: wallet.balance,
        });
        return true;
    }

    ws.authenticated = false;
    ws.user = null;
    ws.userId = null;
    sendWs(ws, { key: 'auth', success: false, message: result.error });
    return false;
};

const extractTokenFromRequest = (req) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const queryToken = url.searchParams.get('token');
    if (queryToken) return queryToken;

    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && String(authHeader).startsWith('Bearer ')) {
        return String(authHeader).slice(7).trim();
    }

    return null;
};

const broadcast = (data) => {
    if (!wss) return;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

const triggerSystemCrash = (finalCrashPoint) => {
    gameState.status = 'crash';
    gameState.history.push(finalCrashPoint);
    if (gameState.history.length > 30) gameState.history.shift();

    broadcast({ key: 'crash', value: finalCrashPoint, history: gameState.history });

    setTimeout(() => {
        gameState.status = 'WAIT';
        gameState.timeRemaining = 5;
        gameState.totalBetPool = 0;
        gameState.totalPayoutDistributed = 0;
        activeBets.clear();
    }, 3000);
};

const runGameLoop = () => {
    setInterval(() => {
        if (gameState.status === 'WAIT') {
            gameState.timeRemaining -= 0.1; 
            
            // Send WAIT state every full second
            if (Number.isInteger(Math.round(gameState.timeRemaining))) {
                broadcast({ key: 'WAIT', timeRemaining: Math.round(gameState.timeRemaining), history: gameState.history });
            }

            if (gameState.timeRemaining <= 0) {
                gameState.status = 'RUN';
                gameState.roundId = uuidv4();
                assignPendingBetsToRound(gameState.roundId);
                gameState.targetCrash = aviatorService.generateTargetMultiplier();
                gameState.currentMultiplier = 1.00;
                broadcast({ key: 'roundId', value: gameState.roundId });
            }
        } 
        else if (gameState.status === 'RUN') {
            
            // --- NEW LOGIC: DYNAMIC SPEED UP ---
            if (gameState.currentMultiplier >= 50) {
                gameState.currentMultiplier += 0.50; // Super fast above 50x
            } else if (gameState.currentMultiplier >= 20) {
                gameState.currentMultiplier += 0.15; // Faster above 20x
            } else if (gameState.currentMultiplier >= 10) {
                gameState.currentMultiplier += 0.10; // Speeds up above 10x
            } else {
                gameState.currentMultiplier += 0.05; // Normal speed (under 10x)
            }
            // -----------------------------------

            broadcast({ key: 'RUNValue', value: parseFloat(gameState.currentMultiplier.toFixed(2)) });

            if (gameState.currentMultiplier >= gameState.targetCrash) {
                triggerSystemCrash(gameState.targetCrash);
            }
        }
    }, 100); 
};

const initSocket = (server) => {
    wss = new WebSocket.Server({
        server,
        path: WS_PATH,
        verifyClient: (info, callback) => {
            if (isOriginAllowed(info.origin)) {
                callback(true);
                return;
            }
            callback(false, 403, 'Origin not allowed');
        },
    });

    console.log(`Aviator WebSocket listening on ${WS_PATH}`);

    wss.on('connection', async (ws, req) => {
        ws.authenticated = false;
        ws.user = null;
        ws.userId = null;

        ws.send(JSON.stringify({
            key: gameState.status,
            value: gameState.currentMultiplier,
            roundId: gameState.roundId
        }));

        const connectToken = extractTokenFromRequest(req);
        if (connectToken) {
            await authenticateSocket(ws, connectToken);
        }

        ws.on('message', async (message) => {
            try {
                const parsedMsg = JSON.parse(message);
                const data = Array.isArray(parsedMsg) ? parsedMsg[0] : parsedMsg;

                if (data.action === 'Authenticate' || data.action === 'Auth') {
                    await authenticateSocket(ws, data.token || data.accessToken);
                    return;
                }

                if (data.action === 'PlaceBet') {
                    if (!requireAuth(ws)) return;
                    if (gameState.status !== 'WAIT') {
                        sendBetError(ws, 'Bets can only be placed during the waiting period');
                        return;
                    }

                    const stake = parseStake(data.stake);
                    if (!stake) {
                        sendBetError(ws, 'Invalid bet amount');
                        return;
                    }

                    const betId = uuidv4();

                    try {
                        const { wallet } = await debitWallet(ws.userId, stake, 'game_debit', {
                            gatewayRef: `AVIATOR-BET-${betId}`,
                        });

                        gameState.totalBetPool += stake;
                        activeBets.set(betId, {
                            stake,
                            betType: data.betType || null,
                            userId: ws.userId,
                            roundId: null,
                            status: 'active',
                        });

                        sendWs(ws, {
                            key: 'betPlaced',
                            betId,
                            stake,
                            betType: data.betType || null,
                            balance: wallet.balance,
                            roundId: gameState.roundId,
                        });
                    } catch (error) {
                        sendBetError(ws, error.message || 'Unable to place bet');
                    }
                }

                if (data.action === 'CancelBet') {
                    if (!requireAuth(ws)) return;
                    if (gameState.status !== 'WAIT') {
                        sendBetError(ws, 'Bets can only be cancelled during the waiting period');
                        return;
                    }

                    const bet = getBetForUser(data.betId, ws.userId);
                    if (!bet || bet.status !== 'active') {
                        sendBetError(ws, 'Bet not found');
                        return;
                    }

                    try {
                        const { wallet } = await creditWallet(ws.userId, bet.stake, 'game_credit', {
                            gatewayRef: `AVIATOR-CANCEL-${data.betId}`,
                        });

                        bet.status = 'cancelled';
                        gameState.totalBetPool = Math.max(0, gameState.totalBetPool - bet.stake);
                        activeBets.delete(data.betId);

                        sendWs(ws, {
                            key: 'betCancelled',
                            betId: data.betId,
                            betType: bet.betType || data.betType || null,
                            refunded: bet.stake,
                            balance: wallet.balance,
                        });
                    } catch (error) {
                        sendBetError(ws, error.message || 'Unable to cancel bet');
                    }
                }

                if (data.action === 'CashoutBet') {
                    if (!requireAuth(ws)) return;
                    if (gameState.status !== 'RUN') {
                        sendBetError(ws, 'Cashout is only available while the round is running');
                        return;
                    }

                    const bet = getBetForUser(data.betId, ws.userId);
                    if (!bet || bet.status !== 'active') {
                        sendBetError(ws, 'Bet not found');
                        return;
                    }

                    if (bet.roundId && bet.roundId !== gameState.roundId) {
                        sendBetError(ws, 'Bet is not for the current round');
                        return;
                    }

                    const clientMultiplier = Number.parseFloat(data.RUNValue);
                    if (!Number.isFinite(clientMultiplier) || clientMultiplier <= 1) {
                        sendBetError(ws, 'Invalid cashout multiplier');
                        return;
                    }

                    if (clientMultiplier > gameState.currentMultiplier) {
                        sendBetError(ws, 'Cashout multiplier exceeds current multiplier');
                        return;
                    }

                    const payout = Math.round(bet.stake * clientMultiplier * 100) / 100;
                    const theoreticalPayoutPool = gameState.totalPayoutDistributed + payout;

                    if (aviatorService.shouldForceCrash(gameState.totalBetPool, theoreticalPayoutPool)) {
                        triggerSystemCrash(clientMultiplier);
                        return;
                    }

                    try {
                        const { wallet } = await creditWallet(ws.userId, payout, 'game_credit', {
                            gatewayRef: `AVIATOR-WIN-${data.betId}`,
                        });

                        bet.status = 'cashed_out';
                        bet.cashoutMultiplier = clientMultiplier;
                        bet.payout = payout;
                        gameState.totalPayoutDistributed += payout;
                        activeBets.delete(data.betId);

                        sendWs(ws, {
                            key: 'cashout',
                            betId: data.betId,
                            betType: bet.betType || data.betType || null,
                            stake: bet.stake,
                            multiplier: clientMultiplier,
                            payout,
                            profit: Math.round((payout - bet.stake) * 100) / 100,
                            balance: wallet.balance,
                        });
                    } catch (error) {
                        sendBetError(ws, error.message || 'Unable to cash out');
                    }
                }
            } catch (err) {
                console.error('Failed to parse WS message:', err);
            }
        });
        
    });

    runGameLoop();
};

module.exports = {
    initSocket,
    getGameState: () => gameState,
    getWebSocketPath: () => WS_PATH,
};