'use strict';

const { assignServiceCodesForConsultation } = require('./paymentTicketCode');

function parseTicketLines(ticket) {
  if (!ticket) return [];
  if (Array.isArray(ticket.lines)) return ticket.lines;
  try {
    return JSON.parse(ticket.lines_json || '[]');
  } catch {
    return [];
  }
}

function isPaymentTicketPaid(ticket) {
  return String(ticket?.status || '').trim().toLowerCase() === 'paid';
}

function isBillingDocumentPaid(doc) {
  return String(doc?.status || 'paid').trim().toLowerCase() === 'paid';
}

function isPaidOrderLineStatus(status) {
  const st = String(status || '').toLowerCase();
  return st === 'paid' || st === 'served' || st === 'external' || st === 'dispensed';
}

function lineItemsFromTicketLines(lines) {
  return (lines || [])
    .filter((l) => l && l.kind !== 'ipd_refund' && l.kind !== 'ipd_deposit' && l.kind !== 'ipd_total')
    .map((l) => ({
      description:
        l.description ||
        l.name ||
        (l.department ? `${l.department} service` : 'Medical service'),
      unit_price: Number(l.list_unit_price || l.unit_price || 0) || 0,
      quantity: Number(l.quantity || 1) || 1,
      amount:
        Number(l.amount || l.total || 0) ||
        Number(l.unit_price || 0) * Number(l.quantity || 1),
      department: l.department || null,
      kind: l.kind || null,
      category: String(l.kind || l.category || 'other').trim().toLowerCase() || 'other',
    }));
}

async function consultationIdsForTicket(pool, ticket, lines) {
  const oiIds = (lines || [])
    .filter((l) => l && l.source_module === 'opd_order_item' && l.source_pk)
    .map((l) => parseInt(l.source_pk, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  let consultIds = [];
  if (oiIds.length) {
    const [oiRows] = await pool
      .query(
        `SELECT DISTINCT consultation_id FROM tbl_opd_order_item
         WHERE id IN (${oiIds.map(() => '?').join(',')}) AND consultation_id IS NOT NULL`,
        oiIds
      )
      .catch(() => [[]]);
    consultIds = (oiRows || []).map((r) => r.consultation_id).filter(Boolean);
  }
  if (!consultIds.length && ticket && ticket.consultation_id) {
    consultIds.push(ticket.consultation_id);
  }
  return { consultIds, oiIds };
}

async function resolvePrescriptionPrintData(pool, { consultIds, oiIds, paidOnly = false }) {
  const sectionCodes = { laboratory: null, radiology: null, pharmacy: null };
  const prescriptionItems = [];

  const buildFromRows = (rows) => {
    for (const r of rows || []) {
      if (paidOnly && !isPaidOrderLineStatus(r.status)) continue;
      const kind = String(r.item_type || '').toLowerCase();
      if (r.service_code && Object.prototype.hasOwnProperty.call(sectionCodes, kind)) {
        sectionCodes[kind] = r.service_code;
      }
      if (kind === 'laboratory' || kind === 'radiology' || kind === 'pharmacy') {
        prescriptionItems.push({
          item_type: kind,
          service_code: paidOnly || isPaidOrderLineStatus(r.status) ? r.service_code || null : null,
          item_name: r.item_name || '—',
          quantity: r.quantity || 1,
          status: r.status || null,
        });
      }
    }
  };

  if (consultIds && consultIds.length) {
    for (const cid of consultIds) {
      await assignServiceCodesForConsultation(pool, cid).catch(() => {});
    }
    const [rows] = await pool
      .query(
        `SELECT item_type, service_code, item_name, quantity, status
         FROM tbl_opd_order_item
         WHERE consultation_id IN (${consultIds.map(() => '?').join(',')})
         ORDER BY FIELD(item_type,'laboratory','radiology','pharmacy'), id`,
        consultIds
      )
      .catch(() => [[]]);
    buildFromRows(rows);
  } else if (oiIds && oiIds.length) {
    const [rows] = await pool
      .query(
        `SELECT item_type, service_code, item_name, quantity, status
         FROM tbl_opd_order_item
         WHERE id IN (${oiIds.map(() => '?').join(',')})
         ORDER BY FIELD(item_type,'laboratory','radiology','pharmacy'), id`,
        oiIds
      )
      .catch(() => [[]]);
    buildFromRows(rows);
  }

  return { sectionCodes, prescriptionItems };
}

/** Payment ticket → cashier slip/ticket print payload. */
async function resolveTicketPrintPayload(pool, ticket) {
  const lines = parseTicketLines(ticket);
  const paid = isPaymentTicketPaid(ticket);
  const { consultIds, oiIds } = await consultationIdsForTicket(pool, ticket, lines);
  const { sectionCodes, prescriptionItems } = await resolvePrescriptionPrintData(pool, {
    consultIds,
    oiIds,
    paidOnly: paid,
  });
  return {
    paymentSettled: paid,
    paymentCode: paid ? ticket?.ticket_code || null : null,
    lineItems: lineItemsFromTicketLines(lines),
    sectionCodes: paid ? sectionCodes : { laboratory: null, radiology: null, pharmacy: null },
    prescriptionItems: paid ? prescriptionItems : [],
  };
}

/** Billing document (receipt/invoice) → print payload via linked payment ticket. */
async function resolveBillingDocPrintPayload(pool, billingDoc) {
  let paymentCode = null;
  let paymentSettled = false;
  let lineItems = [];
  let sectionCodes = { laboratory: null, radiology: null, pharmacy: null };
  let prescriptionItems = [];
  const docPaid = isBillingDocumentPaid(billingDoc);

  if (String(billingDoc?.source_module || '') === 'payment_ticket' && billingDoc.source_pk) {
    const [[t]] = await pool
      .query('SELECT * FROM tbl_payment_ticket WHERE id=? LIMIT 1', [
        parseInt(billingDoc.source_pk, 10) || 0,
      ])
      .catch(() => [[null]]);
    if (t) {
      const payload = await resolveTicketPrintPayload(pool, t);
      lineItems = payload.lineItems;
      if (docPaid && payload.paymentSettled) {
        paymentSettled = true;
        paymentCode = payload.paymentCode;
        sectionCodes = payload.sectionCodes;
        prescriptionItems = payload.prescriptionItems;
      }
    }
  } else if (billingDoc?.patient_id != null && billingDoc?.total_amount != null) {
    const [[linked]] = await pool
      .query(
        `SELECT * FROM tbl_payment_ticket
         WHERE patient_id=? AND total_amount=? AND status='paid'
         ORDER BY paid_at DESC LIMIT 1`,
        [billingDoc.patient_id, billingDoc.total_amount]
      )
      .catch(() => [[null]]);
    if (linked) {
      const payload = await resolveTicketPrintPayload(pool, linked);
      lineItems = payload.lineItems;
      if (docPaid && payload.paymentSettled) {
        paymentSettled = true;
        paymentCode = payload.paymentCode;
        sectionCodes = payload.sectionCodes;
        prescriptionItems = payload.prescriptionItems;
      }
    }
  }

  return { paymentSettled, paymentCode, lineItems, sectionCodes, prescriptionItems };
}

module.exports = {
  parseTicketLines,
  lineItemsFromTicketLines,
  isPaymentTicketPaid,
  isBillingDocumentPaid,
  isPaidOrderLineStatus,
  resolveTicketPrintPayload,
  resolveBillingDocPrintPayload,
};
