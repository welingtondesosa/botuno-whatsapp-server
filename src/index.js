require('dotenv').config();
const express = require('express');
const cors = require('cors');
const whatsappRoutes = require('./routes/whatsapp');
const { createClient } = require('@supabase/supabase-js');
const { setupAuthMiddleware } = require('./middleware/auth');
const { logger } = require('./utils/logger');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:8083', 'https://botuno.com'],
  credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    headers: req.headers,
    query: req.query,
    body: req.method === 'POST' ? req.body : undefined
  });
  next();
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Auth middleware
app.use(setupAuthMiddleware(supabase));

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    const healthInfo = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      version: '1.0.0'
    };
    
    logger.info('Health check request successful', healthInfo);
    res.status(200).json(healthInfo);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Rutas de WhatsApp (cambiado de /api/whatsapp a /whatsapp)
app.use('/whatsapp', whatsappRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  logger.info(`WhatsApp server running on port ${port}`);
  logger.info('Environment:', {
    nodeEnv: process.env.NODE_ENV,
    corsOrigin: process.env.CORS_ORIGIN,
    port: port
  });
});
