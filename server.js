require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Import Routes
const walletRoutes = require('./src/routes/wallet.routes');
// const gameRoutes = require('./src/routes/game.routes');

// Use Routes
app.use('/api/wallet', walletRoutes);
// app.use('/api/games', gameRoutes);

const authRoutes = require('./src/routes/auth.routes');

// 2. Add this usage near your app.use('/api/wallet') line
app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});