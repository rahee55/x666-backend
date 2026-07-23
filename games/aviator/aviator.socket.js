// games/aviator/aviator.socket.js
const WebSocket = require('ws');
const aviatorService = require('./aviator.service');
const { v4: uuidv4 } = require('uuid');

let wss;

// SINGLE SOURCE OF TRUTH for the game state
const gameState = {
    status: 'WAIT', // Changed to match Angular: 'WAIT', 'RUN', 'crash'
    roundId: null,
    currentMultiplier: 1.00,
    targetCrash: null,
    timeRemaining: 5,
    totalBetPool: 0,
    totalPayoutDistributed: 0,
    history: []
};

// Store active bets for the current round in memory
let activeBets = new Map(); 

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

    // Reset for next round
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
            gameState.timeRemaining -= 0.1; // Decrement based on 100ms interval
            
            // Broadcast wait status every second rather than every 100ms to save bandwidth
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
            
            // Broadcast the current multiplier to Angular
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
        console.log('New player connected to Aviator');
        
        // Send initial state to the newly connected client
        ws.send(JSON.stringify({
            key: gameState.status,
            value: gameState.currentMultiplier,
            roundId: gameState.roundId
        }));

        // Listen for messages from Angular's WebsocketService
        ws.on('message', (message) => {
            try {
                const parsedMsg = JSON.parse(message);
                const data = Array.isArray(parsedMsg) ? parsedMsg[0] : parsedMsg;

                if (data.action === 'PlaceBet') {
                    if (gameState.status !== 'WAIT') return; // Reject if already flying
                    
                    gameState.totalBetPool += parseFloat(data.stake);
                    
                    // Store the bet
                    const betId = uuidv4();
                    activeBets.set(betId, { stake: data.stake, betType: data.betType });
                    
                    // Confirm bet to the specific client (optional, but good practice)
                    ws.send(JSON.stringify({ key: 'BET_ACCEPTED', betId, betType: data.betType }));
                    console.log(`Bet placed: ${data.stake} on round ${data.round}`);
                }

                if (data.action === 'CancelBet') {
                    if (gameState.status !== 'WAIT') return;
                    // Logic to remove bet from activeBets and subtract from totalBetPool
                    console.log(`Bet cancelled for betType ${data.betType}`);
                }

                if (data.action === 'CashoutBet') {
                    if (gameState.status !== 'RUN') return;
                    
                    const clientMultiplier = parseFloat(data.RUNValue);
                    
                    // Anti-cheat: Check if client's claimed multiplier is valid
                    if (clientMultiplier > gameState.currentMultiplier) {
                        return ws.send(JSON.stringify({ key: 'ERROR', message: 'Invalid multiplier' }));
                    }

                    const payout = parseFloat(data.stake) * clientMultiplier;
                    const theoreticalPayoutPool = gameState.totalPayoutDistributed + payout;

                    // Force crash if RTP (Return to Player) threshold is exceeded
                    if (aviatorService.shouldForceCrash(gameState.totalBetPool, theoreticalPayoutPool)) {
                        return triggerSystemCrash(clientMultiplier);
                    }

                    gameState.totalPayoutDistributed += payout;
                    
                    // TODO: Update user balance in the database here

                    console.log(`Cashout successful at ${clientMultiplier}x for payout ${payout}`);
                }
            } catch (err) {
                console.error('Failed to parse WS message:', err);
            }
        });
    });

    runGameLoop();
};

// Export the state so the REST API can read it if needed
module.exports = { initSocket, getGameState: () => gameState };