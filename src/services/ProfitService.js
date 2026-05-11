const {
  FarmTransaction,
  SaleTransaction,
  TransportLoss,
  DailyCost,
  ProfitDistribution,
  PartnerProfit,
  Partner,
  CostCategory,
  DailyOperation,
  Vehicle,
  FarmDebtPayment, 
  BuyerDebtPayment, 
  CostDebtPayment 
} = require('../models');
const { Op } = require('sequelize');
const VehicleOperation = require('../models/VehicleOperation');

class ProfitService {
  
  /**
   * Calculate profits with vehicle-specific breakdowns
   */
  static async calculateDailyProfit(operationId, transaction = null) {
    try {
      const operation = await DailyOperation.findByPk(operationId, {
        include: [
          { 
            model: Vehicle, 
            as: 'vehicles',
            through: { attributes: ['status'] }
          },
          { 
            model: FarmTransaction, 
            as: 'farm_transactions',
            include: [{ model: Vehicle, as: 'vehicle' }]
          },
          { 
            model: SaleTransaction, 
            as: 'sale_transactions',
            include: [{ model: Vehicle, as: 'vehicle' }]
          },
          { 
            model: TransportLoss, 
            as: 'losses',
            include: [{ model: Vehicle, as: 'vehicle' }]
          },
          { 
            model: DailyCost, 
            as: 'costs',
            include: [
              { model: CostCategory, as: 'category' },
              { model: Vehicle, as: 'vehicle', required: false }
            ]
          }
        ],
        transaction
      });
      
      if (!operation) {
        throw new Error('Operation not found');
      }
      
      // Validate that vehicles array exists and has items
      if (!operation.vehicles || !Array.isArray(operation.vehicles) || operation.vehicles.length === 0) {
        console.warn('No vehicles found for operation:', operationId);
        return {
          totalRevenue: 0,
          totalPurchases: 0,
          totalLosses: 0,
          lossesWithFarm: 0,
          lossesWithoutFarm: 0,
          totalCosts: 0,
          vehicleCosts: 0,
          otherCosts: 0,
          netProfit: 0,
          vehicleBreakdown: [],
          vehicle_count: 0,
          operation_id: operationId
        };
      }
      
      // Calculate per-vehicle statistics
      const vehicleStats = {};
      const vehicleIds = operation.vehicles.map(v => v.id);
      
      for (const vehicleId of vehicleIds) {
        vehicleStats[vehicleId] = {
          vehicle_id: vehicleId,
          purchases: 0,
          revenue: 0,
          losses: 0,
          vehicle_costs: 0,
          other_costs: 0,
          lossesWithFarm: 0,
          lossesWithoutFarm: 0,
          transport_losses: 0,
          sale_losses: 0,
          net_profit: 0
        };
      }
      
      // Aggregate per vehicle - with safety checks
      const farmTransactions = operation.farm_transactions || [];
      farmTransactions.forEach(t => {
        if (t && t.vehicle_id && vehicleStats[t.vehicle_id]) {
          vehicleStats[t.vehicle_id].purchases += parseFloat(t.total_amount) || 0;
        }
      });
      
      const saleTransactions = operation.sale_transactions || [];
      saleTransactions.forEach(t => {
        if (t && t.vehicle_id && vehicleStats[t.vehicle_id]) {
          // Use final_amount for sale transactions as it represents the actual amount owed
          vehicleStats[t.vehicle_id].revenue += parseFloat(t.final_amount) || 0;
        }
      });
      
      const losses = operation.losses || [];
        let lossesWithFarm = 0;
        let lossesWithoutFarm = 0;
        let deductibleLosses = 0;

        losses.forEach(t => {
          if (!t) return;
          
          const amount = parseFloat(t.loss_amount) || 0;
          
          if (t.farm_id == null) {
            lossesWithoutFarm += amount;
            
            // Deduct only non-sale losses that aren't tied to a farm
            if (t.source !== 'SALE') {
              deductibleLosses += amount;
            }
            
            // If tied to a specific vehicle, add to its stats
            if (t.vehicle_id && vehicleStats[t.vehicle_id]) {
              vehicleStats[t.vehicle_id].lossesWithoutFarm += amount;
              
              // Sub-breakdown by source
              if (t.source === 'SALE') {
                vehicleStats[t.vehicle_id].sale_losses += amount;
              } else {
                vehicleStats[t.vehicle_id].transport_losses += amount;
              }
            }
          } else if (t.vehicle_id && vehicleStats[t.vehicle_id]) {
            lossesWithFarm += amount;
            vehicleStats[t.vehicle_id].lossesWithFarm += amount;
          }
        });

      
      // Vehicle-specific costs
      const dailyCosts = operation.costs || [];
      dailyCosts
        .filter(c => c && c.vehicle_id && c.category && c.category.is_vehicle_cost)
        .forEach(c => {
          if (vehicleStats[c.vehicle_id]) {
            vehicleStats[c.vehicle_id].vehicle_costs += parseFloat(c.amount) || 0;
          }
        });
      
      // Shared costs (split equally among vehicles)
      const sharedVehicleCosts = dailyCosts
        .filter(c => c && !c.vehicle_id && c.category && c.category.is_vehicle_cost)
        .reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
      
      const sharedCostPerVehicle = vehicleIds.length > 0 ? sharedVehicleCosts / vehicleIds.length : 0;
      
      vehicleIds.forEach(vId => {
        vehicleStats[vId].vehicle_costs += sharedCostPerVehicle;
      });
      
      // Non-vehicle costs (shared across all)
      const otherCosts = dailyCosts
        .filter(c => c && c.category && !c.category.is_vehicle_cost)
        .reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
      
      const otherCostPerVehicle = vehicleIds.length > 0 ? otherCosts / vehicleIds.length : 0;
      
      // Calculate net profit per vehicle
      vehicleIds.forEach(vId => {
        const stats = vehicleStats[vId];
        stats.other_costs = otherCostPerVehicle;
        stats.losses = stats.transport_losses;

        stats.net_profit = stats.revenue - stats.purchases - stats.losses - stats.vehicle_costs - otherCostPerVehicle;
      });
      
      // Calculate operation totals
      const totalPurchases = Object.values(vehicleStats).reduce((sum, v) => sum + v.purchases, 0);
      const totalRevenue = Object.values(vehicleStats).reduce((sum, v) => sum + v.revenue, 0);
   

      const totalLosses=lossesWithFarm+lossesWithoutFarm;

      const totalVehicleCosts = Object.values(vehicleStats).reduce((sum, v) => sum + v.vehicle_costs, 0);
      const totalCosts = totalVehicleCosts + otherCosts;
      // netProfit does NOT deduct vehicleCosts here — they are distributed
      // per-partner in distributeToPartners() based on ownership stakes.
      const netProfit = totalRevenue - totalPurchases - deductibleLosses - otherCosts;

      return {
        // Operation-level totals
        totalRevenue,
        totalPurchases,
        totalLosses,
        lossesWithFarm,
        lossesWithoutFarm,
        transport_losses: Object.values(vehicleStats).reduce((sum, v) => sum + v.transport_losses, 0),
        sale_losses: Object.values(vehicleStats).reduce((sum, v) => sum + v.sale_losses, 0),
        totalCosts,
        vehicleCosts: totalVehicleCosts,
        otherCosts,
        netProfit,
        
        // Per-vehicle breakdown
        vehicleBreakdown: Object.values(vehicleStats),
        
        // Metadata
        vehicle_count: vehicleIds.length,
        operation_id: operationId
      };

      
      
    } catch (error) {
      console.error('Error calculating daily profit:', error);
      throw new Error(`Failed to calculate profit: ${error.message}`);
    }
  }
  
