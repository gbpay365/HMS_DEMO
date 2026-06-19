'use strict';

/**
 * IPD Hospitalization module schema (Odoo ACS HMS–style).
 * Surgery templates, checklists, buildings/OT, care plans, death registry.
 */
/** Null legacy 0000-00-00 values (requires relaxed session sql_mode for the UPDATE). */
async function cleanAdmissionZeroDates(pool) {
  if (pool && pool.driver === 'postgres') return;
  const conn = await pool.getConnection();
  try {
    await conn.query('SET @hms_old_sql_mode = @@SESSION.sql_mode');
    await conn.query(
      `SET SESSION sql_mode = REPLACE(REPLACE(@@SESSION.sql_mode, 'NO_ZERO_DATE', ''), 'NO_ZERO_IN_DATE', '')`
    );
    const zeroDtCols = [
      'admitted_at',
      'discharged_at',
      'clinical_discharged_at',
      'expected_discharge_at',
    ];
    for (const col of zeroDtCols) {
      const [[exists]] = await conn
        .query(
          `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_admission' AND COLUMN_NAME = ?`,
          [col]
        )
        .catch(() => [[{ c: 0 }]]);
      if (!parseInt(exists?.c || 0, 10)) continue;
      await conn
        .query(
          `UPDATE tbl_admission SET ${col} = NULL
           WHERE ${col} = '0000-00-00 00:00:00' OR ${col} = '0000-00-00'`
        )
        .catch(() => {});
    }
    await conn.query('SET SESSION sql_mode = @hms_old_sql_mode');
  } finally {
    conn.release();
  }
}

module.exports = async function ensureIpdHospitalizationSchema(pool) {
  if (pool && pool.driver === 'postgres') return;
  const sq = (s, p = []) => pool.query(s, p);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_building (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      notes VARCHAR(500) DEFAULT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_operation_theater (
      id INT AUTO_INCREMENT PRIMARY KEY,
      building_id INT DEFAULT NULL,
      name VARCHAR(120) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_building (building_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_checklist_template (
      id INT AUTO_INCREMENT PRIMARY KEY,
      checklist_type ENUM('admission','pre_ward','pre_op') NOT NULL DEFAULT 'admission',
      label VARCHAR(200) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_type (checklist_type, active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_care_plan_template (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      description TEXT DEFAULT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_surgery_template (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(40) DEFAULT NULL,
      name VARCHAR(200) NOT NULL,
      default_charge DECIMAL(12,2) NOT NULL DEFAULT 0,
      consumables_json TEXT DEFAULT NULL,
      medications_json TEXT DEFAULT NULL,
      summary_text TEXT DEFAULT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_surgery (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admission_id INT NOT NULL,
      patient_id INT NOT NULL,
      template_id INT DEFAULT NULL,
      surgeon_id INT DEFAULT NULL,
      operation_theater_id INT DEFAULT NULL,
      title VARCHAR(200) NOT NULL,
      status ENUM('draft','scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'draft',
      scheduled_at DATETIME DEFAULT NULL,
      completed_at DATETIME DEFAULT NULL,
      charge_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      notes TEXT DEFAULT NULL,
      pre_op_checklist_json TEXT DEFAULT NULL,
      print_in_discharge TINYINT(1) NOT NULL DEFAULT 1,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_admission (admission_id),
      KEY idx_patient (patient_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_admission_checklist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admission_id INT NOT NULL,
      template_id INT NOT NULL,
      completed_at DATETIME DEFAULT NULL,
      completed_by INT DEFAULT NULL,
      UNIQUE KEY uniq_adm_tpl (admission_id, template_id),
      KEY idx_admission (admission_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_death_registry (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admission_id INT NOT NULL,
      patient_id INT NOT NULL,
      date_of_death DATE NOT NULL,
      time_of_death TIME DEFAULT NULL,
      cause_of_death VARCHAR(500) DEFAULT NULL,
      certifying_doctor_id INT DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      reported_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_admission (admission_id),
      KEY idx_patient (patient_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  async function admissionColumnExists(col) {
    const [[row]] = await pool
      .query(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_admission' AND COLUMN_NAME = ?`,
        [col]
      )
      .catch(() => [[{ c: 0 }]]);
    return parseInt(row?.c || 0, 10) > 0;
  }

  async function addAdmissionColumn(col, def) {
    if (await admissionColumnExists(col)) return;
    try {
      await pool.query(`ALTER TABLE tbl_admission ADD COLUMN ${col} ${def}`);
    } catch (e) {
      if (e && (e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060)) return;
      throw e;
    }
  }

  const admCols = [
    ['relative_name', 'VARCHAR(120) DEFAULT NULL'],
    ['relative_phone', 'VARCHAR(60) DEFAULT NULL'],
    ['relative_relation', 'VARCHAR(60) DEFAULT NULL'],
    ['hospitalization_reason', 'VARCHAR(500) DEFAULT NULL'],
    ['primary_surgeon_id', 'INT DEFAULT NULL'],
    ['primary_nurse_id', 'INT DEFAULT NULL'],
    ['care_plan_template_id', 'INT DEFAULT NULL'],
    ['legal_case_notes', 'TEXT DEFAULT NULL'],
    ['discharge_outcome', "ENUM('normal','transferred','deceased','ama') DEFAULT NULL"],
  ];
  for (const [col, def] of admCols) {
    await addAdmissionColumn(col, def);
  }

  await cleanAdmissionZeroDates(pool);

  await sq(`ALTER TABLE tbl_bed MODIFY COLUMN status VARCHAR(24) NOT NULL DEFAULT 'available'`).catch(() => {});

  const seeds = [
    ['admission', 'Documents signed by patient / relatives', 10],
    ['admission', 'Patient file prepared', 20],
    ['admission', 'Insurance / payment verification', 30],
    ['pre_ward', 'Vitals baseline recorded', 10],
    ['pre_ward', 'Allergies confirmed', 20],
    ['pre_ward', 'Nursing assessment completed', 30],
    ['pre_op', 'Consent form signed', 10],
    ['pre_op', 'NPO instructions given', 20],
    ['pre_op', 'Pre-op labs reviewed', 30],
  ];
  for (const [type, label, ord] of seeds) {
    await sq(
      `INSERT IGNORE INTO tbl_ipd_checklist_template (checklist_type, label, sort_order, active)
       SELECT ?, ?, ?, 1 FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM tbl_ipd_checklist_template WHERE checklist_type=? AND label=? LIMIT 1)`,
      [type, label, ord, type, label]
    ).catch(() => {});
  }

  await sq(
    `INSERT IGNORE INTO tbl_ipd_surgery_template (code, name, default_charge, summary_text, active)
     SELECT 'GEN-01', 'General procedure (template)', 50000, 'Standard operative note template.', 1 FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM tbl_ipd_surgery_template WHERE code='GEN-01' LIMIT 1)`
  ).catch(() => {});

  await sq(
    `INSERT IGNORE INTO tbl_ipd_care_plan_template (name, description, active)
     SELECT 'Standard inpatient care', 'Daily vitals, medication review, physician round.', 1 FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM tbl_ipd_care_plan_template LIMIT 1)`
  ).catch(() => {});
};

module.exports.cleanAdmissionZeroDates = cleanAdmissionZeroDates;
