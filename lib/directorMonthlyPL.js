'use strict';

const { fetchDirectorCashierRevenue } = require('./directorCashierRevenue');
const { finApDetailExpenseRows } = require('./hmsFinAccountsPayable');
const { buildVisibleMonthlyModel } = require('./directorMonthlyPLCatalog');
const { resolveMonthlyCosts } = require('./directorPLManualCosts');
const {
  toIsoDate,
  parseMonthInput,
  endOfMonth,
  priorPeriodRange,
  formatRangeLabel,
} = require('./hmsDirectorReportsPeriod');

const COGS_CATEGORIES = new Set([
  'medical_supplies', 'pharmacy_stock', 'lab_reagents', 'pharmacy', 'laboratory',
  'material', 'supplies', 'inventory', 'consumables',
]);

const REVENUE_SOURCE_DEFS = [
  { id: 'ipd', label: 'IPD charges', keys: ['nursing', 'maternity', 'material'] },
  { id: 'surgery', label: 'Surgical procedures', keys: ['surgery'] },
  { id: 'opd', label: 'OPD consultations', keys: ['consultation'] },
  { id: 'lab', label: 'Laboratory', keys: ['laboratory'] },
  { id: 'pharmacy', label: 'Pharmacy', keys: ['pharmacy'] },
];

const DEPT_TYPE_RULES = [
  { match: /radiology|imaging/i, type: 'diagnostic' },
  { match: /laboratory|lab\b/i, type: 'diagnostic' },
  { match: /pharmacy/i, type: 'support' },
  { match: /admin|hr|human resources|finance|accounting/i, type: 'support' },
  { match: /emergency|icu|surgery|surgical|ward|maternity|pediatric|cardio|ortho|neuro|oncology|general/i, type: 'clinical' },
];

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round1(v) {
  return Math.round(n(v) * 10) / 10;
}

function pct(part, whole) {
  if (!whole) return 0;
  return round1((part / whole) * 100);
}

function monthLabel(year, month) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function deptType(name) {
  const s = String(name || '');
  for (const rule of DEPT_TYPE_RULES) {
    if (rule.match.test(s)) return rule.type;
  }
  return 'clinical';
}

function normalizeExpenseCategory(raw) {
  return String(raw || 'other')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '') || 'other';
}

function isCogsCategory(cat) {
  const c = normalizeExpenseCategory(cat);
  if (COGS_CATEGORIES.has(c)) return true;
  return /supply|stock|reagent|pharmacy|material|consumable|inventory/.test(c);
}

function isPayrollCategory(cat) {
  const c = normalizeExpenseCategory(cat);
  return /payroll|salary|salaries|wage|staff_cost/.test(c);
}

async function q1(pool, sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows?.[0] || null;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn('[director-monthly-pl]', err.message);
    return null;
  }
}

async function qAll(pool, sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows || [];
  } catch (_) {
    return [];
  }
}

function listRecentMonths(count = 4) {
  const months = [];
  const today = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ label: monthLabel(d.getFullYear(), d.getMonth() + 1), value });
  }
  return months;
}

function resolveMonthRange(query = {}) {
  const months = listRecentMonths(24);
  const monthKey = String(query.month || '').trim();
  let anchor = parseMonthInput(monthKey);
  if (!anchor) {
    const picked = months[0];
    anchor = parseMonthInput(picked?.value || '');
  }
  if (!anchor) anchor = new Date();
  const start = toIsoDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const end = toIsoDate(endOfMonth(anchor));
  const value = start.slice(0, 7);
  const picked = months.find((m) => m.value === value) || {
    label: monthLabel(anchor.getFullYear(), anchor.getMonth() + 1),
    value,
  };
  return {
    period: 'month',
    start,
    end,
    anchor: start,
    label: picked.label,
    monthKey: value,
  };
}

async function fetchBilledCollected(pool, start, end) {
  const collectedRow = await q1(
    pool,
    `SELECT COALESCE(SUM(total_amount),0) AS s, COUNT(*) AS c
       FROM tbl_payment_ticket
      WHERE LOWER(TRIM(COALESCE(status,''))) = 'paid'
        AND paid_at IS NOT NULL
        AND DATE(paid_at) BETWEEN ? AND ?`,
    [start, end]
  );
  const billedRow = await q1(
    pool,
    `SELECT COALESCE(SUM(total_amount),0) AS s, COUNT(*) AS c
       FROM tbl_payment_ticket
      WHERE DATE(created_at) BETWEEN ? AND ?
        AND LOWER(TRIM(COALESCE(status,''))) IN ('paid','pending','partial','issued','open')`,
    [start, end]
  );
  const totalCollected = n(collectedRow?.s);
  const totalBilled = Math.max(n(billedRow?.s), totalCollected);
  const outstanding = Math.max(0, totalBilled - totalCollected);
  return {
    total_billed: Math.round(totalBilled),
    total_collected: Math.round(totalCollected),
    outstanding: Math.round(outstanding),
    collection_rate_pct: pct(totalCollected, totalBilled),
  };
}

