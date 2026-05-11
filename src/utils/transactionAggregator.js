const { FarmTransaction, SaleTransaction, TransportLoss, DailyCost } = require('../models');

class TransactionAggregator {
  
  /**
   * Get all transactions for a vehicle in an operation
   */
  static async getVehicleTransactions(operationId, vehicleId) {
    const [farmTransactions, saleTransactions, losses, costs] = await Promise.all([
      FarmTransaction.findAll({
        where: { daily_operation_id: operationId, vehicle_id: vehicleId },
        include: ['farm', 'chicken_type']
      }),
      SaleTransaction.findAll({
        where: { daily_operation_id: operationId, vehicle_id: vehicleId },
        include: ['buyer', 'chicken_type']
      }),
      TransportLoss.findAll({
        where: { daily_operation_id: operationId, vehicle_id: vehicleId },
        include: ['chicken_type']
      }),
      DailyCost.findAll({
        where: { daily_operation_id: operationId, vehicle_id: vehicleId },
        include: ['category']
      })
    ]);
    
    return {
      farm_transactions: farmTransactions,
      sale_transactions: saleTransactions,
      transport_losses: losses,
      costs: costs
    };
  }
  
  /**
   * Calculate summary stats for vehicle transactions
   */
  static calculateVehicleSummary(transactions) {
    const summary = {
      total_purchased_kg: 0,
      total_sold_kg: 0,
      total_purchases: 0,
      total_revenue: 0,
      total_losses_kg: 0,
      total_loss_value: 0,
      total_vehicle_costs: 0,
      transaction_counts: {
        farms: transactions.farm_transactions.length,
        sales: transactions.sale_transactions.length,
        losses: transactions.transport_losses.length,
        costs: transactions.costs.length
      }
    };
    
    transactions.farm_transactions.forEach(t => {
      summary.total_purchased_kg += parseFloat(t.net_chicken_weight);
      summary.total_purchases += parseFloat(t.total_amount);
    });
    
    transactions.sale_transactions.forEach(t => {
      summary.total_sold_kg += parseFloat(t.net_weight);
      summary.total_revenue += parseFloat(t.total_amount);
    });
    
    transactions.transport_losses.forEach(t => {
      summary.total_losses_kg += parseFloat(t.dead_weight);
      summary.total_loss_value += parseFloat(t.loss_amount);
    });
    
    transactions.costs.forEach(c => {
      if (c.cost_category.is_vehicle_cost) {
        summary.total_vehicle_costs += parseFloat(c.amount);
      }
    });
    
    summary.remaining_inventory_kg = summary.total_purchased_kg - summary.total_sold_kg - summary.total_losses_kg;
    
    return summary;
  }
}

module.exports = TransactionAggregator;