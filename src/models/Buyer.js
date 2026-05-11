'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Buyer = sequelize.define('Buyer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Buyer name is required'
      }
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  // ─────────────────────────────────────────────────────────────────────────
  // REPLACED: total_debt  →  current_balance
  //
  //   current_balance > 0  →  Buyer owes us       (RECEIVABLE)
  //   current_balance < 0  →  We owe buyer         (CREDIT / PAYABLE)
  //   current_balance = 0  →  Settled
  //
  // The column is renamed in the DB via migration (alter: true handles this
  // automatically when the model is synced).
  // ─────────────────────────────────────────────────────────────────────────
  current_balance: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    allowNull: false,
    comment: 'Positive = Buyer owes us (RECEIVABLE), Negative = We owe buyer (CREDIT), Zero = Settled'
  }

}, {
  tableName: 'buyers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true,
  indexes: [
    {
      name: 'idx_buyers_current_balance',
      fields: ['current_balance']
    }
  ],

  // ─── COMPUTED GETTERS ────────────────────────────────────────────────────

  getterMethods: {
    /**
     * Balance type: RECEIVABLE | CREDIT | SETTLED
     * @returns {string}
     */
    balanceType() {
      const balance = parseFloat(this.getDataValue('current_balance')) || 0;
      if (balance > 0) return 'RECEIVABLE';
      if (balance < 0) return 'CREDIT';
      return 'SETTLED';
    },

    /**
     * True when buyer owes us money (positive balance)
     * @returns {boolean}
     */
    isDebtor() {
      return parseFloat(this.getDataValue('current_balance')) > 0;
    },

    /**
     * True when we owe the buyer money (negative balance / credit)
     * @returns {boolean}
     */
    isCreditor() {
      return parseFloat(this.getDataValue('current_balance')) < 0;
    },

    /**
     * Absolute value of balance — always positive
     * @returns {number}
     */
    absoluteBalance() {
      return Math.abs(parseFloat(this.getDataValue('current_balance')) || 0);
    },

    /**
     * Human-readable balance description
     * @returns {string}
     */
    displayBalance() {
      const balance = parseFloat(this.getDataValue('current_balance')) || 0;
      const abs = Math.abs(balance).toFixed(2);
      if (balance > 0) return `Buyer owes us: ${abs} EGP`;
      if (balance < 0) return `We owe buyer: ${abs} EGP`;
      return 'Settled (0.00 EGP)';
    }
  }
});

// ─── INSTANCE METHODS ──────────────────────────────────────────────────────

/**
 * Update buyer balance and return a detailed change object.
 *
 * Mirrors Farm.prototype.updateBalance exactly.
 *
 * @param {number} balanceChange  Signed delta. Positive = buyer owes more.
 *                                Negative = debt reduced / credit created.
 * @param {object|null} transaction  Active Sequelize transaction (or null)
 * @returns {Promise<object>}
 */
Buyer.prototype.updateBalance = async function (balanceChange, transaction = null) {
  const previousBalance = parseFloat(this.current_balance) || 0;
  const newBalance = previousBalance + balanceChange;   // NO Math.max — allow negative

  await this.update({ current_balance: newBalance }, { transaction });

  const previousType = previousBalance > 0 ? 'RECEIVABLE' : (previousBalance < 0 ? 'CREDIT' : 'SETTLED');
  const newType      = newBalance      > 0 ? 'RECEIVABLE' : (newBalance      < 0 ? 'CREDIT' : 'SETTLED');
  const directionChanged = previousType !== newType &&
                           previousType !== 'SETTLED' &&
                           newType      !== 'SETTLED';

  return {
    buyer_id:         this.id,
    buyer_name:       this.name,
    previous_balance: previousBalance,
    new_balance:      newBalance,
    change_amount:    balanceChange,
    direction_changed: directionChanged,
    previous_type:    previousType,
    new_type:         newType,
    absolute_balance: Math.abs(newBalance),
    display_balance:  newBalance > 0
      ? `${newBalance.toFixed(2)} جنيه (لينا عليهم)`
      : newBalance < 0
        ? `${Math.abs(newBalance).toFixed(2)} جنيه (ليهم علينا)`
        : 'متساوي 0.00 جنيه'
  };
};

// ─── CLASS METHODS ─────────────────────────────────────────────────────────

/**
 * All buyers with a non-zero balance (receivables + credits)
 * @returns {Promise<Array>}
 */
Buyer.getActiveBalances = async function () {
  return await this.findAll({
    where: {
      current_balance: {
        [sequelize.Sequelize.Op.ne]: 0
      }
    },
    order: [['current_balance', 'DESC']]
  });
};

/**
 * Buyers who owe us money (positive balance = receivables)
 * @returns {Promise<Array>}
 */
Buyer.getReceivables = async function () {
  return await this.findAll({
    where: {
      current_balance: {
        [sequelize.Sequelize.Op.gt]: 0
      }
    },
    order: [['current_balance', 'DESC']]
  });
};

/**
 * Buyers we owe money to (negative balance = credits / payables)
 * @returns {Promise<Array>}
 */
Buyer.getPayables = async function () {
  return await this.findAll({
    where: {
      current_balance: {
        [sequelize.Sequelize.Op.lt]: 0
      }
    },
    order: [['current_balance', 'ASC']]  // Most negative first
  });
};

/**
 * Aggregate net position across all buyers.
 * Mirrors Farm.getNetPosition.
 * @returns {Promise<object>}
 */
Buyer.getNetPosition = async function () {
  const result = await this.findAll({
    attributes: [
      [sequelize.fn('SUM',
        sequelize.literal('CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END')
      ), 'total_receivables'],
      [sequelize.fn('SUM',
        sequelize.literal('CASE WHEN current_balance < 0 THEN ABS(current_balance) ELSE 0 END')
      ), 'total_credits'],
      [sequelize.fn('SUM', sequelize.col('current_balance')), 'net_position'],
      [sequelize.fn('COUNT',
        sequelize.literal('CASE WHEN current_balance > 0 THEN 1 END')
      ), 'receivables_count'],
      [sequelize.fn('COUNT',
        sequelize.literal('CASE WHEN current_balance < 0 THEN 1 END')
      ), 'credits_count']
    ],
    raw: true
  });

  const data = result[0];
  return {
    total_receivables: parseFloat(data.total_receivables) || 0,
    total_credits:     parseFloat(data.total_credits)     || 0,
    net_position:      parseFloat(data.net_position)      || 0,
    receivables_count: parseInt(data.receivables_count)   || 0,
    credits_count:     parseInt(data.credits_count)        || 0,
    position_type: (parseFloat(data.net_position) || 0) > 0 ? 'NET_RECEIVABLE'
                 : (parseFloat(data.net_position) || 0) < 0 ? 'NET_CREDIT'
                 : 'BALANCED'
  };
};

/**
 * @deprecated  Use getReceivables() or getNetPosition() instead.
 * Kept temporarily so old callers don't crash before they are updated.
 */
Buyer.getBuyersWithDebt = async function () {
  console.warn('[Buyer] getBuyersWithDebt() is deprecated — use getReceivables()');
  return await this.getReceivables();
};

/**
 * @deprecated  Use getNetPosition() instead.
 */
Buyer.getReceivablesSummary = async function () {
  console.warn('[Buyer] getReceivablesSummary() is deprecated — use getNetPosition()');
  const pos = await this.getNetPosition();
  return {
    total_receivables: pos.total_receivables,
    buyers_with_debt:  pos.receivables_count
  };
};

module.exports = Buyer;