'use strict';

const {
  visitBoardPublicName,
  formatQueueDoctorParts,
} = require('./opdCallQueue');

/**
 * Build WebSocket payload when a patient is called to consultation.
 */
async function buildPatientCalledPayload(pool, opts = {}) {
  const visitId = parseInt(opts.visitId, 10) || 0;
  if (visitId < 1 || !pool) return null;

  const [[row]] = await pool
    .query(
      `SELECT v.id, v.ticket_number, v.assigned_doctor_id, v.consultation_room_id, v.patient_id,
              p.first_name, p.last_name,
              doc.first_name AS doc_fn, doc.last_name AS doc_ln,
              cr.name AS room_name, cr.code AS room_code
         FROM tbl_opd_visit v
         JOIN tbl_patient p ON p.id = v.patient_id
         LEFT JOIN tbl_employee doc ON doc.id = v.assigned_doctor_id
         LEFT JOIN tbl_consultation_room cr ON cr.id = v.consultation_room_id
        WHERE v.id = ?
        LIMIT 1`,
      [visitId]
    )
    .catch(() => [[null]]);

  if (!row) return null;

  const doctorId =
    parseInt(opts.doctorId, 10) ||
    parseInt(row.assigned_doctor_id, 10) ||
    0;
  const roomId = parseInt(row.consultation_room_id, 10) || 0;
  const roomLabel = String(row.room_name || row.room_code || '').trim();

  return {
    type: 'patient_called',
    visitId: row.id,
    patientId: row.patient_id,
    ticketNumber: row.ticket_number || '',
    displayName: visitBoardPublicName(row),
    doctorId,
    doctorName: formatQueueDoctorParts(row.doc_fn, row.doc_ln),
    roomId,
    roomLabel,
    calledAt: new Date().toISOString(),
    ttsEn: buildTtsLine('en', row, roomLabel),
    ttsFr: buildTtsLine('fr', row, roomLabel),
  };
}

function buildTtsLine(lang, row, roomLabel) {
  const name = visitBoardPublicName(row);
  const ticket = String(row.ticket_number || '').trim();
  const room = roomLabel || (lang === 'fr' ? 'la salle de consultation' : 'the consultation room');
  if (lang === 'fr') {
    return ticket
      ? `Patient ${name}, ticket ${ticket}. Veuillez vous rendre à ${room}.`
      : `Patient ${name}. Veuillez vous rendre à ${room}.`;
  }
  return ticket
    ? `Patient ${name}, ticket ${ticket}. Please proceed to ${room}.`
    : `Patient ${name}. Please proceed to ${room}.`;
}

module.exports = {
  buildPatientCalledPayload,
  buildTtsLine,
};
