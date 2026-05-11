const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');

const Partner = sequelize.define('Partner', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  investment_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  investment_percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100
    }
  },
  is_vehicle_partner: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // ─────────────────────────────────────────────────────────────────────────
  // RENAMED: accumulated_profit → current_balance
  //
  //   current_balance = Σ(final_profit from partner_profits)
  //                   - Σ(amount from partner_withdrawals)
  //
  //   > 0  →  partner has profit available to withdraw
  //   = 0  →  fully withdrawn / settled
  //   < 0  →  should not happen in normal flow
  // ─────────────────────────────────────────────────────────────────────────
  current_balance: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Running profit balance = total profits added - total withdrawals. Negative should not happen in normal flow but allowed for corrections.'
  }
}, {
  tableName: 'partners',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: true
});

// ─── INSTANCE METHODS ──────────────────────────────────────────────────────

/**
 * Add profit to partner's running balance.
 * Called by ProfitService after day close.
 *
 * @param {number} amount
 * @param {object} transaction
 */
Partner.prototype.addProfit = async function(amount, transaction) {
  const profitAmount = parseFloat(amount) || 0;
  this.current_balance = parseFloat(this.current_balance) + profitAmount;
  return await this.save({ transaction });
};

/**
 * Reinvest profit → capital. Converts current_balance → investment_amount.
 * Triggers percentage recalculation for ALL partners.
 *
 * @param {number} amount - Amount to reinvest (≤ current_balance)
 * @param {object} transaction 
 */
Partner.prototype.reinvest = async function (amount, transaction) {
  const currentInvestment = Number(this.investment_amount) || 0;
  const currentBalance = Number(this.current_balance) || 0;
  const reinvestAmount = Number(amount);

  // ✅ Update safely (NO STRING CONCAT)
  this.investment_amount = Number((currentInvestment + reinvestAmount).toFixed(2));
  this.current_balance = Number((currentBalance - reinvestAmount).toFixed(2));

  await this.save({ transaction });

  return this;
};

/**
 * Deduct a withdrawal from partner's running balance.
 * Called by partnerProfitController.recordWithdrawal.
 *
 * @param {number} amount
 * @param {object} transaction
 */
Partner.prototype.withdraw = async function(amount, transaction) {
  const withdrawAmount = parseFloat(amount) || 0;
  const balance = parseFloat(this.current_balance);

  if (withdrawAmount > balance) {
    throw new Error('رصيد الشريك غير كافٍ للسحب');
  }

  this.current_balance = balance - withdrawAmount;
  return await this.save({ transaction });
};

// ─── HELPERS ───────────────────────────────────────────────────────────────

/**
 * Recalculate investment_percentage for ALL partners based on investment_amount.
 * Triggered automatically after create / update / destroy.
 */
async function recalculateAllPercentages(transaction) {
  // Use sequelize.models to avoid circular dependencies
  const { Partner, Vehicle } = sequelize.models;

  const partners = await Partner.findAll({
    include: [{
      model: Vehicle,
      as: 'vehicles',
      through: { attributes: ['share_percentage'] }
    }],
    transaction
  });

  // 1. Calculate Net Investment for each partner
  // Formula: Net = Total Investment - (Share % * Vehicle Price)
  const partnerNetInvestments = partners.map(p => {
    const totalVehicleInvestment = (p.vehicles || []).reduce((sum, v) => {
      const share = parseFloat(v.VehiclePartner?.share_percentage || 0);
      const price = parseFloat(v.purchase_price || 0);
      return sum + (share * price / 100);
    }, 0);

    return {
      partner: p,
      netInvestment: Math.max(0, parseFloat(p.investment_amount || 0) - totalVehicleInvestment)
    };
  });

  // 2. Calculate Total Net Investment across all partners
  const totalNetInvestment = partnerNetInvestments.reduce(
    (sum, item) => sum + item.netInvestment, 0
  );

  // 3. Update percentages based on Net Investment
  if (totalNetInvestment === 0) {
    for (const item of partnerNetInvestments) {
      await item.partner.update(
        { investment_percentage: 0 },
        { hooks: false, transaction }
      );
    }
    return;
  }

  for (const item of partnerNetInvestments) {
    const percentage = (item.netInvestment / totalNetInvestment) * 100;
    await item.partner.update(
      { investment_percentage: percentage.toFixed(2) },
      { hooks: false, transaction }
    );
  }
}

// ─── HOOKS ─────────────────────────────────────────────────────────────────

Partner.afterCreate(async (partner, options) => {
  await recalculateAllPercentages(options.transaction);
});

Partner.afterUpdate(async (partner, options) => {
  if (partner.changed('investment_amount')) {
    await recalculateAllPercentages(options.transaction);
  }
});

Partner.afterDestroy(async (partner, options) => {
  await recalculateAllPercentages(options.transaction);
});

module.exports = { Partner, recalculateAllPercentages };