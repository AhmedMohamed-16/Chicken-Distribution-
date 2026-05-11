const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DailyCost = sequelize.define('DailyCost', {
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
  },
  vehicle_id: {  // ✅ NEW FIELD
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'vehicles',
      key: 'id'
    }
  },
  cost_category_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'cost_categories',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  paid_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  remaining_amount: {
    type: DataTypes.VIRTUAL,
    get() {
      const amount = parseFloat(this.getDataValue('amount')) || 0;
      const paid = parseFloat(this.getDataValue('paid_amount')) || 0;
      return Math.max(0, amount - paid);
    }
  },
  is_paid: {
    type: DataTypes.VIRTUAL,
    get() {
      const amount = parseFloat(this.getDataValue('amount')) || 0;
      const paid = parseFloat(this.getDataValue('paid_amount')) || 0;
      return paid >= amount;
    }
  },
  paid_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  paid_by_person_type: {
    type: DataTypes.ENUM( 'EMPLOYEE', 'PARTNER', 'EXTERNAL'),
    allowNull: true
  },
  paid_by_person_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  // received_by_person_id: {
  //   type: DataTypes.INTEGER,
  //   allowNull: true,
  //   references: {
  //     model: 'users',
  //     key: 'id'
  //   }
  // },
  payment_method: {
    type: DataTypes.ENUM('CASH', 'INSTAPAY', 'BANK', 'VODAFONE_CASH'),
    defaultValue: 'CASH'
  },
  payment_source_type: {
    type: DataTypes.ENUM('SAFE', 'CUSTODY'),
    allowNull: false,
    defaultValue: 'SAFE'
  },
  payment_source_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  vehicle_operation_id: {
  type: DataTypes.INTEGER,
  allowNull: true,
  references: {
    model: 'vehicle_operations',
    key: 'id'
  }
}

}, {
  tableName: 'daily_costs',
  timestamps: true,
  createdAt: 'recorded_at',
  updatedAt: false,
  underscored: true,
  indexes: [
    { fields: ['daily_operation_id'] },
    { fields: ['vehicle_id', 'daily_operation_id'] },  // ✅ NEW INDEX
    { fields: ['payment_source_type', 'payment_source_id'] }
  ],
  getterMethods: {
    balanceImpact() {
      // Unpaid cost increases our debt to the category
      const amt = parseFloat(this.getDataValue('amount')) || 0;
      const paid = parseFloat(this.getDataValue('paid_amount')) || 0;
      return amt - paid;
    }
  }
});

module.exports = DailyCost;