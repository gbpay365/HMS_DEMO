'use strict';

const { resolvePeriodBounds } = require('./cashierBatchPrint');
const {
  buildCashierDailySummary,
  fmtMoney,
} = require('./cashierDailySummary');
const { fetchCashierInsuranceClaims } = require('./cashierInsuranceClaims');

const CATEGORY_GROUPS = [
  { key: 'pharmacy', label: 'Pharmacy', sources: ['pharmacy'], color: '#db2777' },
  { key: 'laboratory', label: 'Laboratory', sources: ['laboratory'], color: '#7c3aed' },
  { key: 'opd', label: 'OPD', sources: ['consultation'], color: '#1e40af' },
  { key: 'inpatient', label: 'Inpatient', sources: ['hospitalization'], color: '#0f766e' },
  { key: 'ambulance', label: 'Ambulance', sources: ['emergency'], color: '#0d9488' },
  {
    key: 'other',
    label: 'Other',
    sources: ['radiology', 'maternity', 'surgery', 'nursing', 'material', 'service', 'other'],
    color: '#f97316',
  },
];

const COLLECTION_COLORS = {
  cash: '#0d9488',
  pos: '#1e40af',
  card: '#1e40af',
  momo: '#7c3aed',
  om: '#ea580c',
  betterpay: '#8b5cf6',
  ussd: '#2563eb',
  paystack: '#6366f1',
  bank: '#0369a1',
  insurance: '#0f766e',
  wallet: '#059669',
};

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pctDelta(current, previous) {
  const c = n(current);
  const p = n(previous);
  if (p > 0) return Math.round(((c - p) / p) * 1000) / 10;
  if (c > 0) return 100;
  return 0;
}

function resolveReportPeriod(periodKey, anchorDate) {
  const today = anchorDate || fmtDate(new Date());
  const key = String(periodKey || 'this_month').toLowerCase();
  if (key === 'today') return { period: 'day', date: today, key, label: 'Today' };
  if (key === 'this_week') return { period: 'week', date: today, key, label: 'This week' };
  if (key === 'last_month') {
    const d = new Date(`${today}T12:00:00`);
    d.setMonth(d.getMonth() - 1);
    return { period: 'month', date: fmtDate(d), key, label: 'Last month' };
  }
  return { period: 'month', date: today, key: 'this_month', label: 'This month' };
}

function previousReportPeriod(spec) {
  const bounds = resolvePeriodBounds(spec.period, spec.date);
  const start = new Date(`${bounds.start}T12:00:00`);
  if (spec.period === 'day') {
    start.setDate(start.getDate() - 1);
    return { period: 'day', date: fmtDate(start) };
  }
  if (spec.period === 'week') {
    start.setDate(start.getDate() - 7);
    return { period: 'week', date: fmtDate(start) };
  }
  start.setMonth(start.getMonth() - 1);
  return { period: 'month', date: fmtDate(start) };
}

function shortDayLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function shortMonthLabel(ym) {
  const [y, m] = String(ym).split('-').map((x) => parseInt(x, 10));
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
}

function bucketCategorySeries(categoryRows = []) {
  const byKey = {};
  for (const row of categoryRows) byKey[row.key] = n(row.amount);
  return CATEGORY_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    color: g.color,
    value: g.sources.reduce((sum, src) => sum + n(byKey[src]), 0),
  })).filter((row) => row.value > 0);
}

async function fetchPeriodTicketTotals(pool, bounds, scope) {
  const allCashiers = !!scope.allCashiers;
  const paidBy = parseInt(String(scope.paidBy || 0), 10) || 0;
  const params = [bounds.start, bounds.end];
  let billedSql = `SELECT
      COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status,''))) = 'paid' THEN total_amount END), 0) AS collected,
      COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(status,''))) NOT IN ('cancelled','canceled') THEN total_amount END), 0) AS billed,
      COUNT(CASE WHEN LOWER(TRIM(COALESCE(status,''))) = 'paid' THEN 1 END) AS paid_count
     FROM tbl_payment_ticket
    WHERE DATE(COALESCE(paid_at, created_at)) BETWEEN ? AND ?`;
  if (!allCashiers && paidBy > 0) {
    billedSql += ' AND paid_by = ?';
    params.push(paidBy);
  }
  const [[row]] = await pool.query(billedSql, params).catch(() => [[{}]]);
  return {
    collected: n(row?.collected),
    billed: n(row?.billed),
    paid_count: parseInt(row?.paid_count, 10) || 0,
  };
}

