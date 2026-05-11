const { SalaryPayment, Employee, Safe, sequelize } = require('../models');
const { logTransaction } = require('../utils/transactionLogger');
const { sanitizeAmount } = require('../utils/financialUtils');
const AppError = require('../utils/app-error.utility');
const { Op } = require('sequelize');

/**
 * @route   POST /api/salaries
 * @desc    Record an employee salary payment (Money OUT)
 * @access  Admin only
 */
exports.recordSalary = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const {
      employee_id,
      amount,
      payment_date,
      period_month,
      period_year,
      received_by_employee_id,
      safe_id,
      payment_method,
      notes
    } = req.body;

    // 1. Validation
    if (!employee_id || !amount || !period_month || !period_year) {
      await t.rollback();
      return next(new AppError('يرجى تقديم بيانات الموظف والمبلغ والفترة (الشهر/السنة)', 400));
    }

    const employee = await Employee.findByPk(employee_id, { transaction: t });
    if (!employee) {
      await t.rollback();
      return next(new AppError('الموظف غير موجود', 404));
    }

    let salaryAmount;
    try {
      salaryAmount = sanitizeAmount(amount);
    } catch (err) {
      await t.rollback();
      return next(new AppError(err.message, 400));
    }

    // 2. Create Salary Record
    const salary = await SalaryPayment.create({
      employee_id,
      amount: salaryAmount,
      payment_date: payment_date || new Date(),
      period_month,
      period_year,
      paid_by_user_id: req.user.id,
      received_by_employee_id: received_by_employee_id || employee_id,
      safe_id: safe_id || null,
      payment_method: payment_method || 'CASH',
      notes
    }, { transaction: t });

    // 3. Financial Integration
    if (safe_id) {
      const safe = await Safe.findByPk(safe_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!safe) {
        await t.rollback();
        return next(new AppError('الخزينة المحددة غير موجودة', 404));
      }

      if (parseFloat(safe.current_balance) < salaryAmount) {
        await t.rollback();
        return next(new AppError('رصيد الخزنة غير كافٍ لصرف هذا الراتب', 400));
      }

      await safe.updateBalance(-salaryAmount, t);
    }

    // Log the transaction
    await logTransaction({
      transaction_type: 'SALARY',
      direction: 'OUT',
      amount: salaryAmount,
      safe_id: safe_id || null,
      reference_type: 'SalaryPayment',
      reference_id: salary.id,
      performed_by_user_id: req.user.id,
      payment_method: payment_method || 'CASH',
      notes: `صرف راتب الموظف: ${employee.full_name} لفترة ${period_month}/${period_year}`
    }, t);

    await t.commit();

    res.status(201).json({
      success: true,
      message: 'تم تسجيل صرف الراتب بنجاح',
      data: salary
    });

  } catch (error) {
    if (t) await t.rollback();
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/salaries
 * @desc    Get all salary payments with filters
 */
exports.getAllSalaries = async (req, res, next) => {
  try {
    const { employee_id, month, year } = req.query;

    const where = {};
    if (employee_id) where.employee_id = employee_id;
    if (month) where.period_month = month;
    if (year) where.period_year = year;

    const salaries = await SalaryPayment.findAll({
      where,
      include: [
        { model: Employee, as: 'employee' },
        { model: Safe, as: 'safe', attributes: ['name'] }
      ],
      order: [['payment_date', 'DESC'], ['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: salaries.length,
      data: salaries
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/salaries/:id
 * @desc    Get salary payment details
 */
exports.getSalaryById = async (req, res, next) => {
  try {
    const salary = await SalaryPayment.findByPk(req.params.id, {
      include: [
        { model: Employee, as: 'employee' },
        { model: Employee, as: 'receiver' },
        { model: Safe, as: 'safe' }
      ]
    });

    if (!salary) {
      return next(new AppError('سجل الراتب غير موجود', 404));
    }

    res.status(200).json({
      success: true,
      data: salary
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/salaries/summary
 * @desc    Get salary summary for an employee
 */
exports.getEmployeeSalarySummary = async (req, res, next) => {
  try {
    const { employee_id, year } = req.query;

    if (!employee_id || !year) {
      return next(new AppError('يرجى تحديد الموظف والسنة', 400));
    }

    const summary = await SalaryPayment.findAll({
      where: {
        employee_id,
        period_year: year
      },
      attributes: [
        'period_month',
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_paid']
      ],
      group: ['period_month'],
      order: [['period_month', 'ASC']],
      raw: true
    });

    // Format results to ensure all 12 months are present if needed, 
    // or just return the existing data.
    const monthlyData = summary.map(item => ({
      month: item.period_month,
      total_paid: parseFloat(item.total_paid || 0)
    }));
      console.log("monthlyData",monthlyData);
      
    res.status(200).json({
      success: true,
      data: {
        employee_id,
        year,
        monthly_breakdown: monthlyData
      }
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};
