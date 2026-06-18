'use strict';

const {
  enrichOpdVisitsRoomContext,
  enrichOpdVisitsDoctorFromPaymentTicket,
  paymentTicketDoctorSubquery,
} = require('./opdVisitRoomQueue');

function visitBoardPublicName(v) {
  const f = String(v.first_name || '').trim();
  const l = String(v.last_name || '').trim();
  const ini = l ? l.charAt(0).toUpperCase() + '.' : '';
  const name = [f, ini].filter(Boolean).join(' ');
  return name || 'Patient';
}

function visitBoardFullName(v) {
  const f = String(v.first_name || '').trim();
  const l = String(v.last_name || '').trim();
  const name = [f, l].filter(Boolean).join(' ');
  return name || 'Patient';
}

function formatQueueDoctorParts(fn, ln) {
  const f = String(fn || '').trim();
  const l = String(ln || '').trim();
  if (!f && !l) return '—';
  return `Dr. ${f} ${l}`.trim();
}

function formatQueueSeeingDoctor(rawConcat) {
  const n = String(rawConcat || '').trim();
  if (!n) return '—';
  if (/^dr\.?\s/i.test(n)) return n;
  return `Dr. ${n}`;
}

function highlightIndexForList(list) {
  let idx = list.findIndex((v) => (v.queue_status || '') === 'in_consultation');
  if (idx < 0) {
    idx = list.findIndex((v) => (v.queue_status || '') === 'waiting_doctor');
  }
  if (idx < 0) {
    idx = list.findIndex((v) => ['triage', 'registered'].includes(v.queue_status || ''));
  }
  return idx;
}