async function fetchPeriodDisbursementTotal(pool, bounds, scope) {
  const allCashiers = !!scope.allCashiers;
  const paidBy = parseInt(String(scope.paidBy || 0), 10) || 0;
  try {
    const { ensureCashierDisbursementSchema } = require('./ensureCashierDisbursementSchema');
    await ensureCashierDisbursementSchema(pool);
    const params = [bounds.start, bounds.end];
    let sql = `SELECT COALESCE(SUM(amount), 0) AS total
                 FROM tbl_cashier_disbursement
                WHERE DATE(created_at) BETWEEN ? AND ?
                  AND status = 'posted'`;
    if (!allCashiers && paidBy > 0) {
      sql += ' AND created_by = ?';
      params.push(paidBy);
    }
    const [[row]] = await pool.query(sql, params);
    return n(row?.total);
  } catch (_) {
    return 0;
  }
}

function resolveCashierReportsScope(req, res) {
  void req;
  void res;
  // Revenue analytics reflects facility-wide collections (same desk view as overview KPIs).
  return { allCashiers: true, paidBy: 0 };
}

async function fetchDailyRevenueSeries(pool, scope, days = 30) {
  const allCashiers = !!scope.allCashiers;
  const paidBy = parseInt(String(scope.paidBy || 0), 10) || 0;
  const params = [Math.max(7, Math.min(days, 90))];
  let sql = `SELECT DATE_FORMAT(paid_at, '%Y-%m-%d') AS d, COALESCE(SUM(total_amount), 0) AS total
               FROM tbl_payment_ticket
              WHERE LOWER(TRIM(COALESCE(status,''))) = 'paid'
                AND paid_at IS NOT NULL
                AND DATE(paid_at) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`;
  if (!allCashiers && paidBy > 0) {
    sql += ' AND paid_by = ?';
    params.push(paidBy);
  }
  sql += ' GROUP BY DATE(paid_at) ORDER BY d ASC';
  const [rows] = await pool.query(sql, params).catch(() => [[]]);
  const map = new Map((rows || []).map((r) => [String(r.d || '').slice(0, 10), n(r.total)]));
  const out = [];
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const iso = fmtDate(d);
    out.push({ date: iso, label: shortDayLabel(iso), value: map.get(iso) || 0 });
  }
  return out;
}

async function fetchMonthlyCollectionBars(pool, scope, monthCount = 6) {
  const allCashiers = !!scope.allCashiers;
  const paidBy = parseInt(String(scope.paidBy || 0), 10) || 0;
  const params = [];
  let sql = `SELECT DATE_FORMAT(paid_at, '%Y-%m') AS ym,
                    COALESCE(SUM(total_amount), 0) AS total
               FROM tbl_payment_ticket
              WHERE LOWER(TRIM(COALESCE(status,''))) = 'paid'
                AND paid_at IS NOT NULL
                AND paid_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)`;
  params.push(monthCount);
  if (!allCashiers && paidBy > 0) {
    sql += ' AND paid_by = ?';
    params.push(paidBy);
  }
  sql += ' GROUP BY DATE_FORMAT(paid_at, "%Y-%m") ORDER BY ym ASC';
  const [rows] = await pool.query(sql, params).catch(() => [[]]);
  const map = new Map((rows || []).map((r) => [r.ym, n(r.total)]));
  const bars = [];
  const now = new Date();
  for (let i = monthCount - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const actual = map.get(ym) || 0;
    const prevDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevActual = map.get(prevYm) || actual * 0.9;
    const target = Math.round(Math.max(actual * 0.92, prevActual * 1.02));
    bars.push({
      key: ym,
      label: shortMonthLabel(ym),
      actual,
      actual_fmt: fmtMoney(actual),
      target,
      target_fmt: fmtMoney(target),
    });
  }
  return bars;
}

async function fetchDisbursementRows(pool, bounds, scope, limit = 50) {
  const allCashiers = !!scope.allCashiers;
  const paidBy = parseInt(String(scope.paidBy || 0), 10) || 0;
  try {
    const { ensureCashierDisbursementSchema } = require('./ensureCashierDisbursementSchema');
    await ensureCashierDisbursementSchema(pool);
    const params = [bounds.start, bounds.end];
    let sql = `SELECT id, amount, payment_method, reason, beneficiary, created_at
                 FROM tbl_cashier_disbursement
                WHERE DATE(created_at) BETWEEN ? AND ?
                  AND status = 'posted'`;
    if (!allCashiers && paidBy > 0) {
      sql += ' AND created_by = ?';
      params.push(paidBy);
    }
    params.push(Math.min(limit, 100));
    sql += ' ORDER BY created_at DESC LIMIT ?';
    const [rows] = await pool.query(sql, params);
    return (rows || []).map((r) => ({
      id: r.id,
      amount: n(r.amount),
      amount_fmt: fmtMoney(r.amount),
      payment_method: r.payment_method || 'cash',
      reason: r.reason || r.beneficiary || '—',
      created_at: r.created_at,
    }));
  } catch (_) {
    return [];
  }
}

