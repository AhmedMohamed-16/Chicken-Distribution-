// =========================
// File: services/PeriodReportService.js
// الوصف: خدمة تقارير الفترة الشاملة
// =========================

const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  DailyOperation,
  ProfitDistribution,
  Vehicle,
  Partner,
  Farm,
  Buyer,
  FarmTransaction,
  SaleTransaction,
  TransportLoss,
  DailyCost,
  CostCategory,
  ChickenType
} = require('../models');

class PeriodReportService {
  
  /**
   * نقطة الدخول الرئيسية لتوليد تقرير الفترة
   */
  static async generatePeriodReport(startDate, endDate) {
    try {
      // الحصول على جميع العمليات المغلقة في الفترة
      const operations = await this.getOperationsInPeriod(startDate, endDate);
      
      if (operations.length === 0) {
        return {
          success: false,
          message: 'لا توجد عمليات في الفترة المحددة'
        };
      }

      // بناء التقرير الشامل
      const report = {
        report_type: 'PERIOD_SUMMARY',
        generated_at: new Date(),
        period: this.buildPeriodInfo(startDate, endDate, operations),
        executive_summary: await this.buildExecutiveSummary(operations, startDate, endDate),
        revenue_breakdown: await this.buildRevenueBreakdown(operations),
        cost_breakdown: await this.buildCostBreakdown(operations),
        vehicle_performance: await this.buildVehiclePerformance(operations),
        debt_position: await this.buildDebtPosition(),
        operational_metrics: await this.buildOperationalMetrics(operations),
        cash_flow_summary: await this.buildCashFlowSummary(operations),
        highlights_and_alerts: await this.buildHighlightsAndAlerts(operations),
        period_comparison: await this.buildPeriodComparison(startDate, endDate, operations),
        drill_down_links: this.buildDrillDownLinks(startDate, endDate)
      };

      return {
        success: true,
        data: report
      };

    } catch (error) {
      console.error('خطأ في إنشاء تقرير الفترة:', error);
      throw error;
    }
  }

  /**
   * الحصول على جميع العمليات في الفترة مع الجداول المرتبطة
   */
  static async getOperationsInPeriod(startDate, endDate) {
    return await DailyOperation.findAll({
      where: {
        operation_date: {
          [Op.between]: [startDate, endDate]
        },
        status: 'CLOSED'
      },
      include: [
        {
          model: Vehicle,
          as: 'vehicles',
          through: { attributes: ['status'] }
        },
        {
          model: ProfitDistribution,
          as: 'profit_distribution'
        }
      ],
      order: [['operation_date', 'ASC']]
    });
  }

  /**
   * بناء قسم معلومات الفترة
   */
  static buildPeriodInfo(startDate, endDate, operations) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    // الحصول على المركبات المستخدمة
    const vehicleIds = new Set();
    operations.forEach(op => {
      op.vehicles.forEach(v => vehicleIds.add(v.id));
    });

    // حساب عدد الأيام الفعلية للعمليات
    const uniqueOperationDates = new Set(operations.map(op => op.operation_date));
    const operatingDays = uniqueOperationDates.size;

