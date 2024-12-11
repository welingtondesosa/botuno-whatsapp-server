require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { logger } = require('./utils/logger');

// Debug: Log available environment variables (without sensitive values)
logger.info('Available environment variables:', {
  available: Object.keys(process.env),
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  LOG_LEVEL: process.env.LOG_LEVEL,
  CHROME_BIN: process.env.CHROME_BIN,
  SUPABASE_URL_SET: !!process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY_SET: !!process.env.SUPABASE_SERVICE_KEY
});

// Verificar variables de entorno requeridas
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CORS_ORIGIN'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Log environment configuration
logger.info('Starting server with configuration:', {
  nodeEnv: process.env.NODE_ENV,
  corsOrigin: process.env.CORS_ORIGIN,
  port: process.env.PORT || 3001,
  chromeBin: process.env.CHROME_BIN
});

const whatsappRoutes = require('./routes/whatsapp');
const { createClient } = require('@supabase/supabase-js');
const { setupAuthMiddleware } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3001;

// Error handler
const errorHandler = (err, req, res, next) => {
  logger.error('Error:', err);
  res.status(500).json({ status: 'error', message: err.message });
};

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
    logger.info('CORS check:', { origin, allowedOrigins });
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Info'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  credentials: true,
  maxAge: 600
};

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Log middleware setup
app.use((req, res, next) => {
  logger.info('Incoming request:', {
    method: req.method,
    path: req.path,
    headers: {
      ...req.headers,
      authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 20)}...` : 'none'
    }
  });
  next();
});

// Apply CORS
app.use(cors(corsOptions));

// Body parser
app.use(express.json());

// Health check endpoint (sin autenticación)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Auth middleware (excluir health check)
app.use((req, res, next) => {
  if (req.path === '/health') {
    return next();
  }
  setupAuthMiddleware(supabase)(req, res, next);
});

// Routes
app.use('/api/whatsapp', whatsappRoutes);

// Error handler
app.use(errorHandler);

// Start server
app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});

// Handle process termination
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  app.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});
