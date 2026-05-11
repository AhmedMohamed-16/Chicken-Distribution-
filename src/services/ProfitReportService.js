// =========================
// File: services/ProfitReportService.js
// الوصف: خدمة تحليل الأرباح الشاملة
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

class ProfitReportService {
  
  /**
   * نقطة الدخول الرئيسية لتقرير تحليل الأرباح
   */
  static async generateProfitReport(startDate, endDate) {
    try {
      // الحصول على جميع العمليات المغلقة في الفترة
      const operations = await this.getClosedOperations(startDate, endDate);
      
      if (operations.length === 0) {
        return {
          success: false,
          message: 'لا توجد عمليات مغلقة في الفترة المحددة'
        };
      }

      // بناء تقرير الأرباح الشامل
      const report = {
        report_type: 'PROFIT_ANALYSIS',
        generated_at: new Date(),
        period: await this.buildPeriodInfo(startDate, endDate, operations),
        
        '1_profit_composition_analysis': await this.buildProfitComposition(operations),
        '2_profit_per_kg_analysis': await this.buildProfitPerKg(operations, startDate, endDate),
        '3_profit_leakage_detection': await this.buildProfitLeakage(operations),
        '4_profit_stability_and_risk': await this.buildProfitStability(operations),
        '5_profit_efficiency_indicators': await this.buildProfitEfficiency(operations),
        '6_actionable_profit_recommendations': null,
        'executive_summary': null
      };

      // بناء التوصيات بناءً على التحليل
      report['6_actionable_profit_recommendations'] = await this.buildRecommendations(
        operations,
        report['3_profit_leakage_detection'],
        report['4_profit_stability_and_risk']
      );

      // بناء الملخص التنفيذي
      report['executive_summary'] = await this.buildExecutiveSummary(
        report['1_profit_composition_analysis'],
        report['2_profit_per_kg_analysis'],
        report['3_profit_leakage_detection'],
        report['4_profit_stability_and_risk'],
        report['6_actionable_profit_recommendations']
      );

      return {
        success: true,
        data: report
      };

    } catch (error) {
      console.error('خطأ في إنشاء تقرير الأرباح:', error);
      throw error;
    }
  }

