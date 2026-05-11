# 🐔 Chicken Distribution Backend — Full System Analysis

> **Stack**: Node.js · Express · PostgreSQL · Sequelize v6  
> **Architecture**: Controller → Service (no repository layer in practice)  
> **Language**: Arabic labels in DB comments / response messages, English field names

---

## PART 1 — MODELS STRUCTURE

### Complete Model List (22 models)

| Model | Table | Purpose | Money-Affecting Fields |
|-------|-------|---------|----------------------|
| `User` | `users` | Auth / login | — |
| `Partner` | `partners` | Business partners with equity shares | `investment_amount`, `investment_percentage` |
| `Vehicle` | `vehicles` | Delivery trucks | `purchase_price` |
| `VehiclePartner` | `vehicle_partners` | M:N junction – which partner owns which vehicle | — |
| `Farm` | `farms` | Chicken supplier farms | **`current_balance`** |
| `Buyer` | `buyers` | Chicken purchasers / retailers | **`current_balance`** |
| `ChickenType` | `chicken_types` | Lookup: breed/type | — |
| `CostCategory` | `cost_categories` | Lookup: expense type | `is_vehicle_cost` flag |
| `DailyOperation` | `daily_operations` | One working day's session | — |
| `VehicleOperation` | `vehicle_operations` | A specific vehicle's assignment to a day | — |
| `FarmTransaction` | `farm_transactions` | Chicken purchase from farm (loading) | `net_chicken_weight`, `total_amount`, `paid_amount`, `remaining_amount`, `discount_amount`, `used_credit` |
| `SaleTransaction` | `sale_transactions` | Chicken sale to buyer | `gross_total_weight`, `net_weight`, `subtotal_amount`, `final_amount`, `paid_amount`, `remaining_amount`, `debt_applied_amount` |
| `SaleWeight` | `sale_weights` | Individual scale readings per sale | `weight_value` |
| `TransportLoss` | `transport_losses` | Dead/lost chickens during transport | `loss_amount` |
| `DailyCost` | `daily_costs` | Operational expenses (fuel, labor, etc.) | `amount` |
| `FarmDebtPayment` | `farm_debt_payments` | Standalone payment to/from farm | `amount`, `payment_direction` |
| `BuyerDebtPayment` | `buyer_debt_payments` | Standalone payment to/from buyer | `amount`, `payment_direction` |
| `ProfitDistribution` | `profit_distributions` | Day-close profit snapshot | `total_revenue`, `total_purchases`, `total_losses`, `total_costs`, `vehicle_costs`, `net_profit`, `lossesWithFarm`, `lossesWithoutFarm` |
| `PartnerProfit` | `partner_profits` | Per-partner profit slice | `base_profit_share`, `vehicle_cost_share`, `final_profit` |
| `Permission` | `permissions` | RBAC permission definitions | — |
| `UserPermission` | `user_permissions` | M:N junction user ↔ permission | — |
| `UserBackup` | `user_backups` | Backup/restore metadata | — |

---

### Financial Fields Focus

#### `Farm.current_balance` (DECIMAL 12,2)
```
> 0  →  RECEIVABLE  →  Farm owes us money
< 0  →  PAYABLE     →  We owe farm money
= 0  →  SETTLED
```

#### `Buyer.current_balance` (DECIMAL 12,2)
```
> 0  →  RECEIVABLE  →  Buyer owes us money
< 0  →  CREDIT      →  We owe buyer money (overpayment)
= 0  →  SETTLED
```

Both models expose:
- `updateBalance(delta, t)` — instance method, adds delta to current balance
- `balanceType`, `isDebtor`, `isCreditor`, `absoluteBalance`, `displayBalance` — computed getters
- `getActiveBalances()`, `getReceivables()`, `getPayables()`, `getNetPosition()` — class methods

#### `FarmTransaction` key fields
| Field | Meaning |
|-------|---------|
| `empty_vehicle_weight` | Truck weight before loading |
| `loaded_vehicle_weight` | Truck weight after loading |
| `cage_count × cage_weight_per_unit` | Total cage deduction |
| `net_chicken_weight` | Actual chicken weight purchased |
| `total_amount` | What we owe farm (after discount) |
| `paid_amount` | Paid on the spot |
| `remaining_amount` | Still owed after on-spot payment & credit use |
| `discount_amount` | Price discount applied |
| `used_credit` | Portion of existing credit consumed |

