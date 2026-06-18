'use strict';

const paymentCodeMessages = require('./paymentCodeMessages');
const paymentValidity = require('./paymentValidity');
const followUpConsultation = require('./followUpConsultation');
const { assertOrderLineAndTicketValid } = require('./assertOrderLineAndTicketValid');

const MSG_NEW_TEST_BLOCKED =
  'Please validate the payment code. No request has been received from IPD or Emergency.';
const MSG_NEW_TEST_ALERT_ONLY =
  'A charge alert exists but no formal lab/radiology order was placed. Ask the doctor to create an order from the consultation or ER chart before adding a new test.';
const MSG_CONSULT_PAYMENT = 'Please validate the payment code first.';
const MSG_VITALS_PAYMENT =
  'This patient does not have a valid payment code. Please ask the patient to obtain a payment code from the cashier before recording vitals.';
const MSG_VITALS_DOCTOR_FORBIDDEN = 'Doctors cannot record vitals. Nursing staff must record vitals from the OPD queue.';
const MSG_VITALS_ALREADY_RECORDED =
  'Vitals have already been recorded for this visit. No further changes are allowed.';
const MSG_PRESCRIPTION_NEEDS_CONSULT =
  'A consultation is required before prescribing for this OPD patient. Start a consultation from the OPD queue, or use Follow Up if the patient is returning under a valid prior payment code.';
const MSG_ER_PRESCRIPTION_NEEDS_CONSULT =
  'Prescription requires a consultation record — create one first.';

const NOT_DISCHARGED = `(a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')`;

function normalizeDept(dept) {
  const d = String(dept || '').toLowerCase().trim();
  if (d === 'lab') return 'laboratory';
  if (d === 'rad' || d === 'imaging') return 'radiology';
  return d;
}

/**
 * Paid lab/radiology ticket still within validity, or a paid order line with LAB-/RAD- code.
 */
async function patientHasValidatedDeptPayment(pool, patientId, dept, facilityId) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  const d = normalizeDept(dept);
  if (pid < 1 || (d !== 'laboratory' && d !== 'radiology')) {
    return { ok: false };
  }
  const fid = parseInt(String(facilityId || ''), 10) || 1;

  const [tickets] = await pool
    .query(
      `SELECT * FROM tbl_payment_ticket
       WHERE patient_id = ? AND LOWER(TRIM(COALESCE(status,''))) = 'paid'
       ORDER BY COALESCE(paid_at, created_at) DESC, id DESC
       LIMIT 50`,
      [pid]
    )
    .catch(() => [[]]);

  for (const t of tickets || []) {
    const inferred = paymentValidity.inferPaymentKind(t.lines_json);
    const lines = paymentValidity.parseLines(t.lines_json);
    const hasDeptLine =
      inferred === d ||
      lines.some((ln) => String(ln.kind || '').toLowerCase() === d);
    if (!hasDeptLine) continue;
    const code = paymentValidity.normalizePaymentCodeInput(t.ticket_code || t.code);
    if (!code) continue;
    const vchk = await paymentValidity.assertPaidTicketValidityForVisit(pool, t, code, fid);
    if (vchk.ok) return { ok: true, via: 'ticket', code, tier: 'order-present' };
  }

  const prefix = d === 'laboratory' ? 'LAB-' : 'RAD-';
  const [[oi]] = await pool
    .query(
      `SELECT oi.* FROM tbl_opd_order_item oi
       WHERE oi.patient_id = ? AND LOWER(TRIM(oi.item_type)) = ?
         AND UPPER(TRIM(COALESCE(oi.service_code,''))) LIKE ?
       ORDER BY oi.id DESC LIMIT 1`,
      [pid, d, prefix + '%']
    )
    .catch(() => [[null]]);
  if (oi && oi.service_code) {
    const ticketChk = await assertOrderLineAndTicketValid(pool, oi, fid);
    if (ticketChk.ticketLinked && !ticketChk.ok) {
      return { ok: false, error: ticketChk.error, code: ticketChk.code || 'expired_ticket' };
    }
    if (ticketChk.ok) {
      return {
        ok: true,
        via: 'order',
        serviceCode: String(oi.service_code).trim(),
        orderItemId: oi.id,
        tier: 'order-present',
        ticketLinked: !!ticketChk.ticketLinked,
      };
    }
  }

  return { ok: false };
}

