// src/utils/transactionLogger.js
const { FinancialTransaction } = require('../models');
const { sanitizeAmount } = require('./financialUtils');

/**
 * Utility to log a financial transaction automatically using an existing database transaction.
 * 
 * @param {Object} data - The financial transaction data 
 * @param {string} data.transaction_type - ENUM: 'SALE', 'PURCHASE', 'COST', etc.
 * @param {string} data.direction - ENUM: 'IN', 'OUT'
 * @param {number} data.amount - Amount (positive number)
 * @param {number} [data.payment_source_type] - 'SAFE' | 'CUSTODY'
 * @param {number} [data.payment_source_id] - Safe.id | Custody.id
 * @param {string} [data.reference_type] - e.g. 'SaleTransaction', 'FarmTransaction'
 * @param {number} [data.reference_id] - Source record ID
 * @param {number} [data.daily_operation_id] - Daily operation ID
 * @param {number} [data.performed_by_user_id] - User performing the transaction
 * @param {string} [data.received_by_person_type] - ENUM
 * @param {number} [data.received_by_person_id] - Person ID
 * @param {string} [data.paid_by_person_type] - ENUM
 * @param {number} [data.paid_by_person_id] - Person ID
 * @param {string} [data.payment_method='CASH'] - ENUM
 * @param {string} [data.notes] - Notes 
 * @param {Object} sequelizeTransaction - The Sequelize transaction object (`t`)
 * @returns {Promise<Object>} The created financial transaction
 */
async function logTransaction(data, sequelizeTransaction) {
  if (!data) {
    throw new Error('Financial transaction data is required');
  }
  if (!data.transaction_type) {
    throw new Error('Transaction type is required for financial transaction logging');
  }
  if (!data.direction || !['IN', 'OUT'].includes(data.direction)) {
    throw new Error('Direction (IN/OUT) is required for financial transaction logging');
  }

  // Sanitize and validate amount
  let amount;
  try {
    amount = sanitizeAmount(data.amount);
  } catch (err) {
    throw new Error(`Invalid amount: ${err.message}`);
  }

  // Determine payment source (backward compatible)
  const payment_source_type = data.payment_source_type || (data.safe_id ? 'SAFE' : 'SAFE');
  const payment_source_id = data.payment_source_id || data.safe_id || null;

  // Clean data to avoid sending safe_id to model (which now lacks that column)
  const cleanData = { ...data };
  delete cleanData.safe_id;

  // FINANCIAL INTEGRITY: Always log the sanitized amount
  return await FinancialTransaction.create({
    ...cleanData,
    amount,
    payment_source_type,
    payment_source_id
  }, { transaction: sequelizeTransaction });
}

module.exports = {
  logTransaction
};
