// const express = require('express');
// const router = express.Router();
// const { authenticate, authorize } = require('../middleware/auth');

// // Controllers
 
// const authController = require('../controllers/authController');
// const userController = require('../controllers/userController');
// const permissionController = require('../controllers/permissionController');
// const partnerController = require('../controllers/partnerController');
// const farmController = require('../controllers/farmController');
// const buyerController = require('../controllers/buyerController');
// const vehicleController = require('../controllers/vehicleController');
// const operationController = require('../controllers/operationController');
// const reportController = require('../controllers/reportController');
// const farmPaymentController = require('../controllers/farmPaymentController');
// const VehicleOperationController = require('../controllers/vehicleOperationController');
// const ValidationMiddleware = require('../middleware/validation');
// const ProfitDistributionController = require('../controllers/ProfitDistributionController');


// // Auth routes (public)
// router.post('/auth/login', authController.login);
// router.get('/auth/profile', authenticate, authController.getProfile);

// // Partner routes (Admin only)
// router.get('/partners', authenticate, authorize('ADMIN'), partnerController.getAllPartners);
// router.get('/partners/:id', authenticate, authorize('ADMIN'), partnerController.getPartnerById);
// router.post('/partners', authenticate, authorize('ADMIN'), partnerController.createPartner);
// router.put('/partners/:id', authenticate, authorize('ADMIN'), partnerController.updatePartner);
// router.delete('/partners/:id', authenticate, authorize('ADMIN'), partnerController.deletePartner);

// // Farm routes
// router.get('/farms', authenticate, farmController.getAllFarms);
// router.get('/farms/:id', authenticate, farmController.getFarmById);
// router.post('/farms', authenticate, authorize('ADMIN'), farmController.createFarm);
// router.put('/farms/:id', authenticate, authorize('ADMIN'), farmController.updateFarm);
// router.delete('/farms/:id', authenticate, authorize('ADMIN'), farmController.deleteFarm);
// router.get('/farms/:id/debt-history', authenticate, farmController.getFarmDebtHistory);

// // Buyer routes
// router.get('/buyers', authenticate, buyerController.getAllBuyers);
// router.get('/buyers/:id', authenticate, buyerController.getBuyerById);
// router.post('/buyers', authenticate, authorize('ADMIN'), buyerController.createBuyer);
// router.put('/buyers/:id', authenticate, authorize('ADMIN'), buyerController.updateBuyer);
// router.delete('/buyers/:id', authenticate, authorize('ADMIN'), buyerController.deleteBuyer);
// router.get('/buyers/:id/debt-history', authenticate, buyerController.getBuyerDebtHistory);

// // Vehicle routes
// router.get('/vehicles', authenticate, vehicleController.getAllVehicles);
// router.get('/vehicles/:id', authenticate, vehicleController.getVehicleById);
// router.post('/vehicles', authenticate, authorize('ADMIN'), vehicleController.createVehicle);
// router.put('/vehicles/:id', authenticate, authorize('ADMIN'), vehicleController.updateVehicle);
// router.delete('/vehicles/:id', authenticate, authorize('ADMIN'), vehicleController.deleteVehicle);

// // Chicken Type & Cost Category routes
// router.get('/chicken-types', authenticate, operationController.getChickenTypes);
// router.post('/chicken-types', authenticate, authorize('ADMIN'), operationController.createChickenType);
// router.get('/chicken-types/:id', authenticate, operationController.getChickenTypeById);
// router.put('/chicken-types/:id', authenticate, authorize('ADMIN'), operationController.updateChickenType);
// router.delete('/chicken-types/:id', authenticate, authorize('ADMIN'), operationController.deleteChickenType);
// // Get all cost categories
// router.get(
//   '/cost-categories',
//   authenticate,
//   operationController.getCostCategories
// );

// // Get cost categories by type (vehicle/general)
// router.get(
//   '/cost-categories/type/:type',
//   authenticate,
//   operationController.getCostCategoriesByType
// );

// // Get cost category by ID
// router.get(
//   '/cost-categories/:id',
//   authenticate,
//   operationController.getCostCategory
// );