  /**
   * الحصول على جميع العمليات المغلقة في الفترة
   */
  static async getClosedOperations(startDate, endDate) {
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
          as: 'profit_distribution',
          required: true
        }
      ],
      order: [['operation_date', 'ASC']]
    });
  }

  /**
   * بناء معلومات الفترة
   */
  static async buildPeriodInfo(startDate, endDate, operations) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    const uniqueOperationDates = new Set(operations.map(op => op.operation_date));
    const operatingDays = uniqueOperationDates.size;

    return {
      start_date: startDate,
      end_date: endDate,
      duration_days: durationDays,
      operating_days: operatingDays,
      total_operations: operations.length
    };
  }

  /**
   * 1️⃣ تحليل تكوين الأرباح
   */
  static async buildProfitComposition(operations) {
    const operationIds = operations.map(op => op.id);

    // الحصول على بيانات المعاملات التفصيلية
    const [salesData, purchasesData, lossesData] = await Promise.all([
      SaleTransaction.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('SaleTransaction.total_amount')), 'total_revenue'],
          [sequelize.fn('SUM', sequelize.col('SaleTransaction.net_weight')), 'total_sold_kg'],
          [sequelize.fn('AVG', sequelize.col('SaleTransaction.price_per_kg')), 'avg_sale_price']
        ],
        raw: true
      }),
      FarmTransaction.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('FarmTransaction.total_amount')), 'total_purchases'],
          [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'total_purchased_kg'],
          [sequelize.fn('AVG', sequelize.col('FarmTransaction.price_per_kg')), 'avg_purchase_price']
        ],
        raw: true
      }),
      TransportLoss.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('TransportLoss.loss_amount')), 'total_losses'],
          [
            sequelize.fn('SUM', 
              sequelize.literal('CASE WHEN "TransportLoss"."farm_id" IS NULL AND "TransportLoss"."source" != \'SALE\' THEN "TransportLoss"."loss_amount" ELSE 0 END')
            ), 
            'deductible_losses'
          ]
        ],
        raw: true
      })
    ]);

    const total_revenue = parseFloat(salesData[0]?.total_revenue || 0);
    const total_sold_kg = parseFloat(salesData[0]?.total_sold_kg || 0);
    const avg_sale_price = parseFloat(salesData[0]?.avg_sale_price || 0);
    
    const total_purchases = parseFloat(purchasesData[0]?.total_purchases || 0);
    const total_purchased_kg = parseFloat(purchasesData[0]?.total_purchased_kg || 0);
    const avg_purchase_price = parseFloat(purchasesData[0]?.avg_purchase_price || 0);
    
    const total_losses = parseFloat(lossesData[0]?.total_losses || 0);
    const deductible_losses = parseFloat(lossesData[0]?.deductible_losses || 0);

    // حساب صافي الربح الإجمالي من العمليات (بعد خصم تكاليف المركبات)
    const total_net_profit = operations.reduce((sum, op) => {
      const opNet = parseFloat(op.profit_distribution?.net_profit || 0);
      const opVehCosts = parseFloat(op.profit_distribution?.vehicle_costs || 0);
      return sum + (opNet - opVehCosts);
    }, 0);

    // حساب إجمالي التكاليف
    const total_costs = operations.reduce((sum, op) => 
      sum + parseFloat(op.profit_distribution?.total_costs || 0), 0
    );

    // المكون 1: ربح هامش التداول
    const price_spread = avg_sale_price - avg_purchase_price;
    const trading_margin_profit = price_spread * total_sold_kg;

    // المكون 2: ربح الاستفادة من الحجم
    const avg_daily_volume = total_sold_kg / operations.length;
    const baseline_volume = avg_daily_volume * operations.length;
    const extra_volume = total_sold_kg - baseline_volume;
    const volume_leverage_profit = extra_volume * price_spread;

    // المكون 3: تآكل الخسائر (فقط الفواقد المحملة على المكتب)
    const loss_erosion = -deductible_losses;

    // المكون 4: تأثير كفاءة التكلفة
    const expected_costs_per_kg = 2.0;
    const expected_costs = expected_costs_per_kg * total_sold_kg;
    const cost_efficiency_impact = expected_costs - total_costs;

    // حساب تقلب كل مكون عبر العمليات
    const dailyMargins = [];
    for (const op of operations) {
      const opSales = await SaleTransaction.findAll({
        where: { daily_operation_id: op.id },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('SaleTransaction.total_amount')), 'revenue'],
          [sequelize.fn('SUM', sequelize.col('SaleTransaction.net_weight')), 'sold_kg']
        ],
        raw: true
      });
      
      const opPurchases = await FarmTransaction.findAll({
        where: { daily_operation_id: op.id },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('FarmTransaction.total_amount')), 'purchases'],
          [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'purchased_kg']
        ],
        raw: true
      });

      const daily_revenue = parseFloat(opSales[0]?.revenue || 0);
      const daily_sold_kg = parseFloat(opSales[0]?.sold_kg || 0);
      const daily_purchases = parseFloat(opPurchases[0]?.purchases || 0);
      const daily_purchased_kg = parseFloat(opPurchases[0]?.purchased_kg || 0);

      if (daily_sold_kg > 0 && daily_purchased_kg > 0) {
        const daily_margin = (daily_revenue / daily_sold_kg) - (daily_purchases / daily_purchased_kg);
        dailyMargins.push(daily_margin);
      }
    }

    const margin_volatility = this.calculateStandardDeviation(dailyMargins);
    const margin_mean = dailyMargins.reduce((sum, m) => sum + m, 0) / dailyMargins.length;
    const coefficient_of_variation = margin_mean > 0 ? (margin_volatility / margin_mean) * 100 : 0;

    // حساب إجمالي تكاليف المركبات
    const total_vehicle_costs = operations.reduce((sum, op) => 
      sum + parseFloat(op.profit_distribution?.vehicle_costs || 0), 0
    );

    return {
      description: 'تفصيل مصدر صافي الربح النهائي (بعد كل التكاليف)',
      total_net_profit: parseFloat(total_net_profit.toFixed(2)),
      
      components: {
        trading_margin_profit: {
          amount: parseFloat(trading_margin_profit.toFixed(2)),
          percentage: total_net_profit > 0 ? parseFloat(((trading_margin_profit / total_net_profit) * 100).toFixed(2)) : 0,
          description: 'الربح من فرق السعر (سعر البيع - سعر الشراء) × الحجم',
          calculation: `(${avg_sale_price.toFixed(2)} - ${avg_purchase_price.toFixed(2)}) × ${total_sold_kg.toFixed(2)}`
        },
        
        volume_leverage_profit: {
          amount: parseFloat(volume_leverage_profit.toFixed(2)),
          percentage: total_net_profit > 0 ? parseFloat(((volume_leverage_profit / total_net_profit) * 100).toFixed(2)) : 0,
          description: 'ربح إضافي من بيع أحجام أكبر بنفس الهامش',
          calculation: `الحجم الإضافي × متوسط الهامش للكيلو`
        },
        
        loss_erosion: {
          amount: parseFloat(loss_erosion.toFixed(2)),
          percentage: total_net_profit > 0 ? parseFloat(((loss_erosion / total_net_profit) * 100).toFixed(2)) : 0,
          description: 'الربح المفقود بسبب فواقد النقل (المحملة على المكتب)',
          calculation: 'إجمالي مبالغ فاقد النقل غير المرتبط بمزرعة'
        },
        
        cost_efficiency_impact: {
          amount: parseFloat(cost_efficiency_impact.toFixed(2)),
          percentage: total_net_profit > 0 ? parseFloat(((cost_efficiency_impact / total_net_profit) * 100).toFixed(2)) : 0,
          description: 'تأثير الربح من التحكم في التكاليف التشغيلية (غير المركبات)',
          calculation: `(${expected_costs.toFixed(2)} - ${total_costs.toFixed(2)})`
        },

        vehicle_costs_impact: {
          amount: parseFloat((-total_vehicle_costs).toFixed(2)),
          percentage: total_net_profit > 0 ? parseFloat(((-total_vehicle_costs / total_net_profit) * 100).toFixed(2)) : 0,
          description: 'تكاليف تشغيل وصيانة المركبات (الموزعة على الشركاء)',
          calculation: `إجمالي مصروفات المركبات المسجلة`
        }
      },
      
      volatility_analysis: {
        most_volatile_component: 'trading_margin_profit',
        volatility_score: parseFloat(coefficient_of_variation.toFixed(2)),
        explanation: `هامش التداول يتفاوت بنسبة ${coefficient_of_variation.toFixed(1)}% بسبب تقلبات الأسعار بين الأيام`,
        stability_ranking: [
          'volume_leverage_profit',
          'cost_efficiency_impact',
          'trading_margin_profit',
          'loss_erosion',
          'vehicle_costs_impact'
        ]
      },
      
      key_insight: `${((trading_margin_profit / total_net_profit) * 100).toFixed(0)}% من الربح يأتي من فرق السعر. ركز على التفاوض للحصول على أسعار بيع أفضل أو خفض أسعار الشراء.`
    };
  }

  /**
   * 2️⃣ تحليل الربح لكل كيلوجرام
   */
  static async buildProfitPerKg(operations, startDate, endDate) {
    const operationIds = operations.map(op => op.id);

    // بيانات الفترة الحالية
    const [salesData, purchasesData, lossesData, costsData] = await Promise.all([
      SaleTransaction.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('SaleTransaction.total_amount')), 'total_revenue'],
          [sequelize.fn('SUM', sequelize.col('SaleTransaction.net_weight')), 'total_sold_kg'],
          [sequelize.literal('SUM("SaleTransaction"."total_amount") / SUM("SaleTransaction"."net_weight")'), 'weighted_avg_sale_price']
        ],
        raw: true
      }),
      FarmTransaction.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('FarmTransaction.total_amount')), 'total_purchases'],
          [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'total_purchased_kg'],
          [sequelize.literal('SUM("FarmTransaction"."total_amount") / SUM("FarmTransaction"."net_chicken_weight")'), 'weighted_avg_purchase_price']
        ],
        raw: true
      }),
      TransportLoss.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('TransportLoss.loss_amount')), 'total_losses'],
          [sequelize.fn('SUM', sequelize.col('TransportLoss.dead_weight')), 'total_lost_kg'],
          [
            sequelize.fn('SUM', 
              sequelize.literal('CASE WHEN "TransportLoss"."farm_id" IS NULL AND "TransportLoss"."source" != \'SALE\' THEN "TransportLoss"."loss_amount" ELSE 0 END')
            ), 
            'deductible_losses'
          ]
        ],
        raw: true
      }),
      DailyCost.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('DailyCost.amount')), 'total_costs']
        ],
        raw: true
      })
    ]);

    const total_sold_kg = parseFloat(salesData[0]?.total_sold_kg || 0);
    const total_purchased_kg = parseFloat(purchasesData[0]?.total_purchased_kg || 0);
    const sale_price_per_kg = parseFloat(salesData[0]?.weighted_avg_sale_price || 0);
    const purchase_price_per_kg = parseFloat(purchasesData[0]?.weighted_avg_purchase_price || 0);
    const total_losses = parseFloat(lossesData[0]?.total_losses || 0);
    const deductible_losses = parseFloat(lossesData[0]?.deductible_losses || 0);
    const total_lost_kg = parseFloat(lossesData[0]?.total_lost_kg || 0);
    const total_costs = parseFloat(costsData[0]?.total_costs || 0);

    const total_net_profit = operations.reduce((sum, op) => {
      const opNet = parseFloat(op.profit_distribution?.net_profit || 0);
      const opVehCosts = parseFloat(op.profit_distribution?.vehicle_costs || 0);
      return sum + (opNet - opVehCosts);
    }, 0);

    const net_profit_per_sold_kg = total_sold_kg > 0 ? total_net_profit / total_sold_kg : 0;
    const net_profit_per_purchased_kg = total_purchased_kg > 0 ? total_net_profit / total_purchased_kg : 0;
    const gross_margin_per_kg = sale_price_per_kg - purchase_price_per_kg;
    const loss_erosion_per_kg = total_sold_kg > 0 ? deductible_losses / total_sold_kg : 0;
    const cost_burden_per_kg = total_sold_kg > 0 ? total_costs / total_sold_kg : 0;

    // مقارنة الفترة السابقة
    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    const previousEnd = new Date(start);
    previousEnd.setDate(previousEnd.getDate() - 1);
    
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - duration + 1);

    const previousOps = await this.getClosedOperations(
      previousStart.toISOString().split('T')[0],
      previousEnd.toISOString().split('T')[0]
    );

    let previous_profit_per_kg = 0;
    let profit_per_kg_change = 0;
    let profit_per_kg_change_pct = 0;
    let trend = 'لا يوجد مقارنة';

    if (previousOps.length > 0) {
      const prevOpIds = previousOps.map(op => op.id);
      const prevSales = await SaleTransaction.findAll({
        where: { daily_operation_id: { [Op.in]: prevOpIds } },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('SaleTransaction.net_weight')), 'total_sold_kg']
        ],
        raw: true
      });

      const prev_total_sold_kg = parseFloat(prevSales[0]?.total_sold_kg || 0);
      const prev_total_profit = previousOps.reduce((sum, op) => 
        sum + parseFloat(op.profit_distribution?.net_profit || 0), 0
      );

      previous_profit_per_kg = prev_total_sold_kg > 0 ? prev_total_profit / prev_total_sold_kg : 0;
      profit_per_kg_change = net_profit_per_sold_kg - previous_profit_per_kg;
      profit_per_kg_change_pct = previous_profit_per_kg > 0 
        ? (profit_per_kg_change / previous_profit_per_kg) * 100 
        : 0;
      
      trend = profit_per_kg_change > 0 ? 'تحسن' : 
              profit_per_kg_change < 0 ? 'تراجع' : 'مستقر';
    }

    // الهدف مقابل الفعلي
    const target_profit_per_kg = 4.00;
    const gap = net_profit_per_sold_kg - target_profit_per_kg;
    const gap_percentage = target_profit_per_kg > 0 ? (gap / target_profit_per_kg) * 100 : 0;

    // تحليل الحساسية
    const if_purchase_drops_1_egp = net_profit_per_sold_kg + 1;
    const if_sale_increases_1_egp = net_profit_per_sold_kg + 1;
    const if_losses_reduce_50_pct = net_profit_per_sold_kg + (loss_erosion_per_kg * 0.5);

    return {
      description: 'مقاييس كفاءة الربح لكل كيلوجرام',
      
      current_period: {
        net_profit_per_sold_kg: parseFloat(net_profit_per_sold_kg.toFixed(2)),
        net_profit_per_purchased_kg: parseFloat(net_profit_per_purchased_kg.toFixed(2)),
        gross_margin_per_kg: parseFloat(gross_margin_per_kg.toFixed(2)),
        loss_erosion_per_kg: parseFloat(loss_erosion_per_kg.toFixed(2)),
        cost_burden_per_kg: parseFloat(cost_burden_per_kg.toFixed(2))
      },
      
      previous_period_comparison: {
        previous_profit_per_kg: parseFloat(previous_profit_per_kg.toFixed(2)),
        net_profit_per_sold_kg_change: parseFloat(profit_per_kg_change.toFixed(2)),
        net_profit_per_sold_kg_change_pct: parseFloat(profit_per_kg_change_pct.toFixed(2)),
        trend: trend,
        explanation: trend === 'تحسن' 
          ? `الربح لكل كيلو زاد بنسبة ${Math.abs(profit_per_kg_change_pct).toFixed(1)}% مقارنة بالفترة السابقة`
          : trend === 'تراجع'
            ? `الربح لكل كيلو انخفض بنسبة ${Math.abs(profit_per_kg_change_pct).toFixed(1)}% مقارنة بالفترة السابقة`
            : 'لا يوجد تغيير كبير عن الفترة السابقة'
      },
      
      breakdown_per_kg: {
        sale_price_per_kg: parseFloat(sale_price_per_kg.toFixed(2)),
        purchase_price_per_kg: parseFloat(purchase_price_per_kg.toFixed(2)),
        raw_margin_per_kg: parseFloat(gross_margin_per_kg.toFixed(2)),
        loss_deduction_per_kg: parseFloat(loss_erosion_per_kg.toFixed(2)),
        cost_deduction_per_kg: parseFloat(cost_burden_per_kg.toFixed(2)),
        final_profit_per_kg: parseFloat(net_profit_per_sold_kg.toFixed(2))
      },
      
      target_vs_actual: {
        target_profit_per_kg: target_profit_per_kg,
        actual_profit_per_kg: parseFloat(net_profit_per_sold_kg.toFixed(2)),
        gap: parseFloat(gap.toFixed(2)),
        gap_percentage: parseFloat(gap_percentage.toFixed(2)),
        required_improvement: gap < 0 
          ? `تحتاج لتحسين بنسبة ${Math.abs(gap_percentage).toFixed(2)}% للوصول للربح المستهدف لكل كيلو`
          : `تجاوز الهدف بنسبة ${gap_percentage.toFixed(2)}%`
      },
      
      sensitivity_analysis: {
        if_purchase_price_drops_1_egp: {
          new_profit_per_kg: parseFloat(if_purchase_drops_1_egp.toFixed(2)),
          profit_increase_pct: parseFloat(((1 / net_profit_per_sold_kg) * 100).toFixed(2))
        },
        if_sale_price_increases_1_egp: {
          new_profit_per_kg: parseFloat(if_sale_increases_1_egp.toFixed(2)),
          profit_increase_pct: parseFloat(((1 / net_profit_per_sold_kg) * 100).toFixed(2))
        },
        if_losses_reduce_50_percent: {
          new_profit_per_kg: parseFloat(if_losses_reduce_50_pct.toFixed(2)),
          profit_increase_pct: parseFloat((((loss_erosion_per_kg * 0.5) / net_profit_per_sold_kg) * 100).toFixed(2))
        }
      },
      
      key_insight: `تغيير 1 جنيه في سعر الشراء أو البيع له تأثير ${((1 / (loss_erosion_per_kg * 0.5)) || 0).toFixed(0)}× أكبر من تقليل الخسائر بنسبة 50%`
    };
  }

  /**
   * 3️⃣ كشف تسرب الأرباح
   */
  static async buildProfitLeakage(operations) {
    const operationIds = operations.map(op => op.id);
    const leakageSources = [];
    let totalLeakage = 0;

    // 1. أيام الخسائر العالية
    const normalLossRate = 1.8;
    const highLossDays = [];

    for (const op of operations) {
      const [purchases, losses] = await Promise.all([
        FarmTransaction.findAll({
          where: { daily_operation_id: op.id },
          attributes: [
            [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'total_purchased_kg']
          ],
          raw: true
        }),
        TransportLoss.findAll({
          where: { daily_operation_id: op.id },
          attributes: [
            [sequelize.fn('SUM', sequelize.col('TransportLoss.dead_weight')), 'total_lost_kg'],
            [sequelize.fn('SUM', sequelize.col('TransportLoss.loss_amount')), 'total_loss_amount']
          ],
          raw: true
        })
      ]);

      const purchased_kg = parseFloat(purchases[0]?.total_purchased_kg || 0);
      const lost_kg = parseFloat(losses[0]?.total_lost_kg || 0);
      const loss_amount = parseFloat(losses[0]?.total_loss_amount || 0);

      if (purchased_kg > 0) {
        const loss_rate = (lost_kg / purchased_kg) * 100;
        if (loss_rate > 3.0) {
          const normal_loss_amount = (normalLossRate / 100) * purchased_kg * (loss_amount / lost_kg);
          const excess_loss = loss_amount - normal_loss_amount;
          
          highLossDays.push({
            operation_id: op.id,
            date: op.operation_date,
            loss_rate: parseFloat(loss_rate.toFixed(2)),
            excess_loss: parseFloat(excess_loss.toFixed(2))
          });
        }
      }
    }

    if (highLossDays.length > 0) {
      const high_loss_leakage = highLossDays.reduce((sum, d) => sum + d.excess_loss, 0);
      totalLeakage += high_loss_leakage;

      // الحصول على المركبات المتأثرة
      const affectedVehicleIds = new Set();
      for (const day of highLossDays) {
        const losses = await TransportLoss.findAll({
          where: { daily_operation_id: day.operation_id },
          attributes: ['vehicle_id'],
          raw: true
        });
        losses.forEach(l => affectedVehicleIds.add(l.vehicle_id));
      }

      leakageSources.push({
        source: 'أيام الخسائر المرتفعة',
        leakage_amount: parseFloat(high_loss_leakage.toFixed(2)),
        affected_days: highLossDays.length,
        average_loss_on_these_days_pct: parseFloat((highLossDays.reduce((sum, d) => sum + d.loss_rate, 0) / highLossDays.length).toFixed(2)),
        normal_loss_rate_pct: normalLossRate,
        explanation: `${highLossDays.length} يوم كانت الخسائر فيه >3%، بتكلفة ${high_loss_leakage.toFixed(2)} جنيه إضافية مقابل المعدل الطبيعي`,
        affected_vehicles: Array.from(affectedVehicleIds),
        action: 'فحص أنظمة التبريد في المركبات المتأثرة'
      });
    }

    // 2. مزارع بهامش منخفض (دفع أعلى من متوسط السوق)
    const [allPurchases, marketAvgPrice] = await Promise.all([
      FarmTransaction.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          'farm_id',
          [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'total_kg'],
          [sequelize.literal('SUM("FarmTransaction"."total_amount") / SUM("FarmTransaction"."net_chicken_weight")'), 'avg_price']
        ],
        include: [{
          model: Farm,
          as: 'farm',
          attributes: ['id', 'name']
        }],
        group: ['farm_id', 'farm.id'],
        raw: true,
        nest: true
      }),
      FarmTransaction.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          [sequelize.literal('SUM("FarmTransaction"."total_amount") / SUM("FarmTransaction"."net_chicken_weight")'), 'market_avg']
        ],
        raw: true
      })
    ]);

    const market_avg_price = parseFloat(marketAvgPrice[0]?.market_avg || 0);
    const lowMarginFarms = [];
    let low_margin_leakage = 0;

    allPurchases.forEach(p => {
      const avg_price = parseFloat(p.avg_price || 0);
      const total_kg = parseFloat(p.total_kg || 0);
      
      if (avg_price > market_avg_price + 1.0) {
        const excess_per_kg = avg_price - market_avg_price;
        const farm_leakage = excess_per_kg * total_kg;
        low_margin_leakage += farm_leakage;

        lowMarginFarms.push({
          farm_id: p.farm_id,
          farm_name: p.farm.name,
          purchases_volume_kg: parseFloat(total_kg.toFixed(2)),
          purchase_price_avg: parseFloat(avg_price.toFixed(2)),
          market_avg_price: parseFloat(market_avg_price.toFixed(2)),
          excess_paid_per_kg: parseFloat(excess_per_kg.toFixed(2)),
          total_leakage: parseFloat(farm_leakage.toFixed(2)),
          explanation: `دفع ${excess_per_kg.toFixed(2)} جنيه/كجم أكثر من المتوسط`
        });
      }
    });

    if (lowMarginFarms.length > 0) {
      totalLeakage += low_margin_leakage;
      leakageSources.push({
        source: 'مزارع ذات هامش ربح منخفض',
        leakage_amount: parseFloat(low_margin_leakage.toFixed(2)),
        affected_farms: lowMarginFarms.sort((a, b) => b.total_leakage - a.total_leakage).slice(0, 5),
        action: 'إعادة التفاوض مع المزارع ذات الأسعار المرتفعة أو تقليل المشتريات منها'
      });
    }

    // 3. أسعار بيع ضعيفة (البيع أقل من متوسط السوق)
    const [allSales, marketAvgSalePrice] = await Promise.all([
      SaleTransaction.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          'buyer_id',
          [sequelize.fn('SUM', sequelize.col('SaleTransaction.net_weight')), 'total_kg'],
          [sequelize.literal('SUM("SaleTransaction"."total_amount") / SUM("SaleTransaction"."net_weight")'), 'avg_price']
        ],
        include: [{
          model: Buyer,
          as: 'buyer',
          attributes: ['id', 'name']
        }],
        group: ['buyer_id', 'buyer.id'],
        raw: true,
        nest: true
      }),
      SaleTransaction.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          [sequelize.literal('SUM("SaleTransaction"."total_amount") / SUM("SaleTransaction"."net_weight")'), 'market_avg']
        ],
        raw: true
      })
    ]);

    const market_avg_sale_price = parseFloat(marketAvgSalePrice[0]?.market_avg || 0);
    const weakSaleBuyers = [];
    let weak_sale_leakage = 0;

    allSales.forEach(s => {
      const avg_price = parseFloat(s.avg_price || 0);
      const total_kg = parseFloat(s.total_kg || 0);
      
      if (avg_price < market_avg_sale_price - 1.0) {
        const shortfall_per_kg = market_avg_sale_price - avg_price;
        const buyer_leakage = shortfall_per_kg * total_kg;
        weak_sale_leakage += buyer_leakage;

        weakSaleBuyers.push({
          buyer_id: s.buyer_id,
          buyer_name: s.buyer.name,
          sales_volume_kg: parseFloat(total_kg.toFixed(2)),
          sale_price_avg: parseFloat(avg_price.toFixed(2)),
          market_avg_price: parseFloat(market_avg_sale_price.toFixed(2)),
          shortfall_per_kg: parseFloat(shortfall_per_kg.toFixed(2)),
          total_leakage: parseFloat(buyer_leakage.toFixed(2)),
          explanation: `البيع بسعر ${shortfall_per_kg.toFixed(2)} جنيه/كجم أقل من المتوسط`
        });
      }
    });

    if (weakSaleBuyers.length > 0) {
      totalLeakage += weak_sale_leakage;
      leakageSources.push({
        source: 'أسعار بيع ضعيفة',
        leakage_amount: parseFloat(weak_sale_leakage.toFixed(2)),
        affected_buyers: weakSaleBuyers.sort((a, b) => b.total_leakage - a.total_leakage).slice(0, 5),
        action: 'زيادة الأسعار لهؤلاء المشترين أو تقليل الكمية'
      });
    }

    // 4. تكلفة الفرصة البديلة للمبالغ غير المدفوعة
    // const [totalReceivables] = await Promise.all([
    //   Buyer.findAll({
    //     attributes: [
    //       [sequelize.fn('SUM', sequelize.col('Buyer.total_debt')), 'total_receivables']
    //     ],
    //     raw: true
    //   })
    // ]);
 
