'use strict';

const { loadPaidTickets, resolvePeriodBounds } = require('./cashierBatchPrint');
const { buildCashierDailySummary, paymentMethodKey, paymentMethodLabel, fmtMoney, STANDARD_PAYMENT_METHOD_KEYS } = require('./cashierDailySummary');
const { formatDisplayDate } = require('./hmsFormatDate');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeScopeUserId(allCashiers, paidBy) {
  if (allCashiers) return 0;
  return parseInt(String(paidBy || 0), 10) || 0;
}

function paymentRowsToMap(paymentRows) {
  const out = {};
  for (const row of paymentRows || []) {
    out[row.key] = n(row.amount);
  }
  return out;
}

function mapToPaymentRows(map) {
  const keys = new Set([...STANDARD_PAYMENT_METHOD_KEYS, ...Object.keys(map || {})]);
  const ordered = [
    ...STANDARD_PAYMENT_METHOD_KEYS,
    ...[...keys].filter((k) => !STANDARD_PAYMENT_METHOD_KEYS.includes(k)).sort(),
  ];
  return ordered
    .map((key) => ({
      key,
      label: paymentMethodLabel(key),
      amount: n(map[key]),
      amount_fmt: fmtMoney(map[key]),
    }))
    .filter((row) => row.amount !== 0 || STANDARD_PAYMENT_METHOD_KEYS.includes(row.key));
}

function computeVariance(systemMap, declaredMap) {
  const keys = new Set([...Object.keys(systemMap || {}), ...Object.keys(declaredMap || {})]);
  const out = {};
  for (const key of keys) {
    out[key] = n(declaredMap[key]) - n(systemMap[key]);
  }
  return out;
}

function varianceRows(systemMap, declaredMap) {
  const variance = computeVariance(systemMap, declaredMap);
  const hasDeclared = declaredMap && Object.keys(declaredMap).length > 0;
  const keys = new Set([
    ...STANDARD_PAYMENT_METHOD_KEYS,
    ...Object.keys(systemMap || {}),
    ...Object.keys(declaredMap || {}),
  ]);
  const ordered = [
    ...STANDARD_PAYMENT_METHOD_KEYS,
    ...[...keys].filter((k) => !STANDARD_PAYMENT_METHOD_KEYS.includes(k)).sort(),
  ];
  return ordered.map((key) => {
    const system = n(systemMap[key]);
    const declaredEntered = hasDeclared && Object.prototype.hasOwnProperty.call(declaredMap, key);
    const declared = declaredEntered ? n(declaredMap[key]) : null;
    const varAmt = declaredEntered ? n(variance[key]) : null;
    return {
      key,
      label: paymentMethodLabel(key),
      system,
      system_fmt: fmtMoney(system),
      declared: declaredEntered ? declared : null,
      declared_fmt: declaredEntered ? fmtMoney(declared) : '—',
      variance: varAmt,
      variance_fmt: varAmt != null ? fmtMoney(varAmt) : '—',
      balanced: varAmt == null ? true : Math.abs(varAmt) < 0.5,
    };
  });
}

function parseDeclaredFromBody(body, opts = {}) {
  const onSubmit = !!opts.onSubmit;
  const out = {};
  const src = body && typeof body === 'object' ? body : {};
  for (const key of STANDARD_PAYMENT_METHOD_KEYS) {
    const raw = src[`declared_${key}`];
    if (raw == null || String(raw).trim() === '') {
      if (onSubmit) out[key] = 0;
      continue;
    }
    out[key] = n(raw);
  }
  const extraKeys = src.declared_extra_keys;
  if (Array.isArray(extraKeys)) {
    for (const key of extraKeys) {
      const raw = src[`declared_${key}`];
      if (raw == null || String(raw).trim() === '') continue;
      out[String(key)] = n(raw);
    }
  }
  return out;
}

async function fetchCashierBreakdown(pool, bounds, opts = {}) {
  let sql = `
    SELECT t.paid_by AS user_id,
           COUNT(*) AS ticket_count,
           COALESCE(SUM(t.total_amount), 0) AS total_collected
      FROM tbl_payment_ticket t
     WHERE LOWER(TRIM(COALESCE(t.status,''))) = 'paid'
       AND t.paid_at IS NOT NULL
       AND DATE(t.paid_at) BETWEEN ? AND ?`;
  const params = [bounds.start, bounds.end];
  if (!opts.allCashiers && opts.paidBy > 0) {
    sql += ' AND t.paid_by = ?';
    params.push(opts.paidBy);
  }
  sql += ' GROUP BY t.paid_by ORDER BY total_collected DESC';
  const [rows] = await pool.query(sql, params).catch(() => [[]]);
  if (!rows || !rows.length) return [];

  const ids = rows.map((r) => r.user_id).filter((id) => id != null);
  let names = {};
  if (ids.length) {
    const [emps] = await pool
      .query(
        `SELECT id, first_name, last_name, username FROM tbl_employee WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      )
      .catch(() => [[]]);
    for (const e of emps || []) {
      const name = [e.first_name, e.last_name].filter(Boolean).join(' ').trim() || e.username || `User #${e.id}`;
      names[e.id] = name;
    }
  }
  return rows.map((r) => ({
    user_id: r.user_id,
    cashier_name: names[r.user_id] || (r.user_id ? `User #${r.user_id}` : '—'),
    ticket_count: n(r.ticket_count),
    total_collected: n(r.total_collected),
    total_collected_fmt: fmtMoney(r.total_collected),
  }));
}