// // Get cost category statistics
// router.get(
//   '/cost-categories/:id/statistics',
//   authenticate,
//   authorize('ADMIN'),
//   operationController.getCostCategoryStatistics
// );

// // Create cost category
// router.post(
//   '/cost-categories',
//   authenticate,
//   authorize('ADMIN'),
//   operationController.createCostCategory
// );

// // Update cost category
// router.put(
//   '/cost-categories/:id',
//   authenticate,
//   authorize('ADMIN'),
//   operationController.updateCostCategory
// );

// // Delete cost category
// router.delete(
//   '/cost-categories/:id',
//   authenticate,
//   authorize('ADMIN'),
//   operationController.deleteCostCategory
// );

// //vehicle management in daily operations 
// router.patch(
//   '/daily-operations/vehicle-operations/:vehicleOperationId/complete',
//   authenticate,
//   VehicleOperationController.completeVehicleOperation
// );
// router.get(
//   '/daily-operations/:id/vehicles',
//   authenticate,
//   VehicleOperationController.getOperationVehicles
// );
 
// router.get(
//   '/daily-operations/:id/vehicles/:vehicleId/transactions',
//   authenticate,ValidationMiddleware.transactionWithVehicle,
//   VehicleOperationController.getVehicleTransactions
// );
 
// router.post(
//   '/daily-operations/:id/vehicles',
//   authenticate,ValidationMiddleware.addVehicleToOperation,
//   VehicleOperationController.addVehicleToOperation
// );
 
// router.delete(
//   '/daily-operations/:id/vehicles/:vehicleId',
//   authenticate,
//   authorize('ADMIN'), // Only admins can remove vehicles
//   ValidationMiddleware.transactionWithVehicle,
//   VehicleOperationController.removeVehicleFromOperation
// );
// // Daily Operation routes
// router.post('/daily-operations/start', authenticate,ValidationMiddleware.startOperation, operationController.startDailyOperation);
// router.get('/daily-operations/:id', authenticate, operationController.getOperation);
// router.get('/daily-operations/by-date/:date', authenticate, operationController.getOperationByDate);
// // Operation transactions (all users can record)
// router.post('/daily-operations/:id/farm-loading', authenticate, operationController.recordFarmLoading);
// router.post('/daily-operations/:id/transport-loss', authenticate,ValidationMiddleware.transactionWithVehicle, operationController.recordTransportLoss);
// router.post('/daily-operations/:id/cost', authenticate,operationController.recordDailyCost);
// router.post('/daily-operations/:id/sale', authenticate,operationController.recordSale);

// // Close operation (Admin only)
// router.post('/daily-operations/:id/close', authenticate, authorize('ADMIN'), operationController.closeDailyOperation);

// // Report routes
// router.get('/reports/daily-enhanced/:date', authenticate, reportController.getEnhancedDailyReport);
// router.get('/reports/period', authenticate, authorize('ADMIN'), reportController.getPeriodReport);

// router.get('/reports/profit-analysis', authenticate, authorize('ADMIN'), reportController.getProfitAnalysis);
// router.get('/reports/profit-summary', authenticate, authorize('ADMIN'), reportController.getProfitSummary);
// router.get('/reports/profit-leakage', authenticate, authorize('ADMIN'), reportController.getProfitLeakage);
// router.get('/reports/profit-distribution', authenticate, authorize('ADMIN'), ProfitDistributionController.getProfitDistributionReport);
// router.get('/reports/profit-distribution/partners', authenticate, authorize('ADMIN'), ProfitDistributionController.getPartnerProfitDetails);
// router.get('/reports/profit-distribution/partner/:partnerId', authenticate, authorize('ADMIN'), ProfitDistributionController.getIndividualPartnerProfit);
// router.get('/reports/profit-distribution/summary', authenticate, authorize('ADMIN'), ProfitDistributionController.getDistributionSummary);