function buildRevenueSources(totals) {
  const sources = REVENUE_SOURCE_DEFS.map((def) => {
    const amount = def.keys.reduce((sum, key) => sum + n(totals[key]), 0);
    return { source: def.label, total_revenue: Math.round(amount), pct_of_total: 0 };
  }).filter((s) => s.total_revenue > 0);
  const other = ['radiology', 'service', 'other'].reduce((sum, key) => sum + n(totals[key]), 0);
  if (other > 0) {
    const ipd = sources.find((s) => s.source === 'IPD charges');
    if (ipd) ipd.total_revenue += Math.round(other);
    else sources.push({ source: 'Other services', total_revenue: Math.round(other), pct_of_total: 0 });
  }
  const total = sources.reduce((s, r) => s + r.total_revenue, 0);
  for (const s of sources) s.pct_of_total = pct(s.total_revenue, total);
  return sources.sort((a, b) => b.total_revenue - a.total_revenue);
}

async function fetchPayrollByDept(pool, year, month) {
  const rows = await qAll(
    pool,
    `SELECT COALESCE(NULLIF(TRIM(e.primary_department), ''), 'General') AS dept_name,
            COUNT(DISTINCT pr.employee_id) AS headcount,
            COALESCE(SUM(pr.gross_salary), 0) AS total_payroll
       FROM tbl_hms_payroll_record pr
       INNER JOIN tbl_employee e ON e.id = pr.employee_id
      WHERE pr.year = ? AND pr.month = ?
      GROUP BY COALESCE(NULLIF(TRIM(e.primary_department), ''), 'General')
      ORDER BY total_payroll DESC`,
    [year, month]
  );
  const total = rows.reduce((s, r) => s + n(r.total_payroll), 0);
  return rows.map((r) => ({
    dept_name: String(r.dept_name || 'General'),
    dept_type: deptType(r.dept_name),
    headcount: n(r.headcount),
    total_payroll: Math.round(n(r.total_payroll)),
    pct_of_payroll: pct(n(r.total_payroll), total),
  }));
}

async function fetchTotalPayroll(pool, year, month) {
  const row = await q1(
    pool,
    `SELECT COALESCE(SUM(gross_salary), 0) AS s FROM tbl_hms_payroll_record WHERE year = ? AND month = ?`,
    [year, month]
  );
  return Math.round(n(row?.s));
}

async function fetchExpenses(pool, start, end, prevStart, prevEnd) {
  const curr = await finApDetailExpenseRows(pool, 1, start, end);
  const prev = await finApDetailExpenseRows(pool, 1, prevStart, prevEnd);
  const byCat = new Map();
  const prevByCat = new Map();

  for (const row of curr.rows || []) {
    const cat = normalizeExpenseCategory(row.category);
    byCat.set(cat, n(byCat.get(cat)) + n(row.amount_xaf));
  }
  for (const row of prev.rows || []) {
    const cat = normalizeExpenseCategory(row.category);
    prevByCat.set(cat, n(prevByCat.get(cat)) + n(row.amount_xaf));
  }

  const cats = new Set([...byCat.keys(), ...prevByCat.keys()]);
  const expenses = [];
  for (const category of cats) {
    if (isPayrollCategory(category)) continue;
    const actual = Math.round(n(byCat.get(category)));
    if (!actual) continue;
    const prevActual = n(prevByCat.get(category));
    const budgeted = Math.round(prevActual > 0 ? prevActual * 1.02 : actual * 0.95);
    expenses.push({
      category,
      actual_expense: actual,
      budgeted,
      variance: actual - budgeted,
    });
  }
  return expenses.sort((a, b) => b.actual_expense - a.actual_expense).slice(0, 12);
}

function splitExpenses(expenses) {
  let cogs = 0;
  let opex = 0;
  for (const e of expenses) {
    if (isCogsCategory(e.category)) cogs += n(e.actual_expense);
    else opex += n(e.actual_expense);
  }
  return { cogs: Math.round(cogs), opex: Math.round(opex) };
}

