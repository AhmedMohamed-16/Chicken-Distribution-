// ========================================
// MODELS INDEX - FIXED FOR POSTGRESQL
// Correct order for foreign key constraints
// ========================================

const { sequelize } = require('../config/database');

// ========================================
// STEP 1: Import all models (no associations yet)
// ========================================

const User = require('./User');
const { Partner, recalculateAllPercentages } = require('./Partner');
const Vehicle = require('./Vehicle');
const Farm = require('./Farm');
const Buyer = require('./Buyer');
const Safe = require('./Safe');
const ChickenType = require('./ChickenType');
const CostCategory = require('./CostCategory');
const DailyOperation = require('./DailyOperation');
const FarmTransaction = require('./FarmTransaction');
const SaleTransaction = require('./SaleTransaction');
const TransportLoss = require('./TransportLoss');
const DailyCost = require('./DailyCost');
const CostDebtPayment = require('./CostDebtPayment');
const ProfitDistribution = require('./ProfitDistribution');
const PartnerProfit = require('./PartnerProfit');
const VehiclePartner = require('./VehiclePartner');
const FarmDebtPayment = require('./FarmDebtPayment');
const BuyerDebtPayment = require('./BuyerDebtPayment');
const VehicleOperation = require('./VehicleOperation');
const Permission = require('./Permission');
const UserPermission = require('./UserPermission');
const UserBackup = require('./Userbackup');
const SaleWeight = require('./SaleWeight');
const Employee = require('./Employee');
const FinancialTransaction = require('./FinancialTransaction');
const PersonAdvance = require('./PersonAdvance');
const SafeTransfer = require('./SafeTransfer');
const AdvanceReturn = require('./AdvanceReturn');
const Custody = require('./Custody');
const CustodyReturn = require('./CustodyReturn');
const SalaryPayment = require('./SalaryPayment');
const PartnerWithdrawal = require('./PartnerWithdrawal');
const PartnerReinvestment = require('./PartnerReinvestment');
const CustodySpending = require('./CustodySpending');

// ========================================
// STEP 2: Define all associations
// ========================================

