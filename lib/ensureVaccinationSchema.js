'use strict';

/**
 * Vaccination / immunization module — MySQL / MariaDB.
 * Idempotent; safe to run on every boot.
 */
module.exports = async function ensureVaccinationSchema(pool) {
  const q = (sql, params) => pool.query(sql, params).catch((e) => {
    const msg = String(e.message || '');
    if (/Duplicate|already exists|ER_DUP/i.test(msg)) return;
    throw e;
  });

  await q(`
    CREATE TABLE IF NOT EXISTS vaccination_vaccines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(30) NOT NULL,
      name VARCHAR(120) NOT NULL,
      description TEXT NULL,
      doses_required INT NOT NULL DEFAULT 1,
      interval_days INT NULL COMMENT 'Days between doses',
      min_age_days INT NULL,
      max_age_days INT NULL,
      route VARCHAR(30) NULL DEFAULT 'IM',
      site VARCHAR(60) NULL,
      category ENUM('routine','travel','occupational','other') NOT NULL DEFAULT 'routine',
      active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_vac_code (code),
      KEY idx_vac_active (active),
      KEY idx_vac_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS vaccination_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      vaccine_id INT NOT NULL,
      dose_number INT NOT NULL DEFAULT 1,
      administered_date DATE NOT NULL,
      batch_number VARCHAR(60) NULL,
      lot_expiry DATE NULL,
      site VARCHAR(60) NULL,
      route VARCHAR(30) NULL,
      administered_by INT NULL,
      facility_id INT NULL,
      next_dose_due DATE NULL,
      status ENUM('given','scheduled','missed','contraindicated') NOT NULL DEFAULT 'given',
      adverse_reaction TEXT NULL,
      notes TEXT NULL,
      source ENUM('vaccination','maternity','import') NOT NULL DEFAULT 'vaccination',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_vacrec_patient (patient_id),
      KEY idx_vacrec_vaccine (vaccine_id),
      KEY idx_vacrec_date (administered_date),
      KEY idx_vacrec_next (next_dose_due),
      KEY idx_vacrec_status (status),
      CONSTRAINT fk_vacrec_patient FOREIGN KEY (patient_id) REFERENCES tbl_patient(id) ON DELETE CASCADE,
      CONSTRAINT fk_vacrec_vaccine FOREIGN KEY (vaccine_id) REFERENCES vaccination_vaccines(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS vaccination_queue (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      vaccine_id INT NULL,
      appointment_date DATE NULL,
      appointment_type VARCHAR(40) NULL DEFAULT 'vaccination',
      status ENUM('waiting','in_progress','completed','cancelled') NOT NULL DEFAULT 'waiting',
      priority TINYINT NOT NULL DEFAULT 0,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_vacq_patient (patient_id),
      KEY idx_vacq_status (status),
      KEY idx_vacq_date (appointment_date),
      CONSTRAINT fk_vacq_patient FOREIGN KEY (patient_id) REFERENCES tbl_patient(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const { seedVaccinationCatalog } = require('./vaccinationCatalogSeedData');
  await seedVaccinationCatalog(pool);
};