    return {
      start_date: startDate,
      end_date: endDate,
      duration_days: durationDays,
      operating_days: operatingDays,
      total_operations: operations.length,
      vehicles_used: vehicleIds.size,
      period_label: this.formatPeriodLabel(startDate, endDate)
    };
  }

  /**
   * بناء الملخص التنفيذي
   */
  static async buildExecutiveSummary(operations, startDate, endDate) {
    const financials = this.aggregateFinancials(operations);
    const operational = await this.aggregateOperationalStats(operations);
    const trends = await this.calculateTrends(startDate, endDate, financials);

    return {
      financial: {
        // أساس الاستحقاق (المبالغ الإجمالية)
        total_revenue: financials.total_revenue,
        total_costs: financials.total_costs,
        net_profit: financials.net_profit,
        profit_margin_percentage: financials.profit_margin_percentage,
        
        // الأساس النقدي (النقد الفعلي الداخل/الخارج)
        total_revenue_cash: financials.total_revenue_cash,
        net_profit_cash: financials.net_profit_cash,
        
        // مقاييس أخرى
        avg_daily_profit: financials.avg_daily_profit,
        trend_vs_previous: trends
      },
      operational
    };
  }

  /**
   * تجميع البيانات المالية من العمليات
   */
  static aggregateFinancials(operations) {
    let total_revenue = 0;
    let total_revenue_cash = 0;
    let total_purchases = 0;
    let total_purchases_cash = 0;
    let total_losses = 0;
  let total_losses_with_farm = 0;      
  let total_losses_without_farm = 0;   
      let total_costs = 0;
    let vehicle_costs = 0;

    operations.forEach(op => {
      if (op.profit_distribution) {
        // أساس الاستحقاق (ما تم فوترته)
        total_revenue += parseFloat(op.profit_distribution.total_revenue || 0);
        total_purchases += parseFloat(op.profit_distribution.total_purchases || 0);
        total_losses += parseFloat(op.profit_distribution.total_losses || 0);
      
      // ✅ تصحيح الأسماء
      total_losses_with_farm += parseFloat(op.profit_distribution.lossesWithFarm || 0);
      total_losses_without_farm += parseFloat(op.profit_distribution.lossesWithoutFarm || 0);
      
        total_costs += parseFloat(op.profit_distribution.total_costs || 0);
        vehicle_costs += parseFloat(op.profit_distribution.vehicle_costs || 0);
      }
      
    });

    const net_profit = operations.reduce((sum, op) => {
      const opNet = parseFloat(op.profit_distribution?.net_profit || 0);
      const opVehCosts = parseFloat(op.profit_distribution?.vehicle_costs || 0);
      return sum + (opNet - opVehCosts);
    }, 0);
  
    const profit_margin_percentage = total_revenue > 0 
      ? ((net_profit / total_revenue) * 100).toFixed(2)
      : 0;
    
  const avg_daily_profit = operations.length > 0 
    ? (net_profit / operations.length).toFixed(2)
    : 0;



    return {
      // أساس الاستحقاق
      total_revenue: parseFloat(total_revenue.toFixed(2)),
      total_purchases: parseFloat(total_purchases.toFixed(2)),
      total_losses: parseFloat(total_losses.toFixed(2)),
      total_costs: parseFloat(total_costs.toFixed(2)),
      vehicle_costs: parseFloat(vehicle_costs.toFixed(2)),
      other_costs: parseFloat((total_costs - vehicle_costs).toFixed(2)),
 lossesWithFarm: parseFloat(total_losses_with_farm.toFixed(2)),          // ✅ إضافة
    lossesWithoutFarm: parseFloat(total_losses_without_farm.toFixed(2)), 
      net_profit: parseFloat(net_profit.toFixed(2)),
      profit_margin_percentage: parseFloat(profit_margin_percentage),
      avg_daily_profit: parseFloat(avg_daily_profit),
      
      // الأساس النقدي - سيتم تعيينه بواسطة buildCashFlowSummary
      total_revenue_cash: 0,
      total_purchases_cash: 0,
      net_profit_cash: 0
    };
  }

  /**
   * بناء ملخص التدفق النقدي (النقد الفعلي الداخل/الخارج)
   */
  static async buildCashFlowSummary(operations) {
    const operationIds = operations.map(op => op.id);

    // حساب النقد المستلم الفعلي من المبيعات
    const salesCash = await SaleTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('SaleTransaction.paid_amount')), 'cash_received'],
        [sequelize.fn('SUM', sequelize.col('SaleTransaction.debt_applied_amount')), 'old_debt_collected'],
        [sequelize.fn('SUM', sequelize.col('SaleTransaction.remaining_amount')), 'accounts_receivable']
      ],
      raw: true
    });

    // حساب النقد المدفوع الفعلي للمشتريات
    const purchasesCash = await FarmTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('FarmTransaction.paid_amount')), 'cash_paid'],
        [sequelize.fn('SUM', sequelize.col('FarmTransaction.used_credit')), 'credit_used'],
        [sequelize.fn('SUM', sequelize.col('FarmTransaction.remaining_amount')), 'accounts_payable']
      ],
      raw: true
    });

    // الحصول على التكاليف - النقد المدفوع فعلياً (ليس المبلغ الكامل)
    const costs = await DailyCost.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('DailyCost.paid_amount')), 'total_costs_paid'],
        [sequelize.fn('SUM', sequelize.col('DailyCost.amount')), 'total_costs_recorded'],
        [sequelize.fn('SUM', sequelize.literal('"DailyCost"."amount" - "DailyCost"."paid_amount"')), 'costs_remaining_unpaid']
      ],
      raw: true
    });

    // الحصول على الخسائر (لا تأثير نقدي، ولكن يتم تسجيلها)
const losses = await TransportLoss.findAll({
  where: { 
    daily_operation_id: { [Op.in]: operationIds },
    farm_id: null,
    source: { [Op.ne]: 'SALE' }
  },
  attributes: [
    [sequelize.fn('SUM', sequelize.col('TransportLoss.loss_amount')), 'total_losses_without_farms']
  ],
  raw: true
});

const total_losses_without_farms = parseFloat(losses[0]?.total_losses_without_farms || 0);

