'use strict';

const { resolveOhadaCoaPath, loadOhadaCoaPayload } = require('./resolveOhadaCoaPath');

function loadCoaPayload() {
  return loadOhadaCoaPayload().payload;
}

function loadSeedAccounts() {
  return loadCoaPayload().accounts || [];
}

function schemaClause(pool) {
  return pool?.driver === 'postgres'
    ? "table_schema = current_schema()"
    : 'table_schema = DATABASE()';
}

async function tableExists(pool, name) {
  try {
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.tables
       WHERE ${schemaClause(pool)} AND table_name = ?`,
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
       WHERE ${schemaClause(pool)} AND table_name = ? AND column_name = ?`,
      [table, col]
    );
    return Number(r?.c || 0) > 0;
  } catch (_) {
    return false;
  }
}

let coaByCodeCache = null;

function getCoaAccountByCode(code) {
  if (!coaByCodeCache) {
    coaByCodeCache = new Map(
      loadSeedAccounts().map((row) => [String(row.code || '').trim(), row])
    );
  }
  return coaByCodeCache.get(String(code || '').trim()) || null;
}

/**
 * Upsert only the OHADA leaf accounts referenced by a journal entry (fast path for cashier sync).
 */
async function ensureFinAccountsForCodes(pool, codes, options = {}) {
  const facilityId = Math.max(1, parseInt(options.facilityId, 10) || 1);
  const uniq = [...new Set((codes || []).map((c) => String(c || '').trim()).filter(Boolean))];
  if (!uniq.length || !pool?.query) return { inserted: 0, updated: 0, missing: [] };

  if (!(await tableExists(pool, 'tbl_fin_account'))) {
    return { inserted: 0, updated: 0, missing: uniq };
  }

  let inserted = 0;
  let updated = 0;
  const missing = [];

  for (const code of uniq) {
    const item = getCoaAccountByCode(code);
    if (!item) {
      missing.push(code);
      continue;
    }

    const [[ex]] = await pool
      .query('SELECT id, active FROM tbl_fin_account WHERE code = ? OR account_number = ? LIMIT 1', [
        code,
        code,
      ])
      .catch(() => [[null]]);

    if (ex?.id && parseInt(ex.active, 10) === 1) continue;

    const { label, ohada_class, account_type, is_posting, sort_order } = item;
    if (ex?.id) {
      await pool.query(
        `UPDATE tbl_fin_account SET code=?, account_number=?, label_en=?, name=?,
         ohada_class=?, account_type=?, is_posting=?, sort_order=?, active=1, facility_id=?
         WHERE id=?`,
        [
          code,
          code,
          label,
          label,
          ohada_class,
          account_type,
          is_posting ? 1 : 0,
          sort_order || 0,
          facilityId,
          ex.id,
        ]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO tbl_fin_account
         (facility_id, code, account_number, label_en, name, ohada_class, account_type, is_posting, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          facilityId,
          code,
          code,
          label,
          label,
          ohada_class,
          account_type,
          is_posting ? 1 : 0,
          sort_order || 0,
        ]
      );
      inserted++;
    }
  }

  return { inserted, updated, missing };
}

async function dedupeFinAccountsByCode(pool) {
  if (!(await tableExists(pool, 'tbl_fin_account'))) return 0;
  if (pool?.driver === 'postgres') {
    const [r] = await pool
      .query(
        `DELETE FROM tbl_fin_account a
           USING tbl_fin_account b
          WHERE a.code = b.code AND a.id > b.id`
      )
      .catch(() => [{ rowCount: 0 }]);
    return Number(r?.rowCount || r?.affectedRows || 0);
  }
  const [dups] = await pool
    .query(
      `SELECT code, MIN(id) AS keep_id
         FROM tbl_fin_account
        WHERE active = 1
        GROUP BY code
       HAVING COUNT(*) > 1`
    )
    .catch(() => [[]]);
  let deactivated = 0;
  for (const row of dups || []) {
    const keepId = parseInt(row.keep_id, 10) || 0;
    const code = String(row.code || '').trim();
    if (!code || keepId < 1) continue;
    const [r] = await pool
      .query('UPDATE tbl_fin_account SET active = 0 WHERE active = 1 AND code = ? AND id <> ?', [code, keepId])
      .catch(() => [{ affectedRows: 0 }]);
    deactivated += Number(r?.affectedRows || r?.changedRows || 0);
  }
  return deactivated;
}

async function ensureFinAccountUniqueCodeIndex(pool) {
  if (!(await tableExists(pool, 'tbl_fin_account'))) return false;
  await dedupeFinAccountsByCode(pool);
  if (pool?.driver === 'postgres') {
    try {
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_account_code ON tbl_fin_account (code)');
      return true;
    } catch (e) {
      console.warn('COA unique index:', e.message);
      return false;
    }
  }
  await pool
    .query('ALTER TABLE tbl_fin_account ADD UNIQUE KEY uq_fin_account_code (code)')
    .catch(() => {});
  return true;
}

