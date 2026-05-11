-- Reinvest Profits Feature
-- Create partner_reinvestments table (mirror PartnerWithdrawal exactly)
-- 2024-12-01

USE chicken_distribution;

-- Drop if exists (safety)
DROP TABLE IF EXISTS partner_reinvestments;

CREATE TABLE partner_reinvestments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  partner_id BIGINT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reinvest_date DATE NOT NULL,
  processed_by_user_id BIGINT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign keys
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE,
  FOREIGN KEY (processed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  
  -- Indexes for performance
  INDEX idx_partner (partner_id),
  INDEX idx_date (reinvest_date),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='إعادة استثمار أرباح الشركاء';

-- Verify creation
SHOW CREATE TABLE partner_reinvestments;

-- Show first few rows after migration (will be empty)
SELECT * FROM partner_reinvestments ORDER BY created_at DESC LIMIT 5;
