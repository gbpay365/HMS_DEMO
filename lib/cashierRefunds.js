'use strict';

const { fmtMoney } = require('./cashierDailySummary');
const { ensureCashierRefundSchema } = require('./ensureCashierRefundSchema');
const {
  resolveRefundTicket,
  refundableAmountForTicket,
  paidRefundSummaryForTicket,
  postCashierRefundRequest,
} = require('./cashierRefundPost');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function refundRefFromId(id, createdAt) {
  const y = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  return `RFD-${y}-${String(id).padStart(3, '0')}`;
}

function humanReason(raw) {
  const s = String(raw || '').trim();
  if (!s) return '—';
  const map = {
    not_available: 'Service not rendered',
    out_of_stock: 'Out of stock',
    not_in_catalog: 'Not in catalog',
    overpayment: 'Overpayment',
    duplicate_payment: 'Duplicate payment',
    insurance_covered: 'Insurance covered',
    patient_cancellation: 'Patient cancellation',
    service_not_rendered: 'Service not rendered',
  };
  const key = s.toLowerCase().replace(/\s+/g, '_');
  if (map[key]) return map[key];
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function refundMethodLabel(method) {
  const m = String(method || 'Cash').trim().toLowerCase();
  if (m.includes('wallet')) return 'Wallet credit';
  if (m.includes('card') || m === 'pos' || m.includes('reversal')) return 'Card reversal';
  if (m.includes('momo') || m.includes('om') || m.includes('mobile') || m === 'bank') return 'Card reversal';
  return 'Cash';
}

function resolveDisplayStatus(status) {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'paid' || s === 'approved' || s === 'completed') return 'paid';
  if (s === 'rejected' || s === 'denied') return 'rejected';
  return 'pending';
}

async function fetchOpdRefundRows(pool, limit = 200) {
  const [rows] = await pool
    .query(
      `SELECT
        oi.id,
        oi.refund_amount,
        oi.refund_method,
        oi.refund_reason,
        oi.refunded_at,
        p.id AS patient_id,
        p.first_name,
        p.last_name,
        c.id AS consultation_id,
        (
          SELECT pt.ticket_code FROM tbl_payment_ticket pt
          WHERE pt.patient_id = p.id AND pt.status = 'paid'
          ORDER BY pt.paid_at DESC LIMIT 1
        ) AS ticket_code
      FROM tbl_opd_order_item oi
      JOIN tbl_consultation c ON c.id = oi.consultation_id
      JOIN tbl_patient p ON p.id = c.patient_id
      WHERE oi.refunded_at IS NOT NULL
        AND COALESCE(oi.refund_amount, 0) > 0
      ORDER BY oi.refunded_at DESC
      LIMIT ?`,
      [limit]
    )
    .catch(() => [[]]);

  return (rows || []).map((r) => ({
    refund_id: `opd-${r.id}`,
    request_id: null,
    refund_ref: refundRefFromId(r.id, r.refunded_at),
    ticket_code: r.ticket_code || `C-${r.consultation_id}`,
    patient_id: r.patient_id,
    patient_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—',
    reason: humanReason(r.refund_reason),
    amount: n(r.refund_amount),
    amount_fmt: fmtMoney(r.refund_amount),
    refund_method: refundMethodLabel(r.refund_method),
    refund_date: r.refunded_at,
    display_status: 'paid',
    source_module: 'opd_order_item',
    source_pk: r.id,
    can_approve: false,
  }));
}

