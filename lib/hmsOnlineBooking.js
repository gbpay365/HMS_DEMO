'use strict';

const ensureOnlineBookingSchema = require('./ensureOnlineBookingSchema');
const appointmentPayment = require('./appointmentPayment');

const APPOINTMENT_TYPES = [
  { id: 'consultation', label: 'New consultation', icon: 'fa-stethoscope' },
  { id: 'follow_up', label: 'Follow-up visit', icon: 'fa-refresh' },
  { id: 'prescription', label: 'Prescription refill', icon: 'fa-medkit' },
  { id: 'results_review', label: 'Lab / imaging results', icon: 'fa-flask' },
  { id: 'vaccination', label: 'Vaccination', icon: 'fa-plus-square' },
  { id: 'other', label: 'Other', icon: 'fa-ellipsis-h' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseTimeToMinutes(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const ap = m12[3].toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }
  const first = s.split(/[–\-]/)[0].trim();
  return parseTimeToMinutes(first);
}

function minutesToLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${pad2(m)} ${ap}`;
}

function minutesTo24(mins) {
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

async function getSettings(pool) {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM tbl_booking_settings').catch(() => [[]]);
  const map = {};
  for (const r of rows || []) map[r.setting_key] = r.setting_value;
  return {
    slotStartHour: parseInt(map.slot_start_hour, 10) || 8,
    slotEndHour: parseInt(map.slot_end_hour, 10) || 17,
    slotInterval: parseInt(map.slot_interval_minutes, 10) || 30,
    maxDaysAhead: parseInt(map.max_days_ahead, 10) || 60,
    minHoursNotice: parseInt(map.min_hours_notice, 10) || 2,
    allowSameDay: map.allow_same_day !== '0',
  };
}

async function listDoctors(pool, { department, specialisation } = {}) {
  const hmsDoctorStaff = require('./hmsDoctorStaff');
  const {
    filterDoctorsForBookingDepartment,
    filterDoctorsByClinicalCriteria,
  } = require('./hmsDoctorClinicalFilter');
  const dept = String(department || '').trim();
  const spec = String(specialisation || '').trim();
  const doctors = await hmsDoctorStaff.fetchActiveDoctorsWithClinicalLinks(
    pool,
    `e.id, e.first_name, e.last_name,
           COALESCE(e.primary_department, '') AS primary_department,
           COALESCE(e.specialisation, '') AS specialisation,
           COALESCE(e.bio, '') AS bio`
  );
  if (dept && !spec) return filterDoctorsForBookingDepartment(doctors, dept);
  return filterDoctorsByClinicalCriteria(doctors, { department: dept, specialisation: spec });
}

async function getDoctorWeeklySlots(pool, doctorId, weekday) {
  const [[cnt]] = await pool
    .query('SELECT COUNT(*) AS c FROM tbl_doctor_availability WHERE doctor_id=?', [doctorId])
    .catch(() => [[{ c: 0 }]]);
  const hasCustom = Number(cnt?.c || 0) > 0;
  if (hasCustom) {
    const [rows] = await pool
      .query(
        `SELECT start_time, end_time, slot_minutes FROM tbl_doctor_availability
         WHERE doctor_id=? AND weekday=? AND active=1`,
        [doctorId, weekday]
      )
      .catch(() => [[]]);
    return rows || [];
  }
  const settings = await getSettings(pool);
  return [
    {
      start_time: `${pad2(settings.slotStartHour)}:00:00`,
      end_time: `${pad2(settings.slotEndHour)}:00:00`,
      slot_minutes: settings.slotInterval,
    },
  ];
}

async function getBookedMinutes(pool, { doctorId, doctorName, dateIso }) {
  const params = [dateIso, dateIso.replace(/-/g, '/')];
  let sql = `
    SELECT time, doctor_id, doctor, status, portal_state
    FROM tbl_appointment
    WHERE (
      date = ? OR date = ? OR DATE(STR_TO_DATE(date, '%d/%m/%Y')) = ?
    )
    AND (status IS NULL OR status NOT IN (0))
    AND (portal_state IS NULL OR portal_state != 'declined')`;
  params.push(dateIso);
  if (doctorId) {
    sql += ' AND (doctor_id = ? OR doctor LIKE ?)';
    params.push(doctorId, `%${doctorName || ''}%`);
  }
  const [rows] = await pool.query(sql, params).catch(() => [[]]);
  const taken = new Set();
  for (const r of rows || []) {
    const mins = parseTimeToMinutes(r.time);
    if (mins != null) taken.add(mins);
  }
  return taken;
}

async function getAvailableSlots(pool, opts) {
  const doctorId = parseInt(opts.doctorId, 10) || 0;
  const dateIso = String(opts.date || '').trim();
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { slots: [], message: 'Invalid date.' };
  }

  const settings = await getSettings(pool);
  const day = new Date(dateIso + 'T12:00:00');
  if (Number.isNaN(day.getTime())) return { slots: [], message: 'Invalid date.' };

  const todayIso = new Date().toISOString().slice(0, 10);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + settings.maxDaysAhead);
  if (dateIso > maxDate.toISOString().slice(0, 10)) {
    return { slots: [], message: `Book up to ${settings.maxDaysAhead} days ahead.` };
  }
  if (dateIso < todayIso) return { slots: [], message: 'Date is in the past.' };

  const weekday = day.getDay();
  if (!settings.allowSameDay && dateIso === todayIso) {
    return { slots: [], message: 'Same-day online booking is disabled.' };
  }

  let doctorName = '';
  if (doctorId) {
    const [[doc]] = await pool
      .query('SELECT first_name, last_name FROM tbl_employee WHERE id=? LIMIT 1', [doctorId])
      .catch(() => [[null]]);
    if (doc) doctorName = `${doc.first_name || ''} ${doc.last_name || ''}`.trim();
  }

  const windows = doctorId
    ? await getDoctorWeeklySlots(pool, doctorId, weekday)
    : [
        {
          start_time: `${pad2(settings.slotStartHour)}:00:00`,
          end_time: `${pad2(settings.slotEndHour)}:00:00`,
          slot_minutes: settings.slotInterval,
        },
      ];

  const taken = doctorId
    ? await getBookedMinutes(pool, { doctorId, doctorName, dateIso })
    : new Set();

  const now = new Date();
  const isToday = dateIso === todayIso;
  const minNotice = settings.minHoursNotice * 60;
  const slots = [];

  for (const w of windows) {
    const startM = parseTimeToMinutes(String(w.start_time).slice(0, 5));
    const endM = parseTimeToMinutes(String(w.end_time).slice(0, 5));
    const step = parseInt(w.slot_minutes, 10) || settings.slotInterval;
    if (startM == null || endM == null) continue;
    for (let m = startM; m + step <= endM; m += step) {
      if (isToday) {
        const slotDt = new Date(`${dateIso}T${minutesTo24(m)}:00`);
        if (slotDt.getTime() < now.getTime() + minNotice * 60 * 1000) continue;
      }
      if (taken.has(m)) continue;
      slots.push({
        value: minutesTo24(m),
        label: minutesToLabel(m),
        minutes: m,
      });
    }
  }

  return {
    slots,
    message: slots.length ? '' : 'No slots available — try another date or doctor.',
  };
}

async function createPortalBooking(pool, data, patientId, colHelpers) {
  const { hasCol, ensureAppointmentTelemedColumns } = colHelpers;
  await ensureOnlineBookingSchema(pool);
  await ensureAppointmentTelemedColumns(pool);
  await appointmentPayment.ensureAppointmentPaymentSchema(pool);

  const department = String(data.department || '').trim();
  const doctorId = parseInt(data.doctor_id, 10) || null;
  const date = String(data.date || '').trim();
  const time = String(data.time || data.slot || '').trim();
  const message = String(data.message || '').trim();
  const appointmentType = String(data.appointment_type || 'consultation').trim().slice(0, 40);
  let visitType = String(data.visit_type || 'in_person').trim().toLowerCase();
  if (visitType !== 'telemedicine' && visitType !== 'in_person') visitType = 'in_person';

  if (!date) throw new Error('Please select an appointment date.');
  if (!time) throw new Error('Please select an available time slot.');
  if (visitType === 'telemedicine' && !doctorId) {
    throw new Error('Telemedicine requires choosing a doctor.');
  }

  let linkedPaymentCode = null;
  let linkedTicketId = null;
  if (appointmentPayment.requiresPaymentCode(visitType)) {
    const pay = await appointmentPayment.validatePaymentForTeleAppointment(pool, {
      patientId,
      paymentCode: data.payment_code,
      facilityId: data.facility_id || 1,
    });
    if (!pay.ok) throw new Error(pay.error || 'Invalid payment code.');
    linkedPaymentCode = pay.code;
    linkedTicketId = pay.ticketId;
  }

  if (doctorId) {
    const avail = await getAvailableSlots(pool, { doctorId, date });
    const ok = (avail.slots || []).some((s) => s.value === time);
    if (!ok) throw new Error('That time slot is no longer available. Please pick another.');
  }

  const [[pat]] = await pool
    .query('SELECT first_name, last_name FROM tbl_patient WHERE id=? LIMIT 1', [patientId])
    .catch(() => [[null]]);
  const patient_name = pat ? `${pat.first_name || ''} ${pat.last_name || ''}`.trim() : 'Patient';

  let doctorName = null;
  if (doctorId) {
    const [[doc]] = await pool
      .query('SELECT first_name, last_name FROM tbl_employee WHERE id=? LIMIT 1', [doctorId])
      .catch(() => [[null]]);
    if (doc) doctorName = `Dr. ${doc.first_name || ''} ${doc.last_name || ''}`.trim();
  }

  const typeLabel =
    APPOINTMENT_TYPES.find((t) => t.id === appointmentType)?.label || appointmentType;
  const fullMessage = [
    message,
    appointmentType ? `[Type: ${typeLabel}]` : '',
    visitType === 'telemedicine' ? '[Online: Telemedicine]' : '[Online: In-person]',
  ]
    .filter(Boolean)
    .join('\n');

  const [[maxRow]] = await pool.query('SELECT MAX(id) AS max_id FROM tbl_appointment').catch(() => [[{ max_id: 0 }]]);
  const nextId = ((maxRow && maxRow.max_id) || 0) + 1;
  const apptCode = `APT-${nextId}`;

  const fields = [];
  const vals = [];
  const params = [];
  const add = (col, val, raw = false) => {
    if (!hasCol(col)) return;
    fields.push(col);
    if (raw) vals.push(val);
    else {
      vals.push('?');
      params.push(val);
    }
  };

  add('appointment_id', apptCode);
  add('patient_id', patientId);
  add('patient_name', patient_name);
  add('department', department || null);
  add('department_name', department || null);
  add('doctor', doctorName);
  add('doctor_id', doctorId);
  add('date', date);
  add('time', time);
  add('slot_start', time);
  add('message', fullMessage);
  add('appointment_type', appointmentType);
  add('duration_minutes', 30);
  add('status', 3);
  add('visit_type', visitType);
  add('portal_state', 'pending');
  add('created_at', 'NOW()', true);
  if (linkedPaymentCode && hasCol('payment_code')) {
    add('payment_code', linkedPaymentCode);
  }
  if (linkedTicketId && hasCol('payment_ticket_id')) {
    add('payment_ticket_id', linkedTicketId);
  }

  let insertedId = null;
  const sql = `INSERT INTO tbl_appointment (${fields.join(',')}) VALUES (${vals.join(',')})`;
  const [r] = await pool.query(sql, params);
  insertedId = r && r.insertId ? r.insertId : null;

  if (insertedId) {
    const sets = ['status = 3'];
    const args = [];
    if (hasCol('portal_state')) sets.push("portal_state = 'pending'");
    if (hasCol('visit_type')) {
      sets.push('visit_type = ?');
      args.push(visitType);
    }
    if (hasCol('doctor_id')) {
      sets.push('doctor_id = COALESCE(doctor_id, ?)');
      args.push(doctorId);
    }
    args.push(insertedId);
    await pool.query(`UPDATE tbl_appointment SET ${sets.join(', ')} WHERE id = ?`, args).catch(() => {});
  }

  if (visitType === 'telemedicine' && insertedId && hasCol('meeting_room')) {
    const crypto = require('crypto');
    const room = `tssf-hms-${apptCode.toLowerCase()}-${crypto.randomBytes(6).toString('hex')}`;
    await pool.query('UPDATE tbl_appointment SET meeting_room=? WHERE id=?', [room, insertedId]).catch(() => {});
  }

  if (appointmentType === 'vaccination' && patientId) {
    try {
      await require('./ensureVaccinationSchema')(pool);
      await pool.query(
        `INSERT INTO vaccination_queue (patient_id, appointment_date, appointment_type, status, notes)
         VALUES (?, ?, 'vaccination', 'waiting', ?)`,
        [patientId, date || null, `Online booking ${apptCode}`]
      );
    } catch (e) {
      console.warn('[vaccination] queue from online booking:', e.message);
    }
  }

  return { id: insertedId, appointmentId: apptCode, visitType, paymentCode: linkedPaymentCode };
}

const WEEKDAYS = [
  { id: 1, label: 'Monday' },
  { id: 2, label: 'Tuesday' },
  { id: 3, label: 'Wednesday' },
  { id: 4, label: 'Thursday' },
  { id: 5, label: 'Friday' },
  { id: 6, label: 'Saturday' },
  { id: 0, label: 'Sunday' },
];

function normalizeDateIso(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`;
  }
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch (_) {}
  return null;
}