// router.get('/reports/farm-receivables', reportController.getFarmReceivablesReport);
// router.get('/reports/farm-payables', reportController.getFarmPayablesReport);
// router.get('/reports/farm-balances',  reportController.getFarmBalancesReport);
// router.get('/reports/farm-statement/:farmId', reportController.getFarmStatement);
// router.get('/reports/farm-debts', reportController.getFarmDebtReport);

// router.get('/reports/buyer-debts', authenticate, reportController.getBuyerDebtReport);
// router.get('/reports/buyer-statement/:buyerId', authenticate, reportController.getBuyerStatement);


// router.post('/farm-debt-payments', authenticate, farmPaymentController.recordPayment);
// router.delete('/farm-debt-payments/farm/:id', authenticate, farmPaymentController.deletePayment);
// router.get('/farm-debt-payments/farm/:farmId', authenticate, farmPaymentController.getPaymentHistory);
// router.get('/farm-debt-payments/:id', authenticate, farmPaymentController.getPaymentById);



// module.exports = router;

// =========================
// File: routes/index.js (UPDATED)
// Routes with permission-based authorization
// =========================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requirePermissions } = require('../middleware/permissions');

// Controllers
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const permissionController = require('../controllers/permissionController');
const partnerController = require('../controllers/partnerController');
const farmController = require('../controllers/farmController');
const buyerController = require('../controllers/buyerController');
const vehicleController = require('../controllers/vehicleController');
const operationController = require('../controllers/operationController');
const reportController = require('../controllers/reportController');
const farmPaymentController = require('../controllers/farmPaymentController');
const VehicleOperationController = require('../controllers/vehicleOperationController');
const ValidationMiddleware = require('../middleware/validation');
const ProfitDistributionController = require('../controllers/ProfitDistributionController');
const costCategoryController = require('../controllers/costCategoryController'); // ✅ Imported
const upload = require('../middleware/upload'); 
const {
  createBackupController,
  downloadBackupController,
  restoreBackupController,
  listBackupsController
} = require('../controllers/Backupcontroller');
const employeeController = require('../controllers/employeeController');
const financialRoutes = require('./financialTransactionRoutes');

// ========================================
// AUTH ROUTES (Public & User Self-Service)
// ========================================
router.post('/auth/login', authController.login);
router.post('/auth/logout', authenticate, authController.logout);
router.get('/auth/profile', authenticate, authController.getProfile);
router.put('/auth/profile', authenticate, authController.updateProfile);
router.get('/auth/permissions', authenticate, authController.getMyPermissions);

// ========================================
// USER MANAGEMENT ROUTES (Admin)
// ========================================
router.get('/users', authenticate, requirePermissions(['VIEW_USERS','MANAGE_USERS'],{ requireAll :false }), userController.getAllUsers);
router.get('/users/:id', authenticate, requirePermissions(['VIEW_USERS','MANAGE_USERS'],{ requireAll :false }), userController.getUserById);
router.post('/users', authenticate, requirePermissions(['MANAGE_USERS']), userController.createUser);
router.put('/users/:id', authenticate, requirePermissions(['MANAGE_USERS']), userController.updateUser);
router.delete('/users/:id', authenticate, requirePermissions(['MANAGE_USERS']), userController.deleteUser);

// User Permissions Management
router.post('/users/:id/permissions', authenticate, requirePermissions(['MANAGE_USERS']), userController.assignPermissions);
router.delete('/users/:id/permissions/:permissionId', authenticate, requirePermissions(['MANAGE_USERS']), userController.revokePermission);

// ========================================
// PERMISSION ROUTES (Admin)
// ========================================//[VIEW_PERMISSIONS / MANAGE_PERMISSIONS]
router.get('/permissions', authenticate, requirePermissions(['VIEW_USERS','MANAGE_USERS'],{ requireAll :false }), permissionController.getAllPermissions);
router.get('/permissions/:id', authenticate, requirePermissions(['VIEW_USERS','MANAGE_USERS'],{ requireAll :false }), permissionController.getPermissionById);
router.get('/permissions/category/:category', authenticate, requirePermissions(['VIEW_USERS','MANAGE_USERS'],{ requireAll :false }), permissionController.getPermissionsByCategory);
router.post('/permissions', authenticate, requirePermissions(['MANAGE_USERS']), permissionController.createPermission);
router.put('/permissions/:id', authenticate, requirePermissions(['MANAGE_USERS']), permissionController.updatePermission);
router.delete('/permissions/:id', authenticate, requirePermissions(['MANAGE_USERS']), permissionController.deletePermission);
router.get('/permissions/:id/statistics', authenticate, requirePermissions(['VIEW_USERS','MANAGE_USERS'],{ requireAll :false }), permissionController.getPermissionStatistics);

