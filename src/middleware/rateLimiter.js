// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'طلبات كثيرة جداً. يرجى المحاولة بعد 15 دقيقة.'
  }
});

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'محاولات تسجيل دخول كثيرة. يرجى المحاولة بعد 15 دقيقة.'
  }
});

/**
 * Moderate rate limiter for financial transactions (withdrawals, payments)
 * 30 requests per 15 minutes per IP
 */
const financialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'طلبات مالية كثيرة جداً. يرجى المحاولة لاحقاً.'
  }
});

/**
 * Strict rate limiter for safe/balance operations
 * 20 requests per 15 minutes per IP
 */
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'طلبات كثيرة جداً للعمليات الحساسة. يرجى المحاولة لاحقاً.'
  }
});

module.exports = {
  generalLimiter,
  authLimiter,
  financialLimiter,
  sensitiveLimiter
};
