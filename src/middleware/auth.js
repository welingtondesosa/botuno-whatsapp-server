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
      
      // Verificar si el token es válido usando el cliente de Supabase
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        logger.error('Auth middleware - Session error:', sessionError);
        return res.status(401).json({ error: 'Session error', details: sessionError.message });
      }

      if (!session) {
        logger.warn('Auth middleware - No session found');
        
        // Intentar verificar el token directamente
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        
        if (userError || !user) {
          logger.error('Auth middleware - User verification failed:', userError);
          return res.status(401).json({ error: 'Invalid token', details: userError?.message });
        }

        logger.info('Auth middleware - User verified without session:', {
          userId: user.id,
          email: user.email
        });

        req.userId = user.id;
        req.user = user;
        return next();
      }

      // Si tenemos una sesión, verificar que coincida con el token proporcionado
      if (session.access_token !== token) {
        logger.warn('Auth middleware - Token mismatch');
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser(token);

      if (userError || !user) {
        logger.error('Auth middleware - User error:', userError);
        return res.status(401).json({ error: 'Invalid user' });
      }

      logger.info('Auth middleware - User authenticated successfully', {
        userId: user.id,
        email: user.email,
        sessionId: session.id
      });

      req.userId = user.id;
      req.user = user;
      req.session = session;
      next();
    } catch (error) {
      logger.error('Auth middleware - Unexpected error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  };
};

module.exports = { setupAuthMiddleware };
