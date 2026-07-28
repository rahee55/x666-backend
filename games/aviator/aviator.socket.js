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
    crashMultiplier: null,
    timeRemaining: 5,
    totalBetPool: 0,
    totalPayoutDistributed: 0,
    history: [],
    runStartTime: null // Added: Tracks the exact millisecond the plane took off
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

const sendBetError = (ws, message, failedAction = null, betType = null) => {
    sendWs(ws, {
        key: 'betError',
        message,
        failedAction,
        betType: betType != null ? String(betType) : null,
    });
};

const resolveBetId = (data) => data.betId || data.betid || null;

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
    if (gameState.status === 'crash') return;

    gameState.status = 'crash';
    gameState.crashMultiplier = finalCrashPoint;
    gameState.history.push(finalCrashPoint);
    if (gameState.history.length > 30) gameState.history.shift();

    broadcast({ key: 'crash', value: finalCrashPoint, history: gameState.history });

    setTimeout(() => {
        gameState.status = 'WAIT';
        gameState.timeRemaining = 5;
        gameState.totalBetPool = 0;
        gameState.totalPayoutDistributed = 0;
        gameState.crashMultiplier = null;
        activeBets.clear();
    }, 3000);
};

const isCashoutAllowed = () =>
    gameState.status === 'RUN' || gameState.status === 'crash';

const isValidCashoutMultiplier = (clientMultiplier) => {
    if (!Number.isFinite(clientMultiplier) || clientMultiplier <= 1) {
        return false;
    }

    if (gameState.status === 'RUN') {
        return clientMultiplier <= gameState.currentMultiplier + 0.05;
    }

    if (gameState.status === 'crash' && gameState.crashMultiplier !== null) {
        return clientMultiplier <= gameState.crashMultiplier + 0.01;
    }

    return false;
};

const processCashout = async (ws, bet, cashoutBetId, clientMultiplier) => {
    if (bet.status === 'cashing_out' || bet.status === 'cashed_out') {
        return { error: 'Cashout already in progress' };
    }

    bet.status = 'cashing_out';

    const payout = Math.round(bet.stake * clientMultiplier * 100) / 100;

    try {
        const { wallet } = await creditWallet(ws.userId, payout, 'game_credit', {
            gatewayRef: `AVIATOR-WIN-${cashoutBetId}`,
        });

        bet.status = 'cashed_out';
        bet.cashoutMultiplier = clientMultiplier;
        bet.payout = payout;
        gameState.totalPayoutDistributed += payout;
        activeBets.delete(cashoutBetId);

        sendWs(ws, {
            key: 'cashout',
            betId: cashoutBetId,
            betType: bet.betType,
            stake: bet.stake,
            multiplier: clientMultiplier,
            payout,
            profit: Math.round((payout - bet.stake) * 100) / 100,
            balance: wallet.balance,
        });

        return { success: true, payout };
    } catch (error) {
        bet.status = 'active';
        sendBetError(ws, error.message || 'Unable to cash out', 'CashoutBet', bet.betType);
        return { error: error.message || 'Unable to cash out' };
    }
};

