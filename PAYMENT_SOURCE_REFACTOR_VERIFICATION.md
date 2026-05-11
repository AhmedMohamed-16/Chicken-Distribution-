# Unified Payment Source Refactor — Verification Plan

## Overview
This document outlines the verification steps for the unified payment source refactor that moves from `safe_id` to `payment_source_type` and `payment_source_id` architecture.

---

## Completed Changes

### 1. ✅ Model Updates
- [x] **FarmDebtPayment.js** — Added `payment_source_type`, `payment_source_id`; removed `safe_id`
- [x] **CostDebtPayment.js** — Added `payment_source_type`, `payment_source_id`; removed `safe_id`
- [x] **DailyCost.js** — Fixed missing DataTypes import; added `payment_source_type`, `payment_source_id`; removed `safe_id`
- [x] **SaleTransaction.js** — Added `payment_source_type`, `payment_source_id`; removed `safe_id`
- [x] **FinancialTransaction.js** — Already had `payment_source_type`, `payment_source_id`

### 2. ✅ Indexes
- [x] Added `idx_farm_payments_source` on `farm_debt_payments`
- [x] Added `idx_cost_payments_source` on `cost_debt_payments`
- [x] Added payment source index on `daily_costs`
- [x] Payment source index on `sale_transactions` (planned)

### 3. ✅ Model Associations (index.js)
- [x] Removed `SaleTransaction.belongsTo(Safe, { foreignKey: 'safe_id' })`
- [x] Removed `Safe.hasMany(SaleTransaction, { foreignKey: 'safe_id' })`
- [x] Removed `TransportLoss.belongsTo(Safe, { foreignKey: 'safe_id' })`
- [x] Removed `Safe.hasMany(TransportLoss, { foreignKey: 'safe_id' })`
- [x] Removed `FinancialTransaction.belongsTo(Safe, { foreignKey: 'safe_id' })`
- [x] Removed `Safe.hasMany(FinancialTransaction, { foreignKey: 'safe_id' })`

### 4. ✅ Utilities
- [x] **paymentUtils.js** — `handlePaymentSource` unified handler with SAFE/CUSTODY support
- [x] **transactionLogger.js** — Backward compatibility for `safe_id` mapping

### 5. ✅ Controllers
- [x] **operationController.js** — `recordCostPayment` refactored to use unified payment source
- [x] **financialTransactionController.js** — Updated `getTransactions` to support payment source filtering

### 6. ✅ Helper Methods
- [x] **FinancialTransaction.getPaymentSourceSummary()** — Generic summary for any source type
- [x] **FinancialTransaction.getSafeSummary()** — Backward-compatible wrapper

### 7. ✅ Migration Script
- [x] **20240416_unified_payment_source.sql** — Transactional migration with data backfill, indexes, and rollback notes

---

## Automated Testing

### Syntax Validation ✅
All modified files have been checked for syntax errors:
```
✅ FarmDebtPayment.js
✅ CostDebtPayment.js
✅ DailyCost.js
✅ SaleTransaction.js
✅ FinancialTransaction.js
✅ paymentUtils.js
✅ operationController.js
✅ financialTransactionController.js
```

### Build & Startup Check
```bash
# Run from backend directory
npm install  # Ensure all dependencies present
npm run lint  # Lint check (if available)
npm start    # Start server and verify no model load errors
```

---

## Manual Testing Scenarios

### Scenario 1: SAFE Payment Flow (Backward Compatibility)

**Setup:**
```bash
# Create a farm, buyer, or cost category for testing
```

**Test Case 1.1: recordFarmLoading with legacy safe_id**
```
POST /api/operations/{operationId}/recordFarmLoading
Body:
{
  "farm_id": 1,
  "vehicle_id": 1,
  ...
  "safe_id": 5  // Legacy parameter
}

Expected:
- FarmDebtPayment created with payment_source_type='SAFE', payment_source_id=5
- Safe balance updated correctly
- FinancialTransaction logged with payment_source_type='SAFE', payment_source_id=5
```

