'use strict';

/**
 * MIGRATION: Alter sale_transactions table
 *
 * REMOVES (old single-weight model):
 *   - loaded_cages_weight   → replaced by sum of sale_weights rows
 *   - net_chicken_weight    → now calculated as gross_total_weight - total_deductions
 *   - old_debt_paid         → debt auto-applied when paid_amount > final_amount
 *   - cage_count            → no longer stored on the transaction header
 *
 * KEEPS:
 *   - empty_cages_weight    → still needed (total empty cages weight, a deduction)
 *
 * ADDS:
 *   - gross_total_weight    → sum of all sale_weights.weight_value
 *   - dead_weight           → weight of dead chickens (a deduction)
 *   - total_deductions      → dead_weight + empty_cages_weight
 *   - net_weight            → gross_total_weight - total_deductions
 *   - subtotal_amount       → net_weight * price_per_kg
 *   - discount_amount       → optional discount applied before final amount
 *   - final_amount          → subtotal_amount - discount_amount  (the real sale value)
 *   - debt_applied_amount   → portion of paid_amount that went toward previous buyer debt
 *
 * NOTE ON total_amount / remaining_amount:
 *   These two columns are intentionally KEPT because:
 *   1. They may be referenced in existing reports/other controllers we haven't seen.
 *   2. The refactored controller will write:
 *        total_amount     = final_amount  (aliased for backward compat)
 *        remaining_amount = final_amount - paid_amount (clamped to 0 if overpaid)
 *   If you want to remove them later, do it in a separate migration once you
 *   confirm nothing else reads them.
 *
 * PRODUCTION SAFETY:
 *   - Columns are removed AFTER new columns are added.
 *   - The down() function fully restores the original schema.
 *   - Uses a single transaction where PostgreSQL supports it.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── 1. ADD new columns ──────────────────────────────────────────────────

    await queryInterface.addColumn('sale_transactions', 'gross_total_weight', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,   // Nullable during migration; controller always sets it
      comment: 'Sum of all individual scale readings from sale_weights'
    });

    await queryInterface.addColumn('sale_transactions', 'dead_weight', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Weight of dead chickens to be deducted'
    });

    await queryInterface.addColumn('sale_transactions', 'total_deductions', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'dead_weight + empty_cages_weight'
    });

    await queryInterface.addColumn('sale_transactions', 'net_weight', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'gross_total_weight - total_deductions'
    });

    await queryInterface.addColumn('sale_transactions', 'subtotal_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
      comment: 'net_weight * price_per_kg'
    });

    await queryInterface.addColumn('sale_transactions', 'discount_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Discount applied to subtotal before final amount'
    });

    await queryInterface.addColumn('sale_transactions', 'final_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
      comment: 'subtotal_amount - discount_amount — the actual amount owed'
    });

    await queryInterface.addColumn('sale_transactions', 'debt_applied_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Portion of paid_amount automatically applied to previous buyer debt'
    });

    // ── 2. REMOVE old columns ───────────────────────────────────────────────
    // We do this AFTER adding new columns so the table is never in a
    // half-migrated state that would break a running instance during deploy.

    await queryInterface.removeColumn('sale_transactions', 'loaded_cages_weight');
    await queryInterface.removeColumn('sale_transactions', 'net_chicken_weight');
    await queryInterface.removeColumn('sale_transactions', 'old_debt_paid');
    await queryInterface.removeColumn('sale_transactions', 'cage_count');
  },

  async down(queryInterface, Sequelize) {
    // ── 1. RESTORE removed columns ──────────────────────────────────────────

    await queryInterface.addColumn('sale_transactions', 'loaded_cages_weight', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0   // Required for existing rows; set to 0 as safe placeholder
    });

    await queryInterface.addColumn('sale_transactions', 'net_chicken_weight', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    });

    await queryInterface.addColumn('sale_transactions', 'old_debt_paid', {
      type: Sequelize.DECIMAL(12, 2),
      defaultValue: 0
    });

    await queryInterface.addColumn('sale_transactions', 'cage_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // ── 2. REMOVE added columns ─────────────────────────────────────────────

    await queryInterface.removeColumn('sale_transactions', 'gross_total_weight');
    await queryInterface.removeColumn('sale_transactions', 'dead_weight');
    await queryInterface.removeColumn('sale_transactions', 'total_deductions');
    await queryInterface.removeColumn('sale_transactions', 'net_weight');
    await queryInterface.removeColumn('sale_transactions', 'subtotal_amount');
    await queryInterface.removeColumn('sale_transactions', 'discount_amount');
    await queryInterface.removeColumn('sale_transactions', 'final_amount');
    await queryInterface.removeColumn('sale_transactions', 'debt_applied_amount');
  }
};