// src/controllers/financialTransactionController.js
const { FinancialTransaction, User, DailyOperation, ProfitDistribution, PartnerProfit, Partner, Vehicle } = require('../models');
const { Op } = require('sequelize');
const { formatToDateString } = require('../utils/formatDate');
const ProfitService = require('../services/ProfitService');

/**
 * Get financial transactions with optional filtering
 * GET /api/financial-transactions
 */
exports.getTransactions = async (req, res) => {
  try {
    const { date, type, safe_id, payment_source_type, payment_source_id, direction, limit, offset } = req.query;
    const dateStr = formatToDateString(date);
    const startOfDay = `${dateStr} 00:00:00`;
    const endOfDay = `${dateStr} 23:59:59.999999`;

    const whereClause = {};
    if (date) whereClause.created_at = {
        [Op.between]: [startOfDay, endOfDay]
      };
    if (type) whereClause.transaction_type = type;
    
    // Handle payment source filtering (backward compatible with safe_id)
    if (payment_source_type && payment_source_id) {
      whereClause.payment_source_type = payment_source_type;
      whereClause.payment_source_id = payment_source_id;
    } else if (safe_id) {
      // Backward compatibility: map safe_id to payment_source_type=SAFE
      whereClause.payment_source_type = 'SAFE';
      whereClause.payment_source_id = safe_id;
    } else if (payment_source_type) {
      // Filter by type only if provided
      whereClause.payment_source_type = payment_source_type;
    }
    
    if (direction) whereClause.direction = direction;

    const transactions = await FinancialTransaction.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'performed_by',
          attributes: ['id', 'username', 'name']
        },
        {
          model: DailyOperation,
          as: 'operation',
          attributes: ['id', 'date', 'status']
        }
      ],
      order: [ ['created_at', 'DESC']],
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0
    });

    res.json({
      success: true,
      data: transactions.rows,
      meta: {
        total: transactions.count,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      }
    });

  } catch (error) {
    console.error('Error in getTransactions:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب المعاملات المالية',
      error: error.message
    });
  }
};

/**
 * Get financial summary for a date
 * GET /api/financial-transactions/summary
 */
