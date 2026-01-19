const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

// Controllers
const authController = require('../controllers/authController');
const partnerController = require('../controllers/partnerController');
const farmController = require('../controllers/farmController');
const buyerController = require('../controllers/buyerController');
const vehicleController = require('../controllers/vehicleController');
const operationController = require('../controllers/operationController');
const reportController = require('../controllers/reportController');

// Auth routes (public)
router.post('/auth/login', authController.login);
router.get('/auth/profile', authenticate, authController.getProfile);

// Partner routes (Admin only)
router.get('/partners', authenticate, authorize('ADMIN'), partnerController.getAllPartners);
router.get('/partners/:id', authenticate, authorize('ADMIN'), partnerController.getPartnerById);
router.post('/partners', authenticate, authorize('ADMIN'), partnerController.createPartner);
router.put('/partners/:id', authenticate, authorize('ADMIN'), partnerController.updatePartner);
router.delete('/partners/:id', authenticate, authorize('ADMIN'), partnerController.deletePartner);

// Farm routes
router.get('/farms', authenticate, farmController.getAllFarms);
router.get('/farms/:id', authenticate, farmController.getFarmById);
router.post('/farms', authenticate, authorize('ADMIN'), farmController.createFarm);
router.put('/farms/:id', authenticate, authorize('ADMIN'), farmController.updateFarm);
router.delete('/farms/:id', authenticate, authorize('ADMIN'), farmController.deleteFarm);
router.get('/farms/:id/debt-history', authenticate, farmController.getFarmDebtHistory);

// Buyer routes
router.get('/buyers', authenticate, buyerController.getAllBuyers);
router.get('/buyers/:id', authenticate, buyerController.getBuyerById);
router.post('/buyers', authenticate, authorize('ADMIN'), buyerController.createBuyer);
router.put('/buyers/:id', authenticate, authorize('ADMIN'), buyerController.updateBuyer);
router.delete('/buyers/:id', authenticate, authorize('ADMIN'), buyerController.deleteBuyer);
router.get('/buyers/:id/debt-history', authenticate, buyerController.getBuyerDebtHistory);

// Vehicle routes
router.get('/vehicles', authenticate, vehicleController.getAllVehicles);
router.get('/vehicles/:id', authenticate, vehicleController.getVehicleById);
router.post('/vehicles', authenticate, authorize('ADMIN'), vehicleController.createVehicle);
router.put('/vehicles/:id', authenticate, authorize('ADMIN'), vehicleController.updateVehicle);
router.delete('/vehicles/:id', authenticate, authorize('ADMIN'), vehicleController.deleteVehicle);

// Chicken Type & Cost Category routes
router.get('/chicken-types', authenticate, operationController.getChickenTypes);
router.post('/chicken-types', authenticate, authorize('ADMIN'), operationController.createChickenType);
router.get('/cost-categories', authenticate, operationController.getCostCategories);
router.post('/cost-categories', authenticate, authorize('ADMIN'), operationController.createCostCategory);

// Daily Operation routes
router.post('/daily-operations/start', authenticate, operationController.startDailyOperation);
router.get('/daily-operations/:id', authenticate, operationController.getOperation);
router.get('/daily-operations/by-date/:date', authenticate, operationController.getOperationByDate);

// Operation transactions (all users can record)
router.post('/daily-operations/:id/farm-loading', authenticate, operationController.recordFarmLoading);
router.post('/daily-operations/:id/transport-loss', authenticate, operationController.recordTransportLoss);
router.post('/daily-operations/:id/cost', authenticate, operationController.recordDailyCost);
router.post('/daily-operations/:id/sale', authenticate, operationController.recordSale);

// Close operation (Admin only)
router.post('/daily-operations/:id/close', authenticate, authorize('ADMIN'), operationController.closeDailyOperation);

// Report routes
router.get('/reports/daily/:date', authenticate, reportController.getDailyReport);
router.get('/reports/period', authenticate, authorize('ADMIN'), reportController.getPeriodReport);
router.get('/reports/partner-profits', authenticate, authorize('ADMIN'), reportController.getPartnerProfitReport);
router.get('/reports/farm-debts', authenticate, reportController.getFarmDebtReport);
router.get('/reports/buyer-debts', authenticate, reportController.getBuyerDebtReport);

module.exports = router;