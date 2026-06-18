'use strict';

const clinicalBusinessRules = require('./clinicalBusinessRules');
const paymentValidity = require('./paymentValidity');
const {
  assertOrderLineAndTicketValid,
  filterOrderItemsPaidForFulfillment,
  isOrderLinePaidForFulfillment,
  orderLineMarkedPaid,
} = require('./assertOrderLineAndTicketValid');

const SERVICE_PREFIX_KIND = { LAB: 'laboratory', RAD: 'radiology', PHA: 'pharmacy' };

const UNPAID_SERVICE_CODE_MSG =
  'No paid items on this service code. Collect payment at Cashier for the selected prescriptions first.';

/**
 * Unified lab test authorization for validate-screen and new-test-request paths.
 */
async function authorizeLabTest(pool, opts) {
  const pid = parseInt(String(opts.patientId || ''), 10) || 0;
  const fid = parseInt(String(opts.facilityId || ''), 10) || 1;
  const dept = clinicalBusinessRules.normalizeDept(opts.dept || 'laboratory');
  const serviceCode = String(opts.serviceCode || '').trim().toUpperCase();
  const oiId = parseInt(String(opts.opdOrderItemId || ''), 10) || 0;
  const testName = String(opts.testName || '').trim();

  if (pid < 1) {
    return { ok: false, error: 'Select a patient first.', code: 'no_patient', source: null };
  }

  if (serviceCode && oiId) {
    const [[oi]] = await pool
      .query(`SELECT * FROM tbl_opd_order_item WHERE id = ? AND patient_id = ? LIMIT 1`, [oiId, pid])
      .catch(() => [[null]]);
    if (!oi) {
      return { ok: false, error: 'Order line not found for this patient.', code: 'no_order', source: null };
    }
    if (String(oi.service_code || '').trim().toUpperCase() !== serviceCode) {
      return { ok: false, error: 'Service code does not match the order line.', code: 'code_mismatch', source: null };
    }
    if (!(await isOrderLinePaidForFulfillment(pool, oi, fid))) {
      return {
        ok: false,
        error: 'Payment must be collected at Cashier for this prescription before the service can proceed.',
        code: 'payment_required',
        source: null,
      };
    }
    const ticketChk = await assertOrderLineAndTicketValid(pool, oi, fid);
    if (ticketChk.ticketLinked && !ticketChk.ok) {
      return {
        ok: false,
        error: ticketChk.error,
        code: ticketChk.code || 'expired_ticket',
        source: 'cashier_paid',
      };
    }
    const dup = await findDuplicateCashierLabRequest(pool, pid, oiId, testName);
    return {
      ok: true,
      source: orderLineMarkedPaid(oi) || ticketChk.ticketLinked ? 'cashier_paid' : 'doctor_order',
      meta: { orderItemId: oiId, serviceCode, tier: 'order-present', duplicateWarning: dup || null },
    };
  }

  const gate = await clinicalBusinessRules.assertDiagnosticNewTestAllowed(pool, pid, dept, fid);
  if (!gate.ok) {
    return {
      ok: false,
      error: gate.error,
      code: gate.code || 'payment_or_request',
      source: null,
      meta: gate.meta || null,
    };
  }

  const meta = gate.meta || {};
  let source = 'doctor_order';
  if (meta.via === 'ticket') source = 'cashier_paid';
  else if (meta.via === 'order') source = meta.ticketLinked === false ? 'doctor_order' : 'cashier_paid';
  else if (['alert_order', 'consult_order', 'emergency_consult_order'].includes(meta.via)) source = 'doctor_order';

  const dup = await findDuplicateCashierLabRequest(pool, pid, meta.orderItemId || 0, testName);

  return {
    ok: true,
    source,
    meta: { ...meta, duplicateWarning: dup || null },
  };
}