  /**
   * Calculate profits for specific vehicle
   */
  static async calculateVehicleProfit(operationId, vehicleId, transaction = null) {
    try {
      const fullProfits = await this.calculateDailyProfit(operationId, transaction);
      
      if (!fullProfits.vehicleBreakdown || fullProfits.vehicleBreakdown.length === 0) {
        throw new Error(`No vehicle data found for operation ${operationId}`);
      }
      
      const vehicleProfit = fullProfits.vehicleBreakdown.find(v => v.vehicle_id === vehicleId);
      
      if (!vehicleProfit) {
        throw new Error(`Vehicle ${vehicleId} not found in operation ${operationId}`);
      }
      
      return vehicleProfit;
      
    } catch (error) {
      console.error('Error calculating vehicle profit:', error);
      throw error;
    }
  }
  
  /**
   * Distribute operation profits to partners
   * Handles vehicle-specific partner associations
   */
  static async distributeToPartners(operationId, profitData, transaction = null) {
    try {
      // Validate input
      if (!profitData || typeof profitData !== 'object') {
        throw new Error('Invalid profit data provided');
      }
      
      // Get all partners
      const allPartners = await Partner.findAll({ transaction });
      
      if (!allPartners || allPartners.length === 0) {
        console.warn('No partners found for profit distribution');
        return [];
      }
      
      // Get vehicles in this operation with their partner associations
      const operation = await DailyOperation.findByPk(operationId, {
        include: [{
          model: Vehicle,
          as: 'vehicles',
          include: [{
            model: Partner,
            as: 'partners',
            through: { attributes: ['share_percentage'] }
          }]
        }],
        transaction
      });
      
      if (!operation) {
        throw new Error('Operation not found');
      }
      
      const distributions = [];
      const netProfit = parseFloat(profitData.netProfit) || 0;
      const vehicleBreakdown = profitData.vehicleBreakdown || [];
      const totalVehicleCosts = parseFloat(profitData.vehicleCosts) || 0;
      const numPartners = allPartners.length;

      // Map to store final cost shares for each partner
      const partnerVehicleCostShares = {};
      allPartners.forEach(p => partnerVehicleCostShares[p.id] = 0);

      /**
       * VEHICLE COST DISTRIBUTION RULE:
       * 1. Distribute each vehicle's costs separately.
       * 2. For each vehicle, calculate a "weight" for each partner based on their non-ownership.
       *    Weight = 100 - ownership_percentage.
       * 3. Distribute the vehicle's costs among all partners in proportion to their weights.
       * 4. This ensures:
       *    - Partners with 100% ownership pay 0 for that vehicle.
       *    - Partners with 0% ownership pay the most.
       *    - The total distributed matches the actual cost of the vehicle.
       */
      for (const vStats of vehicleBreakdown) {
        const vCost = parseFloat(vStats.vehicle_costs) || 0;
        if (vCost <= 0) continue;

        const vehicle = (operation.vehicles || []).find(v => v.id === vStats.vehicle_id);
        const vPartners = vehicle?.partners || [];

        const weights = {};
        const ownershipPcts = {};
        let totalWeight = 0;

        for (const partner of allPartners) {
          const vPartner = vPartners.find(vp => vp.id === partner.id);
          const sharePct = parseFloat(
            vPartner?.VehiclePartner?.share_percentage ??
            vPartner?.vehicle_partner?.share_percentage ??
            0
          );
          
          ownershipPcts[partner.id] = sharePct;
          const weight = Math.max(0, 100 - sharePct);
          weights[partner.id] = weight;
          totalWeight += weight;
        }

        const equalShare = vCost / numPartners;
        const nonOwners = allPartners.filter(p => ownershipPcts[p.id] === 0);

        if (nonOwners.length > 0) {
          // ── STRICT RULE: Non-owners (0%) bear the full discount pool ────────
          let totalDiscountPool = 0;
          for (const partner of allPartners) {
            if (ownershipPcts[partner.id] > 0) {
              const discount = equalShare * (ownershipPcts[partner.id] / 100);
              totalDiscountPool += discount;
            }
          }

          const extraPerNonOwner = totalDiscountPool / nonOwners.length;

          for (const partner of allPartners) {
            if (ownershipPcts[partner.id] === 0) {
              // Non-owner pays equal share + their portion of the discount pool
              partnerVehicleCostShares[partner.id] += equalShare + extraPerNonOwner;
            } else {
              // Owner pays equal share minus their ownership discount
              const discount = equalShare * (ownershipPcts[partner.id] / 100);
              partnerVehicleCostShares[partner.id] += (equalShare - discount);
            }
          }
        } else if (totalWeight > 0) {
          // ── FALLBACK: Everyone is an owner, use proportional weight ────────
          for (const partner of allPartners) {
            partnerVehicleCostShares[partner.id] += vCost * (weights[partner.id] / totalWeight);
          }
        } else {
          // ── EMERGENCY FALLBACK: Split equally ───────────────────────────────
          for (const partner of allPartners) {
            partnerVehicleCostShares[partner.id] += vCost / numPartners;
          }
        }
      }

      const equalShare = numPartners > 0 ? totalVehicleCosts / numPartners : 0;

      // Second pass — build distributions
      for (const partner of allPartners) {
        const investmentPercentage = parseFloat(partner.investment_percentage) || 0;

        // Partner's share of net profit (vehicle costs NOT yet deducted)
        const baseShare = netProfit * (investmentPercentage / 100);
        
        const vehicleCostShare = partnerVehicleCostShares[partner.id] || 0;
        const ownershipDiscount = equalShare - vehicleCostShare;

        const finalProfit = baseShare - vehicleCostShare;

        distributions.push({
          partner_id: partner.id,
          partner_name: partner.name,
          base_profit_share: baseShare,
          vehicle_cost_share: vehicleCostShare,
          equal_share: equalShare,
          ownership_discount: ownershipDiscount,
          final_profit: finalProfit
        });
      }
      return distributions;
      
    } catch (error) {
      console.error('Error distributing to partners:', error);
      throw new Error(`Failed to distribute profits: ${error.message}`);
    }
  }
  
