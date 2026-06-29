'use strict';

/** MocDoc-style LIMS extensions — pipeline, dispatch, referrers, departments, analyzer. */
async function columnExists(pool, table, col) {
  try {
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [table, col]
    );
    return Number(r?.c || 0) > 0;
  } catch (_) {
    return false;
  }
}

async function addColumn(pool, table, ddl) {
  const m = ddl.match(/^\s*(\w+)\s+/);
  if (!m || (await columnExists(pool, table, m[1]))) return;
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`).catch(() => {});
}

module.exports = async function ensureLabLimsPhaseSchema(pool) {
  if (pool?.driver === 'postgres') return;
  const sq = (s, p = []) => pool.query(s, p);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_department (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(24) NOT NULL,
      name VARCHAR(120) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY uq_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_referrer (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      code VARCHAR(32) DEFAULT NULL,
      name VARCHAR(255) NOT NULL,
      referrer_type VARCHAR(32) NOT NULL DEFAULT 'doctor',
      mobile VARCHAR(40) DEFAULT NULL,
      email VARCHAR(120) DEFAULT NULL,
      address VARCHAR(500) DEFAULT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_facility (facility_id),
      KEY idx_name (name(80))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_credit_provider (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      country_code CHAR(2) DEFAULT NULL,
      code VARCHAR(32) DEFAULT NULL,
      name VARCHAR(255) NOT NULL,
      provider_type VARCHAR(32) NOT NULL DEFAULT 'corporate',
      contact_phone VARCHAR(40) DEFAULT NULL,
      contact_email VARCHAR(120) DEFAULT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_facility (facility_id),
      KEY idx_country (country_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_dispatch_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      lab_result_id INT NOT NULL,
      patient_id INT NOT NULL,
      channel VARCHAR(24) NOT NULL DEFAULT 'print',
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      recipient VARCHAR(255) DEFAULT NULL,
      sent_at DATETIME DEFAULT NULL,
      sent_by INT DEFAULT NULL,
      notes VARCHAR(500) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_result (lab_result_id),
      KEY idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_analyzer_import (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lab_result_id INT NOT NULL,
      instrument_id VARCHAR(64) DEFAULT NULL,
      field_key VARCHAR(64) DEFAULT NULL,
      raw_value VARCHAR(255) DEFAULT NULL,
      payload JSON DEFAULT NULL,
      imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      imported_by INT DEFAULT NULL,
      KEY idx_result (lab_result_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  for (const col of [
    "priority ENUM('normal','emergency') NOT NULL DEFAULT 'normal'",
    'referrer_id INT DEFAULT NULL',
    'credit_provider_id INT DEFAULT NULL',
    "visit_type VARCHAR(8) NOT NULL DEFAULT 'OP'",
    'barcode_no VARCHAR(64) DEFAULT NULL',
  ]) {
    await addColumn(pool, 'tbl_lab_request', col);
  }

  for (const col of [
    'department_id INT DEFAULT NULL',
  ]) {
    await addColumn(pool, 'tbl_lab_catalog', col);
  }

  for (const col of [
    "pipeline_stage VARCHAR(32) NOT NULL DEFAULT 'bill_paid'",
    'is_emergency TINYINT(1) NOT NULL DEFAULT 0',
    'is_abnormal TINYINT(1) NOT NULL DEFAULT 0',
    'is_critical TINYINT(1) NOT NULL DEFAULT 0',
    'verified_at DATETIME DEFAULT NULL',
    'verified_by INT DEFAULT NULL',
    'approved_at DATETIME DEFAULT NULL',
    'approved_by INT DEFAULT NULL',
    'printed_at DATETIME DEFAULT NULL',
    "dispatch_status VARCHAR(24) NOT NULL DEFAULT 'pending'",
    'referrer_id INT DEFAULT NULL',
    'credit_provider_id INT DEFAULT NULL',
    'barcode_no VARCHAR(64) DEFAULT NULL',
    'analyzer_import_at DATETIME DEFAULT NULL',
    'delta_snapshot JSON DEFAULT NULL',
    'retest_count INT NOT NULL DEFAULT 0',
  ]) {
    await addColumn(pool, 'tbl_lab_result', col);
  }

  for (const col of [
    'barcode_no VARCHAR(64) DEFAULT NULL',
  ]) {
    await addColumn(pool, 'tbl_lab_sample', col);
  }

  const depts = [
    ['BIOCHEM', 'Biochemistry', 10],
    ['CLINPATH', 'Clinical pathology', 20],
    ['HAEM', 'Haematology', 30],
    ['HISTO', 'Histopathology', 40],
    ['IMMUNO', 'Immunology', 50],
    ['MICRO', 'Microbiology', 60],
    ['MOLECU', 'Molecular biology', 70],
    ['SERO', 'Serology', 80],
    ['OTHER', 'Other', 90],
  ];
  for (const [code, name, ord] of depts) {
    await sq(
      `INSERT IGNORE INTO tbl_lab_department (code, name, sort_order, active) VALUES (?,?,?,1)`,
      [code, name, ord]
    ).catch(() => {});
  }

  const catDeptMap = [
    ['haematology', 'HAEM'],
    ['biochemistry', 'BIOCHEM'],
    ['microbiology', 'MICRO'],
    ['serology', 'SERO'],
    ['immunology', 'IMMUNO'],
    ['pathology', 'HISTO'],
    ['molecular', 'MOLECU'],
  ];
  for (const [cat, dcode] of catDeptMap) {
    const [[d]] = await sq('SELECT id FROM tbl_lab_department WHERE code=? LIMIT 1', [dcode]).catch(() => [[null]]);
    if (d?.id) {
      await sq(
        `UPDATE tbl_lab_catalog SET department_id=? WHERE LOWER(category)=? AND (department_id IS NULL OR department_id=0)`,
        [d.id, cat]
      ).catch(() => {});
    }
  }

  const referrers = [
    ['REF-GP', 'General Practitioner (GP)', 'doctor', '08030000001'],
    ['REF-SPEC', 'Specialist Physician', 'doctor', '08030000002'],
    ['REF-CON', 'Consultant — Internal Medicine', 'doctor', '08030000003'],
    ['REF-OBG', 'Consultant — Obstetrics & Gynaecology', 'doctor', '08030000004'],
    ['REF-PED', 'Consultant — Paediatrics', 'doctor', '08030000005'],
    ['REF-SURG', 'Consultant — Surgery', 'doctor', '08030000006'],
    ['REF-ER', 'Emergency Department', 'hospital', '08030000007'],
    ['REF-OPD', 'Outpatient Clinic', 'hospital', '08030000008'],
    ['REF-CHC', 'Community Health Centre', 'clinic', '08030000009'],
    ['REF-PHC', 'Primary Health Centre (PHC)', 'clinic', '08030000010'],
    ['REF-NUR', 'Nursing Station / Ward', 'hospital', '08030000011'],
    ['REF-CORP', 'Corporate Occupational Health', 'corporate', '08030000012'],
    ['REF-EXT', 'External Hospital / Transfer', 'hospital', '08030000013'],
    ['REF-SELF', 'Self-referred / No referrer', 'doctor', null],
  ];
  for (const [code, name, rtype, mobile] of referrers) {
    await sq(
      `INSERT INTO tbl_lab_referrer (facility_id, code, name, referrer_type, mobile, active)
       SELECT 1, ?, ?, ?, ?, 1 FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM tbl_lab_referrer WHERE name=? LIMIT 1)`,
      [code, name, rtype, mobile, name]
    ).catch(() => {});
  }

  try {
    const profileSvc = require('./hmsCountryProfileService');
    await profileSvc.loadActiveFromDb(pool).catch(() => {});
    const { syncCountryCreditProviders } = require('./labCreditProviderSeed');
    await syncCountryCreditProviders(pool, profileSvc.getActiveCode());
  } catch (_) { /* optional */ }
};
