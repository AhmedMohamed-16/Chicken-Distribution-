const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Custody = sequelize.define('Custody', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  given_to_person_type: {
    type: DataTypes.ENUM( 'EMPLOYEE', 'PARTNER'),
    allowNull: false
  },
  given_to_person_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: {
      min: 0.01
    }
  },
  custody_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  given_by_user_id: {
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
  spent_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  reconciled_amount: {
    type: DataTypes.VIRTUAL,
    get() {
      const returned = parseFloat(this.getDataValue('returned_amount')) || 0;
      const spent = parseFloat(this.getDataValue('spent_amount')) || 0;
      return returned + spent;
    }
  },
  unaccounted_amount: {
    type: DataTypes.VIRTUAL,
    get() {
      const total = parseFloat(this.getDataValue('amount')) || 0;
      const reconciled = this.reconciled_amount;
      return Math.max(0, total - reconciled);
    }
  },
  status: {
    type: DataTypes.ENUM('OPEN', 'PARTIAL', 'RECONCILED', 'CLOSED'),
    defaultValue: 'OPEN'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'custodies',
  timestamps: true,
  underscored: true
});

module.exports = Custody;
