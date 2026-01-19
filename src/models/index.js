const { sequelize } = require('../config/database');

// Import all models
const User = require('./User');
const Partner = require('./Partner');
const Vehicle = require('./Vehicle');
const Farm = require('./Farm');
const Buyer = require('./Buyer');
const ChickenType = require('./ChickenType');
const CostCategory = require('./CostCategory');
const DailyOperation = require('./DailyOperation');
const FarmTransaction = require('./FarmTransaction');
const SaleTransaction = require('./SaleTransaction');
const TransportLoss = require('./TransportLoss');
const DailyCost = require('./DailyCost');
const ProfitDistribution = require('./ProfitDistribution');
const PartnerProfit = require('./PartnerProfit');
const VehiclePartner = require('./VehiclePartner');
const FarmDebtPayment = require('./FarmDebtPayment');
const BuyerDebtPayment = require('./BuyerDebtPayment');

// Define associations
const setupAssociations = () => {
  // Vehicle - Partner (Many-to-Many)
  Vehicle.belongsToMany(Partner, { through: VehiclePartner, foreignKey: 'vehicle_id' });
  Partner.belongsToMany(Vehicle, { through: VehiclePartner, foreignKey: 'partner_id' });

  // DailyOperation relationships
  DailyOperation.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });
  DailyOperation.belongsTo(User, { foreignKey: 'user_id' });
  
  // FarmTransaction relationships
  FarmTransaction.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id' });
  FarmTransaction.belongsTo(Farm, { foreignKey: 'farm_id' });
  FarmTransaction.belongsTo(ChickenType, { foreignKey: 'chicken_type_id' });
  
  DailyOperation.hasMany(FarmTransaction, { foreignKey: 'daily_operation_id' });
  Farm.hasMany(FarmTransaction, { foreignKey: 'farm_id' });

  // SaleTransaction relationships
  SaleTransaction.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id' });
  SaleTransaction.belongsTo(Buyer, { foreignKey: 'buyer_id' });
  SaleTransaction.belongsTo(ChickenType, { foreignKey: 'chicken_type_id' });
  
  DailyOperation.hasMany(SaleTransaction, { foreignKey: 'daily_operation_id' });
  Buyer.hasMany(SaleTransaction, { foreignKey: 'buyer_id' });

  // TransportLoss relationships
  TransportLoss.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id' });
  TransportLoss.belongsTo(ChickenType, { foreignKey: 'chicken_type_id' });
  DailyOperation.hasMany(TransportLoss, { foreignKey: 'daily_operation_id' });

  // DailyCost relationships
  DailyCost.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id' });
  DailyCost.belongsTo(CostCategory, { foreignKey: 'cost_category_id' });
  DailyOperation.hasMany(DailyCost, { foreignKey: 'daily_operation_id' });

  // ProfitDistribution relationships
  ProfitDistribution.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id' });
  DailyOperation.hasOne(ProfitDistribution, { foreignKey: 'daily_operation_id' });

  // PartnerProfit relationships
  PartnerProfit.belongsTo(ProfitDistribution, { foreignKey: 'profit_distribution_id' });
  PartnerProfit.belongsTo(Partner, { foreignKey: 'partner_id' });
  ProfitDistribution.hasMany(PartnerProfit, { foreignKey: 'profit_distribution_id' });

  // Debt Payment relationships
  FarmDebtPayment.belongsTo(Farm, { foreignKey: 'farm_id' });
  FarmDebtPayment.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id' });
  Farm.hasMany(FarmDebtPayment, { foreignKey: 'farm_id' });

  BuyerDebtPayment.belongsTo(Buyer, { foreignKey: 'buyer_id' });
  BuyerDebtPayment.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id' });
  Buyer.hasMany(BuyerDebtPayment, { foreignKey: 'buyer_id' });
};

setupAssociations();

module.exports = {
  sequelize,
  User,
  Partner,
  Vehicle,
  Farm,
  Buyer,
  ChickenType,
  CostCategory,
  DailyOperation,
  FarmTransaction,
  SaleTransaction,
  TransportLoss,
  DailyCost,
  ProfitDistribution,
  PartnerProfit,
  VehiclePartner,
  FarmDebtPayment,
  BuyerDebtPayment
};