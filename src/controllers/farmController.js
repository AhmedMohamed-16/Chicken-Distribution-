// src/controllers/farmController.js
const { Farm, FarmTransaction, FarmDebtPayment, DailyOperation, ChickenType } = require('../models');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const AppError = require('../utils/app-error.utility');
const { round2 } = require('../utils/financialUtils');

exports.getAllFarms = async (req, res,next) => {
  try {
    const farms = await Farm.findAll({
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: farms
    });
  } catch (error) {
        next(new AppError( 'حدث خطأ أثناء جلب المزارع'));
  }
};
exports.getPaginationAllFarms = async (req, res,next) => {
  try {
    const { page = 1, limit = 50, search ,has_debt} = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const where = {};
    
    // Search filter
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { owner_name: { [Op.iLike]: `%${search}%` } },
        { location: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } }
      ];
    }
        if (has_debt === 'true') {
      where.current_balance = { [Op.gt]: 0 };
    } else if (has_debt === 'false') {
      where.current_balance =  { [Op.lt]: 0 };
    }


    const { count, rows: farms } = await Farm.findAndCountAll({
      where,
      order: [['name', 'ASC']],
      limit: parseInt(limit),
      offset
    });
    console.log("farms",farms);
    
    res.json({
      success: true,
      data: {
        items: farms,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / parseInt(limit))
        }
      }
    });
    
  } catch (error) {   
        next(new AppError( 'حدث خطأ أثناء جلب المزارع'));

  }
};
exports.getFarmById = async (req, res,next) => {
  try {
    const farm = await Farm.findByPk(req.params.id);

    if (!farm) {
             next(new AppError( 'لم يتم العثور على المزرعة',404));

    }

    res.json({
      success: true,
      data: farm
    });
  } catch (error) {
     next(new AppError( 'حدث خطأ أثناء جلب المزارع'));

  }
};

exports.createFarm = async (req, res,next) => {
  try {
    console.log("\nreq.body",req.body);
    
    const farm = await Farm.create(req.body);

    res.status(201).json({
      success: true,
      message: 'تم إنشاء المزرعة بنجاح',
      data: farm
    });
  } catch (error) {
 next(new AppError( 'حدث خطأ أثناء جلب المزارع'));
}

};

exports.updateFarm = async (req, res,next) => {
  try {
    const farm = await Farm.findByPk(req.params.id);

    if (!farm) {
                next(new AppError( 'لم يتم العثور على المزرعة',404));

    }

    // Don't allow manual update of total_debt through this endpoint
    const { total_debt, ...updateData } = req.body;

    await farm.update(updateData);

    res.json({
      success: true,
      message: 'تم تحديث المزرعة بنجاح',
      data: farm
    });
  } catch (error) {
    next(new AppError( 'حدث خطأ أثناء جلب المزارع'));
  }
};

exports.deleteFarm = async (req, res,next) => {
  try {
    const farm = await Farm.findByPk(req.params.id);

    if (!farm) {
             next(new AppError( 'لم يتم العثور على المزرعة',404));

    }

    // Check if farm has any transactions
    const transactionCount = await FarmTransaction.count({
      where: { farm_id: req.params.id }
    });

    if (transactionCount > 0) {
    next(new AppError( 'لا يمكن حذف المزرعة التي تحتوي على معاملات موجودة',400));
    }

    await farm.destroy();

    res.json({
      success: true,
      message: 'تم حذف المزرعة بنجاح'
    });
  } catch (error) {
  next(new AppError( 'خطأ في حذف المزرعة'));
  }
};

// exports.getFarmDebtHistory = async (req, res) => {
//   try {
//     const farm = await Farm.findByPk(req.params.id);

//     if (!farm) {
//       return res.status(404).json({
//         success: false,
//         message: 'Farm not found'
//       });
//     }

//     // Get all farm transactions
//     const transactions = await FarmTransaction.findAll({
//       where: { farm_id: req.params.id },
//       include: [
//         {
//           model: DailyOperation,as:"operation",
//           attributes: ['id', 'operation_date']
//         }
//       ],
//       order: [['transaction_time', 'DESC']]
//     });