#### `SaleTransaction` key fields
| Field | Meaning |
|-------|---------|
| `gross_total_weight` | Sum of all scale readings |
| `dead_weight` | Dead chickens deducted |
| `empty_cages_weight` | Empty cage weight deducted |
| `total_deductions` | dead + cages |
| `net_weight` | Billable weight |
| `subtotal_amount` | net_weight × price_per_kg |
| `final_amount` | subtotal − discount (buyer actually owes this) |
| `paid_amount` | Cash collected on spot |
| `debt_applied_amount` | Overpayment automatically applied to old buyer debt |
| `remaining_amount` | final_amount − paid_amount (new debt added) |
| `total_amount` | Backward-compat alias for `final_amount` |

---

## PART 2 — RELATIONSHIPS

```
User ──────────────────────── DailyOperation (1:N)
                                     │
                          ┌──────────┼──────────┐
                          │          │          │
                    VehicleOperation (N from each DailyOperation)
                          │
              ┌───────────┼───────────────────┐
              │           │                   │
        FarmTransaction  SaleTransaction    DailyCost
              │           │   └── SaleWeight (1:N)
              │           │
              ▼           ▼
            Farm        Buyer
              │           │
        FarmDebtPayment  BuyerDebtPayment

DailyOperation ─── ProfitDistribution (1:1)
                          └── PartnerProfit (1:N)
                                    └── Partner

Vehicle ──── VehiclePartner ──── Partner  (M:N)
Vehicle ──── VehicleOperation (1:N)

TransportLoss ──► Farm (optional, when farm is responsible)
TransportLoss ──► VehicleOperation
TransportLoss ──► DailyOperation
```

### Dependency Chain

```
Level 1: User, Partner, Vehicle, Farm, Buyer, ChickenType, CostCategory, Permission
Level 2: VehiclePartner, UserPermission, DailyOperation
Level 3: VehicleOperation
Level 4: FarmTransaction, SaleTransaction, TransportLoss, DailyCost, FarmDebtPayment, BuyerDebtPayment, ProfitDistribution
Level 5: PartnerProfit, SaleWeight
```

### Who Affects Who

| Action | Models Written |
|--------|---------------|
| Farm Loading | FarmTransaction, FarmDebtPayment (optional), Farm.current_balance |
| Buyer Sale | SaleTransaction, SaleWeight, BuyerDebtPayment (auto, if overpaid), Buyer.current_balance |
| Transport Loss (farm responsible) | TransportLoss, Farm.current_balance |
| Standalone Farm Payment | FarmDebtPayment, Farm.current_balance |
| Standalone Buyer Payment | BuyerDebtPayment, Buyer.current_balance |
| Day Close | ProfitDistribution, PartnerProfit, VehicleOperation.status, DailyOperation.status |

---

## PART 3 — MONEY FLOW (Step-by-Step)

### Flow 1 — Farm Loading (`recordFarmLoading`)

```
INPUT: vehicle_id, farm_id, chicken_type_id,
       empty_vehicle_weight, loaded_vehicle_weight,
       cage_count, cage_weight_per_unit,
       price_per_kg, paid_amount, discount_amount,
       old_balance_paid (optional), is_debt_payment_only (flag)
```

**Branch A — Debt Payment Only** (`is_debt_payment_only = true`):
1. Validate `old_balance_paid > 0` and farm balance ≠ 0
2. Determine direction:
   - Farm owes us → `FROM_FARM` → `balanceImpact = -amount`
   - We owe farm → `TO_FARM` → `balanceImpact = +amount`
3. Create `FarmDebtPayment`
4. `farm.updateBalance(debtPayment.balanceImpact)`
5. Commit

**Branch B — Normal Farm Loading**:
1. Validate operation is OPEN, vehicle is ACTIVE in operation
2. **Weight calculation**:
   ```
   totalCageWeight      = cage_count × cage_weight_per_unit
   net_chicken_weight   = loaded_vehicle_weight − empty_vehicle_weight − totalCageWeight
   ```
3. **Pricing**:
   ```
   subtotal_amount  = net_chicken_weight × price_per_kg
   total_amount     = max(0, subtotal_amount − discount_amount)
   surplus          = max(0, paid_amount − total_amount)      ← overpayment
   remaining_amount = max(0, total_amount − paid_amount)
   ```
