const express = require('express');
const router = express.Router();
const custodyController = require('../controllers/custodyController');
const { authenticate } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/custodies
 * @desc    Create a new operational custody (Money OUT)
 * @access  Admin only
 */
router.post(
  '/',
  requirePermissions(['MANAGE_SAFES', 'APPLICATION_ADMIN'], { requireAll: false }),
  custodyController.createCustody
);

/**
 * @route   POST /api/custodies/:id/return
 * @desc    Record a return of custody funds (Money IN)
 * @access  Admin or MANAGE_SAFES
 */
router.post('/:id/return',
  requirePermissions(['MANAGE_SAFES', 'APPLICATION_ADMIN'], { requireAll: false }),
  custodyController.recordCustodyReturn
);

/**
 * @route   POST /api/custodies/:id/settle
 * @desc    Settle outstanding custody (remaining unaccounted balance becomes loss/expense)
 * @access  Admin only
 */
router.post(
  '/:id/settle',
  requirePermissions(['MANAGE_SAFES', 'APPLICATION_ADMIN'], { requireAll: false }),
  custodyController.settleCustody
);

/**
 * @route   POST /api/custodies/:id/spending
 * @desc    Document spending from a custody (Does NOT hit the safe)
 * @access  Admin or MANAGE_SAFES
 */
router.post('/:id/spending',
  requirePermissions(['MANAGE_SAFES', 'APPLICATION_ADMIN'], { requireAll: false }),
  custodyController.recordCustodySpending
);

/**
 * @route   GET /api/custodies/summary
 * @desc    Snapshot of all active custodies
 * @access  MANAGE_SAFES, VIEW_CUSTODY, or APPLICATION_ADMIN
 */
router.get('/summary',
  requirePermissions(['MANAGE_SAFES', 'VIEW_CUSTODY', 'APPLICATION_ADMIN'], { requireAll: false }),
  custodyController.getCustodySummary
);

/**
 * @route   GET /api/custodies/summary/all
 * @desc    Same as summary (duplicate route kept for compatibility)
 * @access  MANAGE_SAFES, VIEW_CUSTODY, or APPLICATION_ADMIN
 */
router.get('/summary/all',
  requirePermissions(['MANAGE_SAFES', 'VIEW_CUSTODY', 'APPLICATION_ADMIN'], { requireAll: false }),
  custodyController.getCustodySummary
);

/**
 * @route   GET /api/custodies/:id/statement
 * @desc    Get full custody ledger / statement
 * @access  MANAGE_SAFES, VIEW_CUSTODY, or APPLICATION_ADMIN
 */
router.get('/:id/statement',
  requirePermissions(['MANAGE_SAFES', 'VIEW_CUSTODY', 'APPLICATION_ADMIN'], { requireAll: false }),
  custodyController.getCustodyStatement
);

/**
 * @route   GET /api/custodies
 * @desc    Get all custody records with filtering
 * @access  MANAGE_SAFES, VIEW_CUSTODY, or APPLICATION_ADMIN
 */
router.get('/',
  requirePermissions(['MANAGE_SAFES', 'VIEW_CUSTODY', 'APPLICATION_ADMIN'], { requireAll: false }),
  custodyController.getAllCustodies
);

/**
 * @route   GET /api/custodies/:id
 * @desc    Get a specific custody record by ID
 * @access  MANAGE_SAFES, VIEW_CUSTODY, or APPLICATION_ADMIN
 */
router.get('/:id',
  requirePermissions(['MANAGE_SAFES', 'VIEW_CUSTODY', 'APPLICATION_ADMIN'], { requireAll: false }),
  custodyController.getCustodyById
);

module.exports = router;
