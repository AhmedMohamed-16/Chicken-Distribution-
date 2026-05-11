/**
 * Report Calculations Utilities
 * 
 * Centralized calculation helpers for reporting.
 * All functions use current_balance as single source of truth for debts.
 * 
 * @module reportCalculations
 */

const { Op } = require('sequelize');

/**
 * ============================================================================
 * DEBT CALCULATIONS
 * ============================================================================
 */

/**
 * Calculate debt position from entity's current_balance
 * 
 * @param {Object} entity - Farm or Buyer instance with current_balance field
 * @returns {Object} Debt position breakdown
 * @returns {number} returns.balance - Raw current_balance value
 * @returns {string} returns.balanceType - 'RECEIVABLE' | 'PAYABLE' | 'CREDIT' | 'SETTLED'
 * @returns {number} returns.amountOwed - Absolute amount (always positive)
 * @returns {string} returns.direction - 'entity_owes_us' | 'we_owe_entity' | 'settled'
 * 
 * Business Logic:
 * - Farm/Buyer: positive = owes us (RECEIVABLE), negative = we owe them (CREDIT/PAYABLE)
 * - Zero = settled
 */
function calculateDebtPosition(entity) {
  const balance = parseFloat(entity?.current_balance || 0);
  
  if (balance > 0) {
    return {
      balance,
      balanceType: 'RECEIVABLE',
      amountOwed: balance,
      direction: 'entity_owes_us'
    };
  } else if (balance < 0) {
    return {
      balance,
      balanceType: entity.constructor?.name === 'Buyer' ? 'CREDIT' : 'PAYABLE',
      amountOwed: Math.abs(balance),
      direction: 'we_owe_entity'
    };
  }
  
  return {
    balance: 0,
    balanceType: 'SETTLED',
    amountOwed: 0,
    direction: 'settled'
  };
}

/**
 * Aggregate debt totals from array of entities
 * 
 * @param {Array} entities - Array of Farm or Buyer instances
 * @returns {Object} Aggregated debt totals
 * @returns {number} returns.totalReceivables - Sum of positive balances (owed to us)
 * @returns {number} returns.totalPayables - Sum of negative balances absolute (we owe)
 * @returns {number} returns.netPosition - Net receivables - payables
 * @returns {number} returns.countWithBalance - Number of entities with non-zero balance
 */
function aggregateDebtTotals(entities) {
  let totalReceivables = 0;
  let totalPayables = 0;
  let countWithBalance = 0;

  for (const entity of entities) {
    const balance = parseFloat(entity?.current_balance || 0);
    
    if (balance > 0) {
      totalReceivables += balance;
      countWithBalance++;
    } else if (balance < 0) {
      totalPayables += Math.abs(balance);
      countWithBalance++;
    }
  }

  return {
    totalReceivables: parseFloat(totalReceivables.toFixed(2)),
    totalPayables: parseFloat(totalPayables.toFixed(2)),
    netPosition: parseFloat((totalReceivables - totalPayables).toFixed(2)),
    countWithBalance
  };
}

/**
 * ============================================================================
 * COST CALCULATIONS (Partial Payment Aware)
 * ============================================================================
 */

/**
 * Calculate cost payment status
 * 
 * @param {Object} cost - DailyCost instance with amount, paid_amount, remaining_amount
 * @returns {Object} Payment status breakdown
 * @returns {number} returns.totalAmount - Original cost amount
 * @returns {number} returns.paidAmount - Amount already paid
 * @returns {number} returns.remainingAmount - Amount still owed
 * @returns {number} returns.paidPercentage - Percentage paid (0-100)
 * @returns {string} returns.status - 'paid' | 'partial' | 'unpaid'
 * 
 * Business Logic:
 * - Costs can be partially paid
 * - Always read from cost record, never assume full payment
 */
function calculateCostPaymentStatus(cost) {
  const totalAmount = parseFloat(cost?.amount || 0);
  const paidAmount = parseFloat(cost?.paid_amount || 0);
  const remainingAmount = parseFloat(cost?.remaining_amount ?? (totalAmount - paidAmount));
  
  const paidPercentage = totalAmount > 0 
    ? Math.min(100, (paidAmount / totalAmount) * 100) 
    : 0;
  
  let status = 'unpaid';
  if (paidPercentage >= 99.99) {
    status = 'paid';
  } else if (paidPercentage > 0) {
    status = 'partial';
  }

  return {
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    paidAmount: parseFloat(paidAmount.toFixed(2)),
    remainingAmount: parseFloat(remainingAmount.toFixed(2)),
    paidPercentage: parseFloat(paidPercentage.toFixed(2)),
    status
  };
}

