// src/utils/paymentUtils.js
const { Safe, Custody, CustodySpending } = require('../models');
const { round2 } = require('./financialUtils');
const AppError = require('./app-error.utility');

/**
 * Unified handler for all operational and debt payments.
 * Ensures strict separation between SAFE and CUSTODY according to accounting rules.
 * 
 * @param {Object} options
 * @param {string} options.payment_source_type - 'SAFE' | 'CUSTODY'
 * @param {number} options.payment_source_id - Safe.id | Custody.id
 * @param {number} options.amount - Payment amount
 * @param {string} options.reference_type - Model name for audit trail (e.g. 'FarmTransaction')
 * @param {number} options.reference_id - ID of the source transaction
 * @param {string} options.description - Ledger description
 * @param {Object} options.dbTransaction - Sequelize transaction
 * @param {number} [options.recorded_by_user_id] - User ID
 * @param {boolean} [options.allow_partial=false] - If true, continues even if balance is low (not recommended for accounting)
 */
async function handlePaymentSource({
  payment_source_type,
  payment_source_id,
  amount,
  direction = 'OUT', // 'IN' or 'OUT'
  reference_type,
  reference_id,
  description,
  dbTransaction,
  recorded_by_user_id,
  allow_partial = false
}) {
  if (!dbTransaction) {
    throw new Error('Database transaction is required for handlePaymentSource');
  }

  const parsedAmount = round2(parseFloat(amount) || 0);
  if (parsedAmount === 0) return null;

  // --- BRANCH A: SAFE (CASH) ---
  if (payment_source_type === 'SAFE') {
    if (!payment_source_id) {
      throw new AppError('يجب تحديد الخزينة للدفع النقدي', 400);
    }

    const safe = await Safe.findByPk(payment_source_id, { transaction: dbTransaction });
    if (!safe) {
      throw new AppError('الخزينة المحددة غير موجودة', 404);
   }

    // Adjust safe balance based on direction
    const change = direction === 'IN' ? parsedAmount : -parsedAmount;
    await safe.updateBalance(change, dbTransaction);
    return { success: true, source: 'SAFE' };
  }

  // --- BRANCH B: CUSTODY (DELEGATED CASH) ---
  if (payment_source_type === 'CUSTODY') {
    if (direction === 'IN') {
      throw new AppError('لا يمكن استلام مبالغ مباشرة في العهدة. يجب استلامها في الخزينة أولاً.', 400);
    }

    if (!payment_source_id) {
      throw new AppError('يجب تحديد العهدة المستخدمة للصرف', 400);
    }

    // LOCK the custody row to prevent race conditions on balance checks
    const custody = await Custody.findByPk(payment_source_id, { 
      transaction: dbTransaction, 
      lock: dbTransaction.LOCK.UPDATE 
    });

    if (!custody) {
      throw new AppError('العهدة المحددة غير موجودة', 404);
    }

    if (!['OPEN', 'PARTIAL'].includes(custody.status)) {
      throw new AppError('لا يمكن الصرف من عهدة مغلقة أو مسواة', 400);
    }

    const unaccounted = round2(parseFloat(custody.unaccounted_amount) || 0);
    if (!allow_partial && parsedAmount > unaccounted) {
      throw new AppError(`رصيد العهدة غير كافٍ. المتبقي: ${unaccounted} ج.م`, 400);
    }

    // 1. Record individual spending item
    await CustodySpending.create({
      custody_id: payment_source_id,
      reference_type,
      reference_id,
      amount: parsedAmount,
      description,
      recorded_by_user_id,
      spending_date: new Date()
    }, { transaction: dbTransaction });

    // 2. Update custody aggregate
    await custody.update({
      spent_amount: round2(parseFloat(custody.spent_amount) + parsedAmount)
    }, { transaction: dbTransaction });

    return { success: true, source: 'CUSTODY' };
  }

  throw new AppError('نوع مصدر الدفع غير صالح', 400);
}

module.exports = {
  handlePaymentSource
};