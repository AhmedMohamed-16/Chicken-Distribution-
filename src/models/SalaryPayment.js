const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SalaryPayment = sequelize.define('SalaryPayment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'employees',
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
  payment_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  period_month: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 12
    }
  },
  period_year: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  paid_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  received_by_employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'employees',
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
  tableName: 'salary_payments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true,
  getterMethods: {
    balanceImpact() {
      // Salary payment is an entitlement payout, not a debt.
      // If the system doesn't accrue salaries as negative debt, paying it shouldn't increase debt.
      return 0; 
    }
  }
});

module.exports = SalaryPayment;
