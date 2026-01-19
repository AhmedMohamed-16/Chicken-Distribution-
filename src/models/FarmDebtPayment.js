const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FarmDebtPayment = sequelize.define('FarmDebtPayment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  farm_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'farms',
      key: 'id'
    }
  },
  daily_operation_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'daily_operations',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  payment_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'farm_debt_payments',
  timestamps: false
});

module.exports = FarmDebtPayment;