const express = require('express');
const router = express.Router();
const safeTransferController = require('../controllers/safeTransferController');
const { authenticate } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');

// All routes require authenticated user
router.use(authenticate);

/**
 * @route   POST /api/safe-transfers
 * @desc    Create a transfer between two safes
 * @access  Admin only
 */
router.post(
  '/',
  requirePermissions(['APPLICATION_ADMIN']),
  safeTransferController.createTransfer
);

/**
 * @route   GET /api/safe-transfers
 * @desc    Get all transfers with filtering
 * @access  VIEW_SAFES or APPLICATION_ADMIN
 */
router.get('/',
  requirePermissions(['VIEW_SAFES', 'APPLICATION_ADMIN'], { requireAll: false }),
  safeTransferController.getAllTransfers
);

/**
 * @route   GET /api/safe-transfers/:id
 * @desc    Get transfer details
 * @access  VIEW_SAFES or APPLICATION_ADMIN
 */
router.get('/:id',
  requirePermissions(['VIEW_SAFES', 'APPLICATION_ADMIN'], { requireAll: false }),
  safeTransferController.getTransferById
);

module.exports = router;