// ========================================
  // PARTNER ROUTES - REORDERED for /balances priority
  // ========================================
  // Partner profit routes FIRST - MOVE TO TOP OF PARTNER SECTION
  const partnerProfitRoutes1 = require('./partnerProfitRoutes');
  router.use('/partners', partnerProfitRoutes1);
  
  // Partner CRUD after profit routes
  router.get('/partners', authenticate, requirePermissions(['VIEW_PARTNERS','MANAGE_PARTNERS'],{ requireAll :false }), partnerController.getAllPartners);
  router.get('/partners/:id', authenticate, requirePermissions(['VIEW_PARTNERS','MANAGE_PARTNERS'],{ requireAll :false }), partnerController.getPartnerById);
  router.post('/partners', authenticate, requirePermissions(['MANAGE_PARTNERS']), partnerController.createPartner);
  router.put('/partners/:id', authenticate, requirePermissions(['MANAGE_PARTNERS']), partnerController.updatePartner);
  router.delete('/partners/:id', authenticate, requirePermissions(['MANAGE_PARTNERS']), partnerController.deletePartner);

  // ========================================
  // FARM ROUTES
  // ========================================
router.get('/farms', authenticate, requirePermissions(['VIEW_FARMS','MANAGE_FARMS','RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST'],{ requireAll :false }), farmController.getAllFarms);
router.get('/paginate-farms', authenticate, requirePermissions(['VIEW_FARMS','MANAGE_FARMS'],{ requireAll :false }), farmController.getPaginationAllFarms);
router.get('/farms/payables', authenticate, requirePermissions(['VIEW_FARMS','MANAGE_FARMS'],{ requireAll :false }), farmController.getPayables);
router.get('/farms/receivables', authenticate, requirePermissions(['VIEW_FARMS','MANAGE_FARMS'],{ requireAll :false }), farmController.getReceivables);
router.get('/farms/net-position', authenticate, requirePermissions(['VIEW_FARMS','MANAGE_FARMS'],{ requireAll :false }), farmController.getNetPosition);
router.get('/farms/active-balances', authenticate, requirePermissions(['VIEW_FARMS','MANAGE_FARMS'],{ requireAll :false }), farmController.getActiveBalances);
router.get('/farms/:id', authenticate, requirePermissions(['VIEW_FARMS','MANAGE_FARMS'],{ requireAll :false }), farmController.getFarmById);

router.post('/farms', authenticate, requirePermissions(['MANAGE_FARMS']), farmController.createFarm);
router.put('/farms/:id', authenticate, requirePermissions(['MANAGE_FARMS']), farmController.updateFarm);
router.delete('/farms/:id', authenticate, requirePermissions(['MANAGE_FARMS']), farmController.deleteFarm);
router.get('/farms/:id/debt-history', authenticate, requirePermissions(['VIEW_FARMS','MANAGE_FARMS'],{ requireAll :false }), farmController.getFarmDebtHistory);

