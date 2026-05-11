const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CustodyReturn = sequelize.define('CustodyReturn', {
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
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: {
      min: 0.01
    }
  },
  return_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  received_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  safe_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'safes',
      key: 'id'
    }
  },
  payment_method: {
    type: DataTypes.ENUM('CASH', 'INSTAPAY', 'BANK', 'VODAFONE_CASH'),
    defaultValue: 'CASH'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'custody_returns',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true
});

module.exports = CustodyReturn;
