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

      // Skip auth for health check
      if (req.path === '/health') {
        logger.info('Auth middleware - Skipping auth for health check');
        return next();
      }

      if (!authHeader?.startsWith('Bearer ')) {
        logger.warn('Auth middleware - No Bearer token provided');
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];

      // Log token info (sin mostrar el token completo)
      logger.info('Auth middleware - Token info:', {
        length: token.length,
        prefix: token.substring(0, 10) + '...',
        suffix: '...' + token.substring(token.length - 10)
      });
      
      // Verificar el token directamente
      const { data, error } = await supabase.auth.getUser(token);
      
      if (error || !data.user) {
        logger.error('Auth middleware - Token verification failed:', {
          error: error?.message,
          errorCode: error?.status
        });
        return res.status(401).json({ 
          error: 'Invalid token', 
          details: error?.message,
          code: error?.status
        });
      }

      const user = data.user;
      logger.info('Auth middleware - User verified:', {
        userId: user.id,
        email: user.email,
        role: user.role
      });

      // Attach user info to request
      req.userId = user.id;
      req.user = user;
      next();
    } catch (error) {
      logger.error('Auth middleware - Unexpected error:', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message
      });
    }
  };
};

module.exports = { setupAuthMiddleware };
