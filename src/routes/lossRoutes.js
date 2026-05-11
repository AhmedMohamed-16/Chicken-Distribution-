const express = require('express');
const router = express.Router();
const lossController = require('../controllers/lossController');
const { authenticate } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/losses/summary
 * @desc    Get losses summary
 * @access  VIEW_COST_CATEGORIES, VIEW_DAILY_REPORT, or APPLICATION_ADMIN
 */
router.get('/summary',
  requirePermissions(['VIEW_COST_CATEGORIES', 'VIEW_DAILY_REPORT', 'APPLICATION_ADMIN'], { requireAll: false }),
  lossController.getLossSummary
);

/**
 * @route   POST /api/losses
 * @desc    Create a general loss record
 * @access  RECORD_TRANSPORT_LOSS or APPLICATION_ADMIN
 */
router.post(
  '/',
  requirePermissions(['RECORD_TRANSPORT_LOSS', 'APPLICATION_ADMIN'], { requireAll: false }),
  lossController.createGeneralLoss
);

/**
 * @route   GET /api/losses
 * @desc    Get all loss records with filtering
 * @access  VIEW_COST_CATEGORIES, VIEW_DAILY_REPORT, or APPLICATION_ADMIN
 */
router.get('/',
  requirePermissions(['VIEW_COST_CATEGORIES', 'VIEW_DAILY_REPORT', 'APPLICATION_ADMIN'], { requireAll: false }),
  lossController.getAllLosses
);

/**
 * @route   GET /api/losses/:id
 * @desc    Get a specific loss record by ID
 * @access  VIEW_COST_CATEGORIES, VIEW_DAILY_REPORT, or APPLICATION_ADMIN
 */
router.get('/:id',
  requirePermissions(['VIEW_COST_CATEGORIES', 'VIEW_DAILY_REPORT', 'APPLICATION_ADMIN'], { requireAll: false }),
  lossController.getLossById
);

module.exports = router;
