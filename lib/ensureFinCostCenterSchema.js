'use strict';

const { allSeedRows } = require('./finCostCenterSeedData');

async function tableExists(pool, table) {
  try {
    if (pool.driver === 'postgres') {
      const [[r]] = await pool.query(
        `SELECT 1 AS ok FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
        [table]
      );
      return !!(r && r.ok);
    }
    const [[r]] = await pool.query(
      `SELECT 1 AS ok FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table]
    );
    return !!(r && r.ok);
  } catch (_) {
    return false;
  }
}

async function columnExists(pool, table, col) {
  try {
    if (pool.driver === 'postgres') {
      const [[r]] = await pool.query(
        `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
        [table, col]
      );
      return !!(r && r.ok);
    }
    const [[r]] = await pool.query(
      `SELECT 1 AS ok FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, col]
    );
    return !!(r && r.ok);
  } catch (_) {
    return false;
  }
}

async function ensureCostCenterTable(pool) {
  if (pool.driver === 'postgres') {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_cost_center (
        id SERIAL PRIMARY KEY,
        code VARCHAR(24) NOT NULL,
        label_en VARCHAR(180) NOT NULL DEFAULT '',
        active SMALLINT NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        ohada_class SMALLINT,
        related_account_code VARCHAR(32),
        UNIQUE (code)
      )
    `).catch(() => {});
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_fin_cost_center (
        id INT NOT NULL AUTO_INCREMENT,
        code VARCHAR(24) NOT NULL,
        label_en VARCHAR(180) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        UNIQUE KEY uq_fin_cc_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});
  }

  if (!(await columnExists(pool, 'tbl_fin_cost_center', 'ohada_class'))) {
    const def = pool.driver === 'postgres' ? 'SMALLINT' : 'TINYINT NULL';
    await pool.query(`ALTER TABLE tbl_fin_cost_center ADD COLUMN ohada_class ${def}`).catch(() => {});
  }
  if (!(await columnExists(pool, 'tbl_fin_cost_center', 'related_account_code'))) {
    const def = pool.driver === 'postgres' ? 'VARCHAR(32)' : 'VARCHAR(32) NULL';
    await pool.query(`ALTER TABLE tbl_fin_cost_center ADD COLUMN related_account_code ${def}`).catch(() => {});
  }
}

async function seedCostCentersIfEmpty(pool) {
  if (!(await tableExists(pool, 'tbl_fin_cost_center'))) return;
  let count = 0;
  try {
    const [[r]] = await pool.query('SELECT COUNT(*) AS n FROM tbl_fin_cost_center');
    count = parseInt(r?.n, 10) || 0;
  } catch (_) {
    return;
  }
  if (count > 0) return;

  for (const row of allSeedRows()) {
    const code = String(row.code || '').trim().toUpperCase().slice(0, 24);
    const name = String(row.name || '').trim().slice(0, 180);
    if (!code || !name) continue;
    const sort = parseInt(row.sort_order, 10) || 0;
    const ohada = row.ohada_class != null ? parseInt(row.ohada_class, 10) || null : null;
    const rel = row.related_account_code ? String(row.related_account_code).slice(0, 32) : null;
    if (pool.driver === 'postgres') {
      await pool.query(
        `INSERT INTO tbl_fin_cost_center (code, label_en, active, sort_order, ohada_class, related_account_code)
         VALUES ($1, $2, 1, $3, $4, $5)
         ON CONFLICT (code) DO NOTHING`,
        [code, name, sort, ohada, rel]
      ).catch(() => {});
    } else {
      await pool.query(
        `INSERT IGNORE INTO tbl_fin_cost_center (code, label_en, active, sort_order, ohada_class, related_account_code)
         VALUES (?, ?, 1, ?, ?, ?)`,
        [code, name, sort, ohada, rel]
      ).catch(() => {});
    }
  }
}

async function ensureFinCostCenterSchema(pool) {
  if (!pool || !pool.query) return;
  await ensureCostCenterTable(pool);
  await seedCostCentersIfEmpty(pool);
}

module.exports = ensureFinCostCenterSchema;
