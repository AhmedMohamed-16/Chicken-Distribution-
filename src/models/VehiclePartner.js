const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const VehiclePartner = sequelize.define('VehiclePartner', {
  vehicle_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    references: {
      model: 'vehicles',
      key: 'id'
    }
  },
  partner_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    references: {
      model: 'partners',
      key: 'id'
    }
  },
  share_percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    }
  }
}, {
  tableName: 'vehicle_partners',
  timestamps: false
});
module.exports = VehiclePartner;