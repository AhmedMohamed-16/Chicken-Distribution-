const express = require('express');
const router = express.Router();
const advanceController = require('../controllers/advanceController');
const { authenticate } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/advances/pending
 * @desc    Get all non-returned advances
 * @access  MANAGE_EMPLOYEES or APPLICATION_ADMIN
 */
router.get('/pending',
  requirePermissions(['MANAGE_EMPLOYEES', 'APPLICATION_ADMIN'], { requireAll: false }),
  advanceController.getPendingAdvances
);

/**
 * @route   POST /api/advances
 * @desc    Create a new advance (Money OUT)
 * @access  MANAGE_EMPLOYEES or APPLICATION_ADMIN
 */
router.post(
  '/',
  requirePermissions(['MANAGE_EMPLOYEES', 'APPLICATION_ADMIN'], { requireAll: false }),
  advanceController.createAdvance
);

/**
 * @route   POST /api/advances/:id/return
 * @desc    Record a payment returning an advance (Money IN)
 * @access  MANAGE_EMPLOYEES or APPLICATION_ADMIN
 */
router.post('/:id/return',
  requirePermissions(['MANAGE_EMPLOYEES', 'APPLICATION_ADMIN'], { requireAll: false }),
  advanceController.recordReturn
);

/**
 * @route   GET /api/advances
 * @desc    Get all advances with filters
 * @access  MANAGE_EMPLOYEES, VIEW_ADVANCES, or APPLICATION_ADMIN
 */
router.get('/',
  requirePermissions(['MANAGE_EMPLOYEES', 'VIEW_ADVANCES', 'APPLICATION_ADMIN'], { requireAll: false }),
  advanceController.getAllAdvances
);

/**
 * @route   GET /api/advances/:id
 * @desc    Get detailed advance info with all returns
 * @access  MANAGE_EMPLOYEES, VIEW_ADVANCES, or APPLICATION_ADMIN
 */
router.get('/:id',
  requirePermissions(['MANAGE_EMPLOYEES', 'VIEW_ADVANCES', 'APPLICATION_ADMIN'], { requireAll: false }),
  advanceController.getAdvanceById
);

module.exports = router;
