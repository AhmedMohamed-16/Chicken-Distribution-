'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BuyerDebtPayment = sequelize.define('BuyerDebtPayment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  buyer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'buyers',
      key: 'id'
    },
    validate: {
      notNull: {
        msg: 'Buyer ID is required'
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
    comment: 'Always positive — direction is determined by payment_direction field'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NEW FIELD — mirrors FarmDebtPayment.payment_direction exactly.
  //
  //   FROM_BUYER  →  Buyer pays us      → balanceImpact = -amount
  //                  (reduces what they owe / reduces our credit to them)
  //
  //   TO_BUYER    →  We pay the buyer   → balanceImpact = +amount
  //                  (increases what they owe in the system sense, i.e.
  //                   we are spending money so their credit is reduced —
  //                   or if balance was positive this is rare, but allowed)
  //
  // The balance impact logic is the same as Farm:
  //   FROM_BUYER reduces the buyer's balance  (negative delta)
  //   TO_BUYER   increases the buyer's balance (positive delta — rarely used
  //              but needed for completeness / refunds / corrections)
  // ─────────────────────────────────────────────────────────────────────────
  payment_direction: {
    type: DataTypes.ENUM('FROM_BUYER', 'TO_BUYER'),
    allowNull: false,
    defaultValue: 'FROM_BUYER',
    validate: {
      isIn: {
        args: [['FROM_BUYER', 'TO_BUYER']],
        msg: 'Payment direction must be FROM_BUYER or TO_BUYER'
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
  tableName: 'buyer_debt_payments',
  timestamps: true,
  createdAt: 'payment_date',
  updatedAt: false,
  underscored: true,
  indexes: [
    {
      name: 'idx_buyer_payments_direction',
      fields: ['buyer_id', 'payment_direction', 'payment_date']
    },
    {
      name: 'idx_buyer_payments_operation',
      fields: ['daily_operation_id']
    }
  ],

  // ─── COMPUTED GETTERS ────────────────────────────────────────────────────
  // Mirrors FarmDebtPayment getters exactly (FROM_FARM → FROM_BUYER, etc.)

  getterMethods: {
    /**
     * Signed amount based on direction.
     *   FROM_BUYER → positive  (money coming to us)
     *   TO_BUYER   → negative  (money going to buyer)
     * @returns {number}
     */
    signedAmount() {
      const amt = parseFloat(this.getDataValue('amount')) || 0;
      return this.getDataValue('payment_direction') === 'FROM_BUYER' ? amt : -amt;
    },

    /**
     * How this payment changes the buyer's current_balance.
     *
     *   FROM_BUYER → -amount  (buyer paid us → their balance goes down)
     *   TO_BUYER   → +amount  (we paid buyer → their balance goes up,
     *                          i.e. they "owe" us less or we owe them more)
     *
     * Pass this directly to buyer.updateBalance(payment.balanceImpact, t).
     * @returns {number}
     */
    balanceImpact() {
      const amt = parseFloat(this.getDataValue('amount')) || 0;
      return this.getDataValue('payment_direction') === 'FROM_BUYER' ? -amt : amt;
    },

    /**
     * Human-readable description of the payment
     * @returns {string}
     */
    displayDescription() {
      const amt = parseFloat(this.getDataValue('amount')) || 0;
      const dir = this.getDataValue('payment_direction');
      if (dir === 'FROM_BUYER') {
        return `Received ${amt.toFixed(2)} EGP from buyer`;
      }
      return `Paid ${amt.toFixed(2)} EGP to buyer`;
    }
  }
});

// ─── CLASS METHODS ─────────────────────────────────────────────────────────

/**
 * Get payment history for a buyer
 * @param {number} buyerId
 * @param {object} options  { limit, offset, startDate, endDate }
 * @returns {Promise<Array>}
 */
BuyerDebtPayment.getPaymentHistory = async function (buyerId, options = {}) {
  const { limit = 50, offset = 0, startDate = null, endDate = null } = options;

  const where = { buyer_id: buyerId };

  if (startDate || endDate) {
    where.payment_date = {};
    if (startDate) where.payment_date[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate)   where.payment_date[sequelize.Sequelize.Op.lte] = endDate;
  }

  return await this.findAll({
    where,
    include: [
      {
        model: require('./Buyer'),
        as: 'buyer',
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
 * Get payment summary for a buyer
 * @param {number} buyerId
 * @param {object} dateRange  { startDate, endDate }
 * @returns {Promise<object>}
 */
BuyerDebtPayment.getPaymentSummary = async function (buyerId, dateRange = {}) {
  const { startDate = null, endDate = null } = dateRange;

  const where = { buyer_id: buyerId };

  if (startDate || endDate) {
    where.payment_date = {};
    if (startDate) where.payment_date[sequelize.Sequelize.Op.gte] = startDate;
    if (endDate)   where.payment_date[sequelize.Sequelize.Op.lte] = endDate;
  }

  const result = await this.findAll({
    where,
    attributes: [
      [sequelize.fn('SUM',
        sequelize.literal("CASE WHEN payment_direction = 'FROM_BUYER' THEN amount ELSE 0 END")
      ), 'total_received'],
      [sequelize.fn('SUM',
        sequelize.literal("CASE WHEN payment_direction = 'TO_BUYER' THEN amount ELSE 0 END")
      ), 'total_paid_out'],
      [sequelize.fn('COUNT',
        sequelize.literal("CASE WHEN payment_direction = 'FROM_BUYER' THEN 1 END")
      ), 'received_count'],
      [sequelize.fn('COUNT',
        sequelize.literal("CASE WHEN payment_direction = 'TO_BUYER' THEN 1 END")
      ), 'paid_out_count']
    ],
    raw: true
  });

  const data = result[0];
  const totalReceived  = parseFloat(data.total_received)   || 0;
  const totalPaidOut   = parseFloat(data.total_paid_out)   || 0;

  return {
    total_received:     totalReceived,
    total_paid_out:     totalPaidOut,
    net_received:       totalReceived - totalPaidOut,
    received_count:     parseInt(data.received_count)  || 0,
    paid_out_count:     parseInt(data.paid_out_count)  || 0,
    total_transactions: (parseInt(data.received_count) || 0) + (parseInt(data.paid_out_count) || 0)
  };
};

module.exports = BuyerDebtPayment;