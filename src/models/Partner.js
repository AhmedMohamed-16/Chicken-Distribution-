const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Partner = sequelize.define('Partner', {
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
  investment_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  investment_percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    }
  },
  is_vehicle_partner: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'partners',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = Partner;