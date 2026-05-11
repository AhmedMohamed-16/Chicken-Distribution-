// src/controllers/buyerController.js
const { Buyer, SaleTransaction, BuyerDebtPayment, DailyOperation } = require('../models');
const { sequelize } = require('../config/database');
const { format12Hour } =  require('./../utils/format12Hour');
const { Op } = require('sequelize');
const AppError = require('../utils/app-error.utility');
const { round2 } = require('../utils/financialUtils');

exports.getAllBuyers = async (req, res,next) => {
  try {
    const buyers = await Buyer.findAll({
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: buyers
    });
  } catch (error) {
     next(new AppError( 'حدث خطأ في جلب المشترين'));
  }
};

exports.getPaginationAllBuyers = async (req, res,next) => {
  try {
    const { page = 1, limit = 50, search,has_debt } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const where = {};
    
    // Search filter
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { address: { [Op.iLike]: `%${search}%` } }
      ];
    }
    console.log("has_debt",has_debt);
    
    // فلتر الدين
    if (has_debt === 'true') {
      where.current_balance = { [Op.gt]: 0 }; // عليه دين
    } else if (has_debt === 'false') {
      where.current_balance = 0; // لا يوجد دين
    }

    const { count, rows: buyers } = await Buyer.findAndCountAll({
      where,
      order: [['name', 'ASC']],
      limit: parseInt(limit),
      offset
    });
    
    res.json({
      success: true,
      data: {
        items: buyers,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / parseInt(limit))
        }
      }
    });
    
  } catch (error) {
     next(new AppError( 'حدث خطأ في جلب المشترين'));
  }
};
exports.getBuyerById = async (req, res,next) => {
  try {
    const buyer = await Buyer.findByPk(req.params.id);

    if (!buyer) {
         next(new AppError( 'لم يتم العثور على المشتري',404));
    }

    res.json({
      success: true,
      data: buyer
    });
  } catch (error) {
     next(new AppError( 'حدث خطأ في جلب المشترين'));
  }
};

exports.createBuyer = async (req, res,next) => {
  try {
    const buyer = await Buyer.create(req.body);

    res.status(201).json({
      success: true,
      message: 'تم إنشاء المشتري بنجاح',
      data: buyer
    });
  } catch (error) {
 next(new AppError( 'حدث خطأ في جلب حدث خطأ أثناء إنشاء المشتري'));
  }
};

exports.updateBuyer = async (req, res,next) => {
  try {
    const buyer = await Buyer.findByPk(req.params.id);

    if (!buyer) {
       next(new AppError( 'لم يتم العثور على المشتري',404));
    }

    // Don't allow manual update of total_debt through this endpoint
    const { total_debt, ...updateData } = req.body;

    await buyer.update(updateData);

    res.json({
      success: true,
      message: 'تم تحديث المشتري بنجاح',
      data: buyer
    });
  } catch (error) {
    next(new AppError( 'حدث خطأ أثناء تحديث المشتري'));
  }
};

exports.deleteBuyer = async (req, res,next) => {
  try {
    const buyer = await Buyer.findByPk(req.params.id);

    if (!buyer) {
         next(new AppError( 'لم يتم العثور على المشتري',404));
    }

    // Check if buyer has any transactions
    const transactionCount = await SaleTransaction.count({
      where: { buyer_id: req.params.id }
    });

    if (transactionCount > 0) {
       next(new AppError(' لا يمكن حذف المشتري الذي لديه معاملات قائمة غير موجود ', 400));
    }

    await buyer.destroy();

    res.json({
      success: true,
      message: 'تم حذف المشتري بنجاح'
    });
  } catch (error) {
     next(new AppError( 'خطأ في حذف المشتري '));
  }
};

// exports.getBuyerDebtHistory = async (req, res) => {
//   try {
//     const buyer = await Buyer.findByPk(req.params.id);

//     if (!buyer) {
//       return res.status(404).json({
//         success: false,
//         message: 'Buyer not found'
//       });
//     }

//     // Get all sales transactions
//     const transactions = await SaleTransaction.findAll({
//       where: { buyer_id: req.params.id },
//       include: [
//         {
//           model: DailyOperation,as:"operation",
//           attributes: ['id', 'operation_date']
//         }
//       ],
//       order: [['transaction_time', 'DESC']]
//     });

