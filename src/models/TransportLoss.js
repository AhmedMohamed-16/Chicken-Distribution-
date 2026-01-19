const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TransportLoss = sequelize.define('TransportLoss', {
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
  chicken_type_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'chicken_types',
      key: 'id'
    }
  },
  dead_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  price_per_kg: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false
  },
  loss_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  location: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'transport_losses',
  timestamps: true,
  createdAt: 'recorded_at',
  updatedAt: false
});

module.exports = TransportLoss;