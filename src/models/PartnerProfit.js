const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PartnerProfit = sequelize.define('PartnerProfit', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  profit_distribution_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'profit_distributions',
      key: 'id'
    }
  },
  partner_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'partners',
      key: 'id'
    }
  },
  base_profit_share: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  vehicle_cost_share: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  final_profit: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  }
}, {
  tableName: 'partner_profits',
  timestamps: false
});
module.exports = PartnerProfit;