//     // Get all debt payments
//     const payments = await BuyerDebtPayment.findAll({
//       where: { buyer_id: req.params.id },
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
//         buyer,
//         current_debt: buyer.total_debt,
//         transactions,
//         payments,
//         summary: {
//           total_sales: transactions.length,
//           total_payments: payments.length,
//           total_amount_sold: transactions.reduce((sum, t) => sum + parseFloat(t.total_amount), 0),
//           total_amount_paid: transactions.reduce((sum, t) => sum + parseFloat(t.paid_amount) + parseFloat(t.old_debt_paid), 0)
//         }
//       }
//     });
//   } catch (error) {
//     console.error('Error fetching buyer debt history:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error fetching debt history',
//       error: error.message
//     });
//   }
// };

// Record a standalone debt payment (not part of a sale)
// exports.getBuyerDebtHistory = async (req, res) => {
//   try {
//     const buyer = await Buyer.findByPk(req.params.id);
//     if (!buyer) {
//       return res.status(404).json({
//         success: false,
//         message: 'Buyer not found'
//       });
//     }

//     // Get all sales transactions
//     const transactions = await SaleTransaction.findAll({
//       where: { buyer_id: req.params.id },
//       include: [
//         {
//           model: DailyOperation,
//           as: "operation",
//           attributes: ['id', 'operation_date']
//         }
//       ],
//       order: [['transaction_time', 'ASC']] // ASC for chronological calculation
//     });

//     // Get all debt payments
//     const payments = await BuyerDebtPayment.findAll({
//       where: { buyer_id: req.params.id },
//       include: [
//         {
//           model: DailyOperation,
//           as: "operation",
//           attributes: ['id', 'operation_date'],
//           required: false
//         }
//       ],
//       order: [['payment_date', 'ASC']] // ASC for chronological calculation
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
//         paid_amount: parseFloat(t.paid_amount) + parseFloat(t.old_debt_paid || 0),
//         old_debt_paid: parseFloat(t.old_debt_paid || 0),
//         remaining_amount: parseFloat(t.remaining_amount),
//         raw_data: t
//       });
//     });

//     // Add payments
//     payments.forEach(p => {
//       events.push({
//         date: p.payment_date,
//         type: 'payment',
//         payment_id: p.id,
//         amount: parseFloat(p.amount),
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
//           old_debt_paid: event.old_debt_paid,
//           remaining_amount: event.remaining_amount,
//           debt_before: cumulativeDebt - debtIncrease,
//           debt_change: debtIncrease,
//           debt_after: cumulativeDebt,
//           raw_data: event.raw_data
//         });
//       } else if (event.type === 'payment') {
//         // For payment: debt decreases by payment amount
//         const debtDecrease = event.amount;
//         cumulativeDebt -= debtDecrease;

//         history.push({
//           date: event.date,
//           type: 'payment',
//           payment_id: event.payment_id,
//           amount: event.amount,
//           debt_before: cumulativeDebt + debtDecrease,
//           debt_change: -debtDecrease,
//           debt_after: cumulativeDebt,
//           raw_data: event.raw_data
//         });
//       }
//     });

//     // Reverse for display (most recent first)
//     // history.reverse();
//  // Sort by date descending (الأحدث أولاً)
// events.sort((a, b) => new Date(b.date) - new Date(a.date));

//     res.json({
//       success: true,
//       data: {
//         buyer,
//         current_debt: parseFloat(buyer.total_debt),
//         calculated_debt: cumulativeDebt, // Should match current_debt
//         history,
//         summary: {
//           total_sales: transactions.length,
//           total_payments: payments.length,
//           total_amount_sold: transactions.reduce((sum, t) => sum + parseFloat(t.total_amount), 0),
//           total_amount_paid: transactions.reduce((sum, t) => sum + parseFloat(t.paid_amount) + parseFloat(t.old_debt_paid || 0), 0) + payments.reduce((sum, p) => sum + parseFloat(p.amount), 0)
//         }
//       }
//     });
//   } catch (error) {
//     console.error('Error fetching buyer debt history:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error fetching debt history',
//       error: error.message
//     });
//   }
// };
// exports.getBuyerDebtHistory = async (req, res,next) => {
//   try {
//     const buyer = await Buyer.findByPk(req.params.id);
//     if (!buyer) {
//     next(new AppError( 'لم يتم العثور على المشتري',404));

