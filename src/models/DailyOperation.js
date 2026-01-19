const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DailyOperation = sequelize.define('DailyOperation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  operation_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    unique: true
  },
  vehicle_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'vehicles',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('OPEN', 'CLOSED'),
    defaultValue: 'OPEN'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  closed_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'daily_operations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = DailyOperation;