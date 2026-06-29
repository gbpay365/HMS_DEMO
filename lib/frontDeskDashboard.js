'use strict';

const { buildVisibleDashboardModel } = require('./frontDeskDashboardCatalog');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

async function fetchFrontDeskDashboard(pool, opts = {}) {
  const today = new Date().toISOString().split('T')[0];
  const model = buildVisibleDashboardModel(opts.aclPack || {});

  const [[reg]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_patient
        WHERE status = 1 AND DATE(created_at) = ?`,
      [today]
    )
    .catch(() => [[{ c: 0 }]]);

  const [[vis]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_opd_visit WHERE visit_date = ?`, [today])
    .catch(() => [[{ c: 0 }]]);

  const [[appt]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_appointment WHERE status = 1 AND date = ?`, [today])
    .catch(() => [[{ c: 0 }]]);

  const [[waiting]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_opd_visit
        WHERE visit_date = ? AND queue_status IN ('registered','triage','waiting_doctor','orders_pending')`,
      [today]
    )
    .catch(() => [[{ c: 0 }]]);

  const [queueRows] = await pool
    .query(
      `SELECT v.id, v.ticket_number, v.queue_status, v.department, v.priority,
              p.first_name, p.last_name, v.payment_code, v.queue_started_at
         FROM tbl_opd_visit v
         JOIN tbl_patient p ON p.id = v.patient_id
        WHERE v.visit_date = ?
          AND v.queue_status NOT IN ('completed','cancelled')
        ORDER BY v.queue_started_at ASC
        LIMIT 12`,
      [today]
    )
    .catch(() => [[]]);

  const [apptRows] = await pool
    .query(
      `SELECT id, patient_name, doctor, department, date, time, status
         FROM tbl_appointment
        WHERE status = 1 AND date = ?
        ORDER BY time ASC
        LIMIT 12`,
      [today]
    )
    .catch(() => [[]]);

  let vitalsPending = 0;
  const [vitalsRows] = await pool
    .query(
      `SELECT v.id, p.first_name, p.last_name, v.queue_status
         FROM tbl_opd_visit v
         JOIN tbl_patient p ON p.id = v.patient_id
        WHERE v.visit_date = ?
          AND v.queue_status IN ('registered','triage')
        ORDER BY v.queue_started_at ASC
        LIMIT 8`,
      [today]
    )
    .catch(() => [[]]);
  vitalsPending = vitalsRows?.length || 0;

  const [paymentRows] = await pool
    .query(
      `SELECT v.id, v.payment_code, v.ticket_number, p.first_name, p.last_name, v.department
         FROM tbl_opd_visit v
         JOIN tbl_patient p ON p.id = v.patient_id
        WHERE v.visit_date = ?
          AND v.payment_code IS NOT NULL AND TRIM(v.payment_code) <> ''
          AND v.queue_status IN ('registered','triage','waiting_doctor')
        ORDER BY v.queue_started_at ASC
        LIMIT 8`,
      [today]
    )
    .catch(() => [[]]);

  const quickActions = [
    { code: 'register', label: 'Register new patient', url: '/patients', icon: 'fa-user-plus', color: '#0c8b8b', perm: 'front_desk.patient.register|patient.write' },
    { code: 'visit', label: 'Create new visit', url: '/opd-queue', icon: 'fa-plus-circle', color: '#1a6bd8', perm: 'front_desk.visit.create|opd.read' },
    { code: 'vitals', label: 'Enter vitals', url: '/nursing/vitals', icon: 'fa-heartbeat', color: '#ec4899', perm: 'front_desk.vitals.record|nursing.read' },
    { code: 'payment', label: 'Validate payment code', url: '/front-desk/validate-payment-code', icon: 'fa-check-circle', color: '#10b981', perm: 'front_desk.payment_code.validate|opd.read|patient.read' },
    { code: 'appt', label: 'Book appointment', url: '/appointments', icon: 'fa-calendar-plus-o', color: '#f59e0b', perm: 'front_desk.appointment.book|scheduling.write' },
  ];

  const kpi = {
    registrationsToday: { value: n(reg?.c), delta: null },
    visitsToday: { value: n(vis?.c), delta: null },
    vitalsPending: { value: vitalsPending, delta: null },
    paymentValidations: { value: paymentRows?.length || 0, delta: null },
    appointmentsToday: { value: n(appt?.c), delta: null },
    waitingPatients: { value: n(waiting?.c), delta: null },
  };

  return {
    ok: true,
    date: today,
    kpi,
    panels: {
      quickActions,
      opdQueue: (queueRows || []).map((r) => ({
        id: r.id,
        ticket: r.ticket_number,
        patient: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        status: r.queue_status,
        department: r.department,
        paymentCode: r.payment_code,
      })),
      appointmentsList: (apptRows || []).map((r) => ({
        id: r.id,
        patient: r.patient_name,
        doctor: r.doctor,
        department: r.department,
        time: r.time,
      })),
      paymentCodes: (paymentRows || []).map((r) => ({
        id: r.id,
        code: r.payment_code,
        ticket: r.ticket_number,
        patient: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        department: r.department,
        validateUrl: `/front-desk/validate-payment-code?code=${encodeURIComponent(r.payment_code || '')}`,
      })),
    },
    aclModel: model,
  };
}

module.exports = { fetchFrontDeskDashboard };
