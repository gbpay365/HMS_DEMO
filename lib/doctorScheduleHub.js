'use strict';

const hmsRoster = require('./hmsRoster');
const hmsOnlineBooking = require('./hmsOnlineBooking');
const { loadOpdCallQueueToday } = require('./opdCallQueue');
const { ensureDoctorDutySchema } = require('./ensureDoctorDutySchema');
const doctorDutySwap = require('./doctorDutySwap');
const hmsDoctorStaff = require('./hmsDoctorStaff');

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isoToday() {
  return new Date().toISOString().split('T')[0];
}

function weekdayFromYmd(ymd) {
  const d = new Date(String(ymd).slice(0, 10) + 'T12:00:00');
  return d.getDay();
}

async function fetchDoctorDutyWeek(pool, facilityId, doctorId, anchorDate) {
  await ensureDoctorDutySchema(pool);
  const date = String(anchorDate || isoToday()).slice(0, 10);
  const weekStart = hmsRoster.weekStartMonday(date);
  const [rows] = await pool
    .query(
      `SELECT d.*, cr.name AS room_name, cr.code AS room_code
         FROM tbl_doctor_duty_schedule d
         LEFT JOIN tbl_consultation_room cr ON cr.id = d.consultation_room_id
        WHERE d.facility_id = ? AND d.employee_id = ? AND d.duty_date BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)
        ORDER BY d.duty_date`,
      [facilityId, doctorId, weekStart, weekStart]
    )
    .catch(() => [[]]);
  return Array.isArray(rows) ? rows : [];
}

async function fetchTodayAppointments(pool, doctorId, visitDate) {
  const did = parseInt(doctorId, 10) || 0;
  const day = String(visitDate || isoToday()).slice(0, 10);
  if (!did) return [];
  const [rows] = await pool
    .query(
      `SELECT a.id, a.date, a.time, a.status, a.message, a.patient_id, a.doctor_id,
              a.department, a.department_name, a.opd_visit_id, a.payment_code,
              p.first_name, p.last_name, p.phone
         FROM tbl_appointment a
         LEFT JOIN tbl_patient p ON p.id = a.patient_id
        WHERE a.doctor_id = ?
          AND DATE(a.date) = ?
          AND COALESCE(a.status, 1) NOT IN (0, 2)
        ORDER BY a.time ASC, a.id ASC`,
      [did, day]
    )
    .catch(() => [[]]);
  return rows || [];
}

async function fetchConsultationRooms(pool, facilityId) {
  const [rows] = await pool
    .query(
      `SELECT id, code, name FROM tbl_consultation_room
        WHERE facility_id = ? AND status = 1
        ORDER BY sort_order ASC, id ASC`,
      [facilityId]
    )
    .catch(() => [[]]);
  return rows || [];
}

/**
 * Warnings when duty is off but clinic hours or appointments exist.
 */
function buildScheduleWarnings({ dutyToday, availability, appointments }) {
  const warnings = [];
  const dutyType = String(dutyToday?.duty_type || 'off');
  const wd = weekdayFromYmd(isoToday());
  const hasHours = (availability || []).some((a) => parseInt(a.weekday, 10) === wd && parseInt(a.active, 10) !== 0);
  const hasAppts = (appointments || []).length > 0;

  if (dutyType === 'off' && hasHours) {
    warnings.push({ code: 'off_but_hours', level: 'warn' });
  }
  if (dutyType === 'off' && hasAppts) {
    warnings.push({ code: 'off_but_appointments', level: 'warn' });
  }
  if (dutyType === 'night' && hasAppts) {
    warnings.push({ code: 'on_call_with_appointments', level: 'info' });
  }
  return warnings;
}

/**
 * @param {*} pool
 * @param {object} opts
 * @param {number} opts.doctorId
 * @param {number} opts.facilityId
 * @param {string} [opts.date]
 */
