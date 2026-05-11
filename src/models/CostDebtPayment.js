const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CostDebtPayment = sequelize.define('CostDebtPayment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  cost_category_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'cost_categories',
      key: 'id'
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
      min: 0.01
    }
  },
  payment_direction: {
    type: DataTypes.ENUM('FROM_CATEGORY', 'TO_CATEGORY'),
    allowNull: false,
    defaultValue: 'TO_CATEGORY'
  },
  payment_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },

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
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'cost_debt_payments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true,
  indexes: [
    { fields: ['cost_category_id'] },
    { fields: ['daily_operation_id'] },
    { fields: ['payment_date'] },
    { fields: ['cost_category_id', 'payment_direction'] },
    { fields: ['payment_source_type', 'payment_source_id'] }
  ],
  
  // ✅ COMPUTED GETTERS
  getterMethods: {
    /**
     * Get signed amount based on direction
     * Positive = money coming to us (FROM_CATEGORY)
     * Negative = money going to category (TO_CATEGORY)
     * @returns {number}
     */
    signedAmount() {
      const amt = parseFloat(this.getDataValue('amount')) || 0;
      return this.getDataValue('payment_direction') === 'FROM_CATEGORY' ? amt : -amt;
    },
    
    /**
     * Get balance impact 
     * FROM_CATEGORY: Negative impact (reduces their debt to us)
     * TO_CATEGORY: Positive impact (increases their debt to us / reduces our debt to them)
     * @returns {number}
     */
    balanceImpact() {
      const amt = parseFloat(this.getDataValue('amount')) || 0;
      return this.getDataValue('payment_direction') === 'FROM_CATEGORY' ? -amt : amt;
    },
    
    displayDescription() {
      const amt = parseFloat(this.getDataValue('amount')) || 0;
      const dir = this.getDataValue('payment_direction');
      
      if (dir === 'FROM_CATEGORY') {
        return `Received ${amt.toFixed(2)} EGP from category`;
      } else {
        return `Paid ${amt.toFixed(2)} EGP to category`;
      }
    }
  }
});

/**
 * Class Methods
 */

CostDebtPayment.getPaymentHistory = async function(categoryId, options = {}) {
  const { limit = 50, offset = 0, startDate = null, endDate = null } = options;
  
  const where = { cost_category_id: categoryId };
  
  if (startDate || endDate) {
    where.payment_date = {};
    if (startDate) where.payment_date[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.payment_date[sequelize.Sequelize.Op.lte] = endDate;
  }
  
  return await this.findAll({
    where,
    include: [
      {
        model: require('./CostCategory'),
        as: 'category',
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

CostDebtPayment.getPaymentSummary = async function(categoryId, dateRange = {}) {
  const { startDate = null, endDate = null } = dateRange;
  
  const where = { cost_category_id: categoryId };
  
  if (startDate || endDate) {
    where.payment_date = {};
    if (startDate) where.payment_date[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate) where.payment_date[sequelize.Sequelize.Op.lte] = endDate;
  }
  
  const result = await this.findAll({
    where,
    attributes: [
      [sequelize.fn('SUM', 
        sequelize.literal("CASE WHEN payment_direction = 'FROM_CATEGORY' THEN amount ELSE 0 END")
      ), 'total_received'],
      [sequelize.fn('SUM', 
        sequelize.literal("CASE WHEN payment_direction = 'TO_CATEGORY' THEN amount ELSE 0 END")
      ), 'total_paid'],
      [sequelize.fn('COUNT', 
        sequelize.literal("CASE WHEN payment_direction = 'FROM_CATEGORY' THEN 1 END")
      ), 'received_count'],
      [sequelize.fn('COUNT', 
        sequelize.literal("CASE WHEN payment_direction = 'TO_CATEGORY' THEN 1 END")
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

module.exports = CostDebtPayment;