const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PartnerWithdrawal = sequelize.define('PartnerWithdrawal', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  partner_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'partners',
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
  withdrawal_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  processed_by_user_id: {
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
  tableName: 'partner_withdrawals',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true
});

module.exports = PartnerWithdrawal;
