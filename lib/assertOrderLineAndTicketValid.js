'use strict';

const paymentValidity = require('./paymentValidity');

function orderLineMarkedPaid(orderItem) {
  const st = String(orderItem?.status || '').toLowerCase();
  return st === 'paid' || st === 'served' || st === 'external' || st === 'dispensed';
}

async function orderLineExemptFromCashierPayment(pool, orderItem) {
  const consultId = parseInt(String(orderItem?.consultation_id || ''), 10) || 0;
  if (consultId < 1) return false;
  const [[row]] = await pool
    .query(
      `SELECT v.is_emergency
         FROM tbl_consultation c
         INNER JOIN tbl_opd_visit v ON v.id = c.opd_visit_id AND v.patient_id = c.patient_id
        WHERE c.id = ? LIMIT 1`,
      [consultId]
    )
    .catch(() => [[null]]);
  return !!(row && Number(row.is_emergency) === 1);
}

/**
 * Paid ticket whose lines_json explicitly references this order item (no visit-code fallback).
 * @param {import('mysql2/promise').Pool} pool
 * @param {object|number} orderItem
 */
async function findPaidTicketExplicitlyLinkedToOrderItem(pool, orderItem) {
  const oi =
    typeof orderItem === 'object' && orderItem != null
      ? orderItem
      : { id: parseInt(String(orderItem || ''), 10) || 0 };
  const oiId = parseInt(String(oi.id || ''), 10) || 0;
  const patientId = parseInt(String(oi.patient_id || ''), 10) || 0;
  if (oiId < 1 || patientId < 1) return null;

  const [tickets] = await pool
    .query(
      `SELECT * FROM tbl_payment_ticket
       WHERE patient_id = ? AND LOWER(TRIM(COALESCE(status,''))) = 'paid'
       ORDER BY COALESCE(paid_at, created_at) DESC, id DESC
       LIMIT 80`,
      [patientId]
    )
    .catch(() => [[]]);

  for (const t of tickets || []) {
    const lines = paymentValidity.parseLines(t.lines_json);
    const linked = lines.some((ln) => {
      const pk = parseInt(String(ln.source_pk || ''), 10) || 0;
      const mod = String(ln.source_module || '').toLowerCase();
      return pk === oiId && (mod === 'opd_order_item' || mod.includes('opd_order'));
    });
    if (linked) return t;
  }

  return null;
}

/**
 * Find a paid payment ticket whose lines_json references this order item.
 * Falls back to the visit payment code for consultation billing flows.
 * @param {import('mysql2/promise').Pool} pool
 * @param {object|number} orderItem
 */
async function findPaidTicketForOrderItem(pool, orderItem) {
  const oi =
    typeof orderItem === 'object' && orderItem != null
      ? orderItem
      : { id: parseInt(String(orderItem || ''), 10) || 0 };
  const explicit = await findPaidTicketExplicitlyLinkedToOrderItem(pool, oi);
  if (explicit) return explicit;

  const consultId = parseInt(String(oi.consultation_id || ''), 10) || 0;
  if (consultId > 0) {
    const [[visitRow]] = await pool
      .query(
        `SELECT v.payment_code FROM tbl_consultation c
         INNER JOIN tbl_opd_visit v ON v.id = c.opd_visit_id AND v.patient_id = c.patient_id
         WHERE c.id = ? LIMIT 1`,
        [consultId]
      )
      .catch(() => [[null]]);
    const codeRaw = visitRow && visitRow.payment_code ? String(visitRow.payment_code).trim() : '';
    if (codeRaw) {
      const tkt = await paymentValidity.findPaidTicketByNormalizedCode(pool, codeRaw);
      if (tkt && String(tkt.status || '').trim().toLowerCase() === 'paid') return tkt;
    }
  }

  return null;
}

/**
 * Whether lab / radiology / pharmacy may fulfill this order line.
 * Requires explicit cashier payment for the line, or emergency exemption.
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} orderItem
 * @param {number} [facilityId]
 */
async function isOrderLinePaidForFulfillment(pool, orderItem, facilityId) {
  if (!orderItem || !orderItem.id) return false;
  if (orderLineMarkedPaid(orderItem)) return true;
  if (await orderLineExemptFromCashierPayment(pool, orderItem)) return true;

  const tkt = await findPaidTicketExplicitlyLinkedToOrderItem(pool, orderItem);
  if (!tkt) return false;

  const code = paymentValidity.normalizePaymentCodeInput(tkt.ticket_code || tkt.code);
  const fid = parseInt(String(facilityId || tkt.facility_id || ''), 10) || 1;
  const vchk = await paymentValidity.assertPaidTicketValidityForVisit(pool, tkt, code, fid);
  return vchk.ok;
}

/**
 * Keep only order lines the patient has paid for (or emergency-exempt lines).
 * @param {import('mysql2/promise').Pool} pool
 * @param {object[]} items
 * @param {number} [facilityId]
 */
async function filterOrderItemsPaidForFulfillment(pool, items, facilityId) {
  const paid = [];
  for (const oi of items || []) {
    if (await isOrderLinePaidForFulfillment(pool, oi, facilityId)) paid.push(oi);
  }
  return paid;
}

/**
 * When authorization uses an order line (LAB-/RAD-), re-check linked ticket validity.
 * Logs a warning when a ticket exists but is expired — useful for cashier follow-up.
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} orderItem — tbl_opd_order_item row
 * @param {number} [facilityId]
 */
async function assertOrderLineAndTicketValid(pool, orderItem, facilityId) {
  if (!orderItem || !orderItem.id) {
    return { ok: false, error: 'No order line found.', code: 'no_order' };
  }

  const tkt = await findPaidTicketForOrderItem(pool, orderItem);
  if (!tkt) {
    return { ok: true, ticketLinked: false, meta: { via: 'order_no_ticket' } };
  }

  const code = paymentValidity.normalizePaymentCodeInput(tkt.ticket_code || tkt.code);
  const fid = parseInt(String(facilityId || tkt.facility_id || ''), 10) || 1;
  const vchk = await paymentValidity.assertPaidTicketValidityForVisit(pool, tkt, code, fid);
  if (!vchk.ok) {
    console.warn(
      '[clinical] Order line #%s (%s) linked to ticket %s but ticket is invalid: %s',
      orderItem.id,
      orderItem.service_code || '—',
      code,
      vchk.error || 'unknown'
    );
    return {
      ok: false,
      error: vchk.error || 'Payment ticket for this order is no longer valid.',
      code: 'expired_ticket',
      ticketLinked: true,
      vchk,
      meta: { ticketCode: code },
    };
  }

  return {
    ok: true,
    ticketLinked: true,
    meta: { via: 'order_ticket', ticketCode: code, vchk: vchk.meta || null },
  };
}

module.exports = {
  orderLineMarkedPaid,
  orderLineExemptFromCashierPayment,
  findPaidTicketForOrderItem,
  findPaidTicketExplicitlyLinkedToOrderItem,
  isOrderLinePaidForFulfillment,
  filterOrderItemsPaidForFulfillment,
  assertOrderLineAndTicketValid,
};
