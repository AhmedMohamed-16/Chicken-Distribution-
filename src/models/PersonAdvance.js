const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PersonAdvance = sequelize.define('PersonAdvance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'employees',
      key: 'id'
    }
  },
  person_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  person_type: {
    type: DataTypes.ENUM('EMPLOYEE', 'PARTNER'),
    allowNull: false,
    defaultValue: 'EMPLOYEE'
  },
  person_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: {
      min: 0.01
    }
  },
  advance_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  expected_return_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  paid_by_user_id: {
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
  returned_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'PARTIAL', 'RETURNED'),
    defaultValue: 'PENDING'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'employee_advances',
  timestamps: true,
  underscored: true,
  getterMethods: {
    balanceImpact() {
      // Advance increases the person's debt to us
      return parseFloat(this.getDataValue('amount')) || 0;
    }
  }
});

module.exports = PersonAdvance;
