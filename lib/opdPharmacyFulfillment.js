'use strict';

const { filterOrderItemsPaidForFulfillment } = require('./assertOrderLineAndTicketValid');

/** Short note stored on inventory movement when dispensed off-catalog (not yet in stock). */
const OFF_CATALOG_STOCK_NOTE = 'Off-catalog dispense — product supplied but not yet in inventory';

function isCustomOrZeroPrice(oi) {
  const catalogId = oi?.catalog_id != null ? parseInt(oi.catalog_id, 10) : 0;
  const price = parseFloat(oi?.unit_price || 0) || 0;
  return !catalogId || price <= 0;
}

function isPendingCustomZero(oi) {
  const st = String(oi?.status || '').toLowerCase();
  return st === 'pending' && isCustomOrZeroPrice(oi);
}

function isOffCatalogAvailable(oi) {
  return !!(oi && (Number(oi.pharmacist_available) === 1 || oi.pharmacist_available === true));
}

function isPaidForDispense(oi) {
  const st = String(oi?.status || '').toLowerCase();
  return st === 'paid' || st === 'dispensed' || !!oi?.paid_at;
}

/**
 * Enrich pharmacy order lines for validate UI.
 */
function enrichPharmacyLine(oi) {
  const pendingCustom = isPendingCustomZero(oi);
  const offCatalog = isOffCatalogAvailable(oi);
  const paid = isPaidForDispense(oi);
  const customZero = isCustomOrZeroPrice(oi);
  const unitPrice = parseFloat(oi?.unit_price || 0) || 0;
  const awaitingPharmacistPrice = offCatalog && unitPrice <= 0 && pendingCustom;
  const readyForCashier = offCatalog && unitPrice > 0 && pendingCustom;
  return {
    ...oi,
    is_custom_zero: customZero,
    is_pending_custom: pendingCustom,
    is_off_catalog_available: offCatalog,
    is_paid: paid,
    can_dispense: paid && !oi?.served_at && String(oi?.status || '').toLowerCase() !== 'external',
    show_off_catalog_toggle: pendingCustom && !paid,
    awaiting_pharmacist_price: awaitingPharmacistPrice,
    awaiting_cashier_price: readyForCashier,
    needs_pharmacy_check: pendingCustom && !offCatalog,
    ready_for_cashier: readyForCashier,
  };
}

/**
 * Ensure all pharmacy lines on a consultation share one PHA service code.
 * @returns {Promise<string|null>} The shared PHA code
 */
async function syncPharmacyServiceCodeForConsultation(db, consultationId, orderItemIds, preferredCode) {
  const cid = parseInt(String(consultationId || ''), 10) || 0;
  const ids = [...new Set((orderItemIds || []).map((id) => parseInt(String(id), 10) || 0).filter((n) => n > 0))];
  let phaCode = preferredCode ? String(preferredCode).trim().toUpperCase() : null;

  if (!phaCode && cid > 0) {
    const [[row]] = await db
      .query(
        `SELECT service_code FROM tbl_opd_order_item
         WHERE consultation_id = ? AND item_type = 'pharmacy'
           AND service_code IS NOT NULL AND TRIM(service_code) <> ''
         ORDER BY (paid_at IS NOT NULL) DESC, id ASC
         LIMIT 1`,
        [cid]
      )
      .catch(() => [[null]]);
    if (row && row.service_code) phaCode = String(row.service_code).trim().toUpperCase();
  }

  if (!phaCode && ids.length) {
    const ph = ids.map(() => '?').join(',');
    const [[row]] = await db
      .query(
        `SELECT service_code FROM tbl_opd_order_item
         WHERE id IN (${ph}) AND item_type = 'pharmacy'
           AND service_code IS NOT NULL AND TRIM(service_code) <> ''
         LIMIT 1`,
        ids
      )
      .catch(() => [[null]]);
    if (row && row.service_code) phaCode = String(row.service_code).trim().toUpperCase();
  }

  if (!phaCode) {
    const { allocateUniquePaymentCode } = require('./paymentTicketCode');
    phaCode = await allocateUniquePaymentCode(db, 'pharmacy');
    if (cid > 0) {
      await db
        .query(
          `UPDATE tbl_opd_order_item SET service_code = ?
           WHERE consultation_id = ? AND item_type = 'pharmacy'
             AND (service_code IS NULL OR TRIM(service_code) = '')`,
          [phaCode, cid]
        )
        .catch(() => {});
    }
  }

  if (phaCode && ids.length) {
    await db
      .query(
        `UPDATE tbl_opd_order_item SET service_code = ?
         WHERE id IN (${ids.map(() => '?').join(',')}) AND item_type = 'pharmacy'`,
        [phaCode, ...ids]
      )
      .catch(() => {});
  }

  if (phaCode && cid > 0) {
    await db
      .query(
        `UPDATE tbl_opd_order_item SET service_code = ?
         WHERE consultation_id = ? AND item_type = 'pharmacy'
           AND (service_code IS NULL OR TRIM(service_code) = '')`,
        [phaCode, cid]
      )
      .catch(() => {});
  }

  return phaCode || null;
}

