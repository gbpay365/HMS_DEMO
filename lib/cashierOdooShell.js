'use strict';

function cashierUserInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'ZA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Shared locals for cashier module shell pages. */
function loadCashierOdooLocals(req, opts = {}) {
  const sessionCashier = req.session?.cashier || null;
  const userDisplayName = opts.userDisplayName || req.session?.user?.name || 'Cashier';
  const cashierIdentity = sessionCashier
    ? {
        code: sessionCashier.cashier_code || sessionCashier.code || '',
        identity: sessionCashier.cashier_identity || sessionCashier.identity || '',
      }
    : null;
  return {
    cashierOdooApp: true,
    cashierIdentity,
    userDisplayName,
    cashierUserInitials: cashierUserInitials(userDisplayName),
    cashierUserRole: cashierIdentity?.identity || opts.cashierUserRole || 'Cashier',
    flash: opts.flash || null,
    error: opts.error || null,
  };
}

function cashierRosterPaths(kind) {
  const slug = kind === 'nurse' ? 'nurse-roster' : 'doctor-roster';
  return {
    base: `/${slug}?from=cashier`,
    save: `/${slug}/save`,
    copy: `/${slug}/copy`,
    cashierPage: slug,
  };
}

function rosterPageTitle(kind) {
  return kind === 'nurse' ? 'Nurse Shift Roster' : 'Doctor Duty Roster';
}

function formatShiftDateTime() {
  const now = new Date();
  return now.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Cashier module shell locals for SSR roster pages. */
function loadCashierRosterShellLocals(req, kind, opts = {}) {
  const paths = cashierRosterPaths(kind);
  return {
    ...loadCashierOdooLocals(req, opts),
    cashierShell: true,
    cashierPage: paths.cashierPage,
    rosterBasePath: paths.base,
    rosterSavePath: paths.save,
    rosterCopyPath: paths.copy,
    rosterPageTitle: opts.rosterPageTitle || rosterPageTitle(kind),
    pendingCount: opts.pendingCount || 0,
    billingPendingCount: opts.billingPendingCount || 0,
    balanceLabel: opts.balanceLabel || '',
    dateTimeLabel: opts.dateTimeLabel || formatShiftDateTime(),
  };
}

/** Async shell locals — shift bar balance + pending counts for roster chrome. */
async function loadCashierRosterShellLocalsAsync(pool, req, res, kind, opts = {}) {
  const base = loadCashierRosterShellLocals(req, kind, opts);
  let balanceLabel = '';
  let pendingCount = 0;
  let billingPendingCount = 0;
  let insurancePendingCount = 0;

  try {
    const { resolveCashierScope, buildKpiFromSummary, fetchTodayDisbursementTotal } = require('./cashierDashboard');
    const { buildCashierDailySummary, fmtMoney } = require('./cashierDailySummary');
    const cashierScope = resolveCashierScope(req, res);
    const dailySummary = await buildCashierDailySummary(pool, {
      period: 'day',
      allCashiers: cashierScope.allCashiers,
      paidBy: cashierScope.paidBy,
    });
    const disbursementTotal = await fetchTodayDisbursementTotal(pool, cashierScope);
    const todayTotals = buildKpiFromSummary(dailySummary, disbursementTotal);
    balanceLabel = fmtMoney(todayTotals?.balance?.value ?? 0);
  } catch (_) {
    /* optional */
  }

  try {
    const [[row]] = await pool
      .query(`SELECT COUNT(*) AS c FROM tbl_payment_ticket WHERE status = 'pending'`)
      .catch(() => [[{ c: 0 }]]);
    pendingCount = parseInt(row?.c, 10) || 0;
  } catch (_) {
    /* optional */
  }

  try {
    const { fetchCashierBillingInvoices } = require('./cashierBillingInvoices');
    const billingData = await fetchCashierBillingInvoices(pool, { limit: 1 }).catch(() => null);
    billingPendingCount = parseInt(billingData?.summary?.pending_count, 10) || 0;
  } catch (_) {
    /* optional */
  }

  try {
    const { fetchCashierInsuranceClaims } = require('./cashierInsuranceClaims');
    const insuranceData = await fetchCashierInsuranceClaims(pool, { limit: 1 }).catch(() => null);
    insurancePendingCount = parseInt(insuranceData?.summary?.pending_count, 10) || 0;
  } catch (_) {
    /* optional */
  }

  return {
    ...base,
    balanceLabel,
    pendingCount,
    billingPendingCount,
    insurancePendingCount,
  };
}

function rosterRedirectBase(req, defaultBase) {
  if (req.body && String(req.body.cashier_shell || '') === '1') {
    if (String(defaultBase).includes('nurse')) return '/nurse-roster?from=cashier';
    if (String(defaultBase).includes('doctor')) return '/doctor-roster?from=cashier';
  }
  if (req.query && String(req.query.from || '') === 'cashier') {
    if (String(defaultBase).includes('nurse')) return '/nurse-roster?from=cashier';
    if (String(defaultBase).includes('doctor')) return '/doctor-roster?from=cashier';
  }
  return defaultBase;
}

module.exports = {
  loadCashierOdooLocals,
  cashierUserInitials,
  cashierRosterPaths,
  loadCashierRosterShellLocals,
  loadCashierRosterShellLocalsAsync,
  rosterPageTitle,
  rosterRedirectBase,
};
