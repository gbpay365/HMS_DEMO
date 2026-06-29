'use strict';

const { buildCashierDailySummary } = require('./cashierDailySummary');
const { buildVisibleDashboardModel } = require('./cashierDashboardCatalog');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function resolveCashierScope(req, res) {
  const perms = res.locals.userPerms || req.session?.perms || [];
  if (perms.includes('*')) return { allCashiers: true, paidBy: 0 };
  if (perms.some((p) => /billing\.read|financials\.read|accounting\.read/.test(String(p)))) {
    return { allCashiers: true, paidBy: 0 };
  }
  if (perms.some((p) => /cashier\.(read|write)/.test(String(p)))) {
    return {
      allCashiers: false,
      paidBy: parseInt(String(req.session?.userId || req.session?.user?.id || 0), 10) || 0,
    };
  }
  return { allCashiers: false, paidBy: 0 };
}

function paymentAmount(summary, key) {
  const row = (summary.paymentRows || []).find((r) => r.key === key);
  return n(row?.amount);
}

function totalReceivedAmount(summary) {
  if (summary.summary?.grandTotal != null) return n(summary.summary.grandTotal);
  return (summary.paymentRows || []).reduce((sum, r) => sum + n(r.amount), 0);
}

async function fetchTodayDisbursementTotal(pool, scope = {}) {
  const today = new Date().toISOString().split('T')[0];
  const allCashiers = !!scope.allCashiers;
  const paidBy = parseInt(String(scope.paidBy || 0), 10) || 0;
  try {
    const { ensureCashierDisbursementSchema } = require('./ensureCashierDisbursementSchema');
    await ensureCashierDisbursementSchema(pool);
    const params = [today];
    let sql = `SELECT COALESCE(SUM(amount), 0) AS total
                 FROM tbl_cashier_disbursement
                WHERE DATE(created_at) = ?
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

function buildKpiFromSummary(summary, disbursementTotal = 0) {
  const received = totalReceivedAmount(summary);
  const disb = n(disbursementTotal);
  return {
    totalReceived: { value: received },
    totalDisbursement: { value: disb },
    balance: { value: received - disb },
    receivedCash: { value: paymentAmount(summary, 'cash') },
    receivedMomo: { value: paymentAmount(summary, 'momo') },
    receivedOm: { value: paymentAmount(summary, 'om') },
    receivedBetterpay: { value: paymentAmount(summary, 'betterpay') },
    receivedWallet: { value: paymentAmount(summary, 'wallet') },
  };
}

async function fetchCashierDashboard(pool, opts = {}) {
  const today = new Date().toISOString().split('T')[0];
  const model = buildVisibleDashboardModel(opts.aclPack || {});
  const scope = opts.scope || { allCashiers: true, paidBy: 0 };

  const summary = await buildCashierDailySummary(pool, {
    period: 'day',
    date: today,
    allCashiers: scope.allCashiers,
    paidBy: scope.paidBy,
  });

  const disbursementTotal = await fetchTodayDisbursementTotal(pool, scope);
  const kpi = buildKpiFromSummary(summary, disbursementTotal);

  return {
    ok: true,
    date: today,
    scope: scope.allCashiers ? 'all' : 'mine',
    generatedAt: summary.generatedAt,
    kpi,
    panels: {},
    summary: summary.summary || {},
    aclModel: model,
  };
}

module.exports = {
  fetchCashierDashboard,
  resolveCashierScope,
  buildKpiFromSummary,
  fetchTodayDisbursementTotal,
};
