/**
 * General ledger report queries — parity with PHP includes/financials.php
 * and includes/financials_reports_data.php (hms_fin_gl_lines, opening balances, etc.).
 */
const { toIsoDatePart, formatDisplayDate } = require('./hmsFormatDate');

async function tableExists(pool, tableName) {
 try {
  const [[r]] = await pool.query(
   `SELECT 1 AS ok FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
   [tableName]
  );
  return !!(r && r.ok);
 } catch (e) {
  return false;
 }
}

async function columnExists(pool, tableName, columnName) {
 try {
  const [[r]] = await pool.query(
   `SELECT 1 AS ok FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
   [tableName, columnName]
  );
  return !!(r && r.ok);
 } catch (e) {
  return false;
 }
}

async function finTablesOk(pool) {
 if (!(await tableExists(pool, 'tbl_fin_journal_header'))) return false;
 if (!(await tableExists(pool, 'tbl_fin_journal_line'))) return false;
 return true;
}

/**
 * @returns {Promise<{ join: string, code: string, label: string }>}
 */
async function finJlReportSqlFragments(pool) {
 const hasJlCode = await columnExists(pool, 'tbl_fin_journal_line', 'account_code');
 const hasJlLabel = await columnExists(pool, 'tbl_fin_journal_line', 'account_label');
 const hasJlAcctId = await columnExists(pool, 'tbl_fin_journal_line', 'account_id');
 const hasFa = await tableExists(pool, 'tbl_fin_account');
 let join = '';
 let faCode = null;
 let faLabel = null;
 if (hasFa) {
  for (const c of ['code', 'account_code']) {
   if (await columnExists(pool, 'tbl_fin_account', c)) {
    faCode = c;
    break;
   }
  }
  for (const c of ['label', 'name', 'account_label', 'title']) {
   if (await columnExists(pool, 'tbl_fin_account', c)) {
    faLabel = c;
    break;
   }
  }
 }
 if (hasFa && hasJlAcctId && faCode) {
  join = ' LEFT JOIN tbl_fin_account fa ON fa.id = jl.account_id ';
 }
 let code;
 if (hasJlCode && join) {
  code = `COALESCE(NULLIF(TRIM(jl.account_code), ''), fa.${faCode}, '')`;
 } else if (hasJlCode) {
  code = 'jl.account_code';
 } else if (join && faCode) {
  code = `COALESCE(fa.${faCode}, CAST(jl.account_id AS CHAR), '')`;
 } else {
  code = "''";
 }
 let label;
 if (hasJlLabel && join && faLabel) {
  label = `COALESCE(NULLIF(TRIM(jl.account_label), ''), fa.${faLabel}, '')`;
 } else if (hasJlLabel) {
  label = 'jl.account_label';
 } else if (join && faLabel) {
  label = `COALESCE(fa.${faLabel}, '')`;
 } else {
  label = "''";
 }
 return { join, code, label };
}

function labelPatientContext(s) {
 const x = String(s ?? '');
 const out = x.replace(/\b(customer|client)\b/gi, 'Patient');
 return out;
}