const setupAssociations = () => {
  // User - Permission (Many-to-Many)
  User.belongsToMany(Permission, {
    through: UserPermission,
    foreignKey: 'user_id',
    otherKey: 'permission_id',
    as: 'permissions'
  });
  
  Permission.belongsToMany(User, {
    through: UserPermission,
    foreignKey: 'permission_id',
    otherKey: 'user_id',
    as: 'users'
  });
  
  // UserPermission direct associations
  UserPermission.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  UserPermission.belongsTo(Permission, { foreignKey: 'permission_id', as: 'permission' });
  UserPermission.belongsTo(User, { foreignKey: 'granted_by', as: 'granter' });
  
  User.hasMany(UserPermission, { foreignKey: 'user_id', as: 'user_permissions' });
  Permission.hasMany(UserPermission, { foreignKey: 'permission_id', as: 'user_permissions' });

  // Vehicle - Partner (Many-to-Many)
  Vehicle.belongsToMany(Partner, { through: VehiclePartner, foreignKey: 'vehicle_id', as: 'partners' });
  Partner.belongsToMany(Vehicle, { through: VehiclePartner, foreignKey: 'partner_id', as: 'vehicles' });
  Vehicle.belongsTo(Safe, { foreignKey: 'safe_id', as: 'safe' });
  Safe.hasMany(Vehicle, { foreignKey: 'safe_id', as: 'vehicles' });

  // DailyOperation - Vehicle (Many-to-Many)
  DailyOperation.belongsToMany(Vehicle, {
    through: VehicleOperation,
    foreignKey: 'daily_operation_id',
    otherKey: 'vehicle_id',
    as: 'vehicles'
  });
  
  Vehicle.belongsToMany(DailyOperation, {
    through: VehicleOperation,
    foreignKey: 'vehicle_id',
    otherKey: 'daily_operation_id',
    as: 'daily_operations'
  });

  // VehicleOperation direct associations
  VehicleOperation.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id', as: 'operation' });
  VehicleOperation.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
  DailyOperation.hasMany(VehicleOperation, { foreignKey: 'daily_operation_id', as: 'vehicle_operations' });
  Vehicle.hasMany(VehicleOperation, { foreignKey: 'vehicle_id', as: 'vehicle_operations' });

  // DailyOperation associations
  DailyOperation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

  // FarmTransaction associations
  FarmTransaction.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id', as: 'operation' });
  FarmTransaction.belongsTo(Farm, { foreignKey: 'farm_id', as: 'farm' });
  FarmTransaction.belongsTo(ChickenType, { foreignKey: 'chicken_type_id', as: 'chicken_type' });
  FarmTransaction.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
  FarmTransaction.belongsTo(VehicleOperation, { foreignKey: 'vehicle_operation_id', as: 'vehicle_operation' });
  
  DailyOperation.hasMany(FarmTransaction, { foreignKey: 'daily_operation_id', as: 'farm_transactions' });
  Farm.hasMany(FarmTransaction, { foreignKey: 'farm_id', as: 'transactions' });
  Vehicle.hasMany(FarmTransaction, { foreignKey: 'vehicle_id', as: 'farm_transactions' });
  VehicleOperation.hasMany(FarmTransaction, { foreignKey: 'vehicle_operation_id', as: 'farm_transactions' });

  // SaleTransaction associations
  SaleTransaction.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id', as: 'operation' });
  SaleTransaction.belongsTo(Buyer, { foreignKey: 'buyer_id', as: 'buyer' });
  SaleTransaction.belongsTo(ChickenType, { foreignKey: 'chicken_type_id', as: 'chicken_type' });
  SaleTransaction.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
  SaleTransaction.belongsTo(TransportLoss, { foreignKey: 'loss_record_id', as: 'loss_record' });
  
  DailyOperation.hasMany(SaleTransaction, { foreignKey: 'daily_operation_id', as: 'sale_transactions' });
  Buyer.hasMany(SaleTransaction, { foreignKey: 'buyer_id', as: 'sale_transactions' });
  Vehicle.hasMany(SaleTransaction, { foreignKey: 'vehicle_id', as: 'sale_transactions' });
  VehicleOperation.hasMany(SaleTransaction, { foreignKey: 'vehicle_operation_id', as: 'sale_transactions' });
  TransportLoss.hasOne(SaleTransaction, { foreignKey: 'loss_record_id', as: 'sale_transaction' });

  // TransportLoss associations
  TransportLoss.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id', as: 'operation' });
  TransportLoss.belongsTo(ChickenType, { foreignKey: 'chicken_type_id', as: 'chicken_type' });
  TransportLoss.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
  TransportLoss.belongsTo(VehicleOperation, { foreignKey: 'vehicle_operation_id', as: 'vehicle_operation' });
  TransportLoss.belongsTo(Farm, { foreignKey: 'farm_id', as: 'farm', constraints: false });
  TransportLoss.belongsTo(Safe, { foreignKey: 'safe_id', as: 'safe' });
  
  DailyOperation.hasMany(TransportLoss, { foreignKey: 'daily_operation_id', as: 'losses' });
  Vehicle.hasMany(TransportLoss, { foreignKey: 'vehicle_id', as: 'losses' });
  VehicleOperation.hasMany(TransportLoss, { foreignKey: 'vehicle_operation_id', as: 'transport_losses' });
  Farm.hasMany(TransportLoss, { foreignKey: 'farm_id', as: 'transport_losses' });
  Safe.hasMany(TransportLoss, { foreignKey: 'safe_id', as: 'transport_losses' });

  // DailyCost associations
  DailyCost.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id', as: 'operation' });
  DailyCost.belongsTo(CostCategory, { foreignKey: 'cost_category_id', as: 'category' });
  DailyCost.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
  DailyCost.belongsTo(VehicleOperation, { foreignKey: 'vehicle_operation_id', as: 'vehicle_operation' });
  
  DailyOperation.hasMany(DailyCost, { foreignKey: 'daily_operation_id', as: 'costs' });
  CostCategory.hasMany(DailyCost, { foreignKey: 'cost_category_id', as: 'costs' });
  Vehicle.hasMany(DailyCost, { foreignKey: 'vehicle_id', as: 'costs' });
  VehicleOperation.hasMany(DailyCost, { foreignKey: 'vehicle_operation_id', as: 'daily_costs' });

  CostDebtPayment.belongsTo(DailyCost, { foreignKey: 'daily_cost_id', as: 'daily_cost' });
  DailyCost.hasMany(CostDebtPayment, { foreignKey: 'daily_cost_id', as: 'debt_payments' });

  CostDebtPayment.belongsTo(CostCategory, { foreignKey: 'cost_category_id', as: 'category' });
  CostCategory.hasMany(CostDebtPayment, { foreignKey: 'cost_category_id', as: 'debt_payments' });

  // ProfitDistribution associations
  ProfitDistribution.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id', as: 'operation' });
  DailyOperation.hasOne(ProfitDistribution, { foreignKey: 'daily_operation_id', as: 'profit_distribution' });

  // PartnerProfit associations
  PartnerProfit.belongsTo(ProfitDistribution, { foreignKey: 'profit_distribution_id', as: 'profit_distribution' });
  PartnerProfit.belongsTo(Partner, { foreignKey: 'partner_id', as: 'partner' });
  ProfitDistribution.hasMany(PartnerProfit, { foreignKey: 'profit_distribution_id', as: 'partner_profits' });

  // Debt Payment associations
  FarmDebtPayment.belongsTo(Farm, { foreignKey: 'farm_id', as: 'farm' });
  FarmDebtPayment.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id', as: 'operation' });
  Farm.hasMany(FarmDebtPayment, { foreignKey: 'farm_id', as: 'debt_payments' });

  BuyerDebtPayment.belongsTo(Buyer, { foreignKey: 'buyer_id', as: 'buyer' });
  BuyerDebtPayment.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id', as: 'operation' });
  Buyer.hasMany(BuyerDebtPayment, { foreignKey: 'buyer_id', as: 'debt_payments' });

  SaleTransaction.belongsTo(VehicleOperation, {
  foreignKey: 'vehicle_operation_id',
  as: 'vehicle_operation'
});

// SaleWeight relationships
SaleTransaction.hasMany(SaleWeight, {
  foreignKey: 'sale_transaction_id',
  as: 'weights',
  onDelete: 'CASCADE'   // Deleting a sale removes its weight readings
});

// 🔥 FIX: Safe ↔ SaleTransaction association (resolves EagerLoadingError)
SaleTransaction.belongsTo(Safe, { 
  foreignKey: 'payment_source_id', 
  as: 'safe' 
});
Safe.hasMany(SaleTransaction, { 
  foreignKey: 'payment_source_id', 
  as: 'sale_transactions' 
});


  // Employee associations
  PersonAdvance.belongsTo(User, { foreignKey: 'paid_by_user_id', as: 'payer' });
  PersonAdvance.belongsTo(Safe, { foreignKey: 'safe_id', as: 'safe' });
  PersonAdvance.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
  PersonAdvance.belongsTo(Partner, { foreignKey: 'person_id', as: 'partner', constraints: false });
  PersonAdvance.hasMany(AdvanceReturn, { foreignKey: 'advance_id', as: 'returns' });
  Employee.hasMany(PersonAdvance, { foreignKey: 'employee_id', as: 'advances' });

  // AdvanceReturn associations
  AdvanceReturn.belongsTo(PersonAdvance, { foreignKey: 'advance_id', as: 'advance' });
  AdvanceReturn.belongsTo(User, { foreignKey: 'received_by_user_id', as: 'receiver' });
  AdvanceReturn.belongsTo(Safe, { foreignKey: 'safe_id', as: 'safe' });

  // Custody associations
  Custody.belongsTo(User, { foreignKey: 'given_by_user_id', as: 'creator' });
  Custody.belongsTo(Safe, { foreignKey: 'safe_id', as: 'safe' });
  Custody.hasMany(CustodyReturn, { foreignKey: 'custody_id', as: 'returns' });
  Custody.hasMany(CustodySpending, { foreignKey: 'custody_id', as: 'spendings' });

  // CustodySpending associations
  CustodySpending.belongsTo(Custody, { foreignKey: 'custody_id', as: 'custody' });
  CustodySpending.belongsTo(User, { foreignKey: 'recorded_by_user_id', as: 'recorder' });

  // CustodyReturn associations
  CustodyReturn.belongsTo(Custody, { foreignKey: 'custody_id', as: 'custody' });
  CustodyReturn.belongsTo(User, { foreignKey: 'received_by_user_id', as: 'receiver' });
  CustodyReturn.belongsTo(Safe, { foreignKey: 'safe_id', as: 'safe' });

  // Salary associations
  SalaryPayment.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
  SalaryPayment.belongsTo(Employee, { foreignKey: 'received_by_employee_id', as: 'receiver' });
  SalaryPayment.belongsTo(User, { foreignKey: 'paid_by_user_id', as: 'payer' });
  SalaryPayment.belongsTo(Safe, { foreignKey: 'safe_id', as: 'safe' });

  // Partner associations
  Partner.hasMany(PartnerProfit, { foreignKey: 'partner_id', as: 'profits' });
  // Partner Withdrawal associations
  Partner.hasMany(PartnerWithdrawal, { foreignKey: 'partner_id', as: 'withdrawals' });
  PartnerWithdrawal.belongsTo(Partner, { foreignKey: 'partner_id', as: 'partner' });
  
  // Partner Reinvestment associations
  Partner.hasMany(PartnerReinvestment, { foreignKey: 'partner_id', as: 'reinvestments' });
  PartnerReinvestment.belongsTo(Partner, { foreignKey: 'partner_id', as: 'partner' });
  PartnerReinvestment.belongsTo(User, { foreignKey: 'processed_by_user_id', as: 'processed_by_user' });

  // PartnerWithdrawal ↔ Safe associations (🔥 FIX: Resolves "Safe is not associated to PartnerWithdrawal")
  PartnerWithdrawal.belongsTo(Safe, { foreignKey: 'safe_id', as: 'safe' });
  Safe.hasMany(PartnerWithdrawal, { foreignKey: 'safe_id', as: 'partner_withdrawals' });

  // SafeTransfer associations
  SafeTransfer.belongsTo(Safe, { foreignKey: 'from_safe_id', as: 'fromSafe' });
  SafeTransfer.belongsTo(Safe, { foreignKey: 'to_safe_id', as: 'toSafe' });
  SafeTransfer.belongsTo(User, { foreignKey: 'performed_by_user_id', as: 'performer' });

  // FinancialTransaction associations
  FinancialTransaction.belongsTo(DailyOperation, { foreignKey: 'daily_operation_id', as: 'operation' });
  FinancialTransaction.belongsTo(User, { foreignKey: 'performed_by_user_id', as: 'performed_by' });
// Legacy safe association - REMOVED (FinancialTransaction now uses payment_source_type/id)
  // FinancialTransaction.belongsTo(Safe, { foreignKey: 'safe_id', as: 'safe' });
  // Safe.hasMany(FinancialTransaction, { foreignKey: 'safe_id', as: 'financial_transactions' });
  
  DailyOperation.hasMany(FinancialTransaction, { foreignKey: 'daily_operation_id', as: 'financial_transactions' });
  User.hasMany(FinancialTransaction, { foreignKey: 'performed_by_user_id', as: 'financial_transactions' });

};

