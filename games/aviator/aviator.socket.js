const WebSocket = require('ws');
const aviatorService = require('./aviator.service');
const { v4: uuidv4 } = require('uuid');

let wss;

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
                gameState.targetCrash = aviatorService.generateTargetMultiplier();
                gameState.currentMultiplier = 1.00;
                broadcast({ key: 'roundId', value: gameState.roundId });
            }
        } 
        else if (gameState.status === 'RUN') {
            gameState.currentMultiplier += 0.01;
            broadcast({ key: 'RUNValue', value: parseFloat(gameState.currentMultiplier.toFixed(2)) });

            if (gameState.currentMultiplier >= gameState.targetCrash) {
                triggerSystemCrash(gameState.targetCrash);
            }
        }
    }, 100); 
};

const initSocket = (server) => {
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        ws.send(JSON.stringify({
            key: gameState.status,
            value: gameState.currentMultiplier,
            roundId: gameState.roundId
        }));

        ws.on('message', (message) => {
            try {
                const parsedMsg = JSON.parse(message);
                const data = Array.isArray(parsedMsg) ? parsedMsg[0] : parsedMsg;

                if (data.action === 'PlaceBet') {
                    if (gameState.status !== 'WAIT') return;
                    
                    gameState.totalBetPool += parseFloat(data.stake);
                    const betId = uuidv4();
                    activeBets.set(betId, { stake: data.stake, betType: data.betType });
                    
                    // DB LOGIC HERE: Insert bet record into Database
                }

                if (data.action === 'CancelBet') {
                    if (gameState.status !== 'WAIT') return;
                    // DB LOGIC HERE: Remove or mark bet as cancelled in Database
                }

                if (data.action === 'CashoutBet') {
                    if (gameState.status !== 'RUN') return;
                    
                    const clientMultiplier = parseFloat(data.RUNValue);
                    if (clientMultiplier > gameState.currentMultiplier) return;

                    const payout = parseFloat(data.stake) * clientMultiplier;
                    const theoreticalPayoutPool = gameState.totalPayoutDistributed + payout;

                    if (aviatorService.shouldForceCrash(gameState.totalBetPool, theoreticalPayoutPool)) {
                        return triggerSystemCrash(clientMultiplier);
                    }

                    gameState.totalPayoutDistributed += payout;
                    
                    // DB LOGIC HERE: Update User balance and mark bet as Won in Database
                }
            } catch (err) {
                console.error('Failed to parse WS message:', err);
            }
        });
    });

    runGameLoop();
};

module.exports = { initSocket, getGameState: () => gameState };