'use strict';

const opdVisitCarryForward = require('./opdVisitCarryForward');
const { ensureDoctorDutySchema } = require('./ensureDoctorDutySchema');
const { resolveSuggestedRoomId } = require('./opdQueueConsult');

function notifyLobby() {
  try {
    const live = require('./opdCallQueueLive');
    live.notifyOpdQueueChanged();
  } catch (_) {}
}

async function ensureAppointmentOpdColumn(pool) {
  await ensureDoctorDutySchema(pool);
  await pool.query('ALTER TABLE tbl_appointment ADD COLUMN opd_visit_id INT NULL DEFAULT NULL').catch(() => {});
}

async function nextOpdTicketNumber(pool) {
  const year = new Date().getFullYear();
  const prefix = `OPD-${year}-`;
  const [maxRow] = await pool.query(
    'SELECT ticket_number FROM tbl_opd_visit WHERE ticket_number LIKE ? ORDER BY id DESC LIMIT 1',
    [`${prefix}%`]
  );
  let nextSeq = 1;
  if (maxRow.length > 0) {
    const parts = maxRow[0].ticket_number.split('-');
    nextSeq = (parseInt(parts[parts.length - 1]) || 0) + 1;
  }
  return prefix + nextSeq.toString().padStart(4, '0');
}

/**
 * Create or link an OPD visit when a scheduled appointment patient arrives.
 */
async function checkInAppointmentToOpd(pool, opts = {}) {
  await ensureAppointmentOpdColumn(pool);

  const appointmentId = parseInt(opts.appointmentId, 10) || 0;
  const userId = parseInt(opts.userId, 10) || 1;
  const facilityId = parseInt(opts.facilityId, 10) || 1;
  const today = new Date().toISOString().split('T')[0];

  if (appointmentId < 1) return { ok: false, error: 'invalid_appointment' };

  const [[appt]] = await pool
    .query('SELECT * FROM tbl_appointment WHERE id = ? LIMIT 1', [appointmentId])
    .catch(() => [[null]]);
  if (!appt) return { ok: false, error: 'appointment_not_found' };

  const status = parseInt(appt.status, 10);
  if (status === 0) return { ok: false, error: 'appointment_cancelled' };
  if (status === 2) return { ok: false, error: 'appointment_completed' };

  const patientId = parseInt(appt.patient_id, 10) || 0;
  if (patientId < 1) return { ok: false, error: 'no_patient' };

  const apptDate = String(appt.date || appt.appointment_date || today).slice(0, 10);
  if (apptDate !== today) {
    return { ok: false, error: 'appointment_not_today', appointmentDate: apptDate };
  }

  const linkedVisitId = parseInt(appt.opd_visit_id, 10) || 0;
  if (linkedVisitId > 0) {
    const [[linked]] = await pool
      .query(
        `SELECT id, queue_status, ticket_number FROM tbl_opd_visit
          WHERE id = ? AND patient_id = ?
            AND LOWER(TRIM(COALESCE(queue_status,''))) NOT IN ('completed','cancelled')
          LIMIT 1`,
        [linkedVisitId, patientId]
      )
      .catch(() => [[null]]);
    if (linked) {
      notifyLobby();
      return {
        ok: true,
        visitId: linked.id,
        ticketNumber: linked.ticket_number,
        alreadyCheckedIn: true,
        queueStatus: linked.queue_status,
      };
    }
  }

  const existing = await opdVisitCarryForward.findActiveOpdVisitForPatient(pool, patientId, {
    excludeEmergency: true,
  });
  if (existing && existing.id) {
    await pool
      .query('UPDATE tbl_appointment SET opd_visit_id = ? WHERE id = ?', [existing.id, appointmentId])
      .catch(() => {});
    notifyLobby();
    return {
      ok: true,
      visitId: existing.id,
      ticketNumber: existing.ticket_number,
      alreadyCheckedIn: true,
      queueStatus: existing.queue_status,
    };
  }

  const doctorId = parseInt(appt.doctor_id, 10) || 0;
  const department =
    String(appt.department_name || appt.department || '').trim() || 'General';
  const bookTime = String(appt.time || appt.slot_start || '').slice(0, 5);
  const startedAt = bookTime
    ? new Date(`${apptDate}T${bookTime}:00`)
    : new Date();
  const initStatus = doctorId > 0 ? 'waiting_doctor' : 'registered';
  const ticketNumber = await nextOpdTicketNumber(pool);

  let roomId = 0;
  if (doctorId > 0) {
    roomId = await resolveSuggestedRoomId(
      pool,
      { facility_id: facilityId, consultation_room_id: null },
      doctorId
    );
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO tbl_opd_visit
        (facility_id, patient_id, ticket_number, queue_status, chief_complaint,
         department, priority, visit_date, queue_started_at, created_by,
         assigned_doctor_id, consultation_room_id, payment_code, is_emergency)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, 0)`,
      [
        facilityId,
        patientId,
        ticketNumber,
        initStatus,
        String(appt.message || '').slice(0, 500),
        department,
        apptDate,
        startedAt,
        userId,
        doctorId || null,
        roomId || null,
        appt.payment_code || null,
      ]
    );
    const visitId = ins.insertId;
    await conn.query('UPDATE tbl_appointment SET opd_visit_id = ? WHERE id = ?', [visitId, appointmentId]);
    await conn.commit();
    notifyLobby();
    return {
      ok: true,
      visitId,
      ticketNumber,
      queueStatus: initStatus,
      alreadyCheckedIn: false,
      opdQueueUrl: '/opd-queue',
    };
  } catch (e) {
    await conn.rollback().catch(() => {});
    return { ok: false, error: e.message || 'check_in_failed' };
  } finally {
    conn.release();
  }
}

module.exports = {
  checkInAppointmentToOpd,
  ensureAppointmentOpdColumn,
};
