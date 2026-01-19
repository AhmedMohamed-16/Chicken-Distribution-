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
  }
}, {
  tableName: 'profit_distributions',
  timestamps: true,
  createdAt: 'calculated_at',
  updatedAt: false
});
module.exports = ProfitDistribution;