const { Partner, PartnerWithdrawal, PartnerReinvestment, PartnerProfit, Safe, sequelize, ProfitDistribution } = require('../models');
const { logTransaction } = require('../utils/transactionLogger');
const { sanitizeAmount } = require('../utils/financialUtils');
const AppError = require('../utils/app-error.utility');
const { Op } = require('sequelize'); 
 
/**
 * @route   POST /api/partners/:id/withdrawal
 * @desc    Record a partner profit withdrawal (Money OUT)
 * @access  Admin only
 */
exports.recordWithdrawal = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { amount, withdrawal_date, safe_id, payment_method, notes } = req.body;

    // 1. Load Partner
    const partner = await Partner.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!partner) {
      await t.rollback();
      return next(new AppError('الشريك غير موجود', 404));
    }

    let withdrawAmount;
    try {
      withdrawAmount = sanitizeAmount(amount);
    } catch (error) {
      await t.rollback();
      return next(new AppError(error.message, 400));
    }

    // 2. Validate Balance
    if (withdrawAmount > parseFloat(partner.current_balance)) {
      await t.rollback();
      return next(new AppError('رصيد الشريك غير كافٍ للسحب', 400));
    }

    // 3. Create Withdrawal Record
    const withdrawal = await PartnerWithdrawal.create({
      partner_id: id,
      amount: withdrawAmount,
      withdrawal_date: withdrawal_date || new Date(),
      processed_by_user_id: req.user.id,
      safe_id: safe_id || null,
      payment_method: payment_method || 'CASH',
      notes
    }, { transaction: t });

    // 4. Deduct from Partner Balance
    await partner.withdraw(withdrawAmount, t);

    // 5. Deduct from Safe
    if (safe_id) {
      const safe = await Safe.findByPk(safe_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!safe) {
        await t.rollback();
        return next(new AppError('الخزينة المحددة غير موجودة', 404));
      }

      if (parseFloat(safe.current_balance) < withdrawAmount) {
        await t.rollback();
        return next(new AppError('رصيد الخزنة غير كافٍ لهذا السحب', 400));
      }

      await safe.updateBalance(-withdrawAmount, t);
    }

    // 6. Log Financial Transaction
    await logTransaction({
      transaction_type: 'PARTNER_WITHDRAWAL',
      direction: 'OUT',
      amount: withdrawAmount,
      payment_source_type: safe_id ? 'SAFE' : null,
      payment_source_id: safe_id || null,
      reference_type: 'PartnerWithdrawal',
      reference_id: withdrawal.id,
      performed_by_user_id: req.user.id,
      payment_method: payment_method || 'CASH',
      received_by_person_type:'PARTNER',
      received_by_person_id:id,
      notes: `سحب أرباح لشريك: ${partner.name}. ${notes || ''}`
    }, t);

    await t.commit();

    res.status(201).json({
      success: true,
      message: 'تم تسجيل سحب الأرباح بنجاح',
      data: {
        withdrawal,
        // Reload the updated value after withdraw()
        new_balance: parseFloat(partner.current_balance)
      }
    });

  } catch (error) {
    if (t) await t.rollback();
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/partners/:id/balance
 * @desc    Get detailed balance report for a single partner
 */
exports.getPartnerBalance = async (req, res, next) => {
  try {
    const partner = await Partner.findByPk(req.params.id);
    if (!partner) {
      return next(new AppError('الشريك غير موجود', 404));
    }

    // Total profits ever added (historical reference)
    const totalProfits = parseFloat(
      await PartnerProfit.sum('final_profit', { where: { partner_id: req.params.id } }) || 0
    );

    // Total amount ever withdrawn (historical reference)
    const totalWithdrawn = parseFloat(
      await PartnerWithdrawal.sum('amount', { where: { partner_id: req.params.id } }) || 0
    );

    // Total amount ever reinvested (historical reference)
    const totalReinvested = parseFloat(
      await PartnerReinvestment.sum('amount', { where: { partner_id: req.params.id } }) || 0
    );

    // current_balance IS the live running balance (profits added - withdrawals deducted)
    const currentBalance = parseFloat(partner.current_balance);

    // accumulated_profit for display = sum of all profits recorded (not reduced by withdrawals)
    const accumulatedProfit = totalProfits;

    res.status(200).json({
      success: true,
      data: {
        partner_id: partner.id,
        partner_name: partner.name,
        // Total profits ever earned (historical sum)
        accumulated_profit: accumulatedProfit,
        // Total amount already withdrawn
        total_withdrawn: totalWithdrawn,
        // Total amount already reinvested
        total_reinvested: totalReinvested,
        // Available balance to withdraw now  ← THE KEY FIELD
        current_balance: currentBalance
      }
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   GET /api/partners/balances
 * @desc    Get all partners with their current profit balances (with pagination)
 */
exports.getAllPartnersBalance = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Get total count for pagination metadata
    const totalCount = await Partner.count();

    // Get paginated partners
    const partners = await Partner.findAll({
      attributes: ['id', 'name', 'current_balance', 'investment_percentage'],
      order: [['name', 'ASC']],
      limit: limit,
      offset: offset
    });

    const partnerIds = partners.map(p => p.id);

    // Total profits ever earned per partner (historical reference)
    const profitRows = await PartnerProfit.findAll({
      where: { partner_id: partnerIds },
      attributes: [
        'partner_id',
        [sequelize.fn('SUM', sequelize.col('final_profit')), 'total_profits']
      ],
      group: ['partner_id']
    });

    // Total withdrawals per partner (historical reference)
    const withdrawalRows = await PartnerWithdrawal.findAll({
      where: { partner_id: partnerIds },
      attributes: [
        'partner_id',
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_withdrawn']
      ],
      group: ['partner_id']
    });

    // Total reinvestments per partner (historical reference)
    const reinvestmentRows = await PartnerReinvestment.findAll({
      where: { partner_id: partnerIds },
      attributes: [
        'partner_id',
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_reinvested']
      ],
      group: ['partner_id']
    });

    const profitsMap = {};
    profitRows.forEach(r => {
      profitsMap[r.partner_id] = parseFloat(r.get('total_profits') || 0);
    });

    const withdrawalsMap = {};
    withdrawalRows.forEach(r => {
      withdrawalsMap[r.partner_id] = parseFloat(r.get('total_withdrawn') || 0);
    });

    const reinvestmentsMap = {};
    reinvestmentRows.forEach(r => {
      reinvestmentsMap[r.partner_id] = parseFloat(r.get('total_reinvested') || 0);
    });

    const formattedData = partners.map(partner => {
      // current_balance = live running balance (already accounts for all profits & withdrawals)
      const currentBalance    = parseFloat(partner.current_balance || 0);
      // accumulated_profit = historical sum of all profits (reference only)
      const accumulatedProfit = profitsMap[partner.id] || 0;
      const totalWithdrawn    = withdrawalsMap[partner.id] || 0;
      const totalReinvested   = reinvestmentsMap[partner.id] || 0;

      return {
        partner: {
          id: partner.id,
          name: partner.name,
          investment_percentage: parseFloat(partner.investment_percentage || 0)
        },
        // How much profit was ever earned (for display/info)
        accumulated_profit: accumulatedProfit,
        // How much was ever withdrawn (for display/info)
        total_withdrawn: totalWithdrawn,
        // How much was ever reinvested (for display/info)
        total_reinvested: totalReinvested,
        // Available balance right now = current_balance (the authoritative value)
        current_balance: currentBalance
      };
    });

    const hasMore = offset + limit < totalCount;

    res.status(200).json({
      success: true,
      count: formattedData.length,
      data: formattedData,
      meta: {
        page,
        limit,
        total: totalCount,
        hasMore
      }
    });
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};


/**
 * @route  GET /api/partners/:id/withdrawals
 * @desc   Get paginated withdrawal history for a partner
 * @query  page    (default 1)
 * @query  limit   (default 10)
 * @query  from    optional ISO date string
 * @query  to      optional ISO date string
 */
exports.getAllWithdrawals = async (req, res, next) => {
  try {
    const partnerId = req.params.id;
 
    // ── Parse pagination params ──────────────────────────────────────────────
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
 
    // ── Optional date range filter ───────────────────────────────────────────
    const { from, to } = req.query;
    const where = { partner_id: partnerId };
 
    if (from || to) {
      where.withdrawal_date = {};
      if (from) where.withdrawal_date[Op.gte] = from;
      if (to)   where.withdrawal_date[Op.lte] = to;
    }
 
    // ── Query with count ─────────────────────────────────────────────────────
    const { count, rows: withdrawals } = await PartnerWithdrawal.findAndCountAll({
      where,
      include: [
        {
          model: Safe,
          as: 'safe',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      order: [
        ['withdrawal_date', 'DESC'],
        ['created_at',      'DESC']
      ],
      limit,
      offset
    });
 
    const totalPages = Math.ceil(count / limit);
    const hasMore    = page < totalPages;
 
    return res.status(200).json({
      success: true,
      count:   withdrawals.length,
      data:    withdrawals,
      meta: {
        page,
        limit,
        total:    count,
        hasMore,
        totalPages
      }
    });
 
  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route   POST /api/partners/:id/reinvest
 * @desc    Record profit reinvestment (profit → capital, Money INTERNAL)
 * @access  Admin only
 */
  

exports.recordReinvestment = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { amount, reinvest_date, notes } = req.body;

    // 1. Load Partner with lock
    const partner = await Partner.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!partner) {
      await t.rollback();
      return next(new AppError('الشريك غير موجود', 404));
    }

    // 2. Sanitize amount
    let reinvestAmount;
    try {
      reinvestAmount = sanitizeAmount(amount);
    } catch (error) {
      await t.rollback();
      return next(new AppError(error.message, 400));
    }

    const currentBalance = Number(partner.current_balance) || 0;

    // 3. Validate balance
    if (reinvestAmount > currentBalance) {
      await t.rollback();
      return next(new AppError('رصيد الأرباح غير كافٍ لإعادة الاستثمار', 400));
    }

    // 4. Create reinvestment record
    const reinvestment = await PartnerReinvestment.create({
      partner_id: id,
      amount: reinvestAmount,
      reinvest_date: reinvest_date || new Date(),
      processed_by_user_id: req.user.id,
      notes
    }, { transaction: t });

    // 5. Apply reinvestment safely
    await partner.reinvest(reinvestAmount, t);

    // 6. Log transaction
    await logTransaction({
      transaction_type: 'PARTNER_REINVESTMENT',
      direction: 'IN',
      amount: reinvestAmount,
      reference_type: 'PartnerReinvestment',
      reference_id: reinvestment.id,
      performed_by_user_id: req.user.id,
      notes: `إعادة استثمار أرباح لشريك: ${partner.name}. ${notes || ''}`
    }, t);

    await t.commit();

    res.status(201).json({
      success: true,
      message: 'تم إعادة استثمار الأرباح بنجاح',
      data: {
        reinvestment,
        new_balance: Number(partner.current_balance),
        new_investment_amount: Number(partner.investment_amount)
      }
    });

  } catch (error) {
    await t.rollback();
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route  GET /api/partners/:id/reinvestments  
 * @desc   Get paginated reinvestment history (mirror withdrawals)
 */
exports.getAllReinvestments = async (req, res, next) => {
  try {
    const partnerId = req.params.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const { from, to } = req.query;
    const where = { partner_id: partnerId };

    if (from || to) {
      where.reinvest_date = {};
      if (from) where.reinvest_date[Op.gte] = from;
      if (to)   where.reinvest_date[Op.lte] = to;
    }

    const { count, rows: reinvestments } = await PartnerReinvestment.findAndCountAll({
      where,
      order: [
        ['reinvest_date', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);
    const hasMore = page < totalPages;

    return res.status(200).json({
      success: true,
      count: reinvestments.length,
      data: reinvestments,
      meta: {
        page,
        limit,
        total: count,
        hasMore,
        totalPages
      }
    });

  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};

/**
 * @route  GET /api/partners/:id/transactions
 * @desc   Combined paginated history (withdrawals + reinvestments)
 */
exports.getTransactionsHistory = async (req, res, next) => {
  try {
    const partnerId = req.params.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const { from, to } = req.query;

    // Query withdrawals
    const withdrawalWhere = { partner_id: partnerId };
    if (from || to) {
      withdrawalWhere.withdrawal_date = {};
      if (from) withdrawalWhere.withdrawal_date[Op.gte] = from;
      if (to) withdrawalWhere.withdrawal_date[Op.lte] = to;
    }

    const { count: withdrawalCount, rows: withdrawals } = await PartnerWithdrawal.findAndCountAll({
      where: withdrawalWhere,
      include: [{ model: Safe, as: 'safe', attributes: ['id', 'name'], required: false }],
      order: [['withdrawal_date', 'DESC'], ['created_at', 'DESC']],
      limit,
      offset
    });

    // Query reinvestments  
    const reinvestmentWhere = { partner_id: partnerId };
    if (from || to) {
      reinvestmentWhere.reinvest_date = {};
      if (from) reinvestmentWhere.reinvest_date[Op.gte] = from;
      if (to) reinvestmentWhere.reinvest_date[Op.lte] = to;
    }

    const { count: reinvestmentCount, rows: reinvestments } = await PartnerReinvestment.findAndCountAll({
      where: reinvestmentWhere,
      order: [['reinvest_date', 'DESC'], ['created_at', 'DESC']],
      limit,
      offset
    });

    // Query Partner Profits
    const profitWhere = { partner_id: partnerId };
    if (from || to) {
      const profitFrom = from || '1970-01-01';
      const profitTo = to || '2100-01-01';
      // FIX: Use Sequelize原生Op.between instead of raw SQL interpolation
      profitWhere['$profit_distribution.calculated_at$'] = {
        [Op.between]: [profitFrom, profitTo]
      };
    }

    const { count: profitCount, rows: profits } = await PartnerProfit.findAndCountAll({
      where: profitWhere,
      include: [
        {
          model: ProfitDistribution,
          as: 'profit_distribution',
          attributes: ['id', 'calculated_at']
        }
      ],
      order: [['id', 'DESC']],
      limit,
      offset
    });

    // Combine + normalize
    const transactions = [
      ...withdrawals.map(w => ({
        id: w.id,
        type: 'WITHDRAWAL',
        amount: -parseFloat(w.amount),  // Negative for withdrawal
        date: w.withdrawal_date,
        safe: w.safe,
        notes: w.notes,
        processed_by_user_id: w.processed_by_user_id
      })),
      ...reinvestments.map(r => ({
        id: r.id,
        type: 'REINVESTMENT',
        amount: -parseFloat(r.amount),  // Negative impact on PROFIT balance (it moved to capital)
        date: r.reinvest_date,
        notes: r.notes,
        processed_by_user_id: r.processed_by_user_id
      })),
      ...profits.map(p => ({
        id: p.id,
        type: 'PROFIT',
        amount: parseFloat(p.final_profit), // Positive for profit
        date: p.profit_distribution?.calculated_at,
        notes: `ربح من دورة توزيع رقم #${p.profit_distribution_id}`,
        base_profit_share: parseFloat(p.base_profit_share),
        vehicle_cost_share: parseFloat(p.vehicle_cost_share)
      }))
    ];

    // Sort by date DESC
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Pagination slice (since we merged multiple sources, total count is the sum)
    const totalCount = withdrawalCount + reinvestmentCount + profitCount;
    const paginated = transactions.slice(0, limit);

    return res.status(200).json({
      success: true,
      count: paginated.length,
      data: paginated,
      meta: {
        page,
        limit,
        total: totalCount,
        hasMore: offset + limit < totalCount
      }
    });

  } catch (error) {
    return next(new AppError(error.message, 500));
  }
};