**Test Case 1.2: recordFarmLoading with explicit payment_source fields**
```
POST /api/operations/{operationId}/recordFarmLoading
Body:
{
  "farm_id": 1,
  "vehicle_id": 1,
  ...
  "payment_source_type": "SAFE",
  "payment_source_id": 5
}

Expected:
- FarmDebtPayment created with payment_source_type='SAFE', payment_source_id=5
- Safe balance updated correctly
- FinancialTransaction logged correctly
```

---

### Scenario 2: CUSTODY Payment Flow

**Setup:**
```bash
# Create an open custody with unaccounted_amount > 0
POST /api/custody/create
Body:
{
  "amount": 1000,
  "given_by_user_id": 1,
  "safe_id": 5
}
# Response: custody.id = 10, custody.unaccounted_amount = 1000
```

**Test Case 2.1: recordCostPayment using CUSTODY source**
```
POST /api/cost-categories/1/payment
Body:
{
  "amount": 200,
  "payment_direction": "FROM_CATEGORY",
  "payment_source_type": "CUSTODY",
  "payment_source_id": 10,  // Custody ID
  "payment_method": "CASH"
}

Expected:
- CostDebtPayment created with payment_source_type='CUSTODY', payment_source_id=10
- Safe balance UNchanged (custody spends from custody, not safe)
- CustodySpending record created
- custody.spent_amount += 200
- custody.unaccounted_amount -= 200 (or updated via computed property)
- FinancialTransaction logged with payment_source_type='CUSTODY', payment_source_id=10
```

**Test Case 2.2: recordFarmLoading with CUSTODY source**
```
POST /api/operations/{operationId}/recordFarmLoading
Body:
{
  "farm_id": 1,
  "vehicle_id": 1,
  ...
  "payment_source_type": "CUSTODY",
  "payment_source_id": 10
}

Expected:
- FarmDebtPayment created with payment_source_type='CUSTODY', payment_source_id=10
- Safe balance UNchanged
- CustodySpending record created
- FinancialTransaction logged correctly
```

**Test Case 2.3: recordCostPayment with insufficient CUSTODY balance**
```
POST /api/cost-categories/1/payment
Body:
{
  "amount": 2000,  // More than unaccounted_amount
  "payment_source_type": "CUSTODY",
  "payment_source_id": 10
}

Expected:
- Request rejected with error message about insufficient custody balance
- No database changes made (transaction rolled back)
```

---

### Scenario 3: Query Filtering

**Test Case 3.1: Filter transactions by SAFE**
```
GET /api/financial-transactions?payment_source_type=SAFE&payment_source_id=5

Expected:
- Returns all transactions with payment_source_type='SAFE' and payment_source_id=5
- Results match direct safe balance queries
```

**Test Case 3.2: Backward-compatible SAFE filter with safe_id parameter**
```
GET /api/financial-transactions?safe_id=5

Expected:
- Returns all transactions with payment_source_type='SAFE' and payment_source_id=5
- (Internally mapped: safe_id → payment_source_type='SAFE', payment_source_id=safe_id)
```

**Test Case 3.3: Filter transactions by CUSTODY**
```
GET /api/financial-transactions?payment_source_type=CUSTODY&payment_source_id=10

Expected:
- Returns all custody-related transactions
- Includes CustodySpending audit trail
```

---

### Scenario 4: Payment Source Summary Queries

**Test Case 4.1: Get SAFE summary using new helper**
```
JavaScript (backend):
const balance = await FinancialTransaction.getPaymentSourceSummary('SAFE', 5);

Expected:
- Returns net balance (IN - OUT) for that safe
- Matches Safe.current_balance
```

**Test Case 4.2: Get CUSTODY summary**
```
JavaScript (backend):
const balance = await FinancialTransaction.getPaymentSourceSummary('CUSTODY', 10);

Expected:
- Returns net balance for custody (should be close to -custody.spent_amount)
```

**Test Case 4.3: Backward-compatible getSafeSummary()**
```
JavaScript (backend):
const balance = await FinancialTransaction.getSafeSummary(5);

Expected:
- Internally calls getPaymentSourceSummary('SAFE', 5)
- Returns same result as Test Case 4.1
```

---

### Scenario 5: Concurrency & Data Integrity

