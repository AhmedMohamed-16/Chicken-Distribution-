const { Custody, CustodyReturn, CustodySpending, User, Employee, Partner, Safe, DailyCost, DailyOperation, CostCategory, sequelize } = require('../models');
const { logTransaction } = require('../utils/transactionLogger');
const { round2, sanitizeAmount } = require('../utils/financialUtils');
const AppError = require('../utils/app-error.utility');
const { Op } = require('sequelize');


/**
 * Helper to validate and fetch recipient
 */
const getRecipient = async (type, id, transaction = null) => {
  let model;
  switch (type) {
    case 'USER': model = User; break;
    case 'EMPLOYEE': model = Employee; break;
    case 'PARTNER': model = Partner; break;
    default: return null;
  } 
  return await model.findByPk(id, { transaction });
};

/**
 * @route   POST /api/custodies
 * @desc    Create a new operational custody (Money OUT)
 * @access  Admin only
 */
exports.createCustody = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const {
      given_to_person_type,
      given_to_person_id,
      amount,
      custody_date,
      safe_id,
      payment_method,
      description
    } = req.body;

    // 1. Validation
    if (!given_to_person_type || !given_to_person_id || !amount) {
      await t.rollback();
      return next(new AppError('يرجى تحديد المستلم ونوع الشخص والمبلغ', 400));
    }

    const recipient = await getRecipient(given_to_person_type, given_to_person_id, t);
    if (!recipient) {
      await t.rollback();
      return next(new AppError('المستلم المحدد غير موجود', 404));
    }

    let custodyAmount;
    try {
      custodyAmount = sanitizeAmount(amount);
    } catch (err) {
      await t.rollback();
      return next(new AppError(err.message, 400));
    }

    // 2. Create Custody Record
    const custody = await Custody.create({
      given_to_person_type,
      given_to_person_id,
      amount: custodyAmount,
      custody_date: custody_date || new Date(),
      given_by_user_id: req.user.id,
      safe_id: safe_id || null,
      payment_method: payment_method || 'CASH',
      description
    }, { transaction: t });

    // 3. Financial Integration
    if (safe_id) {
      const safe = await Safe.findByPk(safe_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!safe) {
        await t.rollback();
        return next(new AppError('الخزينة المحددة غير موجودة', 404));
      }

      if (parseFloat(safe.current_balance) < custodyAmount) {
        await t.rollback();
        return next(new AppError('رصيد الخزنة غير كافٍ لصرف هذه العهدة', 400));
      }

      await safe.updateBalance(-custodyAmount, t);
    }

    // Log the transaction
    const recipientName = recipient.full_name || recipient.name || recipient.username;
    await logTransaction({
      transaction_type: 'CUSTODY',
      direction: 'OUT',
      amount: custodyAmount,
      payment_source_type: safe_id ? 'SAFE' : null,
      payment_source_id: safe_id || null,
      reference_type: 'Custody',
      reference_id: custody.id,
      performed_by_user_id: req.user.id,
      payment_method: payment_method || 'CASH',
      notes: `صرف عهدة لـ (${given_to_person_type}): ${recipientName}. ${description || ''}`
    }, t);

    await t.commit();

    res.status(201).json({
      success: true,
      message: 'تم تسجيل العهدة بنجاح',
      data: custody
    });

  } catch (error) {
    if (t) await t.rollback();
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   POST /api/custodies/:id/return
 * @desc    Record a return of custody funds (Money IN)
 * @access  All Users
 */
exports.recordCustodyReturn = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { amount, return_date, safe_id, payment_method, notes } = req.body;

    // 1. Load Custody
    const custody = await Custody.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!custody) {
      await t.rollback();
      return next(new AppError('سجل العهدة غير موجود', 404));
    }

    if (custody.status === 'CLOSED' || custody.status === 'RECONCILED') {
      await t.rollback();
      return next(new AppError('هذه العهدة مغلقة أو مسواة بالفعل', 400));
    }

    // 2. Validation
    let returnAmount;
    try {
      returnAmount = sanitizeAmount(amount);
    } catch (err) {
      await t.rollback();
      return next(new AppError(err.message, 400));
    }
    const remainingAmount = round2(parseFloat(custody.amount) - parseFloat(custody.returned_amount));

    if (returnAmount > remainingAmount) {
      await t.rollback();
      return next(new AppError(`المبلغ المدخل (${returnAmount}) يتجاوز المتبقي من العهدة (${remainingAmount})`, 400));
    }

    // 3. Create Return Record
    const returnRecord = await CustodyReturn.create({
      custody_id: id,
      amount: returnAmount,
      return_date: return_date || new Date(),
      received_by_user_id: req.user.id,
      safe_id: safe_id || null,
      payment_method: payment_method || 'CASH',
      notes
    }, { transaction: t });

    // 4. Update Custody Status
    const newReturnedAmount = round2(parseFloat(custody.returned_amount) + returnAmount);
    const totalReconciled = round2(newReturnedAmount + parseFloat(custody.spent_amount));
    
    let newStatus = 'PARTIAL';
    if (totalReconciled >= parseFloat(custody.amount)) {
      newStatus = 'RECONCILED';
    }

    await custody.update({
      returned_amount: newReturnedAmount,
      status: newStatus
    }, { transaction: t });

    // 5. Financial Integration
    if (safe_id) {
      const safe = await Safe.findByPk(safe_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (safe) {
        await safe.updateBalance(returnAmount, t);
      }
    }

    // Fetch recipient name for logging
    const recipient = await getRecipient(custody.given_to_person_type, custody.given_to_person_id, t);
    const recipientName = recipient ? (recipient.full_name || recipient.name || recipient.username) : 'غير معروف';

    // Log the transaction
    await logTransaction({
      transaction_type: 'CUSTODY_RETURN',
      direction: 'IN',
      amount: returnAmount,
      payment_source_type: safe_id ? 'SAFE' : null,
      payment_source_id: safe_id || null,
      reference_type: 'CustodyReturn',
      reference_id: returnRecord.id,
      performed_by_user_id: req.user.id,
      payment_method: payment_method || 'CASH',
      notes: `رد عهدة من: ${recipientName}. ${notes || ''}`
    }, t);

    await t.commit();

    res.status(200).json({
      success: true,
      message: 'تم تسجيل رد مبلغ العهدة بنجاح',
      data: {
        returnRecord,
        custodyStatus: newStatus,
        remainingAmount: round2(parseFloat(custody.amount) - newReturnedAmount)
      }
    });

  } catch (error) {
    if (t) await t.rollback();
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/custodies
 * @desc    Get all custodies with filtering
 */
exports.getAllCustodies = async (req, res, next) => {
  try {
    const { status, given_to_person_type } = req.query;

    const where = {};
    if (status) where.status = status;
    if (given_to_person_type) where.given_to_person_type = given_to_person_type;

    const custodies = await Custody.findAll({
      where,
      include: [
        { model: CustodyReturn, as: 'returns' },
        { model: User, as: 'creator', attributes: ['full_name', 'username'] }
      ],
      order: [['custody_date', 'DESC'], ['created_at', 'DESC']]
    });

    // Manually add recipient names
    const enrichedCustodies = await Promise.all(custodies.map(async (c) => {
      const recipient = await getRecipient(c.given_to_person_type, c.given_to_person_id);
      const plain = c.get({ plain: true });
      plain.recipient_name = recipient ? (recipient.full_name || recipient.name || recipient.username) : 'غير معروف';
      return plain;
    }));

    res.status(200).json({
      success: true,
      count: enrichedCustodies.length,
      data: enrichedCustodies
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/custodies/:id
 * @desc    Get custody details
 */
exports.getCustodyById = async (req, res, next) => {
  try {
    const custody = await Custody.findByPk(req.params.id, {
      include: [
        {
          model: CustodyReturn,
          as: 'returns',
          include: [{ model: Safe, as: 'safe', attributes: ['name'] }]
        },
        { model: User, as: 'creator', attributes: ['full_name', 'username'] }
      ]
    });

    if (!custody) {
      return next(new AppError('سجل العهدة غير موجود', 404));
    }

    const recipient = await getRecipient(custody.given_to_person_type, custody.given_to_person_id);
    const data = custody.get({ plain: true });
    data.recipient_name = recipient ? (recipient.full_name || recipient.name || recipient.username) : 'غير معروف';

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   POST /api/custodies/:id/settle
 * @desc    Rewrite settleCustody: Any remaining unaccounted amount becomes an expense only if it cannot be attributed to spent/returned.
 * @access  Admin only
 */
exports.settleCustody = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;

    // 1. Load Custody with Row Locking
    const custody = await Custody.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!custody) {
      await t.rollback();
      return next(new AppError('سجل العهدة غير موجود', 404));
    }

    if (custody.status === 'CLOSED') {
      await t.rollback();
      return next(new AppError('هذه العهدة مغلقة بالفعل', 400));
    }

    // 2. Calculate remaining unaccounted
    // unaccounted = amount - spent_amount - returned_amount
    const totalAmount = parseFloat(custody.amount);
    const spentAmount = parseFloat(custody.spent_amount) || 0;
    const returnedAmount = parseFloat(custody.returned_amount) || 0;
    const remainingUnaccounted = round2(totalAmount - spentAmount - returnedAmount);

    if (remainingUnaccounted > 0) {
      await t.rollback();

      return res.status(400).json({
        success: false,
        code: 'UNACCOUNTED_AMOUNT',
        unaccounted: remainingUnaccounted,
        message: 'يوجد مبلغ غير محاسب'
      });
    }
    const description=req.body.notes?`${custody.description}\n${req.body.notes}`:custody.description
    // 4. Update Custody Status to CLOSED
    await custody.update({ status: 'CLOSED',description:description}, { transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: 'تمت تسوية وإغلاق العهدة بنجاح',
      data: {
        custody_id: custody.id,
        unaccounted: remainingUnaccounted,
        status: 'CLOSED'
      }
    });

  } catch (error) {
    if (t) await t.rollback();
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   POST /api/custodies/:id/spending
 * @desc    Document spending from a custody (Does NOT hit the safe)
 */
exports.recordCustodySpending = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { amount, reference_type, reference_id, description, spending_date } = req.body;

    const custody = await Custody.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!custody) {
      await t.rollback();
      return next(new AppError('العهدة غير موجودة', 404));
    }

    if (custody.status === 'CLOSED' || custody.status === 'RECONCILED') {
      await t.rollback();
      return next(new AppError('لا يمكن التسجيل على عهدة مغلقة أو مسواة', 400));
    }

    let spendingAmount;
    try {
      spendingAmount = sanitizeAmount(amount);
    } catch (err) {
      await t.rollback();
      return next(new AppError(err.message, 400));
    }
    const unaccounted = parseFloat(custody.unaccounted_amount);

    if (spendingAmount > unaccounted) {
      await t.rollback();
      return next(new AppError(`المبلغ المطلوب تسويته (${spendingAmount}) يتجاوز المبلغ المتبقي في العهدة (${unaccounted})`, 400));
    }

    // Create spending record
    const spending = await CustodySpending.create({
      custody_id: id,
      reference_type: reference_type || 'ManualExpense',
      reference_id: reference_id || null,
      amount: spendingAmount,
      description,
      spending_date: spending_date || new Date(),
      recorded_by_user_id: req.user.id
    }, { transaction: t });

    // Update custody.spent_amount
    const newSpentAmount = round2(parseFloat(custody.spent_amount) + spendingAmount);
    const totalReconciled = round2(newSpentAmount + parseFloat(custody.returned_amount));
    
    let newStatus = 'PARTIAL';
    if (totalReconciled >= parseFloat(custody.amount)) {
      newStatus = 'RECONCILED';
    }

    await custody.update({
      spent_amount: newSpentAmount,
      status: newStatus
    }, { transaction: t });

    await t.commit();

    res.status(201).json({
      success: true,
      message: 'تم تسجيل المنصرف من العهدة بنجاح',
      data: spending
    });

  } catch (error) {
    if (t) await t.rollback();
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/custodies/:id/statement
 * @desc    Get full custody ledger / statement
 */
exports.getCustodyStatement = async (req, res, next) => {
  try {
    const custody = await Custody.findByPk(req.params.id, {
      include: [
        { model: CustodyReturn, as: 'returns', include: [{ model: Safe, as: 'safe', attributes: ['name'] }] },
        { model: CustodySpending, as: 'spendings', include: [{ model: User, as: 'recorder', attributes: ['full_name'] }] },
        { model: User, as: 'creator', attributes: ['full_name'] },
        { model: Safe, as: 'safe', attributes: ['name'] }
      ]
    });

    if (!custody) return next(new AppError('العهدة غير موجودة', 404));

    const recipient = await getRecipient(custody.given_to_person_type, custody.given_to_person_id);
    const recipientName = recipient ? (recipient.full_name || recipient.name || recipient.username) : 'غير معروف';

    const summary = {
      total_issued: parseFloat(custody.amount),
      total_spent: parseFloat(custody.spent_amount),
      total_returned: parseFloat(custody.returned_amount),
      unaccounted: round2(parseFloat(custody.amount) - parseFloat(custody.spent_amount) - parseFloat(custody.returned_amount))
    };

    res.status(200).json({
      success: true,
      data: {
        custody: {
          id: custody.id,
          amount: custody.amount,
          status: custody.status,
          date: custody.custody_date,
          recipient_type: custody.given_to_person_type,
          recipient_name: recipientName,
          safe_name: custody.safe?.name
        },
        spending: custody.spendings,
        returns: custody.returns,
        summary
      }
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/custodies/summary
 * @desc    Snapshot of all active custodies
 */
exports.getCustodySummary = async (req, res, next) => {
  try {
    const openCustodies = await Custody.findAll({
      where: {
        status: { [Op.in]: ['OPEN', 'PARTIAL'] }
      },
      include: [
        { model: Safe, as: 'safe', attributes: ['name'] }
      ]
    });

    const enriched = await Promise.all(openCustodies.map(async (c) => {
      const recipient = await getRecipient(c.given_to_person_type, c.given_to_person_id);
      const plain = c.get({ plain: true });
      plain.recipient_name = recipient ? (recipient.full_name || recipient.name || recipient.username) : 'غير معروف';
      plain.unaccounted = round2(parseFloat(c.amount) - parseFloat(c.spent_amount) - parseFloat(c.returned_amount));
      return plain;
    }));

    const totals = enriched.reduce((acc, curr) => {
      acc.total_unaccounted += curr.unaccounted;
      acc.total_issued += parseFloat(curr.amount);
      return acc;
    }, { total_unaccounted: 0, total_issued: 0 });

    res.status(200).json({
      success: true,
      data: {
        custodies: enriched,
        totals: {
          ...totals,
          count: enriched.length
        }
      }
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};
