'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── 1. ADD new columns ──────────────────────────────────────────────────

    await queryInterface.addColumn('farm_transactions', 'discount_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Discount applied to subtotal before final amount'
    });
   },

  async down(queryInterface, Sequelize) {
 
    await queryInterface.removeColumn('farm_transactions', 'discount_amount');
  }
};