// وفي الحسابات:

    const cash_received = parseFloat(salesCash[0]?.cash_received || 0);
    const old_debt_collected = parseFloat(salesCash[0]?.old_debt_collected || 0);
    const accounts_receivable = parseFloat(salesCash[0]?.accounts_receivable || 0);
    
    const cash_paid = parseFloat(purchasesCash[0]?.cash_paid || 0);
    const credit_used = parseFloat(purchasesCash[0]?.credit_used || 0);
    const accounts_payable = parseFloat(purchasesCash[0]?.accounts_payable || 0);
    
    const total_costs_paid = parseFloat(costs[0]?.total_costs_paid || 0);
    const total_costs_recorded = parseFloat(costs[0]?.total_costs_recorded || 0);
    const costs_remaining_unpaid = parseFloat(costs[0]?.costs_remaining_unpaid || 0);
    const total_losses = parseFloat(losses[0]?.total_losses || 0);

    // إجمالي النقد الداخل
    const total_cash_in = cash_received + old_debt_collected;
    
    // إجمالي النقد الخارج
    const total_cash_out = cash_paid + total_costs_paid;
    
    // صافي التدفق النقدي
    const net_cash_flow = total_cash_in - total_cash_out;

    // تعديلات الاستحقاق
    const accrual_revenue = total_cash_in + accounts_receivable;
    // const accrual_expenses = total_cash_out + accounts_payable + total_losses;
    const accrual_expenses = total_cash_out + accounts_payable + total_losses_without_farms;

    const accrual_profit = accrual_revenue - accrual_expenses;

    return {
      cash_basis: {
        cash_in: {
          sales_cash_received: parseFloat(cash_received.toFixed(2)),
          old_debts_collected: parseFloat(old_debt_collected.toFixed(2)),
          total_cash_in: parseFloat(total_cash_in.toFixed(2))
        },
        cash_out: {
          purchases_cash_paid: parseFloat(cash_paid.toFixed(2)),
          costs_paid: parseFloat(total_costs_paid.toFixed(2)),
          total_cash_out: parseFloat(total_cash_out.toFixed(2)),
          costs_breakdown: {
            total_recorded: parseFloat(total_costs_recorded.toFixed(2)),
            actually_paid: parseFloat(total_costs_paid.toFixed(2)),
            remaining_unpaid: parseFloat(costs_remaining_unpaid.toFixed(2)),
            payment_rate_percentage: total_costs_recorded > 0 
              ? parseFloat(((total_costs_paid / total_costs_recorded) * 100).toFixed(2))
              : 0
          }
        },
        net_cash_flow: parseFloat(net_cash_flow.toFixed(2)),
        cash_flow_status: net_cash_flow > 0 ? 'إيجابي' : net_cash_flow < 0 ? 'سلبي' : 'محايد'
      },
      accrual_basis: {
        total_revenue: parseFloat(accrual_revenue.toFixed(2)),
        total_expenses: parseFloat(accrual_expenses.toFixed(2)),
        net_profit: parseFloat(accrual_profit.toFixed(2))
      },
      credit_activity: {
        credit_extended_to_buyers: parseFloat(accounts_receivable.toFixed(2)),
        credit_used_from_farms: parseFloat(credit_used.toFixed(2)),
        credit_extended_by_farms: parseFloat(accounts_payable.toFixed(2)),
        net_credit_position: parseFloat((accounts_receivable - accounts_payable).toFixed(2))
      },
      non_cash_expenses: {
        transport_losses: parseFloat(total_losses.toFixed(2))
      },
      reconciliation: {
        difference_cash_vs_accrual: parseFloat((accrual_profit - net_cash_flow).toFixed(2)),
        explanation: 'الفرق بسبب المستحقات والذمم الدائنة والمصروفات غير النقدية (الخسائر)'
      }
    };
  }

  /**
   * تجميع الإحصائيات التشغيلية
   */
  static async aggregateOperationalStats(operations) {
    const operationIds = operations.map(op => op.id);

    // الحصول على إجمالي الأحجام
    const farmTransactions = await FarmTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'total_purchased_kg'],
        [sequelize.fn('COUNT', sequelize.col('FarmTransaction.id')), 'farm_transaction_count']
      ],
      raw: true
    });

    const saleTransactions = await SaleTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('SaleTransaction.net_weight')), 'total_sold_kg'],
        [sequelize.fn('SUM', sequelize.col('SaleTransaction.total_amount')), 'total_revenue'],
        [sequelize.fn('COUNT', sequelize.col('SaleTransaction.id')), 'sale_count']
      ],
      raw: true
    });

    // const losses = await TransportLoss.findAll({
    //   where: { daily_operation_id: { [Op.in]: operationIds } },
    //   attributes: [
    //     [sequelize.fn('SUM', sequelize.col('TransportLoss.dead_weight')), 'total_lost_kg'],
    //     [sequelize.fn('COUNT', sequelize.col('TransportLoss.id')), 'loss_count']
    //   ],
    //   raw: true
    // });
const losses = await TransportLoss.findAll({
  where: { 
    daily_operation_id: { [Op.in]: operationIds },
    farm_id: null,
    source: { [Op.ne]: 'SALE' }
  },
  attributes: [
    [sequelize.fn('SUM', sequelize.col('TransportLoss.loss_amount')), 'total_losses_without_farms']
  ],
  raw: true
});