// The constant rate at which the plane accelerates. 
// Tweak this slightly up (e.g., 0.075) for faster games, or down (e.g., 0.055) for slower games.
const GROWTH_RATE = 0.065; 

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
                
                // Record exact takeoff time
                gameState.runStartTime = Date.now();
                gameState.currentMultiplier = 1.00;
                
                broadcast({ key: 'roundId', value: gameState.roundId });
            }
        } 
        else if (gameState.status === 'RUN') {
            // --- NEW LOGIC: CONTINUOUS EXPONENTIAL GROWTH ---
            const elapsedMs = Date.now() - gameState.runStartTime;
            const elapsedSeconds = elapsedMs / 1000;

            // M = e^(r * t)
            let nextMultiplier = Math.exp(GROWTH_RATE * elapsedSeconds);

            if (nextMultiplier >= gameState.targetCrash) {
                gameState.currentMultiplier = gameState.targetCrash;
                triggerSystemCrash(parseFloat(gameState.targetCrash.toFixed(2)));
            } else {
                gameState.currentMultiplier = nextMultiplier;
                
                broadcast({ 
                    key: 'RUNValue', 
                    value: parseFloat(gameState.currentMultiplier.toFixed(2)) 
                });
            }
            // ------------------------------------------------
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
                        sendBetError(ws, 'Bets can only be placed during the waiting period', 'PlaceBet', data.betType);
                        return;
                    }

                    const stake = parseStake(data.stake);
                    if (!stake) {
                        sendBetError(ws, 'Invalid bet amount', 'PlaceBet', data.betType);
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
                            betType: data.betType != null ? String(data.betType) : null,
                            stake,
                            betType: data.betType || null,
                            balance: wallet.balance,
                            roundId: gameState.roundId,
                        });
                    } catch (error) {
                        sendBetError(ws, error.message || 'Unable to place bet', 'PlaceBet', data.betType);
                    }
                }

                if (data.action === 'CancelBet') {
                    if (!requireAuth(ws)) return;
                    if (gameState.status !== 'WAIT') {
                        sendBetError(ws, 'Bets can only be cancelled during the waiting period', 'CancelBet', data.betType);
                        return;
                    }

                    const cancelBetId = resolveBetId(data);
                    const bet = getBetForUser(cancelBetId, ws.userId);
                    if (!bet || bet.status !== 'active') {
                        sendBetError(ws, 'Bet not found', 'CancelBet', data.betType);
                        return;
                    }

                    try {
                        const { wallet } = await creditWallet(ws.userId, bet.stake, 'game_credit', {
                            gatewayRef: `AVIATOR-CANCEL-${cancelBetId}`,
                        });

                        bet.status = 'cancelled';
                        gameState.totalBetPool = Math.max(0, gameState.totalBetPool - bet.stake);
                        activeBets.delete(cancelBetId);

                        sendWs(ws, {
                            key: 'betCancelled',
                            betId: cancelBetId,
                            betType: bet.betType != null ? String(bet.betType) : data.betType,
                            refunded: bet.stake,
                            balance: wallet.balance,
                        });
                    } catch (error) {
                        sendBetError(ws, error.message || 'Unable to cancel bet', 'CancelBet', data.betType);
                    }
                }

                if (data.action === 'CashoutBet') {
                    if (!requireAuth(ws)) return;
                    if (!isCashoutAllowed()) {
                        sendBetError(ws, 'Cashout is only available while the round is running', 'CashoutBet', data.betType);
                        return;
                    }

                    const cashoutBetId = resolveBetId(data);
                    const bet = getBetForUser(cashoutBetId, ws.userId);
                    if (!bet) {
                        sendBetError(ws, 'Bet not found', 'CashoutBet', data.betType);
                        return;
                    }

                    if (bet.status === 'cashing_out') {
                        return;
                    }

                    if (bet.status !== 'active') {
                        sendBetError(ws, 'Bet not found', 'CashoutBet', data.betType);
                        return;
                    }

                    if (bet.roundId && bet.roundId !== gameState.roundId) {
                        sendBetError(ws, 'Bet is not for the current round', 'CashoutBet', data.betType);
                        return;
                    }

                    const clientMultiplier = Number.parseFloat(data.RUNValue);
                    if (!isValidCashoutMultiplier(clientMultiplier)) {
                        sendBetError(ws, 'Invalid cashout multiplier', 'CashoutBet', data.betType);
                        return;
                    }

                    const payout = Math.round(bet.stake * clientMultiplier * 100) / 100;
                    const theoreticalPayoutPool = gameState.totalPayoutDistributed + payout;
                    const shouldCrashAfterCashout = aviatorService.shouldForceCrash(
                        gameState.totalBetPool,
                        theoreticalPayoutPool,
                    );

                    const result = await processCashout(ws, bet, cashoutBetId, clientMultiplier);
                    if (result.success && shouldCrashAfterCashout) {
                        triggerSystemCrash(clientMultiplier);
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