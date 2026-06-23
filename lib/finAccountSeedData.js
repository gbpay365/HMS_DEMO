'use strict';

const { resolveOhadaCoaPath, loadOhadaCoaPayload } = require('./resolveOhadaCoaPath');

function loadCoaPayload() {
  return loadOhadaCoaPayload().payload;
}

function loadSeedAccounts() {
  return loadCoaPayload().accounts || [];
}

async function tableExists(pool, name) {
  try {
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?`,
      [name]
    );
    return Number(r?.c || 0) > 0;
  } catch (_) {
    return false;
  }
}

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

async function ensureFinAccountTable(pool) {
  if (!(await tableExists(pool, 'tbl_fin_account'))) {
    await pool.query(`
      CREATE TABLE tbl_fin_account (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT DEFAULT 1,
        code VARCHAR(24) NOT NULL,
        account_number VARCHAR(24) NOT NULL,
        label_en VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        ohada_class TINYINT NOT NULL DEFAULT 0,
        account_type VARCHAR(32) NOT NULL DEFAULT 'asset',
        parent_id INT NULL,
        is_posting TINYINT NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        active TINYINT NOT NULL DEFAULT 1,
        UNIQUE KEY uq_fin_account_code (code),
        UNIQUE KEY uq_fin_account_number (account_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    return;
  }
  if ((await columnExists(pool, 'tbl_fin_account', 'code')) && !(await columnExists(pool, 'tbl_fin_account', 'account_number'))) {
    await pool.query('ALTER TABLE tbl_fin_account ADD COLUMN account_number VARCHAR(24) NULL');
  }
  if ((await columnExists(pool, 'tbl_fin_account', 'label_en')) && !(await columnExists(pool, 'tbl_fin_account', 'name'))) {
    await pool.query('ALTER TABLE tbl_fin_account ADD COLUMN name VARCHAR(255) NULL');
  }
  if (!(await columnExists(pool, 'tbl_fin_account', 'facility_id'))) {
    await pool.query('ALTER TABLE tbl_fin_account ADD COLUMN facility_id INT DEFAULT 1');
  }
  if (!(await columnExists(pool, 'tbl_fin_account', 'active'))) {
    await pool.query('ALTER TABLE tbl_fin_account ADD COLUMN active TINYINT NOT NULL DEFAULT 1');
  }
  await pool
    .query(`
    UPDATE tbl_fin_account
    SET account_number = COALESCE(NULLIF(account_number,''), code),
        name = COALESCE(NULLIF(name,''), label_en)
    WHERE account_number IS NULL OR account_number = '' OR name IS NULL OR name = ''
  `)
    .catch(() => {});
}

/**
 * Seed full Core_Account OHADA 6-digit chart (ohada_english_6digit_coa.json).
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ forceUpdate?: boolean, forceReset?: boolean }} [options]
 */
async function seedFinAccounts(pool, options = {}) {
  const forceReset = Boolean(options.forceReset || options.forceUpdate);
  const seedRows = loadSeedAccounts();
  const expectedTotal = seedRows.length;
  const seedCodes = seedRows.map((r) => r.code);

  await ensureFinAccountTable(pool);

  if (!forceReset) {
    const [[cntRow]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_fin_account WHERE active = 1').catch(() => [[{ c: 0 }]]);
    const activeCount = Number(cntRow?.c || 0);
    if (activeCount >= expectedTotal - 10) {
      return { inserted: 0, updated: 0, deactivated: 0, total: activeCount, expected: expectedTotal, skipped: true };
    }
  }

  if (forceReset) {
    await pool.query('UPDATE tbl_fin_account SET active = 0').catch(() => {});
  }

  let inserted = 0;
  let updated = 0;

  for (const item of seedRows) {
    const { code, label, ohada_class, account_type, is_posting, sort_order } = item;
    const [[ex]] = await pool
      .query('SELECT id FROM tbl_fin_account WHERE code = ? OR account_number = ? LIMIT 1', [code, code])
      .catch(() => [[null]]);

    if (ex?.id) {
      await pool.query(
        `UPDATE tbl_fin_account SET code=?, account_number=?, label_en=?, name=?,
         ohada_class=?, account_type=?, is_posting=?, sort_order=?, active=1, facility_id=1
         WHERE id=?`,
        [code, code, label, label, ohada_class, account_type, is_posting ? 1 : 0, sort_order, ex.id]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO tbl_fin_account
         (facility_id, code, account_number, label_en, name, ohada_class, account_type, is_posting, sort_order, active)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [code, code, label, label, ohada_class, account_type, is_posting ? 1 : 0, sort_order]
      );
      inserted++;
    }
  }

  const [allRows] = await pool.query('SELECT id, code FROM tbl_fin_account WHERE active = 1').catch(() => [[]]);
  const codeToId = new Map((allRows || []).map((r) => [String(r.code), r.id]));

  for (const item of seedRows) {
    const parentCode = item.parent_code;
    if (!parentCode) continue;
    const accId = codeToId.get(item.code);
    const parentId = codeToId.get(parentCode);
    if (accId && parentId) {
      await pool.query('UPDATE tbl_fin_account SET parent_id = ? WHERE id = ?', [parentId, accId]).catch(() => {});
    }
  }

  let deactivated = 0;
  if (forceReset && seedCodes.length) {
    const placeholders = seedCodes.map(() => '?').join(',');
    const [legacy] = await pool
      .query(`SELECT id FROM tbl_fin_account WHERE active = 1 AND code NOT IN (${placeholders})`, seedCodes)
      .catch(() => [[]]);
    for (const row of legacy || []) {
      await pool.query('UPDATE tbl_fin_account SET active = 0 WHERE id = ?', [row.id]).catch(() => {});
      deactivated++;
    }
  }

  const [[cnt]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_fin_account WHERE active = 1').catch(() => [[{ c: 0 }]]);
  return {
    inserted,
    updated,
    deactivated,
    total: Number(cnt?.c || 0),
    expected: expectedTotal,
    skipped: false,
  };
}

module.exports = {
  seedFinAccounts,
  ensureFinAccountTable,
  loadCoaPayload,
  loadSeedAccounts,
  resolveOhadaCoaPath,
  SYSCOHADA_ACCOUNTS: loadSeedAccounts(),
};
