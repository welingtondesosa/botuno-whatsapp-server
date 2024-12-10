require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { logger } = require('./utils/logger');

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
  origin: process.env.CORS_ORIGIN,
  methods: ['GET', 'POST', 'DELETE'],
  credentials: true,
  optionsSuccessStatus: 204
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    origin: req.headers.origin,
    ip: req.ip
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
  process.env.SUPABASE_SERVICE_KEY
);

// Auth middleware
app.use(setupAuthMiddleware(supabase));

// Rutas de WhatsApp
app.use('/whatsapp', whatsappRoutes);

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
