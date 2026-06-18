'use strict';

/**
 * Unified hospital death registry — OPD, IPD, ER, Maternity.
 * Migrates legacy tbl_ipd_death_registry rows on first boot.
 */
module.exports = async function ensureDeathRegistrySchema(pool) {
  const q = (sql) =>
    pool.query(sql).catch((e) => {
      const msg = String(e.message || '');
      if (/Duplicate|already exists|ER_DUP/i.test(msg)) return;
      throw e;
    });

  await q(`
    CREATE TABLE IF NOT EXISTS tbl_death_registry (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      source_module ENUM('ipd','er','opd','maternity') NOT NULL DEFAULT 'ipd',
      admission_id INT DEFAULT NULL,
      visit_id INT DEFAULT NULL,
      maternity_patient_id INT DEFAULT NULL,
      delivery_record_id INT DEFAULT NULL,
      date_of_death DATE NOT NULL,
      time_of_death TIME DEFAULT NULL,
      cause_of_death VARCHAR(500) DEFAULT NULL,
      certifying_doctor_id INT DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      reported_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_admission (admission_id),
      UNIQUE KEY uniq_visit (visit_id),
      KEY idx_patient (patient_id),
      KEY idx_module (source_module),
      KEY idx_date (date_of_death)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  async function patientCol(name, def) {
    const [[row]] = await pool
      .query(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_patient' AND COLUMN_NAME = ?`,
        [name]
      )
      .catch(() => [[{ c: 0 }]]);
    if (parseInt(row?.c, 10) > 0) return;
    await q(`ALTER TABLE tbl_patient ADD COLUMN ${name} ${def}`);
  }

  await patientCol('is_deceased', 'TINYINT(1) NOT NULL DEFAULT 0');
  await patientCol('date_of_death', 'DATE DEFAULT NULL');

  const [[legacy]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_ipd_death_registry'`
    )
    .catch(() => [[{ c: 0 }]]);

  if (parseInt(legacy?.c, 10) > 0) {
    await q(`
      INSERT INTO tbl_death_registry (
        patient_id, source_module, admission_id, date_of_death, time_of_death,
        cause_of_death, certifying_doctor_id, notes, reported_by, created_at
      )
      SELECT d.patient_id, 'ipd', d.admission_id, d.date_of_death, d.time_of_death,
             d.cause_of_death, d.certifying_doctor_id, d.notes, d.reported_by, d.created_at
      FROM tbl_ipd_death_registry d
      WHERE NOT EXISTS (
        SELECT 1 FROM tbl_death_registry r WHERE r.admission_id = d.admission_id
      )
    `).catch(() => {});
  }
};