async function fetchIpdRefundRows(pool, limit = 100) {
  const [rows] = await pool
    .query(
      `SELECT
        a.id,
        a.ipd_refund_amount,
        a.ipd_refund_method,
        a.ipd_refunded_at,
        p.id AS patient_id,
        p.first_name,
        p.last_name
      FROM tbl_admission a
      JOIN tbl_patient p ON p.id = a.patient_id
      WHERE a.ipd_refunded_at IS NOT NULL
        AND COALESCE(a.ipd_refund_amount, 0) > 0
      ORDER BY a.ipd_refunded_at DESC
      LIMIT ?`,
      [limit]
    )
    .catch(() => [[]]);

  return (rows || []).map((r) => ({
    refund_id: `ipd-${r.id}`,
    request_id: null,
    refund_ref: refundRefFromId(r.id, r.ipd_refunded_at),
    ticket_code: `IPD-${r.id}`,
    patient_id: r.patient_id,
    patient_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—',
    reason: 'Patient cancellation',
    amount: n(r.ipd_refund_amount),
    amount_fmt: fmtMoney(r.ipd_refund_amount),
    refund_method: refundMethodLabel(r.ipd_refund_method),
    refund_date: r.ipd_refunded_at,
    display_status: 'paid',
    source_module: 'ipd_admission',
    source_pk: r.id,
    can_approve: false,
  }));
}

async function fetchRequestRows(pool, limit = 200) {
  const [rows] = await pool
    .query(
      `SELECT
        r.*,
        p.first_name,
        p.last_name
      FROM tbl_cashier_refund_request r
      LEFT JOIN tbl_patient p ON p.id = r.patient_id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ?`,
      [limit]
    )
    .catch(() => [[]]);

  return (rows || []).map((r) => {
    const created = r.created_at || r.approved_at;
    const status = resolveDisplayStatus(r.status);
    return {
      refund_id: `req-${r.id}`,
      request_id: r.id,
      refund_ref: r.refund_ref || refundRefFromId(r.id, created),
      ticket_code: r.ticket_code || '—',
      patient_id: r.patient_id,
      patient_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—',
      reason: humanReason(r.reason),
      amount: n(r.amount),
      amount_fmt: fmtMoney(r.amount),
      refund_method: refundMethodLabel(r.refund_method),
      refund_date: status === 'paid' ? r.approved_at || r.created_at : r.created_at,
      display_status: status,
      source_module: r.source_module || 'manual',
      source_pk: r.source_pk,
      can_approve: status === 'pending',
    };
  });
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ limit?: number }} [opts]
 */
async function fetchCashierRefunds(pool, opts = {}) {
  await ensureCashierRefundSchema(pool);

  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 200, 1), 500);
  const [requests, opdRows, ipdRows] = await Promise.all([
    fetchRequestRows(pool, limit),
    fetchOpdRefundRows(pool, limit),
    fetchIpdRefundRows(pool, limit),
  ]);

  const requestSourceKeys = new Set(
    requests
      .filter((r) => r.source_module && r.source_pk)
      .map((r) => `${r.source_module}:${r.source_pk}`)
  );

  const merged = [
    ...requests,
    ...opdRows.filter((r) => !requestSourceKeys.has(`${r.source_module}:${r.source_pk}`)),
    ...ipdRows.filter((r) => !requestSourceKeys.has(`${r.source_module}:${r.source_pk}`)),
  ];

  merged.sort((a, b) => new Date(b.refund_date || 0) - new Date(a.refund_date || 0));

  const monthStart = new Date(monthStartIso());
  const monthRows = merged.filter((r) => {
    const d = r.refund_date ? new Date(r.refund_date) : null;
    return d && !Number.isNaN(d.getTime()) && d >= monthStart && r.display_status === 'paid';
  });

  const paidRows = merged.filter((r) => r.display_status === 'paid');
  const pendingRows = merged.filter((r) => r.display_status === 'pending');
  const monthTotal = monthRows.reduce((s, r) => s + (r.amount || 0), 0);
  const paidTotal = paidRows.reduce((s, r) => s + (r.amount || 0), 0);
  const avgRefund = paidRows.length ? paidTotal / paidRows.length : 0;

  return {
    refunds: merged,
    total: merged.length,
    summary: {
      month_count: monthRows.length,
      month_total: monthTotal,
      month_total_fmt: fmtMoney(monthTotal),
      pending_count: pendingRows.length,
      paid_count: paidRows.length,
      avg_refund: Math.round(avgRefund),
      avg_refund_fmt: fmtMoney(avgRefund),
    },
    month_label: new Date().toLocaleString('en', { month: 'short' }),
  };
}

