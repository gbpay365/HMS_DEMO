'use strict';

/** Waiting screen, prescription QR verify, doctor commission rules. */
module.exports = async function ensureHmsExtendedSchema(pool) {
  const q = (sql, p = []) => pool.query(sql, p).catch(() => {});

  await q(`
    CREATE TABLE IF NOT EXISTS tbl_waiting_screen_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      welcome_message VARCHAR(255) DEFAULT 'Welcome — please wait to be called',
      show_patient_name TINYINT(1) NOT NULL DEFAULT 1,
      show_doctor_name TINYINT(1) NOT NULL DEFAULT 1,
      show_room TINYINT(1) NOT NULL DEFAULT 1,
      show_ticket_number TINYINT(1) NOT NULL DEFAULT 1,
      refresh_seconds INT NOT NULL DEFAULT 5,
      chime_enabled TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query('ALTER TABLE tbl_waiting_screen_config ADD COLUMN chime_enabled TINYINT(1) NOT NULL DEFAULT 1').catch(() => {});
  await pool.query('ALTER TABLE tbl_waiting_screen_config ADD COLUMN tts_enabled TINYINT(1) NOT NULL DEFAULT 1').catch(() => {});

  await q('INSERT IGNORE INTO tbl_waiting_screen_config (id, welcome_message) VALUES (1, ?)', [
    'Welcome — your doctor will see you shortly',
  ]);

  await q('ALTER TABLE tbl_prescription ADD COLUMN verify_token VARCHAR(64) DEFAULT NULL').catch(() => {});
  await q('ALTER TABLE tbl_prescription ADD COLUMN verify_token_at DATETIME DEFAULT NULL').catch(() => {});
  await q('ALTER TABLE tbl_prescription ADD COLUMN verified_at DATETIME DEFAULT NULL').catch(() => {});
  await q('ALTER TABLE tbl_prescription ADD COLUMN verified_by INT DEFAULT NULL').catch(() => {});
  await q(
    'CREATE UNIQUE INDEX uk_rx_verify_token ON tbl_prescription (verify_token)'
  ).catch(() => {});

  await q('ALTER TABLE tbl_consultation ADD COLUMN verify_token VARCHAR(64) DEFAULT NULL').catch(() => {});
  await q('ALTER TABLE tbl_consultation ADD COLUMN verify_token_at DATETIME DEFAULT NULL').catch(() => {});
  await q('CREATE UNIQUE INDEX uk_consult_verify_token ON tbl_consultation (verify_token)').catch(() => {});

  await q(`
    CREATE TABLE IF NOT EXISTS tbl_doctor_commission_rule (
      id INT AUTO_INCREMENT PRIMARY KEY,
      doctor_id INT NOT NULL,
      rule_name VARCHAR(120) NOT NULL,
      service_kind ENUM('consultation','laboratory','radiology','pharmacy','all') NOT NULL DEFAULT 'consultation',
      rate_type ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
      rate_value DECIMAL(10,2) NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      notes VARCHAR(500) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_comm_doc (doctor_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await q(`
    CREATE TABLE IF NOT EXISTS tbl_doctor_commission_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      doctor_id INT NOT NULL,
      patient_id INT DEFAULT NULL,
      source_type VARCHAR(40) NOT NULL,
      source_id INT DEFAULT NULL,
      base_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      rule_id INT DEFAULT NULL,
      notes VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_comm_log_doc (doctor_id),
      KEY idx_comm_log_date (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};
