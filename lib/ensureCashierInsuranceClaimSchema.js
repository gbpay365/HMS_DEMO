'use strict';

/** Insurance claim fields for cashier Odoo modal. */
async function ensureCashierInsuranceClaimSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_insurance_claim (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT DEFAULT 1,
      patient_id INT NOT NULL,
      carrier_id INT NOT NULL,
      diagnosis VARCHAR(200) DEFAULT NULL,
      billed_amount DECIMAL(12,2) DEFAULT 0,
      approved_amount DECIMAL(12,2) DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      policy_number VARCHAR(120) DEFAULT NULL,
      linked_ticket_code VARCHAR(48) DEFAULT NULL,
      ticket_id INT DEFAULT NULL,
      cover_type VARCHAR(40) DEFAULT 'full_cover',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_patient (patient_id),
      KEY idx_carrier (carrier_id),
      KEY idx_status (status),
      KEY idx_ticket (ticket_id)
    )
  `).catch(() => {});

  await pool.query('ALTER TABLE tbl_insurance_claim ADD COLUMN IF NOT EXISTS approved_amount DECIMAL(12,2) DEFAULT NULL').catch(() => {});
  await pool.query('ALTER TABLE tbl_insurance_claim ADD COLUMN IF NOT EXISTS policy_number VARCHAR(120) DEFAULT NULL').catch(() => {});
  await pool.query('ALTER TABLE tbl_insurance_claim ADD COLUMN IF NOT EXISTS linked_ticket_code VARCHAR(48) DEFAULT NULL').catch(() => {});
  await pool.query('ALTER TABLE tbl_insurance_claim ADD COLUMN IF NOT EXISTS ticket_id INT DEFAULT NULL').catch(() => {});
  await pool.query("ALTER TABLE tbl_insurance_claim ADD COLUMN IF NOT EXISTS cover_type VARCHAR(40) DEFAULT 'full_cover'").catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_insurance_carrier (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      phone VARCHAR(40) DEFAULT NULL,
      email VARCHAR(120) DEFAULT NULL,
      status TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => {});

  const seeds = [
    ['CNPS', 'CNPS'],
    ['ACTIVA', 'Activa Assurance'],
    ['SAHAM', 'SAHAM Assurance'],
    ['AXA', 'AXA'],
    ['ALLIANZ', 'Allianz'],
  ];
  for (const [code, name] of seeds) {
    await pool
      .query('INSERT IGNORE INTO tbl_insurance_carrier (code, name, status, created_at) VALUES (?, ?, 1, NOW())', [
        code,
        name,
      ])
      .catch(() => {});
  }
}

module.exports = { ensureCashierInsuranceClaimSchema };
