const express = require('express');
const router = express.Router();
const partnerProfitController = require('../controllers/partnerProfitController');
const { authenticate } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/partners/balances
 * @desc    Get all partner profit balances
 * @access  VIEW_PARTNERS, VIEW_PROFIT_REPORT, or APPLICATION_ADMIN
 */
router.get('/balances',
  requirePermissions(['VIEW_PARTNERS', 'VIEW_PROFIT_REPORT', 'APPLICATION_ADMIN'], { requireAll: false }),
  partnerProfitController.getAllPartnersBalance
);

/**
 * @route   GET /api/partners/:id/balance
 * @desc    Get detailed balance report for a partner
 * @access  VIEW_PARTNERS, VIEW_PROFIT_REPORT, or APPLICATION_ADMIN
 */
router.get('/:id/balance',
  requirePermissions(['VIEW_PARTNERS', 'VIEW_PROFIT_REPORT', 'APPLICATION_ADMIN'], { requireAll: false }),
  partnerProfitController.getPartnerBalance
);

/**
 * @route   GET /api/partners/:id/withdrawals
 * @desc    Get withdrawal history for a partner
 * @access  VIEW_PARTNERS, VIEW_PROFIT_REPORT, or APPLICATION_ADMIN
 */
router.get('/:id/withdrawals',
  requirePermissions(['VIEW_PARTNERS', 'VIEW_PROFIT_REPORT', 'APPLICATION_ADMIN'], { requireAll: false }),
  partnerProfitController.getAllWithdrawals
);

/**
 * @route   POST /api/partners/:id/withdrawal
 * @desc    Record a partner profit withdrawal (Money OUT)
 * @access  Admin only
 */
router.post(
  '/:id/withdrawal',
  requirePermissions(['APPLICATION_ADMIN']),
  partnerProfitController.recordWithdrawal
);

/**
 * @route   POST /api/partners/:id/reinvest
 * @desc    Record profit reinvestment (profit → capital)
 * @access  Admin only
 */
router.post(
  '/:id/reinvest',
  requirePermissions(['APPLICATION_ADMIN']),
  partnerProfitController.recordReinvestment
);

/**
 * @route  GET /api/partners/:id/reinvestments
 * @desc   Get reinvestment history
 * @access  VIEW_PARTNERS, VIEW_PROFIT_REPORT, or APPLICATION_ADMIN
 */
router.get('/:id/reinvestments',
  requirePermissions(['VIEW_PARTNERS', 'VIEW_PROFIT_REPORT', 'APPLICATION_ADMIN'], { requireAll: false }),
  partnerProfitController.getAllReinvestments
);

/**
 * @route  GET /api/partners/:id/transactions
 * @desc   Combined transactions history
 * @access  VIEW_PARTNERS, VIEW_PROFIT_REPORT, or APPLICATION_ADMIN
 */
router.get('/:id/transactions',
  requirePermissions(['VIEW_PARTNERS', 'VIEW_PROFIT_REPORT', 'APPLICATION_ADMIN'], { requireAll: false }),
  partnerProfitController.getTransactionsHistory
);

module.exports = router;
