'use strict';

/**
 * MIGRATION: Add accumulated_profit column to partners table
 *
 * Adds a column to track the accumulated profit balance for each partner.
 * This is used to track how much profit has been earned but not yet withdrawn.
 *
 * Safe to run on production — only ADDS a new column to existing table.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('partners');
    
    // Only add the column if it doesn't already exist
    if (!tableDescription.accumulated_profit) {
      await queryInterface.addColumn('partners', 'accumulated_profit', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('partners');
    
    // Only drop the column if it exists
    if (tableDescription.accumulated_profit) {
      await queryInterface.removeColumn('partners', 'accumulated_profit');
    }
  }
};
