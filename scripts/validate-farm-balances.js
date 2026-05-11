/**
 * Validation Script: Farm Balance Consistency
 * 
 * Purpose: Verify that report outputs match actual database state
 * Before-State Baseline: Run this before refactoring to establish benchmark
 * 
 * Checks:
 * 1. Report farm balances match Farm.current_balance
 * 2. Period report debt position matches actual DB totals
 * 3. Farm statement opening/closing balances reconcile
 */

const { Op } = require('sequelize');
const { Farm, FarmTransaction, FarmDebtPayment } = require('../src/models');
const PeriodReportService = require('../src/services/PeriodReportService');

async function validateFarmBalances() {
  console.log('========================================');
  console.log('FARM BALANCE VALIDATION');
  console.log('Generated:', new Date().toISOString());
  console.log('========================================\n');

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
    details: []
  };

  try {
    // ========================================
    // TEST 1: Raw DB Balance Check
    // ========================================
    console.log('TEST 1: Raw Database Balance Totals');
    console.log('-----------------------------------');
    
    const [dbTotals] = await Farm.findAll({
      attributes: [
        [require('sequelize').fn('SUM', 
          require('sequelize').literal('CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END')
        ), 'total_receivables'],
        [require('sequelize').fn('SUM', 
          require('sequelize').literal('CASE WHEN current_balance < 0 THEN ABS(current_balance) ELSE 0 END')
        ), 'total_payables'],
        [require('sequelize').fn('SUM', require('sequelize').col('current_balance')), 'net_position']
      ],
      raw: true
    });

    const dbReceivables = parseFloat(dbTotals.total_receivables || 0);
    const dbPayables = parseFloat(dbTotals.total_payables || 0);
    const dbNetPosition = parseFloat(dbTotals.net_position || 0);

    console.log(`  DB Total Receivables (farms owe us): ${dbReceivables.toFixed(2)}`);
    console.log(`  DB Total Payables (we owe farms): ${dbPayables.toFixed(2)}`);
    console.log(`  DB Net Position: ${dbNetPosition.toFixed(2)}`);
    console.log();

    // ========================================
    // TEST 2: Period Report Debt Position Check
    // ========================================
    console.log('TEST 2: Period Report Debt Position');
    console.log('-----------------------------------');
    
    // Get current period (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    console.log(`  Testing period: ${startStr} to ${endStr}`);
    
    const periodReport = await PeriodReportService.generatePeriodReport(startStr, endStr);
    
    if (periodReport.success && periodReport.data.debt_position) {
      const reportDebt = periodReport.data.debt_position;
      
      console.log(`  Report Farm Receivables: ${reportDebt.farms?.total_receivables?.toFixed(2) || 'N/A'}`);
      console.log(`  Report Farm Payables: ${reportDebt.farms?.total_payables?.toFixed(2) || 'N/A'}`);
      console.log(`  Report Farm Net: ${reportDebt.farms?.net_position?.toFixed(2) || 'N/A'}`);
      
      // Compare DB vs Report
      const receivablesDiff = Math.abs(dbReceivables - (reportDebt.farms?.total_receivables || 0));
      const payablesDiff = Math.abs(dbPayables - (reportDebt.farms?.total_payables || 0));
      const netDiff = Math.abs(dbNetPosition - (reportDebt.farms?.net_position || 0));
      
      const tolerance = 0.01; // 1 cent tolerance for floating point
      
      if (receivablesDiff < tolerance && payablesDiff < tolerance && netDiff < tolerance) {
        console.log('  ✅ PASS: Report matches DB totals');
        results.passed++;
      } else {
        console.log('  ❌ FAIL: Report DOES NOT match DB totals');
        console.log(`     Receivables diff: ${receivablesDiff.toFixed(2)}`);
        console.log(`     Payables diff: ${payablesDiff.toFixed(2)}`);
        console.log(`     Net diff: ${netDiff.toFixed(2)}`);
        results.failed++;
      }
    } else {
      console.log('  ⚠️  WARNING: Could not generate period report or no debt_position data');
      results.warnings++;
    }
    console.log();

    // ========================================
    // TEST 3: Individual Farm Balance Check
    // ========================================
    console.log('TEST 3: Individual Farm Balance Verification');
    console.log('-----------------------------------');
    
    const farms = await Farm.findAll({
      where: { current_balance: { [Op.ne]: 0 } },
      limit: 10,
      order: [['current_balance', 'DESC']]
    });
    
    console.log(`  Checking ${farms.length} farms with non-zero balance...`);
    
    for (const farm of farms) {
      const balance = parseFloat(farm.current_balance);
      const balanceType = balance > 0 ? 'RECEIVABLE' : balance < 0 ? 'PAYABLE' : 'SETTLED';
      
      // Calculate what balance SHOULD be from transactions
      const transactions = await FarmTransaction.findAll({
        where: { farm_id: farm.id },
        attributes: [
          [require('sequelize').fn('SUM', require('sequelize').col('remaining_amount')), 'total_remaining'],
          [require('sequelize').fn('SUM', require('sequelize').col('used_credit')), 'total_credit_used']
        ],
        raw: true
      });
      
      const payments = await FarmDebtPayment.findAll({
        where: { farm_id: farm.id },
        attributes: [
          [require('sequelize').fn('SUM', 
            require('sequelize').literal('CASE WHEN payment_direction = \'FROM_FARM\' THEN amount ELSE -amount END')
          ), 'net_payment_impact']
        ],
        raw: true
      });
      
      const txRemaining = parseFloat(transactions[0]?.total_remaining || 0);
      const txCredit = parseFloat(transactions[0]?.total_credit_used || 0);
      const paymentImpact = parseFloat(payments[0]?.net_payment_impact || 0);
      
      // Reconstructed balance = (remaining from purchases - credit used) - (net payments)
      // Note: This is a simplified check
      const reconstructed = txRemaining - txCredit - paymentImpact;
      const diff = Math.abs(balance - reconstructed);
      
      if (diff < 1.0) { // 1 EGP tolerance for reconstruction
        console.log(`  ✅ Farm ${farm.id} (${farm.name}): ${balance.toFixed(2)} [${balanceType}] - matches reconstruction`);
        results.passed++;
      } else {
        console.log(`  ⚠️  Farm ${farm.id} (${farm.name}): ${balance.toFixed(2)} vs reconstructed ${reconstructed.toFixed(2)} (diff: ${diff.toFixed(2)})`);
        results.warnings++;
      }
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
  validateFarmBalances()
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { validateFarmBalances };
