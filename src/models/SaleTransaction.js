
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * SaleTransaction — updated to support multi-weight sale flow.
 *
 * REMOVED columns (handled by migration 20240002):
 *   loaded_cages_weight, net_chicken_weight, old_debt_paid, cage_count
 *
 * KEPT columns:
 *   empty_cages_weight  — total weight of all empty cages (a deduction)
 *   total_amount        — aliased to final_amount for backward compatibility
 *   remaining_amount    — final_amount - paid_amount (0 if overpaid)
 *
 * NEW columns:
 *   gross_total_weight  — Σ sale_weights.weight_value
 *   dead_weight         — weight of dead/discarded chickens
 *   total_deductions    — dead_weight + empty_cages_weight
 *   net_weight          — gross_total_weight - total_deductions
 *   subtotal_amount     — net_weight × price_per_kg
 *   discount_amount     — optional discount before final amount
 *   final_amount        — subtotal_amount - discount_amount
 *   debt_applied_amount — portion of paid_amount applied to previous buyer debt
 */
const SaleTransaction = sequelize.define('SaleTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  // ── Foreign keys (unchanged) ───────────────────────────────────────────────

  daily_operation_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'daily_operations', key: 'id' }
  },

  vehicle_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'vehicles', key: 'id' }
  },

  vehicle_operation_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'vehicle_operations', key: 'id' }
  },

  buyer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'buyers', key: 'id' }
  },

  chicken_type_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'chicken_types', key: 'id' }
  },

  sequence_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  // ── Weight fields (new model) ──────────────────────────────────────────────

  /**
   * Sum of all SaleWeight.weight_value rows for this transaction.
   * Stored here so reports can read it without re-summing child rows.
   */
  gross_total_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },

  /**
   * Weight of dead / rejected chickens.
   * Deducted from gross_total_weight.
   */
  dead_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },

  /**
   * Total weight of all empty cages returned to buyer.
   * Deducted from gross_total_weight.
   */
  empty_cages_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },

  /**
   * dead_weight + empty_cages_weight
   * Stored for reporting convenience.
   */
  total_deductions: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },

  /**
   * gross_total_weight - total_deductions
   * The actual sellable chicken weight.
   */
  net_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },

  // ── Pricing fields ─────────────────────────────────────────────────────────

  price_per_kg: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false
  },

  /**
   * net_weight × price_per_kg  (before discount)
   */
  subtotal_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },

  /**
   * Optional discount. Defaults to 0.
   * Validated in controller: cannot exceed subtotal_amount.
   */
  discount_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },

  /**
   * subtotal_amount - discount_amount
   * The real amount the buyer owes for this transaction.
   */
  final_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },

  // ── Payment fields ─────────────────────────────────────────────────────────

  paid_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },

  /**
   * Portion of paid_amount that exceeded final_amount and was
   * automatically applied to the buyer's previous outstanding debt.
   * 0 when paid_amount <= final_amount.
   */
  debt_applied_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },

  /**
   * Backward-compatible alias:
   *   total_amount     = final_amount
   *   remaining_amount = MAX(0, final_amount - paid_amount)
   *
   * Kept so existing reports / other controllers don't break.
   * Remove in a future migration once confirmed nothing reads them.
   */
  total_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },

  remaining_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  // paid_by_person_id: {
  //   type: DataTypes.INTEGER,
  //   allowNull: true,
  //   references: {
  //     model: 'users',
  //     key: 'id'
  //   }
  // },
  received_by_person_type: {
    type: DataTypes.ENUM( 'EMPLOYEE', 'PARTNER'),
    allowNull: true
  },
  received_by_person_id: {
    type: DataTypes.INTEGER,
    allowNull: true
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
  loss_record_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'transport_losses',
      key: 'id'
    }
  }

}, {
  tableName: 'sale_transactions',
  timestamps: true,
  createdAt: 'transaction_time',
  updatedAt: false,
  underscored: true,
  indexes: [
    { fields: ['daily_operation_id'] },
    { fields: ['vehicle_id', 'daily_operation_id'] }
  ],
  getterMethods: {
    balanceImpact() {
      // Sale increases buyer debt, paid_amount decreases it for this transaction.
      // Net impact = final_amount - paid_amount
      const finalAmt = parseFloat(this.getDataValue('final_amount')) || 0;
      const paidAmt = parseFloat(this.getDataValue('paid_amount')) || 0;
      return finalAmt - paidAmt;
    }
  }
});

module.exports = SaleTransaction;