4. **Optional old balance payment**:
   ```
   if old_balance_paid > 0:
     create FarmDebtPayment(direction based on sign of previous_balance)
     debt_payment_impact = debtPayment.balanceImpact
   ```
5. **Credit consumption** (auto-offset):
   ```
   running_balance = previous_balance + debt_payment_impact
   if running_balance > 0 AND remaining_amount > 0:
     used_credit = min(running_balance, remaining_amount)
   final_remaining = remaining_amount − used_credit
   ```
6. **Create FarmTransaction** (stores `final_remaining` as `remaining_amount`)
7. **Balance delta**:
   ```
   Δ = debt_payment_impact − used_credit − final_remaining + surplus
   farm.updateBalance(Δ)
   ```
8. Commit → return full result

---

### Flow 2 — Buyer Sale (`recordSale`) — from most recent version in code

```
INPUT: vehicle_id, buyer_id, chicken_type_id,
       weights[] (array of scale readings),
       empty_cages_weight, dead_weight,
       price_per_kg, discount_amount, paid_amount
```

1. Validate operation OPEN, buyer exists, vehicle ACTIVE
2. **Weight calculation**:
   ```
   gross_total_weight = Σ(weights[])
   total_deductions   = dead_weight + empty_cages_weight
   net_weight         = gross_total_weight − total_deductions
   ```
3. **Pricing**:
   ```
   subtotal_amount = net_weight × price_per_kg
   final_amount    = subtotal_amount − discount_amount
   ```
4. **Payment & debt logic**:
   ```
   if paid_amount > final_amount:
     surplus             = paid_amount − final_amount
     debt_applied_amount = min(surplus, previous_balance)  ← capped at actual debt
     remaining_sale      = 0
   else:
     debt_applied_amount = 0
     remaining_sale      = final_amount − paid_amount
   
   new_balance = previous_balance + remaining_sale − debt_applied_amount
   ```
5. Create `SaleTransaction`
6. Create `SaleWeight` rows (one per reading, `weight_number` 1..N)
7. If `debt_applied_amount > 0`: create `BuyerDebtPayment(FROM_BUYER, debt_applied_amount)`
8. `buyer.updateBalance(new_balance − previous_balance)` *(or direct update)*
9. Commit → return full result

---

### Flow 3 — Farm Payment (`farmPaymentController.recordPayment`)

```
INPUT: farm_id, amount, payment_direction, payment_date, notes
```

1. Validate farm exists, payment_direction ∈ {FROM_FARM, TO_FARM}
2. Create `FarmDebtPayment`
3. Apply `balanceImpact` getter:
   - `FROM_FARM` → `−amount` (farm pays us → their debt decreases)
   - `TO_FARM` → `+amount` (we pay farm → our debt to them decreases)
4. `farm.updateBalance(balanceImpact)`
5. Commit

> ⚠️ The system allows unusual payments (e.g., paying a farm that already owes us) with only a `console.warn`. It does **not** block them.

---

### Flow 4 — Buyer Payment (Standalone)

Mirrors farm payment exactly, via `BuyerDebtPayment`:
- `FROM_BUYER` → `−amount` (buyer pays us → balance decreases)
- `TO_BUYER` → `+amount` (we pay buyer → credit given)

---

### Flow 5 — Transport Loss (`recordTransportLoss`)

```
INPUT: vehicle_id, chicken_type_id, dead_weight, price_per_kg,
       farm_id (optional), location, notes
```

1. Validate vehicle ACTIVE
2. `loss_amount = dead_weight × price_per_kg`
3. If `farm_id` provided:
   - Find farm
   - `farm.updateBalance(+loss_amount)` → farm now owes us for the loss (RECEIVABLE)
4. Create `TransportLoss` record
5. Commit

> Farm balance is **only** adjusted if `farm_id` is explicitly provided. Without it, the loss is internally absorbed (reduces profit later, not tracked as a receivable).

---

### Flow 6 — Day Close (`ProfitService.closeOperation`)

See Part 4 for formulas.

---

## PART 4 — BALANCE SYSTEM

### Farm Balance

| Event | Delta to `current_balance` |
|-------|--------------------------|
| Farm Loading (remaining owed) | `−final_remaining` (we still owe farm) |
| Old Balance Paid (FROM_FARM) | `−old_balance_paid` |
| Old Balance Paid (TO_FARM) | `+old_balance_paid` |
| Surplus overpayment on loading | `+surplus` |
| Credit consumed (used_credit) | `−used_credit` |
| Transport Loss (farm responsible) | `+loss_amount` |
| Standalone FROM_FARM payment | `−amount` |
| Standalone TO_FARM payment | `+amount` |

