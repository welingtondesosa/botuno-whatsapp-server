const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

const setupAuthMiddleware = (supabase) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        logger.error('Auth error:', error);
        return res.status(401).json({ error: 'Invalid token' });
      }

      req.user = user;
      next();
    } catch (error) {
      logger.error('Auth middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

module.exports = { setupAuthMiddleware };