// ========================================
// BUYER ROUTES
// ========================================VIEW_FARM_DEBT,VIEW_BUYER_DEBT
router.get('/buyers', authenticate, requirePermissions(['VIEW_BUYERS','MANAGE_BUYERS','RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST'],{ requireAll :false }), buyerController.getAllBuyers);
router.get('/paginate-buyers', authenticate, requirePermissions(['VIEW_BUYERS','MANAGE_BUYERS'],{ requireAll :false }), buyerController.getPaginationAllBuyers);
router.get('/buyers/:id', authenticate, requirePermissions(['VIEW_BUYERS','MANAGE_BUYERS'],{ requireAll :false }), buyerController.getBuyerById);
router.post('/buyers', authenticate, requirePermissions(['MANAGE_BUYERS']), buyerController.createBuyer);
router.put('/buyers/:id', authenticate, requirePermissions(['MANAGE_BUYERS']), buyerController.updateBuyer);
router.delete('/buyers/:id', authenticate, requirePermissions(['MANAGE_BUYERS']), buyerController.deleteBuyer);
router.get('/buyers/:id/debt-history', authenticate, requirePermissions(['VIEW_BUYERS','MANAGE_BUYERS'],{ requireAll :false }), buyerController.getBuyerDebtHistory);

// ========================================
// VEHICLE ROUTES
// ========================================
router.get('/vehicles', authenticate, requirePermissions(['VIEW_VEHICLES','MANAGE_VEHICLES','RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST','CLOSE_OPERATION'],{ requireAll :false }), vehicleController.getAllVehicles);
router.get('/vehicles/:id', authenticate, requirePermissions(['VIEW_VEHICLES','MANAGE_VEHICLES'],{ requireAll :false }), vehicleController.getVehicleById);
router.post('/vehicles', authenticate, requirePermissions(['MANAGE_VEHICLES']), vehicleController.createVehicle);
router.put('/vehicles/:id', authenticate, requirePermissions(['MANAGE_VEHICLES']), vehicleController.updateVehicle);
router.delete('/vehicles/:id', authenticate, requirePermissions(['MANAGE_VEHICLES']), vehicleController.deleteVehicle);

// ========================================
// CHICKEN TYPE & COST CATEGORY ROUTES
// ========================================
router.get('/chicken-types', authenticate, requirePermissions(['VIEW_CHICKEN_TYPES','MANAGE_CHICKEN_TYPES','RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST'],{ requireAll :false }), operationController.getChickenTypes);//'VIEW_OPERATIONS'
router.post('/chicken-types', authenticate, requirePermissions(['MANAGE_CHICKEN_TYPES']), operationController.createChickenType);
router.get('/chicken-types/:id', authenticate, requirePermissions(['VIEW_CHICKEN_TYPES','MANAGE_CHICKEN_TYPES','RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST'],{ requireAll :false }), operationController.getChickenTypeById);
router.put('/chicken-types/:id', authenticate, requirePermissions(['MANAGE_CHICKEN_TYPES']), operationController.updateChickenType);
router.delete('/chicken-types/:id', authenticate, requirePermissions(['MANAGE_CHICKEN_TYPES']), operationController.deleteChickenType);

router.get('/cost-categories', authenticate, requirePermissions(['VIEW_COST_CATEGORIES','MANAGE_COST_CATEGORIES','RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST'],{ requireAll :false }), operationController.getCostCategories);
router.get('/paginate-cost-categories', authenticate, requirePermissions(['VIEW_COST_CATEGORIES','MANAGE_COST_CATEGORIES','RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST'],{ requireAll :false }), operationController.getPaginationCostCategories);
router.get('/cost-categories/type/:type', authenticate, requirePermissions(['VIEW_COST_CATEGORIES','MANAGE_COST_CATEGORIES','RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST'],{ requireAll :false }), operationController.getCostCategoriesByType);
router.get('/cost-categories/:id', authenticate, requirePermissions(['VIEW_COST_CATEGORIES','MANAGE_COST_CATEGORIES','RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST'],{ requireAll :false }), operationController.getCostCategory);
router.get('/cost-categories/:id/statistics', authenticate, requirePermissions(['MANAGE_COST_CATEGORIES']), operationController.getCostCategoryStatistics);
router.post('/cost-categories', authenticate, requirePermissions(['MANAGE_COST_CATEGORIES']), operationController.createCostCategory);
router.put('/cost-categories/:id', authenticate, requirePermissions(['MANAGE_COST_CATEGORIES']), operationController.updateCostCategory);
router.delete('/cost-categories/:id', authenticate, requirePermissions(['MANAGE_COST_CATEGORIES']), operationController.deleteCostCategory);