function appointmentDateTime(appt) {
  const dateIso = normalizeDateIso(appt.date);
  const mins = parseTimeToMinutes(appt.slot_start || appt.time);
  if (!dateIso) return null;
  const t = mins != null ? minutesTo24(mins) : '09:00';
  return new Date(`${dateIso}T${t}:00`);
}

function portalState(appt) {
  if (appt.portal_state) return String(appt.portal_state).toLowerCase();
  const n = Number(appt.status);
  if (n === 1) return 'confirmed';
  if (n === 0) return 'declined';
  if (n === 3) return 'pending';
  return 'pending';
}

function patientCanModify(appt) {
  const ps = portalState(appt);
  if (!['pending', 'confirmed'].includes(ps)) {
    return { ok: false, reason: 'This appointment can no longer be changed online.' };
  }
  const when = appointmentDateTime(appt);
  if (when && when.getTime() < Date.now()) {
    return { ok: false, reason: 'Past appointments cannot be changed online.' };
  }
  return { ok: true };
}

async function getPatientAppointment(pool, apptId, patientId) {
  const id = parseInt(apptId, 10) || 0;
  const pid = parseInt(patientId, 10) || 0;
  if (!id || !pid) return null;
  const [[row]] = await pool
    .query('SELECT * FROM tbl_appointment WHERE id=? AND patient_id=? LIMIT 1', [id, pid])
    .catch(() => [[null]]);
  return row || null;
}

