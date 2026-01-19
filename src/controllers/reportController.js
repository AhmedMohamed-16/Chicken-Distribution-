const { Op } = require('sequelize');
const {
  DailyOperation,
  FarmTransaction,
  SaleTransaction,
  TransportLoss,
  DailyCost,
  ProfitDistribution,
  PartnerProfit,
  Farm,
  Buyer,
  Partner,
  ChickenType,
  CostCategory
} = require('../models');
const ProfitService = require('../services/ProfitService');

exports.getDailyReport = async (req, res) => {
  try {
    const { date } = req.params;

    const operation = await DailyOperation.findOne({
      where: { operation_date: date },
      include: [
        {
          model: FarmTransaction,
          include: [
            { model: Farm },
            { model: ChickenType }
          ]
        },
        {
          model: SaleTransaction,
          include: [
            { model: Buyer },
            { model: ChickenType }
          ]
        },
        {
          model: TransportLoss,
          include: [{ model: ChickenType }]
        },
        {
          model: DailyCost,
          include: [{ model: CostCategory }]
        },
        {
          model: ProfitDistribution,
          include: [
            {
              model: PartnerProfit,
              include: [{ model: Partner }]
            }
          ]
        }
      ]
    });

    if (!operation) {
      return res.status(404).json({
        success: false,
        message: 'No operation found for this date'
      });
    }

    // Calculate summary
    const totalPurchases = operation.FarmTransactions.reduce((sum, t) => 
      sum + parseFloat(t.total_amount), 0
    );
    const totalSales = operation.SaleTransactions.reduce((sum, t) => 
      sum + parseFloat(t.total_amount), 0
    );
    const totalLosses = operation.TransportLosses.reduce((sum, l) => 
      sum + parseFloat(l.loss_amount), 0
    );
    const totalCosts = operation.DailyCosts.reduce((sum, c) => 
      sum + parseFloat(c.amount), 0
    );

    res.json({
      success: true,
      data: {
        operation_date: date,
        status: operation.status,
        summary: {
          total_purchases: totalPurchases,
          total_sales: totalSales,
          total_losses: totalLosses,
          total_costs: totalCosts,
          net_profit: operation.ProfitDistribution?.net_profit || 0
        },
        farm_transactions: operation.FarmTransactions,
        sales: operation.SaleTransactions,
        losses: operation.TransportLosses,
        costs: operation.DailyCosts,
        profit_distribution: operation.ProfitDistribution
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating daily report',
      error: error.message
    });
  }
};

exports.getPeriodReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'From and to dates are required'
      });
    }

    const operations = await DailyOperation.findAll({
      where: {
        operation_date: {
          [Op.between]: [from, to]
        }
      },
      include: [
        {
          model: FarmTransaction,
          include: [{ model: Farm }, { model: ChickenType }]
        },
        {
          model: SaleTransaction,
          include: [{ model: Buyer }, { model: ChickenType }]
        },
        {
          model: TransportLoss,
          include: [{ model: ChickenType }]
        },
        {
          model: DailyCost,
          include: [{ model: CostCategory }]
        },
        {
          model: ProfitDistribution
        }
      ],
      order: [['operation_date', 'DESC']]
    });

    // Aggregate totals
    let totals = {
      total_purchases: 0,
      total_sales: 0,
      total_losses: 0,
      total_costs: 0,
      total_profit: 0,
      days_operated: operations.length
    };

    operations.forEach(op => {
      op.FarmTransactions.forEach(t => {
        totals.total_purchases += parseFloat(t.total_amount);
      });
      op.SaleTransactions.forEach(t => {
        totals.total_sales += parseFloat(t.total_amount);
      });
      op.TransportLosses.forEach(l => {
        totals.total_losses += parseFloat(l.loss_amount);
      });
      op.DailyCosts.forEach(c => {
        totals.total_costs += parseFloat(c.amount);
      });
      if (op.ProfitDistribution) {
        totals.total_profit += parseFloat(op.ProfitDistribution.net_profit);
      }
    });

    res.json({
      success: true,
      data: {
        period: { from, to },
        totals,
        operations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating period report'
    });
  }
};

exports.getPartnerProfitReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'From and to dates are required'
      });
    }

    const report = await ProfitService.getProfitReport(from, to);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating partner profit report'
    });
  }
};

exports.getFarmDebtReport = async (req, res) => {
  try {
    const farms = await Farm.findAll({
      where: {
        total_debt: {
          [Op.gt]: 0
        }
      },
      order: [['total_debt', 'DESC']]
    });

    const totalDebt = farms.reduce((sum, farm) => 
      sum + parseFloat(farm.total_debt), 0
    );

    res.json({
      success: true,
      data: {
        total_debt: totalDebt,
        farms_count: farms.length,
        farms
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating farm debt report'
    });
  }
};

exports.getBuyerDebtReport = async (req, res) => {
  try {
    const buyers = await Buyer.findAll({
      where: {
        total_debt: {
          [Op.gt]: 0
        }
      },
      order: [['total_debt', 'DESC']]
    });

    const totalDebt = buyers.reduce((sum, buyer) => 
      sum + parseFloat(buyer.total_debt), 0
    );

    res.json({
      success: true,
      data: {
        total_debt: totalDebt,
        buyers_count: buyers.length,
        buyers
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating buyer debt report'
    });
  }
};

module.exports = exports;