// ========================================
// COST CATEGORY BALANCES ROUTES
// ========================================
router.get('/cost-balances',
  authenticate,
  requirePermissions(['VIEW_COST_CATEGORIES', 'RECORD_COST'], { requireAll: false }),
  costCategoryController.getCategoryBalances
);

router.get('/cost-balances/summary',
  authenticate,
  requirePermissions(['VIEW_COST_CATEGORIES', 'RECORD_COST'], { requireAll: false }),
  costCategoryController.getCostSummary
);

router.get('/cost-balances/statement/:id',
  authenticate,
  requirePermissions(['VIEW_COST_CATEGORIES', 'RECORD_COST'], { requireAll: false }),
  costCategoryController.getCategoryStatement
);


// ========================================
// VEHICLE OPERATIONS IN DAILY OPERATIONS
// ========================================
router.patch('/daily-operations/vehicle-operations/:vehicleOperationId/complete',
  authenticate,
  requirePermissions(['RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST','CLOSE_OPERATION'],{ requireAll :false }),//MANAGE_VEHICLE_OPERATIONS
  VehicleOperationController.completeVehicleOperation
);

router.get('/daily-operations/:id/vehicles',
  authenticate,
  requirePermissions(['RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST','CLOSE_OPERATION'],{ requireAll :false }),
  VehicleOperationController.getOperationVehicles
);

router.get('/daily-operations/:id/vehicles/:vehicleId/transactions',
  authenticate,
  requirePermissions(['RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST','CLOSE_OPERATION'],{ requireAll: false }),
  ValidationMiddleware.transactionWithVehicle,
  VehicleOperationController.getVehicleTransactions
);

router.post('/daily-operations/:id/vehicles',
  authenticate,
  requirePermissions(['RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST','CLOSE_OPERATION'],{ requireAll :false }),
  ValidationMiddleware.addVehicleToOperation,
  VehicleOperationController.addVehicleToOperation
);

router.delete('/daily-operations/:id/vehicles/:vehicleId',
  authenticate,
  requirePermissions(['RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST','CLOSE_OPERATION'],{ requireAll :false }),
  ValidationMiddleware.transactionWithVehicle,
  VehicleOperationController.removeVehicleFromOperation
);

// ========================================
// DAILY OPERATION ROUTES
// ========================================
router.post('/daily-operations/start',
  authenticate,
  requirePermissions(['RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST','CLOSE_OPERATION'],{ requireAll :false }),
  ValidationMiddleware.startOperation,
  operationController.startDailyOperation
);

router.get('/daily-operations/unpaid-costs',
  authenticate,
  requirePermissions(['VIEW_COSTS', 'RECORD_COST'], { requireAll: false }),
  operationController.getUnpaidCosts
);

router.get('/daily-operations/by-date/:date',
  authenticate,
  requirePermissions(['RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST','CLOSE_OPERATION'],{ requireAll: false }),
  operationController.getOperationByDate
);

// Operation transactions
router.post('/daily-operations/:id/farm-loading',
  authenticate,
  requirePermissions(['RECORD_FARM_LOADING']),
  operationController.recordFarmLoading
);

router.post('/daily-operations/:id/transport-loss',
  authenticate,
  requirePermissions(['RECORD_TRANSPORT_LOSS']),
  ValidationMiddleware.transactionWithVehicle,
  operationController.recordTransportLoss
);

router.post('/daily-operations/:id/cost',
  authenticate,
  requirePermissions(['RECORD_COST']),
  operationController.recordDailyCost
);

router.get('/daily-costs/unpaid-costs',
  authenticate,
  requirePermissions(['VIEW_COSTS', 'RECORD_COST'], { requireAll: false }),
  operationController.getUnpaidCosts
);

router.post('/daily-costs/:id/payment',
  authenticate,
  requirePermissions(['RECORD_COST']),
  operationController.recordCostPayment
);

router.get('/daily-operations/:id/unpaid-costs',
  authenticate,
  requirePermissions(['VIEW_COSTS', 'RECORD_COST'], { requireAll: false }),
  operationController.getUnpaidCostsForOperation
);

