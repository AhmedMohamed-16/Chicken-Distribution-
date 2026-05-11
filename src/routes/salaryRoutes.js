const express = require('express');
const router = express.Router();
const salaryController = require('../controllers/salaryController');
const { authenticate } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/salaries/summary
 * @desc    Get salary summary for an employee
 * @access  MANAGE_EMPLOYEES, VIEW_ADVANCES, or APPLICATION_ADMIN
 */
router.get('/summary',
  requirePermissions(['MANAGE_EMPLOYEES', 'VIEW_ADVANCES', 'APPLICATION_ADMIN'], { requireAll: false }),
  salaryController.getEmployeeSalarySummary
);

/**
 * @route   POST /api/salaries
 * @desc    Record an employee salary payment (Money OUT)
 * @access  Admin only
 */
router.post(
  '/',
  requirePermissions(['MANAGE_EMPLOYEES', 'APPLICATION_ADMIN'], { requireAll: false }),
  salaryController.recordSalary
);

/**
 * @route   GET /api/salaries
 * @desc    Get all salary payments with filters
 * @access  MANAGE_EMPLOYEES, VIEW_ADVANCES, or APPLICATION_ADMIN
 */
router.get('/',
  requirePermissions(['MANAGE_EMPLOYEES', 'VIEW_ADVANCES', 'APPLICATION_ADMIN'], { requireAll: false }),
  salaryController.getAllSalaries
);

/**
 * @route   GET /api/salaries/:id
 * @desc    Get a specific salary payment by ID
 * @access  MANAGE_EMPLOYEES, VIEW_ADVANCES, or APPLICATION_ADMIN
 */
router.get('/:id',
  requirePermissions(['MANAGE_EMPLOYEES', 'VIEW_ADVANCES', 'APPLICATION_ADMIN'], { requireAll: false }),
  salaryController.getSalaryById
);

module.exports = router;
