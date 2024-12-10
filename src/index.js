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
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`Incoming request: ${req.method} ${req.url}`, {
    origin: req.headers.origin,
    ip: req.ip,
    hasAuth: !!req.headers.authorization
  });
  next();
});

// Health check endpoint - debe estar antes del middleware de autenticación
app.get('/health', (req, res) => {
  logger.info('Health check requested');
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  }
);

// Auth middleware - solo aplicar a las rutas de WhatsApp
app.use(['/whatsapp', '/api/whatsapp'], setupAuthMiddleware(supabase));

// Rutas de WhatsApp
app.use('/whatsapp', whatsappRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// Error handling middleware
app.use(errorHandler);

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  logger.info(`Server is running on port ${port}`);
})
.on('error', (error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

// Handle process termination
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});
