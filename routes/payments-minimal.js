const express = require('express');
const router = express.Router();
const phonePeService = require('../services/phonePeService');
const { authenticateToken, rateLimitMiddleware } = require('../middleware');

/**
 * Test route for payments
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'PhonePe payment service is active',
    timestamp: new Date().toISOString()
  });
});

/**
 * Health check for payment service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'PhonePe Payment Gateway',
    status: 'operational'
  });
});

module.exports = router;