**Positive = farm owes us (receivable). Negative = we owe farm (payable).**

---

### Buyer Balance

| Event | Delta to `current_balance` |
|-------|--------------------------|
| Sale — unpaid portion | `+remaining_sale` |
| Sale — overpayment applied to old debt | `−debt_applied_amount` |
| Standalone FROM_BUYER payment | `−amount` |
| Standalone TO_BUYER payment | `+amount` (refund / credit) |

**Positive = buyer owes us (receivable). Negative = we owe buyer (credit).**

---

### `updateBalance(delta, transaction)` — Exact Formula

```javascript
newBalance = previousBalance + delta
// Saves to DB
// Returns: { previous_balance, new_balance, change_amount,
//            direction_changed, previous_type, new_type, ... }
```

Direction types:
- `RECEIVABLE` (balance > 0)
- `PAYABLE` / `CREDIT` (balance < 0)
- `SETTLED` (balance = 0)

`direction_changed` is true if balance flipped between RECEIVABLE and PAYABLE (**excluding transitions through SETTLED**).

---

## PART 5 — BUSINESS LOGIC LOCATION

### Architecture Reality

| Layer | What It Does |
|-------|------------|
| **Controller** | Input validation, orchestration, DB transaction management, balance updates |
| **Service (ProfitService)** | Profit calculation + day-close, partner distribution |
| **Model** | `updateBalance()`, computed getters, class-level query helpers |
| **Utils** | `TransactionAggregator` (vehicle summary), `round2` helper |

> The PROJECT_CONTEXT.md states "No business logic inside controllers" — **this is not followed in practice**. The majority of money logic lives in `operationController.js` (4,890 lines).

---

### Key Functions

#### `Farm.prototype.updateBalance(delta, t)` — `Farm.js:118`
Pure arithmetic update with direction-change detection. Single source of truth for Farm balance writes.

#### `Buyer.prototype.updateBalance(delta, t)` — `Buyer.js:124`
Identical pattern. Allows negative balance (unlike old `total_debt` approach which had `Math.max(0,...)`).

#### `recordFarmLoading` — `operationController.js:1511`
Active function. Handles:
- Two branches (debt-only vs. normal loading)
- Credit auto-consumption
- Overpayment (surplus) tracking
- Atomic DB transaction

#### `recordTransportLoss` — `operationController.js:1986`
Active. Farm balance update only if `farm_id` provided.

#### `recordDailyCost` — `operationController.js:2110`
Active. Saves cost linked to vehicle (optional) and vehicle_operation.

#### `ProfitService.calculateDailyProfit(operationId, t)` — `ProfitService.js:527`
- Loads operation with all sub-entities
- Builds `vehicleStats{}` map keyed by `vehicle_id`
- Aggregates purchases / revenue / losses per vehicle
- Separates `lossesWithFarm` vs `lossesWithoutFarm`
- Splits shared vehicle costs equally across vehicles
- Returns operation totals + per-vehicle breakdown

#### `ProfitService.distributeToPartners(operationId, profitData, t)` — `ProfitService.js:743`
- Loads all partners
- Checks if each partner owns a vehicle **in this specific operation**
- Vehicle-owning partners: `vehicleCostShare = 0`
- Non-vehicle partners: `vehicleCostShare = vehicleCosts × (investment_percentage / 100)`
- `finalProfit = baseShare − vehicleCostShare`

#### `ProfitService.closeOperation(operationId, t)` — `ProfitService.js:829`
- Uses row-level lock `FOR UPDATE` on DailyOperation
- Calls `calculateDailyProfit` → `distributeToPartners`
- Creates `ProfitDistribution` + `PartnerProfit` rows
- Sets all `VehicleOperation.status = 'COMPLETED'`
- Sets `DailyOperation.status = 'CLOSED'`

---

## PART 6 — EDGE CASES

### Overpayment on Farm Loading
✅ **Handled.** `surplus = max(0, paid_amount − total_amount)` is explicitly tracked. The balance delta includes `+surplus` so the farm gets credited for overpayment.

### Overpayment on Buyer Sale
✅ **Handled** (in most-recent code version). `debt_applied_amount = min(surplus, previous_balance)` — capped at actual debt. Buyer cannot go below zero (CREDIT is tracked explicitly).

