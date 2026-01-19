const {
  FarmTransaction,
  SaleTransaction,
  TransportLoss,
  DailyCost,
  ProfitDistribution,
  PartnerProfit,
  Partner,
  CostCategory
} = require('../models');
const { Op } = require('sequelize');

class ProfitService {
  /**
   * Calculate and distribute profits for a daily operation
   * @param {number} dailyOperationId 
   * @param {Transaction} transaction - Sequelize transaction
   * @returns {Object} Profit distribution details
   */
  async calculateAndDistribute(dailyOperationId, transaction) {
    // STEP 1: Calculate Total Revenue
    const sales = await SaleTransaction.findAll({
      where: { daily_operation_id: dailyOperationId },
      transaction
    });
    
    const totalRevenue = sales.reduce((sum, sale) => {
      return sum + parseFloat(sale.total_amount);
    }, 0);

    // STEP 2: Calculate Total Purchases
    const purchases = await FarmTransaction.findAll({
      where: { daily_operation_id: dailyOperationId },
      transaction
    });
    
    const totalPurchases = purchases.reduce((sum, purchase) => {
      return sum + parseFloat(purchase.total_amount);
    }, 0);

    // STEP 3: Calculate Total Losses
    const losses = await TransportLoss.findAll({
      where: { daily_operation_id: dailyOperationId },
      transaction
    });
    
    const totalLosses = losses.reduce((sum, loss) => {
      return sum + parseFloat(loss.loss_amount);
    }, 0);

    // STEP 4: Calculate Total Costs (Vehicle vs Other)
    const costs = await DailyCost.findAll({
      where: { daily_operation_id: dailyOperationId },
      include: [{ model: CostCategory }],
      transaction
    });
    
    let vehicleCosts = 0;
    let otherCosts = 0;
    
    costs.forEach(cost => {
      const amount = parseFloat(cost.amount);
      if (cost.CostCategory && cost.CostCategory.is_vehicle_cost) {
        vehicleCosts += amount;
      } else {
        otherCosts += amount;
      }
    });
    
    const totalCosts = vehicleCosts + otherCosts;

    // STEP 5: Calculate Net Profit
    const netProfit = totalRevenue - totalPurchases - totalLosses - totalCosts;

    // Create profit distribution record
    const profitDistribution = await ProfitDistribution.create({
      daily_operation_id: dailyOperationId,
      total_revenue: totalRevenue,
      total_purchases: totalPurchases,
      total_losses: totalLosses,
      total_costs: totalCosts,
      vehicle_costs: vehicleCosts,
      net_profit: netProfit
    }, { transaction });

    // STEP 6: Distribute to Partners
    const partners = await Partner.findAll({ transaction });
    const partnerProfits = [];

    for (const partner of partners) {
      const investmentPercentage = parseFloat(partner.investment_percentage);
      
      // A. Calculate Base Profit Share
      const baseShare = (netProfit * investmentPercentage) / 100;
      
      // B. Calculate Vehicle Cost Deduction
      let vehicleCostShare = 0;
      if (!partner.is_vehicle_partner) {
        // Non-vehicle partners pay their share of vehicle costs from profit
        vehicleCostShare = (vehicleCosts * investmentPercentage) / 100;
      }
      
      // C. Calculate Final Profit
      const finalProfit = baseShare - vehicleCostShare;

      const partnerProfit = await PartnerProfit.create({
        profit_distribution_id: profitDistribution.id,
        partner_id: partner.id,
        base_profit_share: baseShare,
        vehicle_cost_share: vehicleCostShare,
        final_profit: finalProfit
      }, { transaction });

      partnerProfits.push({
        partner_id: partner.id,
        partner_name: partner.name,
        investment_percentage: investmentPercentage,
        is_vehicle_partner: partner.is_vehicle_partner,
        base_share: baseShare,
        vehicle_cost_share: vehicleCostShare,
        final_profit: finalProfit
      });
    }

    // STEP 7: Verification (optional - for debugging)
    const totalDistributed = partnerProfits.reduce((sum, p) => sum + p.final_profit, 0);
    const difference = Math.abs(netProfit - totalDistributed - vehicleCosts);
    
    // Allow small rounding differences (less than 1 EGP)
    if (difference > 1) {
      console.warn(`Profit distribution discrepancy: ${difference} EGP`);
    }

    return {
      profit_distribution_id: profitDistribution.id,
      total_revenue: totalRevenue,
      total_purchases: totalPurchases,
      total_losses: totalLosses,
      total_costs: totalCosts,
      vehicle_costs: vehicleCosts,
      other_costs: otherCosts,
      net_profit: netProfit,
      partner_profits: partnerProfits,
      verification: {
        total_distributed: totalDistributed,
        difference: difference
      }
    };
  }

  /**
   * Get profit report for a date range
   * @param {string} fromDate 
   * @param {string} toDate 
   * @returns {Object} Aggregated profit data
   */
  async getProfitReport(fromDate, toDate) {
    const distributions = await ProfitDistribution.findAll({
      include: [
        {
          model: DailyOperation,
          where: {
            operation_date: {
              [Op.between]: [fromDate, toDate]
            }
          }
        },
        {
          model: PartnerProfit,
          include: [{ model: Partner }]
        }
      ],
      order: [[DailyOperation, 'operation_date', 'DESC']]
    });

    // Aggregate totals
    const totals = {
      total_revenue: 0,
      total_purchases: 0,
      total_losses: 0,
      total_costs: 0,
      vehicle_costs: 0,
      net_profit: 0
    };

    const partnerTotals = {};

    distributions.forEach(dist => {
      totals.total_revenue += parseFloat(dist.total_revenue);
      totals.total_purchases += parseFloat(dist.total_purchases);
      totals.total_losses += parseFloat(dist.total_losses);
      totals.total_costs += parseFloat(dist.total_costs);
      totals.vehicle_costs += parseFloat(dist.vehicle_costs);
      totals.net_profit += parseFloat(dist.net_profit);

      // Aggregate partner profits
      dist.PartnerProfits.forEach(pp => {
        const partnerId = pp.partner_id;
        if (!partnerTotals[partnerId]) {
          partnerTotals[partnerId] = {
            partner_id: partnerId,
            partner_name: pp.Partner.name,
            total_base_share: 0,
            total_vehicle_cost_share: 0,
            total_final_profit: 0
          };
        }
        partnerTotals[partnerId].total_base_share += parseFloat(pp.base_profit_share);
        partnerTotals[partnerId].total_vehicle_cost_share += parseFloat(pp.vehicle_cost_share);
        partnerTotals[partnerId].total_final_profit += parseFloat(pp.final_profit);
      });
    });

    return {
      period: { from: fromDate, to: toDate },
      totals,
      partner_totals: Object.values(partnerTotals),
      daily_distributions: distributions
    };
  }
}

module.exports = new ProfitService();