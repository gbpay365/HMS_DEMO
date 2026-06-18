'use strict';

const clinicalBusinessRules = require('./clinicalBusinessRules');
const { ensureVitalSignColumns } = require('./ensureVitalSignSchema');

const ACTIVE_VITALS = '(vs.superseded_at IS NULL OR vs.superseded_at = \'0000-00-00 00:00:00\')';

/**
 * OPD vitals linkage: resolve visit, detect recorded vitals, advance queue after nursing/triage.
 */

function normalizeVisitId(id) {
  const n = parseInt(id, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Strict-safe check for React/EJS visit card lists. */
function visitIdInVitalsList(visitIdsWithVitals, visitId) {
  const want = normalizeVisitId(visitId);
  if (!want) return false;
  return (visitIdsWithVitals || []).some((x) => normalizeVisitId(x) === want);
}

/**
 * Resolve OPD visit for a vitals save (explicit id, else today's active queue row).
 * @param {import('mysql2/promise').Pool} pool
 */
async function resolveOpdVisitIdForVitals(pool, { patientId, opdVisitId, facilityId }) {
  const pid = parseInt(patientId, 10) || 0;
  if (pid < 1) return 0;

  let vid = normalizeVisitId(opdVisitId);
  if (vid > 0) {
    const [[row]] = await pool
      .query('SELECT id FROM tbl_opd_visit WHERE id = ? AND patient_id = ? LIMIT 1', [vid, pid])
      .catch(() => [[null]]);
    if (row && row.id) return normalizeVisitId(row.id);
    vid = 0;
  }

  const fid = parseInt(facilityId, 10) || 1;
  let sql = `
    SELECT id FROM tbl_opd_visit
     WHERE patient_id = ?
       AND visit_date = CURDATE()
       AND LOWER(TRIM(COALESCE(queue_status,''))) NOT IN ('completed','cancelled')
  `;
  const params = [pid];
  const [[facCol]] = await pool
    .query(
      `SELECT 1 AS ok FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_opd_visit' AND COLUMN_NAME = 'facility_id' LIMIT 1`
    )
    .catch(() => [[null]]);
  if (facCol && facCol.ok) {
    sql += ' AND (facility_id = ? OR facility_id IS NULL OR facility_id = 0)';
    params.push(fid);
  }
  sql += `
     ORDER BY FIELD(LOWER(TRIM(COALESCE(queue_status,''))),
       'waiting_doctor', 'triage', 'registered', 'in_consultation', 'orders_pending', 'billing'),
       queue_started_at DESC, id DESC
     LIMIT 1`;

  const [[active]] = await pool.query(sql, params).catch(() => [[null]]);
  return normalizeVisitId(active && active.id);
}

/**
 * True when this visit has vitals (linked row, same-day unlinked row, or ER triage).
 */
async function opdVisitHasVitalsRecorded(pool, visitId, patientId) {
  const vid = normalizeVisitId(visitId);
  const pid = parseInt(patientId, 10) || 0;
  if (vid < 1 || pid < 1) return false;

  const [[row]] = await pool
    .query(
      `SELECT COUNT(*) AS cnt FROM tbl_vital_sign
       WHERE opd_visit_id = ? AND patient_id = ? AND ${ACTIVE_VITALS.replace(/vs\./g, '')}`,
      [vid, pid]
    )
    .catch(() => [[{ cnt: 0 }]]);
  if (row && parseInt(row.cnt || 0, 10) > 0) return true;

  const [[orphan]] = await pool
    .query(
      `SELECT COUNT(*) AS cnt
         FROM tbl_vital_sign vs
         JOIN tbl_opd_visit v ON v.id = ? AND v.patient_id = ?
        WHERE vs.patient_id = ?
          AND (vs.opd_visit_id IS NULL OR vs.opd_visit_id = 0)
          AND ${ACTIVE_VITALS}
          AND DATE(COALESCE(vs.recorded_at, vs.created_at)) = v.visit_date
          AND COALESCE(vs.recorded_at, vs.created_at) >= COALESCE(v.queue_started_at, TIMESTAMP(v.visit_date))`,
      [vid, pid, pid]
    )
    .catch(() => [[{ cnt: 0 }]]);
  if (orphan && parseInt(orphan.cnt || 0, 10) > 0) return true;

  const [[er]] = await pool
    .query(
      `SELECT v.is_emergency AS emg,
              t.bp_systolic, t.bp_diastolic, t.pulse, t.temp_celsius, t.spo2, t.respiratory_rate
         FROM tbl_opd_visit v
         LEFT JOIN tbl_er_triage t ON t.visit_id = v.id
        WHERE v.id = ? AND v.patient_id = ? LIMIT 1`,
      [vid, pid]
    )
    .catch(() => [[null]]);
  if (!er || !Number(er.emg)) return false;
  const nz = (x) => {
    if (x === '' || x == null) return false;
    const n = Number(x);
    return Number.isFinite(n);
  };
  return (
    nz(er.bp_systolic) ||
    nz(er.bp_diastolic) ||
    nz(er.pulse) ||
    nz(er.temp_celsius) ||
    nz(er.spo2) ||
    nz(er.respiratory_rate)
  );
}

/** Visit ids from today's queue that have vitals (direct link or same-day orphan vitals). */
async function fetchVisitIdsWithVitals(pool, visitIds) {
  const ids = [...new Set((visitIds || []).map((id) => normalizeVisitId(id)).filter(Boolean))];
  if (!ids.length) return [];

  const [vitalRows] = await pool
    .query(
      `SELECT DISTINCT vs.opd_visit_id AS vid FROM tbl_vital_sign vs
        WHERE vs.opd_visit_id IN (?)
          AND ${ACTIVE_VITALS}`,
      [ids]
    )
    .catch(() => [[]]);
  const withVitals = new Set(
    (vitalRows || []).map((r) => normalizeVisitId(r.vid)).filter(Boolean)
  );

  for (const id of ids) {
    if (withVitals.has(id)) continue;
    const [[v]] = await pool
      .query('SELECT patient_id FROM tbl_opd_visit WHERE id = ? LIMIT 1', [id])
      .catch(() => [[null]]);
    if (v && (await opdVisitHasVitalsRecorded(pool, id, v.patient_id))) withVitals.add(id);
  }

  return [...withVitals];
}

/**
 * After vitals saved: link row to visit if needed, advance registered/triage → waiting_doctor.
 */
async function afterOpdVitalsSaved(pool, { vitalSignId, visitId, patientId, userId, triageNotes }) {
  const vid = normalizeVisitId(visitId);
  const pid = parseInt(patientId, 10) || 0;
  const uid = parseInt(userId, 10) || null;
  const vsId = parseInt(vitalSignId, 10) || 0;

  if (vsId > 0 && vid > 0) {
    await pool
      .query(
        'UPDATE tbl_vital_sign SET opd_visit_id = ? WHERE id = ? AND patient_id = ? AND (opd_visit_id IS NULL OR opd_visit_id = 0)',
        [vid, vsId, pid]
      )
      .catch(() => {});
  }

  if (vid < 1) return;

  const notes = triageNotes != null ? String(triageNotes).trim() || null : null;
  await pool
    .query(
      `UPDATE tbl_opd_visit
          SET queue_status = 'waiting_doctor',
              triage_notes = COALESCE(?, triage_notes),
              triage_done_by = COALESCE(?, triage_done_by),
              triage_done_at = COALESCE(triage_done_at, NOW())
        WHERE id = ?
          AND patient_id = ?
          AND LOWER(TRIM(COALESCE(queue_status,''))) IN ('registered', 'triage')`,
      [notes, uid, vid, pid]
    )
    .catch(() => {});
  try {
    require('./opdCallQueueLive').notifyOpdQueueChanged();
  } catch (_) {
    /* optional */
  }
}

/**
 * Server gate before saving OPD-linked vitals (payment, role, one-time nurse entry).
 * @param {import('mysql2/promise').Pool} pool
 */
async function assertOpdVitalsSaveAllowed(pool, {
  patientId,
  opdVisitId,
  facilityId,
  userRole,
  admissionId,
}) {
  const aid = parseInt(admissionId, 10) || 0;
  if (aid > 0) {
    if (clinicalBusinessRules.isDoctorStaffRole(userRole)) {
      return { ok: false, error: clinicalBusinessRules.MSG_VITALS_DOCTOR_FORBIDDEN, code: 'doctor_forbidden' };
    }
    return { ok: true, meta: { context: 'ipd' } };
  }

  const pid = parseInt(patientId, 10) || 0;
  const fid = parseInt(facilityId, 10) || 1;
  let vid = normalizeVisitId(opdVisitId);
  if (vid < 1 && pid > 0) {
    vid = await resolveOpdVisitIdForVitals(pool, { patientId: pid, opdVisitId: 0, facilityId: fid });
  }
  if (vid < 1) {
    return {
      ok: false,
      error: clinicalBusinessRules.MSG_VITALS_PAYMENT,
      code: 'no_visit',
    };
  }

  const [[visit]] = await pool
    .query('SELECT * FROM tbl_opd_visit WHERE id = ? AND patient_id = ? LIMIT 1', [vid, pid])
    .catch(() => [[null]]);
  if (!visit) {
    return { ok: false, error: 'Visit not found.', code: 'visit_not_found' };
  }

  const hasVitals = await opdVisitHasVitalsRecorded(pool, vid, pid);
  return clinicalBusinessRules.assertOpdVisitVitalsAllowed(pool, visit, fid, {
    userRole,
    blockIfVitalsExist: true,
    hasVitalsAlready: hasVitals,
  });
}

function staffMayRecordOpdVitals({ role, perms, aclTriageVisible }) {
  if (clinicalBusinessRules.isDoctorStaffRole(role)) return false;
  const p = perms || [];
  const hasStar = p.includes('*');
  const hasNursing = hasStar || p.includes('nursing.write') || p.includes('nursing.read');
  const hasOpd = hasStar || p.includes('opd.write');
  const hasClinicalOnly =
    (hasStar || p.includes('clinical.write') || p.includes('prescription.write')) &&
    !hasNursing &&
    !hasOpd;
  if (hasClinicalOnly) return false;
  return !!aclTriageVisible || hasNursing || hasOpd;
}

/**
 * Doctor requests nursing to retake vitals: supersede current readings and return visit to triage.
 * @param {import('mysql2/promise').Pool} pool
 */
async function requestOpdVitalsRetake(pool, { visitId, patientId, userId }) {
  const vid = normalizeVisitId(visitId);
  const pid = parseInt(patientId, 10) || 0;
  const uid = parseInt(userId, 10) || null;
  if (vid < 1 || pid < 1) return { ok: false, code: 'invalid_args' };

  const [[visit]] = await pool
    .query('SELECT * FROM tbl_opd_visit WHERE id = ? AND patient_id = ? LIMIT 1', [vid, pid])
    .catch(() => [[null]]);
  if (!visit) return { ok: false, code: 'visit_not_found' };

  const qs = String(visit.queue_status || '').trim().toLowerCase();
  const allowed = ['registered', 'triage', 'waiting_doctor', 'in_consultation'];
  if (!allowed.includes(qs)) return { ok: false, code: 'status_not_allowed' };

  const hasV = await opdVisitHasVitalsRecorded(pool, vid, pid);
  if (!hasV) return { ok: false, code: 'no_vitals' };

  await ensureVitalSignColumns(pool);

  await pool
    .query(
      `UPDATE tbl_vital_sign
          SET superseded_at = NOW(), superseded_by = ?
        WHERE patient_id = ? AND opd_visit_id = ? AND (superseded_at IS NULL OR superseded_at = '0000-00-00 00:00:00')`,
      [uid, pid, vid]
    )
    .catch(() => {});

  await pool
    .query(
      `UPDATE tbl_vital_sign vs
         JOIN tbl_opd_visit v ON v.id = ? AND v.patient_id = ?
          SET vs.superseded_at = NOW(), vs.superseded_by = ?
        WHERE vs.patient_id = ?
          AND (vs.opd_visit_id IS NULL OR vs.opd_visit_id = 0)
          AND (vs.superseded_at IS NULL OR vs.superseded_at = '0000-00-00 00:00:00')
          AND DATE(COALESCE(vs.recorded_at, vs.created_at)) = v.visit_date
          AND COALESCE(vs.recorded_at, vs.created_at) >= COALESCE(v.queue_started_at, TIMESTAMP(v.visit_date))`,
      [vid, pid, uid, pid]
    )
    .catch(() => {});

  await pool
    .query(
      `UPDATE tbl_opd_visit
          SET queue_status = 'triage',
              triage_done_at = NULL,
              triage_done_by = NULL
        WHERE id = ? AND patient_id = ?`,
      [vid, pid]
    )
    .catch(() => {});

  return { ok: true };
}

module.exports = {
  normalizeVisitId,
  visitIdInVitalsList,
  resolveOpdVisitIdForVitals,
  opdVisitHasVitalsRecorded,
  fetchVisitIdsWithVitals,
  afterOpdVitalsSaved,
  assertOpdVitalsSaveAllowed,
  staffMayRecordOpdVitals,
  requestOpdVitalsRetake,
};
