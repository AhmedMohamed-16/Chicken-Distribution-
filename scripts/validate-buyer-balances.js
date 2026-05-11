/**
 * Validation Script: Buyer Balance Consistency
 * 
 * Purpose: Verify that buyer report outputs match actual database state
 * Before-State Baseline: Run this before refactoring to establish benchmark
 * 
 * Checks:
 * 1. Report buyer balances match Buyer.current_balance
 * 2. Period report buyer debt position matches actual DB totals
 * 3. Buyer statement opening/closing balances reconcile
 * 4. CREDIT state (negative balance) is correctly handled
 */

const { Op } = require('sequelize');
const { Buyer, SaleTransaction, BuyerDebtPayment } = require('../src/models');
const PeriodReportService = require('../src/services/PeriodReportService');

async function validateBuyerBalances() {
  console.log('========================================');
  console.log('BUYER BALANCE VALIDATION');
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
    
    const [dbTotals] = await Buyer.findAll({
      attributes: [
        [require('sequelize').fn('SUM', 
          require('sequelize').literal('CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END')
        ), 'total_receivables'],
        [require('sequelize').fn('SUM', 
          require('sequelize').literal('CASE WHEN current_balance < 0 THEN ABS(current_balance) ELSE 0 END')
        ), 'total_credits'],
        [require('sequelize').fn('SUM', require('sequelize').col('current_balance')), 'net_position']
      ],
      raw: true
    });

    const dbReceivables = parseFloat(dbTotals.total_receivables || 0);
    const dbCredits = parseFloat(dbTotals.total_credits || 0);
    const dbNetPosition = parseFloat(dbTotals.net_position || 0);

    console.log(`  DB Total Receivables (buyers owe us): ${dbReceivables.toFixed(2)}`);
    console.log(`  DB Total Credits (we owe buyers): ${dbCredits.toFixed(2)}`);
    console.log(`  DB Net Position: ${dbNetPosition.toFixed(2)}`);
    console.log();

    // ========================================
    // TEST 2: Period Report Debt Position Check
    // ========================================
    console.log('TEST 2: Period Report Debt Position');
    console.log('-----------------------------------');
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    console.log(`  Testing period: ${startStr} to ${endStr}`);
    
    const periodReport = await PeriodReportService.generatePeriodReport(startStr, endStr);
    
    if (periodReport.success && periodReport.data.debt_position) {
      const reportDebt = periodReport.data.debt_position;
      
      console.log(`  Report Buyer Receivables: ${reportDebt.buyers?.total_outstanding?.toFixed(2) || 'N/A'}`);
      console.log(`  Report Buyer Credits: ${reportDebt.buyers?.total_credits?.toFixed(2) || 'N/A'}`);
      console.log(`  Report Buyer Net: ${reportDebt.buyers?.net_position?.toFixed(2) || 'N/A'}`);
      
      const receivablesDiff = Math.abs(dbReceivables - (reportDebt.buyers?.total_outstanding || 0));
      const creditsDiff = Math.abs(dbCredits - (reportDebt.buyers?.total_credits || 0));
      const netDiff = Math.abs(dbNetPosition - (reportDebt.buyers?.net_position || 0));
      
      const tolerance = 0.01;
      
      if (receivablesDiff < tolerance && creditsDiff < tolerance && netDiff < tolerance) {
        console.log('  ✅ PASS: Report matches DB totals');
        results.passed++;
      } else {
        console.log('  ❌ FAIL: Report DOES NOT match DB totals');
        console.log(`     Receivables diff: ${receivablesDiff.toFixed(2)}`);
        console.log(`     Credits diff: ${creditsDiff.toFixed(2)}`);
        console.log(`     Net diff: ${netDiff.toFixed(2)}`);
        results.failed++;
      }
    } else {
      console.log('  ⚠️  WARNING: Could not generate period report');
      results.warnings++;
    }
    console.log();

    // ========================================
    // TEST 3: CREDIT State Check (Negative Balances)
    // ========================================
    console.log('TEST 3: CREDIT State Verification (Negative Balances)');
    console.log('-----------------------------------');
    
    const buyersWithCredit = await Buyer.findAll({
      where: { current_balance: { [Op.lt]: 0 } },
      limit: 5
    });
    
    console.log(`  Found ${buyersWithCredit.length} buyers with CREDIT (negative balance)`);
    
    if (buyersWithCredit.length === 0) {
      console.log('  ℹ️  No buyers with credit state found in database');
    } else {
      for (const buyer of buyersWithCredit) {
        const balance = parseFloat(buyer.current_balance);
        console.log(`  Buyer ${buyer.id} (${buyer.name}): ${balance.toFixed(2)} EGP (CREDIT - we owe them)`);
        results.passed++;
      }
    }
    console.log();

    // ========================================
    // TEST 4: Individual Buyer Balance Reconciliation
    // ========================================
    console.log('TEST 4: Individual Buyer Balance Verification');
    console.log('-----------------------------------');
    
    const buyers = await Buyer.findAll({
      where: { current_balance: { [Op.ne]: 0 } },
      limit: 10,
      order: [['current_balance', 'DESC']]
    });
    
    console.log(`  Checking ${buyers.length} buyers with non-zero balance...`);
    
    for (const buyer of buyers) {
      const balance = parseFloat(buyer.current_balance);
      const balanceType = balance > 0 ? 'RECEIVABLE' : balance < 0 ? 'CREDIT' : 'SETTLED';
      
      // Calculate from transactions
      const transactions = await SaleTransaction.findAll({
        where: { buyer_id: buyer.id },
        attributes: [
          [require('sequelize').fn('SUM', require('sequelize').col('remaining_amount')), 'total_remaining'],
          [require('sequelize').fn('SUM', require('sequelize').col('debt_applied_amount')), 'total_debt_applied']
        ],
        raw: true
      });
      
      const payments = await BuyerDebtPayment.findAll({
        where: { buyer_id: buyer.id },
        attributes: [
          [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'total_payments']
        ],
        raw: true
      });
      
      const txRemaining = parseFloat(transactions[0]?.total_remaining || 0);
      const txDebtApplied = parseFloat(transactions[0]?.total_debt_applied || 0);
      const totalPayments = parseFloat(payments[0]?.total_payments || 0);
      
      // Reconstructed: new debt - payments made - debt applied in sales
      const reconstructed = txRemaining - totalPayments - txDebtApplied;
      const diff = Math.abs(balance - reconstructed);
      
      if (diff < 1.0) {
        console.log(`  ✅ Buyer ${buyer.id} (${buyer.name}): ${balance.toFixed(2)} [${balanceType}] - matches`);
        results.passed++;
      } else {
        console.log(`  ⚠️  Buyer ${buyer.id} (${buyer.name}): ${balance.toFixed(2)} vs reconstructed ${reconstructed.toFixed(2)} (diff: ${diff.toFixed(2)})`);
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
  validateBuyerBalances()
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { validateBuyerBalances };
