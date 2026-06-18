-- Migration 027: Update tbl_credit_account with notes and created_by
ALTER TABLE tbl_credit_account
  ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER outstanding_balance,
  ADD COLUMN IF NOT EXISTS created_by INT UNSIGNED NULL AFTER notes;
