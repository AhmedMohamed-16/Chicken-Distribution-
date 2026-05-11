/**
 * Validation Script: Profit Consistency Across Reports
 * 
 * Purpose: Verify that profit figures match between:
 * - Daily report profit vs ProfitDistribution records
 * - Period report profit vs sum of daily profits
 * - ProfitReportService vs PeriodReportService
 * - Vehicle breakdown profits vs PartnerProfit records
 * 
 * Before-State Baseline: Run this before refactoring to establish benchmark
 */

const { Op } = require('sequelize');
const { DailyOperation, ProfitDistribution, PartnerProfit, SaleTransaction, FarmTransaction, TransportLoss, DailyCost } = require('../src/models');
const PeriodReportService = require('../src/services/PeriodReportService');
const ProfitReportService = require('../src/services/ProfitReportService');
const ProfitService = require('../src/services/ProfitService');

async function validateProfitConsistency() {
  console.log('========================================');
  console.log('PROFIT CONSISTENCY VALIDATION');
  console.log('Generated:', new Date().toISOString());
  console.log('========================================\n');

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
    details: []
  };

  try {
    // Get recent closed operations for testing
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // ========================================
    // TEST 1: ProfitDistribution vs Raw Transactions
    // ========================================
    console.log('TEST 1: ProfitDistribution vs Raw Transaction Calculation');
    console.log('-----------------------------------');
    
    const operations = await DailyOperation.findAll({
      where: {
        operation_date: { [Op.between]: [startStr, endStr] },
        status: 'CLOSED'
      },
      include: [{
        model: ProfitDistribution,
        as: 'profit_distribution'
      }],
      limit: 5,
      order: [['operation_date', 'DESC']]
    });

    console.log(`  Testing ${operations.length} closed operations...`);

    for (const op of operations) {
      if (!op.profit_distribution) {
        console.log(`  ⚠️  Operation ${op.id}: No profit distribution record`);
        results.warnings++;
        continue;
      }

      const pd = op.profit_distribution;
      const pdNetProfit = parseFloat(pd.net_profit || 0);
      
      // Calculate manually from transactions
      const [sales, purchases, losses, costs] = await Promise.all([
        SaleTransaction.sum('total_amount', { where: { daily_operation_id: op.id } }),
        FarmTransaction.sum('total_amount', { where: { daily_operation_id: op.id } }),
        TransportLoss.sum('loss_amount', { where: { daily_operation_id: op.id } }),
        DailyCost.sum('amount', { where: { daily_operation_id: op.id } })
      ]);

      const calcRevenue = parseFloat(sales || 0);
      const calcPurchases = parseFloat(purchases || 0);
      const calcLosses = parseFloat(losses || 0);
      const calcCosts = parseFloat(costs || 0);
      
      // Note: This doesn't account for farm-responsible losses
      const calcNetProfit = calcRevenue - calcPurchases - calcLosses - calcCosts;
      
      const diff = Math.abs(pdNetProfit - calcNetProfit);
      
      if (diff < 1.0) {
        console.log(`  ✅ Op ${op.id}: PD=${pdNetProfit.toFixed(2)}, Calc=${calcNetProfit.toFixed(2)}`);
        results.passed++;
      } else {
        console.log(`  ⚠️  Op ${op.id}: PD=${pdNetProfit.toFixed(2)}, Calc=${calcNetProfit.toFixed(2)}, Diff=${diff.toFixed(2)}`);
        console.log(`     (Difference may be due to farm-responsible losses)`);
        results.warnings++;
      }
    }
    console.log();

    // ========================================
    // TEST 2: Period Report vs ProfitDistribution Sum
    // ========================================
    console.log('TEST 2: Period Report vs Sum of ProfitDistribution Records');
    console.log('-----------------------------------');
    
    const periodReport = await PeriodReportService.generatePeriodReport(startStr, endStr);
    
    if (!periodReport.success) {
      console.log('  ⚠️  Could not generate period report');
      results.warnings++;
    } else {
      const reportNetProfit = periodReport.data.executive_summary?.financial?.net_profit || 0;
      
      // Calculate sum from ProfitDistribution
      const allOps = await DailyOperation.findAll({
        where: {
          operation_date: { [Op.between]: [startStr, endStr] },
          status: 'CLOSED'
        },
        include: [{
          model: ProfitDistribution,
          as: 'profit_distribution',
          required: true
        }]
      });
      
      const sumFromPD = allOps.reduce((sum, op) => 
        sum + parseFloat(op.profit_distribution?.net_profit || 0), 0
      );
      
      const diff = Math.abs(reportNetProfit - sumFromPD);
      
      console.log(`  Period Report Net Profit: ${reportNetProfit.toFixed(2)}`);
      console.log(`  Sum from ProfitDistribution: ${sumFromPD.toFixed(2)}`);
      console.log(`  Difference: ${diff.toFixed(2)}`);
      
      if (diff < 1.0) {
        console.log('  ✅ PASS: Period report matches ProfitDistribution sum');
        results.passed++;
      } else {
        console.log('  ❌ FAIL: Period report DOES NOT match ProfitDistribution sum');
        results.failed++;
      }
    }
    console.log();

    // ========================================
    // TEST 3: ProfitReportService Consistency
    // ========================================
    console.log('TEST 3: ProfitReportService vs PeriodReportService');
    console.log('-----------------------------------');
    
    const profitReport = await ProfitReportService.generateProfitReport(startStr, endStr);
    
    if (!profitReport.success) {
      console.log('  ⚠️  Could not generate profit report');
      results.warnings++;
    } else {
      const profitReportTotal = profitReport.data['1_profit_composition_analysis']?.total_net_profit || 0;
      const periodReportTotal = periodReport.data?.executive_summary?.financial?.net_profit || 0;
      
      const diff = Math.abs(profitReportTotal - periodReportTotal);
      
      console.log(`  ProfitReportService Total: ${profitReportTotal.toFixed(2)}`);
      console.log(`  PeriodReportService Total: ${periodReportTotal.toFixed(2)}`);
      console.log(`  Difference: ${diff.toFixed(2)}`);
      
      if (diff < 1.0) {
        console.log('  ✅ PASS: Both services report same profit');
        results.passed++;
      } else {
        console.log('  ❌ FAIL: Services report different profits');
        results.failed++;
      }
    }
    console.log();

    // ========================================
    // TEST 4: Cost Partial Payment Check
    // ========================================
    console.log('TEST 4: Cost Partial Payment Awareness');
    console.log('-----------------------------------');
    
    const costsWithPartial = await DailyCost.findAll({
      where: {
        daily_operation_id: {
          [Op.in]: operations.map(o => o.id)
        }
      },
      limit: 10
    });
    
    let hasPartialPaymentFields = false;
    
    for (const cost of costsWithPartial) {
      if (cost.paid_amount !== undefined || cost.remaining_amount !== undefined) {
        hasPartialPaymentFields = true;
        break;
      }
    }
    
    if (hasPartialPaymentFields) {
      console.log('  ✅ DailyCost model has partial payment fields (paid_amount/remaining_amount)');
      results.passed++;
    } else {
      console.log('  ⚠️  DailyCost model may be missing partial payment fields');
      console.log('     This could indicate costs are assumed fully paid');
      results.warnings++;
    }
    console.log();

    // ========================================
    // TEST 5: Vehicle Breakdown Consistency
    // ========================================
    console.log('TEST 5: Vehicle Breakdown Profit Consistency');
    console.log('-----------------------------------');
    
    if (periodReport.success && periodReport.data.vehicle_performance?.vehicles) {
      const vehicleBreakdown = periodReport.data.vehicle_performance.vehicles;
      
      const sumVehicleProfit = vehicleBreakdown.reduce((sum, v) => sum + (v.net_profit || 0), 0);
      const totalProfit = periodReport.data.executive_summary?.financial?.net_profit || 0;
      
      const diff = Math.abs(sumVehicleProfit - totalProfit);
      
      console.log(`  Sum of vehicle profits: ${sumVehicleProfit.toFixed(2)}`);
      console.log(`  Total profit: ${totalProfit.toFixed(2)}`);
      console.log(`  Difference: ${diff.toFixed(2)}`);
      
      if (diff < 1.0) {
        console.log('  ✅ PASS: Vehicle breakdown sums to total');
        results.passed++;
      } else {
        console.log('  ⚠️  WARNING: Vehicle breakdown does not match total (shared costs may not be distributed)');
        results.warnings++;
      }
    } else {
      console.log('  ⚠️  No vehicle performance data available');
      results.warnings++;
    }
    console.log();

    // ========================================
    // SUMMARY
    // ========================================
    console.log('========================================');
    console.log('VALIDATION SUMMARY');
    console.log('========================================');
    console.log(`Passed:  ${results.passed}`);
    console.log(`Failed:  ${results.failed}`);
    console.log(`Warnings: ${results.warnings}`);
    console.log();
    
    if (results.failed === 0) {
      console.log('✅ All critical checks passed');
    } else {
      console.log('❌ Some checks failed - refactoring needed');
    }
    
    return results;
    
  } catch (error) {
    console.error('Validation error:', error);
    results.failed++;
    return results;
  }
}

// Run if called directly
if (require.main === module) {
  validateProfitConsistency()
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { validateProfitConsistency };