//     }

//     // Get all sales transactions
//     const transactions = await SaleTransaction.findAll({
//       where: { buyer_id: req.params.id },
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
//     const payments = await BuyerDebtPayment.findAll({
//       where: { buyer_id: req.params.id },
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

//     // Create a Set of transaction timestamps for quick lookup
//     const transactionTimestamps = new Set(
//       transactions.map(t => new Date(t.transaction_time).getTime())
//     );

//     // Filter out payments that haven't the exact same timestamp as any transaction
//     const filteredPayments = payments.filter(p => {
//       const paymentTimestamp = new Date(p.payment_date).getTime();
//       return transactionTimestamps.has(paymentTimestamp);
//     });
//   console.log("\n\nfilteredPayments",filteredPayments);
//   console.log("payments",payments);
  
//     // Merge and sort all events chronologically
//     const events = [];

//     // Add transactions
//     transactions.forEach(t => {
       
//       events.push({
//         date: t.transaction_time,
//         type: 'transaction',
//         transaction_id: t.id,
//         total_amount: parseFloat(t.total_amount),
//         paid_amount: parseFloat(t.paid_amount) + parseFloat(t.old_debt_paid || 0),
//         old_debt_paid: parseFloat(t.old_debt_paid || 0),
//         remaining_amount: parseFloat(t.remaining_amount),
//         raw_data: t
//       });
//     });

//     // Add filtered payments only
//     filteredPayments.forEach(p => {
//       events.push({
//         date: p.payment_date,
//         type: 'payment',
//         payment_id: p.id,
//         amount: parseFloat(p.amount),
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
//         // const debtIncrease = event.remaining_amount;
//         console.log("event.total_amount",event.total_amount);
//         console.log("event.total_amount_paid",event.total_amount_paid);
        
//         const debtIncrease = event.total_amount- event.paid_amount;
//         cumulativeDebt += debtIncrease;

//         history.push({
//           date: event.date,
//           type: 'transaction',
//           transaction_id: event.transaction_id,
//           total_amount: event.total_amount,
//           paid_amount: event.paid_amount,
//           old_debt_paid: event.old_debt_paid,
//           remaining_amount: event.remaining_amount,
//           debt_before: cumulativeDebt - debtIncrease,
//           debt_change: debtIncrease,
//           debt_after: cumulativeDebt,
//           raw_data: event.raw_data
//         });
//       } else if (event.type === 'payment') {
//         const debtDecrease = event.amount;
//         cumulativeDebt -= debtDecrease;

//         history.push({
//           date: event.date,
//           type: 'payment',
//           payment_id: event.payment_id,
//           amount: event.amount,
//           debt_before: cumulativeDebt + debtDecrease,
//           debt_change: -debtDecrease,
//           debt_after: cumulativeDebt,
//           raw_data: event.raw_data
//         });
//       }
//     });

//     // Sort by date descending (الأحدث أولاً)
//     history.sort((a, b) => new Date(b.date) - new Date(a.date));

//     res.json({
//       success: true,
//       data: {
//         buyer,
//         current_debt: parseFloat(buyer.total_debt),
//         calculated_debt: cumulativeDebt,
//         history,
//         summary: {
//           total_sales: transactions.length,
//           total_payments: filteredPayments.length,
//           total_amount_sold: transactions.reduce((sum, t) => sum + parseFloat(t.total_amount), 0),
//           total_amount_paid: transactions.reduce((sum, t) => sum + parseFloat(t.paid_amount) + parseFloat(t.old_debt_paid || 0), 0) + filteredPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0)
//         }
//       }
//     });
//   } catch (error) { 
//     next(new AppError( 'خطأ في جلب سجل الديون ',));
//   }
// };
 
// exports.getBuyerDebtHistory = async (req, res, next) => {
//   try {
//     const { id } = req.params;
//     // default: آخر 7 معاملات، أو اللي اليوزر يحدده
//     const limit = parseInt(req.query.limit) || 7;

