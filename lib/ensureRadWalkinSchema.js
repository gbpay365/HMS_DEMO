'use strict';

/** Radiology walk-in queue — lightweight registration before cashier payment. */
async function columnExists(pool, table, col) {
  try {
    if (pool?.driver === 'postgres') {
      const [[r]] = await pool.query(
        `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = ? AND column_name = ? LIMIT 1`,
        [table, col]
      );
      return !!(r && r.ok);
    }
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
  const sql =
    pool?.driver === 'postgres'
      ? `ALTER TABLE ${table} ADD COLUMN ${ddl}`
      : `ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`;
  await pool.query(sql).catch(() => {});
}

module.exports = async function ensureRadWalkinSchema(pool) {
  if (!pool || !pool.query) return;

  if (pool.driver === 'postgres') {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_rad_walkin (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        registration_no VARCHAR(32) NOT NULL,
        first_name VARCHAR(120) NOT NULL,
        last_name VARCHAR(120) NOT NULL DEFAULT '',
        mobile VARCHAR(40) NOT NULL,
        referrer_id INTEGER DEFAULT NULL,
        credit_provider_id INTEGER DEFAULT NULL,
        priority VARCHAR(16) NOT NULL DEFAULT 'normal',
        visit_type VARCHAR(8) NOT NULL DEFAULT 'OP',
        notes VARCHAR(500) DEFAULT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'pending_payment',
        patient_id INTEGER DEFAULT NULL,
        payment_ticket_id INTEGER DEFAULT NULL,
        radiology_request_id INTEGER DEFAULT NULL,
        service_code VARCHAR(64) DEFAULT NULL,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_by INTEGER DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        paid_at TIMESTAMP DEFAULT NULL
      )
    `).catch(() => {});
    await pool
      .query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_rad_walkin_reg_no ON tbl_rad_walkin (registration_no)`)
      .catch(() => {});
    await pool
      .query(`CREATE INDEX IF NOT EXISTS idx_rad_walkin_status ON tbl_rad_walkin (status)`)
      .catch(() => {});
    await pool
      .query(`CREATE INDEX IF NOT EXISTS idx_rad_walkin_created ON tbl_rad_walkin (created_at)`)
      .catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_rad_walkin_line (
        id SERIAL PRIMARY KEY,
        walkin_id INTEGER NOT NULL,
        service_catalog_id INTEGER NOT NULL,
        test_name VARCHAR(255) NOT NULL,
        unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 1,
        opd_order_item_id INTEGER DEFAULT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `).catch(() => {});
    await pool
      .query(`CREATE INDEX IF NOT EXISTS idx_rad_walkin_line_walkin ON tbl_rad_walkin_line (walkin_id)`)
      .catch(() => {});

    await addColumn(pool, 'tbl_payment_ticket', 'source_module VARCHAR(32) DEFAULT NULL');
    await addColumn(pool, 'tbl_payment_ticket', 'source_pk INTEGER DEFAULT NULL');
    return;
  }

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
