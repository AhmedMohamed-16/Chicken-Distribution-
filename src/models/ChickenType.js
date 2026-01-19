const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const ChickenType = sequelize.define('ChickenType', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'chicken_types',
  timestamps: false
});
module.exports = ChickenType;