'use strict';

async function getConfig(pool) {
  const [[row]] = await pool
    .query('SELECT * FROM tbl_waiting_screen_config WHERE id=1 LIMIT 1')
    .catch(() => [[null]]);
  return (
    row || {
      welcome_message: 'Welcome — please wait to be called',
      show_patient_name: 1,
      show_doctor_name: 1,
      show_room: 1,
      show_ticket_number: 1,
      refresh_seconds: 5,
      chime_enabled: 1,
      tts_enabled: 1,
    }
  );
}

async function getQueuePayload(pool) {
  const today = new Date().toISOString().split('T')[0];
  const [waiting] = await pool
    .query(
      `SELECT v.id, v.ticket_number, v.queue_status, v.priority, v.queue_started_at,
              p.first_name, p.last_name,
              doc.first_name AS doc_fn, doc.last_name AS doc_ln,
              cr.name AS room_name, cr.code AS room_code
       FROM tbl_opd_visit v
       JOIN tbl_patient p ON p.id = v.patient_id
       LEFT JOIN tbl_employee doc ON doc.id = v.assigned_doctor_id
       LEFT JOIN tbl_consultation_room cr ON cr.id = v.consultation_room_id
       WHERE v.visit_date = ?
         AND v.queue_status IN ('registered','triage','waiting_doctor')
       ORDER BY v.priority = 'urgent' DESC, v.queue_started_at ASC, v.id ASC
       LIMIT 30`,
      [today]
    )
    .catch(() => [[]]);

  const [[inConsult]] = await pool
    .query(
      `SELECT v.id, v.ticket_number, p.first_name, p.last_name,
              doc.first_name AS doc_fn, doc.last_name AS doc_ln,
              cr.name AS room_name
       FROM tbl_opd_visit v
       JOIN tbl_patient p ON p.id = v.patient_id
       LEFT JOIN tbl_employee doc ON doc.id = v.assigned_doctor_id
       LEFT JOIN tbl_consultation_room cr ON cr.id = v.consultation_room_id
       WHERE v.visit_date = ? AND v.queue_status = 'in_consultation'
       ORDER BY v.id DESC LIMIT 1`,
      [today]
    )
    .catch(() => [[null]]);

  const next = (waiting && waiting[0]) || null;
  return {
    waiting: waiting || [],
    inConsult: inConsult || null,
    next,
    nextVisitId: next ? next.id : null,
  };
}

module.exports = { getConfig, getQueuePayload };
