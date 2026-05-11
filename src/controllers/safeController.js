const { Safe, FinancialTransaction, sequelize } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../utils/app-error.utility');
const { formatToDateString } = require('../utils/formatDate');
const { round2, sanitizeAmount } = require('../utils/financialUtils');

exports.getAllSafes = async (req, res, next) => {
  try {
    const safes = await Safe.findAll({ order: [['name', 'ASC']] });
    return res.json({ success: true, data: safes });
  } catch (error) {
    next(new AppError('حدث خطأ أثناء جلب الخزنات'));
  }
};

exports.getSafeById = async (req, res, next) => {
  try {
    const safe = await Safe.findByPk(req.params.id);
    if (!safe) {
      return next(new AppError('لم يتم العثور على الخزنة', 404));
    }

    // Get recent transactions using new payment_source pattern
    const recentTransactions = await FinancialTransaction.findAll({
      where: {
        payment_source_type: 'SAFE',
        payment_source_id: safe.id
      },
      order: [['created_at', 'DESC']],
      limit: 10
    });

    return res.json({ 
      success: true, 
      data: { 
        ...safe.toJSON(),
        recent_transactions: recentTransactions 
      } 
    });
  } catch (error) {
    next(new AppError('حدث خطأ أثناء جلب بيانات الخزنة'));
  }
};

exports.createSafe = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { name, type, notes, is_active, current_balance: rawBalance } = req.body;
        const openingBalance = rawBalance !== undefined ? parseFloat(rawBalance) || 0 : 0;

    // 1. Create safe with ZERO balance
    const safe = await Safe.create({
      name,
      type,
      notes: notes || null,
      is_active: is_active === false ? false : true,
      current_balance: 0
    }, { transaction: t });
    // 2. Create opening transaction (لو فيه رصيد)
    if (openingBalance !== 0) {
      await FinancialTransaction.create({
        transaction_type: 'OPENING_BALANCE',
        payment_source_type: 'SAFE',
        payment_source_id: safe.id,
        amount: Math.abs(openingBalance),
        direction: openingBalance > 0 ? 'IN' : 'OUT',
        description: 'رصيد أول المدة'
      }, { transaction: t });

      // 3. Update safe balance
      await safe.updateBalance(openingBalance, t);
    }

    await t.commit();

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الخزنة بنجاح',
      data: safe
    });

  } catch (error) {
    await t.rollback();
    next(new AppError('حدث خطأ أثناء إنشاء الخزنة'));
  }
};

exports.updateSafe = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const safe = await Safe.findByPk(req.params.id);
    if (!safe) {
      return next(new AppError('لم يتم العثور على الخزنة', 404));
    }

    const { name, notes, is_active, current_balance: rawBalance } = req.body;

    const updateData = {
      ...(name !== undefined && { name }),
      ...(notes !== undefined && { notes }),
      ...(is_active !== undefined && { is_active })
    };

    if (rawBalance !== undefined) {
      const newBalance = parseFloat(rawBalance) || 0;
      const oldBalance = parseFloat(safe.current_balance) || 0;
    // 🚨 SECURITY: Direct balance manipulation removed.
    // Balance changes MUST go through financial transactions only
    // (sales, purchases, costs, etc.) to maintain audit trail integrity.
    // The `current_balance` field in request body is IGNORED.

      const diff = newBalance - oldBalance;

      if (diff !== 0) {
        // 1. سجل transaction بالفرق
        await FinancialTransaction.create({
          transaction_type: 'BALANCE_ADJUSTMENT',
          payment_source_type: 'SAFE',
          payment_source_id: safe.id,
          amount: Math.abs(diff),
          direction: diff > 0 ? 'IN' : 'OUT',
          description: 'تعديل يدوي على الرصيد'
        }, { transaction: t });

        // 2. حدث الرصيد
        await safe.updateBalance(diff, t);
      }
    }

    // باقي التحديثات
    await safe.update(updateData, { transaction: t });

    await t.commit();

    return res.json({
      success: true,
      message: 'تم تحديث الخزنة بنجاح',
      data: safe
    });

  } catch (error) {
    await t.rollback();
    next(new AppError('حدث خطأ أثناء تحديث الخزنة'));
  }
};
exports.getSafeSummary = async (req, res, next) => {
  try {
    const totals = await Safe.getTotalByType();
    return res.json({ success: true, data: totals });
  } catch (error) {
    next(new AppError('حدث خطأ أثناء جلب ملخص الخزنات'));
  }
};

