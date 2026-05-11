const express = require('express');
const cors = require('cors');
const morgan = require('morgan'); 
const helmet = require('helmet');

require('dotenv').config();

const routes = require('./routes'); 
const AppError = require('./utils/app-error.utility');
const errorHandleMiddleware = require('./middleware/error-handle.middleware');
const { generalLimiter, authLimiter } = require('./middleware/rateLimiter');

const app = express();


// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for API (enabled on frontend)
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: [process.env.CORS_ORIGIN , 'http://localhost:4200'],
  credentials: true,
  methods:['GET','POST','PUT','DELETE','PATCH'],
  allowedHeaders:['Content-Type','Authorization'] 
}));

app.use(express.json({ limit: '10kb' })); // Limit body size to prevent DOS
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(morgan('combined'));

// Apply general rate limiting to all API routes
app.use('/api', generalLimiter);
app.use('/api/auth/login', authLimiter);


 
// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp:  new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo' }) });
});

app.use('/api', routes);

// 404 handler
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

// Global error handler
app.use(errorHandleMiddleware);

module.exports = app;