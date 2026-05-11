'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, drop the existing enum type and create a new one with the additional value
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS enum_custody_spendings_reference_type;
    `);
    
    await queryInterface.sequelize.query(`
      CREATE TYPE enum_custody_spendings_reference_type AS ENUM (
        'FarmTransaction', 
        'DailyCost', 
        'SaleTransaction', 
        'ManualExpense',
        'FarmDebtPayment',
        'BuyerDebtPayment',
        'CostDebtPayment'
      );
    `);
    
    // Then alter the column to use the new enum type
    await queryInterface.changeColumn('custody_spendings', 'reference_type', {
      type: Sequelize.ENUM('FarmTransaction', 'DailyCost', 'SaleTransaction', 'ManualExpense', 'FarmDebtPayment', 'BuyerDebtPayment', 'CostDebtPayment'),
      allowNull: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert to the original enum type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS enum_custody_spendings_reference_type;
    `);
    
    await queryInterface.sequelize.query(`
      CREATE TYPE enum_custody_spendings_reference_type AS ENUM (
        'FarmTransaction', 
        'DailyCost', 
        'SaleTransaction', 
        'ManualExpense'
      );
    `);
    
    await queryInterface.changeColumn('custody_spendings', 'reference_type', {
      type: Sequelize.ENUM('FarmTransaction', 'DailyCost', 'SaleTransaction', 'ManualExpense'),
      allowNull: false
    });
  }
};