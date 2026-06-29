'use strict';

const { loadPaidTickets, resolvePeriodBounds } = require('./cashierBatchPrint');
const {
  buildCashierDailySummary,
  paymentMethodKey,
  paymentMethodLabel,
  fmtMoney,
} = require('./cashierDailySummary');
const { fetchTodayDisbursementTotal } = require('./cashierDashboard');
const { loadEodRecord } = require('./cashierEodReconciliation');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(dt) {
  if (!dt) return '—';
  const x = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function inferServiceLabel(linesJson) {
  try {
    const lines = typeof linesJson === 'string' ? JSON.parse(linesJson) : linesJson;
    if (!Array.isArray(lines) || !lines.length) return 'General service';
    if (lines.length === 1) return String(lines[0].description || 'General service');
    const first = String(lines[0].description || 'Item').trim();
    return `${first} +${lines.length - 1}`;
  } catch (_) {
    return 'General service';
  }
}

function bucketTotals(paymentRows) {
  const map = {};
  for (const row of paymentRows || []) {
    map[row.key] = n(row.amount);
  }
  const mobile =
    n(map.momo) + n(map.om) + n(map.betterpay) + n(map.ussd) + n(map.paystack);
  return {
    cash: n(map.cash),
    card: n(map.pos) + n(map.card),
    mobile,
    insurance: n(map.insurance),
  };
}

function shiftMethodDisplay(pmKey) {
  const k = String(pmKey || 'cash').toLowerCase();
  if (k === 'cash') return 'Cash';
  if (k === 'pos' || k === 'card') return 'Card';
  if (['momo', 'om', 'betterpay', 'ussd', 'paystack', 'mobile_money', 'mobile money'].includes(k)) {
    return 'Mobile';
  }
  if (k === 'insurance') return 'Insurance';
  if (k === 'wallet') return 'Wallet';
  return paymentMethodLabel(k);
}

async function fetchTodayCashRefunds(pool, scope = {}) {
  const today = todayIso();
  const allCashiers = !!scope.allCashiers;
  const paidBy = parseInt(String(scope.paidBy || 0), 10) || 0;
  let total = 0;
  try {
    const { ensureCashierDisbursementSchema } = require('./ensureCashierDisbursementSchema');
    await ensureCashierDisbursementSchema(pool);
    const params = [today];
    let sql = `SELECT COALESCE(SUM(amount), 0) AS total
                 FROM tbl_cashier_disbursement
                WHERE DATE(created_at) = ?
                  AND status = 'posted'
                  AND LOWER(TRIM(COALESCE(payment_method, 'cash'))) IN ('cash', 'espèces', 'especes')`;
    if (!allCashiers && paidBy > 0) {
      sql += ' AND created_by = ?';
      params.push(paidBy);
    }
    const [[row]] = await pool.query(sql, params);
    total += n(row?.total);
  } catch (_) {
    /* disbursement refunds optional */
  }
  try {
    const { ensureCashierRefundSchema } = require('./ensureCashierRefundSchema');
    await ensureCashierRefundSchema(pool);
    const params = [today];
    let sql = `SELECT COALESCE(SUM(amount), 0) AS total
                 FROM tbl_cashier_refund_request
                WHERE DATE(approved_at) = ?
                  AND status = 'paid'
                  AND LOWER(TRIM(COALESCE(refund_method, 'cash'))) = 'cash'`;
    if (!allCashiers && paidBy > 0) {
      sql += ' AND approved_by = ?';
      params.push(paidBy);
    }
    const [[row]] = await pool.query(sql, params);
    total += n(row?.total);
  } catch (_) {
    /* refund table optional */
  }
  return total;
}

async function resolveCashierNames(pool, userIds) {
  const ids = [...new Set(userIds.filter((id) => id != null))];
  if (!ids.length) return {};
  const out = {};
  try {
    const { loadCashierMapByEmployeeIds } = require('./cashierIdentity');
    const cashierMap = await loadCashierMapByEmployeeIds(pool, ids);
    for (const id of ids) {
      if (cashierMap[id]?.display) {
        out[id] = cashierMap[id].display;
        continue;
      }
    }
    const missing = ids.filter((id) => !out[id]);
    if (missing.length) {
      const [emps] = await pool.query(
        `SELECT id, first_name, last_name, username FROM tbl_employee WHERE id IN (${missing.map(() => '?').join(',')})`,
        missing
      ).catch(() => [[]]);
      for (const e of emps || []) {
        const name = [e.first_name, e.last_name].filter(Boolean).join(' ').trim();
        out[e.id] = name || e.username || `User #${e.id}`;
      }
    }
  } catch (_) {
    /* keep */
  }
  for (const id of ids) {
    if (!out[id]) out[id] = `User #${id}`;
  }
  return out;
}

function shortCashierName(raw) {
  const parts = String(raw || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

function normalizeScopeUserId(allCashiers, paidBy) {
  if (allCashiers) return 0;
  return parseInt(String(paidBy || 0), 10) || 0;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ allCashiers?: boolean, paidBy?: number, facilityId?: number, date?: string }} opts
 */
async function fetchCashierShiftSummary(pool, opts = {}) {
  const bounds = resolvePeriodBounds('day', opts.date || todayIso());
  const accessOpts = {
    period: 'day',
    date: bounds.start,
    allCashiers: !!opts.allCashiers,
    paidBy: opts.paidBy || 0,
  };

  const summary = await buildCashierDailySummary(pool, accessOpts);
  const tickets = await loadPaidTickets(pool, bounds, accessOpts);
  const disbursementTotal = await fetchTodayDisbursementTotal(pool, accessOpts);
  const cashRefunds = await fetchTodayCashRefunds(pool, accessOpts);

  const buckets = bucketTotals(summary.paymentRows);
  const fid = Math.max(1, parseInt(String(opts.facilityId || 1), 10) || 1);
  const scopeUserId = normalizeScopeUserId(accessOpts.allCashiers, accessOpts.paidBy);
  const saved = await loadEodRecord(pool, fid, bounds.start, scopeUserId).catch(() => null);
  const openingFloat = saved ? n(saved.opening_float) : 0;
  const expectedCash = openingFloat + buckets.cash - cashRefunds;

  const sorted = [...tickets].sort((a, b) => {
    const ta = new Date(a.paid_at || a.created_at).getTime();
    const tb = new Date(b.paid_at || b.created_at).getTime();
    return tb - ta;
  });

  const cashierIds = sorted.map((t) => t.paid_by || t.created_by).filter(Boolean);
  const cashierNames = await resolveCashierNames(pool, cashierIds);

  const transactions = sorted.map((ticket, index) => {
    const pmKey = paymentMethodKey(ticket.payment_method);
    const uid = ticket.paid_by || ticket.created_by;
    const cashierRaw = cashierNames[uid] || '—';
    const cashierShort = shortCashierName(cashierRaw);
    return {
      seq: sorted.length - index,
      ticket_id: ticket.id,
      ticket_code: ticket.ticket_code,
      patient_name: [ticket.first_name, ticket.last_name].filter(Boolean).join(' ').trim() || '—',
      service_label: inferServiceLabel(ticket.lines_json),
      amount: n(ticket.total_amount),
      amount_fmt: fmtMoney(ticket.total_amount),
      payment_method: shiftMethodDisplay(pmKey),
      payment_method_key: pmKey,
      paid_time: fmtTime(ticket.paid_at || ticket.created_at),
      cashier_name: cashierShort,
    };
  });

  const chartSeries = [
    { key: 'cash', label: 'Cash', value: buckets.cash, color: '#0d9488' },
    { key: 'card', label: 'Card', value: buckets.card, color: '#1e40af' },
    { key: 'mobile', label: 'Mobile', value: buckets.mobile, color: '#7c3aed' },
    { key: 'insurance', label: 'Insurance', value: buckets.insurance, color: '#0f766e' },
  ];

  return {
    bounds,
    methodTotals: {
      cash: buckets.cash,
      cash_fmt: fmtMoney(buckets.cash),
      card: buckets.card,
      card_fmt: fmtMoney(buckets.card),
      mobile: buckets.mobile,
      mobile_fmt: fmtMoney(buckets.mobile),
      insurance: buckets.insurance,
      insurance_fmt: fmtMoney(buckets.insurance),
    },
    cashSummary: {
      opening_float: openingFloat,
      opening_float_fmt: fmtMoney(openingFloat),
      cash_sales: buckets.cash,
      cash_sales_fmt: fmtMoney(buckets.cash),
      cash_refunds: cashRefunds,
      cash_refunds_fmt: fmtMoney(cashRefunds),
      expected_cash: expectedCash,
      expected_cash_fmt: fmtMoney(expectedCash),
      total_disbursement: disbursementTotal,
    },
    transactions,
    chartSeries,
    ticket_count: transactions.length,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  fetchCashierShiftSummary,
  bucketTotals,
  shiftMethodDisplay,
};
