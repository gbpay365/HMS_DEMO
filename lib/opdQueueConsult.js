'use strict';

const { enrichOpdVisitsRoomContext } = require('./opdVisitRoomQueue');
const { ensureDoctorDutySchema } = require('./ensureDoctorDutySchema');

function notifyLobbyQueueChanged() {
  try {
    require('./opdCallQueueLive').notifyOpdQueueChanged();
  } catch (_) {
    /* WebSocket optional */
  }
}

async function announcePatientCalled(pool, visitId, doctorId) {
  try {
    const { buildPatientCalledPayload } = require('./opdCallQueueAnnounce');
    const live = require('./opdCallQueueLive');
    const payload = await buildPatientCalledPayload(pool, { visitId, doctorId });
    if (payload) live.broadcastPatientCalled(payload);
  } catch (_) {
    notifyLobbyQueueChanged();
  }
}

async function resolveSuggestedRoomId(pool, visit, doctorId) {
  const enriched = [{ ...visit }];
  await enrichOpdVisitsRoomContext(pool, enriched);
  const row = enriched[0] || {};
  const explicit = parseInt(row.consultation_room_id, 10) || 0;
  if (explicit) return explicit;
  const suggested = parseInt(row.suggested_room_id || row.display_room_id, 10) || 0;
  if (suggested) return suggested;
  if (!doctorId) return 0;
  const fid = parseInt(String(visit.facility_id ?? 1), 10) || 1;
  const [[room]] = await pool
    .query(
      `SELECT cr.id FROM tbl_consultation_room cr
        LEFT JOIN tbl_consultation_room_doctor crd ON crd.room_id = cr.id
       WHERE cr.facility_id = ? AND cr.status = 1
         AND (cr.assigned_doctor_id = ? OR crd.doctor_id = ?)
       ORDER BY cr.sort_order ASC, cr.id ASC
       LIMIT 1`,
      [fid, doctorId, doctorId]
    )
    .catch(() => [[null]]);
  return parseInt(room?.id, 10) || 0;
}

/**
 * Mark visit as in consultation; assign doctor and room when missing.
 */
async function markVisitInConsultation(pool, opts) {
  await ensureDoctorDutySchema(pool);
  const visitId = parseInt(opts.visitId, 10) || 0;
  const doctorId = parseInt(opts.doctorId, 10) || 0;
  if (visitId < 1) return { ok: false, error: 'invalid_visit' };

  const [[visit]] = await pool
    .query('SELECT * FROM tbl_opd_visit WHERE id = ? LIMIT 1', [visitId])
    .catch(() => [[null]]);
  if (!visit) return { ok: false, error: 'visit_not_found' };

  const cur = String(visit.queue_status || '').trim().toLowerCase();
  if (['completed', 'cancelled'].includes(cur)) {
    return { ok: false, error: 'visit_closed' };
  }

  const assigned = parseInt(visit.assigned_doctor_id, 10) || 0;
  const setDoctor = assigned > 0 ? assigned : doctorId;
  const roomId = await resolveSuggestedRoomId(pool, visit, setDoctor);

  const sets = ["queue_status = 'in_consultation'", 'consultation_started_at = COALESCE(consultation_started_at, NOW())'];
  const args = [];
  if (setDoctor && !assigned) {
    sets.push('assigned_doctor_id = ?');
    args.push(setDoctor);
  }
  if (roomId && !(parseInt(visit.consultation_room_id, 10) || 0)) {
    sets.push('consultation_room_id = ?');
    args.push(roomId);
  }
  args.push(visitId);
  await pool.query(`UPDATE tbl_opd_visit SET ${sets.join(', ')} WHERE id = ?`, args);

  const [[updated]] = await pool.query('SELECT * FROM tbl_opd_visit WHERE id = ? LIMIT 1', [visitId]).catch(() => [[null]]);
  await announcePatientCalled(pool, visitId, setDoctor || doctorId);
  return { ok: true, visit: updated };
}

/**
 * Pick next waiting_doctor visit for this doctor (or unassigned) and mark in consultation.
 */
async function callNextPatientForDoctor(pool, opts) {
  const doctorId = parseInt(opts.doctorId, 10) || 0;
  const facilityId = parseInt(opts.facilityId, 10) || 1;
  const today = String(opts.visitDate || new Date().toISOString().split('T')[0]).slice(0, 10);
  if (doctorId < 1) return { ok: false, error: 'doctor_required' };

  const [rows] = await pool
    .query(
      `SELECT v.id, v.patient_id, v.assigned_doctor_id, v.ticket_number, v.queue_status, v.facility_id,
              p.first_name, p.last_name
         FROM tbl_opd_visit v
         JOIN tbl_patient p ON p.id = v.patient_id
        WHERE v.facility_id = ?
          AND v.visit_date = ?
          AND v.queue_status = 'waiting_doctor'
          AND COALESCE(v.is_emergency, 0) = 0
          AND (v.assigned_doctor_id = ? OR v.assigned_doctor_id IS NULL OR v.assigned_doctor_id = 0)
        ORDER BY v.priority = 'urgent' DESC, v.queue_started_at ASC, v.id ASC
        LIMIT 1`,
      [facilityId, today, doctorId]
    )
    .catch(() => [[]]);

  const next = rows && rows[0];
  if (!next) return { ok: false, error: 'no_patients_waiting' };

  const out = await markVisitInConsultation(pool, { visitId: next.id, doctorId });
  if (!out.ok) return out;

  const roomId = await resolveSuggestedRoomId(pool, out.visit || next, doctorId);
  let roomLabel = '';
  if (roomId) {
    const [[rm]] = await pool
      .query('SELECT name, code FROM tbl_consultation_room WHERE id = ? LIMIT 1', [roomId])
      .catch(() => [[null]]);
    roomLabel = String(rm?.name || rm?.code || '').trim();
  }

  return {
    ok: true,
    visitId: next.id,
    patientId: next.patient_id,
    ticketNumber: next.ticket_number,
    patientName: [next.first_name, next.last_name].filter(Boolean).join(' '),
    roomId: roomId || null,
    roomLabel,
    consultUrl: `/consultation-new?patient_id=${next.patient_id}&visit_id=${next.id}`,
  };
}

module.exports = {
  markVisitInConsultation,
  callNextPatientForDoctor,
  resolveSuggestedRoomId,
};
