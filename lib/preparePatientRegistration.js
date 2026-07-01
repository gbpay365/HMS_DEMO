'use strict';

const { columnExists, safeAlterPatientColumn } = require('./ensurePatientCodeSchema');

/**
 * Bootstrap tbl_patient columns for registration — MUST run on pool outside any transaction.
 * PostgreSQL aborts the whole transaction when a statement fails, even if Node catches the error.
 */
async function ensurePatientRegistrationColumns(pool) {
  const pg = pool?.driver === 'postgres';
  if (pg) {
    const stmts = [
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS age_years SMALLINT NULL',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS age_only_registration SMALLINT NOT NULL DEFAULT 0',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS address TEXT NULL',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS cni_number VARCHAR(100) NULL',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS cni_issue_date DATE NULL',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS next_of_kin_name VARCHAR(255) NULL',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS next_of_kin_phone VARCHAR(50) NULL',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS next_of_kin_relationship VARCHAR(100) NULL',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255) NULL',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50) NULL',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS portal_enabled SMALLINT NOT NULL DEFAULT 0',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS facility_id INTEGER NULL',
      'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS dob VARCHAR(250) NULL',
    ];
    for (const sql of stmts) {
      await pool.query(sql).catch((e) => {
        console.warn('[preparePatientRegistration] PG column:', e.message);
      });
    }
    return;
  }

  const mysqlCols = [
    ['patient_type', 'ALTER TABLE tbl_patient ADD COLUMN patient_type VARCHAR(30) NULL'],
    ['cni_number', 'ALTER TABLE tbl_patient ADD COLUMN cni_number VARCHAR(100) NULL'],
    ['cni_issue_date', 'ALTER TABLE tbl_patient ADD COLUMN cni_issue_date DATE NULL'],
    ['next_of_kin_name', 'ALTER TABLE tbl_patient ADD COLUMN next_of_kin_name VARCHAR(255) NULL'],
    ['next_of_kin_phone', 'ALTER TABLE tbl_patient ADD COLUMN next_of_kin_phone VARCHAR(50) NULL'],
    ['next_of_kin_relationship', 'ALTER TABLE tbl_patient ADD COLUMN next_of_kin_relationship VARCHAR(100) NULL'],
    ['emergency_contact_name', 'ALTER TABLE tbl_patient ADD COLUMN emergency_contact_name VARCHAR(255) NULL'],
    ['emergency_contact_phone', 'ALTER TABLE tbl_patient ADD COLUMN emergency_contact_phone VARCHAR(50) NULL'],
    ['portal_enabled', 'ALTER TABLE tbl_patient ADD COLUMN portal_enabled TINYINT DEFAULT 0'],
    ['status', 'ALTER TABLE tbl_patient ADD COLUMN status TINYINT DEFAULT 1'],
    ['created_at', 'ALTER TABLE tbl_patient ADD COLUMN created_at DATETIME NULL'],
  ];
  for (const [col, sql] of mysqlCols) {
    if (!(await columnExists(pool, col))) {
      await safeAlterPatientColumn(pool, sql).catch((e) => {
        console.warn('[preparePatientRegistration] MySQL column:', e.message);
      });
    }
  }
}

/** Run all registration DDL/index prep outside transactions (PostgreSQL-safe). */
async function preparePatientRegistrationSchemas(pool) {
  const { ensurePatientDirectoryColumns, syncPatientIdSequence } = require('./patientDirectory');
  const { ensurePatientAgeColumns } = require('./patientAge');
  const ensurePatientCodeSchema = require('./ensurePatientCodeSchema');
  const { ensurePatientIdentitySchema } = require('./ensurePatientIdentitySchema');

  await ensurePatientDirectoryColumns(pool);
  await ensurePatientRegistrationColumns(pool);
  await ensurePatientAgeColumns(pool);
  try {
    await ensurePatientCodeSchema(pool);
  } catch (e) {
    console.warn('[preparePatientRegistration] patient_code schema:', e.message);
  }
  try {
    await ensurePatientIdentitySchema(pool);
  } catch (e) {
    console.warn('[preparePatientRegistration] identity schema:', e.message);
  }
  await syncPatientIdSequence(pool);
}

/** Create wallet row after patient insert — outside main txn so PG abort rules do not apply. */
async function ensurePatientWalletRow(pool, patientId) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return;
  const qrToken = `GBPAY-${pid}-${Date.now()}`;
  await pool
    .query(
      "INSERT IGNORE INTO tbl_patient_wallet (patient_id, balance, status, qr_token, created_at, updated_at) VALUES (?,0,'active',?,NOW(),NOW())",
      [pid, qrToken]
    )
    .catch((e) => {
      console.warn('[preparePatientRegistration] wallet bootstrap:', e.message);
    });
}

module.exports = {
  ensurePatientRegistrationColumns,
  preparePatientRegistrationSchemas,
  ensurePatientWalletRow,
};
