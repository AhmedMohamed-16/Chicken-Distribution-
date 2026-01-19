const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CostCategory = sequelize.define('CostCategory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_vehicle_cost: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'cost_categories',
  timestamps: false
});

module.exports = CostCategory;