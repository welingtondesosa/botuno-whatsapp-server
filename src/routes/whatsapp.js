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

    // Verificar si ya existe una sesión para este usuario
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
              user_id: userId,
              qr_code: base64Qr,
              status: 'PENDING',
              updated_at: new Date().toISOString()
            });

          if (error) {
            logger.error(`Error storing QR code: ${error.message}`);
            throw error;
          }
        } catch (error) {
          logger.error(`Error in catchQR: ${error.message}`);
        }
      },
      statusFind: async (statusSession, session) => {
        try {
          logger.info(`Status update for user ${userId}: ${statusSession}`);
          // Actualizar el estado en Supabase
          const { error } = await supabase
            .from('whatsapp_sessions')
            .upsert({
              user_id: userId,
              status: statusSession,
              updated_at: new Date().toISOString()
            });

          if (error) {
            logger.error(`Error updating session status: ${error.message}`);
            throw error;
          }
        } catch (error) {
          logger.error(`Error in statusFind: ${error.message}`);
        }
      },
      puppeteerOptions: {
        executablePath: process.env.CHROME_BIN || '/usr/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ],
      },
      headless: true,
      useChrome: false,
      debug: false,
    });

    // Almacenar el cliente en memoria
    clients.set(userId, client);
    logger.info(`WhatsApp session created for user: ${userId}`);

    res.status(200).json({ status: 'created', message: 'WhatsApp session created' });
  } catch (error) {
    logger.error(`Error creating WhatsApp session: ${error.message}`);
    res.status(500).json({ error: 'Error creating WhatsApp session' });
  }
});

// Obtener el estado de la sesión de WhatsApp
router.get('/session/status', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    logger.info(`Getting session status for user: ${userId}`);

    // Obtener el estado actual de la base de datos
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('status, qr_code')
      .eq('user_id', userId)
      .single();

    if (error) {
      logger.error(`Error fetching session status: ${error.message}`);
      return res.status(500).json({ error: 'Error fetching session status' });
    }

    if (!data) {
      return res.status(404).json({ status: 'NOT_FOUND', message: 'No session found' });
    }

    res.status(200).json({
      status: data.status,
      qrCode: data.qr_code
    });
  } catch (error) {
    logger.error(`Error getting session status: ${error.message}`);
    res.status(500).json({ error: 'Error getting session status' });
  }
});

// Desconectar sesión de WhatsApp
router.delete('/session', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    logger.info(`Disconnecting session for user: ${userId}`);

    const client = clients.get(userId);
    if (!client) {
      logger.warn(`No active session found for user: ${userId}`);
      return res.status(404).json({ error: 'No active session found' });
    }

    // Desconectar el cliente
    await client.close();
    clients.delete(userId);

    // Actualizar el estado en la base de datos
    const { error } = await supabase
      .from('whatsapp_sessions')
      .upsert({
        user_id: userId,
        status: 'DISCONNECTED',
        qr_code: null,
        updated_at: new Date().toISOString()
      });

    if (error) {
      logger.error(`Error updating session status: ${error.message}`);
      return res.status(500).json({ error: 'Error updating session status' });
    }

    logger.info(`Session disconnected for user: ${userId}`);
    res.status(200).json({ status: 'success', message: 'Session disconnected' });
  } catch (error) {
    logger.error(`Error disconnecting session: ${error.message}`);
    res.status(500).json({ error: 'Error disconnecting session' });
  }
});

// Enviar mensaje de texto
router.post('/message/text', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    logger.info(`Sending text message to ${phone} for user: ${userId}`);

    const client = clients.get(userId);
    if (!client) {
      logger.warn(`No active session found for user: ${userId}`);
      return res.status(404).json({ error: 'No active session found' });
    }

    // Formatear el número de teléfono
    const formattedPhone = phone.replace(/\D/g, '');
    
    // Enviar el mensaje
    await client.sendText(`${formattedPhone}@c.us`, message);

    logger.info(`Message sent successfully to ${phone} for user: ${userId}`);
    res.status(200).json({ status: 'success', message: 'Message sent successfully' });
  } catch (error) {
    logger.error(`Error sending message: ${error.message}`);
    res.status(500).json({ error: 'Error sending message' });
  }
});

// Enviar archivo
router.post('/message/file', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { phone, fileUrl, caption } = req.body;

    if (!phone || !fileUrl) {
      return res.status(400).json({ error: 'Phone number and file URL are required' });
    }

    logger.info(`Sending file to ${phone} for user: ${userId}`);

    const client = clients.get(userId);
    if (!client) {
      logger.warn(`No active session found for user: ${userId}`);
      return res.status(404).json({ error: 'No active session found' });
    }

    // Formatear el número de teléfono
    const formattedPhone = phone.replace(/\D/g, '');

    // Enviar el archivo
    await client.sendFile(
      `${formattedPhone}@c.us`,
      fileUrl,
      'file',
      caption || ''
    );

    logger.info(`File sent successfully to ${phone} for user: ${userId}`);
    res.status(200).json({ status: 'success', message: 'File sent successfully' });
  } catch (error) {
    logger.error(`Error sending file: ${error.message}`);
    res.status(500).json({ error: 'Error sending file' });
  }
});

module.exports = router;
