const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ProfitDistribution = sequelize.define('ProfitDistribution', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  daily_operation_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'daily_operations',
      key: 'id'
    }
  },
  total_revenue: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  total_purchases: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  total_losses: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  total_costs: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  vehicle_costs: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  net_profit: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  lossesWithFarm: {           
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,   
       field: 'losseswithfarm'  
  },
  lossesWithoutFarm: {       
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
     field: 'losseswithoutfarm' 
  },
  // In ProfitDistribution.js, add these fields:
total_sales_discount: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
total_purchase_discount: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },

// Debts PAID by us (outgoing)
debt_paid_from_sales: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },       // buyer surplus/overpayment we gave
debt_paid_from_purchases: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },   // TO_FARM payments
debt_paid_from_costs: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },       // cost debt payments OUT

// Debts RECEIVED by us (incoming)
debt_received_from_sales: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },   // FROM_BUYER payments
debt_received_from_purchases: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 }, // FROM_FARM payments
debt_received_from_costs: { type: DataTypes.DECIMAL(12,2), defaultValue: 0 },   // cost debt payments IN
}, {
  tableName: 'profit_distributions',
  timestamps: true,
  createdAt: 'calculated_at',
  updatedAt: false,
  underscored: false 
});
module.exports = ProfitDistribution;