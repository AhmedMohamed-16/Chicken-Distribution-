'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add PARTNER_INVESTMENT to the enum for financial_transactions.transaction_type
    // PostgreSQL requires altering the enum type directly
    await queryInterface.sequelize.query(`
      ALTER TYPE enum_financial_transactions_transaction_type ADD VALUE IF NOT EXISTS 'PARTNER_INVESTMENT';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // PostgreSQL does not support removing enum values directly
    // This is a no-op for safety; manual intervention would be needed to remove enum values
    console.log('Warning: Cannot safely remove enum values in PostgreSQL without recreating the enum type.');
  }
};

