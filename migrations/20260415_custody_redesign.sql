-- 1. Create CustodySpending table
CREATE TYPE "enum_custody_spendings_reference_type" AS ENUM('FarmTransaction', 'DailyCost', 'SaleTransaction', 'ManualExpense');

CREATE TABLE IF NOT EXISTS "custody_spendings" (
  "id" SERIAL PRIMARY KEY,
  "custody_id" INTEGER NOT NULL REFERENCES "custodies" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "reference_type" "enum_custody_spendings_reference_type" NOT NULL,
  "reference_id" INTEGER,
  "amount" DECIMAL(12, 2) NOT NULL,
  "description" TEXT,
  "spending_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "recorded_by_user_id" INTEGER NOT NULL REFERENCES "users" ("id") ON UPDATE CASCADE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 2. Update Custody table
ALTER TABLE "custodies" ADD COLUMN IF NOT EXISTS "spent_amount" DECIMAL(12, 2) DEFAULT 0;

-- Update Custody Status ENUM
ALTER TYPE "enum_custodies_status" ADD VALUE IF NOT EXISTS 'RECONCILED' AFTER 'PARTIAL';

-- 3. Update Operational tables for payment source abstraction
CREATE TYPE "enum_payment_source_type" AS ENUM('SAFE', 'CUSTODY');

-- FarmTransaction
ALTER TABLE "farm_transactions" ADD COLUMN IF NOT EXISTS "payment_source_type" "enum_payment_source_type" DEFAULT 'SAFE';
ALTER TABLE "farm_transactions" ADD COLUMN IF NOT EXISTS "payment_source_id" INTEGER;

-- DailyCost
ALTER TABLE "daily_costs" ADD COLUMN IF NOT EXISTS "payment_source_type" "enum_payment_source_type" DEFAULT 'SAFE';
ALTER TABLE "daily_costs" ADD COLUMN IF NOT EXISTS "payment_source_id" INTEGER;

-- SaleTransaction
ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "payment_source_type" "enum_payment_source_type" DEFAULT 'SAFE';
ALTER TABLE "sale_transactions" ADD COLUMN IF NOT EXISTS "payment_source_id" INTEGER;

-- BuyerDebtPayment (Since we added support in recordSale)
ALTER TABLE "buyer_debt_payments" ADD COLUMN IF NOT EXISTS "payment_source_type" "enum_payment_source_type" DEFAULT 'SAFE';
ALTER TABLE "buyer_debt_payments" ADD COLUMN IF NOT EXISTS "payment_source_id" INTEGER;

-- FarmDebtPayment
ALTER TABLE "farm_debt_payments" ADD COLUMN IF NOT EXISTS "payment_source_type" "enum_payment_source_type" DEFAULT 'SAFE';
ALTER TABLE "farm_debt_payments" ADD COLUMN IF NOT EXISTS "payment_source_id" INTEGER;

-- 4. Mark historical data (Optional but recommended by plan)
-- We don't have a 'historical' flag yet, but we can use notes or just leave spent_amount at 0.
-- If the user wants a dedicated flag:
-- ALTER TABLE "custodies" ADD COLUMN IF NOT EXISTS "is_historical" BOOLEAN DEFAULT FALSE;
-- UPDATE "custodies" SET "is_historical" = TRUE WHERE "status" = 'CLOSED';

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS "idx_custody_spendings_custody_id" ON "custody_spendings" ("custody_id");
CREATE INDEX IF NOT EXISTS "idx_farm_transactions_payment_source" ON "farm_transactions" ("payment_source_type", "payment_source_id");
CREATE INDEX IF NOT EXISTS "idx_daily_costs_payment_source" ON "daily_costs" ("payment_source_type", "payment_source_id");