//     const buyer = await Buyer.findByPk(id);
//     if (!buyer) {
//       return next(new AppError('لم يتم العثور على المشتري', 404));
//     }

//     // جلب آخر N معاملة بيع فقط
//     const transactions = await SaleTransaction.findAll({
//       where: { buyer_id: id },
//       include: [
//         {
//           model: DailyOperation,
//           as: "operation",
//           attributes: ['id', 'operation_date']
//         }
//       ],
//       order: [['transaction_time', 'DESC']],
//       limit: limit
//     });

//     // جلب آخر N دفعة فقط
//     const payments = await BuyerDebtPayment.findAll({
//       where: { buyer_id: id },
//       include: [
//         {
//           model: DailyOperation,
//           as: "operation",
//           attributes: ['id', 'operation_date'],
//           required: false
//         }
//       ],
//       order: [['payment_date', 'DESC']],
//       limit: limit
//     });

//     // Create a Set of transaction timestamps for quick lookup
//     const transactionTimestamps = new Set(
//       transactions.map(t =>  new Date(t.transaction_time).getTime())
//     );

//     // Filter out payments that have the exact same timestamp as any transaction
//     const filteredPayments = payments.filter(p => {
//       const paymentTimestamp = new Date(p.payment_date).getTime();
//       return !transactionTimestamps.has(paymentTimestamp);
//     });

//     // دمج الأحداث
//     const events = [];

//     // Add transactions
//     transactions.forEach(t => {
//       events.push({
//         date: t.transaction_time,
//         type: 'transaction',
//         transaction_id: t.id,
//         total_amount: parseFloat(t.total_amount),
//         paid_amount: parseFloat(t.paid_amount) + parseFloat(t.old_debt_paid || 0),
//         old_debt_paid: parseFloat(t.old_debt_paid || 0),
//         remaining_amount: parseFloat(t.remaining_amount),
//         raw_data: t
//       });
//     });

//     // Add filtered payments only
//     filteredPayments.forEach(p => {
//       events.push({
//         date: p.payment_date,
//         type: 'payment',
//         payment_id: p.id,
//         amount: parseFloat(p.amount),
//         raw_data: p
//       });
//     });

//     // ترتيب من الأحدث للأقدم
//     events.sort((a, b) => new Date(b.date) - new Date(a.date));

//     // أخذ آخر N حدث فقط بعد الدمج
//     const recentEvents = events.slice(0, limit);

//     // حساب الدين التراكمي
//     // نبدأ من الدين الحالي ونرجع للخلف
//     let cumulativeDebt = parseFloat(buyer.total_debt);
    
//     const history = recentEvents.map(event => {
//       const debtBefore = cumulativeDebt;
      
//       if (event.type === 'transaction') {
//         // عند الرجوع للخلف، نطرح الدين اللي اتضاف
//         const debtIncrease = event.total_amount - event.paid_amount;
//         cumulativeDebt -= debtIncrease;

//         return {
//           date: event.date,
//           type: 'transaction',
//           transaction_id: event.transaction_id,
//           total_amount: event.total_amount,
//           paid_amount: event.paid_amount,
//           old_debt_paid: event.old_debt_paid,
//           remaining_amount: event.remaining_amount,
//           debt_before: cumulativeDebt,
//           debt_change: debtIncrease,
//           debt_after: debtBefore,
//           raw_data: event.raw_data
//         };
//       } else {
//         // عند الرجوع للخلف، نضيف الدفعة (لأننا راجعين)
//         const debtDecrease = event.amount;
//         cumulativeDebt += debtDecrease;

//         return {
//           date: event.date,
//           type: 'payment',
//           payment_id: event.payment_id,
//           amount: event.amount,
//           debt_before: cumulativeDebt,
//           debt_change: -debtDecrease,
//           debt_after: debtBefore,
//           raw_data: event.raw_data
//         };
//       }
//     });

//     // ترتيب من الأقدم للأحدث في النهاية (زي ما كان)
//     history.sort((a, b) => new Date(a.date)- new Date(b.date));

//     // حساب الـ calculated_debt من آخر سجل في الـ history
//     const calculatedDebt = history.length > 0 
//       ? history[history.length - 1].debt_after 
//       : parseFloat(buyer.total_debt);

