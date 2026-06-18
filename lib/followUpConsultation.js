'use strict';

const paymentValidity = require('./paymentValidity');

function parseObservations(raw) {
  let o = {};
  try {
    o = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
  } catch (_) {
    return {};
  }
  const f = o.followup_visit_requested;
  const flag =
    f === true ||
    f === 1 ||
    f === '1' ||
    String(f).toLowerCase() === 'true' ||
    String(f).toLowerCase() === 'on';
  return { ...o, _followupFlag: flag };
}

/**
 * Find the most recent consultation by this doctor that documents a follow-up visit request.
 * @returns {null | { consultation: object, visit: object, obs: object }}
 */
async function findAnchorFollowUpRequest(pool, patientId, doctorEmpId) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  const did = parseInt(String(doctorEmpId || ''), 10) || 0;
  if (pid < 1 || did < 1) return null;
  const [rows] = await pool
    .query(
      `SELECT c.id, c.created_by, c.observations_json, c.opd_visit_id,
              v.payment_code, v.is_emergency, v.department, v.assigned_doctor_id, v.queue_status
         FROM tbl_consultation c
         INNER JOIN tbl_opd_visit v ON v.id = c.opd_visit_id AND v.patient_id = c.patient_id
        WHERE c.patient_id = ?
        ORDER BY c.id DESC
        LIMIT 40`,
      [pid]
    )
    .catch(() => [[]]);
  for (const c of rows || []) {
    const author = parseInt(String(c.created_by || ''), 10) || 0;
    if (author !== did) continue;
    const obs = parseObservations(c.observations_json);
    if (!obs._followupFlag) continue;
    return { consultation: c, visit: c, obs };
  }
  return null;
}

/**
 * @returns {{ ok: boolean, errors: string[], meta?: object }}
 */
async function assertFollowUpEligible(pool, facilityId, patientId, doctorEmpId) {
  const errors = [];
  const fid = parseInt(String(facilityId || ''), 10) || 1;
  const anchor = await findAnchorFollowUpRequest(pool, patientId, doctorEmpId);
  if (!anchor) {
    errors.push(
      'There is no saved follow-up request from you for this patient. End a consultation with “Patient may return for a follow-up consultation…” checked, or the patient must obtain a new consultation payment at the cashier.'
    );
    return { ok: false, errors, meta: { doctorRequest: false } };
  }

  const v = anchor.consultation;
  const isEmerg =
    v.is_emergency == 1 ||
    v.is_emergency === true ||
    String(v.is_emergency || '') === '1';
  if (isEmerg) {
    errors.push(
      'Follow-up cannot be started from an emergency visit using this action. The patient needs a new registration (OPD cashier / emergency desk) and payment where required.'
    );
    return { ok: false, errors, meta: { doctorRequest: true, emergency: true } };
  }

  const codeRaw = (v.payment_code || '').toString().trim();
  const code = paymentValidity.normalizePaymentCodeInput(codeRaw);
  if (!code) {
    errors.push('The previous visit has no payment code on file. A new consultation must be paid at the cashier.');
    return { ok: false, errors, meta: { doctorRequest: true, paymentValid: false } };
  }
  const tkt = await paymentValidity.findPaidTicketByNormalizedCode(pool, code);
  if (!tkt) {
    errors.push('No paid ticket matches the payment code for that visit. The patient needs a new consultation payment.');
    return { ok: false, errors, meta: { doctorRequest: true, paymentValid: false } };
  }
  const vchk = await paymentValidity.assertPaidTicketValidityForVisit(pool, tkt, code, fid);
  if (!vchk.ok) {
    errors.push(vchk.error || 'This payment code cannot be used for another visit under the current validity rules.');
    return { ok: false, errors, meta: { doctorRequest: true, paymentValid: false, vchk } };
  }
  return {
    ok: true,
    errors: [],
    meta: {
      doctorRequest: true,
      paymentValid: true,
      paymentCode: code,
      anchorVisit: v,
      vchk: vchk.meta || null,
    },
  };
}

/**
 * Inserts a new OPD visit for follow-up (mirrors non-emergency branch of /opd-queue/add).
 * @returns {Promise<number>} new visit id
 */