async function fetchDayStats(pool, bounds, opts = {}) {
  let pendingSql = `
    SELECT COUNT(*) AS c, COALESCE(SUM(total_amount), 0) AS amt
      FROM tbl_payment_ticket
     WHERE DATE(created_at) BETWEEN ? AND ?
       AND LOWER(TRIM(COALESCE(status,''))) NOT IN ('paid','cancelled','void')`;
  const pendingParams = [bounds.start, bounds.end];
  if (!opts.allCashiers && opts.paidBy > 0) {
    pendingSql += ' AND created_by = ?';
    pendingParams.push(opts.paidBy);
  }
  const [[pending]] = await pool.query(pendingSql, pendingParams).catch(() => [[{ c: 0, amt: 0 }]]);

  let refundSql = `
    SELECT COUNT(*) AS c, COALESCE(SUM(refund_amount), 0) AS amt
      FROM tbl_opd_order_item
     WHERE refunded_at IS NOT NULL
       AND DATE(refunded_at) BETWEEN ? AND ?`;
  const refundParams = [bounds.start, bounds.end];
  const [[refunds]] = await pool.query(refundSql, refundParams).catch(() => [[{ c: 0, amt: 0 }]]);

  let walletSql = `
    SELECT COUNT(*) AS c, COALESCE(SUM(total_amount), 0) AS amt
      FROM tbl_payment_ticket
     WHERE LOWER(TRIM(COALESCE(status,''))) = 'paid'
       AND DATE(paid_at) BETWEEN ? AND ?
       AND LOWER(TRIM(COALESCE(payment_method,''))) IN ('wallet','patient wallet')`;
  const walletParams = [bounds.start, bounds.end];
  if (!opts.allCashiers && opts.paidBy > 0) {
    walletSql += ' AND paid_by = ?';
    walletParams.push(opts.paidBy);
  }
  const [[wallet]] = await pool.query(walletSql, walletParams).catch(() => [[{ c: 0, amt: 0 }]]);

  return {
    pending_count: n(pending?.c),
    pending_total: n(pending?.amt),
    pending_total_fmt: fmtMoney(pending?.amt),
    refund_count: n(refunds?.c),
    refund_total: n(refunds?.amt),
    refund_total_fmt: fmtMoney(refunds?.amt),
    wallet_payment_count: n(wallet?.c),
    wallet_payment_total: n(wallet?.amt),
    wallet_payment_total_fmt: fmtMoney(wallet?.amt),
  };
}

async function loadEodRecord(pool, facilityId, businessDate, cashierUserId) {
  const fid = Math.max(1, parseInt(String(facilityId || 1), 10) || 1);
  const uid = parseInt(String(cashierUserId || 0), 10) || 0;
  const [[row]] = await pool
    .query(
      `SELECT * FROM tbl_cashier_eod_reconciliation
       WHERE facility_id = ? AND business_date = ? AND cashier_user_id = ?
       LIMIT 1`,
      [fid, businessDate, uid]
    )
    .catch(() => [[null]]);
  if (!row) return null;
  const parseJson = (v) => {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    try {
      return JSON.parse(String(v));
    } catch {
      return null;
    }
  };
  return {
    ...row,
    system_totals: parseJson(row.system_totals_json) || {},
    declared_totals: parseJson(row.declared_totals_json) || {},
    variance: parseJson(row.variance_json) || {},
    report_snapshot: parseJson(row.report_snapshot_json) || null,
  };
}

/**
 * Build end-of-day report + optional saved reconciliation.
 */
