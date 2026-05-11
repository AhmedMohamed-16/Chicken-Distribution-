const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CustodySpending = sequelize.define('CustodySpending', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  custody_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'custodies',
      key: 'id'
    }
  },
  reference_type: {
    type: DataTypes.ENUM('FarmTransaction', 'DailyCost', 'SaleTransaction', 'ManualExpense', 'FarmDebtPayment', 'BuyerDebtPayment', 'CostDebtPayment'),
    allowNull: false
  },
  reference_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: {
      min: 0.01
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  spending_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  recorded_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'custody_spendings',
  timestamps: true,
  underscored: true
});

module.exports = CustodySpending;
