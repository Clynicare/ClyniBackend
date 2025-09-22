const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const redis = require('redis');

// Create Redis client for caching and rate limiting
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

// Connect to Redis
redisClient.connect().catch(console.error);

// Security middleware
const securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false
  }),
  compression(),
  express.json({ limit: '10mb' }),
  express.urlencoded({ extended: true, limit: '10mb' })
];

// Enhanced CORS middleware
const corsMiddleware = (req, res, next) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://clynicare.com',
    'https://app.clynicare.com',
    'https://admin.clynicare.com'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-User-Role, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
};

// Enhanced rate limiting with Redis
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    store: new (require('rate-limit-redis').default || require('rate-limit-redis'))({
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
    keyGenerator: (req) => {
      // Use IP + User ID for authenticated requests
      const baseKey = req.ip;
      const userKey = req.user?.id || req.user?._id;
      return userKey ? `${baseKey}:${userKey}` : baseKey;
    }
  });
};

// Different rate limits for different endpoints
const rateLimitMiddleware = {
  general: createRateLimit(15 * 60 * 1000, 100, 'Too many requests, please try again later'), // 100 requests per 15 minutes
  auth: createRateLimit(15 * 60 * 1000, 10, 'Too many authentication attempts'), // 10 auth attempts per 15 minutes
  booking: createRateLimit(60 * 60 * 1000, 20, 'Too many booking requests'), // 20 bookings per hour
  otp: createRateLimit(5 * 60 * 1000, 3, 'Too many OTP requests'), // 3 OTP requests per 5 minutes
  upload: createRateLimit(60 * 60 * 1000, 10, 'Too many file uploads') // 10 uploads per hour
};

// Enhanced JWT authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'TOKEN_MISSING' 
      });
    }
    
    // Check if token is blacklisted in Redis
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ 
        error: 'Token has been revoked',
        code: 'TOKEN_REVOKED' 
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists and is active
    const User = require('../models/user');
    const user = await User.findById(decoded.id);
    
    if (!user || user.status === 'inactive') {
      return res.status(401).json({ 
        error: 'User not found or inactive',
        code: 'USER_INACTIVE' 
      });
    }
    
    req.user = user;
    req.token = token;
    
    // Update last activity
    await redisClient.setEx(`user:${user._id}:last_activity`, 3600, new Date().toISOString());
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED' 
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'TOKEN_INVALID' 
      });
    }
    
    console.error('Authentication error:', error);
    res.status(500).json({ 
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR' 
    });
  }
};

// Role-based authentication middleware
const authenticateRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];
      
      if (!token) {
        return res.status(401).json({ 
          error: 'Access token required',
          code: 'TOKEN_MISSING' 
        });
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check role-specific user models
      let user = null;
      let userRole = null;
      
      if (allowedRoles.includes('agency')) {
        const Agency = require('../models/agency');
        user = await Agency.findById(decoded.id);
        userRole = 'agency';
      }
      
      if (!user && allowedRoles.includes('doctor')) {
        const Doctor = require('../models/doctor');
        user = await Doctor.findById(decoded.id);
        userRole = 'doctor';
      }
      
      if (!user && allowedRoles.includes('nurse')) {
        const Nurse = require('../models/nurse');
        user = await Nurse.findById(decoded.id);
        userRole = 'nurse';
      }
      
      if (!user && allowedRoles.includes('admin')) {
        const Admin = require('../models/admin');
        user = await Admin.findById(decoded.id);
        userRole = 'admin';
      }
      
      if (!user && allowedRoles.includes('user')) {
        const User = require('../models/user');
        user = await User.findById(decoded.id);
        userRole = 'user';
      }
      
      if (!user) {
        return res.status(401).json({ 
          error: 'User not found',
          code: 'USER_NOT_FOUND' 
        });
      }
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required_roles: allowedRoles,
          user_role: userRole
        });
      }
      
      req.user = user;
      req.userRole = userRole;
      req.token = token;
      
      next();
    } catch (error) {
      console.error('Role authentication error:', error);
      res.status(500).json({ 
        error: 'Authentication service error',
        code: 'AUTH_SERVICE_ERROR' 
      });
    }
  };
};

// Input validation middleware
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    next();
  };
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  req.requestId = requestId;
  
  console.log(`[${new Date().toISOString()}] ${requestId} ${req.method} ${req.url} - Start`);
  
  // Log request body for POST/PUT requests (excluding sensitive data)
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const logBody = { ...req.body };
    // Remove sensitive fields
    delete logBody.password;
    delete logBody.card_number;
    delete logBody.cvv;
    
    console.log(`[${new Date().toISOString()}] ${requestId} Body:`, JSON.stringify(logBody, null, 2));
  }
  
  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${requestId} ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    
    // Log error responses
    if (res.statusCode >= 400) {
      console.error(`[${new Date().toISOString()}] ${requestId} Error Response:`, JSON.stringify(body, null, 2));
    }
    
    return originalJson.call(this, body);
  };
  
  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  
  console.error(`[${new Date().toISOString()}] ${requestId} Error:`, err);
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: Object.keys(err.errors).map(key => ({
        field: key,
        message: err.errors[key].message
      }))
    });
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      error: 'Duplicate entry',
      code: 'DUPLICATE_ERROR',
      field: field,
      message: `${field} already exists`
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      code: 'TOKEN_INVALID'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
      code: 'TOKEN_EXPIRED'
    });
  }
  
  // Default server error
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    requestId: requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Health check middleware
const healthCheck = (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
};

module.exports = {
  securityMiddleware,
  corsMiddleware,
  rateLimitMiddleware,
  authenticateToken,
  authenticateRole,
  validateInput,
  requestLogger,
  errorHandler,
  healthCheck,
  redisClient
};