async function buildCashierEodReport(pool, opts = {}) {
  const date = String(opts.date || '').trim() || todayIso();
  const bounds = resolvePeriodBounds('day', date);
  const accessOpts = {
    period: 'day',
    date: bounds.start,
    allCashiers: !!opts.allCashiers,
    paidBy: opts.paidBy || 0,
  };

  const summary = await buildCashierDailySummary(pool, accessOpts);
  const tickets = await loadPaidTickets(pool, bounds, accessOpts);
  const systemMap = paymentRowsToMap(summary.paymentRows);
  const cashierBreakdown = await fetchCashierBreakdown(pool, bounds, accessOpts);
  const dayStats = await fetchDayStats(pool, bounds, accessOpts);

  const fid = Math.max(1, parseInt(String(opts.facilityId || 1), 10) || 1);
  const scopeUserId = normalizeScopeUserId(accessOpts.allCashiers, accessOpts.paidBy);
  const saved = await loadEodRecord(pool, fid, bounds.start, scopeUserId);

  const declaredMap = saved?.declared_totals || {};
  const openingFloat = saved ? n(saved.opening_float) : n(opts.openingFloat);
  const expectedCashDrawer = openingFloat + n(systemMap.cash);
  const hasDeclared = declaredMap && Object.keys(declaredMap).length > 0;

  const reconRows = varianceRows(systemMap, declaredMap);
  const totalVariance = hasDeclared
    ? Object.values(computeVariance(systemMap, declaredMap)).reduce((s, v) => s + n(v), 0)
    : 0;

  return {
    bounds: {
      ...bounds,
      label: formatDisplayDate(bounds.start),
    },
    scope: {
      allCashiers: accessOpts.allCashiers,
      cashierUserId: scopeUserId,
    },
    summary,
    systemTotals: systemMap,
    systemPaymentRows: mapToPaymentRows(systemMap),
    declaredTotals: declaredMap,
    declaredPaymentRows: mapToPaymentRows(declaredMap),
    reconciliationRows: reconRows,
    totalVariance,
    totalVariance_fmt: fmtMoney(totalVariance),
    isBalanced: Math.abs(totalVariance) < 0.5,
    openingFloat,
    openingFloat_fmt: fmtMoney(openingFloat),
    expectedCashDrawer,
    expectedCashDrawer_fmt: fmtMoney(expectedCashDrawer),
    cashierBreakdown,
    dayStats,
    ticketCount: tickets.length,
    saved: saved
      ? {
          id: saved.id,
          status: saved.status,
          notes: saved.notes || '',
          submitted_at: saved.submitted_at,
          submitted_by: saved.submitted_by,
        }
      : null,
    generatedAt: new Date().toISOString(),
  };
}

async function saveCashierEodReconciliation(pool, opts = {}) {
  const date = String(opts.date || '').trim() || todayIso();
  const bounds = resolvePeriodBounds('day', date);
  const fid = Math.max(1, parseInt(String(opts.facilityId || 1), 10) || 1);
  const scopeUserId = normalizeScopeUserId(!!opts.allCashiers, opts.paidBy);
  const userId = parseInt(String(opts.userId || 0), 10) || null;

  const report = await buildCashierEodReport(pool, {
    date: bounds.start,
    facilityId: fid,
    allCashiers: opts.allCashiers,
    paidBy: opts.paidBy,
  });

  const declaredMap = parseDeclaredFromBody(opts.body || opts.declared || {}, { onSubmit: true });
  const openingFloat = n(opts.body?.opening_float ?? opts.openingFloat);
  const notes = String(opts.body?.notes ?? opts.notes ?? '').trim() || null;
  const varianceMap = computeVariance(report.systemTotals, declaredMap);

  const payload = {
    system_totals_json: JSON.stringify(report.systemTotals),
    declared_totals_json: JSON.stringify(declaredMap),
    variance_json: JSON.stringify(varianceMap),
    report_snapshot_json: JSON.stringify({
      summary: report.summary.summary,
      dayStats: report.dayStats,
      ticketCount: report.ticketCount,
    }),
    opening_float: openingFloat,
    notes,
    status: 'submitted',
    submitted_by: userId,
    submitted_at: new Date(),
  };

  await pool.query(
    `INSERT INTO tbl_cashier_eod_reconciliation
       (facility_id, business_date, cashier_user_id, status, opening_float,
        system_totals_json, declared_totals_json, variance_json, report_snapshot_json,
        notes, submitted_by, submitted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       opening_float = VALUES(opening_float),
       system_totals_json = VALUES(system_totals_json),
       declared_totals_json = VALUES(declared_totals_json),
       variance_json = VALUES(variance_json),
       report_snapshot_json = VALUES(report_snapshot_json),
       notes = VALUES(notes),
       submitted_by = VALUES(submitted_by),
       submitted_at = VALUES(submitted_at),
       updated_at = NOW()`,
    [
      fid,
      bounds.start,
      scopeUserId,
      payload.status,
      payload.opening_float,
      payload.system_totals_json,
      payload.declared_totals_json,
      payload.variance_json,
      payload.report_snapshot_json,
      payload.notes,
      payload.submitted_by,
      payload.submitted_at,
    ]
  );

  return buildCashierEodReport(pool, {
    date: bounds.start,
    facilityId: fid,
    allCashiers: opts.allCashiers,
    paidBy: opts.paidBy,
  });
}

module.exports = {
  buildCashierEodReport,
  saveCashierEodReconciliation,
  loadEodRecord,
  parseDeclaredFromBody,
  paymentMethodKey,
  fmtMoney,
  todayIso,
};
