const { Safe, SafeTransfer, sequelize } = require('../models');
const { logTransaction } = require('../utils/transactionLogger');
const AppError = require('../utils/app-error.utility');
const { Op } = require('sequelize');

/**
 * @route   POST /api/safe-transfers
 * @desc    Create a transfer between two safes
 * @access  Admin only
 */
exports.createTransfer = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { from_safe_id, to_safe_id, amount, transfer_date, notes } = req.body;

    // 1. Basic Validation
    if (from_safe_id === to_safe_id) {
      await t.rollback();
      return next(new AppError('لا يمكن التحويل من وإلى نفس الخزنة', 400));
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      await t.rollback();
      return next(new AppError('يجب أن يكون مبلغ التحويل أكبر من صفر', 400));
    }

    // 2. Load Safes
    const fromSafe = await Safe.findByPk(from_safe_id, { transaction: t, lock: t.LOCK.UPDATE });
    const toSafe = await Safe.findByPk(to_safe_id, { transaction: t, lock: t.LOCK.UPDATE });

    if (!fromSafe || !toSafe) {
      await t.rollback();
      return next(new AppError('أحد الخزائن المحددة غير موجودة', 404));
    }

    // 3. Balance Check
    if (parseFloat(fromSafe.current_balance) < transferAmount) {
      await t.rollback();
      return next(new AppError('رصيد الخزنة المحول منها غير كافٍ', 400));
    }

    // 4. Create Transfer Record
    const transfer = await SafeTransfer.create({
      from_safe_id,
      to_safe_id,
      amount: transferAmount,
      transfer_date: transfer_date || new Date(),
      performed_by_user_id: req.user.id,
      notes
    }, { transaction: t });

    // 5. Update Safe Balances
    await fromSafe.updateBalance(-transferAmount, t);
    await toSafe.updateBalance(transferAmount, t);

    // 6. Log Financial Transactions (Dual Entry)
    // OUT from source
    await logTransaction({
      transaction_type: 'SAFE_TRANSFER',
      direction: 'OUT',
      amount: transferAmount,
      safe_id: from_safe_id,
      reference_type: 'SafeTransfer',
      reference_id: transfer.id,
      performed_by_user_id: req.user.id,
      payment_method: fromSafe.type, // Map safe type to payment method for audit
      notes: `تحويل إلى ${toSafe.name}: ${notes || ''}`
    }, t);

    // IN to destination
    await logTransaction({
      transaction_type: 'SAFE_TRANSFER',
      direction: 'IN',
      amount: transferAmount,
      safe_id: to_safe_id,
      reference_type: 'SafeTransfer',
      reference_id: transfer.id,
      performed_by_user_id: req.user.id,
      payment_method: toSafe.type,
      notes: `تحويل من ${fromSafe.name}: ${notes || ''}`
    }, t);

    await t.commit();

    res.status(201).json({
      success: true,
      message: 'تم التحويل بنجاح',
      data: transfer
    });

  } catch (error) {
    if (t) await t.rollback();
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/safe-transfers
 * @desc    Get all transfers with filtering
 */
exports.getAllTransfers = async (req, res, next) => {
  try {
    const { from, to, safe_id } = req.query;

    const where = {};
    if (from || to) {
      where.transfer_date = {};
      if (from) where.transfer_date[Op.gte] = new Date(from);
      if (to) where.transfer_date[Op.lte] = new Date(to);
    }

    if (safe_id) {
      where[Op.or] = [
        { from_safe_id: safe_id },
        { to_safe_id: safe_id }
      ];
    }

    const transfers = await SafeTransfer.findAll({
      where,
      include: [
        { model: Safe, as: 'fromSafe', attributes: ['name', 'type'] },
        { model: Safe, as: 'toSafe', attributes: ['name', 'type'] }
      ],
      order: [['transfer_date', 'DESC'], ['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: transfers.length,
      data: transfers
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/safe-transfers/:id
 * @desc    Get transfer details
 */
exports.getTransferById = async (req, res, next) => {
  try {
    const transfer = await SafeTransfer.findByPk(req.params.id, {
      include: [
        { model: Safe, as: 'fromSafe' },
        { model: Safe, as: 'toSafe' }
      ]
    });

    if (!transfer) {
      return next(new AppError('عملية التحويل غير موجودة', 404));
    }

    res.status(200).json({
      success: true,
      data: transfer
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};
