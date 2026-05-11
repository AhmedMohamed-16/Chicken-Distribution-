const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');


const PartnerReinvestment = sequelize.define('PartnerReinvestment', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
    partner_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: {
      min: 0.01
    }
  },
  reinvest_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
    processed_by_user_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'partner_reinvestments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});



module.exports = PartnerReinvestment;
