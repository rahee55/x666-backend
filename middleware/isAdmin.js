const { sendError } = require('../services/helper');

const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return sendError(res, 'Forbidden: admin access required', 403);
  }

  next();
};

module.exports = isAdmin;