//     // Get all debt payments
//     const payments = await FarmDebtPayment.findAll({
//       where: { farm_id: req.params.id },
//       include: [
//         {
//           model: DailyOperation,as:"operation",
//           attributes: ['id', 'operation_date'],
//           required: false
//         }
//       ],
//       order: [['payment_date', 'DESC']]
//     });

//     res.json({
//       success: true,
//       data: {
//         farm,
//         current_debt: farm.total_debt,
//         transactions,
//         payments,
//         summary: {
//           total_purchases: transactions.length,
//           total_payments: payments.length,
//           total_amount_purchased: transactions.reduce((sum, t) => sum + parseFloat(t.total_amount), 0),
//           total_amount_paid: transactions.reduce((sum, t) => sum + parseFloat(t.paid_amount), 0)
//         }
//       }
//     });
//   } catch (error) {
//     console.error('Error fetching farm debt history:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error fetching debt history',
//       error: error.message
//     });
//   }
// };

// Record a standalone debt payment to farm
// exports.getFarmDebtHistory = async (req, res,next) => {
//   try {
//     const farm = await Farm.findByPk(req.params.id);

//     if (!farm) {
//                  next(new AppError( 'لم يتم العثور على المزرعة',404));

//     }

//     // Get all farm transactions
//     const transactions = await FarmTransaction.findAll({
//       where: { farm_id: req.params.id },
//       include: [
//         {
//           model: DailyOperation,
//           as: "operation",
//           attributes: ['id', 'operation_date']
//         }
//       ],
//       order: [['transaction_time', 'ASC']]
//     });

//     // Get all debt payments
//     const payments = await FarmDebtPayment.findAll({
//       where: { farm_id: req.params.id },
//       include: [
//         {
//           model: DailyOperation,
//           as: "operation",
//           attributes: ['id', 'operation_date'],
//           required: false
//         }
//       ],
//       order: [['payment_date', 'ASC']]
//     });

//     // Merge and sort all events chronologically
//     const events = [];

//     // Add transactions
//     transactions.forEach(t => {
//       events.push({
//         date: t.transaction_time,
//         type: 'transaction',
//         transaction_id: t.id,
//         total_amount: parseFloat(t.total_amount),
//         paid_amount: parseFloat(t.paid_amount),
//         remaining_amount: parseFloat(t.remaining_amount),
//         raw_data: t
//       });
//     });

//     // Add payments
//     payments.forEach(p => {
//       const amount = parseFloat(p.amount);
//       const direction = p.payment_direction;
      
//       events.push({
//         date: p.payment_date,
//         type: 'payment',
//         payment_id: p.id,
//         amount: amount,
//         payment_direction: direction,
//         // FROM_FARM = reduces debt, TO_FARM = increases debt
//         debt_impact: direction === 'FROM_FARM' ? -amount : amount,
//         raw_data: p
//       });
//     });

//     // Sort by date ascending
//     events.sort((a, b) => new Date(a.date) - new Date(b.date));

//     // Calculate cumulative debt
//     let cumulativeDebt = 0;
//     const history = [];

//     events.forEach(event => {
//       if (event.type === 'transaction') {
//         // For transaction: debt increases by remaining_amount
//         const debtIncrease = event.remaining_amount;
//         cumulativeDebt += debtIncrease;

//         history.push({
//           date: event.date,
//           type: 'transaction',
//           transaction_id: event.transaction_id,
//           total_amount: event.total_amount,
//           paid_amount: event.paid_amount,
//           remaining_amount: event.remaining_amount,
//           debt_before: cumulativeDebt - debtIncrease,
//           debt_change: debtIncrease,
//           debt_after: cumulativeDebt,
//           raw_data: event.raw_data
//         });
//       } else if (event.type === 'payment') {
//         // For payment: apply debt impact based on direction
//         const debtChange = event.debt_impact;
//         cumulativeDebt += debtChange;

//         history.push({
//           date: event.date,
//           type: 'payment',
//           payment_id: event.payment_id,
//           amount: event.amount,
//           payment_direction: event.payment_direction,
//           debt_before: cumulativeDebt - debtChange,
//           debt_change: debtChange,
//           debt_after: cumulativeDebt,
//           raw_data: event.raw_data
//         });
//       }
//     });

//      history.sort((a, b) => new Date(b.date) - new Date(a.date));

