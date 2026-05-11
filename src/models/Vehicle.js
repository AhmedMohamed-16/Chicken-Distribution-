const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Vehicle = sequelize.define('Vehicle', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  purchase_price: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  empty_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  plate_number: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  payment_source: {
    type: DataTypes.ENUM('safe', 'partners'),
    allowNull: false,
    defaultValue: 'partners'
  },
  safe_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'safes',
      key: 'id'
    }
  }
}, {
  tableName: 'vehicles',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});
module.exports = Vehicle;