//     res.json({
//       success: true,
//       data: {
//         buyer,
//         current_debt: parseFloat(buyer.total_debt),
//         calculated_debt: calculatedDebt,
//         history,
//         summary: {
//           total_sales: transactions.length,
//           total_payments: filteredPayments.length,
//           total_amount_sold: transactions.reduce((sum, t) => sum + parseFloat(t.total_amount), 0),
//           total_amount_paid: transactions.reduce((sum, t) => sum + parseFloat(t.paid_amount) + parseFloat(t.old_debt_paid || 0), 0) + filteredPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0)
//         }
//       }
//     });
//   } catch (error) {
//     console.error('Error in getBuyerDebtHistory:', error);
//     next(new AppError('خطأ في جلب سجل الديون', 500));
//   }
// };  
/**
 * getBuyerDebtHistory — CORRECTED BALANCE IMPACT
 * ────────────────────────────────────────────────
 * Balance reconstruction walks BACKWARDS from current_balance.
 * Each event's balance_impact must match what recordSale actually wrote.
 *
 * CORRECTED sale balance_impact formula (mirrors recordSale Step 10):
 *   balance_impact = final_remaining + used_credit - surplus
 *
 * Where:
 *   final_remaining  = remaining_amount stored on the transaction
 *   used_credit      = debt_applied_amount stored on the transaction
 *   surplus          = max(0, paid_amount - final_amount)
 *
 * Signs explained:
 *   +final_remaining  buyer still owed us after sale → balance went UP
 *   +used_credit      credit was consumed → balance went UP (less negative)
 *   -surplus          buyer overpaid → we owe them → balance went DOWN
 *
 * Standalone payments use the balanceImpact getter (already correct):
 *   FROM_BUYER → -amount  (balance went DOWN)
 *   TO_BUYER   → +amount  (balance went UP)
 */