async function loadDoctorScheduleHub(pool, opts) {
  const doctorId = parseInt(opts.doctorId, 10) || 0;
  const facilityId = parseInt(opts.facilityId, 10) || 1;
  const date = String(opts.date || isoToday()).slice(0, 10);
  if (doctorId < 1) throw new Error('Doctor is required.');

  const [[doctor]] = await pool
    .query('SELECT id, first_name, last_name, primary_department FROM tbl_employee WHERE id = ? LIMIT 1', [doctorId])
    .catch(() => [[null]]);

  const [dutyWeek, availability, appointments, queueData, rooms, swapRequests, activeDoctors] =
    await Promise.all([
    fetchDoctorDutyWeek(pool, facilityId, doctorId, date),
    hmsOnlineBooking.listDoctorAvailability(pool, doctorId),
    fetchTodayAppointments(pool, doctorId, date),
    loadOpdCallQueueToday(pool, { doctorId, visitDate: date }),
    fetchConsultationRooms(pool, facilityId),
    doctorDutySwap.listSwapRequestsForDoctor(pool, doctorId, { status: 'pending' }),
    hmsDoctorStaff.fetchActiveDoctors(pool, 'e.id, e.first_name, e.last_name'),
  ]);

  const dutyToday =
    dutyWeek.find((r) => String(r.duty_date || '').slice(0, 10) === date) || { duty_type: 'off' };

  const warnings = buildScheduleWarnings({ dutyToday, availability, appointments });

  const opdQueue = (queueData.list || []).map((v) => ({
    id: v.id,
    patient_id: v.patient_id,
    ticket_number: v.ticket_number,
    queue_status: v.queue_status,
    patient_name: [v.first_name, v.last_name].filter(Boolean).join(' '),
    room: v.display_room_name || v.display_room_code || v.consultation_room_name || null,
    arrival_no: v.arrival_no,
  }));

  return {
    doctor: doctor || { id: doctorId },
    date,
    weekday: weekdayFromYmd(date),
    weekdayLabels: WEEKDAY_LABELS,
    dutyWeek: dutyWeek.map((r) => ({
      duty_date: String(r.duty_date || '').slice(0, 10),
      duty_type: r.duty_type || 'off',
      start_time: r.start_time ? String(r.start_time).slice(0, 5) : null,
      end_time: r.end_time ? String(r.end_time).slice(0, 5) : null,
      department: r.department || null,
      room_id: r.consultation_room_id || null,
      room_label: r.room_name || r.room_code || null,
    })),
    dutyToday: {
      duty_type: dutyToday.duty_type || 'off',
      start_time: dutyToday.start_time ? String(dutyToday.start_time).slice(0, 5) : null,
      end_time: dutyToday.end_time ? String(dutyToday.end_time).slice(0, 5) : null,
      department: dutyToday.department || doctor?.primary_department || null,
      room_id: dutyToday.consultation_room_id || null,
      room_label: dutyToday.room_name || dutyToday.room_code || null,
    },
    availability: (availability || []).map((a) => ({
      weekday: parseInt(a.weekday, 10),
      label: WEEKDAY_LABELS[parseInt(a.weekday, 10)] || '',
      start_time: a.start_time ? String(a.start_time).slice(0, 5) : null,
      end_time: a.end_time ? String(a.end_time).slice(0, 5) : null,
      slot_minutes: parseInt(a.slot_minutes, 10) || 30,
      active: parseInt(a.active, 10) !== 0,
    })),
    appointments: appointments.map((a) => ({
      id: a.id,
      time: a.time ? String(a.time).slice(0, 5) : '',
      status: a.status,
      reason: a.message || '',
      patient_id: a.patient_id,
      patient_name: [a.first_name, a.last_name].filter(Boolean).join(' '),
      phone: a.phone || '',
      opd_visit_id: parseInt(a.opd_visit_id, 10) || null,
      can_check_in: !parseInt(a.opd_visit_id, 10) && parseInt(a.status, 10) !== 2,
    })),
    opdQueue,
    consultationRooms: rooms,
    swapRequests: swapRequests || [],
    swapPartners: (activeDoctors || [])
      .filter((d) => parseInt(d.id, 10) !== doctorId)
      .map((d) => ({
        id: d.id,
        name: `Dr. ${d.first_name || ''} ${d.last_name || ''}`.trim(),
      })),
    warnings,
    links: {
      dutyRoster: '/doctor-roster',
      appointments: '/appointments',
      opdQueue: '/opd-queue',
      slotsConfig: '/hms/appointments/slots-config',
      lobbyLauncher: '/portal/call-queue/launcher',
    },
  };
}

module.exports = {
  loadDoctorScheduleHub,
  fetchDoctorDutyWeek,
  fetchTodayAppointments,
  buildScheduleWarnings,
};