async function createFollowUpOpdVisit(pool, { facilityId, userId, patientId, paymentCode, department, assignedDoctorId, chiefComplaint }) {
  const fid = parseInt(String(facilityId || ''), 10) || 1;
  const uid = parseInt(String(userId || ''), 10) || 1;
  const pid = parseInt(String(patientId || ''), 10) || 0;
  const docId = parseInt(String(assignedDoctorId || ''), 10) || 0;
  const dept = String(department || 'General').trim() || 'General';
  const code = paymentCode ? paymentValidity.normalizePaymentCodeInput(paymentCode) : null;
  const today = new Date().toISOString().split('T')[0];
  const startedAt = new Date();

  const year = new Date().getFullYear();
  const prefix = `OPD-${year}-`;
  const [maxRow] = await pool.query(
    'SELECT ticket_number FROM tbl_opd_visit WHERE ticket_number LIKE ? ORDER BY id DESC LIMIT 1',
    [`${prefix}%`]
  );
  let nextSeq = 1;
  if (maxRow && maxRow.length > 0) {
    const parts = maxRow[0].ticket_number.split('-');
    nextSeq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
  }
  const ticketNumber = prefix + nextSeq.toString().padStart(4, '0');

  await pool.query("ALTER TABLE tbl_opd_visit ADD COLUMN IF NOT EXISTS is_emergency TINYINT DEFAULT 0").catch(() => {});
  await pool.query("ALTER TABLE tbl_opd_visit ADD COLUMN IF NOT EXISTS waiver_reason VARCHAR(255) NULL").catch(() => {});

  const [ins] = await pool.query(
    `INSERT INTO tbl_opd_visit
     (facility_id, patient_id, ticket_number, queue_status, chief_complaint,
      department, priority, visit_date, queue_started_at, created_by,
      assigned_doctor_id, payment_code, is_emergency, waiver_reason)
     VALUES (?, ?, ?, 'registered', ?, ?, 'routine', ?, ?, ?, ?, ?, 0, NULL)`,
    [
      fid,
      pid,
      ticketNumber,
      String(chiefComplaint || 'Follow-up consultation').slice(0, 500),
      dept,
      today,
      startedAt,
      uid,
      docId || null,
      code,
    ]
  );
  const newId = ins && ins.insertId ? parseInt(String(ins.insertId), 10) : 0;
  if (newId < 1) throw new Error('Failed to create follow-up visit.');
  return newId;
}

/**
 * Patients this doctor may start a follow-up for (follow-up request + payment validity).
 * @returns {Promise<Array<{ patient_id: number, first_name: string, last_name: string, phone: string, name: string, department: string, payment_code: string }>>}
 */
async function listEligibleFollowUpPatients(pool, facilityId, doctorEmpId, opts) {
  opts = opts || {};
  const fid = parseInt(String(facilityId || ''), 10) || 1;
  const did = parseInt(String(doctorEmpId || ''), 10) || 0;
  const maxPatients = Math.min(Math.max(parseInt(String(opts.limit || ''), 10) || 80, 1), 200);
  if (did < 1) return [];

  const [candidates] = await pool
    .query(
      `SELECT c.patient_id, MAX(c.id) AS last_consult_id
         FROM tbl_consultation c
        WHERE c.created_by = ?
        GROUP BY c.patient_id
        ORDER BY last_consult_id DESC
        LIMIT ?`,
      [did, maxPatients * 4]
    )
    .catch(() => [[]]);

  const eligibleIds = [];
  for (const row of candidates || []) {
    const pid = parseInt(String(row.patient_id || ''), 10) || 0;
    if (pid < 1) continue;
    const check = await assertFollowUpEligible(pool, fid, pid, did);
    if (check.ok) eligibleIds.push(pid);
    if (eligibleIds.length >= maxPatients) break;
  }

  if (!eligibleIds.length) return [];

  const placeholders = eligibleIds.map(() => '?').join(',');
  const [patients] = await pool
    .query(
      `SELECT id AS patient_id, first_name, last_name, phone
         FROM tbl_patient
        WHERE id IN (${placeholders}) AND status = 1`,
      eligibleIds
    )
    .catch(() => [[]]);

  const byId = new Map();
  for (const p of patients || []) {
    byId.set(parseInt(String(p.patient_id), 10), p);
  }

  const out = [];
  for (const pid of eligibleIds) {
    const p = byId.get(pid);
    if (!p) continue;
    const anchor = await findAnchorFollowUpRequest(pool, pid, did);
    const dept = anchor && anchor.consultation
      ? String(anchor.consultation.department || '').trim()
      : '';
    const code =
      anchor && anchor.consultation
        ? String(anchor.consultation.payment_code || '').trim()
        : '';
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || `Patient #${pid}`;
    out.push({
      patient_id: pid,
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      phone: p.phone || '',
      name,
      department: dept || 'General',
      payment_code: code,
    });
  }
  return out;
}

module.exports = {
  findAnchorFollowUpRequest,
  assertFollowUpEligible,
  createFollowUpOpdVisit,
  listEligibleFollowUpPatients,
};