exports.getBuyerDebtHistory = async (req, res, next) => {
  try {
    const { id }  = req.params;
    const limit   = parseInt(req.query.limit) || 7;

    // ========================================================================
    // STEP 1 — Load buyer
    // ========================================================================

    const buyer = await Buyer.findByPk(id);

    if (!buyer) {
      return next(new AppError('لم يتم العثور على المشتري', 404));
    }

    // ========================================================================
    // STEP 2 — Filtering & Date Range
    // ========================================================================

    const { startDate, endDate } = req.query;
    const whereTransactions = { buyer_id: id };
    const wherePayments = { buyer_id: id };

    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter[Op.gte] = new Date(startDate);
      if (endDate)   dateFilter[Op.lte] = new Date(endDate);
      
      whereTransactions.transaction_time = dateFilter;
      wherePayments.payment_date = dateFilter;
    }

    // ========================================================================
    // STEP 3 — Fetch sale transactions
    // ========================================================================

    const transactions = await SaleTransaction.findAll({
      where: whereTransactions,
      include: [
        {
          model: DailyOperation,
          as: 'operation',
          attributes: ['id', 'operation_date']
        }
      ],
      order: [['transaction_time', 'DESC']],
      limit: startDate || endDate ? undefined : limit
    });

    // ========================================================================
    // STEP 4 — Fetch standalone payments
    // ========================================================================

    const payments = await BuyerDebtPayment.findAll({
      where: wherePayments,
      include: [
        {
          model: DailyOperation,
          as: 'operation',
          attributes: ['id', 'operation_date'],
          required: false
        }
      ],
      order: [['payment_date', 'DESC']],
      limit: startDate || endDate ? undefined : limit
    });

    // ========================================================================
    // STEP 5 — Deduplicate & Merge
    // ========================================================================

    const transactionTimestamps = new Set(
      transactions.map(t => new Date(t.transaction_time).getTime())
    );

    const filteredPayments = payments.filter(p => {
      return !transactionTimestamps.has(new Date(p.payment_date).getTime());
    });

    const events = [];

    transactions.forEach(t => {
      const finalAmount       = round2(parseFloat(t.final_amount || t.total_amount) || 0);
      const paidAmount        = round2(parseFloat(t.paid_amount)        || 0);
      const remainingAmount   = round2(parseFloat(t.remaining_amount)   || 0);
      const debtAppliedAmount = round2(parseFloat(t.debt_applied_amount)|| 0);
      const surplus           = round2(Math.max(0, paidAmount - finalAmount));
      const balanceImpact     = round2(remainingAmount + debtAppliedAmount - surplus);

      events.push({
        date:             t.transaction_time,
        type:             'transaction',
        transaction_id:   t.id,
        sequence_number:  t.sequence_number,
        final_amount:     finalAmount,
        paid_amount:      paidAmount,
        remaining_amount: remainingAmount,
        used_credit:      debtAppliedAmount,
        surplus,
        balance_impact:   balanceImpact,
        operation_date:   t.operation?.operation_date || null,
        raw_data:         t
      });
    });

    filteredPayments.forEach(p => {
      const balanceImpact = round2(parseFloat(p.balanceImpact) || 0);
      const amount        = round2(parseFloat(p.amount)        || 0);

      events.push({
        date:              p.payment_date,
        type:              'payment',
        payment_id:        p.id,
        amount,
        payment_direction: p.payment_direction,
        balance_impact:    balanceImpact,
        operation_date:    p.operation?.operation_date || null,
        raw_data:          p
      });
    });

    // ========================================================================
    // STEP 6 — Sort newest → oldest
    // ========================================================================

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const recentEvents = startDate || endDate ? events : events.slice(0, limit);

    // ========================================================================
    // STEP 7 — Reconstruct running balance walking BACKWARDS
    //
    // If endDate is provided, we first need to find the balance as it was
    // AT THAT endDate by undoing all events between NOW and endDate.
    // ========================================================================

    let cumulativeBalance = round2(parseFloat(buyer.current_balance) || 0);

    if (endDate) {
      // Find all events AFTER endDate to calculate the closing balance of the period
      const futureTransactions = await SaleTransaction.findAll({
        where: {
          buyer_id: id,
          transaction_time: { [Op.gt]: new Date(endDate) }
        }
      });
      const futurePayments = await BuyerDebtPayment.findAll({
        where: {
          buyer_id: id,
          payment_date: { [Op.gt]: new Date(endDate) }
        }
      });

      const futureTransTimestamps = new Set(futureTransactions.map(t => new Date(t.transaction_time).getTime()));
      const filteredFuturePayments = futurePayments.filter(p => !futureTransTimestamps.has(new Date(p.payment_date).getTime()));

      let futureImpact = 0;
      futureTransactions.forEach(t => {
        const finalAmt = round2(parseFloat(t.final_amount || t.total_amount) || 0);
        const paidAmt  = round2(parseFloat(t.paid_amount) || 0);
        const remAmt   = round2(parseFloat(t.remaining_amount) || 0);
        const debtApp  = round2(parseFloat(t.debt_applied_amount) || 0);
        const srp      = round2(Math.max(0, paidAmt - finalAmt));
        futureImpact += round2(remAmt + debtApp - srp);
      });
      filteredFuturePayments.forEach(p => {
        futureImpact += round2(parseFloat(p.balanceImpact) || 0);
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
        balance_type_after: balanceAfter > 0 ? 'RECEIVABLE' : (balanceAfter < 0 ? 'CREDIT' : 'SETTLED'),
        operation_date:   event.operation_date,
        raw_data:         event.raw_data
      };

      if (event.type === 'transaction') {
        return {
          ...baseEvent,
          type:             'transaction',
          transaction_id:   event.transaction_id,
          sequence_number:  event.sequence_number,
          final_amount:     event.final_amount,
          paid_amount:      event.paid_amount,
          remaining_amount: event.remaining_amount,
          used_credit:      event.used_credit,
          surplus:          event.surplus
        };
      } else {
        return {
          ...baseEvent,
          type:              'payment',
          payment_id:        event.payment_id,
          amount:            event.amount,
          payment_direction: event.payment_direction,
          direction_arabic:  event.payment_direction === 'FROM_BUYER' ? 'استلمنا من المشتري' : 'دفعنا للمشتري'
        };
      }
    });

    const openingBalance = history.length > 0 ? history[history.length - 1].balance_before : cumulativeBalance;

    // ========================================================================
    // STEP 8 — Sort oldest → newest for final output
    // ========================================================================

    history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // ========================================================================
    // STEP 9 — Drift detection (only meaningful if no date filter)
    // ========================================================================

    const calculatedBalance = history.length > 0
      ? history[history.length - 1].balance_after
      : cumulativeBalance;

    // ========================================================================
    // STEP 10 — Response
    // ========================================================================

    const currentBalance = round2(parseFloat(buyer.current_balance) || 0);

    return res.json({
      success: true,
      data: {
        buyer,

        balance_summary: {
          current_balance:    currentBalance,
          opening_balance:    openingBalance,
          closing_balance:    calculatedBalance,
          balance_type:       currentBalance > 0 ? 'RECEIVABLE'
                            : currentBalance < 0 ? 'CREDIT'
                            : 'SETTLED',
          display_balance:    currentBalance > 0
                                ? `المشتري مدين بـ ${currentBalance.toFixed(2)} جنيه`
                                : currentBalance < 0
                                  ? `لهم علينا ${Math.abs(currentBalance).toFixed(2)} جنيه`
                                  : 'متصفي',
          calculated_balance: calculatedBalance,
          has_drift:          !startDate && !endDate && Math.abs(currentBalance - calculatedBalance) > 0.01
        },

        // Backward-compatible fields
        current_debt:    currentBalance,
        calculated_debt: calculatedBalance,

        history,

        summary: {
          total_sales:       transactions.length,
          total_payments:    filteredPayments.length,
          total_amount_sold: round2(
            transactions.reduce(
              (sum, t) => sum + round2(parseFloat(t.final_amount || t.total_amount) || 0), 0
            )
          ),
          total_amount_paid: round2(
            transactions.reduce(
              (sum, t) => sum + round2(parseFloat(t.paid_amount) || 0), 0
            ) +
            filteredPayments.reduce(
              (sum, p) => sum + round2(parseFloat(p.amount) || 0), 0
            )
          ),
          total_credit_used: round2(
            transactions.reduce(
              (sum, t) => sum + round2(parseFloat(t.debt_applied_amount) || 0), 0
            )
          ),
          total_surplus: round2(
            transactions.reduce((sum, t) => {
              const finalAmt = round2(parseFloat(t.final_amount || t.total_amount) || 0);
              const paidAmt  = round2(parseFloat(t.paid_amount) || 0);
              return sum + round2(Math.max(0, paidAmt - finalAmt));
            }, 0)
          )
        }
      }
    });

  } catch (error) {
    console.error('Error in getBuyerDebtHistory:', error);
    return next(new AppError('خطأ في جلب سجل الرصيد', 500));
  }
};
// exports.recordDebtPayment = async (req, res,next) => {
//   const transaction = await sequelize.transaction();

