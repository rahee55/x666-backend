const WebSocket = require('ws');
const aviatorService = require('./aviator.service');
const { v4: uuidv4 } = require('uuid');

let wss;

// Game State Engine
let gameState = {
    status: 'WAITING', // WAITING, FLYING, CRASHED
    roundId: null,
    currentMultiplier: 1.00,
    targetCrash: null,
    timeRemaining: 5, // 5 seconds wait time between rounds
    history: []
};

// Broadcasts data to all connected Angular clients
const broadcast = (data) => {
    if (!wss) return;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

// The Continuous Game Loop
const runGameLoop = () => {
    setInterval(() => {
        if (gameState.status === 'WAITING') {
            gameState.timeRemaining -= 1;
            broadcast({ type: 'WAITING', timeRemaining: gameState.timeRemaining, history: gameState.history });

            if (gameState.timeRemaining <= 0) {
                // Start the flight
                gameState.status = 'FLYING';
                gameState.roundId = uuidv4();
                gameState.targetCrash = aviatorService.generateTargetMultiplier();
                gameState.currentMultiplier = 1.00;
            }
        } 
        else if (gameState.status === 'FLYING') {
            // Increase multiplier (adjust the 0.01 increment for speed)
            gameState.currentMultiplier += 0.01;
            broadcast({ type: 'FLYING', multiplier: parseFloat(gameState.currentMultiplier.toFixed(2)) });

            if (gameState.currentMultiplier >= gameState.targetCrash) {
                // Plane crashes
                gameState.status = 'CRASHED';
                
                // Save to history
                gameState.history.push(gameState.targetCrash);
                if (gameState.history.length > 10) gameState.history.shift();

                broadcast({ type: 'CRASHED', crashedAt: gameState.targetCrash, history: gameState.history });

                // Reset for next round after 3 seconds
                setTimeout(() => {
                    gameState.status = 'WAITING';
                    gameState.timeRemaining = 5;
                }, 3000);
            }
        }
    }, 100); // Ticks every 100ms
};

const initSocket = (server) => {
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        console.log('New player connected to Aviator');
        
        // Send immediate current state to new player
        ws.send(JSON.stringify({
            type: 'INIT',
            state: gameState
        }));

        ws.on('close', () => {
            console.log('Player disconnected');
        });
    });

    // Start the never-ending loop
    runGameLoop();
};

module.exports = { initSocket };