const [buyerBalanceSummary] = await Promise.all([
  Buyer.findAll({
    attributes: [
      // Buyers who owe us (positive balance)
      [
        sequelize.fn('SUM',
          sequelize.literal('CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END')
        ),
        'total_receivables'
      ],
      // Buyers we owe (negative balance — stored as absolute value for readability)
      [
        sequelize.fn('SUM',
          sequelize.literal('CASE WHEN current_balance < 0 THEN ABS(current_balance) ELSE 0 END')
        ),
        'total_credits'
      ],
      // Net position across all buyers
      [
        sequelize.fn('SUM', sequelize.col('current_balance')),  // ← was total_debt
        'net_position'
      ]
    ],
    raw: true
  })
]);
 
// ── Extract values safely ────────────────────────────────────────────────────
    const total_receivables = parseFloat(buyerBalanceSummary[0]?.total_receivables || 0);
    const opportunity_cost_rate = 7.5;
    const opportunity_leakage = (total_receivables * opportunity_cost_rate) / 100;

    if (total_receivables > 10000) {
      totalLeakage += opportunity_leakage;
      leakageSources.push({
        source: 'تكلفة الفرصة البديلة للمبالغ غير المدفوعة',
        leakage_amount: parseFloat(opportunity_leakage.toFixed(2)),
        explanation: 'الأموال المقيدة في المستحقات كان يمكن أن تحقق ربحاً إضافياً إذا أعيد استثمارها',
        total_receivables: parseFloat(total_receivables.toFixed(2)),
        opportunity_cost_rate: opportunity_cost_rate,
        action: 'تسريع التحصيل أو تقديم خصومات للدفع المبكر'
      });
    }

    // حساب الربح المحتمل
    const actual_profit = operations.reduce((sum, op) => 
      sum + parseFloat(op.profit_distribution?.net_profit || 0), 0
    );
    const potential_profit = actual_profit + totalLeakage;

    // المكاسب السريعة
    const quickWins = [];
    leakageSources.forEach(source => {
      if (source.source === 'مزارع ذات هامش ربح منخفض' && source.affected_farms.length > 0) {
        const topFarm = source.affected_farms[0];
        quickWins.push({
          action: `التوقف عن الشراء من ${topFarm.farm_name} حتى يطابق سعر السوق`,
          estimated_monthly_savings: parseFloat(topFarm.total_leakage.toFixed(2)),
          difficulty: 'متوسطة'
        });
      }
      if (source.source === 'أيام الخسائر المرتفعة' && source.affected_vehicles.length > 0) {
        quickWins.push({
          action: `فحص نظام التبريد للمركبة ${source.affected_vehicles[0]}`,
          estimated_monthly_savings: parseFloat((source.leakage_amount * 0.5).toFixed(2)),
          difficulty: 'منخفضة'
        });
      }
    });

    return {
      description: 'تحديد مواضع فقدان الربح بشكل غير ضروري',
      total_identified_leakage: parseFloat(totalLeakage.toFixed(2)),
      leakage_as_percent_of_potential_profit: parseFloat(((totalLeakage / potential_profit) * 100).toFixed(2)),
      leakage_sources: leakageSources,
      quick_wins: quickWins
    };
  }

  /**
   * 4️⃣ استقرار الربح والمخاطر
   */
  static async buildProfitStability(operations) {
    // مصفوفة الأرباح اليومية
    const dailyProfits = operations.map(op => 
      parseFloat(op.profit_distribution?.net_profit || 0)
    );

    const mean_daily_profit = dailyProfits.reduce((sum, p) => sum + p, 0) / dailyProfits.length;
    const std_deviation = this.calculateStandardDeviation(dailyProfits);
    const coefficient_of_variation = mean_daily_profit > 0 ? (std_deviation / mean_daily_profit) * 100 : 0;

    let volatility_rating = 'منخفض';
    if (coefficient_of_variation > 50) volatility_rating = 'عالي';
    else if (coefficient_of_variation > 30) volatility_rating = 'متوسط';

    // نطاقات توزيع الأرباح
    const excellentDays = dailyProfits.filter(p => p > 7000);
    const goodDays = dailyProfits.filter(p => p >= 5000 && p <= 7000);
    const weakDays = dailyProfits.filter(p => p >= 3000 && p < 5000);
    const poorDays = dailyProfits.filter(p => p < 3000);

    const profitBands = {
      excellent_days_gt_7000: {
        count: excellentDays.length,
        percentage: parseFloat(((excellentDays.length / dailyProfits.length) * 100).toFixed(1)),
        avg_profit: excellentDays.length > 0 
          ? parseFloat((excellentDays.reduce((sum, p) => sum + p, 0) / excellentDays.length).toFixed(2))
          : 0
      },
      good_days_5000_to_7000: {
        count: goodDays.length,
        percentage: parseFloat(((goodDays.length / dailyProfits.length) * 100).toFixed(1)),
        avg_profit: goodDays.length > 0 
          ? parseFloat((goodDays.reduce((sum, p) => sum + p, 0) / goodDays.length).toFixed(2))
          : 0
      },
      weak_days_3000_to_5000: {
        count: weakDays.length,
        percentage: parseFloat(((weakDays.length / dailyProfits.length) * 100).toFixed(1)),
        avg_profit: weakDays.length > 0 
          ? parseFloat((weakDays.reduce((sum, p) => sum + p, 0) / weakDays.length).toFixed(2))
          : 0
      },
      poor_days_lt_3000: {
        count: poorDays.length,
        percentage: parseFloat(((poorDays.length / dailyProfits.length) * 100).toFixed(1)),
        avg_profit: poorDays.length > 0 
          ? parseFloat((poorDays.reduce((sum, p) => sum + p, 0) / poorDays.length).toFixed(2))
          : 0
      }
    };

    // مخاطر الاعتمادية
    const operationIds = operations.map(op => op.id);

    // تركيز المركبات
    const vehicleProfits = {};
    for (const op of operations) {
      for (const vehicle of op.vehicles) {
        if (!vehicleProfits[vehicle.id]) {
          vehicleProfits[vehicle.id] = {
            vehicle_id: vehicle.id,
            vehicle_name: vehicle.name,
            total_profit: 0
          };
        }

        const [sales, purchases, costs, losses] = await Promise.all([
          SaleTransaction.sum('total_amount', {
            where: { daily_operation_id: op.id, vehicle_id: vehicle.id }
          }),
          FarmTransaction.sum('total_amount', {
            where: { daily_operation_id: op.id, vehicle_id: vehicle.id }
          }),
          DailyCost.sum('amount', {
            where: { daily_operation_id: op.id, vehicle_id: vehicle.id }
          }),
          TransportLoss.sum('loss_amount', {
            where: { daily_operation_id: op.id, vehicle_id: vehicle.id }
          })
        ]);

        const vehicle_profit = (sales || 0) - (purchases || 0) - (costs || 0) - (losses || 0);
        vehicleProfits[vehicle.id].total_profit += vehicle_profit;
      }
    }

    const sortedVehicleProfits = Object.values(vehicleProfits).sort((a, b) => b.total_profit - a.total_profit);
    const total_profit = sortedVehicleProfits.reduce((sum, v) => sum + v.total_profit, 0);
    
    const top_vehicle_share = total_profit > 0 
      ? (sortedVehicleProfits[0]?.total_profit / total_profit) * 100 
      : 0;
    const top_2_vehicles_share = total_profit > 0 && sortedVehicleProfits.length >= 2
      ? ((sortedVehicleProfits[0].total_profit + sortedVehicleProfits[1].total_profit) / total_profit) * 100
      : top_vehicle_share;

    let vehicle_risk_level = 'منخفض';
    if (top_2_vehicles_share > 70) vehicle_risk_level = 'عالي';
    else if (top_2_vehicles_share > 50) vehicle_risk_level = 'متوسط';

    // تركيز المشترين
    const buyerRevenue = await SaleTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        'buyer_id',
        [sequelize.fn('SUM', sequelize.col('SaleTransaction.total_amount')), 'total_revenue']
      ],
      include: [{
        model: Buyer,
        as: 'buyer',
        attributes: ['id', 'name']
      }],
      group: ['buyer_id', 'buyer.id'],
      raw: true,
      nest: true,
      order: [[sequelize.fn('SUM', sequelize.col('SaleTransaction.total_amount')), 'DESC']]
    });

    const total_revenue = buyerRevenue.reduce((sum, b) => sum + parseFloat(b.total_revenue || 0), 0);
    const top_buyer_share = total_revenue > 0 && buyerRevenue.length > 0
      ? (parseFloat(buyerRevenue[0].total_revenue) / total_revenue) * 100
      : 0;
    const top_3_buyers_share = total_revenue > 0 && buyerRevenue.length >= 3
      ? ((parseFloat(buyerRevenue[0].total_revenue) + 
          parseFloat(buyerRevenue[1].total_revenue) + 
          parseFloat(buyerRevenue[2].total_revenue)) / total_revenue) * 100
      : top_buyer_share;

    let buyer_risk_level = 'منخفض';
    if (top_3_buyers_share > 70) buyer_risk_level = 'عالي';
    else if (top_3_buyers_share > 50) buyer_risk_level = 'متوسط';

    // تركيز المزارع
    const farmPurchases = await FarmTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        'farm_id',
        [sequelize.fn('SUM', sequelize.col('FarmTransaction.total_amount')), 'total_purchases']
      ],
      include: [{
        model: Farm,
        as: 'farm',
        attributes: ['id', 'name']
      }],
      group: ['farm_id', 'farm.id'],
      raw: true,
      nest: true,
      order: [[sequelize.fn('SUM', sequelize.col('FarmTransaction.total_amount')), 'DESC']]
    });

    const total_purchases = farmPurchases.reduce((sum, f) => sum + parseFloat(f.total_purchases || 0), 0);
    const top_farm_share = total_purchases > 0 && farmPurchases.length > 0
      ? (parseFloat(farmPurchases[0].total_purchases) / total_purchases) * 100
      : 0;
    const top_3_farms_share = total_purchases > 0 && farmPurchases.length >= 3
      ? ((parseFloat(farmPurchases[0].total_purchases) + 
          parseFloat(farmPurchases[1].total_purchases) + 
          parseFloat(farmPurchases[2].total_purchases)) / total_purchases) * 100
      : top_farm_share;

    let farm_risk_level = 'منخفض';
    if (top_3_farms_share > 70) farm_risk_level = 'عالي';
    else if (top_3_farms_share > 50) farm_risk_level = 'متوسط';

    // حساسية الخسائر
    const [totalPurchases, totalLosses] = await Promise.all([
      FarmTransaction.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'total_kg']
        ],
        raw: true
      }),
      TransportLoss.findAll({
        where: { daily_operation_id: { [Op.in]: operationIds } },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('TransportLoss.dead_weight')), 'total_lost_kg'],
          [sequelize.fn('SUM', sequelize.col('TransportLoss.loss_amount')), 'total_loss_amount']
        ],
        raw: true
      })
    ]);

    const total_purchased_kg = parseFloat(totalPurchases[0]?.total_kg || 0);
    const total_lost_kg = parseFloat(totalLosses[0]?.total_lost_kg || 0);
    const total_loss_amount = parseFloat(totalLosses[0]?.total_loss_amount || 0);
    const current_loss_rate = total_purchased_kg > 0 ? (total_lost_kg / total_purchased_kg) * 100 : 0;

    const avg_loss_value_per_kg = total_lost_kg > 0 ? total_loss_amount / total_lost_kg : 0;
    const profit_impact_per_1pct_loss = (1 / 100) * total_purchased_kg * avg_loss_value_per_kg;

    const net_profit = operations.reduce((sum, op) => {
      const opNet = parseFloat(op.profit_distribution?.net_profit || 0);
      const opVehCosts = parseFloat(op.profit_distribution?.vehicle_costs || 0);
      return sum + (opNet - opVehCosts);
    }, 0);

    const lossScenarios = [2.0, 3.0, 5.0].map(rate => {
      const increase_pct = rate - current_loss_rate;
      const impact = increase_pct * (total_purchased_kg / 100) * avg_loss_value_per_kg;
      return {
        loss_rate_pct: rate,
        profit_impact: parseFloat((-impact).toFixed(2)),
        new_net_profit: parseFloat((net_profit - impact).toFixed(2))
      };
    });

    return {
      description: 'ما مدى استقرار الربح، وما هي المخاطر؟',
      
      daily_profit_volatility: {
        mean_daily_profit: parseFloat(mean_daily_profit.toFixed(2)),
        standard_deviation: parseFloat(std_deviation.toFixed(2)),
        coefficient_of_variation: parseFloat(coefficient_of_variation.toFixed(2)),
        interpretation: `${volatility_rating === 'عالي'? 'تقلب عالي' : volatility_rating === 'متوسط' ? 'تقلب متوسط' : 'تقلب منخفض'} - الربح اليومي يختلف بنسبة ~${coefficient_of_variation.toFixed(0)}%`,
        volatility_rating: volatility_rating
      },
      
      profit_distribution_bands: profitBands,
      
      dependency_risks: {
        vehicle_concentration: {
          top_vehicle_profit_share_pct: parseFloat(top_vehicle_share.toFixed(2)),
          top_2_vehicles_profit_share_pct: parseFloat(top_2_vehicles_share.toFixed(2)),
          risk_level: vehicle_risk_level,
          explanation: `${top_2_vehicles_share.toFixed(0)}% من الربح يأتي من مركبتين فقط. إذا تعطلت واحدة، ينخفض الربح بشكل كبير`
        },
        
        buyer_concentration: {
          top_buyer_revenue_share_pct: parseFloat(top_buyer_share.toFixed(2)),
          top_3_buyers_revenue_share_pct: parseFloat(top_3_buyers_share.toFixed(2)),
          risk_level: buyer_risk_level,
          explanation: `الإيرادات متركزة في ${buyerRevenue.length >= 3 ? '3' : buyerRevenue.length} مشترين - فقدان واحد يؤثر على ${(top_buyer_share).toFixed(0)}%+ من الأعمال`
        },
        
        farm_concentration: {
          top_farm_purchase_share_pct: parseFloat(top_farm_share.toFixed(2)),
          top_3_farms_purchase_share_pct: parseFloat(top_3_farms_share.toFixed(2)),
          risk_level: farm_risk_level
        }
      },
      
      loss_sensitivity: {
        current_loss_rate_pct: parseFloat(current_loss_rate.toFixed(2)),
        profit_impact_per_1pct_loss_increase: parseFloat((-profit_impact_per_1pct_loss).toFixed(2)),
        example_scenarios: lossScenarios,
        key_insight: `كل زيادة 1% في معدل الخسارة تكلف ~${Math.abs(profit_impact_per_1pct_loss).toFixed(0)} جنيه في الربح`
      }
    };
  }

  /**
   * 5️⃣ مؤشرات كفاءة الربح
   */
  static async buildProfitEfficiency(operations) {
    const operationIds = operations.map(op => op.id);

    // الربح لكل عملية
    const operationProfits = operations.map(op => ({
      operation_id: op.id,
      date: op.operation_date,
      profit: parseFloat(op.profit_distribution?.net_profit || 0)
    }));

    const sortedByProfit = [...operationProfits].sort((a, b) => b.profit - a.profit);
    const avg_profit_per_operation = operationProfits.reduce((sum, op) => sum + op.profit, 0) / operationProfits.length;

    // الربح لكل مركبة-يوم
    const vehicleDailyProfits = {};
    for (const op of operations) {
      for (const vehicle of op.vehicles) {
        if (!vehicleDailyProfits[vehicle.id]) {
          vehicleDailyProfits[vehicle.id] = {
            vehicle_id: vehicle.id,
            vehicle_name: vehicle.name,
            days: 0,
            total_profit: 0
          };
        }

        vehicleDailyProfits[vehicle.id].days += 1;

        const [sales, purchases, costs, losses] = await Promise.all([
          SaleTransaction.sum('total_amount', {
            where: { daily_operation_id: op.id, vehicle_id: vehicle.id }
          }),
          FarmTransaction.sum('total_amount', {
            where: { daily_operation_id: op.id, vehicle_id: vehicle.id }
          }),
          DailyCost.sum('amount', {
            where: { daily_operation_id: op.id, vehicle_id: vehicle.id }
          }),
          TransportLoss.sum('loss_amount', {
            where: { daily_operation_id: op.id, vehicle_id: vehicle.id }
          })
        ]);

        const vehicle_profit = (sales || 0) - (purchases || 0) - (costs || 0) - (losses || 0);
        vehicleDailyProfits[vehicle.id].total_profit += vehicle_profit;
      }
    }

    const vehicleProfitPerDay = Object.values(vehicleDailyProfits).map(v => ({
      ...v,
      avg_profit_per_day: v.days > 0 ? v.total_profit / v.days : 0
    })).sort((a, b) => b.avg_profit_per_day - a.avg_profit_per_day);

    const avg_vehicle_profit_per_day = vehicleProfitPerDay.reduce((sum, v) => sum + v.avg_profit_per_day, 0) / vehicleProfitPerDay.length;

    // الربح لكل معاملة
    const [farmTxCount, saleTxCount] = await Promise.all([
      FarmTransaction.count({
        where: { daily_operation_id: { [Op.in]: operationIds } }
      }),
      SaleTransaction.count({
        where: { daily_operation_id: { [Op.in]: operationIds } }
      })
    ]);

    const total_profit = operations.reduce((sum, op) => {
      const opNet = parseFloat(op.profit_distribution?.net_profit || 0);
      const opVehCosts = parseFloat(op.profit_distribution?.vehicle_costs || 0);
      return sum + (opNet - opVehCosts);
    }, 0);

    const avg_profit_per_farm_tx = farmTxCount > 0 ? total_profit / farmTxCount : 0;
    const avg_profit_per_sale_tx = saleTxCount > 0 ? total_profit / saleTxCount : 0;

    // الربح لكل مزرعة متعامل معها
    const uniqueFarms = await FarmTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [[sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('farm_id'))), 'count']],
      raw: true
    });

    const unique_farms_count = parseInt(uniqueFarms[0]?.count || 0);
    const profit_per_farm = unique_farms_count > 0 ? total_profit / unique_farms_count : 0;

    // إيجاد أعلى مزرعة ربحاً
    const farmContributions = await FarmTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        'farm_id',
        [sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'total_kg']
      ],
      include: [{
        model: Farm,
        as: 'farm',
        attributes: ['id', 'name']
      }],
      group: ['farm_id', 'farm.id'],
      raw: true,
      nest: true,
      order: [[sequelize.fn('SUM', sequelize.col('FarmTransaction.net_chicken_weight')), 'DESC']]
    });

    // الربح لكل مشتري
    const uniqueBuyers = await SaleTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [[sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('buyer_id'))), 'count']],
      raw: true
    });

    const unique_buyers_count = parseInt(uniqueBuyers[0]?.count || 0);
    const profit_per_buyer = unique_buyers_count > 0 ? total_profit / unique_buyers_count : 0;

    const buyerContributions = await SaleTransaction.findAll({
      where: { daily_operation_id: { [Op.in]: operationIds } },
      attributes: [
        'buyer_id',
        [sequelize.fn('SUM', sequelize.col('SaleTransaction.total_amount')), 'total_revenue']
      ],
      include: [{
        model: Buyer,
        as: 'buyer',
        attributes: ['id', 'name']
      }],
      group: ['buyer_id', 'buyer.id'],
      raw: true,
      nest: true,
      order: [[sequelize.fn('SUM', sequelize.col('SaleTransaction.total_amount')), 'DESC']]
    });

    // العائد على التكاليف
    const total_costs = operations.reduce((sum, op) => 
      sum + parseFloat(op.profit_distribution?.total_costs || 0), 0
    );
    const roi_percentage = total_costs > 0 ? (total_profit / total_costs) * 100 : 0;

    return {
      description: 'ما مدى كفاءة توليد الربح؟',
      
      profit_per_operation: {
        average: parseFloat(avg_profit_per_operation.toFixed(2)),
        best_operation: sortedByProfit.length > 0 ? {
          operation_id: sortedByProfit[0].operation_id,
          date: sortedByProfit[0].date,
          profit: parseFloat(sortedByProfit[0].profit.toFixed(2))
        } : null,
        worst_operation: sortedByProfit.length > 0 ? {
          operation_id: sortedByProfit[sortedByProfit.length - 1].operation_id,
          date: sortedByProfit[sortedByProfit.length - 1].date,
          profit: parseFloat(sortedByProfit[sortedByProfit.length - 1].profit.toFixed(2))
        } : null,
        efficiency_gap: sortedByProfit.length > 1 
          ? parseFloat((sortedByProfit[0].profit - sortedByProfit[sortedByProfit.length - 1].profit).toFixed(2))
          : 0,
        explanation: sortedByProfit.length > 1
          ? `أفضل عملية حققت ${((sortedByProfit[0].profit / sortedByProfit[sortedByProfit.length - 1].profit) * 100).toFixed(0)}% ربح أكثر من الأسوأ - تباين كبير`
          : 'بيانات غير كافية للمقارنة'
      },
      
      profit_per_vehicle_day: {
        average: parseFloat(avg_vehicle_profit_per_day.toFixed(2)),
        top_vehicle: vehicleProfitPerDay.length > 0 ? {
          vehicle_id: vehicleProfitPerDay[0].vehicle_id,
          vehicle_name: vehicleProfitPerDay[0].vehicle_name,
          avg_profit_per_day: parseFloat(vehicleProfitPerDay[0].avg_profit_per_day.toFixed(2))
        } : null,
        lowest_vehicle: vehicleProfitPerDay.length > 0 ? {
          vehicle_id: vehicleProfitPerDay[vehicleProfitPerDay.length - 1].vehicle_id,
          vehicle_name: vehicleProfitPerDay[vehicleProfitPerDay.length - 1].vehicle_name,
          avg_profit_per_day: parseFloat(vehicleProfitPerDay[vehicleProfitPerDay.length - 1].avg_profit_per_day.toFixed(2))
        } : null,
        efficiency_gap_pct: vehicleProfitPerDay.length > 1 && vehicleProfitPerDay[vehicleProfitPerDay.length - 1].avg_profit_per_day > 0
          ? parseFloat((((vehicleProfitPerDay[0].avg_profit_per_day - vehicleProfitPerDay[vehicleProfitPerDay.length - 1].avg_profit_per_day) / vehicleProfitPerDay[vehicleProfitPerDay.length - 1].avg_profit_per_day) * 100).toFixed(2))
          : 0,
        explanation: vehicleProfitPerDay.length > 1
          ? `أعلى مركبة تحقق ${(((vehicleProfitPerDay[0].avg_profit_per_day - vehicleProfitPerDay[vehicleProfitPerDay.length - 1].avg_profit_per_day) / vehicleProfitPerDay[vehicleProfitPerDay.length - 1].avg_profit_per_day) * 100).toFixed(0)}% ربح أكثر يومياً من الأقل`
          : 'بيانات غير كافية للمقارنة'
      },
      
      profit_per_transaction: {
        farm_transactions: {
          count: farmTxCount,
          avg_profit_contribution: parseFloat(avg_profit_per_farm_tx.toFixed(2))
        },
        sale_transactions: {
          count: saleTxCount,
          avg_profit_realized: parseFloat(avg_profit_per_sale_tx.toFixed(2))
        },
        efficiency_ratio: avg_profit_per_sale_tx > 0 
          ? parseFloat((avg_profit_per_farm_tx / avg_profit_per_sale_tx).toFixed(2))
          : 0,
        explanation: avg_profit_per_farm_tx > avg_profit_per_sale_tx
          ? `كل معاملة مزرعة تساهم بـ ${(((avg_profit_per_farm_tx - avg_profit_per_sale_tx) / avg_profit_per_sale_tx) * 100).toFixed(0)}% أكثر في الربح من كل بيع`
          : 'معاملات المزارع والبيع تساهم بالتساوي في الربح'
      },
      
      profit_per_engaged_farm: {
        unique_farms: unique_farms_count,
        total_profit: parseFloat(total_profit.toFixed(2)),
        profit_per_farm: parseFloat(profit_per_farm.toFixed(2)),
        top_profit_farm: farmContributions.length > 0 ? {
          farm_id: farmContributions[0].farm_id,
          farm_name: farmContributions[0].farm.name,
          volume_kg: parseFloat(parseFloat(farmContributions[0].total_kg).toFixed(2))
        } : null,
        explanation: `كل علاقة مزرعة تحقق متوسط ${profit_per_farm.toFixed(2)} جنيه ربح لكل فترة`
      },
      
      profit_per_buyer: {
        unique_buyers: unique_buyers_count,
        profit_per_buyer: parseFloat(profit_per_buyer.toFixed(2)),
        top_profit_buyer: buyerContributions.length > 0 ? {
          buyer_id: buyerContributions[0].buyer_id,
          buyer_name: buyerContributions[0].buyer.name,
          revenue: parseFloat(parseFloat(buyerContributions[0].total_revenue).toFixed(2))
        } : null
      },
      
      return_on_costs: {
        total_costs: parseFloat(total_costs.toFixed(2)),
        net_profit: parseFloat(total_profit.toFixed(2)),
        roi_percentage: parseFloat(roi_percentage.toFixed(2)),
        explanation: `كل 1 جنيه يُنفق على التكاليف يحقق ${(roi_percentage / 100).toFixed(2)} جنيه في الربح`
      }
    };
  }

  /**
   * 6️⃣ توصيات الربح القابلة للتنفيذ
   */
  static async buildRecommendations(operations, leakageAnalysis, stabilityAnalysis) {
    const recommendations = [];
    let recommendationId = 1;

    // من تحليل التسرب
    if (leakageAnalysis.leakage_sources) {
      leakageAnalysis.leakage_sources.forEach(source => {
        // مزارع ذات هامش ربح منخفض
        if (source.source === 'مزارع ذات هامش ربح منخفض' && source.affected_farms && source.affected_farms.length > 0) {
          const topFarm = source.affected_farms[0];
          recommendations.push({
            id: recommendationId++,
            category: 'التسعير',
            problem: `${topFarm.farm_name} يفرض ${topFarm.excess_paid_per_kg.toFixed(2)} جنيه/كجم فوق متوسط السوق`,
            profit_impact_monthly: parseFloat(topFarm.total_leakage.toFixed(2)),
            action: 'التفاوض لتخفيض السعر أو الحصول على مصادر بديلة',
            implementation_difficulty: 'متوسطة',
            priority: 'عالية',
            expected_result: `توفير ${topFarm.total_leakage.toFixed(2)} جنيه/شهر أو ${(topFarm.total_leakage * 12).toFixed(0)} جنيه/سنة`
          });
        }

        // أسعار بيع ضعيفة
        if (source.source === 'أسعار بيع ضعيفة' && source.affected_buyers && source.affected_buyers.length > 0) {
          const topBuyer = source.affected_buyers[0];
          recommendations.push({
            id: recommendationId++,
            category: 'التسعير',
            problem: `${topBuyer.buyer_name} يشتري بسعر ${topBuyer.shortfall_per_kg.toFixed(2)} جنيه/كجم أقل من متوسط السوق`,
            profit_impact_monthly: parseFloat(topBuyer.total_leakage.toFixed(2)),
            action: `زيادة السعر لهذا المشتري بما لا يقل عن ${Math.min(1, topBuyer.shortfall_per_kg).toFixed(2)} جنيه/كجم أو تقليل الحصة`,
            implementation_difficulty: 'متوسطة',
            priority: 'عالية',
            expected_result: `كسب ${(topBuyer.sales_volume_kg * Math.min(1, topBuyer.shortfall_per_kg)).toFixed(0)}+ جنيه/شهر`
          });
        }

        // أيام الخسائر المرتفعة
        if (source.source === 'أيام الخسائر المرتفعة') {
          recommendations.push({
            id: recommendationId++,
            category: 'تقليل الخسائر',
            problem: `${source.affected_vehicles.length} مركبات لديها معدل خسارة ${source.average_loss_on_these_days_pct.toFixed(1)}% مقابل ${source.normal_loss_rate_pct}% طبيعي`,
            profit_impact_monthly: parseFloat(source.leakage_amount.toFixed(2)),
            action: 'فحص وإصلاح أنظمة التبريد؛ تدريب السائقين على التعامل',
            implementation_difficulty: 'منخفضة',
            priority: 'عالية',
            expected_result: `تقليل الخسائر بنسبة 50%، توفير ${(source.leakage_amount * 0.5).toFixed(2)} جنيه/شهر`
          });
        }

        // تكلفة الفرصة البديلة
        if (source.source === 'تكلفة الفرصة البديلة للمبالغ غير المدفوعة') {
          recommendations.push({
            id: recommendationId++,
            category: 'رأس المال العامل',
            problem: `${source.total_receivables.toFixed(2)} جنيه محجوزة في مستحقات المشترين`,
            profit_impact_monthly: parseFloat(source.leakage_amount.toFixed(2)),
            action: 'عرض خصم 2% للدفع خلال 7 أيام، أو فرض شروط ائتمان أكثر صرامة',
            implementation_difficulty: 'منخفضة',
            priority: 'متوسطة',
            expected_result: `تحرير نقد لمشتريات إضافية؛ مكسب فرصة ${source.leakage_amount.toFixed(2)} جنيه/شهر`
          });
        }
      });
    }

    // من تحليل الاستقرار - مخاطر التركيز
    if (stabilityAnalysis.dependency_risks) {
      if (stabilityAnalysis.dependency_risks.vehicle_concentration.risk_level === 'عالي') {
        recommendations.push({
          id: recommendationId++,
          category: 'تشغيلي',
          problem: `${stabilityAnalysis.dependency_risks.vehicle_concentration.top_2_vehicles_profit_share_pct.toFixed(0)}% من الربح يأتي من مركبتين فقط - مخاطر اعتمادية عالية`,
          profit_impact_monthly: 0,
          action: 'موازنة الأحمال عبر جميع المركبات؛ تحسين أداء المركبات غير المستغلة بشكل كافٍ',
          implementation_difficulty: 'متوسطة',
          priority: 'متوسطة',
          expected_result: 'تقليل المخاطر؛ زيادة محتملة في إجمالي الربح بنسبة 15-20%'
        });
      }
    }

    // الترتيب حسب الأولوية والتأثير على الربح
    const priorityOrder = { 'عالية': 1, 'متوسطة': 2, 'منخفضة': 3 };
    recommendations.sort((a, b) => {
      if (a.priority !== b.priority) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.profit_impact_monthly - a.profit_impact_monthly;
    });

    const total_potential_increase = recommendations.reduce((sum, r) => sum + r.profit_impact_monthly, 0);
    const high_priority = recommendations.filter(r => r.priority === 'عالية').length;
    const medium_priority = recommendations.filter(r => r.priority === 'متوسطة').length;
    const low_priority = recommendations.filter(r => r.priority === 'منخفضة').length;
    const quick_wins = recommendations.filter(r => r.implementation_difficulty === 'منخفضة').length;

    return {
      description: 'إجراءات محددة لزيادة الربح مع الأولوية والتأثير',
      recommendations: recommendations,
      summary: {
        total_potential_monthly_profit_increase: parseFloat(total_potential_increase.toFixed(2)),
        total_potential_annual_profit_increase: parseFloat((total_potential_increase * 12).toFixed(2)),
        high_priority_count: high_priority,
        medium_priority_count: medium_priority,
        low_priority_count: low_priority,
        quick_wins_under_30_days: quick_wins
      }
    };
  }

  /**
   * الملخص التنفيذي
   */
  static async buildExecutiveSummary(compositionAnalysis, profitPerKgAnalysis, leakageAnalysis, stabilityAnalysis, recommendations) {
    const net_profit = compositionAnalysis.total_net_profit;
    
    // تحديد الصحة
    let profit_health = 'جيد';
    if (profitPerKgAnalysis.current_period.net_profit_per_sold_kg < 2.0) profit_health = 'ضعيف';
    else if (profitPerKgAnalysis.current_period.net_profit_per_sold_kg < 3.0) profit_health = 'مقبول';
    else if (profitPerKgAnalysis.current_period.net_profit_per_sold_kg > 4.0) profit_health = 'ممتاز';

    // نقاط القوة الرئيسية
    const strengths = [];
    if (compositionAnalysis.components.trading_margin_profit.percentage > 60) {
      strengths.push(`هامش تداول قوي (${compositionAnalysis.components.trading_margin_profit.percentage.toFixed(0)}% من الربح)`);
    }
    if (profitPerKgAnalysis.previous_period_comparison.trend === 'تحسن') {
      strengths.push(`الربح لكل كجم يتحسن مقابل الفترة الأخيرة (+${profitPerKgAnalysis.previous_period_comparison.net_profit_per_sold_kg_change_pct.toFixed(0)}%)`);
    }

    // نقاط الضعف الرئيسية
    const weaknesses = [];
    if (stabilityAnalysis.dependency_risks.vehicle_concentration.risk_level === 'عالي') {
      weaknesses.push(`مخاطر تركيز عالية (${stabilityAnalysis.dependency_risks.vehicle_concentration.top_2_vehicles_profit_share_pct.toFixed(0)}% ربح من مركبتين)`);
    }
    if (leakageAnalysis.total_identified_leakage > 0) {
      weaknesses.push(`${leakageAnalysis.total_identified_leakage.toFixed(2)} جنيه تسرب ربح محدد (${leakageAnalysis.leakage_as_percent_of_potential_profit.toFixed(0)}% من الإمكانية)`);
    }
    if (stabilityAnalysis.daily_profit_volatility.volatility_rating !== 'منخفض') {
      weaknesses.push(`تقلب ${stabilityAnalysis.daily_profit_volatility.volatility_rating.toLowerCase()} (${stabilityAnalysis.daily_profit_volatility.coefficient_of_variation.toFixed(0)}% تباين يومي)`);
    }

    // أفضل 3 إجراءات
    const top3Actions = recommendations.recommendations.slice(0, 3).map(r => 
      `${r.action} لـ ${r.expected_result.split(';')[0]}`
    );

    return {
      current_profit_health: profit_health,
      key_strengths: strengths,
      key_weaknesses: weaknesses,
      top_3_actions: top3Actions,
      potential_profit_increase: `${recommendations.summary.total_potential_monthly_profit_increase.toFixed(2)} جنيه/شهر (${((recommendations.summary.total_potential_monthly_profit_increase / net_profit) * 100).toFixed(0)}% زيادة) إذا تم تنفيذ جميع التوصيات`
    };
  }

  /**
   * دالة مساعدة: حساب الانحراف المعياري
   */
  static calculateStandardDeviation(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    
    return Math.sqrt(avgSquaredDiff);
  }
}

module.exports = ProfitReportService;