/**
 * IPD/ER diagnostic access tier:
 * - alert-only: charge-only dept alert (opd_order_item_id NULL) — view queue, cannot add new test
 * - order-present: linked order item or explicit doctor consult order — can add new test
 */
async function patientHasIpdOrEmergencyDeptRequest(pool, patientId, dept) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  const d = normalizeDept(dept);
  if (pid < 1 || (d !== 'laboratory' && d !== 'radiology')) {
    return { ok: false };
  }

  const prefix = d === 'laboratory' ? 'LAB-' : 'RAD-';

  const [[orderAlert]] = await pool
    .query(
      `SELECT a.id, a.opd_order_item_id FROM tbl_clinical_dept_alert a
       WHERE a.patient_id = ? AND LOWER(TRIM(a.target_dept)) = ?
         AND a.opd_order_item_id IS NOT NULL AND a.opd_order_item_id > 0
         AND (
           LOWER(TRIM(COALESCE(a.context,''))) IN ('ipd','er')
           OR (a.admission_id IS NOT NULL AND a.admission_id > 0)
           OR EXISTS (
             SELECT 1 FROM tbl_opd_visit v
             WHERE v.id = a.opd_visit_id AND v.patient_id = a.patient_id
               AND COALESCE(v.is_emergency,0) = 1
           )
         )
       ORDER BY a.id DESC LIMIT 1`,
      [pid, d]
    )
    .catch(() => [[null]]);
  if (orderAlert) {
    return { ok: true, via: 'alert_order', tier: 'order-present', alertId: orderAlert.id };
  }

  const [[orderRow]] = await pool
    .query(
      `SELECT oi.id FROM tbl_opd_order_item oi
       LEFT JOIN tbl_opd_visit v ON v.id = oi.opd_visit_id AND v.patient_id = oi.patient_id
       WHERE oi.patient_id = ? AND LOWER(TRIM(oi.item_type)) = ?
         AND oi.consultation_id IS NOT NULL
         AND (
           COALESCE(v.is_emergency,0) = 1
           OR EXISTS (
             SELECT 1 FROM tbl_admission adm
             WHERE adm.patient_id = oi.patient_id AND ${NOT_DISCHARGED}
           )
         )
       ORDER BY oi.id DESC LIMIT 1`,
      [pid, d]
    )
    .catch(() => [[null]]);
  if (orderRow) return { ok: true, via: 'consult_order', tier: 'order-present', orderItemId: orderRow.id };

  const [[erVisit]] = await pool
    .query(
      `SELECT v.id FROM tbl_opd_visit v
       WHERE v.patient_id = ? AND COALESCE(v.is_emergency,0) = 1
         AND v.queue_status NOT IN ('completed','cancelled')
       ORDER BY v.id DESC LIMIT 1`,
      [pid]
    )
    .catch(() => [[null]]);
  if (erVisit) {
    const [[c]] = await pool
      .query(`SELECT id FROM tbl_consultation WHERE opd_visit_id = ? LIMIT 1`, [erVisit.id])
      .catch(() => [[null]]);
    if (c) {
      const [[erOrder]] = await pool
        .query(
          `SELECT id FROM tbl_opd_order_item
           WHERE patient_id = ? AND consultation_id = ? AND LOWER(TRIM(item_type)) = ?
           ORDER BY id DESC LIMIT 1`,
          [pid, c.id, d]
        )
        .catch(() => [[null]]);
      if (erOrder) {
        return { ok: true, via: 'emergency_consult_order', tier: 'order-present', consultationId: c.id };
      }
    }
  }

  const [[chargeAlert]] = await pool
    .query(
      `SELECT a.id FROM tbl_clinical_dept_alert a
       WHERE a.patient_id = ? AND LOWER(TRIM(a.target_dept)) = ?
         AND (a.opd_order_item_id IS NULL OR a.opd_order_item_id = 0)
         AND (
           LOWER(TRIM(COALESCE(a.context,''))) IN ('ipd','er')
           OR (a.admission_id IS NOT NULL AND a.admission_id > 0)
           OR EXISTS (
             SELECT 1 FROM tbl_opd_visit v
             WHERE v.id = a.opd_visit_id AND v.patient_id = a.patient_id
               AND COALESCE(v.is_emergency,0) = 1
           )
         )
       ORDER BY a.id DESC LIMIT 1`,
      [pid, d]
    )
    .catch(() => [[null]]);
  if (chargeAlert) {
    return { ok: false, tier: 'alert-only', via: 'charge_alert', alertId: chargeAlert.id, alertOnly: true };
  }

  return { ok: false };
}

