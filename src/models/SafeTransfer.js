const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SafeTransfer = sequelize.define('SafeTransfer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  from_safe_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'safes',
      key: 'id'
    }
  },
  to_safe_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'safes',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: {
      min: {
        args: [0.01],
        msg: 'Amount must be greater than zero'
      }
    }
  },
  transfer_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  performed_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'safe_transfers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true
});

module.exports = SafeTransfer;