### Partial Payments
✅ **Handled.** Both `FarmTransaction.remaining_amount` and `SaleTransaction.remaining_amount` store unpaid portions. Independent `FarmDebtPayment` / `BuyerDebtPayment` records handle installment payments over time.

### Credit Consumption (Farm)
✅ **Handled.** If farm already has a positive balance (RECEIVABLE: they owe us) and a new purchase creates a debt (remaining_amount), the two are auto-netted via `used_credit`. This is tracked in `FarmTransaction.used_credit`.

### Debt Auto-Application (Buyer)
✅ **Handled.** If buyer overpays on a sale, surplus goes toward old debt automatically via `debt_applied_amount`. A `BuyerDebtPayment(FROM_BUYER)` audit record is created.

### Farm-Responsible Transport Losses
✅ **Partially handled.** If `farm_id` is set on `TransportLoss`, the farm's balance is increased (they owe us for the loss). If no `farm_id`, the loss is absorbed as a business cost (reduces profit via `lossesWithoutFarm`).

### Direction Change Detection
✅ **Tracked.** Both `Farm.updateBalance` and `Buyer.updateBalance` return `direction_changed: true` if balance flips from RECEIVABLE to PAYABLE (or vice versa), and the API response includes an `alert` field.

### Old Debt During Loading
✅ **Handled.** `old_balance_paid` field allows paying off old farm debt simultaneously with a new loading transaction. Direction auto-detected from sign of `previous_balance`.

---

## PART 7 — RISKS (NO FIXES — ANALYSIS ONLY)

### 🔴 Risk 1: Typo in `FarmDebtPayment` Model (Data Integrity Bug)
**File**: `FarmDebtPayment.js:66`
```javascript
ttimestamps: true,   // ← double 't' — Sequelize ignores this
createdAt: 'payment_date',
```
`ttimestamps` is not a valid Sequelize option. Sequelize will use its default timestamp behavior, ignoring the `payment_date` column mapping. The `createdAt` remapping to `payment_date` may or may not work depending on Sequelize's fallback. This could corrupt payment date records.

---

### 🔴 Risk 2: `recordSale` is Not Visible as an Active Export
The grep for `exports.recordSale` returned no results. The most recent version in `operationController.js` is **commented out** (lines 2703–3200+). It is not clear what the currently deployed `recordSale` function is. The file is 4,890 lines with layers of commented-out iterations. If no active `recordSale` exists, the API endpoint silently falls through.

---

### 🔴 Risk 3: `total_debt` Field Referenced But Doesn't Exist
**File**: `buyerController.js:43–46`
```javascript
where.total_debt = { [Op.gt]: 0 }; // filter "has_debt=true"
where.total_debt = 0;               // filter "has_debt=false"
```
The Buyer model has `current_balance`, not `total_debt`. This query will either produce a Sequelize error or silently return wrong results (PostgreSQL may allow querying a non-existent column as NULL).

---

### 🟠 Risk 4: `transactionAggregator.js` Uses Removed Field
**File**: `transactionAggregator.js:62`
```javascript
summary.total_sold_kg += parseFloat(t.net_chicken_weight); // undefined!
```
`SaleTransaction` no longer has `net_chicken_weight` — it was replaced by `net_weight`. This utility will always compute `total_sold_kg = NaN`.

---

### 🟠 Risk 5: `VehiclePartner.share_percentage` Doesn't Exist
**File**: `ProfitService.js:766`
```javascript
through: { attributes: ['share_percentage'] }
```
The `VehiclePartner` model has no `share_percentage` field. This attribute will always be `undefined`. The vehicle-ownership check still works (it checks partner presence, not the share), but any code relying on `share_percentage` will silently get `undefined`.

---

### 🟠 Risk 6: Massive Dead Code Volume
`operationController.js` is **4,890 lines** of which an estimated 70–80% is commented-out previous versions of functions. This makes it extremely difficult to:
- Identify which version of a function is currently active
- Understand the current behavior
- Safely onboard new developers

---

### 🟠 Risk 7: Floating-Point Arithmetic for Percentages
**File**: `Partner.js:67`
```javascript
const percentage = (parseFloat(partner.investment_amount) / totalInvestment) * 100;
```
Raw IEEE-754 float division. With 3+ partners, percentages will not sum to exactly 100.00. This cascades into profit distribution rounding errors. The PROJECT_CONTEXT.md says "No floating-point math", but this violates it.