//     res.json({
//       success: true,
//       data: {
//         farm,
//         current_balance: parseFloat(farm.current_balance),
//         calculated_balance: cumulativeDebt,
//         history,
//         summary: {
//           total_purchases: transactions.length,
//           total_payments: payments.length,
//           total_amount_purchased: transactions.reduce((sum, t) => sum + parseFloat(t.total_amount), 0),
//           total_amount_paid: transactions.reduce((sum, t) => sum + parseFloat(t.paid_amount), 0)
//         }
//       }
//     });
//   } catch (error) {
// next(new AppError( 'خطأ في جلب سجل الديون'));
//   }
// };
  

exports.getFarmDebtHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 7;
    const { startDate, endDate } = req.query;

    const farm = await Farm.findByPk(id);
    if (!farm) {
      return next(new AppError('لم يتم العثور على المزرعة', 404));
    }

    const whereTransactions = { farm_id: id };
    const wherePayments = { farm_id: id };

    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter[Op.gte] = new Date(startDate);
      if (endDate)   dateFilter[Op.lte] = new Date(endDate);
      
      whereTransactions.transaction_time = dateFilter;
      wherePayments.payment_date = dateFilter;
    }

    // Fetch transactions
    const transactions = await FarmTransaction.findAll({
      where: whereTransactions,
      include: [
        {
          model: DailyOperation,
          as: "operation",
          attributes: ['id', 'operation_date']
        }
      ],
      order: [['transaction_time', 'DESC']],
      limit: startDate || endDate ? undefined : limit
    });

    // Fetch payments
    const payments = await FarmDebtPayment.findAll({
      where: wherePayments,
      include: [
        {
          model: DailyOperation,
          as: "operation",
          attributes: ['id', 'operation_date'],
          required: false
        }
      ],
      order: [['payment_date', 'DESC']],
      limit: startDate || endDate ? undefined : limit
    });

    const events = [];

    transactions.forEach(t => {
      const remainingAmount = round2(parseFloat(t.remaining_amount) || 0);
      events.push({
        date: t.transaction_time,
        type: 'transaction',
        transaction_id: t.id,
        total_amount: round2(parseFloat(t.total_amount) || 0),
        paid_amount: round2(parseFloat(t.paid_amount) || 0),
        remaining_amount: remainingAmount,
        balance_impact: remainingAmount, // Debt increases by remaining_amount
        operation_date: t.operation?.operation_date || null,
        raw_data: t
      });
    });

    payments.forEach(p => {
      const amount = round2(parseFloat(p.amount) || 0);
      const direction = p.payment_direction;
      const balanceImpact = direction === 'FROM_FARM' ? -amount : amount;
      
      events.push({
        date: p.payment_date,
        type: 'payment',
        payment_id: p.id,
        amount: amount,
        payment_direction: direction,
        balance_impact: balanceImpact,
        operation_date: p.operation?.operation_date || null,
        raw_data: p
      });
    });

    // Sort newest → oldest
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const recentEvents = startDate || endDate ? events : events.slice(0, limit);

    // Reconstruct balance walking BACKWARDS
    let cumulativeBalance = round2(parseFloat(farm.current_balance) || 0);

    if (endDate) {
      // Calculate impact of everything AFTER endDate
      const futureTransactions = await FarmTransaction.findAll({
        where: {
          farm_id: id,
          transaction_time: { [Op.gt]: new Date(endDate) }
        }
      });
      const futurePayments = await FarmDebtPayment.findAll({
        where: {
          farm_id: id,
          payment_date: { [Op.gt]: new Date(endDate) }
        }
      });

      let futureImpact = 0;
      futureTransactions.forEach(t => {
        futureImpact += round2(parseFloat(t.remaining_amount) || 0);
      });
      futurePayments.forEach(p => {
        const amt = round2(parseFloat(p.amount) || 0);
        futureImpact += (p.payment_direction === 'FROM_FARM' ? -amt : amt);
      });

      cumulativeBalance = round2(cumulativeBalance - futureImpact);
    }

    const history = recentEvents.map(event => {
      const balanceAfter = cumulativeBalance;
      cumulativeBalance = round2(cumulativeBalance - event.balance_impact);
      const balanceBefore = cumulativeBalance;

      const baseEvent = {
        date:             event.date,
        balance_before:   balanceBefore,
        balance_change:   event.balance_impact,
        balance_after:    balanceAfter,
        operation_date:   event.operation_date,
        raw_data:         event.raw_data
      };

      if (event.type === 'transaction') {
        return {
          ...baseEvent,
          type:             'transaction',
          transaction_id:   event.transaction_id,
          total_amount:     event.total_amount,
          paid_amount:      event.paid_amount,
          remaining_amount: event.remaining_amount
        };
      } else {
        return {
          ...baseEvent,
          type:              'payment',
          payment_id:        event.payment_id,
          amount:            event.amount,
          payment_direction: event.payment_direction,
          direction_arabic:  event.payment_direction === 'FROM_FARM' ? 'استلمنا من المزرعة' : 'دفعنا للمزرعة'
        };
      }
    });

    // Sort oldest → newest for output
    history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const openingBalance = history.length > 0 ? history[history.length - 1].balance_before : cumulativeBalance;
    const calculatedBalance = history.length > 0 ? history[history.length - 1].balance_after : cumulativeBalance;
    const currentBalance = round2(parseFloat(farm.current_balance) || 0);

    res.json({
      success: true,
      data: {
        farm,
        current_balance: currentBalance,
        opening_balance: openingBalance,
        calculated_balance: calculatedBalance,
        history,
        summary: {
          total_purchases: transactions.length,
          total_payments: payments.length,
          total_amount_purchased: round2(transactions.reduce((sum, t) => sum + round2(parseFloat(t.total_amount) || 0), 0)),
          total_amount_paid: round2(transactions.reduce((sum, t) => sum + round2(parseFloat(t.paid_amount) || 0), 0) + payments.reduce((sum, p) => sum + round2(parseFloat(p.amount) || 0), 0))
        }
      }
    });
  } catch (error) {
    console.error('Error in getFarmDebtHistory:', error);
    next(new AppError('خطأ في جلب سجل الديون', 500));
  }
};