async function cancelByPatient(pool, apptId, patientId, reason, colHelpers) {
  const appt = await getPatientAppointment(pool, apptId, patientId);
  if (!appt) throw new Error('Appointment not found.');
  const check = patientCanModify(appt);
  if (!check.ok) throw new Error(check.reason);

  if (appointmentPayment.requiresPaymentCode(appt.visit_type) && appt.payment_code) {
    const payCheck = await appointmentPayment.assertPaymentStillValidForModify(pool, appt);
    if (!payCheck.ok) throw new Error(payCheck.error || 'Payment code is no longer valid for changes.');
  }

  const { hasCol } = colHelpers;
  const sets = ['status = 0'];
  const args = [];
  if (hasCol('portal_state')) sets.push("portal_state = 'cancelled'");
  if (hasCol('declined_at')) sets.push('declined_at = NOW()');
  if (hasCol('confirmed_at')) sets.push('confirmed_at = NULL');
  if (hasCol('cancel_reason')) {
    sets.push('cancel_reason = ?');
    args.push(String(reason || 'Cancelled by patient via portal').trim().slice(0, 240));
  }
  args.push(appt.id);
  await pool.query(`UPDATE tbl_appointment SET ${sets.join(', ')} WHERE id = ?`, args);
  return { id: appt.id, appointmentId: appt.appointment_id };
}