const total_losses = parseFloat(losses[0]?.total_losses_without_farms || 0);

    const total_purchased_kg = parseFloat(farmTransactions[0]?.total_purchased_kg || 0);
    const total_sold_kg = parseFloat(saleTransactions[0]?.total_sold_kg || 0);
    const total_lost_kg = parseFloat(losses[0]?.total_lost_kg || 0);
    const total_revenue = parseFloat(saleTransactions[0]?.total_revenue || 0);

    const avg_price_per_kg = total_sold_kg > 0 
      ? (total_revenue / total_sold_kg).toFixed(2)
      : 0;

    const loss_percentage = total_purchased_kg > 0
      ? ((total_lost_kg / total_purchased_kg) * 100).toFixed(2)
      : 0;

    return {
      total_operations: operations.length,
      vehicles_used: new Set(operations.flatMap(op => op.vehicles.map(v => v.id))).size,
      total_volume_kg: parseFloat(total_sold_kg.toFixed(2)),
      avg_price_per_kg: parseFloat(avg_price_per_kg),
      loss_percentage: parseFloat(loss_percentage),
      total_transactions: parseInt(farmTransactions[0]?.farm_transaction_count || 0) + 
                         parseInt(saleTransactions[0]?.sale_count || 0)
    };
  }

  /**
   * حساب الاتجاهات مقابل الفترة السابقة
   */
  static async calculateTrends(startDate, endDate, currentFinancials) {
    try {
      // حساب تواريخ الفترة السابقة
      const start = new Date(startDate);
      const end = new Date(endDate);
      const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      
      const previousEnd = new Date(start);
      previousEnd.setDate(previousEnd.getDate() - 1);
      
      const previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - duration + 1);

      // الحصول على عمليات الفترة السابقة
      const previousOps = await this.getOperationsInPeriod(
        previousStart.toISOString().split('T')[0],
        previousEnd.toISOString().split('T')[0]
      );

      if (previousOps.length === 0) {
        return {
          has_comparison: false,
          message: 'لا توجد بيانات للفترة السابقة للمقارنة'
        };
      }

      const previousFinancials = this.aggregateFinancials(previousOps);

      const revenue_change = currentFinancials.total_revenue - previousFinancials.total_revenue;
      const revenue_change_pct = previousFinancials.total_revenue > 0
        ? ((revenue_change / previousFinancials.total_revenue) * 100).toFixed(2)
        : 0;

      const profit_change = currentFinancials.net_profit - previousFinancials.net_profit;
      const profit_change_pct = previousFinancials.net_profit > 0
        ? ((profit_change / previousFinancials.net_profit) * 100).toFixed(2)
        : 0;

      let direction = 'مستقر';
      if (profit_change_pct > 5) direction = 'تحسن';
      else if (profit_change_pct < -5) direction = 'تراجع';

      return {
        has_comparison: true,
        revenue_change: parseFloat(revenue_change.toFixed(2)),
        revenue_change_pct: parseFloat(revenue_change_pct),
        profit_change: parseFloat(profit_change.toFixed(2)),
        profit_change_pct: parseFloat(profit_change_pct),
        direction,
        previous_period_revenue: previousFinancials.total_revenue,
        previous_period_profit: previousFinancials.net_profit
      };

    } catch (error) {
      console.error('خطأ في حساب الاتجاهات:', error);
      return {
        has_comparison: false,
        error: error.message
      };
    }
  }

  /**
   * بناء تفصيل الإيرادات
   */
  static async buildRevenueBreakdown(operations) {
    const operationIds = operations.map(op => op.id);

    // الحصول على المبيعات حسب نوع الدجاج
    const salesByType = await SaleTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        'chicken_type_id',
        [sequelize.fn('SUM', sequelize.col('SaleTransaction.total_amount')), 'total_revenue'],
        [sequelize.fn('SUM', sequelize.col('SaleTransaction.net_weight')), 'total_volume_kg'],
        [sequelize.fn('COUNT', sequelize.col('SaleTransaction.id')), 'transaction_count']
      ],
      include: [
        {
          model: ChickenType,
          as: 'chicken_type',
          attributes: ['id', 'name']
        }
      ],
      group: ['chicken_type_id', 'chicken_type.id'],
      raw: true,
      nest: true
    });

    // الحصول على عدد المشترين الفريدين
    const uniqueBuyers = await SaleTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [[sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('buyer_id'))), 'count']],
      raw: true
    });

    const total_revenue = salesByType.reduce((sum, item) => 
      sum + parseFloat(item.total_revenue || 0), 0
    );

    const total_volume_kg = salesByType.reduce((sum, item) => 
      sum + parseFloat(item.total_volume_kg || 0), 0
    );

    const avg_sale_price_per_kg = total_volume_kg > 0 
      ? (total_revenue / total_volume_kg).toFixed(2)
      : 0;

    return {
      total_sales: parseFloat(total_revenue.toFixed(2)),
      total_volume_kg: parseFloat(total_volume_kg.toFixed(2)),
      avg_sale_price_per_kg: parseFloat(avg_sale_price_per_kg),
      buyers_served: parseInt(uniqueBuyers[0]?.count || 0),
      
      by_chicken_type: salesByType.map(item => ({
        chicken_type_id: item.chicken_type_id,
        chicken_type_name: item.chicken_type.name,
        total_revenue: parseFloat(parseFloat(item.total_revenue).toFixed(2)),
        total_volume_kg: parseFloat(parseFloat(item.total_volume_kg).toFixed(2)),
        percentage_of_revenue: total_revenue > 0 
          ? parseFloat(((item.total_revenue / total_revenue) * 100).toFixed(2))
          : 0,
        transaction_count: parseInt(item.transaction_count)
      })).sort((a, b) => b.total_revenue - a.total_revenue)
    };
  }

  /**
   * بناء تفصيل التكاليف
   */
  static async buildCostBreakdown(operations) {
    const operationIds = operations.map(op => op.id);

    // الحصول على المشتريات
    const purchases = await FarmTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('FarmTransaction.total_amount')), 'total_purchases'],
        [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'total_weight']
      ],
      raw: true
    });

    // الحصول على التكاليف حسب الفئة
    const costsByCategory = await DailyCost.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        'cost_category_id',
        [sequelize.fn('SUM', sequelize.col('DailyCost.amount')), 'total_amount']
      ],
      include: [
        {
          model: CostCategory,
          as: 'category',
          attributes: ['id', 'name', 'is_vehicle_cost']
        }
      ],
      group: ['cost_category_id', 'category.id'],
      raw: true,
      nest: true
    });

    // الحصول على الخسائر
    const losses = await TransportLoss.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('TransportLoss.loss_amount')), 'total_losses']
      ],
      raw: true
    });

    const total_purchases = parseFloat(purchases[0]?.total_purchases || 0);
    const total_weight = parseFloat(purchases[0]?.total_weight || 0);
    const total_losses = parseFloat(losses[0]?.total_losses || 0);

    let vehicle_costs = 0;
    let operating_costs = 0;

    const top_cost_categories = costsByCategory.map(item => {
      const amount = parseFloat(item.total_amount || 0);
      
      if (item.category.is_vehicle_cost) {
        vehicle_costs += amount;
      } else {
        operating_costs += amount;
      }

      return {
        category_id: item.cost_category_id,
        category_name: item.category.name,
        amount: parseFloat(amount.toFixed(2)),
        is_vehicle_cost: item.category.is_vehicle_cost
      };
    }).sort((a, b) => b.amount - a.amount);

    const total_costs = total_purchases + vehicle_costs + operating_costs + total_losses;
    const cost_per_kg = total_weight > 0 ? (total_costs / total_weight).toFixed(2) : 0;

    // إضافة المشتريات كـ "فئة"
    const allCategories = [
      {
        category_name: 'مشتريات المزارع',
        amount: parseFloat(total_purchases.toFixed(2)),
        percentage: total_costs > 0 ? parseFloat(((total_purchases / total_costs) * 100).toFixed(2)) : 0,
        is_vehicle_cost: false
      },
      ...top_cost_categories.map(cat => ({
        ...cat,
        percentage: total_costs > 0 ? parseFloat(((cat.amount / total_costs) * 100).toFixed(2)) : 0
      })),
      {
        category_name: 'خسائر النقل',
        amount: parseFloat(total_losses.toFixed(2)),
        percentage: total_costs > 0 ? parseFloat(((total_losses / total_costs) * 100).toFixed(2)) : 0,
        is_vehicle_cost: false
      }
    ].sort((a, b) => b.amount - a.amount);

    return {
      total_costs: parseFloat(total_costs.toFixed(2)),
      components: {
        purchases: parseFloat(total_purchases.toFixed(2)),
        vehicle_costs: parseFloat(vehicle_costs.toFixed(2)),
        operating_costs: parseFloat(operating_costs.toFixed(2)),
        losses: parseFloat(total_losses.toFixed(2))
      },
      cost_per_kg: parseFloat(cost_per_kg),
      top_cost_categories: allCategories.slice(0, 10)
    };
  }

  /**
   * بناء ترتيب أداء المركبات
   */
  static async buildVehiclePerformance(operations) {
    const vehicleStats = {};

    for (const operation of operations) {
      for (const vehicle of operation.vehicles) {
        if (!vehicleStats[vehicle.id]) {
          vehicleStats[vehicle.id] = {
            vehicle_id: vehicle.id,
            vehicle_name: vehicle.name,
            plate_number: vehicle.plate_number,
            days_operated: 0,
            total_revenue: 0,
            total_purchases: 0,
            total_costs: 0,
            total_losses: 0,
            vehicle_specific_costs: 0
          };
        }

        vehicleStats[vehicle.id].days_operated += 1;

        // الحصول على البيانات الخاصة بالمركبة لهذه العملية
        const [sales, purchases, costs, losses] = await Promise.all([
          SaleTransaction.sum('total_amount', {
            where: {
              daily_operation_id: operation.id,
              vehicle_id: vehicle.id
            }
          }),
          FarmTransaction.sum('total_amount', {
            where: {
              daily_operation_id: operation.id,
              vehicle_id: vehicle.id
            }
          }),
          DailyCost.findAll({
            where: {
              daily_operation_id: operation.id,
              vehicle_id: vehicle.id
            },
            include: [{
              model: CostCategory,
              as: 'category',
              attributes: ['is_vehicle_cost']
            }]
          }),
          TransportLoss.sum('loss_amount', {
            where: {
              daily_operation_id: operation.id,
              vehicle_id: vehicle.id,
              farm_id: null,
              source: { [Op.ne]: 'SALE' }
            }
          })
        ]);

        vehicleStats[vehicle.id].total_revenue += parseFloat(sales || 0);
        vehicleStats[vehicle.id].total_purchases += parseFloat(purchases || 0);
        vehicleStats[vehicle.id].total_losses += parseFloat(losses || 0);

        costs.forEach(cost => {
          const amount = parseFloat(cost.amount || 0);
          vehicleStats[vehicle.id].vehicle_specific_costs += amount;
          vehicleStats[vehicle.id].total_costs += amount;
        });
      }
    }

    // حساب المقاييس والترتيب
    const vehicles = Object.values(vehicleStats).map(v => {
      const net_profit = v.total_revenue - v.total_purchases - v.total_costs;
      const profit_margin_pct = v.total_revenue > 0 
        ? ((net_profit / v.total_revenue) * 100).toFixed(2)
        : 0;
      const avg_daily_profit = v.days_operated > 0 
        ? (net_profit / v.days_operated).toFixed(2)
        : 0;

      let performance_rating = 'NEEDS_IMPROVEMENT';
      if (parseFloat(profit_margin_pct) >= 15) performance_rating = 'EXCELLENT';
      else if (parseFloat(profit_margin_pct) >= 12) performance_rating = 'GOOD';
      else if (parseFloat(profit_margin_pct) >= 8) performance_rating = 'AVERAGE';

      return {
        ...v,
        net_profit: parseFloat(net_profit.toFixed(2)),
        profit_margin_pct: parseFloat(profit_margin_pct),
        avg_daily_profit: parseFloat(avg_daily_profit),
        performance_rating,
        total_revenue: parseFloat(v.total_revenue.toFixed(2)),
        total_purchases: parseFloat(v.total_purchases.toFixed(2)),
        total_costs: parseFloat(v.total_costs.toFixed(2)),
        total_losses: parseFloat(v.total_losses.toFixed(2)),
        vehicle_specific_costs: parseFloat(v.vehicle_specific_costs.toFixed(2))
      };
    }).sort((a, b) => b.net_profit - a.net_profit);

    // إضافة الترتيب
    vehicles.forEach((v, index) => {
      v.rank = index + 1;
    });

    return {
      summary: {
        total_vehicles: vehicles.length,
        most_profitable_vehicle_id: vehicles[0]?.vehicle_id || null,
        least_profitable_vehicle_id: vehicles[vehicles.length - 1]?.vehicle_id || null,
        profit_variance_high_to_low: vehicles.length > 1
          ? parseFloat((vehicles[0].net_profit - vehicles[vehicles.length - 1].net_profit).toFixed(2))
          : 0
      },
      vehicles,
      note: 'تكاليف المركبات تشمل فقط المصروفات المخصصة لكل مركبة، وليس التكاليف التشغيلية المشتركة'
    };
  }

  /**
   * بناء ملخص وضع الديون
   */
  static async buildDebtPosition() {
    // أرصدة المزارع
    const farmReceivables = await Farm.findAll({
      where: { current_balance: { [Op.gt]: 0 } },
      attributes: ['id', 'name', 'current_balance'],
      order: [['current_balance', 'DESC']]
    });

    const farmPayables = await Farm.findAll({
      where: { current_balance: { [Op.lt]: 0 } },
      attributes: ['id', 'name', 'current_balance'],
      order: [['current_balance', 'ASC']]
    });

    const total_receivables = farmReceivables.reduce((sum, f) => 
      sum + parseFloat(f.current_balance), 0
    );

    const total_payables = Math.abs(farmPayables.reduce((sum, f) => 
      sum + parseFloat(f.current_balance), 0
    ));

    const net_farm_position = total_receivables - total_payables;

    // ديون المشترين
    const buyerReceivables = await Buyer.findAll({
      where: { current_balance: { [Op.gt]: 0 } },
      attributes: ['id', 'name', 'current_balance'],
      order: [['current_balance', 'DESC']]
    });

    const buyerPayables = await Buyer.findAll({
      where: { current_balance: { [Op.lt]: 0 } },
      attributes: ['id', 'name', 'current_balance'],
      order: [['current_balance', 'ASC']]
    });

    const total_buyer_debt = buyerReceivables.reduce((sum, b) => 
      sum + parseFloat(b.current_balance), 0
    );

    const total_buyer_credit = Math.abs(buyerPayables.reduce((sum, b) => 
      sum + parseFloat(b.current_balance), 0
    ));

    return {
      farms: {
        total_receivables: parseFloat(total_receivables.toFixed(2)),
        total_payables: parseFloat(total_payables.toFixed(2)),
        net_position: parseFloat(net_farm_position.toFixed(2)),
        position_type: net_farm_position > 0 ? 'مستحق لنا' : 
                      net_farm_position < 0 ? 'مستحق علينا' : 'متوازن',
        farms_with_balance: farmReceivables.length + farmPayables.length,
        largest_debtor: farmReceivables.length > 0 ? {
          farm_id: farmReceivables[0].id,
          farm_name: farmReceivables[0].name,
          amount_owed: parseFloat(parseFloat(farmReceivables[0].current_balance).toFixed(2))
        } : null
      },
      buyers: {
        total_outstanding: parseFloat(total_buyer_debt.toFixed(2)),
        total_credits: parseFloat(total_buyer_credit.toFixed(2)),
        net_position: parseFloat((total_buyer_debt - total_buyer_credit).toFixed(2)),
        buyers_with_debt: buyerReceivables.length,
        buyers_with_credit: buyerPayables.length,
        largest_debtor: buyerReceivables.length > 0 ? {
          buyer_id: buyerReceivables[0].id,
          buyer_name: buyerReceivables[0].name,
          amount_owed: parseFloat(parseFloat(buyerReceivables[0].current_balance).toFixed(2))
        } : null
      },
      summary: {
        total_receivables: parseFloat((total_receivables + total_buyer_debt).toFixed(2)),
        total_payables: parseFloat((total_payables + total_buyer_credit).toFixed(2)),
        net_working_capital: parseFloat((total_receivables + total_buyer_debt - total_payables - total_buyer_credit).toFixed(2))
      }
    };
  }

  /**
   * بناء المقاييس التشغيلية
   */
  static async buildOperationalMetrics(operations) {
    const operationIds = operations.map(op => op.id);

    const [volumeData, pricingData, engagementData] = await Promise.all([
      // مقاييس الحجم
      Promise.all([
        FarmTransaction.findAll({
          where: { daily_operation_id: { [Op.in]: operationIds } },
          attributes: [
            [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'total_purchased_kg']
          ],
          raw: true
        }),
        SaleTransaction.findAll({
          where: { daily_operation_id: { [Op.in]: operationIds } },
          attributes: [
            [sequelize.fn('SUM', sequelize.col('SaleTransaction.net_weight')), 'total_sold_kg']
          ],
          raw: true
        }),
        TransportLoss.findAll({
          where: { daily_operation_id: { [Op.in]: operationIds } },
          attributes: [
            [sequelize.fn('SUM', sequelize.col('TransportLoss.dead_weight')), 'total_lost_kg']
          ],
          raw: true
        })
      ]),

      // مقاييس التسعير - استخدام المتوسط المرجح
      Promise.all([
        FarmTransaction.findAll({
          where: { daily_operation_id: { [Op.in]: operationIds } },
          attributes: [
            [sequelize.fn('SUM', sequelize.col('FarmTransaction.total_amount')), 'total_purchase_amount'],
            [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'total_purchase_weight']
          ],
          raw: true
        }),
        SaleTransaction.findAll({
          where: { daily_operation_id: { [Op.in]: operationIds } },
          attributes: [
            [sequelize.fn('SUM', sequelize.col('SaleTransaction.total_amount')), 'total_sale_amount'],
            [sequelize.fn('SUM', sequelize.col('SaleTransaction.net_weight')), 'total_sale_weight']
          ],
          raw: true
        })
      ]),

      // مقاييس التفاعل
      Promise.all([
        FarmTransaction.findAll({
          where: { daily_operation_id: { [Op.in]: operationIds } },
          attributes: [[sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('FarmTransaction.farm_id'))), 'count']],
          raw: true
        }),
        SaleTransaction.findAll({
          where: { daily_operation_id: { [Op.in]: operationIds } },
          attributes: [[sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('SaleTransaction.buyer_id'))), 'count']],
          raw: true
        })
      ])
    ]);

    const total_purchased_kg = parseFloat(volumeData[0][0]?.total_purchased_kg || 0);
    const total_sold_kg = parseFloat(volumeData[1][0]?.total_sold_kg || 0);
    const total_lost_kg = parseFloat(volumeData[2][0]?.total_lost_kg || 0);

    // حساب متوسط الأسعار المرجحة
    const total_purchase_amount = parseFloat(pricingData[0][0]?.total_purchase_amount || 0);
    const total_purchase_weight = parseFloat(pricingData[0][0]?.total_purchase_weight || 0);
    const avg_purchase_price = total_purchase_weight > 0 
      ? (total_purchase_amount / total_purchase_weight) 
      : 0;

    const total_sale_amount = parseFloat(pricingData[1][0]?.total_sale_amount || 0);
    const total_sale_weight = parseFloat(pricingData[1][0]?.total_sale_weight || 0);
    const avg_sale_price = total_sale_weight > 0 
      ? (total_sale_amount / total_sale_weight) 
      : 0;

    const loss_percentage = total_purchased_kg > 0 
      ? ((total_lost_kg / total_purchased_kg) * 100).toFixed(2)
      : 0;

    const gross_margin_per_kg = avg_sale_price - avg_purchase_price;
    const gross_margin_percentage = avg_purchase_price > 0
      ? ((gross_margin_per_kg / avg_purchase_price) * 100).toFixed(2)
      : 0;

    const sale_count = await SaleTransaction.count({
      where: { daily_operation_id: { [Op.in]: operationIds } }
    });
    
    const avg_transaction_size_kg = sale_count > 0 
      ? (total_sold_kg / sale_count).toFixed(2)
      : 0;

    return {
      volume_metrics: {
        total_purchased_kg: parseFloat(total_purchased_kg.toFixed(2)),
        total_sold_kg: parseFloat(total_sold_kg.toFixed(2)),
        total_lost_kg: parseFloat(total_lost_kg.toFixed(2)),
        loss_percentage: parseFloat(loss_percentage),
        inventory_efficiency: total_purchased_kg > 0 
          ? parseFloat(((total_sold_kg / total_purchased_kg) * 100).toFixed(2))
          : 0
      },
      pricing_metrics: {
        avg_purchase_price_per_kg: parseFloat(avg_purchase_price.toFixed(2)),
        avg_sale_price_per_kg: parseFloat(avg_sale_price.toFixed(2)),
        gross_margin_per_kg: parseFloat(gross_margin_per_kg.toFixed(2)),
        gross_margin_percentage: parseFloat(gross_margin_percentage),
        markup_percentage: avg_purchase_price > 0 
          ? parseFloat((((avg_sale_price - avg_purchase_price) / avg_purchase_price) * 100).toFixed(2))
          : 0
      },
      efficiency_metrics: {
        farms_engaged: parseInt(engagementData[0][0]?.count || 0),
        buyers_engaged: parseInt(engagementData[1][0]?.count || 0),
        avg_transaction_size_kg: parseFloat(avg_transaction_size_kg),
        total_transactions: sale_count
      },
      note: 'تم حساب الأسعار باستخدام المتوسطات المرجحة بناءً على أحجام المعاملات الفعلية'
    };
  }

  /**
   * بناء النقاط البارزة والتنبيهات
   */
  static async buildHighlightsAndAlerts(operations) {
    // إيجاد أفضل وأسوأ أيام الربح
    const sortedByProfit = [...operations].sort((a, b) => 
      parseFloat(b.profit_distribution?.net_profit || 0) - 
      parseFloat(a.profit_distribution?.net_profit || 0)
    );

    const best_profit_day = sortedByProfit.length > 0 ? {
      date: sortedByProfit[0].operation_date,
      net_profit: parseFloat(parseFloat(sortedByProfit[0].profit_distribution?.net_profit || 0).toFixed(2)),
      operations: 1
    } : null;

    const worst_profit_day = sortedByProfit.length > 0 ? {
      date: sortedByProfit[sortedByProfit.length - 1].operation_date,
      net_profit: parseFloat(parseFloat(sortedByProfit[sortedByProfit.length - 1].profit_distribution?.net_profit || 0).toFixed(2))
    } : null;

    // إيجاد أعلى حدث خسارة
    const operationIds = operations.map(op => op.id);
    const highestLoss = await TransportLoss.findOne({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      include: [{ model: DailyOperation, as: 'operation', attributes: ['operation_date'] }],
      order: [['loss_amount', 'DESC']]
    });

    const highest_loss_event = highestLoss ? {
      date: highestLoss.operation.operation_date,
      loss_amount: parseFloat(parseFloat(highestLoss.loss_amount).toFixed(2)),
      dead_weight_kg: parseFloat(parseFloat(highestLoss.dead_weight).toFixed(2))
    } : null;

    // توليد التنبيهات
    const alerts = await this.generateAlerts(operations);

    return {
      top_performers: {
        best_profit_day,
        best_margin_day: best_profit_day
      },
      concerns: {
        worst_profit_day,
        highest_loss_event
      },
      alerts
    };
  }

  /**
   * توليد التنبيهات التلقائية
   */
  static async generateAlerts(operations) {
    const alerts = [];
    const operationIds = operations.map(op => op.id);

    // التحقق من معدلات الخسارة العالية لكل مركبة
    const vehicleLosses = await TransportLoss.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        'vehicle_id',
        [sequelize.fn('SUM', sequelize.col('TransportLoss.dead_weight')), 'total_lost'],
        [sequelize.fn('COUNT', sequelize.col('TransportLoss.id')), 'loss_count']
      ],
      include: [{ model: Vehicle, as: 'vehicle', attributes: ['name'] }],
      group: ['vehicle_id', 'vehicle.id'],
      raw: true,
      nest: true
    });

    const purchases = await FarmTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        'vehicle_id',
        [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'total_purchased']
      ],
      group: ['vehicle_id'],
      raw: true
    });

    const purchaseMap = {};
    purchases.forEach(p => {
      purchaseMap[p.vehicle_id] = parseFloat(p.total_purchased);
    });

    vehicleLosses.forEach(vl => {
      const total_purchased = purchaseMap[vl.vehicle_id] || 0;
      const total_lost = parseFloat(vl.total_lost);
      const loss_rate = total_purchased > 0 ? (total_lost / total_purchased) * 100 : 0;

      if (loss_rate > 3) {
        alerts.push({
          type: 'معدل_خسارة_عالي',
          severity: loss_rate > 5 ? 'عالية' : 'متوسطة',
          message: `المركبة '${vl.vehicle.name}' لديها معدل خسارة ${loss_rate.toFixed(2)}%`,
          action_required: 'فحص نظام التبريد وظروف النقل للمركبة',
          vehicle_id: vl.vehicle_id,
          loss_rate: parseFloat(loss_rate.toFixed(2))
        });
      }
    });

    // التحقق من ديون المزارع المتزايدة
    const farms = await Farm.findAll({
      where: { current_balance: { [Op.lt]: -10000 } },
      attributes: ['id', 'name', 'current_balance']
    });

    farms.forEach(farm => {
      alerts.push({
        type: 'ذمم_مزارع_عالية',
        severity: 'متوسطة',
        message: `نحن مدينون للمزرعة '${farm.name}' بمبلغ ${Math.abs(parseFloat(farm.current_balance)).toFixed(2)} جنيه`,
        action_required: 'جدولة الدفع للحفاظ على علاقة جيدة مع المورد',
        farm_id: farm.id,
        amount: parseFloat(Math.abs(farm.current_balance).toFixed(2))
      });
    });

    // التحقق من ديون المشترين المتأخرة
    // const buyers = await Buyer.findAll({
    //   where: { total_debt: { [Op.gt]: 20000 } },
    //   attributes: ['id', 'name', 'total_debt']
    // });

    // buyers.forEach(buyer => {
    //   alerts.push({
    //     type: 'دين_مشتري_عالي',
    //     severity: 'عالية',
    //     message: `المشتري '${buyer.name}' مدين بمبلغ ${parseFloat(buyer.total_debt).toFixed(2)} جنيه`,
    //     action_required: 'المتابعة على الدفع أو تقييد الائتمان الإضافي',
    //     buyer_id: buyer.id,
    //     amount: parseFloat(parseFloat(buyer.total_debt).toFixed(2))
    //   });
    // });
