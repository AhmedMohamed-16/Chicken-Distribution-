'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * SaleWeight
 *
 * Stores individual gross-weight readings for a sale transaction.
 * A single sale can have multiple scale readings (e.g., multiple truck
 * trips to the scale). The sum of all weight_value rows for a given
 * sale_transaction_id equals gross_total_weight on the parent record.
 *
 * Relationship:
 *   SaleTransaction hasMany SaleWeight  (1 → N)
 *   SaleWeight belongsTo SaleTransaction
 */
const SaleWeight = sequelize.define('SaleWeight', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  sale_transaction_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'sale_transactions',
      key: 'id'
    }
  },

  /**
   * The sequential position of this reading within the sale.
   * Controller sets this to (previous max + 1) for the given sale.
   */
  weight_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  /**
   * The actual gross weight value from this scale reading (kg).
   * Must be positive — validated in the controller before insert.
   */
  weight_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  }
}, {
  tableName: 'sale_weights',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true,
  indexes: [
    { fields: ['sale_transaction_id'] }
  ]
});

module.exports = SaleWeight;