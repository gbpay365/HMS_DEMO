/**
 * Nurse → pharmacy requests for ward materials and drugs (non-patient-specific stock pull).
 */
module.exports = async function ensureNursingSupplyRequestSchema(pool) {
  if (!pool || !pool.query) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_nursing_supply_request (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      requested_by INT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      notes TEXT NULL,
      pharmacy_seen_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_nsr_status (status),
      KEY idx_nsr_created (created_at),
      KEY idx_nsr_reqby (requested_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_nursing_supply_request_line (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      line_type VARCHAR(16) NOT NULL DEFAULT 'material',
      item_name VARCHAR(255) NOT NULL,
      quantity VARCHAR(64) NULL,
      remarks VARCHAR(500) NULL,
      KEY idx_nsrl_req (request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
  await pool.query(
    'ALTER TABLE tbl_nursing_supply_request_line ADD COLUMN IF NOT EXISTS inventory_item_id INT NULL DEFAULT NULL'
  ).catch(() => {});
  await pool.query(
    'ALTER TABLE tbl_nursing_supply_request_line ADD COLUMN IF NOT EXISTS qty_on_hand_snapshot INT NULL DEFAULT NULL'
  ).catch(() => {});
  await pool.query(
    'ALTER TABLE tbl_nursing_supply_request ADD COLUMN IF NOT EXISTS admission_id INT NULL DEFAULT NULL'
  ).catch(() => {});
  await pool.query(
    'ALTER TABLE tbl_nursing_supply_request ADD COLUMN IF NOT EXISTS ward_name VARCHAR(120) NULL DEFAULT NULL'
  ).catch(() => {});
  await pool.query(
    'ALTER TABLE tbl_nursing_supply_request ADD COLUMN IF NOT EXISTS patient_label VARCHAR(200) NULL DEFAULT NULL'
  ).catch(() => {});
  await pool.query(
    'ALTER TABLE tbl_nursing_supply_request ADD COLUMN IF NOT EXISTS stock_deducted_at DATETIME NULL DEFAULT NULL'
  ).catch(() => {});
  await pool.query(
    'ALTER TABLE tbl_nursing_supply_request ADD COLUMN IF NOT EXISTS fulfilled_by INT NULL DEFAULT NULL'
  ).catch(() => {});
  await pool.query(
    'ALTER TABLE tbl_nursing_supply_request_line ADD COLUMN IF NOT EXISTS qty_deducted INT NULL DEFAULT NULL'
  ).catch(() => {});
};