  /**
   * Close operation with multi-vehicle profit calculation
   */
  static async closeOperation(operationId, transaction) {
    try {
      // Validate input
      if (!operationId) {
        throw new Error('Operation ID is required');
      }
      
      if (!transaction) {
        throw new Error('Transaction is required');
      }
      
const operation = await DailyOperation.findOne({
                where: {
                  id: operationId,
                  status: 'OPEN',
                  closed_at: null
                },
                transaction,
                lock: transaction.LOCK.UPDATE
              });
                    
      if (!operation) {
        throw new Error('Operation not found');
      }
      
      if (operation.status === 'CLOSED') {
        throw new Error('Operation already closed');
      }
      
      // Calculate profits
      const profitData = await this.calculateDailyProfit(operationId, transaction);
      const debtSummary = await this.calculateDebtAndDiscountSummary(operationId, transaction);
      // Validate profit data
      if (!profitData || typeof profitData !== 'object') {
        throw new Error('Failed to calculate profit data');
      }
      
      // Distribute to partners
      const partnerDistributions = await this.distributeToPartners(operationId, profitData, transaction);
      
      // Validate distributions
      if (!Array.isArray(partnerDistributions)) {
        throw new Error('Partner distributions must be an array');
      }
      
      // Save profit distribution
      const profitDistribution = await ProfitDistribution.create({
        daily_operation_id: operationId,
        total_revenue: profitData.totalRevenue || 0,
        total_purchases: profitData.totalPurchases || 0,
        total_losses: profitData.totalLosses || 0,
        total_costs: profitData.totalCosts || 0,
        lossesWithFarm: profitData.lossesWithFarm || 0,      
         lossesWithoutFarm: profitData.lossesWithoutFarm || 0,   
        vehicle_costs: profitData.vehicleCosts || 0,
        net_profit: profitData.netProfit || 0,

  // ── NEW fields ──────────────────────────────────────────────────────
        total_sales_discount:      debtSummary.totalSalesDiscount,
        total_purchase_discount:   debtSummary.totalPurchaseDiscount,

        debt_paid_from_sales:      debtSummary.debtPaidFromSales,
        debt_paid_from_purchases:  debtSummary.debtPaidFromPurchases,
        debt_paid_from_costs:      debtSummary.debtPaidFromCosts,

        debt_received_from_sales:      debtSummary.debtReceivedFromSales,
        debt_received_from_purchases:  debtSummary.debtReceivedFromPurchases,
        debt_received_from_costs:      debtSummary.debtReceivedFromCosts,

      }, { transaction });

      // Save partner profits
      if (partnerDistributions.length > 0) {
        for (const dist of partnerDistributions) {
          await PartnerProfit.create({
            profit_distribution_id: profitDistribution.id,
            partner_id: dist.partner_id,
            base_profit_share: dist.base_profit_share || 0,
            vehicle_cost_share: dist.vehicle_cost_share || 0,
            final_profit: dist.final_profit || 0
          }, { transaction });

          // Update partner's running balance
          const partner = await Partner.findByPk(dist.partner_id, { transaction });
          if (partner) {
            await partner.addProfit(dist.final_profit, transaction);
          }
        }
      }
      
      // Mark all vehicle operations as completed
      await VehicleOperation.update(
        { status: 'COMPLETED' },
        { 
          where: { daily_operation_id: operationId },
          transaction 
        }
      );
      
      // Update operation status
      await operation.update({
        status: 'CLOSED',
        closed_at: new Date()
      }, { transaction });
      
      return {
        operation,
        profitDistribution,
        partnerDistributions,
        vehicleBreakdown: profitData.vehicleBreakdown || []
      };
      
    } catch (error) {
      console.error('Error in closeOperation service:', error);
      throw error; // Re-throw to let controller handle transaction rollback
    }
  }