async function fetchDeptRevenue(pool, start, end, totals) {
  const visitRows = await qAll(
    pool,
    `SELECT COALESCE(NULLIF(TRIM(e.primary_department), ''), 'General') AS dept_name,
            COUNT(v.id) AS visits
       FROM tbl_opd_visit v
       LEFT JOIN tbl_employee e ON e.id = v.assigned_doctor_id
      WHERE v.visit_date BETWEEN ? AND ?
      GROUP BY COALESCE(NULLIF(TRIM(e.primary_department), ''), 'General')`,
    [start, end]
  );
  const admitRows = await qAll(
    pool,
    `SELECT COALESCE(NULLIF(TRIM(admitting_department), ''), 'General Ward') AS dept_name,
            COUNT(*) AS admissions
       FROM tbl_admission
      WHERE DATE(admitted_at) BETWEEN ? AND ?
      GROUP BY COALESCE(NULLIF(TRIM(admitting_department), ''), 'General Ward')`,
    [start, end]
  );

  const deptMap = new Map();
  const add = (name, revenue) => {
    const key = String(name || 'General');
    deptMap.set(key, n(deptMap.get(key)) + revenue);
  };

  const opdTotal = n(totals.consultation);
  const visitSum = visitRows.reduce((s, r) => s + n(r.visits), 0) || 1;
  for (const r of visitRows) {
    add(r.dept_name, (n(r.visits) / visitSum) * opdTotal);
  }

  const ipdTotal = n(totals.nursing) + n(totals.maternity) + n(totals.material);
  const admitSum = admitRows.reduce((s, r) => s + n(r.admissions), 0) || 1;
  for (const r of admitRows) {
    add(r.dept_name, (n(r.admissions) / admitSum) * ipdTotal);
  }

  add('Surgery', n(totals.surgery));
  add('Radiology', n(totals.radiology));
  add('Laboratory', n(totals.laboratory));
  add('Pharmacy', n(totals.pharmacy));

  return deptMap;
}

async function fetchDeptPL(pool, start, end, totals, payrollRows, expenses) {
  const revenueMap = await fetchDeptRevenue(pool, start, end, totals);
  const payrollMap = new Map(payrollRows.map((p) => [p.dept_name, p]));
  const allDepts = new Set([...revenueMap.keys(), ...payrollMap.keys()]);

  const totalCogs = splitExpenses(expenses).cogs;
  const totalRev = [...revenueMap.values()].reduce((s, v) => s + v, 0) || 1;

  const rows = [];
  for (const dept_name of allDepts) {
    const revenue = Math.round(n(revenueMap.get(dept_name)));
    const payroll = payrollMap.get(dept_name);
    const payroll_cost = Math.round(n(payroll?.total_payroll));
    const direct_cost = Math.round((revenue / totalRev) * totalCogs);
    const gross_profit = revenue - direct_cost - payroll_cost;
    rows.push({
      dept_name,
      dept_type: deptType(dept_name),
      revenue,
      direct_cost,
      payroll_cost,
      gross_profit: Math.round(gross_profit),
      margin_pct: revenue > 0 ? pct(gross_profit, revenue) : null,
    });
  }
  return rows.sort((a, b) => b.revenue - a.revenue).slice(0, 15);
}

async function fetchClaimsAging(pool) {
  const rows = await qAll(
    pool,
    `SELECT id, billed_amount, status, created_at,
            DATEDIFF(CURDATE(), DATE(created_at)) AS days_out
       FROM tbl_insurance_claim
      WHERE LOWER(TRIM(COALESCE(status,''))) IN ('pending','submitted','open','processing')`
  );
  const buckets = [
    { aging_bucket: '0–30 days', min: 0, max: 30, claim_count: 0, pending_amount: 0, days: [] },
    { aging_bucket: '31–60 days', min: 31, max: 60, claim_count: 0, pending_amount: 0, days: [] },
    { aging_bucket: '61–90 days', min: 61, max: 90, claim_count: 0, pending_amount: 0, days: [] },
    { aging_bucket: 'Over 90 days', min: 91, max: 99999, claim_count: 0, pending_amount: 0, days: [] },
  ];
  for (const row of rows) {
    const days = n(row.days_out);
    const amt = n(row.billed_amount);
    const bucket = buckets.find((b) => days >= b.min && days <= b.max) || buckets[3];
    bucket.claim_count += 1;
    bucket.pending_amount += amt;
    bucket.days.push(days);
  }
  return buckets.map((b) => ({
    aging_bucket: b.aging_bucket,
    claim_count: b.claim_count,
    pending_amount: Math.round(b.pending_amount),
    avg_days_outstanding: b.days.length ? Math.round(b.days.reduce((s, d) => s + d, 0) / b.days.length) : 0,
  }));
}