/**
 * Resolve ticket_code for a pharmacy-only OPD bill — reuse shared PHA when possible.
 */
async function resolvePharmacyTicketCode(db, facilityId, items, lines, phaServiceCode) {
  const phaCode = phaServiceCode ? String(phaServiceCode).trim().toUpperCase() : null;
  const allPharmacy = (items || []).every((it) => String(it.item_type || '').toLowerCase() === 'pharmacy');
  if (!phaCode || !allPharmacy || !/^PHA-/i.test(phaCode)) {
    const { allocateUniquePaymentCode } = require('./paymentTicketCode');
    return allocateUniquePaymentCode(db, lines);
  }
  const fid = parseInt(String(facilityId || ''), 10) || 1;
  const [[existing]] = await db
    .query('SELECT id FROM tbl_payment_ticket WHERE facility_id = ? AND ticket_code = ? LIMIT 1', [
      fid,
      phaCode,
    ])
    .catch(() => [[null]]);
  if (existing && existing.id) {
    const { allocateUniquePaymentCode } = require('./paymentTicketCode');
    return allocateUniquePaymentCode(db, lines);
  }
  return phaCode;
}

/**
 * Load all pharmacy lines for a service code (excludes external / cancelled / refunded).
 */
async function loadPharmacyLinesForCode(db, code) {
  const c = String(code || '').trim().toUpperCase();
  const [allItems] = await db
    .query(
      `SELECT oi.*, p.first_name, p.last_name, p.phone, p.dob, p.gender,
              c.id AS consult_id, c.created_by AS doctor_id, c.created_at AS consult_at,
              e.first_name AS doctor_fn, e.last_name AS doctor_ln
         FROM tbl_opd_order_item oi
         JOIN tbl_patient p ON p.id = oi.patient_id
         LEFT JOIN tbl_consultation c ON c.id = oi.consultation_id
         LEFT JOIN tbl_employee e ON e.id = c.created_by
        WHERE oi.service_code = ? AND oi.item_type = 'pharmacy'
        ORDER BY oi.id ASC`,
      [c]
    )
    .catch(() => [[]]);

  return (allItems || []).filter((oi) => {
    const st = String(oi.status || '').toLowerCase();
    return !['external', 'cancelled', 'refunded'].includes(st);
  });
}

/**
 * Whether pharmacy may open a PHA validate page for this code.
 */
async function authorizePharmacyCode(db, items, facilityId) {
  const nonExternal = (items || []).filter((oi) => String(oi.status || '').toLowerCase() !== 'external');
  if (!nonExternal.length) {
    return { ok: false, error: 'Code not found or all items are external.', code: 'not_found' };
  }
  const paid = await filterOrderItemsPaidForFulfillment(db, nonExternal, facilityId || 1);
  if (paid.length > 0) {
    return { ok: true, source: 'cashier_paid', paidCount: paid.length, totalCount: nonExternal.length };
  }
  const pendingCustom = nonExternal.filter(isPendingCustomZero);
  if (pendingCustom.length > 0) {
    return {
      ok: true,
      source: 'pharmacy_pending_custom',
      paidCount: 0,
      totalCount: nonExternal.length,
    };
  }
  return {
    ok: false,
    error: 'Collect payment at Cashier for the selected prescriptions first.',
    code: 'payment_required',
  };
}

module.exports = {
  OFF_CATALOG_STOCK_NOTE,
  isCustomOrZeroPrice,
  isPendingCustomZero,
  isOffCatalogAvailable,
  isPaidForDispense,
  enrichPharmacyLine,
  loadPharmacyLinesForCode,
  authorizePharmacyCode,
  syncPharmacyServiceCodeForConsultation,
  resolvePharmacyTicketCode,
};
