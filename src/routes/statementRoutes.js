const express = require('express');
const router = express.Router();
const statementController = require('../controllers/statementController');
const { authenticate } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');

// All routes require authentication and statement report permission
router.use(authenticate);
router.use(requirePermissions(['VIEW_STATEMENT_REPORT', 'APPLICATION_ADMIN'], { requireAll: false }));

// Generalized statement route - requires authentication + statement permission
router.get('/:entityType/:entityId', statementController.getStatement);

module.exports = router;