exports.getSummary = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'التاريخ مطلوب'
      });
    }

    const dateStr = formatToDateString(date);

    // Fetch all operations for this date
    const operations = await DailyOperation.findAll({
      where: { operation_date: dateStr },
      include: [
        {
          model: Vehicle,
          as: 'vehicles',
          through: { attributes: [] }
        }
      ]
    });

    const round2 = (val) => Math.round((val + Number.EPSILON) * 100) / 100;
    const p = (val) => parseFloat(val) || 0;

    const allPartners = await Partner.findAll({ raw: true });
    const formattedOperations = [];

    for (const op of operations) {
      let profitDistribution = null;
      let partnerDistributions = [];
      let vehicleBreakdown = [];

      if (op.status === 'CLOSED') {
        const savedDist = await ProfitDistribution.findOne({
          where: { daily_operation_id: op.id },
          include: [
            {
              model: PartnerProfit,
              as: 'partner_profits',
              include: [
                {
                  model: Partner,
                  as: 'partner',
                  attributes: ['id', 'name', 'investment_percentage', 'is_vehicle_partner']
                }
              ]
            }
          ]
        });

        if (savedDist) {
          try {
            const profitData = await ProfitService.calculateDailyProfit(op.id);
            vehicleBreakdown = (profitData.vehicleBreakdown || []).map(v => ({
              vehicle_id:        v.vehicle_id,
              vehicle_name:      v.vehicle_name        || null,
              purchases:         round2(p(v.purchases)),
              revenue:           round2(p(v.revenue)),
              losses:            round2(p(v.losses)),
              lossesWithFarm:    round2(p(v.lossesWithFarm)),
              lossesWithoutFarm: round2(p(v.lossesWithoutFarm)),
              transport_losses:  round2(p(v.transport_losses)),
              sale_losses:       round2(p(v.sale_losses)),
              vehicle_costs:     round2(p(v.vehicle_costs)),
              other_costs:       round2(p(v.other_costs)),
              net_profit:        round2(p(v.net_profit))
            }));
          } catch (e) {
            vehicleBreakdown = [];
          }

          const totalSaleLosses      = vehicleBreakdown.reduce((s, v) => s + v.sale_losses,      0);
          const totalTransportLosses = vehicleBreakdown.reduce((s, v) => s + v.transport_losses, 0);
          console.log("net_profit:",savedDist.net_profit);
          
          profitDistribution = {
            ...savedDist.toJSON(),
            net_profit:      round2(p(savedDist.net_profit)),
            total_revenue:   round2(p(savedDist.total_revenue)),
            total_purchases: round2(p(savedDist.total_purchases)),
            total_losses:    round2(p(savedDist.total_losses)),
            total_costs:     round2(p(savedDist.total_costs)),
            vehicle_costs:   round2(p(savedDist.vehicle_costs)),
            lossesWithFarm:    round2(p(savedDist.lossesWithFarm)),
            lossesWithoutFarm: round2(p(savedDist.lossesWithoutFarm)),
            losses_with_farm:  round2(p(savedDist.lossesWithFarm)),
            losses_without_farm: round2(p(savedDist.lossesWithoutFarm)),
            sale_losses:      round2(totalSaleLosses),
            transport_losses: round2(totalTransportLosses),
            distribution_id: savedDist.id,
            totals: {
              total_revenue:   round2(p(savedDist.total_revenue)),
              total_purchases: round2(p(savedDist.total_purchases)),
              total_losses:    round2(p(savedDist.total_losses)),
              total_costs:     round2(p(savedDist.total_costs)),
              vehicle_costs:   round2(p(savedDist.vehicle_costs)),
              net_profit:      round2(p(savedDist.net_profit))
            },
            discounts: {
              total_sales_discount:    round2(p(savedDist.total_sales_discount)),
              totalSalesDiscount:      round2(p(savedDist.total_sales_discount)),
              total_purchase_discount: round2(p(savedDist.total_purchase_discount)),
              total: round2(p(savedDist.total_sales_discount) + p(savedDist.total_purchase_discount))
            },
            debts_paid: {
              from_sales:     round2(p(savedDist.debt_paid_from_sales)),
              from_purchases: round2(p(savedDist.debt_paid_from_purchases)),
              from_costs:     round2(p(savedDist.debt_paid_from_costs)),
              total: round2(p(savedDist.debt_paid_from_sales) + p(savedDist.debt_paid_from_purchases) + p(savedDist.debt_paid_from_costs))
            },
            debts_received: {
              from_sales:     round2(p(savedDist.debt_received_from_sales)),
              from_purchases: round2(p(savedDist.debt_received_from_purchases)),
              from_costs:     round2(p(savedDist.debt_received_from_costs)),
              total: round2(p(savedDist.debt_received_from_sales) + p(savedDist.debt_received_from_purchases) + p(savedDist.debt_received_from_costs))
            }
          };

          partnerDistributions = (savedDist.partner_profits || []).map(pp => ({
            ...pp.toJSON(),
            partner_id:            pp.partner_id,
            partner_name:          pp.partner?.name                  || null,
            investment_percentage: p(pp.partner?.investment_percentage),
            is_vehicle_partner:    pp.partner?.is_vehicle_partner     || false,
            base_profit_share:     round2(p(pp.base_profit_share)),
            vehicle_cost_share:    round2(p(pp.vehicle_cost_share)),
            final_profit:          round2(p(pp.final_profit)),
            profit_breakdown: {
              base_profit_share:  round2(p(pp.base_profit_share)),
              vehicle_cost_share: round2(p(pp.vehicle_cost_share)),
              final_profit:       round2(p(pp.final_profit)),
              profit_percentage:  pp.partner?.investment_percentage ? `${p(pp.partner.investment_percentage).toFixed(2)}%` : '0.00%'
            }
          }));
        }
      } else {
        // OPEN operation -> Calculate live
        try {
          const profitData = await ProfitService.calculateDailyProfit(op.id);
          const debtSummary = await ProfitService.calculateDebtAndDiscountSummary(op.id);
          const pDistRaw = await ProfitService.distributeToPartners(op.id, profitData);

          vehicleBreakdown = (profitData.vehicleBreakdown || []).map(v => ({
            vehicle_id:        v.vehicle_id,
            vehicle_name:      v.vehicle_name        || null,
            purchases:         round2(p(v.purchases)),
            revenue:           round2(p(v.revenue)),
            losses:            round2(p(v.losses)),
            lossesWithFarm:    round2(p(v.lossesWithFarm)),
            lossesWithoutFarm: round2(p(v.lossesWithoutFarm)),
            transport_losses:  round2(p(v.transport_losses)),
            sale_losses:       round2(p(v.sale_losses)),
            vehicle_costs:     round2(p(v.vehicle_costs)),
            other_costs:       round2(p(v.other_costs)),
            net_profit:        round2(p(v.net_profit))
          }));

          const totalSaleLosses      = vehicleBreakdown.reduce((s, v) => s + v.sale_losses,      0);
          const totalTransportLosses = vehicleBreakdown.reduce((s, v) => s + v.transport_losses, 0);

          profitDistribution = {
            net_profit:      round2(p(profitData.netProfit)),
            total_revenue:   round2(p(profitData.totalRevenue)),
            total_purchases: round2(p(profitData.totalPurchases)),
            total_losses:    round2(p(profitData.totalLosses)),
            total_costs:     round2(p(profitData.totalCosts)),
            vehicle_costs:   round2(p(profitData.vehicleCosts)),
            lossesWithFarm:    round2(p(profitData.lossesWithFarm)),
            lossesWithoutFarm: round2(p(profitData.lossesWithoutFarm)),
            losses_with_farm:  round2(p(profitData.lossesWithFarm)),
            losses_without_farm: round2(p(profitData.lossesWithoutFarm)),
            sale_losses:      round2(totalSaleLosses),
            transport_losses: round2(totalTransportLosses),
            
            totals: {
              total_revenue:   round2(p(profitData.totalRevenue)),
              total_purchases: round2(p(profitData.totalPurchases)),
              total_losses:    round2(p(profitData.totalLosses)),
              total_costs:     round2(p(profitData.totalCosts)),
              vehicle_costs:   round2(p(profitData.vehicleCosts)),
              net_profit:      round2(p(profitData.netProfit))
            },
            discounts: {
              total_sales_discount:    round2(p(debtSummary.totalSalesDiscount)),
              totalSalesDiscount:      round2(p(debtSummary.totalSalesDiscount)),
              total_purchase_discount: round2(p(debtSummary.totalPurchaseDiscount)),
              total: round2(p(debtSummary.totalSalesDiscount) + p(debtSummary.totalPurchaseDiscount))
            },
            debts_paid: {
              from_sales:     round2(p(debtSummary.debtPaidFromSales)),
              from_purchases: round2(p(debtSummary.debtPaidFromPurchases)),
              from_costs:     round2(p(debtSummary.debtPaidFromCosts)),
              total: round2(p(debtSummary.debtPaidFromSales) + p(debtSummary.debtPaidFromPurchases) + p(debtSummary.debtPaidFromCosts))
            },
            debts_received: {
              from_sales:     round2(p(debtSummary.debtReceivedFromSales)),
              from_purchases: round2(p(debtSummary.debtReceivedFromPurchases)),
              from_costs:     round2(p(debtSummary.debtReceivedFromCosts)),
              total: round2(p(debtSummary.debtReceivedFromSales) + p(debtSummary.debtReceivedFromPurchases) + p(debtSummary.debtReceivedFromCosts))
            }
          };

          partnerDistributions = pDistRaw.map(dist => {
            const partner = allPartners.find(pObj => pObj.id === dist.partner_id);
            const invPct = partner ? p(partner.investment_percentage) : 0;
            return {
              ...dist,
              investment_percentage: invPct,
              is_vehicle_partner:    partner ? partner.is_vehicle_partner : false,
              base_profit_share:     round2(p(dist.base_profit_share)),
              vehicle_cost_share:    round2(p(dist.vehicle_cost_share)),
              final_profit:          round2(p(dist.final_profit)),
              profit_breakdown: {
                base_profit_share:  round2(p(dist.base_profit_share)),
                vehicle_cost_share: round2(p(dist.vehicle_cost_share)),
                final_profit:       round2(p(dist.final_profit)),
                profit_percentage:  partner ? `${invPct.toFixed(2)}%` : '0.00%'
              }
            };
          });

        } catch (e) {
          console.error("error calculating open operation", e);
        }
      }

      formattedOperations.push({
        operation: op.toJSON(),
        profitDistribution,
        partnerDistributions,
        vehicleBreakdown
      });
    }

    const aggregatedSummary = calculateAggregatedSummary(formattedOperations);

    res.json({
      success: true,
      data: formattedOperations,
      aggregatedSummary: aggregatedSummary
    });

  } catch (error) {
    console.error('Error in getSummary:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب ملخص المعاملات المالية',
      error: error.message
    });
  }
};