async function seedFinAccountsPostgres(pool, seedRows, forceReset) {
  await dedupeFinAccountsByCode(pool);
  const hasUniqueCode = await ensureFinAccountUniqueCodeIndex(pool);

  if (!hasUniqueCode) {
    if (forceReset) await pool.query('UPDATE tbl_fin_account SET active = 0').catch(() => {});
    return seedFinAccountsLoop(pool, seedRows, forceReset);
  }

  const chunkSize = 80;
  let upserted = 0;
  for (let i = 0; i < seedRows.length; i += chunkSize) {
    const slice = seedRows.slice(i, i + chunkSize);
    const tuples = [];
    const params = [];
    for (const item of slice) {
      tuples.push('(1, ?, ?, ?, ?, ?, ?, ?, ?, 1)');
      params.push(
        item.code,
        item.code,
        item.label,
        item.label,
        item.ohada_class,
        item.account_type,
        item.is_posting ? 1 : 0,
        item.sort_order || 0
      );
    }
    await pool.query(
      `INSERT INTO tbl_fin_account
         (facility_id, code, account_number, label_en, name, ohada_class, account_type, is_posting, sort_order, active)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (code) DO UPDATE SET
         account_number = EXCLUDED.account_number,
         label_en = EXCLUDED.label_en,
         name = EXCLUDED.name,
         ohada_class = EXCLUDED.ohada_class,
         account_type = EXCLUDED.account_type,
         is_posting = EXCLUDED.is_posting,
         sort_order = EXCLUDED.sort_order,
         active = 1,
         facility_id = EXCLUDED.facility_id`,
      params
    );
    upserted += slice.length;
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

  const deactivated = forceReset ? await deactivateLegacyFinAccounts(pool, seedRows.map((r) => r.code)) : 0;

  return { inserted: upserted, updated: 0, deactivated, upserted };
}

async function linkFinAccountParents(pool, seedRows) {
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
}

async function deactivateLegacyFinAccounts(pool, seedCodes) {
  let deactivated = 0;
  if (!seedCodes.length) return deactivated;
  const placeholders = seedCodes.map(() => '?').join(',');
  const [legacy] = await pool
    .query(`SELECT id FROM tbl_fin_account WHERE active = 1 AND code NOT IN (${placeholders})`, seedCodes)
    .catch(() => [[]]);
  for (const row of legacy || []) {
    await pool.query('UPDATE tbl_fin_account SET active = 0 WHERE id = ?', [row.id]).catch(() => {});
    deactivated++;
  }
  return deactivated;
}

async function seedFinAccountsLoop(pool, seedRows, forceReset) {
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
  await linkFinAccountParents(pool, seedRows);
  const deactivated = forceReset ? await deactivateLegacyFinAccounts(pool, seedRows.map((r) => r.code)) : 0;
  return { inserted, updated, deactivated };
}

async function ensureFinAccountTable(pool) {
  if (pool?.driver === 'postgres') {
    if (!(await tableExists(pool, 'tbl_fin_account'))) {
      await pool.query(`
        CREATE TABLE tbl_fin_account (
          id SERIAL PRIMARY KEY,
          facility_id INTEGER NOT NULL DEFAULT 1,
          code VARCHAR(24) NOT NULL,
          account_number VARCHAR(24) NOT NULL,
          label_en VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          ohada_class SMALLINT NOT NULL DEFAULT 0,
          account_type VARCHAR(32) NOT NULL DEFAULT 'asset',
          parent_id INTEGER NULL,
          is_posting SMALLINT NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          active SMALLINT NOT NULL DEFAULT 1
        )
      `);
      await ensureFinAccountUniqueCodeIndex(pool);
    }
    return;
  }
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

  await ensureFinAccountTable(pool);
  await dedupeFinAccountsByCode(pool);

  if (!forceReset) {
    const [[cntRow]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_fin_account WHERE active = 1').catch(() => [[{ c: 0 }]]);
    const activeCount = Number(cntRow?.c || 0);
    if (activeCount >= expectedTotal - 10) {
      return { inserted: 0, updated: 0, deactivated: 0, total: activeCount, expected: expectedTotal, skipped: true };
    }
  }

  if (pool?.driver === 'postgres') {
    const pgResult = await seedFinAccountsPostgres(pool, seedRows, forceReset);
    const [[cnt]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_fin_account WHERE active = 1').catch(() => [[{ c: 0 }]]);
    return {
      inserted: pgResult.inserted,
      updated: pgResult.updated,
      deactivated: pgResult.deactivated,
      total: Number(cnt?.c || 0),
      expected: expectedTotal,
      skipped: false,
    };
  }

  if (forceReset) {
    await pool.query('UPDATE tbl_fin_account SET active = 0').catch(() => {});
  }

  let inserted = 0;
  let updated = 0;

  const loopResult = await seedFinAccountsLoop(pool, seedRows, forceReset);
  inserted = loopResult.inserted;
  updated = loopResult.updated;

  const [[cnt]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_fin_account WHERE active = 1').catch(() => [[{ c: 0 }]]);
  return {
    inserted,
    updated,
    deactivated: loopResult.deactivated,
    total: Number(cnt?.c || 0),
    expected: expectedTotal,
    skipped: false,
  };
}

module.exports = {
  seedFinAccounts,
  ensureFinAccountsForCodes,
  ensureFinAccountTable,
  ensureFinAccountUniqueCodeIndex,
  dedupeFinAccountsByCode,
  loadCoaPayload,
  loadSeedAccounts,
  getCoaAccountByCode,
  resolveOhadaCoaPath,
  SYSCOHADA_ACCOUNTS: loadSeedAccounts(),
};
