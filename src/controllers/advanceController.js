const { PersonAdvance, AdvanceReturn, Employee, Partner, Safe, sequelize } = require('../models');
const { logTransaction } = require('../utils/transactionLogger');
const { round2, sanitizeAmount } = require('../utils/financialUtils');
const AppError = require('../utils/app-error.utility');
const { Op } = require('sequelize');

/**
 * Helper to round to 2 decimal places
 */

/**
 * @route   POST /api/advances
 * @desc    Create a new employee advance (Money OUT)
 * @access  Admin only
 */
exports.createAdvance = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const {
      person_id,
      person_type,
      amount,
      advance_date,
      expected_return_date,
      safe_id,
      payment_method,
      description
    } = req.body;

    // 1. Validation
    if (!person_id || !person_type || !amount) {
      await t.rollback();
      return next(new AppError('يرجى اختيار المستلف وتحديد المبلغ', 400));
    }

    let personName = '';
    let employeeId = null;

    if (person_type === 'EMPLOYEE') {
      const employee = await Employee.findByPk(person_id, { transaction: t });
      if (!employee) {
        await t.rollback();
        return next(new AppError('الموظف غير موجود', 404));
      }
      personName = employee.name;
      employeeId = employee.id;
    } else if (person_type === 'PARTNER') {
      const partner = await Partner.findByPk(person_id, { transaction: t });
      if (!partner) {
        await t.rollback();
        return next(new AppError('الشريك غير موجود', 404));
      }
      personName = partner.name;
    } else {
      await t.rollback();
      return next(new AppError('نوع المستلف غير صالح', 400));
    }

    let advanceAmount;
    try {
      advanceAmount = sanitizeAmount(amount);
    } catch (err) {
      await t.rollback();
      return next(new AppError(err.message, 400));
    }

    // 2. Create Advance Record
    const advance = await PersonAdvance.create({
      employee_id: employeeId,
      person_id,
      person_type,
      person_name: personName,
      amount: advanceAmount,
      advance_date: advance_date || new Date(),
      expected_return_date,
      paid_by_user_id: req.user.id,
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

      if (parseFloat(safe.current_balance) < advanceAmount) {
        await t.rollback();
        return next(new AppError('رصيد الخزنة غير كافٍ لصرف هذه السلفة', 400));
      }

      await safe.updateBalance(-advanceAmount, t);
    }

    // Log the transaction
    await logTransaction({
      transaction_type: 'ADVANCE',
      direction: 'OUT',
      amount: advanceAmount,
      safe_id: safe_id || null,
      reference_type: 'PersonAdvance',
      reference_id: advance.id,
      performed_by_user_id: req.user.id,
      payment_method: payment_method || 'CASH',
      notes: `صرف سلفة لـ ${person_type === 'EMPLOYEE' ? 'الموظف' : 'الشريك'}: ${personName}. ${description || ''}`
    }, t);

    await t.commit();

    res.status(201).json({
      success: true,
      message: 'تم تسجيل السلفة بنجاح',
      data: advance
    });

  } catch (error) {
    if (t) await t.rollback();
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   POST /api/advances/:id/return
 * @desc    Record a payment returning an advance (Money IN)
 * @access  All Users
 */
exports.recordReturn = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { amount, return_date, safe_id, payment_method, notes } = req.body;

    // 1. Load Advance
    const advance = await PersonAdvance.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!advance) {
      await t.rollback();
      return next(new AppError('سجل السلفة غير موجود', 404));
    }

    if (advance.status === 'RETURNED') {
      await t.rollback();
      return next(new AppError('هذه السلفة تم سدادها بالكامل بالفعل', 400));
    }

    // 2. Validation
    let returnAmount;
    try {
      returnAmount = sanitizeAmount(amount);
    } catch (err) {
      await t.rollback();
      return next(new AppError(err.message, 400));
    }
    const remainingDebt = round2(parseFloat(advance.amount) - parseFloat(advance.returned_amount));

    if (returnAmount > remainingDebt) {
      await t.rollback();
      return next(new AppError(`المبلغ المدخل (${returnAmount}) يتجاوز المتبقي من السلفة (${remainingDebt})`, 400));
    }

    // 3. Create Return Record
    const returnRecord = await AdvanceReturn.create({
      advance_id: id,
      amount: returnAmount,
      return_date: return_date || new Date(),
      received_by_user_id: req.user.id,
      safe_id: safe_id || null,
      payment_method: payment_method || 'CASH',
      notes
    }, { transaction: t });

    // 4. Update Advance Status
    const newReturnedAmount = round2(parseFloat(advance.returned_amount) + returnAmount);
    let newStatus = 'PARTIAL';
    if (newReturnedAmount >= parseFloat(advance.amount)) {
      newStatus = 'RETURNED';
    }

    await advance.update({
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

    // Get name for logging
    const personName = advance.person_name || (advance.employee?.name || advance.partner?.name || 'غير معروف');

    // Log the transaction
    await logTransaction({
      transaction_type: 'ADVANCE_RETURN',
      direction: 'IN',
      amount: returnAmount,
      safe_id: safe_id || null,
      reference_type: 'AdvanceReturn',
      reference_id: returnRecord.id,
      performed_by_user_id: req.user.id,
      payment_method: payment_method || 'CASH',
      notes: `رد سلفة من ${advance.person_type === 'EMPLOYEE' ? 'الموظف' : 'الشريك'}: ${personName}. ${notes || ''}`
    }, t);

    await t.commit();

    res.status(200).json({
      success: true,
      message: 'تم تسجيل رد المبلغ بنجاح',
      data: {
        returnRecord,
        advanceStatus: newStatus,
        remainingDebt: round2(parseFloat(advance.amount) - newReturnedAmount)
      }
    });

  } catch (error) {
    if (t) await t.rollback();
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/advances
 * @desc    Get all advances with filters
 */
exports.getAllAdvances = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, employee_id, person_id, person_type, status } = req.query;

    const offset = (page - 1) * limit;

    const where = {};
    if (employee_id) where.employee_id = employee_id;
    if (person_id) where.person_id = person_id;
    if (person_type) where.person_type = person_type;
    if (status) where.status = status;

    const result = await PersonAdvance.findAndCountAll({
      where,
      include: [
        { model: Employee, as: 'employee' },
        { model: Partner, as: 'partner' },
        { model: AdvanceReturn, as: 'returns' }
      ],
      order: [['advance_date', 'DESC'], ['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total_pages = Math.ceil(result.count / limit);

    res.status(200).json({
      success: true,
      data: {
        items: result.rows,
        pagination: {
          total: result.count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages
        }
      },
      message: null
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/advances/pending
 * @desc    Get all non-returned advances
 */
exports.getPendingAdvances = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const offset = (page - 1) * limit;

    const result = await PersonAdvance.findAndCountAll({
      where: {
        status: { [Op.ne]: 'RETURNED' }
      },
      include: [
        { model: Employee, as: 'employee' },
        { model: Partner, as: 'partner' }
      ],
      order: [['advance_date', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total_pages = Math.ceil(result.count / limit);

    res.status(200).json({
      success: true,
      data: {
        items: result.rows,
        pagination: {
          total: result.count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages
        }
      },
      message: null
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/advances/:id
 * @desc    Get detailed advance info with all returns
 */
exports.getAdvanceById = async (req, res, next) => {
  try {
    const advance = await PersonAdvance.findByPk(req.params.id, {
      include: [
        { model: Employee, as: 'employee' },
        { model: Partner, as: 'partner' },
        {
          model: AdvanceReturn,
          as: 'returns',
          include: [{ model: Safe, as: 'safe', attributes: ['name'] }]
        }
      ]
    });

    if (!advance) {
      return next(new AppError('سجل السلفة غير موجود', 404));
    }

    res.status(200).json({
      success: true,
      data: advance
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};
