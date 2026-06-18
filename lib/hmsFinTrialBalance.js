const { finTablesOk, finJlReportSqlFragments, isoDate } = require('./hmsFinGeneralLedger');

/**
 * @returns {Promise<Array<{ account_code: string, account_label: string, total_debit: number, total_credit: number, balance: number }>>}
 */
async function finTbMovementRows(pool, facilityId, dateFrom, dateTo) {
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
   return {
    account_code: String(row.c ?? ''),
    account_label: String(row.lbl ?? ''),
    total_debit: dr,
    total_credit: cr,
    balance: Math.round((dr - cr) * 100) / 100
   };
  });
 } catch (e) {
  return [];
 }
}

/**
 * @returns {Promise<Array<{ account_code: string, account_label: string, total_debit: number, total_credit: number, balance: number }>>}
 */
async function finTbBalanceRows(pool, facilityId, asOfDateInclusive) {
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
   return {
    account_code: String(row.c ?? ''),
    account_label: String(row.lbl ?? ''),
    total_debit: dr,
    total_credit: cr,
    balance: Math.round((dr - cr) * 100) / 100
   };
  });
 } catch (e) {
  return [];
 }
}

/** Merge period + closing rows for trial balance table (PHP financials-trial-balance.php). */
function mergeTrialBalanceRows(periodRows, closingRows) {
 const byCode = {};
 for (const r of closingRows || []) {
  if (r.account_code) byCode[r.account_code] = r;
 }
 const movMap = {};
 for (const r of periodRows || []) {
  if (r.account_code) movMap[r.account_code] = r;
 }
 const codes = [...new Set([...Object.keys(movMap), ...Object.keys(byCode)])].sort();
 const out = [];
 for (const code of codes) {
  const m = movMap[code];
  const cl = byCode[code];
  const md = m ? m.total_debit : 0;
  const mc = m ? m.total_credit : 0;
  const sb = cl ? cl.balance : 0;
  let lbl = m ? m.account_label : '';
  if (!lbl && cl) lbl = cl.account_label;
  const sp = m ? m.balance : 0;
  out.push({
   code,
   label: lbl,
   category: '', // filled by route using ohada
   md,
   mc,
   periodNet: sp,
   balanceBf: sb
  });
 }
 return out;
}

module.exports = { finTbMovementRows, finTbBalanceRows, mergeTrialBalanceRows };
