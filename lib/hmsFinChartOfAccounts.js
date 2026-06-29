/**
 * Chart of accounts listing — parity with PHP financials-accounts.php (tbl_fin_account).
 */
const fs = require('fs');
const path = require('path');
const { resolveCoaPath } = require('./resolveCoaPath');
const { tableExists, columnExists, finOhadaClassFromCode } = require('./hmsFinGeneralLedger');

function loadClassTitles() {
  try {
    const raw = fs.readFileSync(resolveCoaPath(), 'utf8');
    const payload = JSON.parse(raw);
    const titles = payload.class_titles || {};
    const out = {};
    for (const [k, v] of Object.entries(titles)) out[parseInt(k, 10)] = v;
    return out;
  } catch (_) {
    return {};
  }
}

async function pickLabelColumnName(pool) {
 for (const c of ['label_en', 'label', 'name', 'account_label', 'title']) {
  if (await columnExists(pool, 'tbl_fin_account', c)) return c;
 }
 return null;
}

const CLASS_NAMES = {
 1: 'Class 1 — Equity and similar',
 2: 'Class 2 — Fixed assets',
 3: 'Class 3 — Inventories',
 4: 'Class 4 — Third parties (receivables / payables)',
 5: 'Class 5 — Financial accounts',
 6: 'Class 6 — Expenses',
 7: 'Class 7 — Revenue',
 8: 'Class 8 — Other income and expenses',
 9: 'Class 9 — Analytical / off-balance',
 ...loadClassTitles(),
};

function coaClassTitle(cn) {
 return CLASS_NAMES[cn] || `Class ${cn}`;
}

/**
 * @returns {Promise<{ ok: boolean, byClass: Record<number, Array<{ code: string, label: string, account_type: string, is_posting: string, active: string }>>, error: string }>}
 */
async function finCoaGroupedByClass(pool) {
 const empty = { ok: false, byClass: {}, error: '' };
 if (!(await tableExists(pool, 'tbl_fin_account'))) {
  return { ...empty, error: 'not_installed' };
 }

 const hasCode = await columnExists(pool, 'tbl_fin_account', 'code');
 const hasAccountCode = await columnExists(pool, 'tbl_fin_account', 'account_code');
 const codeCol = hasCode ? 'code' : hasAccountCode ? 'account_code' : null;
 if (!codeCol) {
  return { ...empty, error: 'no_code_column' };
 }

 const labelCol = await pickLabelColumnName(pool);
 const labelExpr = labelCol ? labelCol : "''";

 const hasOhada = await columnExists(pool, 'tbl_fin_account', 'ohada_class');
 const hasType = await columnExists(pool, 'tbl_fin_account', 'account_type');
 const hasPosting = await columnExists(pool, 'tbl_fin_account', 'is_posting');
 const hasActive = await columnExists(pool, 'tbl_fin_account', 'active');

 const typeExpr = hasType ? 'account_type' : "'' AS account_type";
 const postExpr = hasPosting ? 'is_posting' : '0 AS is_posting';
 const activeExpr = hasActive ? 'active' : '1 AS active';
 const ohadaExpr = hasOhada ? 'ohada_class' : '0 AS ohada_class';

 const orderParts = [];
 if (hasOhada) orderParts.push('ohada_class ASC');
 orderParts.push(`${codeCol} ASC`);
 const orderBy = orderParts.join(', ');

 const whereParts = [];
 if (hasActive) whereParts.push('active = 1');
 const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

 const sql = `SELECT id, ${codeCol} AS code, ${labelExpr} AS label_disp, ${ohadaExpr} AS ohada_class, ${typeExpr}, ${postExpr}, ${activeExpr}
   FROM tbl_fin_account
   ${whereSql}
   ORDER BY ${orderBy}`;

 try {
  const [rows] = await pool.query(sql);
  const byClass = {};
  for (const row of rows || []) {
   const code = String(row.code ?? '').trim();
  let cn = parseInt(row.ohada_class, 10);
  if (!Number.isFinite(cn)) cn = 0;
  if (hasOhada && cn >= 1 && cn <= 8) {
   /* trust OHADA class column when present and in range */
  } else {
   const fc = finOhadaClassFromCode(code);
   cn = fc > 0 ? fc : cn;
  }
   if (!byClass[cn]) byClass[cn] = [];
   const isPost = parseInt(row.is_posting, 10) === 1 ? 'Yes' : 'No';
   const isAct = parseInt(row.active, 10) === 1 ? 'Yes' : 'No';
   byClass[cn].push({
    id: row.id,
    code,
    account_code: code,
    label: String(row.label_disp ?? '').trim(),
    account_label: String(row.label_disp ?? '').trim(),
    account_type: String(row.account_type ?? '').trim(),
    is_posting: isPost,
    active: isAct,
   });
  }
  return { ok: true, byClass, error: '' };
 } catch (e) {
  return { ok: false, byClass: {}, error: e && e.message ? String(e.message) : 'query_failed' };
 }
}

module.exports = {
 finCoaGroupedByClass,
 coaClassTitle
};