/**
 * Aggregate costs with partial payment awareness
 * 
 * @param {Array} costs - Array of DailyCost instances
 * @returns {Object} Aggregated cost breakdown
 * @returns {number} returns.totalAmount - Sum of all cost amounts
 * @returns {number} returns.totalPaid - Sum of all paid amounts
 * @returns {number} returns.totalRemaining - Sum of all remaining amounts
 * @returns {number} returns.paidCount - Number of fully paid costs
 * @returns {number} returns.partialCount - Number of partially paid costs
 * @returns {number} returns.unpaidCount - Number of unpaid costs
 */
function aggregateCosts(costs) {
  let totalAmount = 0;
  let totalPaid = 0;
  let totalRemaining = 0;
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;

  for (const cost of costs) {
    const status = calculateCostPaymentStatus(cost);
    
    totalAmount += status.totalAmount;
    totalPaid += status.paidAmount;
    totalRemaining += status.remainingAmount;
    
    if (status.status === 'paid') paidCount++;
    else if (status.status === 'partial') partialCount++;
    else unpaidCount++;
  }

  return {
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    totalPaid: parseFloat(totalPaid.toFixed(2)),
    totalRemaining: parseFloat(totalRemaining.toFixed(2)),
    paidCount,
    partialCount,
    unpaidCount,
    overallPaidPercentage: totalAmount > 0 
      ? parseFloat(((totalPaid / totalAmount) * 100).toFixed(2))
      : 0
  };
}

/**
 * ============================================================================
 * PROFIT CALCULATIONS (From ProfitDistribution)
 * ============================================================================
 */

/**
 * Extract profit data from ProfitDistribution record
 * 
 * @param {Object} profitDist - ProfitDistribution instance
 * @returns {Object} Standardized profit breakdown
 * @returns {number} returns.totalRevenue - From ProfitDistribution.total_revenue
 * @returns {number} returns.totalPurchases - From ProfitDistribution.total_purchases
 * @returns {number} returns.totalLosses - From ProfitDistribution.total_losses
 * @returns {number} returns.totalCosts - From ProfitDistribution.total_costs
 * @returns {number} returns.vehicleCosts - From ProfitDistribution.vehicle_costs
 * @returns {number} returns.netProfit - From ProfitDistribution.net_profit
 * 
 * Business Logic:
 * - Never recalculate profit from transactions
 * - Always use ProfitDistribution as single source of truth
 */
function extractProfitFromDistribution(profitDist) {
  if (!profitDist) {
    return {
      totalRevenue: 0,
      totalPurchases: 0,
      totalLosses: 0,
      totalCosts: 0,
      vehicleCosts: 0,
      netProfit: 0,
      hasData: false
    };
  }

  return {
    totalRevenue: parseFloat(profitDist.total_revenue || 0),
    totalPurchases: parseFloat(profitDist.total_purchases || 0),
    totalLosses: parseFloat(profitDist.total_losses || 0),
    totalCosts: parseFloat(profitDist.total_costs || 0),
    vehicleCosts: parseFloat(profitDist.vehicle_costs || 0),
    netProfit: parseFloat(profitDist.net_profit || 0),
    hasData: true
  };
}

/**
 * Aggregate profit distributions
 * 
 * @param {Array} profitDists - Array of ProfitDistribution instances
 * @returns {Object} Aggregated profit totals
 */
function aggregateProfits(profitDists) {
  return profitDists.reduce((acc, pd) => {
    const profit = extractProfitFromDistribution(pd);
    return {
      totalRevenue: acc.totalRevenue + profit.totalRevenue,
      totalPurchases: acc.totalPurchases + profit.totalPurchases,
      totalLosses: acc.totalLosses + profit.totalLosses,
      totalCosts: acc.totalCosts + profit.totalCosts,
      vehicleCosts: acc.vehicleCosts + profit.vehicleCosts,
      netProfit: acc.netProfit + profit.netProfit,
      count: acc.count + 1
    };
  }, {
    totalRevenue: 0,
    totalPurchases: 0,
    totalLosses: 0,
    totalCosts: 0,
    vehicleCosts: 0,
    netProfit: 0,
    count: 0
  });
}