// Setup associations immediately
setupAssociations();

// ========================================
// STEP 3: Define sync order for PostgreSQL
// ========================================

/**
 * Get models in correct order for syncing
 * Parent tables must be created before child tables
 */
const getSyncOrder = () => {
  return [
    // Level 1: No dependencies
    User,
    Partner,
    Safe,
    Vehicle,
    Farm,
    Buyer,
    ChickenType,
    CostCategory,
    Permission,
    Employee,        // No FK dependencies
    
    // Level 2: Depend on Level 1
    VehiclePartner,      // Depends on: Vehicle, Partner
    UserPermission,      // Depends on: User, Permission
    DailyOperation,      // Depends on: User
    
    // Level 3: Depend on Level 2
    VehicleOperation,    // Depends on: DailyOperation, Vehicle
    
    // Level 4: Depend on Level 3
    FarmTransaction,     // Depends on: DailyOperation, Farm, ChickenType, Vehicle, VehicleOperation
    SaleTransaction,     // Depends on: DailyOperation, Buyer, ChickenType, Vehicle, VehicleOperation
    TransportLoss,       // Depends on: DailyOperation, ChickenType, Vehicle, VehicleOperation, Farm (optional)
    DailyCost,          // Depends on: DailyOperation, CostCategory, Vehicle, VehicleOperation
    FarmDebtPayment,    // Depends on: Farm, DailyOperation
    BuyerDebtPayment,   // Depends on: Buyer, DailyOperation
    ProfitDistribution, // Depends on: DailyOperation
    
    // Level 5: Depend on Level 4
    PartnerProfit,      // Depends on: ProfitDistribution, Partner
    CostDebtPayment,    // Depends on: DailyCost
    
    // Optional: UserBackup (standalone)
    UserBackup,
    SaleWeight,
    FinancialTransaction,
    PersonAdvance,
    SafeTransfer,
    AdvanceReturn,
    Custody,
    CustodyReturn,
    CustodySpending,
    SalaryPayment,
    PartnerWithdrawal,
    PartnerReinvestment
  ];
};

