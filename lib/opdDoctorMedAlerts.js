'use strict';

const ensureOpdMedSchema = require('./ensureOpdMedSchema');

let _ready = null;

async function ready(pool) {
  if (!_ready) _ready = ensureOpdMedSchema(pool);
  return _ready;
}

/**
 * Notify prescribing doctor when a nurse administers an OPD dose (if treatment.alert_on_administer).
 */
async function enqueueDoseAdministeredAlert(pool, o) {
  await ready(pool);
  const doctorId = parseInt(o.target_doctor_id, 10) || 0;
  const visitId = parseInt(o.opd_visit_id, 10) || 0;
  if (doctorId < 1 || visitId < 1) return;

  const fid = parseInt(o.facility_id, 10) || 1;
  await pool
    .query(
      `INSERT INTO tbl_opd_med_doctor_alert
        (facility_id, opd_visit_id, patient_id, target_doctor_id, prescription_id, dose_slot_id,
         drug_display, dose_display, nurse_display, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
      [
        fid,
        visitId,
        o.patient_id || null,
        doctorId,
        o.prescription_id || null,
        o.dose_slot_id || null,
        (o.drug_display || '').slice(0, 300) || null,
        (o.dose_display || '').slice(0, 120) || null,
        (o.nurse_display || '').slice(0, 120) || null,
      ]
    )
    .catch((e) => console.warn('[opdDoctorMedAlerts] enqueue', e.message));
}

async function listUnackedForDoctor(pool, doctorId, limit = 40) {
  await ready(pool);
  const did = parseInt(doctorId, 10) || 0;
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 40));
  if (did < 1) return [];
  const [rows] = await pool
    .query(
      `SELECT a.*,
              CONCAT(p.first_name,' ',p.last_name) AS patient_display,
              v.ticket_number,
              v.department AS visit_department
         FROM tbl_opd_med_doctor_alert a
         LEFT JOIN tbl_patient p ON p.id = a.patient_id
         LEFT JOIN tbl_opd_visit v ON v.id = a.opd_visit_id
         LEFT JOIN tbl_opd_med_doctor_alert_ack k ON k.alert_id = a.id AND k.user_id = ?
        WHERE a.target_doctor_id = ?
          AND k.alert_id IS NULL
        ORDER BY a.id DESC
        LIMIT ?`,
      [did, did, lim]
    )
    .catch(() => [[]]);
  return Array.isArray(rows) ? rows : [];
}

async function listAllRecentForDoctor(pool, doctorId, limit = 60) {
  await ready(pool);
  const did = parseInt(doctorId, 10) || 0;
  const lim = Math.min(120, Math.max(1, parseInt(limit, 10) || 60));
  if (did < 1) return [];
  const [rows] = await pool
    .query(
      `SELECT a.*,
              CONCAT(p.first_name,' ',p.last_name) AS patient_display,
              v.ticket_number,
              v.department AS visit_department
         FROM tbl_opd_med_doctor_alert a
         LEFT JOIN tbl_patient p ON p.id = a.patient_id
         LEFT JOIN tbl_opd_visit v ON v.id = a.opd_visit_id
        WHERE a.target_doctor_id = ?
        ORDER BY a.id DESC
        LIMIT ?`,
      [did, lim]
    )
    .catch(() => [[]]);
  return Array.isArray(rows) ? rows : [];
}

async function getById(pool, alertId) {
  await ready(pool);
  const aid = parseInt(alertId, 10) || 0;
  if (aid < 1) return null;
  const [[row]] = await pool
    .query(
      `SELECT a.*,
              CONCAT(p.first_name,' ',p.last_name) AS patient_display,
              v.ticket_number,
              v.department AS visit_department
         FROM tbl_opd_med_doctor_alert a
         LEFT JOIN tbl_patient p ON p.id = a.patient_id
         LEFT JOIN tbl_opd_visit v ON v.id = a.opd_visit_id
        WHERE a.id = ? LIMIT 1`,
      [aid]
    )
    .catch(() => [[null]]);
  return row || null;
}

async function acknowledge(pool, alertId, userId) {
  await ready(pool);
  const aid = parseInt(alertId, 10) || 0;
  const uid = parseInt(userId, 10) || 0;
  if (aid < 1 || uid < 1) return;
  await pool
    .query(
      `INSERT IGNORE INTO tbl_opd_med_doctor_alert_ack (alert_id, user_id) VALUES (?,?)`,
      [aid, uid]
    )
    .catch(() => {});
}

module.exports = {
  enqueueDoseAdministeredAlert,
  listUnackedForDoctor,
  listAllRecentForDoctor,
  getById,
  acknowledge,
};
