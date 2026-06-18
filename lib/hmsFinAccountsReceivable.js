/**
 * Accounts receivable (patient credit) — parity with PHP financials-accounts-receivable.php
 * and helpers in financials_reports_data.php (detail ledger as-at).
 */
const { tableExists, columnExists, isoDate } = require('./hmsFinGeneralLedger');

async function finArBaseTablesOk(pool) {
 return (await tableExists(pool, 'tbl_credit_account')) && (await tableExists(pool, 'tbl_patient'));
}

/**
 * Gross charges subquery for main SELECT (uses ca.id).
 * Prefers billing tbl_charge (PHP); falls back to tbl_credit_charge (Node credit UI).
 */
async function finArGrossChargesSubquerySql(pool) {
 const hasCharge =
  (await tableExists(pool, 'tbl_charge')) &&
  (await columnExists(pool, 'tbl_charge', 'credit_account_id')) &&
  (await columnExists(pool, 'tbl_charge', 'on_credit')) &&
  (await columnExists(pool, 'tbl_charge', 'amount')) &&
  (await columnExists(pool, 'tbl_charge', 'posted_at'));
 if (hasCharge) {
  return {
   source: 'tbl_charge',
   sql: '(SELECT COALESCE(SUM(amount),0) FROM tbl_charge WHERE credit_account_id = ca.id AND on_credit = 1 AND DATE(posted_at) <= ?)'
  };
 }
 const hasCc =
  (await tableExists(pool, 'tbl_credit_charge')) &&
  (await columnExists(pool, 'tbl_credit_charge', 'credit_account_id')) &&
  (await columnExists(pool, 'tbl_credit_charge', 'amount'));
 if (!hasCc) return null;
 const hasOnCred = await columnExists(pool, 'tbl_credit_charge', 'on_credit');
 const oc = hasOnCred ? ' AND on_credit = 1 ' : ' ';
 const dateCol = (await columnExists(pool, 'tbl_credit_charge', 'posted_at')) ? 'posted_at' : 'created_at';
 return {
  source: 'tbl_credit_charge',
  sql: `(SELECT COALESCE(SUM(amount),0) FROM tbl_credit_charge WHERE credit_account_id = ca.id ${oc} AND DATE(${dateCol}) <= ?)`
 };
}

function round2(n) {
 return Math.round((Number(n) || 0) * 100) / 100;
}

/** Aging bucket from invoice due date vs as-of (PHP financials-accounts-receivable.php). */
function finArAgingBucketFromDue(net, invoiceDueYmd, asOfYmd) {
 if (net <= 0.001) return 'Current';
 const due = String(invoiceDueYmd || '').trim().slice(0, 10);
 const asof = isoDate(asOfYmd);
 if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !asof) return 'Current';
 const d0 = new Date(`${asof}T12:00:00`);
 const d1 = new Date(`${due}T12:00:00`);
 const diff = Math.floor((d0.getTime() - d1.getTime()) / 86400000);
 if (diff > 90) return '> 90 Days';
 if (diff > 60) return '61-90 Days';
 if (diff > 30) return '31-60 Days';
 if (diff > 0) return '1-30 Days';
 return 'Current';
}

/**
 * @returns {Promise<{
 *  arOk: boolean,
 *  chargeSource: string | null,
 *  rows: Array<{ patient_name: string, gross_charges: number, total_paid: number, total_adj: number, net_balance: number, bucket: string, invoice_due_date: string | null }>,
 *  sumGross: number, sumPaid: number, sumAdj: number, sumNet: number,
 *  queryError: string
 * }>}
 */
async function finArDetailLedgerAsOf(pool, facilityId, asOfDate) {
 const raw = String(asOfDate ?? '').trim();
 const asof = isoDate(raw) ? raw : new Date().toISOString().slice(0, 10);
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const out = {
  arOk: false,
  chargeSource: null,
  rows: [],
  sumGross: 0,
  sumPaid: 0,
  sumAdj: 0,
  sumNet: 0,
  queryError: ''
 };

 const baseOk = await finArBaseTablesOk(pool);
 if (!baseOk) return out;
 out.arOk = true;

 const grossFrag = await finArGrossChargesSubquerySql(pool);
 if (!grossFrag) {
  out.queryError =
   'No linked charge table: need tbl_charge (credit_account_id, on_credit, posted_at) or tbl_credit_charge.';
  return out;
 }
 out.chargeSource = grossFrag.source;

 const hasPay = await tableExists(pool, 'tbl_credit_payment');
 const hasAdj = await tableExists(pool, 'tbl_credit_adjustment');
 const hasInvoiceDue = await columnExists(pool, 'tbl_credit_account', 'invoice_due_date');
 const hasFac = await columnExists(pool, 'tbl_credit_account', 'facility_id');

 const dueSel = hasInvoiceDue ? 'ca.invoice_due_date' : 'NULL AS invoice_due_date';
 const paidSql = hasPay
  ? '(SELECT COALESCE(SUM(amount),0) FROM tbl_credit_payment WHERE credit_account_id = ca.id AND DATE(created_at) <= ?)'
  : 'CAST(0 AS DECIMAL(14,2))';
 const adjSql = hasAdj
  ? '(SELECT COALESCE(SUM(amount),0) FROM tbl_credit_adjustment WHERE credit_account_id = ca.id AND DATE(created_at) <= ?)'
  : 'CAST(0 AS DECIMAL(14,2))';

 const whereSql = hasFac ? 'ca.facility_id = ?' : '1=1';
 const sql = `SELECT ca.id, ca.status, ${dueSel},
    p.first_name, p.last_name,
    ${grossFrag.sql} AS gross_charges,
    ${paidSql} AS total_paid,
    ${adjSql} AS total_adj
   FROM tbl_credit_account ca
   INNER JOIN tbl_patient p ON p.id = ca.patient_id
   WHERE ${whereSql}
   ORDER BY p.first_name, p.last_name`;

 const params = [asof];
 if (hasPay) params.push(asof);
 if (hasAdj) params.push(asof);
 if (hasFac) params.push(fid);

 try {
  const [rawRows] = await pool.query(sql, params);
  let sumGross = 0;
  let sumPaid = 0;
  let sumAdj = 0;
  let sumNet = 0;
  const rows = [];
  for (const row of rawRows || []) {
   const g = round2(row.gross_charges);
   const p = round2(row.total_paid);
   const a = round2(row.total_adj);
   const net = round2(g - p - a);
   if (Math.abs(net) > 0.0001 || Math.abs(g) > 0.0001) {
    const inv = row.invoice_due_date != null ? String(row.invoice_due_date).slice(0, 10) : null;
    const fn = String(row.first_name ?? '').trim();
    const ln = String(row.last_name ?? '').trim();
    const patientName = `${fn} ${ln}`.trim() || `Patient #${row.id}`;
    const bucket = finArAgingBucketFromDue(net, inv, asof);
    rows.push({
     patient_name: patientName,
     gross_charges: g,
     total_paid: p,
     total_adj: a,
     net_balance: net,
     bucket,
     invoice_due_date: inv
    });
    sumGross += g;
    sumPaid += p;
    sumAdj += a;
    sumNet += net;
   }
  }
  out.rows = rows;
  out.sumGross = round2(sumGross);
  out.sumPaid = round2(sumPaid);
  out.sumAdj = round2(sumAdj);
  out.sumNet = round2(sumNet);
 } catch (e) {
  out.queryError = e && e.message ? String(e.message) : 'Query failed';
 }
 return out;
}

module.exports = {
 finArBaseTablesOk,
 finArDetailLedgerAsOf
};
