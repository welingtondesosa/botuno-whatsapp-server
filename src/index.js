require('dotenv').config();
const express = require('express');
const cors = require('cors');
const whatsappRoutes = require('./routes/whatsapp');
const { createClient } = require('@supabase/supabase-js');
const { setupAuthMiddleware } = require('./middleware/auth');
const { logger } = require('./utils/logger');

const app = express();
const port = process.env.PORT || 3001;

// Error handler
const errorHandler = (err, req, res, next) => {
  logger.error('Error:', err);
  res.status(500).json({ status: 'error', message: err.message });
};

// Middleware
app.use(cors({
  origin: '*', // Temporalmente permitimos todos los orígenes para pruebas
  credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Health check endpoint - debe estar antes del middleware de autenticación
app.get('/health', (req, res) => {
  logger.info('Health check requested');
  res.status(200).json({ status: 'ok' });
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Auth middleware
app.use(setupAuthMiddleware(supabase));

// Rutas de WhatsApp (cambiado de /api/whatsapp a /whatsapp)
app.use('/whatsapp', whatsappRoutes);

// Error handling middleware
app.use(errorHandler);

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  logger.info(`WhatsApp server running on port ${port}`);
  logger.info('Environment:', {
    nodeEnv: process.env.NODE_ENV,
    corsOrigin: process.env.CORS_ORIGIN,
    port: port
  });
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