async function rescheduleByPatient(pool, apptId, patientId, data, colHelpers) {
  const appt = await getPatientAppointment(pool, apptId, patientId);
  if (!appt) throw new Error('Appointment not found.');
  const check = patientCanModify(appt);
  if (!check.ok) throw new Error(check.reason);

  if (appointmentPayment.requiresPaymentCode(appt.visit_type) && appt.payment_code) {
    const payCheck = await appointmentPayment.assertPaymentStillValidForModify(pool, appt);
    if (!payCheck.ok) throw new Error(payCheck.error || 'Payment code is no longer valid for rescheduling.');
  }

  const date = String(data.date || '').trim();
  const time = String(data.time || data.slot || '').trim();
  if (!date || !time) throw new Error('Date and time slot are required.');

  const doctorId = parseInt(data.doctor_id, 10) || parseInt(appt.doctor_id, 10) || null;
  if (doctorId) {
    const avail = await getAvailableSlots(pool, { doctorId, date });
    const ok = (avail.slots || []).some((s) => s.value === time);
    if (!ok) throw new Error('That time slot is no longer available.');
  }

  const { hasCol } = colHelpers;
  const sets = ['date = ?', 'time = ?'];
  const args = [date, time];
  if (hasCol('slot_start')) {
    sets.push('slot_start = ?');
    args.push(time);
  }
  sets.push('status = 3');
  if (hasCol('portal_state')) sets.push("portal_state = 'pending'");
  if (hasCol('confirmed_at')) sets.push('confirmed_at = NULL');
  if (hasCol('message') && data.message) {
    sets.push('message = ?');
    args.push(String(data.message).trim().slice(0, 4000));
  }
  args.push(appt.id);
  await pool.query(`UPDATE tbl_appointment SET ${sets.join(', ')} WHERE id = ?`, args);
  return { id: appt.id, appointmentId: appt.appointment_id };
}