function insuranceRecoveryForBounds(claimsData, bounds) {
  const start = new Date(`${bounds.start}T00:00:00`);
  const end = new Date(`${bounds.end}T23:59:59`);
  const inRange = (claimsData.claims || []).filter((c) => {
    const d = c.submitted_at ? new Date(c.submitted_at) : null;
    return d && !Number.isNaN(d.getTime()) && d >= start && d <= end;
  });
  const claimed = inRange.reduce((s, c) => s + n(c.claimed_amount), 0);
  const recovered = inRange.reduce((s, c) => {
    if (c.display_status === 'approved' || c.display_status === 'paid') {
      return s + n(c.approved_amount ?? c.claimed_amount);
    }
    return s;
  }, 0);
  return claimed > 0 ? Math.round((recovered / claimed) * 1000) / 10 : 0;
}

function kpiCard(value, deltaPct, fmt) {
  return { value, delta_pct: deltaPct, fmt: fmt != null ? fmt : String(value) };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ periodKey?: string, date?: string, scope?: object }} [opts]
 */
async function fetchCashierReports(pool, opts = {}) {
  const scope = opts.scope || { allCashiers: true, paidBy: 0 };
  const periodSpec = resolveReportPeriod(opts.periodKey, opts.date);
  const bounds = resolvePeriodBounds(periodSpec.period, periodSpec.date);
  const prevSpec = previousReportPeriod(periodSpec);
  const prevBounds = resolvePeriodBounds(prevSpec.period, prevSpec.date);

  const [
    summary,
    prevTotals,
    curTotals,
    disbursementTotal,
    prevDisbursementTotal,
    dailyRevenue,
    monthlyBars,
    disbursementRows,
    insuranceData,
  ] = await Promise.all([
    buildCashierDailySummary(pool, {
      period: periodSpec.period,
      date: periodSpec.date,
      allCashiers: scope.allCashiers,
      paidBy: scope.paidBy,
    }),
    fetchPeriodTicketTotals(pool, prevBounds, scope),
    fetchPeriodTicketTotals(pool, bounds, scope),
    fetchPeriodDisbursementTotal(pool, bounds, scope),
    fetchPeriodDisbursementTotal(pool, prevBounds, scope),
    fetchDailyRevenueSeries(pool, scope, 30),
    fetchMonthlyCollectionBars(pool, scope, 6),
    fetchDisbursementRows(pool, bounds, scope),
    fetchCashierInsuranceClaims(pool, { limit: 500 }).catch(() => ({ claims: [] })),
  ]);

  const netRevenue = Math.max(0, curTotals.collected - disbursementTotal);
  const prevNetRevenue = Math.max(0, prevTotals.collected - prevDisbursementTotal);
  const collectionRate = curTotals.billed > 0 ? Math.round((curTotals.collected / curTotals.billed) * 1000) / 10 : 0;
  const prevCollectionRate =
    prevTotals.billed > 0 ? Math.round((prevTotals.collected / prevTotals.billed) * 1000) / 10 : 0;
  const avgBill = curTotals.paid_count > 0 ? curTotals.collected / curTotals.paid_count : 0;
  const prevAvgBill = prevTotals.paid_count > 0 ? prevTotals.collected / prevTotals.paid_count : 0;
  const insuranceRecovery = insuranceRecoveryForBounds(insuranceData, bounds);
  const prevInsRecovery = insuranceRecoveryForBounds(insuranceData, prevBounds);

  const categorySeries = bucketCategorySeries(summary.categoryRows || []);
  const collectionsSeries = (summary.paymentRows || []).map((row) => ({
    key: row.key,
    label: row.label,
    value: n(row.amount),
    color: COLLECTION_COLORS[row.key] || '#64748b',
  }));

  return {
    ok: true,
    period_key: periodSpec.key,
    period_label: periodSpec.label,
    bounds,
    kpi: {
      total_revenue_net: kpiCard(netRevenue, pctDelta(netRevenue, prevNetRevenue), fmtMoney(netRevenue)),
      collection_rate: kpiCard(collectionRate, pctDelta(collectionRate, prevCollectionRate), `${collectionRate}%`),
      avg_bill_value: kpiCard(avgBill, pctDelta(avgBill, prevAvgBill), fmtMoney(avgBill)),
      insurance_recovery: kpiCard(
        insuranceRecovery,
        pctDelta(insuranceRecovery, prevInsRecovery),
        `${insuranceRecovery}%`
      ),
    },
    daily_revenue: dailyRevenue,
    category_series: categorySeries,
    monthly_bars: monthlyBars,
    collections_series: collectionsSeries,
    disbursements: {
      total: disbursementTotal,
      total_fmt: fmtMoney(disbursementTotal),
      rows: disbursementRows,
    },
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  fetchCashierReports,
  resolveCashierReportsScope,
  CATEGORY_GROUPS,
};
