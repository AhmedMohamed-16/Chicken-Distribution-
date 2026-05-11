const express = require('express');
const router = express.Router();
const safeController = require('../controllers/safeController');
const { authenticate } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');

// All safes routes require authenticated user
router.use(authenticate);

// Read operations - require specific permissions
router.get('/',
  requirePermissions(['VIEW_SAFES', 'APPLICATION_ADMIN'], { requireAll: false }),
  safeController.getAllSafes
);
router.get('/summary',
  requirePermissions(['VIEW_SAFES', 'APPLICATION_ADMIN'], { requireAll: false }),
  safeController.getSafeSummary
);
router.get('/dashboard',
  requirePermissions(['VIEW_SAFES', 'APPLICATION_ADMIN'], { requireAll: false }),
  safeController.getSafeDashboard
);
router.get('/:id',
  requirePermissions(['VIEW_SAFES', 'APPLICATION_ADMIN'], { requireAll: false }),
  safeController.getSafeById
);
router.get('/:id/ledger',
  requirePermissions(['VIEW_SAFES', 'APPLICATION_ADMIN'], { requireAll: false }),
  safeController.getSafeLedger
);

// Admin-only operations
router.post('/',
  requirePermissions(['APPLICATION_ADMIN']),
  safeController.createSafe
);
router.put('/:id',
  requirePermissions(['APPLICATION_ADMIN']),
  safeController.updateSafe
);

module.exports = router;
