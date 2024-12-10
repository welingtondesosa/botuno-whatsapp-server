const express = require('express');
const router = express.Router();
const { create } = require('@wppconnect-team/wppconnect');
const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../utils/logger');

// Verificar variables de entorno requeridas
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  logger.error('Missing required environment variables: SUPABASE_URL and/or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Almacena las instancias de cliente de WhatsApp
const clients = new Map();

// Middleware para verificar el token
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    logger.warn('No token provided in request');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    logger.info(`Verifying token for user: ${token}`);
    // Verificar que el usuario existe en Supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('id', token)
      .single();

    if (error || !user) {
      logger.warn(`Invalid token: ${token}`, { error });
      return res.status(401).json({ error: 'Invalid token' });
    }

    logger.info(`Token verified for user: ${token}`);
    req.userId = token;
    next();
  } catch (error) {
    logger.error('Error verifying token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Crear una nueva sesión de WhatsApp
router.post('/session', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    logger.info(`Creating WhatsApp session for user: ${userId}`);

    // Verificar si ya existe una sesión
    if (clients.has(userId)) {
      logger.info(`Session already exists for user: ${userId}`);
      return res.status(200).json({ status: 'connected', message: 'Session already exists' });
    }

    // Crear una nueva sesión de WhatsApp
    const client = await create({
      session: `user-${userId}`,
      catchQR: async (base64Qr) => {
        try {
          logger.info(`QR Code generated for user: ${userId}`);
          // Guardar el código QR en Supabase
          const { error } = await supabase
            .from('whatsapp_sessions')
            .upsert({
              owner_id: userId,
              qr_code: base64Qr,
              status: 'PENDING',
            });

          if (error) {
            logger.error(`Error saving QR code for user ${userId}:`, error);
            throw error;
          }

          res.json({ qr: base64Qr });
        } catch (error) {
          logger.error('Error in catchQR:', error);
          res.status(500).json({ error: 'Error generating QR code' });
        }
      },
      statusFind: async (statusSession, session) => {
        try {
          logger.info(`Status update for user ${userId}: ${statusSession}`);
          // Actualizar el estado en Supabase
          const { error } = await supabase
            .from('whatsapp_sessions')
            .upsert({
              owner_id: userId,
              status: statusSession,
            });

          if (error) {
            logger.error(`Error updating session status for user ${userId}:`, error);
            throw error;
          }
        } catch (error) {
          logger.error('Error in statusFind:', error);
        }
      },
      headless: true,
      useChrome: false,
      debug: false,
    });

    // Almacenar el cliente en memoria
    clients.set(userId, client);
    logger.info(`WhatsApp session created successfully for user: ${userId}`);

  } catch (error) {
    logger.error(`Error creating WhatsApp session for user ${req.userId}:`, error);
    res.status(500).json({ 
      error: 'Failed to create WhatsApp session',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
  }
});

// Eliminar una sesión de WhatsApp
router.delete('/session', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    logger.info(`Deleting WhatsApp session for user: ${userId}`);

    const client = clients.get(userId);
    if (!client) {
      logger.info(`No active session found for user: ${userId}`);
      return res.status(404).json({ message: 'No active session found' });
    }

    await client.close();
    clients.delete(userId);

    // Eliminar la sesión de Supabase
    const { error } = await supabase
      .from('whatsapp_sessions')
      .delete()
      .eq('owner_id', userId);

    if (error) {
      logger.error(`Error deleting session from Supabase for user ${userId}:`, error);
      throw error;
    }

    logger.info(`WhatsApp session deleted successfully for user: ${userId}`);
    res.status(200).json({ message: 'Session deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting WhatsApp session for user ${req.userId}:`, error);
    res.status(500).json({ 
      error: 'Failed to delete WhatsApp session',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
  }
});

module.exports = router;
