'use strict';

const { parseTicketLines, resolveTicketPrintPayload } = require('./billingPrintPayload');
const { lineItemAmount, lineItemCategory } = require('./billingLineCategory');

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

function resolvePeriodBounds(period, anchorDate) {
  const raw = String(anchorDate || '').trim();
  const base = raw ? new Date(`${raw}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) throw new Error('Invalid date');
  const p = String(period || 'day').toLowerCase();
  if (p === 'day') {
    const s = fmtDate(base);
    return { start: s, end: s, period: 'day', label: s };
  }
  if (p === 'week') {
    const d = new Date(base);
    const dow = d.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: fmtDate(mon), end: fmtDate(sun), period: 'week', label: `${fmtDate(mon)} – ${fmtDate(sun)}` };
  }
  const y = base.getFullYear();
  const m = base.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const label = `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start: fmtDate(first), end: fmtDate(last), period: 'month', label };
}

async function loadPaidTickets(pool, bounds, opts = {}) {
  const allCashiers = !!opts.allCashiers;
  const paidBy = parseInt(String(opts.paidBy || 0), 10) || 0;
  let sql = `
    SELECT t.*, p.first_name, p.last_name
      FROM tbl_payment_ticket t
      JOIN tbl_patient p ON p.id = t.patient_id
     WHERE LOWER(TRIM(COALESCE(t.status,''))) = 'paid'
       AND t.paid_at IS NOT NULL
       AND DATE(t.paid_at) BETWEEN ? AND ?`;
  const params = [bounds.start, bounds.end];
  if (!allCashiers && paidBy > 0) {
    sql += ' AND t.paid_by = ?';
    params.push(paidBy);
  }
  sql += ' ORDER BY t.paid_at ASC, t.id ASC';
  const [rows] = await pool.query(sql, params).catch(() => [[]]);
  return rows || [];
}

function aggregateSummary(tickets) {
  const summary = {
    ticketCount: 0,
    totalCollected: 0,
    byPaymentMethod: {},
    byLineKind: {},
  };
  for (const ticket of tickets || []) {
    summary.ticketCount += 1;
    summary.totalCollected += n(ticket.total_amount);
    const pm = String(ticket.payment_method || 'cash').trim().toLowerCase() || 'cash';
    summary.byPaymentMethod[pm] = n(summary.byPaymentMethod[pm]) + n(ticket.total_amount);
    const lines = parseTicketLines(ticket);
    if (!lines.length) {
      const cat = 'other';
      summary.byLineKind[cat] = n(summary.byLineKind[cat]) + n(ticket.total_amount);
      continue;
    }
    for (const line of lines) {
      const amt = lineItemAmount(line);
      if (amt <= 0) continue;
      const cat = lineItemCategory(line);
      summary.byLineKind[cat] = n(summary.byLineKind[cat]) + amt;
    }
  }
  return summary;
}

async function buildCashierBatchPrintPayload(pool, opts = {}) {
  const bounds = resolvePeriodBounds(opts.period, opts.date);
  const format = String(opts.format || 'slip').toLowerCase() === 'receipt' ? 'receipt' : 'slip';
  const tickets = await loadPaidTickets(pool, bounds, opts);
  const slips = [];
  for (const ticket of tickets) {
    ticket.lines = parseTicketLines(ticket);
    const printPayload = await resolveTicketPrintPayload(pool, ticket).catch(() => ({
      paymentSettled: true,
      paymentCode: ticket.ticket_code || null,
      lineItems: [],
      sectionCodes: { laboratory: null, radiology: null, pharmacy: null },
      prescriptionItems: [],
    }));
    slips.push({
      format,
      ticket,
      facilityName: opts.facilityName || 'ZAIZENS',
      validityInfo: null,
      paymentSettled: !!printPayload.paymentSettled,
      paymentCode: printPayload.paymentCode || ticket.ticket_code || null,
      sectionCodes: printPayload.sectionCodes || {},
      prescriptionItems: printPayload.prescriptionItems || [],
    });
  }
  return {
    bounds,
    format,
    summary: aggregateSummary(tickets),
    slips,
    count: slips.length,
  };
}

module.exports = {
  resolvePeriodBounds,
  loadPaidTickets,
  aggregateSummary,
  buildCashierBatchPrintPayload,
};
