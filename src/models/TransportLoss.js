const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TransportLoss = sequelize.define('TransportLoss', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  daily_operation_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'daily_operations',
      key: 'id'
    }
  },  vehicle_id: {  // ✅ NEW FIELD
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'vehicles',
      key: 'id'
    }
  },
  chicken_type_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'chicken_types',
      key: 'id'
    }
  },
  dead_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  price_per_kg: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false
  },
  loss_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  location: {
    type: DataTypes.TEXT,
    allowNull: true
  },vehicle_operation_id: {
  type: DataTypes.INTEGER,
  allowNull: true,
  references: {
    model: 'vehicle_operations',
    key: 'id'
  }
},
  farm_id: {  // ✅ NEW OPTIONAL FIELD
    type: DataTypes.INTEGER,
    allowNull: true,  // Can be NULL if loss is not attributed to specific farm
    references: {
      model: 'farms',
      key: 'id'
    },
    comment: 'If set, this farm is responsible for the loss and balance will be adjusted'
  },
  notes: {  // ✅ OPTIONAL NOTES
    type: DataTypes.TEXT,
    allowNull: true
  },
  source: {
    type: DataTypes.ENUM('TRANSPORT', 'SALE', 'GENERAL'),
    defaultValue: 'TRANSPORT'
  }
}, {
  tableName: 'transport_losses',
  timestamps: true,
  createdAt: 'recorded_at',
  updatedAt: false,
  underscored: true,
  indexes: [
    { fields: ['daily_operation_id'] },
        { fields: ['farm_id'] },  // ✅ INDEX FOR FARM LOOKUP
    { fields: ['vehicle_id', 'daily_operation_id'] }  // ✅ NEW INDEX
  ]
});
// ✅ COMPUTED GETTERS
TransportLoss.prototype.getDisplayInfo = function() {
  return {
    id: this.id,
    dead_weight: parseFloat(this.dead_weight),
    loss_amount: parseFloat(this.loss_amount),
    attributed_to_farm: this.farm_id ? true : false,
    farm_responsible: this.farm_id || null,
    balance_adjusted: this.farm_balance_adjusted
  };
};


module.exports = TransportLoss;