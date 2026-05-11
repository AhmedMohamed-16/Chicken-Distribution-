// src/routes/financialTransactionRoutes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/financialTransactionController');
const { authenticate } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');

// Authenticate all routes and restrict to admins or users with relevant report permissions
router.use(authenticate);
router.use(requirePermissions(['APPLICATION_ADMIN', 'VIEW_DAILY_REPORT', 'VIEW_PERIOD_REPORT'], { requireAll: false }));

// GET /api/financial-transactions/summary
router.get('/summary', controller.getSummary);

// GET /api/financial-transactions
router.get('/', controller.getTransactions);

module.exports = router;
