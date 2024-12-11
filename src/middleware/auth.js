const { logger } = require('../utils/logger');

const setupAuthMiddleware = (supabase) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      logger.info('Auth middleware - Request details:', {
        path: req.path,
        method: req.method,
        headers: {
          ...req.headers,
          authorization: authHeader ? `${authHeader.substring(0, 20)}...` : 'none'
        }
      });

      if (!authHeader?.startsWith('Bearer ')) {
        logger.warn('Auth middleware - No Bearer token provided');
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      
      // Verificar el token directamente
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        logger.error('Auth middleware - Token verification failed:', {
          error: userError,
          token: `${token.substring(0, 20)}...`
        });
        return res.status(401).json({ error: 'Invalid token', details: userError?.message });
      }

      logger.info('Auth middleware - User verified:', {
        userId: user.id,
        email: user.email
      });

      req.userId = user.id;
      req.user = user;
      next();
    } catch (error) {
      logger.error('Auth middleware - Unexpected error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

module.exports = { setupAuthMiddleware };
