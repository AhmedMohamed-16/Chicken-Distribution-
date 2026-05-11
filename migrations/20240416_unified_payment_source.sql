-- =============================================================================
-- Migration: 20240416_unified_payment_source.sql
-- Description: Migrate from safe_id to unified payment_source_type/payment_source_id
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADD COLUMNS to tables that need them
-- ─────────────────────────────────────────────────────────────────────────────

-- farm_debt_payments: Add payment source columns
ALTER TABLE farm_debt_payments
  ADD COLUMN payment_source_type ENUM('SAFE', 'CUSTODY') NOT NULL DEFAULT 'SAFE',
  ADD COLUMN payment_source_id INT NULL;

-- cost_debt_payments: Add payment source columns  
ALTER TABLE cost_debt_payments
  ADD COLUMN payment_source_type ENUM('SAFE', 'CUSTODY') NOT NULL DEFAULT 'SAFE',
  ADD COLUMN payment_source_id INT NULL;

-- daily_costs: Add payment source columns
ALTER TABLE daily_costs
  ADD COLUMN payment_source_type ENUM('SAFE', 'CUSTODY') NOT NULL DEFAULT 'SAFE',
  ADD COLUMN payment_source_id INT NULL;

-- sale_transactions: Add payment source columns
ALTER TABLE sale_transactions
  ADD COLUMN payment_source_type ENUM('SAFE', 'CUSTODY') NOT NULL DEFAULT 'SAFE',
  ADD COLUMN payment_source_id INT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DATA MIGRATION: Backfill payment source data from safe_id
-- ─────────────────────────────────────────────────────────────────────────────

-- farm_debt_payments
UPDATE farm_debt_payments 
SET payment_source_type = 'SAFE', payment_source_id = safe_id 
WHERE safe_id IS NOT NULL;

-- cost_debt_payments
UPDATE cost_debt_payments 
SET payment_source_type = 'SAFE', payment_source_id = safe_id 
WHERE safe_id IS NOT NULL;

-- daily_costs
UPDATE daily_costs 
SET payment_source_type = 'SAFE', payment_source_id = safe_id 
WHERE safe_id IS NOT NULL;

-- sale_transactions
UPDATE sale_transactions 
SET payment_source_type = 'SAFE', payment_source_id = safe_id 
WHERE safe_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CREATE INDEXES for efficient payment source lookups
-- ─────────────────────────────────────────────────────────────────────────────

-- Index for farm_debt_payments
CREATE INDEX idx_farm_payments_source 
  ON farm_debt_payments(payment_source_type, payment_source_id);

-- Index for cost_debt_payments
CREATE INDEX idx_cost_payments_source 
  ON cost_debt_payments(payment_source_type, payment_source_id);

-- Index for daily_costs
CREATE INDEX idx_daily_costs_source 
  ON daily_costs(payment_source_type, payment_source_id);

-- Index for sale_transactions
CREATE INDEX idx_sale_transactions_source 
  ON sale_transactions(payment_source_type, payment_source_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. REMOVE OLD FOREIGN KEY CONSTRAINTS (if any) and DROP safe_id columns
-- ─────────────────────────────────────────────────────────────────────────────

-- Note: Since safe_id was not a primary relationships in these tables
-- (they have their own domain FKs), we can safely drop the columns.
-- If there are explicit FK constraints, they should already be listed below.

-- Drop safe_id from farm_debt_payments
ALTER TABLE farm_debt_payments 
  DROP COLUMN safe_id;

-- Drop safe_id from cost_debt_payments
ALTER TABLE cost_debt_payments 
  DROP COLUMN safe_id;

-- Drop safe_id from daily_costs
ALTER TABLE daily_costs 
  DROP COLUMN safe_id;

-- Drop safe_id from sale_transactions
ALTER TABLE sale_transactions 
  DROP COLUMN safe_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. MIGRATION for financial_transactions (already has payment_source columns,
--    but ensure backward compatibility if migrating from safe_id)
-- ─────────────────────────────────────────────────────────────────────────────

-- Backfill any existing financial_transactions that may still have safe_id references
-- (assuming financial_transactions already has payment_source columns)
UPDATE financial_transactions 
SET payment_source_type = 'SAFE', payment_source_id = safe_id 
WHERE safe_id IS NOT NULL AND payment_source_id IS NULL;

-- Drop safe_id from financial_transactions if it exists
-- ALTER TABLE financial_transactions DROP COLUMN safe_id;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK PROCEDURE (if needed):
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK;
-- (Revert column additions, index drops, and restore safe_id with data from backups)