/**
 * Helper to aggregate financial data from multiple operations
 */
const calculateAggregatedSummary = (formattedOperations) => {
  const round2 = (val) => Math.round((val + Number.EPSILON) * 100) / 100;
  const p = (val) => parseFloat(val) || 0;

  const summary = {
    total_operations_count: formattedOperations.length,
    closed_operations_count: 0,
    open_operations_count: 0,
    totals: {
      total_revenue: 0,
      total_purchases: 0,
      total_losses: 0,
      total_costs: 0,
      vehicle_costs: 0,
      net_profit: 0
    },
    discounts: {
      total_sales_discount: 0,
      total_purchase_discount: 0,
      total: 0
    },
    debts_paid: {
      from_sales: 0,
      from_purchases: 0,
      from_costs: 0,
      total: 0
    },
    debts_received: {
      from_sales: 0,
      from_purchases: 0,
      from_costs: 0,
      total: 0
    },
    losses: {
      sale_losses: 0,
      transport_losses: 0,
      lossesWithFarm: 0,
      lossesWithoutFarm: 0
    }
  };

  formattedOperations.forEach(item => {
    const status = item.operation?.status;
    if (status === 'CLOSED') {
      summary.closed_operations_count++;
    } else {
      summary.open_operations_count++;
    }

    const pd = item.profitDistribution;
    if (!pd) return;

    // Aggregate totals
    if (pd.totals) {
      summary.totals.total_revenue += p(pd.totals.total_revenue);
      summary.totals.total_purchases += p(pd.totals.total_purchases);
      summary.totals.total_losses += p(pd.totals.total_losses);
      summary.totals.total_costs += p(pd.totals.total_costs);
      summary.totals.vehicle_costs += p(pd.totals.vehicle_costs);
      summary.totals.net_profit += p(pd.totals.net_profit);
    }

    // Aggregate discounts
    if (pd.discounts) {
      summary.discounts.total_sales_discount += p(pd.discounts.total_sales_discount);
      summary.discounts.total_purchase_discount += p(pd.discounts.total_purchase_discount);
      summary.discounts.total += p(pd.discounts.total);
    }

    // Aggregate debts_paid
    if (pd.debts_paid) {
      summary.debts_paid.from_sales += p(pd.debts_paid.from_sales);
      summary.debts_paid.from_purchases += p(pd.debts_paid.from_purchases);
      summary.debts_paid.from_costs += p(pd.debts_paid.from_costs);
      summary.debts_paid.total += p(pd.debts_paid.total);
    }

    // Aggregate debts_received
    if (pd.debts_received) {
      summary.debts_received.from_sales += p(pd.debts_received.from_sales);
      summary.debts_received.from_purchases += p(pd.debts_received.from_purchases);
      summary.debts_received.from_costs += p(pd.debts_received.from_costs);
      summary.debts_received.total += p(pd.debts_received.total);
    }

    // Aggregate losses (from top level of profitDistribution)
    summary.losses.sale_losses += p(pd.sale_losses);
    summary.losses.transport_losses += p(pd.transport_losses);
    summary.losses.lossesWithFarm += p(pd.lossesWithFarm);
    summary.losses.lossesWithoutFarm += p(pd.lossesWithoutFarm);
  });

  // Recursively round all numbers in the summary object
  const roundRecursive = (obj) => {
    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'number') {
        obj[key] = round2(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        roundRecursive(obj[key]);
      }
    });
  };

  roundRecursive(summary);
  return summary;
};

// Also export the function if explicitly requested for other uses
exports.getAggregatedSummary = (req, res) => {
  // This could be a separate endpoint if needed, but for now we integrate into getSummary
  // If called directly, it would need data passed in some way.
  // For now, it stays as a helper, but we export the helper logic as a controller method if needed.
  res.status(501).json({ success: false, message: 'Not implemented as standalone endpoint' });
};