  static async calculateDebtAndDiscountSummary(operationId, transaction = null) {
  const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

  // ── Sales discounts & debt movements ─────────────────────────────────
  const saleTransactions = await SaleTransaction.findAll({
    where: { daily_operation_id: operationId },
    transaction
  });

  const totalSalesDiscount = round2(
    saleTransactions.reduce((sum, t) => sum + (parseFloat(t.discount_amount) || 0), 0)
  );

  // ── Purchase discounts & debt movements ───────────────────────────────
  const farmTransactions = await FarmTransaction.findAll({
    where: { daily_operation_id: operationId },
    transaction
  });

  const totalPurchaseDiscount = round2(
    farmTransactions.reduce((sum, t) => sum + (parseFloat(t.discount_amount) || 0), 0)
  );

  // ── Farm debt payments linked to this operation ───────────────────────
  const farmDebtPayments = await FarmDebtPayment.findAll({
    where: { daily_operation_id: operationId },
    transaction
  });

  // TO_FARM = we paid farm = debt paid from purchases
  const debtPaidFromPurchases = round2(
    farmDebtPayments
      .filter(p => p.payment_direction === 'TO_FARM')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  );

  // FROM_FARM = farm paid us = debt received from purchases
  const debtReceivedFromPurchases = round2(
    farmDebtPayments
      .filter(p => p.payment_direction === 'FROM_FARM')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  );

  // ── Buyer debt payments linked to this operation ──────────────────────
  const buyerDebtPayments = await BuyerDebtPayment.findAll({
    where: { daily_operation_id: operationId }, 
    transaction
  });

  // TO_BUYER = we paid buyer = debt paid from sales
  const debtPaidFromSales = round2(
    buyerDebtPayments
      .filter(p => p.payment_direction === 'TO_BUYER')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  );

  // FROM_BUYER = buyer paid us = debt received from sales
  const debtReceivedFromSales = round2(
    buyerDebtPayments
      .filter(p => p.payment_direction === 'FROM_BUYER')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  );

  // ── Cost debt payments linked to this operation ───────────────────────
  const costDebtPayments = await CostDebtPayment.findAll({
    where: { daily_operation_id: operationId },
    transaction
  });

  // TO_CATEGORY = we paid cost debt = debt paid from costs
  const debtPaidFromCosts = round2(
    costDebtPayments
      .filter(p => p.payment_direction === 'TO_CATEGORY')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  );

  // FROM_CATEGORY = cost refunded to us = debt received from costs
  const debtReceivedFromCosts = round2(
    costDebtPayments
      .filter(p => p.payment_direction === 'FROM_CATEGORY')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  );

  return {
    // Discounts
    totalSalesDiscount,
    totalPurchaseDiscount,

    // Debts paid BY US (outgoing money)
    debtPaidFromSales,
    debtPaidFromPurchases,
    debtPaidFromCosts,
    totalDebtPaid: round2(debtPaidFromSales + debtPaidFromPurchases + debtPaidFromCosts),

    // Debts received BY US (incoming money)
    debtReceivedFromSales,
    debtReceivedFromPurchases,
    debtReceivedFromCosts,
    totalDebtReceived: round2(debtReceivedFromSales + debtReceivedFromPurchases + debtReceivedFromCosts)
  };
}
}
module.exports = ProfitService;