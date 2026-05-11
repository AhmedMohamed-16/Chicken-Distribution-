'use strict';

/**
 * MIGRATION: Create sale_weights table
 *
 * Each sale transaction can have multiple gross weight readings
 * (e.g. multiple scale measurements). This table stores each
 * individual reading linked to its parent sale_transaction.
 *
 * Safe to run on production — only ADDS a new table, touches nothing else.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sale_weights', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      sale_transaction_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'sale_transactions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'   // If the parent sale is deleted, weights go with it
      },
      weight_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Sequence of this reading within the sale (1, 2, 3...)'
      },
      weight_value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Gross weight value for this single scale reading (kg)'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Index for fast lookup of all weights belonging to one sale
    await queryInterface.addIndex('sale_weights', ['sale_transaction_id'], {
      name: 'idx_sale_weights_sale_transaction_id'
    });
  },

  async down(queryInterface) {
    // Removes index first (PostgreSQL drops it automatically with the table,
    // but being explicit is safer cross-dialect)
    await queryInterface.removeIndex('sale_weights', 'idx_sale_weights_sale_transaction_id')
      .catch(() => {}); // Ignore if already gone

    await queryInterface.dropTable('sale_weights');
  }
};