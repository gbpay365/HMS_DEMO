'use strict';

/**
 * SYSCOHADA hospital chart — parity with HMS_Python fin_account_seed.py / Test_DB.sql
 */
const ACCOUNTS = [
  ['101000', 'Share capital', 1, 'equity', 101],
  ['106000', 'Legal reserves', 1, 'equity', 106],
  ['121000', 'Retained earnings (prior periods)', 1, 'equity', 121],
  ['129000', 'Current year result (profit / loss)', 1, 'equity', 129],
  ['201000', 'Land and buildings', 2, 'asset', 201],
  ['205000', 'Medical equipment and fixtures', 2, 'asset', 205],
  ['218000', 'Other tangible fixed assets', 2, 'asset', 218],
  ['281000', 'Accumulated depreciation — buildings', 2, 'asset', 281],
  ['285000', 'Accumulated depreciation — equipment', 2, 'asset', 285],
  ['311000', 'Medical supplies inventory', 3, 'asset', 311],
  ['315000', 'Pharmacy inventory', 3, 'asset', 315],
  ['401000', 'Suppliers and trade payables', 4, 'liability', 401],
  ['411000', 'Patient receivables (debtors)', 4, 'asset', 411],
  ['421000', 'Staff payables (salaries payable)', 4, 'liability', 421],
  ['431000', 'Social charges and statutory payables', 4, 'liability', 431],
  ['441000', 'State — taxes and duties payable', 4, 'liability', 441],
  ['512000', 'Bank — main operating account', 5, 'asset', 512],
  ['531000', 'Cash on hand (tills)', 5, 'asset', 531],
  ['521000', 'Banks — patient collection', 5, 'asset', 521],
  ['571000', 'Cash — patient collection', 5, 'asset', 571],
  ['601000', 'Medical consumables and supplies expense', 6, 'expense', 601],
  ['602000', 'Pharmaceutical purchases expense', 6, 'expense', 602],
  ['604000', 'Energy and utilities expense', 6, 'expense', 604],
  ['622000', 'Rent and lease expense', 6, 'expense', 622],
  ['641000', 'Staff salaries and wages expense', 6, 'expense', 641],
  ['661000', 'External services and consultancy expense', 6, 'expense', 661],
  ['671000', 'Bank and financial charges expense', 6, 'expense', 671],
  ['681000', 'Depreciation expense', 6, 'expense', 681],
  ['701000', 'Hospital care revenue (consultations and admissions)', 7, 'income', 701],
  ['702000', 'Laboratory services revenue', 7, 'income', 702],
  ['703000', 'Radiology and imaging revenue', 7, 'income', 703],
  ['704000', 'Pharmacy sales revenue', 7, 'income', 704],
  ['706000', 'Healthcare services revenue', 7, 'income', 706],
  ['791000', 'Other operating income', 7, 'income', 791],
  ['811000', 'Exceptional expenses (non-recurring)', 8, 'expense', 811],
  ['891000', 'Exceptional income (non-recurring)', 8, 'income', 891],
];

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
  await pool.query(`
    UPDATE tbl_fin_account
    SET account_number = COALESCE(NULLIF(account_number,''), code),
        name = COALESCE(NULLIF(name,''), label_en)
    WHERE account_number IS NULL OR account_number = '' OR name IS NULL OR name = ''
  `).catch(() => {});
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ forceUpdate?: boolean }} [options]
 */
async function seedFinAccounts(pool, options = {}) {
  const forceUpdate = Boolean(options.forceUpdate);
  await ensureFinAccountTable(pool);
  let inserted = 0;
  let updated = 0;
  for (const [code, label, ohada, atype, sort] of ACCOUNTS) {
    const [[ex]] = await pool.query(
      'SELECT id FROM tbl_fin_account WHERE code = ? OR account_number = ? LIMIT 1',
      [code, code]
    ).catch(() => [[null]]);
    if (ex?.id && !forceUpdate) continue;
    if (ex?.id && forceUpdate) {
      await pool.query(
        `UPDATE tbl_fin_account SET code=?, account_number=?, label_en=?, name=?,
         ohada_class=?, account_type=?, is_posting=1, sort_order=?, active=1
         WHERE id=?`,
        [code, code, label, label, ohada, atype, sort, ex.id]
      );
      updated++;
      continue;
    }
    await pool.query(
      `INSERT INTO tbl_fin_account
       (facility_id, code, account_number, label_en, name, ohada_class, account_type, is_posting, sort_order, active)
       VALUES (1, ?, ?, ?, ?, ?, ?, 1, ?, 1)`,
      [code, code, label, label, ohada, atype, sort]
    );
    inserted++;
  }
  const [[cnt]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_fin_account').catch(() => [[{ c: 0 }]]);
  return { inserted, updated, total: Number(cnt?.c || 0) };
}

module.exports = { seedFinAccounts, ensureFinAccountTable, SYSCOHADA_ACCOUNTS: ACCOUNTS };
