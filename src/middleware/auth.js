const { logger } = require('../utils/logger');

const setupAuthMiddleware = (supabase) => {
  return async (req, res, next) => {
    try {
      logger.info('Auth middleware - Processing request', {
        path: req.path,
        method: req.method,
        hasAuthHeader: !!req.headers.authorization
      });

      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        logger.warn('Auth middleware - No Bearer token provided');
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      
      try {
        // Intentar obtener el usuario directamente con el token
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error) {
          logger.error('Auth middleware - Error getting user:', error);
          return res.status(401).json({ error: 'Invalid token' });
        }

        if (!user) {
          logger.warn('Auth middleware - No user found for token');
          return res.status(401).json({ error: 'User not found' });
        }

        logger.info('Auth middleware - User authenticated successfully', {
          userId: user.id,
          email: user.email
        });

        // Adjuntar la información del usuario al request
        req.userId = user.id;
        req.user = user;
        next();
      } catch (error) {
        logger.error('Auth middleware - Error verifying token:', error);
        return res.status(401).json({ error: 'Invalid token' });
      }
    } catch (error) {
      logger.error('Auth middleware - Unexpected error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

module.exports = { setupAuthMiddleware };
