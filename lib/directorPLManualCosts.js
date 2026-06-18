'use strict';

const EXPENSE_PRESETS = [
  { line_type: 'cogs', label: 'Medical supplies', category: 'medical_supplies' },
  { line_type: 'cogs', label: 'Pharmacy stock', category: 'pharmacy_stock' },
  { line_type: 'cogs', label: 'Lab reagents', category: 'lab_reagents' },
  { line_type: 'opex', label: 'Utilities', category: 'utilities' },
  { line_type: 'opex', label: 'Maintenance', category: 'maintenance' },
  { line_type: 'opex', label: 'Admin & office', category: 'admin' },
  { line_type: 'opex', label: 'Insurance', category: 'insurance' },
  { line_type: 'opex', label: 'Other operating', category: 'other' },
];

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function roundXaf(v) {
  return Math.round(n(v));
}

function parseMonthKey(monthKey) {
  const m = String(monthKey || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

async function ensureSchema(pool) {
  const fn = require('./ensureDirectorPLManualSchema');
  await fn(pool);
}

async function fetchPrefs(pool, year, month, facilityId = 1) {
  await ensureSchema(pool);
  const [[row]] = await pool.query(
    `SELECT use_hms_payroll, use_hms_expenses, notes
       FROM tbl_director_pl_manual_prefs
      WHERE facility_id = ? AND year = ? AND month = ? LIMIT 1`,
    [facilityId, year, month]
  );
  return {
    use_hms_payroll: row ? !!row.use_hms_payroll : false,
    use_hms_expenses: row ? !!row.use_hms_expenses : true,
    notes: row?.notes || '',
  };
}

async function fetchLines(pool, year, month, facilityId = 1) {
  await ensureSchema(pool);
  const [rows] = await pool.query(
    `SELECT id, line_type, label, dept_name, amount_xaf, notes
       FROM tbl_director_pl_manual_line
      WHERE facility_id = ? AND year = ? AND month = ?
      ORDER BY line_type, id`,
    [facilityId, year, month]
  );
  return (rows || []).map((r) => ({
    id: r.id,
    line_type: r.line_type,
    label: String(r.label || ''),
    dept_name: r.dept_name ? String(r.dept_name) : null,
    amount_xaf: roundXaf(r.amount_xaf),
    notes: r.notes ? String(r.notes) : '',
  }));
}

async function fetchIntegratedPayrollSnapshot(pool, year, month) {
  const [[totalRow]] = await pool.query(
    `SELECT COALESCE(SUM(gross_salary), 0) AS total, COUNT(*) AS record_count
       FROM tbl_hms_payroll_record WHERE year = ? AND month = ?`,
    [year, month]
  );
  const [deptRows] = await pool.query(
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
  const total = roundXaf(totalRow?.total);
  const byDept = (deptRows || []).map((r) => ({
    dept_name: String(r.dept_name || 'General'),
    headcount: n(r.headcount),
    total_payroll: roundXaf(r.total_payroll),
  }));
  return {
    total,
    record_count: n(totalRow?.record_count),
    by_dept: byDept,
    source: 'tbl_hms_payroll_record',
  };
}

async function fetchIntegratedExpenseSnapshot(pool, start, end, facilityId = 1) {
  const { finApDetailExpenseRows } = require('./hmsFinAccountsPayable');
  const pack = await finApDetailExpenseRows(pool, facilityId, start, end);
  return {
    total: roundXaf(pack.sumAp),
    row_count: (pack.rows || []).length,
    source: 'tbl_expense',
  };
}

function payrollRowsFromManual(lines) {
  const payrollLines = lines.filter((l) => l.line_type === 'payroll_dept' && l.amount_xaf > 0);
  const total = payrollLines.reduce((s, l) => s + l.amount_xaf, 0);
  const rows = payrollLines.map((l) => ({
    dept_name: l.dept_name || l.label || 'General',
    dept_type: 'clinical',
    headcount: 0,
    total_payroll: l.amount_xaf,
    pct_of_payroll: total ? Math.round((l.amount_xaf / total) * 1000) / 10 : 0,
  }));
  return { rows, total };
}

function expensesFromManual(lines, prevExpenses = []) {
  const manualExp = lines.filter((l) => (l.line_type === 'cogs' || l.line_type === 'opex') && l.amount_xaf > 0);
  const prevByCat = new Map((prevExpenses || []).map((e) => [e.category, e.budgeted]));
  return manualExp.map((l) => {
    const category = String(l.label || l.line_type).toLowerCase().replace(/\s+/g, '_');
    const actual = l.amount_xaf;
    const prevBudget = n(prevByCat.get(category));
    const budgeted = Math.round(prevBudget > 0 ? prevBudget * 1.02 : actual * 0.95);
    return {
      category,
      actual_expense: actual,
      budgeted,
      variance: actual - budgeted,
      line_type: l.line_type,
    };
  }).sort((a, b) => b.actual_expense - a.actual_expense);
}

/**
 * Resolve payroll + expenses for monthly P&L.
 * Manual lines override integrated sources when prefs say so (default: manual payroll, HMS expenses if no manual).
 */
async function resolveMonthlyCosts(pool, { year, month, start, end, prevExpenses }, facilityId = 1) {
  const [prefs, lines, integratedPayroll, integratedExpenses] = await Promise.all([
    fetchPrefs(pool, year, month, facilityId),
    fetchLines(pool, year, month, facilityId),
    fetchIntegratedPayrollSnapshot(pool, year, month),
    fetchIntegratedExpenseSnapshot(pool, start, end, facilityId),
  ]);

  const manualPayroll = payrollRowsFromManual(lines);
  const manualExpenseLines = lines.filter((l) => l.line_type === 'cogs' || l.line_type === 'opex');
  const hasManualPayroll = manualPayroll.total > 0;
  const hasManualExpenses = manualExpenseLines.some((l) => l.amount_xaf > 0);

  let payroll;
  let payrollSource;
  if (prefs.use_hms_payroll && integratedPayroll.total > 0) {
    const total = integratedPayroll.total;
    payroll = integratedPayroll.by_dept.map((r) => ({
      ...r,
      pct_of_payroll: total ? Math.round((r.total_payroll / total) * 1000) / 10 : 0,
    }));
    payrollSource = 'hms_payroll';
  } else if (hasManualPayroll) {
    payroll = manualPayroll.rows;
    payrollSource = 'manual';
  } else if (integratedPayroll.total > 0) {
    const total = integratedPayroll.total;
    payroll = integratedPayroll.by_dept.map((r) => ({
      ...r,
      pct_of_payroll: total ? Math.round((r.total_payroll / total) * 1000) / 10 : 0,
    }));
    payrollSource = 'hms_payroll';
  } else {
    payroll = [];
    payrollSource = 'none';
  }

  const totalPayroll = payroll.reduce((s, r) => s + n(r.total_payroll), 0);

  let expenses;
  let expenseSource;
  if (hasManualExpenses) {
    expenses = expensesFromManual(lines, prevExpenses);
    expenseSource = 'manual';
  } else if (prefs.use_hms_expenses && integratedExpenses.row_count > 0) {
    expenses = null;
    expenseSource = 'tbl_expense';
  } else {
    expenses = null;
    expenseSource = 'none';
  }

  return {
    prefs,
    lines,
    payroll,
    total_payroll: Math.round(totalPayroll),
    payroll_source: payrollSource,
    expenses,
    expense_source: expenseSource,
    integrated: {
      payroll: integratedPayroll,
      expenses: integratedExpenses,
    },
    expense_presets: EXPENSE_PRESETS,
  };
}

async function saveMonthlyCosts(pool, monthKey, payload, userId, facilityId = 1) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) throw Object.assign(new Error('Invalid month. Use YYYY-MM.'), { status: 400 });

  const { year, month } = parsed;
  await ensureSchema(pool);

  const prefs = payload.prefs || {};
  const lines = Array.isArray(payload.lines) ? payload.lines : [];

  await pool.query(
    `INSERT INTO tbl_director_pl_manual_prefs
       (facility_id, year, month, use_hms_payroll, use_hms_expenses, notes, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       use_hms_payroll = VALUES(use_hms_payroll),
       use_hms_expenses = VALUES(use_hms_expenses),
       notes = VALUES(notes),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
    [
      facilityId,
      year,
      month,
      prefs.use_hms_payroll ? 1 : 0,
      prefs.use_hms_expenses ? 1 : 0,
      String(prefs.notes || '').slice(0, 500) || null,
      userId || null,
    ]
  );

  await pool.query(
    'DELETE FROM tbl_director_pl_manual_line WHERE facility_id = ? AND year = ? AND month = ?',
    [facilityId, year, month]
  );

  for (const line of lines) {
    const lineType = String(line.line_type || '').trim();
    if (!['payroll_dept', 'cogs', 'opex'].includes(lineType)) continue;
    const amount = roundXaf(line.amount_xaf);
    if (amount <= 0) continue;
    const label = String(line.label || line.dept_name || lineType).trim().slice(0, 120);
    await pool.query(
      `INSERT INTO tbl_director_pl_manual_line
         (facility_id, year, month, line_type, label, dept_name, amount_xaf, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        facilityId,
        year,
        month,
        lineType,
        label,
        line.dept_name ? String(line.dept_name).slice(0, 120) : null,
        amount,
        line.notes ? String(line.notes).slice(0, 255) : null,
        userId || null,
      ]
    );
  }

  return fetchMonthlyCostsBundle(pool, monthKey, facilityId);
}

async function fetchMonthlyCostsBundle(pool, monthKey, facilityId = 1) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) throw Object.assign(new Error('Invalid month. Use YYYY-MM.'), { status: 400 });
  const { year, month } = parsed;
  const start = `${monthKey}-01`;
  const endDate = new Date(year, month, 0);
  const end = endDate.toISOString().slice(0, 10);

  const [prefs, lines, integratedPayroll, integratedExpenses] = await Promise.all([
    fetchPrefs(pool, year, month, facilityId),
    fetchLines(pool, year, month, facilityId),
    fetchIntegratedPayrollSnapshot(pool, year, month),
    fetchIntegratedExpenseSnapshot(pool, start, end, facilityId),
  ]);

  return {
    month: monthKey,
    prefs,
    lines,
    integrated: {
      payroll: integratedPayroll,
      expenses: integratedExpenses,
    },
    expense_presets: EXPENSE_PRESETS,
  };
}

module.exports = {
  EXPENSE_PRESETS,
  parseMonthKey,
  resolveMonthlyCosts,
  fetchMonthlyCostsBundle,
  saveMonthlyCosts,
  ensureSchema,
};
