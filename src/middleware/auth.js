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
      
      // Primero intentamos obtener la sesión actual
      const { data: { session }, error: sessionError } = await supabase.auth.getSession(token);
      
      if (sessionError) {
        logger.error('Auth middleware - Session error:', sessionError);
        return res.status(401).json({ error: 'Invalid session' });
      }

      if (!session) {
        logger.warn('Auth middleware - No valid session found');
        return res.status(401).json({ error: 'No valid session found' });
      }

      // Si tenemos una sesión válida, obtenemos los datos del usuario
      const { data: { user }, error: userError } = await supabase.auth.getUser(session.access_token);

      if (userError || !user) {
        logger.error('Auth middleware - User error:', userError);
        return res.status(401).json({ error: 'Invalid user' });
      }

      logger.info('Auth middleware - User authenticated successfully', {
        userId: user.id,
        email: user.email
      });

      // Adjuntamos la información del usuario y la sesión al request
      req.userId = user.id;
      req.user = user;
      req.session = session;
      next();
    } catch (error) {
      logger.error('Auth middleware - Unexpected error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

module.exports = { setupAuthMiddleware };