/**
 * Laboratory / radiology: new test allowed when payment is valid OR IPD/ER doctor order exists.
 * Charge-only IPD/ER alerts do not grant new-test access (alert-only tier).
 */
async function assertDiagnosticNewTestAllowed(pool, patientId, dept, facilityId) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) {
    return { ok: false, error: 'Select a patient first.', code: 'no_patient' };
  }

  const ipdEr = await patientHasIpdOrEmergencyDeptRequest(pool, pid, dept);
  if (ipdEr.ok) return { ok: true, meta: ipdEr };
  if (ipdEr.alertOnly) {
    return { ok: false, error: MSG_NEW_TEST_ALERT_ONLY, code: 'alert_only', meta: ipdEr };
  }

  const paid = await patientHasValidatedDeptPayment(pool, pid, dept, facilityId);
  if (paid.ok) return { ok: true, meta: paid };
  if (paid.error) {
    return { ok: false, error: paid.error, code: paid.code || 'expired_ticket', meta: paid };
  }

  return { ok: false, error: MSG_NEW_TEST_BLOCKED, code: 'payment_or_request' };
}

function isDoctorStaffRole(role) {
  const r = String(role || '');
  return r === '2' || r === '100';
}

/**
 * OPD visit may open consultation (payment code required unless emergency).
 */
async function assertOpdVisitConsultationPayment(pool, opdVisit, facilityId) {
  if (!opdVisit) {
    return { ok: false, error: 'Visit not found.', code: 'visit_not_found' };
  }
  const isEmerg =
    opdVisit.is_emergency == 1 ||
    opdVisit.is_emergency === true ||
    String(opdVisit.is_emergency || '') === '1';
  if (isEmerg) return { ok: true, meta: { emergency: true } };

  const codeRaw = (opdVisit.payment_code || '').toString().trim();
  if (!codeRaw) {
    return { ok: false, error: MSG_CONSULT_PAYMENT, code: 'no_code' };
  }
  const code = paymentValidity.normalizePaymentCodeInput(codeRaw);
  const fid = parseInt(String(facilityId || opdVisit.facility_id || ''), 10) || 1;
  const tkt = await paymentValidity.findPaidTicketByNormalizedCode(pool, code);
  if (!tkt) {
    return {
      ok: false,
      error: paymentCodeMessages.msg('NOT_FOUND'),
      code: 'no_ticket',
    };
  }
  const visitId = parseInt(String(opdVisit.id || ''), 10) || 0;
  const vchk = await paymentValidity.assertPaidTicketValidityForVisit(pool, tkt, code, fid, {
    excludeVisitId: visitId,
  });
  if (!vchk.ok) {
    return { ok: false, error: vchk.error || MSG_CONSULT_PAYMENT, code: 'invalid_code', vchk };
  }
  return { ok: true, meta: { paymentCode: code, vchk: vchk.meta || null } };
}

/**
 * Vitals may be recorded only with valid payment (same as consultation), by non-doctor staff,
 * and only once per visit unless allowExistingVitals is set.
 */
