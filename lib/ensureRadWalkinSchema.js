'use strict';

/** Radiology walk-in queue — lightweight registration before cashier payment. */
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

module.exports = async function ensureRadWalkinSchema(pool) {
  if (pool?.driver === 'postgres') return;
  const sq = (s, p = []) => pool.query(s, p);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_rad_walkin (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      registration_no VARCHAR(32) NOT NULL,
      first_name VARCHAR(120) NOT NULL,
      last_name VARCHAR(120) NOT NULL DEFAULT '',
      mobile VARCHAR(40) NOT NULL,
      referrer_id INT DEFAULT NULL,
      credit_provider_id INT DEFAULT NULL,
      priority ENUM('normal','emergency') NOT NULL DEFAULT 'normal',
      visit_type VARCHAR(8) NOT NULL DEFAULT 'OP',
      notes VARCHAR(500) DEFAULT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending_payment',
      patient_id INT DEFAULT NULL,
      payment_ticket_id INT DEFAULT NULL,
      radiology_request_id INT DEFAULT NULL,
      service_code VARCHAR(64) DEFAULT NULL,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME DEFAULT NULL,
      UNIQUE KEY uq_rad_reg_no (registration_no),
      KEY idx_status (status),
      KEY idx_mobile (mobile(20)),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_rad_walkin_line (
      id INT AUTO_INCREMENT PRIMARY KEY,
      walkin_id INT NOT NULL,
      service_catalog_id INT NOT NULL,
      test_name VARCHAR(255) NOT NULL,
      unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
      quantity INT NOT NULL DEFAULT 1,
      opd_order_item_id INT DEFAULT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      KEY idx_walkin (walkin_id),
      KEY idx_catalog (service_catalog_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  for (const col of [
    "source_module VARCHAR(32) DEFAULT NULL",
    'source_pk INT DEFAULT NULL',
  ]) {
    await addColumn(pool, 'tbl_payment_ticket', col);
  }
};
