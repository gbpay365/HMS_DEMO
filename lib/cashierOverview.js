'use strict';

const { fmtMoney, paymentMethodLabel, paymentMethodKey } = require('./cashierDailySummary');
const { getProfileChartMethods } = require('./cashierPaymentMethods');
const { buildCashierDailySummary } = require('./cashierDailySummary');
const { buildKpiFromSummary, fetchTodayDisbursementTotal } = require('./cashierDashboard');
const { fetchCashierBillingInvoices } = require('./cashierBillingInvoices');

const OVERDUE_DAYS = 14;

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtTime(dt) {
  if (!dt) return '—';
  const x = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const REVENUE_METHOD_COLORS = {
  cash: '#0d9488',
  pos: '#1e40af',
  card: '#1e40af',
  momo: '#7c3aed',
  om: '#ea580c',
  wallet: '#059669',
  ussd: '#2563eb',
  betterpay: '#8b5cf6',
  paystack: '#6366f1',
  bank: '#0369a1',
  insurance: '#0f766e',
};

function buildRevenueChart(paymentRows) {
  const profileMethods = getProfileChartMethods();
  const totals = Object.fromEntries(profileMethods.map((m) => [m.key, 0]));

  for (const row of paymentRows || []) {
    const key = paymentMethodKey(row.key || row.label);
    if (!Object.prototype.hasOwnProperty.call(totals, key)) continue;
    totals[key] = n(totals[key]) + n(row.amount);
  }

  return profileMethods.map((m) => ({
    key: m.key,
    label: m.label,
    value: n(totals[m.key]),
    color: REVENUE_METHOD_COLORS[m.key] || '#64748b',
  }));
}

function shiftMethodDisplay(pm) {
  return paymentMethodLabel(pm);
}

function daysSince(iso) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function resolveBillStatus(inv) {
  const pay = String(inv.payment_status || '').toLowerCase();
  if (pay === 'paid') return 'paid';
  if (pay === 'canceled' || pay === 'cancelled') return 'canceled';
  if (pay === 'partial') return 'partial';
  const ins = parseFloat(inv.insurance_pct) > 0
    || ['claimed', 'pending'].includes(String(inv.claim_status || '').toLowerCase());
  if (ins && (inv.balance_due || 0) > 0) return 'insurance';
  if (daysSince(inv.created_at) >= OVERDUE_DAYS) return 'overdue';
  return 'pending';
}

function patientInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return `${parts[0][0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

async function fetchOverviewKpis(pool) {
  const [[row]] = await pool
    .query(
      `SELECT
        COALESCE(SUM(CASE WHEN DATE(t.paid_at) = CURDATE() THEN t.total_amount END), 0) AS today_revenue,
        COALESCE(SUM(CASE WHEN DATE(t.paid_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN t.total_amount END), 0) AS yesterday_revenue,
        SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN DATE(t.paid_at) = CURDATE() AND t.status = 'paid' THEN 1 ELSE 0 END) AS today_count
       FROM tbl_payment_ticket t
      WHERE t.status NOT IN ('cancelled', 'canceled')`
    )
    .catch(() => [[{}]]);

  const todayRevenue = n(row?.today_revenue);
  const yesterdayRevenue = n(row?.yesterday_revenue);
  let revenueDeltaPct = 0;
  if (yesterdayRevenue > 0) {
    revenueDeltaPct = ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;
  } else if (todayRevenue > 0) {
    revenueDeltaPct = 100;
  }

  const billing = await fetchCashierBillingInvoices(pool, { limit: 500, statusFilter: 'all' }).catch(() => ({
    invoices: [],
    summary: {},
  }));

  let overdueCount = 0;
  const pendingBills = [];
  for (const inv of billing.invoices || []) {
    const status = resolveBillStatus(inv);
    if (status === 'paid' || status === 'canceled') continue;
    if (status === 'overdue') overdueCount += 1;
    pendingBills.push({
      ticket_id: inv.ticket_id,
      ticket_code: inv.ticket_code || inv.invoice_ref,
      patient_id: inv.patient_id,
      patient_name: inv.patient_name,
      initials: patientInitials(inv.patient_name),
      balance_due: inv.balance_due || 0,
      balance_due_fmt: fmtMoney(inv.balance_due || 0),
      display_status: status,
    });
  }

  pendingBills.sort((a, b) => (b.balance_due || 0) - (a.balance_due || 0));

  return {
    today_revenue: todayRevenue,
    today_revenue_fmt: fmtMoney(todayRevenue),
    yesterday_revenue: yesterdayRevenue,
    revenue_delta_pct: Math.round(revenueDeltaPct * 10) / 10,
    today_count: parseInt(row?.today_count, 10) || 0,
    pending_count: parseInt(row?.pending_count, 10) || pendingBills.length,
    overdue_count: overdueCount,
    pending_bills: pendingBills.slice(0, 8),
  };
}

async function fetchRecentTransactions(pool, limit = 12) {
  const [rows] = await pool
    .query(
      `SELECT
        t.id,
        t.ticket_code,
        t.total_amount,
        t.payment_method,
        t.paid_at,
        t.created_at,
        t.status,
        p.first_name,
        p.last_name,
        (
          SELECT d.doc_number
            FROM tbl_billing_document d
           WHERE d.source_module = 'payment_ticket'
             AND d.source_pk = t.id
             AND d.doc_type = 'receipt'
           ORDER BY d.id DESC
           LIMIT 1
        ) AS receipt_number
       FROM tbl_payment_ticket t
       JOIN tbl_patient p ON p.id = t.patient_id
      WHERE t.status = 'paid'
        AND DATE(COALESCE(t.paid_at, t.created_at)) = CURDATE()
      ORDER BY COALESCE(t.paid_at, t.created_at) DESC, t.id DESC
      LIMIT ?`,
      [Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50)]
    )
    .catch(() => [[]]);

  return (rows || []).map((r) => ({
    id: r.id,
    ticket_id: r.id,
    receipt_number: r.receipt_number || r.ticket_code,
    ticket_code: r.ticket_code,
    patient_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—',
    amount: n(r.total_amount),
    amount_fmt: fmtMoney(r.total_amount),
    payment_method: shiftMethodDisplay(r.payment_method),
    paid_time: fmtTime(r.paid_at || r.created_at),
    status: 'paid',
  }));
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ scope?: object }} [opts]
 */
async function fetchCashierOverview(pool, opts = {}) {
  const scope = opts.scope || { allCashiers: true, paidBy: 0 };
  const today = new Date().toISOString().slice(0, 10);

  const [kpis, summary, recent] = await Promise.all([
    fetchOverviewKpis(pool),
    buildCashierDailySummary(pool, {
      period: 'day',
      date: today,
      allCashiers: scope.allCashiers,
      paidBy: scope.paidBy,
    }).catch(() => ({ paymentRows: [] })),
    fetchRecentTransactions(pool, 12),
  ]);

  const disbursementTotal = await fetchTodayDisbursementTotal(pool, scope).catch(() => 0);
  const todayTotals = buildKpiFromSummary(summary, disbursementTotal);
  const revenueChart = buildRevenueChart(summary.paymentRows);

  return {
    ok: true,
    kpi: kpis,
    recent_transactions: recent,
    revenue_chart: revenueChart,
    today_totals: todayTotals,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  fetchCashierOverview,
  fetchOverviewKpis,
  fetchRecentTransactions,
  shiftMethodDisplay,
  resolveBillStatus,
};
