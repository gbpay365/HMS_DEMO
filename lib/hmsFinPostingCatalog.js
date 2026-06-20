'use strict';

const { tableExists, columnExists } = require('./hmsFinGeneralLedger');

function normalizePostingAccount(row, codeCol, labelCol) {
  const code = String(row[codeCol] ?? row.code ?? row.account_code ?? '').trim();
  const label = String(row[labelCol] ?? row.label_en ?? row.label ?? row.name ?? row.account_label ?? '').trim();
  return {
    id: row.id,
    code,
    account_code: code,
    label_en: label,
    account_label: label,
    sort_order: row.sort_order,
  };
}

async function pickCodeColumn(pool) {
  if (await columnExists(pool, 'tbl_fin_account', 'code')) return 'code';
  if (await columnExists(pool, 'tbl_fin_account', 'account_number')) return 'account_number';
  if (await columnExists(pool, 'tbl_fin_account', 'account_code')) return 'account_code';
  return null;
}

async function pickLabelColumn(pool) {
  for (const c of ['label_en', 'name', 'label', 'account_label', 'title']) {
    if (await columnExists(pool, 'tbl_fin_account', c)) return c;
  }
  return null;
}

/**
 * Postable OHADA accounts for manual journal lines (PHP: hms_fin_posting_accounts).
 * @returns {Promise<Array<{id:number,code:string,account_code:string,label_en:string,account_label:string}>>}
 */
async function loadPostingAccounts(pool) {
  if (!(await tableExists(pool, 'tbl_fin_account'))) return [];

  const codeCol = await pickCodeColumn(pool);
  if (!codeCol) return [];

  const labelCol = await pickLabelColumn(pool);
  const labelExpr = labelCol || "''";
  const hasActive = await columnExists(pool, 'tbl_fin_account', 'active');
  const hasPosting = await columnExists(pool, 'tbl_fin_account', 'is_posting');
  const hasSort = await columnExists(pool, 'tbl_fin_account', 'sort_order');

  const where = [];
  if (hasActive) where.push('active = 1');
  if (hasPosting) where.push('is_posting = 1');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = hasSort ? `ORDER BY sort_order ASC, ${codeCol} ASC` : `ORDER BY ${codeCol} ASC`;

  try {
    const [rows] = await pool.query(
      `SELECT id, ${codeCol} AS code, ${labelExpr} AS label_disp${hasSort ? ', sort_order' : ', 0 AS sort_order'}
       FROM tbl_fin_account
       ${whereSql}
       ${orderSql}`
    );
    return (Array.isArray(rows) ? rows : [])
      .map((row) => normalizePostingAccount({ ...row, label_en: row.label_disp }, 'code', 'label_en'))
      .filter((a) => a.code);
  } catch (_) {
    try {
      const [rows2] = await pool.query(
        `SELECT id, ${codeCol} AS code FROM tbl_fin_account ${whereSql} ${orderSql} LIMIT 500`
      );
      return (Array.isArray(rows2) ? rows2 : [])
        .map((row) => normalizePostingAccount(row, 'code', null))
        .filter((a) => a.code);
    } catch (_) {
      return [];
    }
  }
}

/**
 * Typeahead search for journal / register account picker.
 */
async function searchPostingAccounts(pool, query, limit = 40) {
  const lim = Math.min(100, Math.max(5, parseInt(limit, 10) || 40));
  const all = await loadPostingAccounts(pool);
  const q = String(query || '').trim().toLowerCase();
  if (!q) return all.slice(0, lim);
  return all
    .filter(
      (a) =>
        String(a.code || '').toLowerCase().includes(q) ||
        String(a.account_label || '').toLowerCase().includes(q)
    )
    .slice(0, lim);
}

module.exports = { loadPostingAccounts, searchPostingAccounts, normalizePostingAccount };
