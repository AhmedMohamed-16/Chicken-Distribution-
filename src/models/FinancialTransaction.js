// src/models/FinancialTransaction.js
const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { formatToDateString } = require('../utils/formatDate');

const FinancialTransaction = sequelize.define('FinancialTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  transaction_type: {
    type: DataTypes.ENUM(
      'SALE',
      'PAID_DEPT',
      'PURCHASE',
      'RECEIVE_DEPT',
      'COST',
      'LOSS',
      'EXPENSE',
      'ADVANCE',
      'ADVANCE_RETURN',
      'SALARY',
      'CUSTODY',
      'CUSTODY_RETURN',
      'SAFE_TRANSFER',
      'PARTNER_WITHDRAWAL',
      'OTHER',
      'CUSTODY_SETTLEMENT',
      'PARTNER_REINVESTMENT',
      'PARTNER_INVESTMENT',
      'OPENING_BALANCE',
      'BALANCE_ADJUSTMENT'
    ),
    allowNull: false
  },
  direction: {
    type: DataTypes.ENUM('IN', 'OUT'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    
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
  reference_type: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  reference_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  daily_operation_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'daily_operations',
      key: 'id'
    }
  },
  performed_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  received_by_person_type: {
    type: DataTypes.ENUM('EMPLOYEE', 'PARTNER'),
    allowNull: true
  },
  received_by_person_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  paid_by_person_type: {
    type: DataTypes.ENUM('EMPLOYEE', 'PARTNER'),
    allowNull: true
  },
  paid_by_person_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  payment_method: {
    type: DataTypes.ENUM('CASH', 'INSTAPAY', 'BANK', 'VODAFONE_CASH'),
    defaultValue: 'CASH'
  }
}, {
  tableName: 'financial_transactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// ─── Class Methods ───────────────────────────────────────────────────────────

/**
 * Returns sum of IN and OUT amounts grouped by transaction_type for a given date.
 * @param {string} date - The date to summarize (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
FinancialTransaction.getDailySummary = async function (date) {
  const dateStr = formatToDateString(date);
  const startOfDay = `${dateStr} 00:00:00`;
  const endOfDay = `${dateStr} 23:59:59.999999`;
  
  const results = await this.findAll({
    where: { 
      created_at: {
        [Op.between]: [startOfDay, endOfDay]
      }
    },
    attributes: [
      'direction',
      'transaction_type',
      [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
    ],
    group: ['direction', 'transaction_type'],
    raw: true
  });

  const summary = {
    IN: {},
    OUT: {},
    total_in: 0,
    total_out: 0,
    net_balance: 0,
    total_sales: 0,
    total_purchases: 0,
    total_costs: 0,
    total_losses: 0
  };

  // 1. Calculate actual cash flow from financial transactions
  results.forEach(row => {
    const amount = parseFloat(row.total_amount || 0);
    summary[row.direction][row.transaction_type] = amount;
    
    if (row.direction === 'IN') {
      summary.total_in += amount;
    } else {
      summary.total_out += amount;
    }
  });

  // 2. Fetch accrual totals from ProfitDistribution (synchronize with getOperation logic)
  try {
    const { ProfitDistribution, DailyOperation } = this.sequelize.models;
    const distributions = await ProfitDistribution.findAll({
      include: [{
        model: DailyOperation,
        as: 'operation',
        where: { operation_date: dateStr }
      }],
      raw: true
    });

    distributions.forEach(d => {
      // Use the same mapping as used in the frontend/operation controller
      summary.total_sales += parseFloat(d.total_revenue || 0);
      summary.total_purchases += parseFloat(d.total_purchases || 0);
      summary.total_costs += parseFloat(d.total_costs || 0);
      summary.total_losses += parseFloat(d.total_losses || 0);
    });
  } catch (err) {
    console.error('Error fetching ProfitDistribution for daily summary:', err.message);
    // Non-fatal: summary will just have 0 for these fields
  }

  summary.net_balance = summary.total_in - summary.total_out;
  return summary;
};

/**
 * Returns the running balance for a given payment source (SAFE or CUSTODY).
 * @param {string} paymentSourceType - 'SAFE' | 'CUSTODY'
 * @param {number} paymentSourceId - Safe.id | Custody.id
 * @returns {Promise<number>}
 */
FinancialTransaction.getPaymentSourceSummary = async function (paymentSourceType, paymentSourceId) {
  const result = await this.findAll({
    where: { 
      payment_source_id: paymentSourceId,
      payment_source_type: paymentSourceType
    },
    attributes: [
      'direction',
      [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
    ],
    group: ['direction'],
    raw: true
  });

  let balance = 0;
  result.forEach(row => {
    const amount = parseFloat(row.total_amount || 0);
    if (row.direction === 'IN') {
      balance += amount;
    } else if (row.direction === 'OUT') {
      balance -= amount;
    }
  });

  return balance;
};

/**
 * Returns the running balance for a given safe (backward compatibility wrapper).
 * @param {number} safeId - The safe ID
 * @returns {Promise<number>}
 */
FinancialTransaction.getSafeSummary = async function (safeId) {
  return this.getPaymentSourceSummary('SAFE', safeId);
};

module.exports = FinancialTransaction;