exports.recordDebtPayment = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { farm_id, amount, payment_date, notes, daily_operation_id } = req.body;

    const farm = await Farm.findByPk(farm_id);

    if (!farm) {
      await transaction.rollback();
             next(new AppError( 'لم يتم العثور على المزرعة',404));
    }

    // Record payment
    const payment = await FarmDebtPayment.create({
      farm_id,
      daily_operation_id: daily_operation_id || null,
      amount,
      payment_date,
      notes
    }, { transaction });

    // Update farm's total debt (decrease debt when we pay)
    await farm.update({
      total_debt: parseFloat(farm.total_debt) - parseFloat(amount)
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'تم تسجيل سداد الدين بنجاح',
      data: payment
    });
  } catch (error) {
    await transaction.rollback();
next(new AppError( 'خطأ في جلب سجل الديون'));
  }
};

/**
 * Get farms with active balances (non-zero)
 * (Receivables + Payables)
 */
exports.getActiveBalances = async (req, res, next) => {
  try {
    const farms = await Farm.getActiveBalances();

    res.json({
      success: true,
      count: farms.length,
      data: farms
    });

  } catch (error) {
    next(new AppError('حدث خطأ أثناء جلب الأرصدة النشطة'));
  }
};


/**
 * Get farms that owe us money (Receivables)
 * current_balance > 0
 */
exports.getReceivables = async (req, res, next) => {
  try {
    const farms = await Farm.getReceivables();

    res.json({
      success: true,
      count: farms.length,
      data: farms
    });

  } catch (error) {
    next(new AppError('حدث خطأ أثناء جلب المديونيات'));
  }
};


/**
 * Get farms we owe money to (Payables)
 * current_balance < 0
 */
exports.getPayables = async (req, res, next) => {
  try {
    const farms = await Farm.getPayables();

    res.json({
      success: true,
      count: farms.length,
      data: farms
    });

  } catch (error) {
    next(new AppError('حدث خطأ أثناء جلب الدائنين'));
  }
};


/**
 * Get net farm position summary
 */
exports.getNetPosition = async (req, res, next) => {
  try {
    const summary = await Farm.getNetPosition();

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    next(new AppError('حدث خطأ أثناء حساب المركز المالي'));
  }
};

module.exports = exports;