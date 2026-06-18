-- Migration 026: Patient Insurance & Insurance Carrier API endpoint
-- Run once against your MySQL database

-- Add API endpoint column to carriers table
ALTER TABLE tbl_insurance_carrier
  ADD COLUMN IF NOT EXISTS api_endpoint VARCHAR(500) NULL COMMENT 'Configurable stub API URL for automated lookup',
  ADD COLUMN IF NOT EXISTS api_key_hint VARCHAR(200) NULL COMMENT 'Hint/label for the API key (actual key stored in env)',
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS email VARCHAR(150) NULL;

-- Patient insurance policies table
CREATE TABLE IF NOT EXISTS tbl_patient_insurance (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id             INT UNSIGNED NOT NULL,
  carrier_id             INT UNSIGNED NOT NULL,
  policy_number          VARCHAR(120) NULL,
  insurance_id_external  VARCHAR(120) NULL COMMENT 'Patient card/member ID for API lookup',
  insurer_covered_percent TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0-100: % insurer pays',
  is_primary             TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=primary, 0=secondary',
  effective_from         DATE NULL,
  effective_to           DATE NULL,
  api_source             VARCHAR(100) NULL COMMENT 'Source of auto-lookup (carrier code or stub)',
  api_last_fetched       DATETIME NULL,
  notes                  TEXT NULL,
  created_by             INT UNSIGNED NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pi_patient   (patient_id),
  INDEX idx_pi_carrier   (carrier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
