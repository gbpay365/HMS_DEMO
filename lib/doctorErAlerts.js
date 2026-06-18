'use strict';

/**
 * In-app alerts for doctors when emergency patients arrive or need medical assistance.
 */

const ACUITY_LABELS = {
  1: 'Resuscitation',
  2: 'Emergent',
  3: 'Urgent',
  4: 'Less urgent',
  5: 'Non-urgent',
};

let _schemaPromise = null;

function ensureSchema(pool) {
  if (!_schemaPromise) {
    _schemaPromise = (async () => {
      await pool
        .query(
          `CREATE TABLE IF NOT EXISTS tbl_doctor_er_alert (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            facility_id INT DEFAULT 1,
            alert_type VARCHAR(32) NOT NULL,
            target_doctor_id INT NULL,
            patient_display VARCHAR(255) NULL,
            location_display VARCHAR(255) NULL,
            ward_display VARCHAR(255) NULL,
            bed_display VARCHAR(160) NULL,
            chief_complaint VARCHAR(600) NULL,
            acuity_level TINYINT NULL,
            ticket_number VARCHAR(64) NULL,
            patient_id INT NULL,
            opd_visit_id INT NULL,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_doctor_created (target_doctor_id, created_at),
            KEY idx_visit_type (opd_visit_id, alert_type),
            KEY idx_patient (patient_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
        )
        .catch(() => {});
      await pool
        .query(
          `CREATE TABLE IF NOT EXISTS tbl_doctor_er_alert_ack (
            alert_id BIGINT NOT NULL,
            user_id INT NOT NULL,
            acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (alert_id, user_id),
            KEY idx_user (user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
        )
        .catch(() => {});
    })();
  }
  return _schemaPromise;
}

async function loadVisitContext(pool, visitId) {
  const vid = parseInt(visitId, 10) || 0;
  if (vid < 1) return null;
  const [rows] = await pool
    .query(
      `SELECT v.id, v.facility_id, v.patient_id, v.ticket_number, v.chief_complaint,
              v.acuity_level, v.assigned_doctor_id, v.queue_status, v.department,
              p.first_name, p.last_name,
              b.label AS bed_label, b.bed_code, b.bay_type
         FROM tbl_opd_visit v
         JOIN tbl_patient p ON p.id = v.patient_id
         LEFT JOIN tbl_er_bed b ON b.id = v.er_bed_id
        WHERE v.id = ? AND v.is_emergency = 1
        LIMIT 1`,
      [vid]
    )
    .catch(() => [[]]);
  return rows && rows[0] ? rows[0] : null;
}

async function hasUnackedAlert(pool, visitId, alertType, targetDoctorId) {
  const [rows] = await pool
    .query(
      `SELECT a.id
         FROM tbl_doctor_er_alert a
         LEFT JOIN tbl_doctor_er_alert_ack k ON k.alert_id = a.id
        WHERE a.opd_visit_id = ?
          AND a.alert_type = ?
          AND (a.target_doctor_id <=> ?)
          AND k.alert_id IS NULL
        LIMIT 1`,
      [visitId, alertType, targetDoctorId ?? null]
    )
    .catch(() => [[]]);
  return !!(rows && rows[0]);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} o
 */
async function enqueueAlert(pool, o) {
  await ensureSchema(pool);
  const visitId = parseInt(o.opd_visit_id, 10) || 0;
  const alertType = String(o.alert_type || '').trim();
  if (!visitId || !alertType) return;

  const targetDoctorId =
    o.target_doctor_id != null && o.target_doctor_id !== ''
      ? parseInt(o.target_doctor_id, 10) || null
      : null;

  if (await hasUnackedAlert(pool, visitId, alertType, targetDoctorId)) return;

  let row = o._visit || null;
  if (!row) row = await loadVisitContext(pool, visitId);
  if (!row) return;

  const patientDisplay =
    o.patient_display ||
    `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim() ||
    'Patient';
  const ward =
    o.ward_display ||
    (row.bay_type ? String(row.bay_type) : null) ||
    'A&E';
  const bed =
    o.bed_display ||
    (row.bed_label ? String(row.bed_label) : null) ||
    (row.bed_code ? String(row.bed_code) : null) ||
    null;
  const fid = o.facility_id != null ? Number(o.facility_id) || 1 : Number(row.facility_id) || 1;
  const doctorTarget =
    targetDoctorId != null ? targetDoctorId : parseInt(row.assigned_doctor_id, 10) || null;

  await pool
    .query(
      `INSERT INTO tbl_doctor_er_alert
        (facility_id, alert_type, target_doctor_id, patient_display, location_display,
         ward_display, bed_display, chief_complaint, acuity_level, ticket_number,
         patient_id, opd_visit_id, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        fid,
        alertType,
        doctorTarget,
        patientDisplay.slice(0, 255),
        (o.location_display || row.department || 'Emergency / A&E').slice(0, 255),
        String(ward).slice(0, 255),
        bed ? String(bed).slice(0, 160) : null,
        (o.chief_complaint || row.chief_complaint || '').slice(0, 600) || null,
        o.acuity_level != null ? parseInt(o.acuity_level, 10) || null : row.acuity_level || null,
        (o.ticket_number || row.ticket_number || '').slice(0, 64) || null,
        row.patient_id || null,
        visitId,
        o.created_by || null,
      ]
    )
    .catch((e) => console.warn('[doctorErAlerts] enqueue', e.message));
}

async function enqueueFromVisit(pool, visitId, alertType, opts = {}) {
  const row = await loadVisitContext(pool, visitId);
  if (!row) return;
  const target =
    opts.target_doctor_id != null
      ? parseInt(opts.target_doctor_id, 10) || null
      : parseInt(row.assigned_doctor_id, 10) || null;
  if (target == null && !opts.broadcast_if_unassigned) return;
  await enqueueAlert(pool, {
    opd_visit_id: visitId,
    alert_type: alertType,
    target_doctor_id: target,
    acuity_level: row.acuity_level,
    created_by: opts.created_by || null,
    facility_id: row.facility_id,
    _visit: row,
  });
}

async function listUnackedForDoctor(pool, doctorId, limit = 40) {
  await ensureSchema(pool);
  const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 40));
  const did = parseInt(doctorId, 10) || 0;
  if (did < 1) return [];
  const [rows] = await pool
    .query(
      `SELECT a.*
         FROM tbl_doctor_er_alert a
         LEFT JOIN tbl_doctor_er_alert_ack k
           ON k.alert_id = a.id AND k.user_id = ?
        WHERE k.alert_id IS NULL
          AND (a.target_doctor_id IS NULL OR a.target_doctor_id = ?)
        ORDER BY a.id DESC
        LIMIT ?`,
      [did, did, lim]
    )
    .catch(() => [[]]);
  return Array.isArray(rows) ? rows : [];
}