router.post('/daily-operations/:id/sale',
  authenticate,
  requirePermissions(['RECORD_SALE']),
  operationController.recordSale
);

// Close operation
router.post('/daily-operations/:id/close',
  authenticate,
  requirePermissions(['CLOSE_OPERATION']),
  operationController.closeDailyOperation
);
router.get('/daily-operations/:id',
  authenticate,
  requirePermissions(['RECORD_FARM_LOADING','RECORD_SALE','RECORD_TRANSPORT_LOSS','RECORD_COST','CLOSE_OPERATION'],{ requireAll :false }),
  operationController.getOperation
);


// ========================================
// REPORT ROUTES
// ========================================
router.get('/reports/daily-enhanced/:date',
  authenticate,
  requirePermissions(['VIEW_DAILY_REPORT']),
  reportController.getEnhancedDailyReport
);

router.get('/reports/period',
  authenticate,
  requirePermissions(['VIEW_PERIOD_REPORT']),
  reportController.getPeriodReport
);

router.get('/reports/profit-analysis',
  authenticate,
  requirePermissions(['VIEW_PROFIT_REPORT']),
  reportController.getProfitAnalysis
);

router.get('/reports/profit-summary',
  authenticate,
  requirePermissions(['VIEW_PROFIT_REPORT']),
  reportController.getProfitSummary
);

router.get('/reports/profit-leakage',
  authenticate,
  requirePermissions(['VIEW_PROFIT_REPORT']),
  reportController.getProfitLeakage
);

router.get('/reports/profit-distribution',
  authenticate,
  requirePermissions(['VIEW_PROFIT_REPORT']),
  ProfitDistributionController.getProfitDistributionReport
);

router.get('/reports/profit-distribution/partners',
  authenticate,
  requirePermissions(['VIEW_PROFIT_REPORT']),
  ProfitDistributionController.getPartnerProfitDetails
);

router.get('/reports/profit-distribution/partner/:partnerId',
  authenticate,
  requirePermissions(['VIEW_PROFIT_REPORT']),
  ProfitDistributionController.getIndividualPartnerProfit
);

router.get('/reports/profit-distribution/summary',
  authenticate,
  requirePermissions(['VIEW_PROFIT_REPORT']),
  ProfitDistributionController.getDistributionSummary
);

router.get('/reports/farm-receivables',
  authenticate,
  requirePermissions(['VIEW_DEBT_REPORT']),//'VIEW_FARM_BALANCES'
  reportController.getFarmReceivablesReport
);

router.get('/reports/farm-payables',
  authenticate,
  requirePermissions(['VIEW_DEBT_REPORT']),//'VIEW_FARM_BALANCES'
  reportController.getFarmPayablesReport
);

router.get('/reports/farm-balances',
  authenticate,
  requirePermissions(['VIEW_DEBT_REPORT']),//'VIEW_FARM_BALANCES'
  reportController.getFarmBalancesReport
);

router.get('/reports/farm-statement/:farmId',
  authenticate,
  requirePermissions(['VIEW_DEBT_REPORT']),
  reportController.getFarmStatement
);

router.get('/reports/farm-debts',
  authenticate,
  requirePermissions(['VIEW_DEBT_REPORT']),
  reportController.getFarmDebtReport
);

router.get('/reports/buyer-debts',
  authenticate,
  requirePermissions(['VIEW_DEBT_REPORT']),
  reportController.getBuyerDebtReport
);

router.get('/reports/buyer-statement/:buyerId',
  authenticate,
  requirePermissions(['VIEW_DEBT_REPORT']),
  reportController.getBuyerStatement
);

// ========================================
// FARM PAYMENT ROUTES
// ========================================
router.post('/farm-debt-payments',
  authenticate,
  requirePermissions(['MANAGE_FARMS']),//MANAGE_FARM_PAYMENTS
  farmPaymentController.recordPayment
);

router.delete('/farm-debt-payments/farm/:id',
  authenticate,
  requirePermissions(['MANAGE_FARMS']),//MANAGE_FARM_PAYMENTS
  farmPaymentController.deletePayment
);