function assignArrivalNumbers(list) {
  if (!list.length) return;
  const rankSorted = [...list].sort((a, b) => {
    const ta = new Date(a.queue_started_at || 0).getTime();
    const tb = new Date(b.queue_started_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  const arrivalNo = {};
  rankSorted.forEach((row, i) => {
    arrivalNo[row.id] = i + 1;
  });
  list.forEach((v) => {
    v.arrival_no = arrivalNo[v.id] || 0;
  });
}

function toWaitStartIso(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return raw.toISOString();
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  if (!/T|:\d{2}/.test(s)) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Best anchor for lobby wait minutes — skips date-only / midnight placeholders. */
function resolveWaitStartIso(v) {
  const candidates = [
    v.triage_done_at,
    v.vitals_first_at,
    v.vitals_last_at,
    v.queue_started_at,
  ];
  for (const raw of candidates) {
    const iso = toWaitStartIso(raw);
    if (!iso) continue;
    const mins = (Date.now() - new Date(iso).getTime()) / 60000;
    if (mins > 480) continue;
    return iso;
  }
  return null;
}

/**
 * @param {*} pool
 * @param {object} [opts]
 * @param {number} [opts.doctorId] filter assigned doctor
 * @param {number} [opts.roomId] filter effective consultation room
 * @param {string} [opts.visitDate] YYYY-MM-DD (default today)
 */
async function loadOpdCallQueueToday(pool, opts = {}) {
  const today = String(opts.visitDate || new Date().toISOString().split('T')[0]).slice(0, 10);
  const doctorId = parseInt(opts.doctorId, 10) || 0;
  const roomId = parseInt(opts.roomId, 10) || 0;

  const [rows] = await pool
    .query(
      `SELECT             v.id, v.facility_id, v.assigned_doctor_id, v.payment_code, v.ticket_number, v.queue_status, v.department, v.priority, v.queue_started_at,
              v.visit_date, v.consultation_room_id, v.consultation_started_at, v.patient_id,
              v.triage_done_at,
              (SELECT MIN(COALESCE(vs.recorded_at, vs.created_at)) FROM tbl_vital_sign vs WHERE vs.opd_visit_id = v.id) AS vitals_first_at,
              (SELECT MAX(COALESCE(vs.recorded_at, vs.created_at)) FROM tbl_vital_sign vs WHERE vs.opd_visit_id = v.id) AS vitals_last_at,
              p.first_name, p.last_name,
              COALESCE(doc.first_name, ${paymentTicketDoctorSubquery.fn}) AS doc_fn,
              COALESCE(doc.last_name, ${paymentTicketDoctorSubquery.ln}) AS doc_ln,
              doc.photo_path AS doc_photo_path,
              cr.name AS consultation_room_name, cr.code AS consultation_room_code,
              (SELECT TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,'')))
                 FROM tbl_consultation c2
                 LEFT JOIN tbl_employee e ON e.id = c2.created_by
                WHERE c2.opd_visit_id = v.id
                ORDER BY c2.id DESC
                LIMIT 1) AS seen_doctor_raw
         FROM tbl_opd_visit v
         JOIN tbl_patient p ON p.id = v.patient_id
         LEFT JOIN tbl_employee doc ON doc.id = v.assigned_doctor_id
         LEFT JOIN tbl_consultation_room cr ON cr.id = v.consultation_room_id
        WHERE v.visit_date = ?
          AND v.queue_status NOT IN ('completed','cancelled')
          AND COALESCE(v.is_emergency, 0) = 0
        ORDER BY v.priority = 'urgent' DESC, v.queue_started_at ASC
        LIMIT 48`,
      [today]
    );

  let list = Array.isArray(rows) ? rows : [];
  await enrichOpdVisitsDoctorFromPaymentTicket(pool, list);
  await enrichOpdVisitsRoomContext(pool, list);
  assignArrivalNumbers(list);

  if (doctorId) {
    list = list.filter((v) => {
      const adoc = parseInt(v.assigned_doctor_id, 10) || parseInt(v.ticket_doctor_id, 10) || 0;
      return adoc === doctorId;
    });
  }
  if (roomId) {
    list = list.filter((v) => (parseInt(v.display_room_id || v.consultation_room_id, 10) || 0) === roomId);
  }

  const highlightIdx = highlightIndexForList(list);
  return { list, highlightIdx, visitDate: today };
}

function mapVisitToBoardRow(v, i, highlightIdx, listLength) {
  const assigned = formatQueueDoctorParts(v.doc_fn, v.doc_ln);
  const seeing =
    (v.queue_status || '') === 'in_consultation'
      ? formatQueueSeeingDoctor(v.seen_doctor_raw)
      : formatQueueSeeingDoctor(v.seen_doctor_raw);
  const roomLabel =
    (v.display_room_name || v.display_room_code || v.consultation_room_name || v.consultation_room_code || '').trim() ||
    '—';
  return {
    arrival_no: v.arrival_no,
    room_queue_no: v.room_queue_no || 0,
    consultation_room: roomLabel,
    consultation_room_auto: !!v.display_room_auto,
    display_name: visitBoardPublicName(v),
    full_name: visitBoardFullName(v),
    first_name: String(v.first_name || '').trim(),
    last_name: String(v.last_name || '').trim(),
    ticket_number: v.ticket_number || '—',
    queue_status: (v.queue_status || '').replace(/_/g, ' '),
    queue_status_raw: v.queue_status || '',
    queue_started_at: v.queue_started_at || null,
    wait_start_iso: resolveWaitStartIso(v),
    visit_date: v.visit_date || null,
    consultation_started_at: v.consultation_started_at || null,
    department: v.department || '—',
    assigned_doctor: assigned,
    assigned_doctor_id: parseInt(v.assigned_doctor_id, 10) || 0,
    assigned_doctor_photo: String(v.doc_photo_path || '').trim(),
    seeing_doctor: seeing,
    is_next: i === highlightIdx && listLength > 0,
    visit_id: v.id,
  };
}

function mapQueueToBoardPayload(data) {
  const list = data.list || [];
  const boardRows = list.map((v, i) => mapVisitToBoardRow(v, i, data.highlightIdx, list.length));
  return { boardRows, highlightIndex: data.highlightIdx };
}

async function buildCallQueueApiPayload(pool, opts = {}) {
  const data = await loadOpdCallQueueToday(pool, opts);
  const visits = data.list.map((v, i) => {
    const row = mapVisitToBoardRow(v, i, data.highlightIdx, data.list.length);
    return {
      ...row,
      queue_status: v.queue_status || '',
    };
  });
  return {
    ok: true,
    visits,
    highlightIndex: data.highlightIdx,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  paymentTicketDoctorSubquery,
  visitBoardPublicName,
  visitBoardFullName,
  formatQueueDoctorParts,
  formatQueueSeeingDoctor,
  loadOpdCallQueueToday,
  mapVisitToBoardRow,
  mapQueueToBoardPayload,
  buildCallQueueApiPayload,
  highlightIndexForList,
};