async function listAllRecentForDoctor(pool, doctorId, limit = 100) {
  await ensureSchema(pool);
  const lim = Math.min(300, Math.max(1, parseInt(limit, 10) || 100));
  const did = parseInt(doctorId, 10) || 0;
  if (did < 1) return [];
  const [rows] = await pool
    .query(
      `SELECT a.*
         FROM tbl_doctor_er_alert a
        WHERE a.target_doctor_id IS NULL OR a.target_doctor_id = ?
        ORDER BY a.id DESC
        LIMIT ?`,
      [did, lim]
    )
    .catch(() => [[]]);
  return Array.isArray(rows) ? rows : [];
}

async function acknowledge(pool, alertId, userId) {
  await ensureSchema(pool);
  const aid = parseInt(alertId, 10) || 0;
  const uid = parseInt(userId, 10) || 0;
  if (aid < 1 || uid < 1) return false;
  await pool
    .query(
      `INSERT IGNORE INTO tbl_doctor_er_alert_ack (alert_id, user_id, acknowledged_at) VALUES (?,?,NOW())`,
      [aid, uid]
    )
    .catch(() => {});
  return true;
}

async function acknowledgeForVisit(pool, visitId, userId) {
  await ensureSchema(pool);
  const vid = parseInt(visitId, 10) || 0;
  const uid = parseInt(userId, 10) || 0;
  if (vid < 1 || uid < 1) return;
  const [rows] = await pool
    .query(
      `SELECT a.id
         FROM tbl_doctor_er_alert a
         LEFT JOIN tbl_doctor_er_alert_ack k ON k.alert_id = a.id AND k.user_id = ?
        WHERE a.opd_visit_id = ?
          AND (a.target_doctor_id IS NULL OR a.target_doctor_id = ?)
          AND k.alert_id IS NULL`,
      [uid, vid, uid]
    )
    .catch(() => [[]]);
  for (const r of rows || []) {
    await acknowledge(pool, r.id, uid);
  }
}

function acuityLabel(level) {
  const n = parseInt(level, 10);
  return ACUITY_LABELS[n] || null;
}

module.exports = {
  ensureSchema,
  enqueueAlert,
  enqueueFromVisit,
  listUnackedForDoctor,
  listAllRecentForDoctor,
  acknowledge,
  acknowledgeForVisit,
  loadVisitContext,
  acuityLabel,
  ACUITY_LABELS,
};