async function findDuplicateCashierLabRequest(pool, patientId, orderItemId, testName) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  const oid = parseInt(String(orderItemId || ''), 10) || 0;
  if (pid < 1) return null;

  if (oid > 0) {
    const [[existing]] = await pool
      .query(
        `SELECT id, test_name, status FROM tbl_lab_result
         WHERE opd_order_item_id = ? AND patient_id = ?
         ORDER BY id DESC LIMIT 1`,
        [oid, pid]
      )
      .catch(() => [[null]]);
    if (existing) {
      return `A lab result is already registered for this cashier order line (#${existing.id}, status: ${existing.status || '—'}).`;
    }
  }

  const tn = testName.toLowerCase();
  if (tn) {
    const [rows] = await pool
      .query(
        `SELECT lr.id, lr.test_name, lr.status, oi.service_code
           FROM tbl_lab_result lr
           INNER JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
          WHERE lr.patient_id = ?
            AND LOWER(TRIM(lr.test_name)) = ?
            AND lr.status IN ('pending','received','in_progress')
          ORDER BY lr.id DESC LIMIT 3`,
        [pid, tn]
      )
      .catch(() => [[]]);
    if (rows && rows.length) {
      return `Similar test "${rows[0].test_name}" is already queued (result #${rows[0].id}). Confirm before creating a duplicate.`;
    }
  }

  return null;
}

/** Validate LAB-/RAD-/PHA- service code before lab, imaging, or pharmacy fulfillment. */
async function authorizeServiceCodeValidate(pool, serviceCode, facilityId) {
  const code = String(serviceCode || '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'Enter a service code.', code: 'no_code' };

  const prefix = code.split('-')[0];
  const kind = SERVICE_PREFIX_KIND[prefix];
  if (!kind) {
    return { ok: false, error: 'Expected LAB-, RAD-, or PHA- service code.', code: 'bad_format' };
  }

  const [items] = await pool
    .query(
      `SELECT * FROM tbl_opd_order_item WHERE service_code = ? AND item_type = ? ORDER BY id ASC`,
      [code, kind]
    )
    .catch(() => [[]]);
  if (!items || !items.length) {
    return { ok: false, error: `Code "${code}" was not found.`, code: 'not_found' };
  }

  const paidItems = await filterOrderItemsPaidForFulfillment(pool, items, facilityId || 1);

  if (kind === 'pharmacy') {
    const { authorizePharmacyCode } = require('./opdPharmacyFulfillment');
    const pharmAuth = await authorizePharmacyCode(pool, items, facilityId || 1);
    if (!pharmAuth.ok) {
      return {
        ok: false,
        error: pharmAuth.error || UNPAID_SERVICE_CODE_MSG,
        code: pharmAuth.code || 'payment_required',
      };
    }
    const patientId = items[0].patient_id;
    return {
      ok: true,
      source: pharmAuth.source || (paidItems.length ? 'cashier_paid' : 'pharmacy_pending_custom'),
      meta: {
        items: paidItems.length ? paidItems : items,
        allItems: items,
        patientId,
        kind,
        code,
        unpaidCount: Math.max(0, items.length - paidItems.length),
      },
    };
  }

  if (!paidItems.length) {
    return {
      ok: false,
      error: UNPAID_SERVICE_CODE_MSG,
      code: 'payment_required',
    };
  }

  const patientId = paidItems[0].patient_id;
  const cashierPaid = paidItems.some((oi) => orderLineMarkedPaid(oi));

  return {
    ok: true,
    source: cashierPaid ? 'cashier_paid' : 'doctor_order',
    meta: {
      items: paidItems,
      allItems: items,
      patientId,
      kind,
      code,
      unpaidCount: Math.max(0, items.length - paidItems.length),
    },
  };
}

module.exports = {
  authorizeLabTest,
  authorizeServiceCodeValidate,
  assertServiceCodePaidForFulfillment: authorizeServiceCodeValidate,
  findDuplicateCashierLabRequest,
  UNPAID_SERVICE_CODE_MSG,
};
