-- HMS Node.js — Ensure Patient Wallet Tables Exist
-- Safe to re-run (uses IF NOT EXISTS / INSERT IGNORE)

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS tbl_patient_wallet (
  id INT NOT NULL AUTO_INCREMENT,
  facility_id INT NOT NULL DEFAULT 1,
  patient_id INT NOT NULL,
  balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  qr_token VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_pat_fac (patient_id, facility_id),
  UNIQUE KEY uq_wallet_qr_token (qr_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tbl_patient_wallet_txn (
  id INT NOT NULL AUTO_INCREMENT,
  wallet_id INT NOT NULL,
  txn_type VARCHAR(32) NOT NULL COMMENT 'deposit_cash, deposit_gbpay, deduct_cashier, refund',
  direction VARCHAR(10) NOT NULL COMMENT 'cr or dr',
  amount DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,
  reference_id VARCHAR(100) NULL,
  notes VARCHAR(255) NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wtxn_wid (wallet_id),
  CONSTRAINT fk_wtxn_wid FOREIGN KEY (wallet_id) REFERENCES tbl_patient_wallet (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Auto-provision a wallet for every existing patient that doesn't have one
INSERT IGNORE INTO tbl_patient_wallet (facility_id, patient_id, balance, status, qr_token)
SELECT 1, id, 0.00, 'active',
       SHA2(CONCAT(id, '-1-', UUID()), 256)
FROM tbl_patient;