/**
 * ============================================================================
 * CASH FLOW CALCULATIONS
 * ============================================================================
 */

/**
 * Calculate cash flow from profit distribution (accrual basis)
 * 
 * @param {Object} profitData - Profit data from extractProfitFromDistribution
 * @returns {Object} Cash flow breakdown
 * @returns {number} returns.revenueInflow - Expected cash from sales
 * @returns {number} returns.purchaseOutflow - Cash paid for purchases
 * @returns {number} returns.costOutflow - Cash paid for costs
 * @returns {number} returns.netCashFlow - Net cash movement
 * 
 * Note: This is simplified. True cash flow needs actual payment records.
 */
function calculateAccrualCashFlow(profitData) {
  return {
    revenueInflow: profitData.totalRevenue,
    purchaseOutflow: profitData.totalPurchases,
    costOutflow: profitData.totalCosts,
    netCashFlow: profitData.netProfit
  };
}

/**
 * ============================================================================
 * OPERATIONAL METRICS
 * ============================================================================
 */

/**
 * Calculate weighted average price from transactions
 * 
 * @param {Array} transactions - Array of transactions with price_per_kg and weight
 * @param {string} weightField - Field name for weight (e.g., 'net_weight' or 'net_chicken_weight')
 * @returns {number} Weighted average price per kg
 */
function calculateWeightedAveragePrice(transactions, weightField = 'net_weight') {
  let totalAmount = 0;
  let totalWeight = 0;

  for (const tx of transactions) {
    const weight = parseFloat(tx[weightField] || 0);
    const price = parseFloat(tx.price_per_kg || 0);
    totalAmount += weight * price;
    totalWeight += weight;
  }

  return totalWeight > 0 
    ? parseFloat((totalAmount / totalWeight).toFixed(2))
    : 0;
}

/**
 * Calculate loss metrics
 * 
 * @param {Array} losses - Array of TransportLoss instances
 * @param {number} totalPurchasedKg - Total purchased weight for context
 * @returns {Object} Loss metrics
 */
function calculateLossMetrics(losses, totalPurchasedKg = 0) {
  const totalLostKg = losses.reduce((sum, l) => sum + parseFloat(l.dead_weight || 0), 0);
  const totalLossAmount = losses.reduce((sum, l) => sum + parseFloat(l.loss_amount || 0), 0);
  
  return {
    totalLostKg: parseFloat(totalLostKg.toFixed(2)),
    totalLossAmount: parseFloat(totalLossAmount.toFixed(2)),
    lossPercentage: totalPurchasedKg > 0 
      ? parseFloat(((totalLostKg / totalPurchasedKg) * 100).toFixed(2))
      : 0,
    count: losses.length
  };
}

/**
 * ============================================================================
 * PERCENTAGE & FORMATTING
 * ============================================================================
 */

/**
 * Calculate percentage safely (avoiding division by zero)
 * 
 * @param {number} numerator - Numerator value
 * @param {number} denominator - Denominator value
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {number} Percentage value
 */
function safePercentage(numerator, denominator, decimals = 2) {
  const num = parseFloat(numerator || 0);
  const den = parseFloat(denominator || 0);
  
  if (den === 0) return 0;
  
  const pct = (num / den) * 100;
  return parseFloat(pct.toFixed(decimals));
}

/**
 * Format currency value
 * 
 * @param {number} value - Value to format
 * @param {number} decimals - Decimal places (default: 2)
 * @returns {number} Formatted number
 */
function formatCurrency(value, decimals = 2) {
  return parseFloat(parseFloat(value || 0).toFixed(decimals));
}

module.exports = {
  // Debt calculations
  calculateDebtPosition,
  aggregateDebtTotals,
  
  // Cost calculations
  calculateCostPaymentStatus,
  aggregateCosts,
  
  // Profit calculations
  extractProfitFromDistribution,
  aggregateProfits,
  
  // Cash flow
  calculateAccrualCashFlow,
  
  // Operational metrics
  calculateWeightedAveragePrice,
  calculateLossMetrics,
  
  // Utilities
  safePercentage,
  formatCurrency
};
