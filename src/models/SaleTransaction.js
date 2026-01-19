const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SaleTransaction = sequelize.define('SaleTransaction', {
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
  buyer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'buyers',
      key: 'id'
    }
  },
  chicken_type_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'chicken_types',
      key: 'id'
    }
  },
  sequence_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  loaded_cages_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  empty_cages_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  cage_count: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  net_chicken_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  price_per_kg: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false
  },
  total_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  paid_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  remaining_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  old_debt_paid: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  }
}, {
  tableName: 'sale_transactions',
  timestamps: true,
  createdAt: 'transaction_time',
  updatedAt: false
});
module.exports = SaleTransaction;