async function fetchTrend(pool, monthCount = 6) {
  const trend = [];
  const today = new Date();
  for (let i = monthCount - 1; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const start = toIsoDate(d);
    const end = toIsoDate(endOfMonth(d));
    const coll = await fetchBilledCollected(pool, start, end);
    trend.push({
      month_label: monthLabel(d.getFullYear(), d.getMonth() + 1),
      total_billed: coll.total_billed,
      total_collected: coll.total_collected,
      mom_growth_pct: null,
    });
  }
  for (let i = 1; i < trend.length; i += 1) {
    const prev = trend[i - 1].total_collected;
    const curr = trend[i].total_collected;
    trend[i].mom_growth_pct = prev ? round1(((curr - prev) / prev) * 100) : null;
  }
  return trend;
}

async function fetchDirectorMonthlyPL(pool, range, opts = {}) {
  const { start, end, label, monthKey } = range;
  const year = parseInt(start.slice(0, 4), 10);
  const month = parseInt(start.slice(5, 7), 10);
  const prev = priorPeriodRange(range);
  const prevStart = toIsoDate(new Date(year, month - 2, 1));
  const prevEnd = toIsoDate(endOfMonth(new Date(year, month - 2, 1)));

  const [revenuePack, prevRevenuePack, collection, autoExpenses, claimsAging, trend] = await Promise.all([
    fetchDirectorCashierRevenue(pool, { start, end, period: 'month', label }),
    fetchDirectorCashierRevenue(pool, { start: prevStart, end: prevEnd, period: 'month' }),
    fetchBilledCollected(pool, start, end),
    fetchExpenses(pool, start, end, prevStart, prevEnd),
    fetchClaimsAging(pool),
    fetchTrend(pool, 6),
  ]);

  const costs = await resolveMonthlyCosts(
    pool,
    { year, month, start, end, prevExpenses: autoExpenses },
    1
  );

  const payroll = costs.payroll;
  const expenses = costs.expenses ?? autoExpenses;
  const totals = revenuePack.totals || {};
  const totalRevenue = Math.round(n(revenuePack.grandTotal));
  const prevRevenue = Math.round(n(prevRevenuePack.grandTotal));
  const { cogs: totalCogs, opex: totalOpex } = splitExpenses(expenses);
  const totalPayroll = costs.total_payroll;
  const grossProfit = totalRevenue - totalCogs;
  const ebitda = grossProfit - totalPayroll - totalOpex;

  const summary = {
    total_revenue: totalRevenue,
    total_cogs: totalCogs,
    gross_profit: Math.round(grossProfit),
    gross_margin_pct: pct(grossProfit, totalRevenue),
    total_payroll: totalPayroll,
    total_opex: totalOpex,
    ebitda: Math.round(ebitda),
    ebitda_margin_pct: pct(ebitda, totalRevenue),
    prev_revenue: prevRevenue,
    revenue_mom_pct: prevRevenue ? round1(((totalRevenue - prevRevenue) / prevRevenue) * 100) : null,
  };

  const deptPL = await fetchDeptPL(pool, start, end, totals, payroll, expenses);
  const revenueSources = buildRevenueSources(totals);
  const months = listRecentMonths(4);

  const model = buildVisibleMonthlyModel(opts.aclPack || {});

  return {
    range: { period: 'month', start, end, label, month: monthKey },
    months,
    summary,
    revenueSources,
    collection,
    expenses,
    payroll,
    deptPL,
    claimsAging,
    trend,
    visibleKpis: model.kpis.map((k) => k.id),
    visiblePanels: model.panels.map((p) => p.id),
    costSources: {
      payroll: costs.payroll_source,
      expenses: costs.expense_source,
      integrated_payroll_total: costs.integrated?.payroll?.total || 0,
      integrated_expense_total: costs.integrated?.expenses?.total || 0,
    },
    manualCosts: {
      prefs: costs.prefs,
      line_count: costs.lines?.length || 0,
    },
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  fetchDirectorMonthlyPL,
  resolveMonthRange,
  listRecentMonths,
};