async function assertOpdVisitVitalsAllowed(pool, opdVisit, facilityId, options = {}) {
  const { userRole = '', blockIfVitalsExist = true, hasVitalsAlready = false } = options;

  if (isDoctorStaffRole(userRole)) {
    return { ok: false, error: MSG_VITALS_DOCTOR_FORBIDDEN, code: 'doctor_forbidden' };
  }

  const pay = await assertOpdVisitConsultationPayment(pool, opdVisit, facilityId);
  if (!pay.ok) {
    return {
      ok: false,
      error: MSG_VITALS_PAYMENT,
      code: pay.code || 'no_payment',
    };
  }

  if (blockIfVitalsExist && hasVitalsAlready) {
    return { ok: false, error: MSG_VITALS_ALREADY_RECORDED, code: 'vitals_locked' };
  }

  return { ok: true, meta: pay.meta || null };
}

/**
 * OPD prescription (standalone registry) requires an active consultation, unless follow-up eligible or IPD/ER.
 */
async function assertOpdPrescriptionAllowed(pool, facilityId, patientId, doctorEmpId) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  const did = parseInt(String(doctorEmpId || ''), 10) || 0;
  const fid = parseInt(String(facilityId || ''), 10) || 1;
  if (pid < 1) {
    return { ok: false, error: 'Select a patient first.', code: 'no_patient' };
  }

  const [[adm]] = await pool
    .query(
      `SELECT id FROM tbl_admission a WHERE a.patient_id = ? AND ${NOT_DISCHARGED} LIMIT 1`,
      [pid]
    )
    .catch(() => [[null]]);
  if (adm) return { ok: true, meta: { context: 'ipd' } };

  const [[erVisit]] = await pool
    .query(
      `SELECT v.id FROM tbl_opd_visit v
       WHERE v.patient_id = ? AND COALESCE(v.is_emergency,0) = 1
         AND v.queue_status NOT IN ('completed','cancelled')
       ORDER BY v.id DESC LIMIT 1`,
      [pid]
    )
    .catch(() => [[null]]);
  if (erVisit) {
    const [[c]] = await pool
      .query('SELECT id FROM tbl_consultation WHERE opd_visit_id = ? LIMIT 1', [erVisit.id])
      .catch(() => [[null]]);
    if (c) return { ok: true, meta: { context: 'emergency', consultationId: c.id } };
    return {
      ok: false,
      error: MSG_ER_PRESCRIPTION_NEEDS_CONSULT,
      code: 'er_no_consultation',
    };
  }

  if (did > 0) {
    const fu = await followUpConsultation.assertFollowUpEligible(pool, fid, pid, did);
    if (fu.ok) return { ok: true, meta: { context: 'follow_up', ...fu.meta } };
  }

  const [[consultRow]] = await pool
    .query(
      `SELECT c.id, v.id AS visit_id
         FROM tbl_opd_visit v
         INNER JOIN tbl_consultation c ON c.opd_visit_id = v.id AND c.patient_id = v.patient_id
        WHERE v.patient_id = ?
          AND COALESCE(v.is_emergency,0) = 0
          AND v.queue_status NOT IN ('completed','cancelled')
        ORDER BY c.id DESC
        LIMIT 1`,
      [pid]
    )
    .catch(() => [[null]]);
  if (consultRow) {
    return {
      ok: true,
      meta: { context: 'consultation', consultationId: consultRow.id, visitId: consultRow.visit_id },
    };
  }

  return { ok: false, error: MSG_PRESCRIPTION_NEEDS_CONSULT, code: 'no_consultation' };
}

module.exports = {
  MSG_NEW_TEST_BLOCKED,
  MSG_NEW_TEST_ALERT_ONLY,
  MSG_CONSULT_PAYMENT,
  MSG_VITALS_PAYMENT,
  MSG_VITALS_DOCTOR_FORBIDDEN,
  MSG_VITALS_ALREADY_RECORDED,
  MSG_PRESCRIPTION_NEEDS_CONSULT,
  MSG_ER_PRESCRIPTION_NEEDS_CONSULT,
  isDoctorStaffRole,
  assertDiagnosticNewTestAllowed,
  assertOpdVisitConsultationPayment,
  assertOpdVisitVitalsAllowed,
  assertOpdPrescriptionAllowed,
  patientHasValidatedDeptPayment,
  patientHasIpdOrEmergencyDeptRequest,
  normalizeDept,
};
