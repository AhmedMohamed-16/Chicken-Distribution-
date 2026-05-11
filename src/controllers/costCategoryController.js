// src/controllers/costCategoryController.js

const { CostCategory, DailyCost, CostDebtPayment, DailyOperation } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Get all cost categories with active balances
 * GET /api/cost-balances
 */
exports.getCategoryBalances = async (req, res) => {
  try {
    const categories = await CostCategory.getActiveBalances();
    
    // Group into payables (we owe them) and receivables (they owe us)
    const payables = categories.filter(c => c.current_balance < 0);
    const receivables = categories.filter(c => c.current_balance > 0);

    res.status(200).json({
      success: true,
      data: {
        all: categories,
        payables,
        receivables
      }
    });
  } catch (error) {
    console.error('Error fetching cost balances:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error fetching cost balances',
      error: error.message
    });
  }
};

/**
 * Get overall summary of cost related debt
 * GET /api/cost-balances/summary
 */
exports.getCostSummary = async (req, res) => {
  try {
    const result = await CostCategory.findAll({
      attributes: [
        [sequelize.fn('SUM', 
          sequelize.literal('CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END')
        ), 'total_receivables'],
        [sequelize.fn('SUM', 
          sequelize.literal('CASE WHEN current_balance < 0 THEN ABS(current_balance) ELSE 0 END')
        ), 'total_payables'],
        [sequelize.fn('SUM', sequelize.col('current_balance')), 'net_position'],
        [sequelize.fn('COUNT', 
          sequelize.literal('CASE WHEN current_balance > 0 THEN 1 END')
        ), 'receivables_count'],
        [sequelize.fn('COUNT', 
          sequelize.literal('CASE WHEN current_balance < 0 THEN 1 END')
        ), 'payables_count']
      ],
      raw: true
    });
    
    const data = result[0];
    const summary = {
      total_receivables: parseFloat(data.total_receivables) || 0,
      total_payables: parseFloat(data.total_payables) || 0,
      net_position: parseFloat(data.net_position) || 0,
      receivables_count: parseInt(data.receivables_count) || 0,
      payables_count: parseInt(data.payables_count) || 0,
      position_type: data.net_position > 0 ? 'NET_RECEIVABLE' : 
                     data.net_position < 0 ? 'NET_PAYABLE' : 'BALANCED'
    };

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching cost balance summary:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error fetching cost balance summary',
      error: error.message
    });
  }
};

/**
 * Get full statement (ledger) for a specific category
 * GET /api/cost-balances/statement/:id
 */
exports.getCategoryStatement = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const { start_date, end_date } = req.query;

    const category = await CostCategory.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'التصنيف غير موجود' });
    }

    // Build date filters
    const costDateFilter = {};
    const paymentDateFilter = {};
    
    if (start_date && end_date) {
      costDateFilter.recorded_at = { [Op.between]: [new Date(start_date), new Date(end_date)] };
      paymentDateFilter.payment_date = { [Op.between]: [new Date(start_date), new Date(end_date)] };
    }

    // Fetch Costs
    const costs = await DailyCost.findAll({
      where: { cost_category_id: categoryId, ...costDateFilter },
      include: [
        { model: DailyOperation, as: 'operation', attributes: ['id', 'operation_date'] }
      ],
      order: [['recorded_at', 'ASC']]
    });

    // Fetch Payments
    const payments = await CostDebtPayment.findAll({
      where: { cost_category_id: categoryId, ...paymentDateFilter },
      order: [['payment_date', 'ASC']]
    });

    // Generate chronological ledger
    const ledger = [];
    
    // Add costs (Increases PAYABLE, decreases RECEIVABLE. Impact = paid_amount - total_amount)
    costs.forEach(c => {
      const amount = parseFloat(c.amount);
      const paid_amount = parseFloat(c.paid_amount) || 0;
      ledger.push({
        type: 'COST_INC',
        date: c.recorded_at,
        amount: amount,
        paid_amount: paid_amount,
        balance_impact: paid_amount - amount,
        description: `تكلفة: ${c.description || 'بدون وصف'}`,
        record: c
      });
    });

    // Add payments (Impact depends on direction)
    payments.forEach(p => {
      ledger.push({
        type: p.payment_direction, // 'TO_CATEGORY' or 'FROM_CATEGORY'
        date: p.payment_date,
        amount: parseFloat(p.amount),
        balance_impact: p.balanceImpact, // Use the getter
        description: p.displayDescription, // Use getter
        record: p
      });
    });

    // ─── Calculate Opening Balance using Backward Reconstruction ───
    const recordedBalance = parseFloat(category.current_balance) || 0;
    
    // 1. Fetch ALL transactions from start_date until NOW
    const recentDateFilter = start_date ? { [Op.gte]: new Date(start_date) } : null;
    
    const [allRecentCosts, allRecentPayments] = await Promise.all([
      DailyCost.findAll({
        where: { 
          cost_category_id: categoryId, 
          ...(recentDateFilter && { recorded_at: recentDateFilter })
        },
        raw: true
      }),
      CostDebtPayment.findAll({
        where: { 
          cost_category_id: categoryId, 
          ...(recentDateFilter && { payment_date: recentDateFilter })
        },
        raw: true
      })
    ]);

    // 2. Reconstruct backwards to find opening balance
    let runningReconstruction = recordedBalance;
    
    // Reverse impact of costs: Subtract (paid - total)
    allRecentCosts.forEach(c => {
      const impact = (parseFloat(c.paid_amount) || 0) - parseFloat(c.amount);
      runningReconstruction -= impact;
    });
    
    // Reverse impact of payments: 
    // If direction was TO_CATEGORY (we paid them), it increased our balance (if negative) or decreased if positive...
    // Actually, balanceImpact getter handles it. For backward reconstruction, we subtract the impact.
    allRecentPayments.forEach(p => {
      // Impact = p.payment_direction === 'FROM_CATEGORY' ? -amt : amt;
      const amt = parseFloat(p.amount);
      const impact = p.payment_direction === 'FROM_CATEGORY' ? -amt : amt;
      runningReconstruction -= impact;
    });

    const openingBalance = runningReconstruction;

    // Sort ledger by date
    ledger.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance incrementally starting from opening balance
    let runningBalance = openingBalance;
    ledger.forEach(entry => {
      runningBalance += entry.balance_impact;
      entry.running_balance = runningBalance;
    });

    res.status(200).json({
      success: true,
      data: {
        category,
        ledger,
        opening_balance: openingBalance,
        current_balance: parseFloat(category.current_balance),
        balance_type: category.balanceType,
        display_balance: category.displayBalance
      }
    });

  } catch (error) {
    console.error('Error fetching category statement:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error fetching category statement',
      error: error.message
    });
  }
};
