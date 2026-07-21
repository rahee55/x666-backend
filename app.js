require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/mongoose");
const sessionMiddleware = require("./middleware/session");

// 1. ADD THIS LINE: Import your new socket logic
const { initSocket } = require("./games/aviator/aviator.socket");

const app = express();

connectDB();

app.use(cors("*"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

const routes = require("./routes/index");
app.use("/api", routes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

initSocket(server);

module.exports = app;