const highReceivableBuyers = await Buyer.findAll({
  where: { current_balance: { [Op.gt]: 20000 } },   // ← was total_debt
  attributes: ['id', 'name', 'current_balance']       // ← was total_debt
});
 
highReceivableBuyers.forEach(buyer => {
  const balance = round2(parseFloat(buyer.current_balance) || 0);
  alerts.push({
    type:            'دين_مشتري_عالي',
    severity:        'عالية',
    message:         `المشتري '${buyer.name}' مدين بمبلغ ${balance.toFixed(2)} جنيه`,
    action_required: 'المتابعة على الدفع أو تقييد الائتمان الإضافي',
    buyer_id:        buyer.id,
    amount:          balance,
    balance_type:    'RECEIVABLE'
  });
});
 
// ── Buyers we owe a large credit to (payables) ──────────────────────────────
const highCreditBuyers = await Buyer.findAll({
  where: { current_balance: { [Op.lt]: -20000 } },  // large negative balance
  attributes: ['id', 'name', 'current_balance']
});
 
highCreditBuyers.forEach(buyer => {
  const credit = round2(Math.abs(parseFloat(buyer.current_balance) || 0));
  alerts.push({
    type:            'رصيد_دائن_عالي',
    severity:        'متوسطة',
    message:         `للمشتري '${buyer.name}' رصيد دائن بمبلغ ${credit.toFixed(2)} جنيه`,
    action_required: 'مراجعة الرصيد الدائن وصرفه للمشتري أو تسويته',
    buyer_id:        buyer.id,
    amount:          credit,
    balance_type:    'CREDIT'
  });
});
 

    return alerts;
  }

  /**
   * بناء مقارنة الفترة
   */
  static async buildPeriodComparison(startDate, endDate, currentOps) {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      
      const previousEnd = new Date(start);
      previousEnd.setDate(previousEnd.getDate() - 1);
      
      const previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - duration + 1);

      const previousOps = await this.getOperationsInPeriod(
        previousStart.toISOString().split('T')[0],
        previousEnd.toISOString().split('T')[0]
      );

      if (previousOps.length === 0) {
        return {
          has_comparison: false,
          message: 'لا توجد بيانات للفترة السابقة للمقارنة'
        };
      }

      const currentFinancials = this.aggregateFinancials(currentOps);
      const previousFinancials = this.aggregateFinancials(previousOps);

      const revenue_change = currentFinancials.total_revenue - previousFinancials.total_revenue;
      const revenue_change_pct = previousFinancials.total_revenue > 0
        ? ((revenue_change / previousFinancials.total_revenue) * 100).toFixed(2)
        : 0;

      const profit_change = currentFinancials.net_profit - previousFinancials.net_profit;
      const profit_change_pct = previousFinancials.net_profit > 0
        ? ((profit_change / previousFinancials.net_profit) * 100).toFixed(2)
        : 0;

      const margin_change = currentFinancials.profit_margin_percentage - previousFinancials.profit_margin_percentage;

      let overall_trend = 'مستقر';
      if (profit_change_pct > 5) overall_trend = 'تحسن';
      else if (profit_change_pct < -5) overall_trend = 'تراجع';

      return {
        has_comparison: true,
        previous_period: {
          start_date: previousStart.toISOString().split('T')[0],
          end_date: previousEnd.toISOString().split('T')[0],
          revenue: previousFinancials.total_revenue,
          profit: previousFinancials.net_profit,
          operating_days: previousOps.length
        },
        changes: {
          revenue_change: parseFloat(revenue_change.toFixed(2)),
          revenue_change_pct: parseFloat(revenue_change_pct),
          profit_change: parseFloat(profit_change.toFixed(2)),
          profit_change_pct: parseFloat(profit_change_pct),
          margin_change_pct: parseFloat(margin_change.toFixed(2)),
          overall_trend
        }
      };

    } catch (error) {
      console.error('خطأ في بناء مقارنة الفترة:', error);
      return {
        has_comparison: false,
        error: error.message
      };
    }
  }

  /**
   * بناء روابط التفصيل
   */
  static buildDrillDownLinks(startDate, endDate) {
    return {
      daily_operations: `/api/reports/daily-breakdown?from=${startDate}&to=${endDate}`,
      vehicle_details: `/api/reports/vehicle-performance?from=${startDate}&to=${endDate}`,
      farm_balances: `/api/reports/farm-balances`,
      buyer_balances: `/api/reports/buyer-debts`,
      partner_profits: `/api/reports/partner-profits?from=${startDate}&to=${endDate}`
    };
  }

  /**
   * تنسيق تسمية الفترة
   */
  static formatPeriodLabel(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const monthNames = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];

    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
    }

    return `${start.toISOString().split('T')[0]} إلى ${end.toISOString().split('T')[0]}`;
  }
}

module.exports = PeriodReportService;