router.get('/farm-debt-payments/farm/:farmId',
  authenticate,
  requirePermissions(['VIEW_FARMS','MANAGE_FARMS']),//VIEW_FARM_DEBT
  farmPaymentController.getPaymentHistory
);

router.get('/farm-debt-payments/:id',
  authenticate,
  requirePermissions(['VIEW_FARMS','MANAGE_FARMS']),//VIEW_FARM_DEBT
  farmPaymentController.getPaymentById
);



/**
 * @route   POST /api/backup
 * @desc    Create a new database backup
 * @access  Admin only
 */
router.post('/backup', authenticate,  requirePermissions(['APPLICATION_ADMIN']), createBackupController);

/**
 * @route   GET /api/backup/list
 * @desc    List all available backups
 * @access  Admin only
 */
router.get('/backup/list', authenticate,requirePermissions(['APPLICATION_ADMIN']), listBackupsController);

/**
 * @route   GET /api/backup/download/:filename
 * @desc    Download a backup file
 * @access  Admin only
 */
router.get('/backup/download/:filename', authenticate, requirePermissions(['APPLICATION_ADMIN']),downloadBackupController);

/**
 * @route   POST /api/backup/restore
 * @desc    Restore database from uploaded backup file
 * @access  Admin only
 * @body    file: ZIP backup file
 * @body    strategy: 'replace' or 'append' (optional, default: 'replace')
 */
router.post('/backup/restore', authenticate, upload.single('file'), restoreBackupController);


// ========================================
// EMPLOYEE ROUTES
// ========================================
router.get('/employees',
  authenticate,
  requirePermissions(['VIEW_EMPLOYEES', 'MANAGE_EMPLOYEES'], { requireAll: false }),
  employeeController.getAllEmployees
);

router.get('/employees/:id',
  authenticate,
  requirePermissions(['VIEW_EMPLOYEES', 'MANAGE_EMPLOYEES'], { requireAll: false }),
  employeeController.getEmployeeById
);

router.post('/employees',
  authenticate,
  requirePermissions(['MANAGE_EMPLOYEES']),
  employeeController.createEmployee
);

router.put('/employees/:id',
  authenticate,
  requirePermissions(['MANAGE_EMPLOYEES']),
  employeeController.updateEmployee
);

router.delete('/employees/:id',
  authenticate,
  requirePermissions(['MANAGE_EMPLOYEES']),
  employeeController.deleteEmployee
);

// ========================================
// ADVANCES & CUSTODIES ROUTES
// ========================================
const advanceRoutes = require('./advanceRoutes');
const custodyRoutes = require('./custodyRoutes');
const salaryRoutes = require('./salaryRoutes');
router.use('/advances', advanceRoutes);
router.use('/custodies', custodyRoutes);
router.use('/salaries', salaryRoutes);

// ========================================
// SAFES & TRANSFERS ROUTES
// ========================================
const safeRoutes = require('./safeRoutes');
const safeTransferRoutes = require('./safeTransferRoutes');
router.use('/safes', safeRoutes);
router.use('/safe-transfers', safeTransferRoutes);

// ========================================
// LOSS ROUTES
// ========================================
const lossRoutes = require('./lossRoutes');
router.use('/losses', lossRoutes);

// ========================================
// PARTNER PROFIT & WITHDRAWAL ROUTES
// ========================================
const partnerProfitRoutes = require('./partnerProfitRoutes');
router.use('/partners', partnerProfitRoutes);
// ========================================
// FINANCIAL TRANSACTION ROUTES
// ========================================
const financialTransactionRoutes = require('./financialTransactionRoutes');
router.use('/financial-transactions', financialTransactionRoutes);

// ========================================
// UNIFIED STATEMENT ROUTES
// ========================================
const statementRoutes = require('./statementRoutes');
router.use('/statements', authenticate, requirePermissions(['VIEW_STATEMENT_REPORT', 'APPLICATION_ADMIN'], { requireAll: false }), statementRoutes);

module.exports = router;