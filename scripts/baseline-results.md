# Validation Baseline Results
**Generated:** 2025-01-22
**Updated:** 2026-04-26

## Summary
The validation scripts were executed to establish a baseline. Initial runs exposed critical schema issues. After fixes, all validations pass.

## Initial Results (Before Fixes)

### validate-farm-balances.js
**Status:** ERROR - Schema mismatch
- `column SaleTransaction.net_chicken_weight does not exist`
- PeriodReportService.js using incorrect column names

### validate-buyer-balances.js / validate-profit-consistency.js
**Status:** Not run (blocked by farm balances failure)

## Fixes Applied

### 1. Schema Column Fixes
**Files:** `PeriodReportService.js`, `ProfitReportService.js`

| Wrong Column | Correct Column | Model |
|--------------|----------------|-------|
| `net_chicken_weight` | `net_weight` | SaleTransaction |
| `old_debt_paid` | `debt_applied_amount` | SaleTransaction |

**Note:** FarmTransaction correctly uses `net_chicken_weight` (unchanged)

### 2. Variable Reference Bug Fix
**File:** `ProfitReportService.js:708`
- **Before:** `const total_receivables = parseFloat(totalReceivables[0]?.total_receivables || 0);`
- **After:** `const total_receivables = parseFloat(buyerBalanceSummary[0]?.total_receivables || 0);`
- **Issue:** Undefined variable reference `totalReceivables` (doesn't exist)

### 3. Created Utility Functions
**File:** `src/utils/reportCalculations.js`
- `calculateDebtPosition()` - Uses `current_balance` as source of truth
- `aggregateDebtTotals()` - Aggregates with RECEIVABLE/PAYABLE awareness
- `calculateCostPaymentStatus()` - Partial payment aware
- `extractProfitFromDistribution()` - Uses `ProfitDistribution` as source of truth

## Final Results (After Fixes)

### validate-farm-balances.js ✅
- **Passed:** 1
- **Failed:** 0
- **Warnings:** 1 (reconstruction check - expected)
- Status: Report debt position matches DB totals using `Farm.current_balance`

### validate-buyer-balances.js ✅
- **Passed:** 2
- **Failed:** 0
- **Warnings:** 2 (reconstruction check - expected)
- Status: Report correctly identifies CREDIT state (negative balance = we owe buyer)

### validate-profit-consistency.js ✅
- **Passed:** 5
- **Failed:** 0
- **Warnings:** 1 (DailyCost partial payment fields exist but may not be used)
- Status: PeriodReportService and ProfitReportService now report same profit totals

## Key Validations Confirmed

1. ✅ `Farm.current_balance` is source of truth for farm debts
2. ✅ `Buyer.current_balance` is source of truth for buyer debts (with CREDIT support)
3. ✅ `ProfitDistribution.net_profit` is source of truth for profit
4. ✅ Period report debt position matches actual DB totals
5. ✅ Both report services produce consistent profit figures

## Remaining Work (Lower Priority)

### DailyCost Partial Payment Awareness
- DailyCost model HAS `paid_amount` field
- Current reporting assumes full payment in cash flow summaries
- Future enhancement: Use actual paid amounts for true cash flow reporting

### ProfitReportService Reconstruction
- Still recalculates some metrics from raw transactions
- Could be simplified to use `ProfitDistribution` exclusively
- Current implementation produces correct totals (verified by validation)

## Conclusion
Critical schema and logic issues have been resolved. All validation scripts pass. The reporting system now correctly uses:
- `current_balance` as single source of truth for debts
- `ProfitDistribution` as single source of truth for profit
- Correct column names matching the database schema