async function createCashierRefundRequest(pool, input, session) {
  await ensureCashierRefundSchema(pool);

  const patientId = parseInt(input.patient_id, 10) || 0;
  const amount = n(input.amount);
  const reason = String(input.reason || '').trim();
  const refundMethod = String(input.refund_method || 'Cash').trim() || 'Cash';
  let ticketCode = String(input.ticket_code || '').trim() || null;
  let ticketId = parseInt(input.ticket_id, 10) || null;
  const fid = parseInt(session?.facilityId, 10) || 1;
  const userId = parseInt(session?.userId, 10) || null;

  if (patientId < 1) return { ok: false, error: 'Patient is required.', status: 400 };
  if (amount <= 0) return { ok: false, error: 'Refund amount must be greater than zero.', status: 400 };
  if (!reason) return { ok: false, error: 'Refund reason is required.', status: 400 };

  const ticket = await resolveRefundTicket(pool, ticketId, ticketCode);
  if (ticket) {
    ticketId = ticket.id;
    ticketCode = ticket.ticket_code || ticketCode;
    const maxRefundable = await refundableAmountForTicket(pool, ticket);
    if (amount > maxRefundable + 0.005) {
      const paidRefunds = await paidRefundSummaryForTicket(pool, ticket.id);
      if (maxRefundable <= 0.005 && paidRefunds.total > 0) {
        const refLabel = paidRefunds.refs[0] || '';
        return {
          ok: false,
          error: refLabel
            ? `This bill was already refunded (${refLabel}, ${fmtMoney(paidRefunds.total)}). No further refund is available.`
            : `This bill was already refunded (${fmtMoney(paidRefunds.total)}). No further refund is available.`,
          status: 400,
        };
      }
      if (maxRefundable <= 0.005) {
        return {
          ok: false,
          error: 'No refundable balance remains on this bill.',
          status: 400,
        };
      }
      return {
        ok: false,
        error: `Refund amount exceeds refundable balance on this bill (${fmtMoney(maxRefundable)}).`,
        status: 400,
      };
    }
  }

  const [ins] = await pool.query(
    `INSERT INTO tbl_cashier_refund_request
      (facility_id, patient_id, ticket_id, ticket_code, reason, amount, refund_method, status, source_module, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'manual', ?, NOW())`,
    [fid, patientId, ticketId, ticketCode, reason, amount, refundMethod, userId]
  );

  const id = ins.insertId;
  const refundRef = refundRefFromId(id, new Date());
  await pool.query('UPDATE tbl_cashier_refund_request SET refund_ref = ? WHERE id = ?', [refundRef, id]);

  return { ok: true, id, refund_ref: refundRef, ticket_id: ticketId, ticket_code: ticketCode };
}

async function approveCashierRefundRequest(pool, requestId, session) {
  await ensureCashierRefundSchema(pool);

  const id = parseInt(requestId, 10) || 0;
  if (id < 1) return { ok: false, error: 'Invalid refund request.', status: 400 };

  const [[row]] = await pool
    .query('SELECT * FROM tbl_cashier_refund_request WHERE id = ? LIMIT 1', [id])
    .catch(() => [[]]);
  if (!row) return { ok: false, error: 'Refund request not found.', status: 404 };
  if (String(row.status).toLowerCase() !== 'pending') {
    return { ok: false, error: 'Refund request is not pending.', status: 400 };
  }

  return postCashierRefundRequest(pool, row, session);
}

module.exports = {
  fetchCashierRefunds,
  createCashierRefundRequest,
  approveCashierRefundRequest,
  refundRefFromId,
  humanReason,
  refundMethodLabel,
};
