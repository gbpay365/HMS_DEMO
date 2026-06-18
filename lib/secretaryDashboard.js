'use strict';

const { buildVisibleDashboardModel } = require('./secretaryDashboardCatalog');
const { countActiveDoctors } = require('./hmsDoctorStaff');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

async function resolveDirectorRole(pool) {
  const [[row]] = await pool
    .query(
      `SELECT CAST(role AS CHAR) AS role FROM tbl_role
        WHERE LOWER(title) LIKE '%director%'
          AND LOWER(title) NOT LIKE '%deputy%'
          AND LOWER(title) NOT LIKE '%assistant%'
        ORDER BY role LIMIT 1`
    )
    .catch(() => [[null]]);
  return row?.role ? String(row.role) : null;
}

async function fetchSecretaryDashboard(pool, opts = {}) {
  const today = new Date().toISOString().split('T')[0];
  const model = buildVisibleDashboardModel(opts.aclPack || {});

  const [[opd]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_opd_visit WHERE visit_date = ?`, [today])
    .catch(() => [[{ c: 0 }]]);

  const [[appt]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_appointment WHERE status = 1 AND date = ?`, [today])
    .catch(() => [[{ c: 0 }]]);

  const [[ipd]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_admission
        WHERE discharged_at IS NULL OR discharged_at <= '0000-01-02'`
    )
    .catch(() => [[{ c: 0 }]]);

  const doctors = await countActiveDoctors(pool).catch(() => 0);

  const [[staff]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_employee WHERE status = 1`)
    .catch(() => [[{ c: 0 }]]);

  const [scheduleRows] = await pool
    .query(
      `SELECT id, patient_name, doctor, department, date, time, notes
         FROM tbl_appointment
        WHERE status = 1 AND date = ?
        ORDER BY time ASC
        LIMIT 15`,
      [today]
    )
    .catch(() => [[]]);

  const directorRole = await resolveDirectorRole(pool);
  let directorAppointments = scheduleRows?.length || 0;
  if (directorRole) {
    const [[dirAppt]] = await pool
      .query(
        `SELECT COUNT(*) AS c FROM tbl_appointment
          WHERE status = 1 AND date = ?
            AND (department LIKE '%Admin%' OR doctor LIKE '%Director%' OR notes LIKE '%director%')`,
        [today]
      )
      .catch(() => [[{ c: 0 }]]);
    directorAppointments = n(dirAppt?.c) || directorAppointments;
  }

  const managementReports = [
    { label: 'Daily management report', url: '/portal/hub/director?report=daily', icon: 'fa-sun-o' },
    { label: 'Weekly report', url: '/portal/hub/director?report=weekly', icon: 'fa-calendar' },
    { label: 'Monthly P&L summary', url: '/portal/hub/director?report=monthly', icon: 'fa-line-chart' },
    { label: 'Director executive dashboard', url: '/portal/hub/director', icon: 'fa-dashboard' },
  ];

  const correspondenceQueue = [
    { id: 1, type: 'meeting_pack', title: 'Prepare weekly board briefing', status: 'pending', due: today },
    { id: 2, type: 'correspondence', title: 'Draft director memo — staff meeting', status: 'pending', due: today },
    { id: 3, type: 'travel', title: 'Confirm director field visit logistics', status: 'open', due: null },
  ];

  const visitorLog = [
    { id: 1, name: 'Ministry health delegate', purpose: 'Scheduled briefing', time: '09:00', status: 'expected' },
    { id: 2, name: 'Supplier — medical equipment', purpose: 'Delivery coordination', time: '11:30', status: 'expected' },
  ];

  const kpi = {
    directorAppointments: { value: directorAppointments, delta: null },
    meetingsPending: { value: correspondenceQueue.filter((c) => c.status === 'pending').length, delta: null },
    opdBriefing: { value: n(opd?.c), delta: null },
    reportsReady: { value: managementReports.length, delta: null },
    staffDirectory: { value: n(staff?.c), delta: null },
    pendingTasks: { value: correspondenceQueue.length, delta: null },
  };

  return {
    ok: true,
    date: today,
    kpi,
    panels: {
      directorSchedule: (scheduleRows || []).map((r) => ({
        id: r.id,
        title: r.patient_name || r.notes || 'Appointment',
        doctor: r.doctor,
        department: r.department,
        time: r.time,
      })),
      hospitalPulse: [
        { label: 'OPD visits today', value: n(opd?.c) },
        { label: 'Appointments today', value: n(appt?.c) },
        { label: 'Active inpatients', value: n(ipd?.c) },
        { label: 'Doctors on roster', value: n(doctors) },
      ],
      managementReports,
      correspondenceQueue,
      visitorLog,
    },
    aclModel: model,
  };
}

module.exports = { fetchSecretaryDashboard };
