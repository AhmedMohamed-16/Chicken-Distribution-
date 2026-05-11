const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FarmDebtPayment = sequelize.define('FarmDebtPayment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  farm_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'farms',
      key: 'id'
    },
    validate: {
      notNull: {
        msg: 'Farm ID is required'
      }
    }
  },
  daily_operation_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'daily_operations',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: {
      notNull: {
        msg: 'Payment amount is required'
      },
      min: {
        args: [0.01],
        msg: 'Payment amount must be greater than 0'
      },
      isDecimal: {
        msg: 'Payment amount must be a valid number'
      }
    },
    comment: 'Always positive - direction determined by payment_direction field'
  },
  payment_direction: {
    type: DataTypes.ENUM('FROM_FARM', 'TO_FARM'),
    allowNull: false,
    defaultValue: 'FROM_FARM',
    validate: {
      isIn: {
        args: [['FROM_FARM', 'TO_FARM']],
        msg: 'Payment direction must be FROM_FARM or TO_FARM'
      }
    }
    // Avoid setting a comment to prevent migration SQL bug that combines COMMENT with USING
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  payment_method: {
    type: DataTypes.ENUM('CASH', 'INSTAPAY', 'BANK', 'VODAFONE_CASH'),
    defaultValue: 'CASH',
    allowNull: true
  },
  payment_source_type: {
    type: DataTypes.ENUM('SAFE', 'CUSTODY'),
    allowNull: false,
    defaultValue: 'SAFE'
  },
  payment_source_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'farm_debt_payments',
  timestamps: true,
createdAt: 'payment_date',
updatedAt: false,
underscored: true,
  indexes: [
    {
      name: 'idx_farm_payments_direction',
      fields: ['farm_id', 'payment_direction', 'payment_date']
    },
    {
      name: 'idx_farm_payments_operation',
      fields: ['daily_operation_id']
    },
    {
      name: 'idx_farm_payments_source',
      fields: ['payment_source_type', 'payment_source_id']
    }
  ],
  
  // ✅ COMPUTED GETTERS
  getterMethods: {
    /**
     * Get signed amount based on direction
     * Positive = money coming to us (FROM_FARM)
     * Negative = money going to farm (TO_FARM)
     * @returns {number}
     */
    signedAmount() {
      const amt = parseFloat(this.getDataValue('amount')) || 0;
      return this.getDataValue('payment_direction') === 'FROM_FARM' ? amt : -amt;
    },
    
    /**
     * Get balance impact (how this payment affects farm's balance)
     * FROM_FARM: Negative impact (reduces their debt to us)
     * TO_FARM: Positive impact (increases their debt to us / reduces our debt to them)
     * @returns {number}
     */
    balanceImpact() {
      const amt = parseFloat(this.getDataValue('amount')) || 0;
      return this.getDataValue('payment_direction') === 'FROM_FARM' ? -amt : amt;
    },
    
    /**
     * Get human-readable description
     * @returns {string}
     */
    displayDescription() {
      const amt = parseFloat(this.getDataValue('amount')) || 0;
      const dir = this.getDataValue('payment_direction');
      
      if (dir === 'FROM_FARM') {
        return `Received ${amt.toFixed(2)} EGP from farm`;
      } else {
        return `Paid ${amt.toFixed(2)} EGP to farm`;
      }
    }
  }
});

/**
 * Instance Methods
 */

// /**
//  * Process payment and update farm balance
//  * @param {object} transaction - Sequelize transaction
//  * @returns {Promise<object>} Updated farm and payment info
//  */
// FarmDebtPayment.prototype.processPayment = async function(transaction = null) {
//   const Farm = require('./Farm');
//   const farm = await Farm.findByPk(this.farm_id, { transaction });
  
//   if (!farm) {
//     throw new Error(`Farm with ID ${this.farm_id} not found`);
//   }
  
//   // Calculate balance change
//   // FROM_FARM: Farm pays us → reduces their debt (negative change)
//   // TO_FARM: We pay farm → increases their debt (positive change)
//   const balanceChange = this.balanceImpact;
  
//   // Update farm balance
//   const balanceInfo = await farm.updateBalance(balanceChange, transaction);
  
//   return {
//     payment: this.toJSON(),
//     balance_info: balanceInfo
//   };
// };

/**
 * Class Methods
 */

/**
 * Get payment history for a farm
 * @param {number} farmId
 * @param {object} options - Query options (limit, offset, order)
 * @returns {Promise<Array>}
 */
FarmDebtPayment.getPaymentHistory = async function(farmId, options = {}) {
  const { limit = 50, offset = 0, startDate = null, endDate = null } = options;
  
  const where = { farm_id: farmId };
  
  if (startDate || endDate) {
    where.payment_date = {};
    if (startDate) where.payment_date[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.payment_date[sequelize.Sequelize.Op.lte] = endDate;
  }
  
  return await this.findAll({
    where,
    include: [
      {
        model: require('./Farm'),
        as: 'farm',
        attributes: ['id', 'name']
      },
      {
        model: require('./DailyOperation'),
        as: 'operation',
        attributes: ['id', 'operation_date'],
        required: false
      }
    ],
    order: [['payment_date', 'DESC'], ['id', 'DESC']],
    limit,
    offset
  });
};

/**
 * Get payment summary for a farm
 * @param {number} farmId
 * @param {object} dateRange - { startDate, endDate }
 * @returns {Promise<object>}
 */
FarmDebtPayment.getPaymentSummary = async function(farmId, dateRange = {}) {
  const { startDate = null, endDate = null } = dateRange;
  
  const where = { farm_id: farmId };
  
  if (startDate || endDate) {
    where.payment_date = {};
    if (startDate) where.payment_date[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.payment_date[sequelize.Sequelize.Op.lte] = endDate;
  }
  
  const result = await this.findAll({
    where,
    attributes: [
      [sequelize.fn('SUM', 
        sequelize.literal("CASE WHEN payment_direction = 'FROM_FARM' THEN amount ELSE 0 END")
      ), 'total_received'],
      [sequelize.fn('SUM', 
        sequelize.literal("CASE WHEN payment_direction = 'TO_FARM' THEN amount ELSE 0 END")
      ), 'total_paid'],
      [sequelize.fn('COUNT', 
        sequelize.literal("CASE WHEN payment_direction = 'FROM_FARM' THEN 1 END")
      ), 'received_count'],
      [sequelize.fn('COUNT', 
        sequelize.literal("CASE WHEN payment_direction = 'TO_FARM' THEN 1 END")
      ), 'paid_count']
    ],
    raw: true
  });
  
  const data = result[0];
  
  return {
    total_received: parseFloat(data.total_received) || 0,
    total_paid: parseFloat(data.total_paid) || 0,
    net_received: (parseFloat(data.total_received) || 0) - (parseFloat(data.total_paid) || 0),
    received_count: parseInt(data.received_count) || 0,
    paid_count: parseInt(data.paid_count) || 0,
    total_transactions: (parseInt(data.received_count) || 0) + (parseInt(data.paid_count) || 0)
  };
};

module.exports = FarmDebtPayment;