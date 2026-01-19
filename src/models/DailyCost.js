const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DailyCost = sequelize.define('DailyCost', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  daily_operation_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'daily_operations',
      key: 'id'
    }
  },
  cost_category_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'cost_categories',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'daily_costs',
  timestamps: true,
  createdAt: 'recorded_at',
  updatedAt: false
});

module.exports = DailyCost;