function isoDate(d) {
 return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/**
 * @returns {Promise<Record<string, number>>}
 */
async function finOpeningBalancesBefore(pool, facilityId, beforeDate) {
 const d = isoDate(beforeDate);
 if (!d || !(await finTablesOk(pool))) return {};
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const f = await finJlReportSqlFragments(pool);
 const sql = `SELECT (${f.code}) AS c, COALESCE(SUM(jl.debit - jl.credit), 0) AS b
   FROM tbl_fin_journal_line jl
   INNER JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
   ${f.join}
   WHERE h.facility_id = ? AND h.entry_date < ?
   GROUP BY (${f.code})`;
 try {
  const [rows] = await pool.query(sql, [fid, d]);
  const out = {};
  for (const row of rows || []) {
   const code = String(row.c ?? '').trim();
   if (code) out[code] = Math.round((parseFloat(row.b) || 0) * 100) / 100;
  }
  return out;
 } catch (e) {
  return {};
 }
}

/**
 * @returns {Promise<Array<{ entry_date: string, reference: string, narration: string, source_type: string, account_code: string, account_label: string, debit: number, credit: number, journal_id: number, line_id: number }>>}
 */
async function finGlLines(pool, facilityId, dateFrom, dateTo, accountPrefix) {
 const d1 = isoDate(dateFrom);
 const d2 = isoDate(dateTo);
 if (!d1 || !d2 || !(await finTablesOk(pool))) return [];
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const f = await finJlReportSqlFragments(pool);
 const pfx = accountPrefix != null && String(accountPrefix).trim() !== '' ? String(accountPrefix).trim() : '';
 const filter = pfx ? ` AND (${f.code}) LIKE ? ` : '';
 const params = pfx ? [fid, d1, d2, `${pfx}%`] : [fid, d1, d2];
 const sql = `SELECT DATE_FORMAT(h.entry_date, '%Y-%m-%d') AS entry_date_raw,
     h.reference, h.narration, h.source_type, h.id AS journal_id,
     jl.id AS line_id, (${f.code}) AS account_code, (${f.label}) AS account_label, jl.debit, jl.credit
   FROM tbl_fin_journal_line jl
   INNER JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
   ${f.join}
   WHERE h.facility_id = ? AND h.entry_date BETWEEN ? AND ? ${filter}
   ORDER BY (${f.code}) ASC, h.entry_date ASC, h.id ASC, jl.id ASC`;
 try {
  const [rows] = await pool.query(sql, params);
  return (rows || []).map((row) => ({
   entry_date: formatDisplayDate(row.entry_date_raw || row.entry_date),
   entry_date_iso: toIsoDatePart(row.entry_date_raw || row.entry_date),
   reference: String(row.reference ?? ''),
   narration: String(row.narration ?? ''),
   source_type: String(row.source_type ?? ''),
   journal_id: parseInt(row.journal_id, 10) || 0,
   line_id: parseInt(row.line_id, 10) || 0,
   account_code: String(row.account_code ?? ''),
   account_label: String(row.account_label ?? ''),
   debit: Math.round((parseFloat(row.debit) || 0) * 100) / 100,
   credit: Math.round((parseFloat(row.credit) || 0) * 100) / 100
  }));
 } catch (e) {
  return [];
 }
}

/** @returns {Promise<{ min: string, max: string } | null>} */
async function finJournalEntryDateBounds(pool, facilityId) {
 if (!(await finTablesOk(pool))) return null;
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 try {
  const [[r]] = await pool.query(
   'SELECT MIN(entry_date) AS a, MAX(entry_date) AS b FROM tbl_fin_journal_header WHERE facility_id = ?',
   [fid]
  );
  const a = String(r?.a ?? '').trim().slice(0, 10);
  const b = String(r?.b ?? '').trim().slice(0, 10);
  if (!isoDate(a) || !isoDate(b)) return null;
  return { min: a, max: b };
 } catch (e) {
  return null;
 }
}

/** @returns {Promise<{ total: number, count: number }>} */
async function finOpsFiscalReceiptsPeriod(pool, facilityId, dateFrom, dateTo) {
 const d1 = isoDate(dateFrom);
 const d2 = isoDate(dateTo);
 if (!d1 || !d2) return { total: 0, count: 0 };
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 if (!(await tableExists(pool, 'tbl_billing_document'))) return { total: 0, count: 0 };
 try {
  const [[r]] = await pool.query(
   `SELECT COUNT(*) AS c, COALESCE(SUM(total_amount), 0) AS s FROM tbl_billing_document
    WHERE facility_id = ? AND doc_type = 'receipt' AND DATE(created_at) BETWEEN ? AND ?`,
   [fid, d1, d2]
  );
  return {
   total: Math.round((parseFloat(r?.s) || 0) * 100) / 100,
   count: parseInt(r?.c, 10) || 0
  };
 } catch (e) {
  return { total: 0, count: 0 };
 }
}

/** SYSCOHADA account class 1–7 from first digit of account code (PHP hms_fin_ohada_class_from_code). */
function finOhadaClassFromCode(accountCode) {
 const c = String(accountCode ?? '').trim();
 if (!c) return 0;
 const d = c[0];
 return /^\d$/.test(d) ? parseInt(d, 10) : 0;
}

function finSanitizeOhadaPrefix(prefix) {
 const s = String(prefix ?? '').trim();
 if (!s) return '';
 const ch = s[0];
 return /^\d$/.test(ch) ? ch : '';
}

/**
 * Sum of (debit − credit) for accounts whose code starts with prefix, as at date inclusive.
 * Parity: hms_fin_prefix_balance_as_of (financials_reports_data.php).
 */
async function finPrefixBalanceAsOf(pool, facilityId, asOfDate, prefix) {
 const d = isoDate(asOfDate);
 const pfx = finSanitizeOhadaPrefix(prefix);
 if (!d || !pfx || !(await finTablesOk(pool))) return 0;
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const f = await finJlReportSqlFragments(pool);
 const like = `${pfx}%`;
 const sql = `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS b
   FROM tbl_fin_journal_line jl
   INNER JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
   ${f.join}
   WHERE h.facility_id = ? AND h.entry_date <= ? AND (${f.code}) LIKE ?`;
 try {
  const [[r]] = await pool.query(sql, [fid, d, like]);
  return Math.round((parseFloat(r?.b) || 0) * 100) / 100;
 } catch (e) {
  return 0;
 }
}

/**
 * Book balance for one account code as at date (cumulative, debit − credit).
 * Parity: hms_fin_account_balance_code_as_of (financials_reports_data.php).
 */
async function finAccountBalanceCodeAsOf(pool, facilityId, asOfDate, accountCode) {
 const d = isoDate(asOfDate);
 const code = String(accountCode ?? '').trim();
 if (!d || !code || !(await finTablesOk(pool))) return 0;
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const f = await finJlReportSqlFragments(pool);
 const sql = `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS b
   FROM tbl_fin_journal_line jl
   INNER JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
   ${f.join}
   WHERE h.facility_id = ? AND h.entry_date <= ? AND TRIM(${f.code}) = ?`;
 try {
  const [[r]] = await pool.query(sql, [fid, d, code]);
  return Math.round((parseFloat(r?.b) || 0) * 100) / 100;
 } catch (e) {
  return 0;
 }
}

/**
 * Net movement (debit − credit) in period for account codes starting with prefix.
 * Parity: hms_fin_prefix_movement_period.
 */
async function finPrefixMovementPeriod(pool, facilityId, dateFrom, dateTo, prefix) {
 const d1 = isoDate(dateFrom);
 const d2 = isoDate(dateTo);
 const pfx = finSanitizeOhadaPrefix(prefix);
 if (!d1 || !d2 || !pfx || !(await finTablesOk(pool))) return 0;
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const f = await finJlReportSqlFragments(pool);
 const like = `${pfx}%`;
 const sql = `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS m
   FROM tbl_fin_journal_line jl
   INNER JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
   ${f.join}
   WHERE h.facility_id = ? AND h.entry_date BETWEEN ? AND ? AND (${f.code}) LIKE ?`;
 try {
  const [[r]] = await pool.query(sql, [fid, d1, d2, like]);
  return Math.round((parseFloat(r?.m) || 0) * 100) / 100;
 } catch (e) {
  return 0;
 }
}

/**
 * @returns {Promise<Array<{ account_code: string, account_label: string, total_debit: number, total_credit: number, balance: number, class: number }>>}
 * Parity: hms_fin_account_movements_period (financials_ohada.php).
 */
async function finAccountMovementsPeriod(pool, facilityId, dateFrom, dateTo) {
 const d1 = isoDate(dateFrom);
 const d2 = isoDate(dateTo);
 if (!d1 || !d2 || !(await finTablesOk(pool))) return [];
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const f = await finJlReportSqlFragments(pool);
 const sql = `SELECT (${f.code}) AS c, MAX((${f.label})) AS lbl,
     SUM(jl.debit) AS tdr, SUM(jl.credit) AS tcr
   FROM tbl_fin_journal_line jl
   INNER JOIN tbl_fin_journal_header j ON j.id = jl.journal_id
   ${f.join}
   WHERE j.facility_id = ? AND j.entry_date BETWEEN ? AND ?
   GROUP BY (${f.code})
   ORDER BY (${f.code})`;
 try {
  const [rows] = await pool.query(sql, [fid, d1, d2]);
  return (rows || []).map((row) => {
   const dr = Math.round((parseFloat(row.tdr) || 0) * 100) / 100;
   const cr = Math.round((parseFloat(row.tcr) || 0) * 100) / 100;
   const code = String(row.c ?? '');
   return {
    account_code: code,
    account_label: String(row.lbl ?? ''),
    total_debit: dr,
    total_credit: cr,
    balance: Math.round((dr - cr) * 100) / 100,
    class: finOhadaClassFromCode(code)
   };
  });
 } catch (e) {
  return [];
 }
}

/**
 * Cumulative balances per account as at date inclusive (debit − credit).
 * Parity: hms_fin_account_balances_to_date (financials_ohada.php).
 */
async function finAccountBalancesToDate(pool, facilityId, asOfDateInclusive) {
 const d = isoDate(asOfDateInclusive);
 if (!d || !(await finTablesOk(pool))) return [];
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const f = await finJlReportSqlFragments(pool);
 const sql = `SELECT (${f.code}) AS c, MAX((${f.label})) AS lbl,
     SUM(jl.debit) AS tdr, SUM(jl.credit) AS tcr
   FROM tbl_fin_journal_line jl
   INNER JOIN tbl_fin_journal_header j ON j.id = jl.journal_id
   ${f.join}
   WHERE j.facility_id = ? AND j.entry_date <= ?
   GROUP BY (${f.code})
   ORDER BY (${f.code})`;
 try {
  const [rows] = await pool.query(sql, [fid, d]);
  return (rows || []).map((row) => {
   const dr = Math.round((parseFloat(row.tdr) || 0) * 100) / 100;
   const cr = Math.round((parseFloat(row.tcr) || 0) * 100) / 100;
   const code = String(row.c ?? '');
   return {
    account_code: code,
    account_label: String(row.lbl ?? ''),
    total_debit: dr,
    total_credit: cr,
    balance: Math.round((dr - cr) * 100) / 100,
    class: finOhadaClassFromCode(code)
   };
  });
 } catch (e) {
  return [];
 }
}

/**
 * Fiscal year P&amp;L movement (classes 6 &amp; 7). Parity: hms_fin_pl_for_year.
 */
async function finPlForYear(pool, facilityId, year) {
 const now = new Date().getFullYear();
 let y = parseInt(year, 10);
 if (!Number.isFinite(y) || y < 2000 || y > 2100) y = now;
 return finPlForDateRange(pool, facilityId, `${y}-01-01`, `${y}-12-31`);
}

/**
 * @returns {Promise<{ charges: number, produits: number, resultat: number, period_from: string, period_to: string }>}
 * Parity: hms_fin_pl_for_date_range.
 */
async function finPlForDateRange(pool, facilityId, dateFrom, dateTo) {
 const d1 = isoDate(dateFrom);
 const d2 = isoDate(dateTo);
 const bad = { charges: 0, produits: 0, resultat: 0, period_from: d1 || String(dateFrom || ''), period_to: d2 || String(dateTo || '') };
 if (!d1 || !d2) return bad;
 if (d1 > d2) return { ...bad, period_from: d1, period_to: d2 };
 const rows = await finAccountMovementsPeriod(pool, facilityId, d1, d2);
 let charges = 0;
 let produits = 0;
 for (const r of rows) {
  const cl = r.class;
  const dr = r.total_debit;
  const cr = r.total_credit;
  if (cl === 6) charges += dr - cr;
  if (cl === 7) produits += cr - dr;
 }
 charges = Math.round(charges * 100) / 100;
 produits = Math.round(produits * 100) / 100;
 return {
  charges,
  produits,
  resultat: Math.round((produits - charges) * 100) / 100,
  period_from: d1,
  period_to: d2
 };
}

/**
 * Patient transactions workspace totals (tbl_transaction) — requires facility_id column (PHP parity).
 * @returns {Promise<{ total: number, count: number }>}
 */
async function finOpsTransactionsPeriod(pool, facilityId, dateFrom, dateTo) {
 const d1 = isoDate(dateFrom);
 const d2 = isoDate(dateTo);
 if (!d1 || !d2) return { total: 0, count: 0 };
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 if (!(await tableExists(pool, 'tbl_transaction'))) return { total: 0, count: 0 };
 if (!(await columnExists(pool, 'tbl_transaction', 'facility_id'))) return { total: 0, count: 0 };
 try {
  const [[r]] = await pool.query(
   `SELECT COUNT(*) AS c, COALESCE(SUM(CAST(amount AS DECIMAL(14,2))), 0) AS s FROM tbl_transaction
    WHERE facility_id = ? AND transaction_date BETWEEN ? AND ?`,
   [fid, d1, d2]
  );
  return {
   total: Math.round((parseFloat(r?.s) || 0) * 100) / 100,
   count: parseInt(r?.c, 10) || 0
  };
 } catch (e) {
  return { total: 0, count: 0 };
 }
}

function groupLinesByAccount(lines) {
 const byAcct = {};
 for (const ln of lines) {
  const c = ln.account_code;
  if (!c) continue;
  if (!byAcct[c]) byAcct[c] = [];
  byAcct[c].push(ln);
 }
 const keys = Object.keys(byAcct).sort();
 const sorted = {};
 for (const k of keys) sorted[k] = byAcct[k];
 return sorted;
}

/** @returns {Promise<string>} */
async function finGlEmptySiteHint(pool, sessionFacilityId, dateFrom, dateTo) {
 const d1 = isoDate(dateFrom);
 const d2 = isoDate(dateTo);
 if (!d1 || !d2 || !(await finTablesOk(pool))) return '';
 const fid = Math.max(1, parseInt(sessionFacilityId, 10) || 1);
 try {
  const [[mine]] = await pool.query(
   'SELECT COUNT(*) AS c FROM tbl_fin_journal_header WHERE facility_id = ? AND entry_date BETWEEN ? AND ?',
   [fid, d1, d2]
  );
  if ((parseInt(mine?.c, 10) || 0) > 0) return '';
  const [others] = await pool.query(
   'SELECT facility_id, COUNT(*) AS n FROM tbl_fin_journal_header WHERE entry_date BETWEEN ? AND ? GROUP BY facility_id ORDER BY facility_id ASC LIMIT 16',
   [d1, d2]
  );
  const parts = [];
  for (const row of others || []) {
   const of = parseInt(row.facility_id, 10) || 0;
   const n = parseInt(row.n, 10) || 0;
   if (of > 0 && of !== fid) parts.push(`#${of} (${n} header${n === 1 ? '' : 's'})`);
  }
  if (!parts.length) return '';
  return (
   `Journal data exists in this period on ${parts.join(', ')}, but your session is on site #${fid}. ` +
   'The General ledger only shows the active hospital site. Use the facility selector (or Administration) to match the site where journals were posted.'
  );
 } catch (e) {
  return '';
 }
}

/** @returns {Promise<string>} */
async function finGlEmptyHeadersWithoutLinesHint(pool, facilityId, dateFrom, dateTo) {
 const d1 = isoDate(dateFrom);
 const d2 = isoDate(dateTo);
 if (!d1 || !d2 || !(await finTablesOk(pool))) return '';
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 try {
  const [[h]] = await pool.query(
   'SELECT COUNT(*) AS c FROM tbl_fin_journal_header WHERE facility_id = ? AND entry_date BETWEEN ? AND ?',
   [fid, d1, d2]
  );
  const nh = parseInt(h?.c, 10) || 0;
  if (nh < 1) return '';
  const [[l]] = await pool.query(
   `SELECT COUNT(*) AS c FROM tbl_fin_journal_line jl
    INNER JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
    WHERE h.facility_id = ? AND h.entry_date BETWEEN ? AND ?`,
   [fid, d1, d2]
  );
  const nl = parseInt(l?.c, 10) || 0;
  if (nl > 0) return '';
  return (
   'Journal headers exist for this site in this period, but no line rows were found. ' +
   'Run financial migrations (see htdocs_php database/migrations/019_credit_receivables.sql), ' +
   'or verify tbl_fin_journal_line.journal_id matches tbl_fin_journal_header.id.'
  );
 } catch (e) {
  return '';
 }
}

/** @returns {Promise<string>} */
async function finGlEmptyNoJournalsAnywhereHint(pool, dateFrom, dateTo) {
 const d1 = isoDate(dateFrom);
 const d2 = isoDate(dateTo);
 if (!d1 || !d2 || !(await finTablesOk(pool))) return '';
 try {
  const [[r]] = await pool.query(
   'SELECT COUNT(*) AS c FROM tbl_fin_journal_header WHERE entry_date BETWEEN ? AND ?',
   [d1, d2]
  );
  const n = parseInt(r?.c, 10) || 0;
  if (n > 0) return '';
  return 'No journal headers exist in this date range for any facility. Widen the dates or post journals (Sync to GL).';
 } catch (e) {
  return '';
 }
}

function formatXaf(n, withCurrency = true) {
 const v = Number(n) || 0;
 const s = v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
 return withCurrency ? `${s} XAF` : s;
}

module.exports = {
 tableExists,
 columnExists,
 finTablesOk,
 finJlReportSqlFragments,
 finOpeningBalancesBefore,
 finGlLines,
 finJournalEntryDateBounds,
 finOpsFiscalReceiptsPeriod,
 finOpsTransactionsPeriod,
 finPrefixBalanceAsOf,
 finAccountBalanceCodeAsOf,
 finPrefixMovementPeriod,
 finAccountMovementsPeriod,
 finAccountBalancesToDate,
 finPlForYear,
 finPlForDateRange,
 finOhadaClassFromCode,
 groupLinesByAccount,
 labelPatientContext,
 finGlEmptySiteHint,
 finGlEmptyHeadersWithoutLinesHint,
 finGlEmptyNoJournalsAnywhereHint,
 formatXaf,
 isoDate
};