**Test Case 5.1: Concurrent CUSTODY withdrawals (should serialize)**
```
Simultaneously execute two requests:
Request A: POST to recordCostPayment with CUSTODY source, amount=500
Request B: POST to recordCostPayment with CUSTODY source, amount=600
Total unaccounted_amount = 1000

Expected:
- First request succeeds, custody.spent_amount = 500
- Second request succeeds (or fails) depending on final balance
- Custody row is locked during transaction
- No double-spending or race condition
```

**Test Case 5.2: Verify CustodySpending audit trail**
```bash
SELECT * FROM custody_spendings WHERE custody_id = 10;

Expected:
- One record per payment made
- reference_type = 'CostDebtPayment' or 'FarmDebtPayment'
- reference_id points to correct payment record
- Total spent_amount = SUM(custody_spendings.amount)
```

---

### Scenario 6: End-to-End Operation Flow

**Setup:** New daily operation with multiple transactions

**Test Case 6.1: Complete operation with mixed payment sources**
```
1. Start daily operation
2. recordFarmLoading with SAFE source (safe_id = 5)
3. recordCostPayment with CUSTODY source (custody_id = 10)
4. recordSale with SAFE source
5. recordDailyCost with CUSTODY source
6. Close operation

Expected:
- All transactions use unified payment source fields
- Safe 5 shows correct balance (updated for SAFE transactions only)
- Custody 10 shows correct spent_amount
- FinancialTransaction audit trail complete
- All CustodySpending records created correctly
```

---

## Migration Execution Checklist

Before running the migration script:

- [ ] Backup database
- [ ] Review migration SQL (20240416_unified_payment_source.sql)
- [ ] Test migration on staging environment first
- [ ] Verify row counts before/after data migration
- [ ] Check no NULL values in payment_source_type (should default to 'SAFE')

**Execute migration:**
```bash
# From backend directory
mysql -u<user> -p<password> <database> < migrations/20240416_unified_payment_source.sql
```

**Post-migration verification:**
```sql
-- Check data migration success
SELECT COUNT(*) FROM farm_debt_payments WHERE payment_source_type = 'SAFE';
SELECT COUNT(*) FROM cost_debt_payments WHERE payment_source_type = 'SAFE';
SELECT COUNT(*) FROM daily_costs WHERE payment_source_type = 'SAFE';
SELECT COUNT(*) FROM sale_transactions WHERE payment_source_type = 'SAFE';

-- Verify no orphaned NULLs
SELECT COUNT(*) FROM farm_debt_payments WHERE payment_source_type IS NULL;
SELECT COUNT(*) FROM cost_debt_payments WHERE payment_source_type IS NULL;
```

---

## Rollback Plan (if needed)

If migration fails or causes issues:

```bash
# Restore from backup
mysql -u<user> -p<password> <database> < /path/to/backup.sql

# Or manually revert:
# 1. Re-add safe_id columns
# 2. Restore safe_id values from payment_source_id where payment_source_type='SAFE'
# 3. Re-add foreign key constraints
# 4. Drop payment_source_type/payment_source_id columns
```

---

## Sign-Off

- [ ] All automated tests pass
- [ ] All manual test scenarios pass
- [ ] Migration executed successfully
- [ ] Post-migration data validation complete
- [ ] Backward compatibility verified
- [ ] Performance benchmarked (especially queries using new indexes)
- [ ] Documentation updated

---

## Next Steps (Future Phases)

1. **Expand scope** to remaining models:
   - `PersonAdvance`, `AdvanceReturn`, `SalaryPayment`, `PartnerWithdrawal`
   - `TransportLoss` (currently has `safe_id`)

2. **Remove backward compatibility** after safe period (e.g., 6 weeks):
   - Remove `safe_id` mapping in transactionLogger
   - Remove `safe_id` query parameter support
   - Remove `getSafeSummary()` wrapper

3. **Implement CUSTODY accounting rules:**
   - Automatic custody settlement workflows
   - Balance reconciliation at period-end
   - Custody loss tracking

4. **Audit & Compliance:**
   - Generate custody audit reports
   - Implement custody reconciliation dashboard
   - Add custody approval workflows