//   try {
//     const { buyer_id, amount, payment_date, notes, daily_operation_id } = req.body;

//     const buyer = await Buyer.findByPk(buyer_id);

//     if (!buyer) {
//       await transaction.rollback();
//         next(new AppError( 'لم يتم العثور على المشتري',404));

//     }

//     // Record payment
//     const payment = await BuyerDebtPayment.create({
//       buyer_id,
//       daily_operation_id: daily_operation_id || null,
//       amount,
//       payment_date,
//       notes
//     }, { transaction });

//     // Update buyer's total debt
//     await buyer.update({
//       total_debt: parseFloat(buyer.total_debt) - parseFloat(amount)
//     }, { transaction });

//     await transaction.commit();

//     res.status(201).json({
//       success: true,
//       message: 'تم تسجيل سداد الدين بنجاح',
//       data: payment
//     });
//   } catch (error) {
//     await transaction.rollback();
//         next(new AppError( 'لم يتم العثور على خطأ في تسجيل سداد الديون',404));
//   }
// };
exports.recordDebtPayment = async (req, res, next) => {
  const dbTransaction = await sequelize.transaction();
 
  try {
    const {
      buyer_id,
      amount,
      daily_operation_id = null,
      notes
    } = req.body;
 
    // ========================================================================
    // STEP 1 — Basic input validation
    // ========================================================================
 
    if (!buyer_id) {
      await dbTransaction.rollback();
      return next(new AppError('buyer_id is required', 400));
    }
 
    const parsedAmount = round2(parseFloat(amount) || 0);
 
    if (parsedAmount <= 0) {
      await dbTransaction.rollback();
      return next(new AppError('Payment amount must be greater than 0', 400));
    }
 
    // ========================================================================
    // STEP 2 — Load buyer
    // ========================================================================
 
    const buyer = await Buyer.findByPk(buyer_id, {
      transaction: dbTransaction
    });
 
    if (!buyer) {
      await dbTransaction.rollback();
      return next(new AppError('لم يتم العثور على المشتري', 404));
    }
 
    const previous_balance = round2(parseFloat(buyer.current_balance) || 0);
 
    // ========================================================================
    // STEP 3 — Determine payment direction from current balance state
    // ========================================================================
 
    let payment_direction;
    let payment_description;
 
    if (previous_balance > 0) {
      // Buyer owes us → buyer pays us
      payment_direction  = 'FROM_BUYER';
      payment_description = notes || `سداد من المشتري بمبلغ ${parsedAmount.toFixed(2)} جنيه`;
 
      if (parsedAmount > previous_balance) {
        await dbTransaction.rollback();
        return next(new AppError(
          `Payment amount (${parsedAmount}) exceeds current balance (${previous_balance})`,
          400
        ));
      }
 
    } else if (previous_balance < 0) {
      // We owe buyer → we pay them
      payment_direction  = 'TO_BUYER';
      payment_description = notes || `دفع للمشتري بمبلغ ${parsedAmount.toFixed(2)} جنيه`;
 
      if (parsedAmount > Math.abs(previous_balance)) {
        await dbTransaction.rollback();
        return next(new AppError(
          `Payment amount (${parsedAmount}) exceeds credit owed to buyer (${Math.abs(previous_balance)})`,
          400
        ));
      }
 
    } else {
      // Balance is zero — nothing to settle
      await dbTransaction.rollback();
      return next(new AppError(
        'Cannot record payment: No outstanding balance exists',
        400
      ));
    }
 
    // ========================================================================
    // STEP 4 — Create BuyerDebtPayment record
    // ========================================================================
 
    const payment = await BuyerDebtPayment.create({
      buyer_id,
      daily_operation_id,
      amount:            parsedAmount,
      payment_direction,
      notes:             payment_description
    }, { transaction: dbTransaction });
 
    // ========================================================================
    // STEP 5 — Update buyer balance
    //
    // FROM_BUYER → balanceImpact = -amount  (reduces what they owe)
    // TO_BUYER   → balanceImpact = +amount  (reduces what we owe them)
    // ========================================================================
 
    const balanceInfo = await buyer.updateBalance(
      payment.balanceImpact,
      dbTransaction
    );
 
    // ========================================================================
    // STEP 6 — Commit
    // ========================================================================
 
    await dbTransaction.commit();
 
    // ========================================================================
    // STEP 7 — Response
    // ========================================================================
 
    return res.status(201).json({
      success: true,
      message: 'تم تسجيل سداد الرصيد بنجاح',
      data: {
        payment: {
          id:          payment.id,
          amount:      payment.amount,
          direction:   payment.payment_direction,
          date:        payment.payment_date,
          description: payment.displayDescription
        },
        balance_info: {
          buyer_id:          balanceInfo.buyer_id,
          buyer_name:        balanceInfo.buyer_name,
          previous_balance,
          payment_amount:    parsedAmount,
          payment_direction,
          new_balance:       balanceInfo.new_balance,
          balance_type:      balanceInfo.new_type,
          direction_changed: balanceInfo.direction_changed,
          display_balance:   balanceInfo.display_balance,
          is_settled:        balanceInfo.new_balance === 0,
 
          ...(balanceInfo.direction_changed && {
            alert: `⚠️ Balance direction changed from ${balanceInfo.previous_type} to ${balanceInfo.new_type}`
          })
        }
      }
    });
 
  } catch (error) {
    if (dbTransaction && !dbTransaction.finished) {
      await dbTransaction.rollback();
    }
 
    console.error('Error recording debt payment:', error);
    return next(new AppError('خطأ في تسجيل سداد الرصيد', 500));
  }
};
 



module.exports = exports;