/**
 * getSafeLedger — Audit report for a specific safe
 * GET /api/safes/:id/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
exports.getSafeLedger = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
      return next(new AppError('التاريخ من وإلى مطلوبين', 400));
    }

    const safe = await Safe.findByPk(id);
    if (!safe) return next(new AppError('الخزنة غير موجودة', 404));

    // ─── 1. Fetch All Transactions from 'start' until NOW (for backward reconstruction) ───
    const dateStr = formatToDateString(from);
    const startOfDay = `${dateStr} 00:00:00`;
    
    // We fetch everything from start until NOW to reconstruct balance backwards from current truth
    const allRecentTransactions = await FinancialTransaction.findAll({
      where: {
        payment_source_type: 'SAFE',
        payment_source_id: id,
        created_at: { [Op.gte]: startOfDay }
      },
      order: [['created_at', 'DESC']], // Newest first
      raw: true
    });

    // ─── 2. Reconstruct Opening Balance ───
    const recordedBalance = parseFloat(safe.current_balance) || 0;
    let runningReconstruction = recordedBalance;

    // To find opening balance, we subtract 'IN' and add 'OUT' from current balance
    allRecentTransactions.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      runningReconstruction += t.direction === 'IN' ? -amt : amt;
    });

    const openingBalance = runningReconstruction;

    // ─── 3. Filter Period Transactions for Display ───
    const dateStrTo = formatToDateString(to);
    const endOfDay = `${dateStrTo} 23:59:59.999999`;

    const periodTransactions = allRecentTransactions
      .filter(t => new Date(t.created_at) <= new Date(endOfDay))
      .reverse(); // Order ASC for ledger display

    // ─── 4. Build Ledger with Running Balance ───
    let currentRunning = openingBalance;
    const ledger = periodTransactions.map(t => {
      const amt = parseFloat(t.amount) || 0;
      currentRunning = round2(currentRunning + (t.direction === 'IN' ? amt : -amt));

      return {
        ...t,
        amount: amt,
        running_balance: currentRunning,
        type: t.transaction_type,
        reference: `${t.reference_type || ''} #${t.reference_id || ''}`
      };
    });

    const closingBalance = currentRunning;

    // ─── 5. Closing = آخر قيمة للـ running ───
    const discrepancy     = recordedBalance - closingBalance;

    let warning = null;
    if (Math.abs(discrepancy) > 0.01) {
      warning = discrepancy > 0
        ? `يوجد زيادة في رصيد الخزنة بمقدار ${discrepancy.toFixed(2)} ج.م`
        : `يوجد عجز في رصيد الخزنة بمقدار ${Math.abs(discrepancy).toFixed(2)} ج.م`;
    }
console.log("data:", {
        safe: {
          id:              safe.id,
          name:            safe.name,
          type:            safe.type,
          current_balance: recordedBalance
        },
        period:          { from, to },
        opening_balance: openingBalance,   // ✅ حسبناه من الـ DB فعلًا
        transactions:    ledger,
        closing_balance: closingBalance,   // ✅ opening + حركات الفترة
        recorded_balance: recordedBalance,
        discrepancy,
        warning
      });

    return res.json({
      success: true,
      data: {
        safe: {
          id:              safe.id,
          name:            safe.name,
          type:            safe.type,
          current_balance: recordedBalance
        },
        period:          { from, to },
        opening_balance: openingBalance,   // ✅ حسبناه من الـ DB فعلًا
        transactions:    ledger,
        closing_balance: closingBalance,   // ✅ opening + حركات الفترة
        recorded_balance: recordedBalance,
        discrepancy,
        warning
      }
    });

  } catch (error) {
    next(new AppError('Error generating safe ledger: ' + error.message, 500));
  }
};

/**
 * getSafeDashboard — High level overview of all safes
 * GET /api/safes/dashboard
 */
exports.getSafeDashboard = async (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';

    const whereClause = includeInactive ? {} : { is_active: true };
    const safes = await Safe.findAll({ where: whereClause });
     // const todayStr = new Date().toISOString().split('T')[0];
  const dateStr = formatToDateString(new Date());
  const startOfDay = `${dateStr} 00:00:00`;
  const endOfDay = `${dateStr} 23:59:59.999999`;
  
 
    const dashboard = await Promise.all(safes.map(async (safe) => {
      // Aggregates using new payment_source pattern
      // FIX: Use parameterized query instead of string interpolation to prevent SQL injection
      const stats = await FinancialTransaction.findAll({
        where: { 
          payment_source_type: 'SAFE',
          payment_source_id: safe.id 
        },
        attributes: [
          'direction',
          [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
          [sequelize.fn('SUM', 
            sequelize.literal(`CASE WHEN created_at BETWEEN :startOfDay AND :endOfDay THEN amount ELSE 0 END`)
          ), 'today_total']
        ],
        replacements: { startOfDay, endOfDay },
        group: ['direction'],
        raw: true
      });

      const data = {
        id: safe.id,
        name: safe.name,
        type: safe.type,
        is_active: safe.is_active,
        current_balance: parseFloat(safe.current_balance) || 0,
        total_in_today: 0,
        total_out_today: 0,
        total_in_alltime: 0,
        total_out_alltime: 0
      };

      stats.forEach(s => {
        const total = parseFloat(s.total) || 0;
        const today = parseFloat(s.today_total) || 0;
        if (s.direction === 'IN') {
          data.total_in_alltime = total;
          data.total_in_today = today;
        } else {
          data.total_out_alltime = total;
          data.total_out_today = today;
        }
      });

      return data;
    }));
    console.log(dashboard);
    
    return res.json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    next(new AppError('Error generating safe dashboard: ' + error.message, 500));
  }
};
