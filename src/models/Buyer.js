const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Buyer = sequelize.define('Buyer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  total_debt: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  }
}, {
  tableName: 'buyers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});
module.exports = Buyer;