---

### 🟡 Risk 8: Timestamp Deduplication in `getBuyerDebtHistory`
**File**: `buyerController.js:734–739`
```javascript
const transactionTimestamps = new Set(
  transactions.map(t => new Date(t.transaction_time).getTime())
);
const filteredPayments = payments.filter(p =>
  !transactionTimestamps.has(new Date(p.payment_date).getTime())
);
```
Standalone payments made at the exact same millisecond as a transaction will be incorrectly removed from the history. This is a timing-based false deduplication.

---

### 🟡 Risk 9: No Balance Guard on Farm/Buyer `updateBalance`
Neither `Farm.updateBalance` nor `Buyer.updateBalance` enforces any floor. A logic error upstream (wrong sign, double-application) can flip a balance arbitrarily. There is no idempotency protection. Orphaned updates (if process crashes after `updateBalance` but before `commit`) could leave balances corrupt — though the DB transaction wrapper mitigates this.

---

### 🟡 Risk 10: ProfitService Revenue Uses `total_amount` (Alias)
**File**: `ProfitService.js:615`
```javascript
vehicleStats[t.vehicle_id].revenue += parseFloat(t.total_amount) || 0;
```
`total_amount` on `SaleTransaction` is a backward-compatibility alias for `final_amount`. They should match, but if a migration is ever run that removes the alias, profit calculations will silently become zero.

---

### 🟡 Risk 11: `lossesWithFarm` Not Deducted from `netProfit`
**File**: `ProfitService.js:685`
```javascript
const netProfit = totalRevenue - totalPurchases - lossesWithoutFarm - totalCosts;
// lossesWithFarm is stored but NOT subtracted from netProfit
```
This is intentional logic (the farm is liable for those losses, so they don't affect our profit). However, if the farm never pays, the receivable sits on their balance but the profit appears higher than reality. No alerting or validation forces reconciliation.

---

### 🟡 Risk 12: `DailyOperation.getVehicles` Uses Wrong Alias
**File**: `DailyOperation.js:60`
```javascript
include: [{ model: Vehicle, as: 'vehicles' }]
```
But in `index.js`, the VehicleOperation → Vehicle association is defined as `as: 'vehicle'` (singular), not `as: 'vehicles'`. This instance method will likely throw an Sequelize association error at runtime.

---

### 🟡 Risk 13: Validation Errors Don't Stop Execution in Some Controllers
**File**: `operationController.js:168–177`
```javascript
if (!operation_date) {
  next(new AppError('تاريخ العملية مطلوب', 400));
  // ← no 'return' — execution CONTINUES after calling next()
}
```
Several early validation calls use `next(error)` without `return`. Execution continues into the success path, potentially creating phantom records.

---

## PART 8 — FINAL SUMMARY (Onboarding in 15 Lines)

This is a **chicken distribution accounting backend** for a small business with multiple partners.

**Daily workflow**: A `DailyOperation` is opened for a date. One or more `Vehicles` are assigned (via `VehicleOperation`). Each vehicle loads chickens from `Farms` (`FarmTransaction` — weight-based pricing). Birds die or are lost in transit (`TransportLoss`). Chickens are sold to `Buyers` (`SaleTransaction` — multi-reading scale flow). Expenses are logged (`DailyCost`). At end of day, the operation is **closed**: `ProfitService` computes revenue minus purchases minus non-farm-losses minus all costs, then distributes the net profit to `Partners` proportionally by investment percentage. Vehicle-owning partners skip the vehicle-cost deduction.

**Balance system**: Both `Farm` and `Buyer` have a single `current_balance` field. Positive = they owe us (receivable). Negative = we owe them (payable). Every financial event calls `updateBalance(delta)` exactly once inside a DB transaction. All audit trails are stored in `FarmDebtPayment` and `BuyerDebtPayment` tables.

**Key risks to know on day one**: (1) The `FarmDebtPayment` model has a typo (`ttimestamps`) that may corrupt payment dates. (2) The `recordSale` export cannot be located — its active version is unclear. (3) `buyerController` filters by a column (`total_debt`) that no longer exists.

The codebase is **heavily iterative** — `operationController.js` (4,890 lines, ~75% commented-out old versions) is the symptom of rapid feature evolution without pruning. New code should be read carefully to distinguish active exports from commented-out prototypes.
