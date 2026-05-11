const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AdvanceReturn = sequelize.define('AdvanceReturn', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  advance_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'employee_advances',
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
  tableName: 'advance_returns',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true,
  getterMethods: {
    balanceImpact() {
      // Return decreases the person's debt to us
      return -(parseFloat(this.getDataValue('amount')) || 0);
    }
  }
});

module.exports = AdvanceReturn;
