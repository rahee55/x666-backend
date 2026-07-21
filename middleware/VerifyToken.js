const jwt = require('jsonwebtoken');
const User = require('../models/Users');
const { sendError } = require('../services/helper');

const VerifyToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return sendError(res, 'Access token required', 401);
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.deletedAt) {
      return sendError(res, 'User not found', 401);
    }

    if (user.status === 'banned') {
      return sendError(res, 'Account is banned', 403);
    }

    if (user.status === 'suspended') {
      return sendError(res, 'Account is suspended', 403);
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    return sendError(res, 'Invalid or expired token', 401);
  }
};

module.exports = VerifyToken;
