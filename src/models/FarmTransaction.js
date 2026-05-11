const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FarmTransaction = sequelize.define('FarmTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  daily_operation_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'daily_operations',
      key: 'id'
    }
  },  vehicle_id: {  // ✅ NEW FIELD
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'vehicles',
      key: 'id'
    }
  },
  farm_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'farms',
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
  sequence_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  empty_vehicle_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  loaded_vehicle_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  cage_count: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  cage_weight_per_unit: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false
  },
  net_chicken_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  price_per_kg: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false
  },
  total_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  paid_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  remaining_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  discount_amount: {
  type: DataTypes.DECIMAL(12, 2),
  defaultValue: 0,
  allowNull: false
}
  ,vehicle_operation_id: {
  type: DataTypes.INTEGER,
  allowNull: false,
  references: {
    model: 'vehicle_operations',
    key: 'id'
  }, 
},  used_credit: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    allowNull: false
  },
  // received_by_person_id: {
  //   type: DataTypes.INTEGER,
  //   allowNull: true,
  //   references: {
  //     model: 'users',
  //     key: 'id'
  //   }
  // },
  paid_by_person_type: {
    type: DataTypes.ENUM( 'EMPLOYEE', 'PARTNER'),
    allowNull: true
  },
  paid_by_person_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  payment_method: {
    type: DataTypes.ENUM('CASH', 'INSTAPAY', 'BANK', 'VODAFONE_CASH'),
    defaultValue: 'CASH'
  },
  payment_source_type: {
    type: DataTypes.ENUM('SAFE', 'CUSTODY'),
    defaultValue: 'SAFE'
  },
  payment_source_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  }

}, {
  tableName: 'farm_transactions',
  timestamps: true,
  createdAt: 'transaction_time',
  updatedAt: false,
  underscored: true,
  indexes: [
    { fields: ['daily_operation_id'] },
    { fields: ['vehicle_id', 'daily_operation_id'] }  // ✅ NEW INDEX
  ],
  getterMethods: {
    balanceImpact() {
      // Purchase increases our debt to the farm (positive impact on Farm's balance)
      // Net impact = total_amount - paid_amount
      const totalAmt = parseFloat(this.getDataValue('total_amount')) || 0;
      const paidAmt = parseFloat(this.getDataValue('paid_amount')) || 0;
      return totalAmt - paidAmt;
    }
  }
});
module.exports = FarmTransaction;