async function saveSettings(pool, body) {
  const map = {
    slot_start_hour: String(body.slot_start_hour || '8'),
    slot_end_hour: String(body.slot_end_hour || '17'),
    slot_interval_minutes: String(body.slot_interval_minutes || '30'),
    max_days_ahead: String(body.max_days_ahead || '60'),
    min_hours_notice: String(body.min_hours_notice || '2'),
    allow_same_day: body.allow_same_day === '0' || body.allow_same_day === 0 ? '0' : '1',
  };
  for (const [k, v] of Object.entries(map)) {
    await pool.query(
      `INSERT INTO tbl_booking_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [k, v]
    );
  }
  return getSettings(pool);
}

async function listDoctorAvailability(pool, doctorId) {
  const did = parseInt(doctorId, 10) || 0;
  if (!did) return [];
  const [rows] = await pool
    .query(
      `SELECT id, doctor_id, weekday, start_time, end_time, slot_minutes, active
       FROM tbl_doctor_availability WHERE doctor_id=? ORDER BY weekday, start_time`,
      [did]
    )
    .catch(() => [[]]);
  return rows;
}

async function saveDoctorAvailability(pool, doctorId, body) {
  const did = parseInt(doctorId, 10) || 0;
  if (!did) throw new Error('Doctor is required.');

  const weekdays = [].concat(body.weekday || []).map((w) => parseInt(w, 10));
  const starts = [].concat(body.start_time || []);
  const ends = [].concat(body.end_time || []);
  const slots = [].concat(body.slot_minutes || []);
  const activeDays = new Set([].concat(body.active || []).map(String));

  await pool.query('DELETE FROM tbl_doctor_availability WHERE doctor_id=?', [did]);

  for (let i = 0; i < weekdays.length; i++) {
    const wd = weekdays[i];
    if (wd < 0 || wd > 6) continue;
    if (!activeDays.has(String(wd))) continue;
    const st = String(starts[i] || '08:00').slice(0, 8);
    const en = String(ends[i] || '17:00').slice(0, 8);
    const sm = parseInt(slots[i], 10) || 30;
    await pool.query(
      `INSERT INTO tbl_doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes, active)
       VALUES (?,?,?,?,?,1)`,
      [did, wd, st, en, sm]
    );
  }
  return listDoctorAvailability(pool, did);
}

function buildWeeklyTemplate(settings) {
  const template = {};
  for (const w of WEEKDAYS) {
    if (w.id === 0) continue;
    template[w.id] = {
      weekday: w.id,
      label: w.label,
      active: w.id >= 1 && w.id <= 6,
      start_time: `${pad2(settings.slotStartHour)}:00`,
      end_time: `${pad2(settings.slotEndHour)}:00`,
      slot_minutes: settings.slotInterval,
    };
  }
  return template;
}

async function getDoctorScheduleForm(pool, doctorId) {
  const settings = await getSettings(pool);
  const template = buildWeeklyTemplate(settings);
  const rows = await listDoctorAvailability(pool, doctorId);
  for (const r of rows) {
    if (!r.active) continue;
    const wd = parseInt(r.weekday, 10);
    template[wd] = {
      weekday: wd,
      label: (WEEKDAYS.find((x) => x.id === wd) || {}).label || `Day ${wd}`,
      active: true,
      start_time: String(r.start_time).slice(0, 5),
      end_time: String(r.end_time).slice(0, 5),
      slot_minutes: parseInt(r.slot_minutes, 10) || settings.slotInterval,
    };
  }
  return Object.values(template).sort((a, b) => {
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.indexOf(a.weekday) - order.indexOf(b.weekday);
  });
}

module.exports = {
  ensureOnlineBookingSchema,
  APPOINTMENT_TYPES,
  WEEKDAYS,
  getSettings,
  saveSettings,
  listDoctors,
  listDoctorAvailability,
  saveDoctorAvailability,
  getDoctorScheduleForm,
  getAvailableSlots,
  createPortalBooking,
  getPatientAppointment,
  cancelByPatient,
  rescheduleByPatient,
  patientCanModify,
  portalState,
  parseTimeToMinutes,
};
