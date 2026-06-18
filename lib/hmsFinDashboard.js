'use strict';

const { formatDisplayDate, formatPeriodRange, mapFinRows } = require('./hmsFormatDate');
const {
 finTablesOk,
 finPrefixBalanceAsOf,
 finPrefixMovementPeriod,
 finJlReportSqlFragments,
} = require('./hmsFinGeneralLedger');

function monthBounds(d = new Date()) {
 const y = d.getFullYear();
 const m = String(d.getMonth() + 1).padStart(2, '0');
 const last = new Date(y, d.getMonth() + 1, 0).getDate();
 return {
  today: `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`,
  monthStart: `${y}-${m}-01`,
  monthEnd: `${y}-${m}-${String(last).padStart(2, '0')}`,
 };
}

/**
 * QuickBooks-style company dashboard metrics from GL (with billing fallback).
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} facilityId
 */
async function buildFinancialDashboard(pool, facilityId) {
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const { today, monthStart, monthEnd } = monthBounds();
 const finOk = await finTablesOk(pool);

 const metrics = {
  revenueMtd: 0,
  expensesMtd: 0,
  cashBalance: 0,
  netIncomeMtd: 0,
  journalCountMtd: 0,
  billingRevenueMtd: 0,
  billingTxnMtd: 0,
  finOk,
  periodLabel: formatPeriodRange(monthStart, today),
 };

 if (finOk) {
  const mov7 = await finPrefixMovementPeriod(pool, fid, monthStart, today, '7');
  const mov6 = await finPrefixMovementPeriod(pool, fid, monthStart, today, '6');
  metrics.revenueMtd = Math.max(0, Math.round(-mov7));
  metrics.expensesMtd = Math.max(0, Math.round(mov6));
  metrics.netIncomeMtd = metrics.revenueMtd - metrics.expensesMtd;
  metrics.cashBalance = await finPrefixBalanceAsOf(pool, fid, today, '5');
  try {
   const [[jc]] = await pool.query(
    `SELECT COUNT(*) AS c FROM tbl_fin_journal_header
     WHERE facility_id = ? AND entry_date >= ? AND entry_date <= ?`,
    [fid, monthStart, today]
   );
   metrics.journalCountMtd = parseInt(jc?.c, 10) || 0;
  } catch (_) {
   metrics.journalCountMtd = 0;
  }
 }

 try {
  const [[m]] = await pool.query(
   `SELECT COALESCE(SUM(amount),0) AS revenue, COUNT(*) AS cnt
    FROM tbl_transaction
    WHERE status='completed' AND transaction_date >= ? AND transaction_date <= ?`,
   [monthStart, today]
  );
  metrics.billingRevenueMtd = Math.round(parseFloat(m?.revenue) || 0);
  metrics.billingTxnMtd = parseInt(m?.cnt, 10) || 0;
  if (!finOk || metrics.revenueMtd < 1) {
   metrics.revenueMtd = metrics.billingRevenueMtd;
  }
 } catch (_) {
  /* ignore */
 }

 let recentJournals = [];
 if (finOk) {
  try {
   const [rows] = await pool.query(
    `SELECT h.id, h.entry_date AS journal_date, h.narration AS description,
            h.reference, h.source_type AS source,
            (SELECT COALESCE(SUM(debit),0) FROM tbl_fin_journal_line jl WHERE jl.journal_id = h.id) AS total_dr
     FROM tbl_fin_journal_header h
     WHERE h.facility_id = ?
     ORDER BY h.entry_date DESC, h.id DESC
     LIMIT 12`,
    [fid]
   );
   recentJournals = mapFinRows(Array.isArray(rows) ? rows : []);
  } catch (_) {
   recentJournals = [];
  }
 }

 let topAccounts = [];
 if (finOk) {
  try {
   const f = await finJlReportSqlFragments(pool);
   const [rows] = await pool.query(
    `SELECT (${f.code}) AS account_code, MAX((${f.label})) AS account_label,
            COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
     FROM tbl_fin_journal_line jl
     INNER JOIN tbl_fin_journal_header h ON h.id = jl.journal_id
     ${f.join}
     WHERE h.facility_id = ? AND h.entry_date <= ?
     GROUP BY (${f.code})
     HAVING ABS(COALESCE(SUM(jl.debit - jl.credit), 0)) >= 1
     ORDER BY ABS(COALESCE(SUM(jl.debit - jl.credit), 0)) DESC
     LIMIT 8`,
    [fid, today]
   );
   topAccounts = (Array.isArray(rows) ? rows : []).map((r) => ({
    account_code: String(r.account_code || '').trim(),
    account_label: String(r.account_label || '').trim(),
    balance: Math.round((parseFloat(r.balance) || 0) * 100) / 100,
   }));
  } catch (_) {
   topAccounts = [];
  }
 }

 return {
  metrics,
  recentJournals,
  topAccounts,
  monthStart,
  monthEnd,
  today,
 };
}

module.exports = { buildFinancialDashboard, monthBounds };