/**
 * Sync all models in correct order
 */
const syncModels = async (options = {}) => {
  const models = getSyncOrder();
  
  console.log(`\n📦 Syncing ${models.length} models in correct order...`);
  
  for (const model of models) {
    try {
      await model.sync(options);
      console.log(`   ✅ ${model.name}`);
    } catch (error) {
      console.error(`   ❌ ${model.name}: ${error.message}`);
      throw error;
    }
  }
};

// ========================================
// STEP 4: Export everything
// ========================================

const models = {
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
  CostDebtPayment,
  ProfitDistribution,
  PartnerProfit,
  VehiclePartner,
  FarmDebtPayment,
  BuyerDebtPayment,
  VehicleOperation,
  Permission,
  UserPermission,
  UserBackup,
  SaleWeight,
  Employee,
  Safe,
  FinancialTransaction,
  PersonAdvance,
  SafeTransfer,
  AdvanceReturn,
  Custody,
  CustodyReturn,
  CustodySpending,
  SalaryPayment,
  PartnerWithdrawal,
  PartnerReinvestment
};

const getTableNames = () => {
  return Object.keys(models).filter(name => 
    name !== 'UserBackup' && name !== 'Permission'
  );
};

module.exports = {
  ...models,
  models,
  getTableNames,
  recalculateAllPercentages,
  sequelize,
  syncModels,  // ✅ NEW: Export custom sync function
  getSyncOrder // ✅ NEW: Export sync order
};