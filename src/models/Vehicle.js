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
  }
}, {
  tableName: 'vehicles',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});
module.exports = Vehicle;