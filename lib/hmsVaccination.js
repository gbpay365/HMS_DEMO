'use strict';

const { formatDisplayDate } = require('./hmsFormatDate');

function calculateAgeDays(dob, atDate) {
  if (!dob) return null;
  const birth = new Date(dob);
  const ref = atDate ? new Date(atDate) : new Date();
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null;
  return Math.floor((ref - birth) / (1000 * 60 * 60 * 24));
}

function calculateNextDoseDue(vaccine, doseNumber, administeredDate) {
  if (!vaccine || !administeredDate) return null;
  const dosesRequired = parseInt(vaccine.doses_required, 10) || 1;
  const doseNum = parseInt(doseNumber, 10) || 1;
  if (doseNum >= dosesRequired) return null;
  const interval = parseInt(vaccine.interval_days, 10);
  if (!interval || interval < 1) return null;
  const d = new Date(administeredDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + interval);
  return d.toISOString().slice(0, 10);
}

async function getDashboardStats(pool) {
  const [[todayRow]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM vaccination_records WHERE administered_date = CURDATE() AND status = 'given'`
  );
  const [[weekRow]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM vaccination_records
     WHERE administered_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND status = 'given'`
  );
  const [[dueRow]] = await pool.query(
    `SELECT COUNT(DISTINCT patient_id) AS cnt FROM vaccination_records
     WHERE next_dose_due IS NOT NULL AND next_dose_due <= CURDATE() AND status = 'given'`
  );
  const [[queueRow]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM vaccination_queue WHERE status IN ('waiting','in_progress')`
  );
  const [[patientsRow]] = await pool.query(
    `SELECT COUNT(DISTINCT patient_id) AS cnt FROM vaccination_records WHERE status = 'given'`
  );
  return {
    doses_today: todayRow?.cnt || 0,
    doses_week: weekRow?.cnt || 0,
    due_followups: dueRow?.cnt || 0,
    queue_waiting: queueRow?.cnt || 0,
    patients_immunized: patientsRow?.cnt || 0,
  };
}

async function loadPatientSummary(pool, patientId) {
  const pid = parseInt(patientId, 10);
  if (pid < 1) return null;

  const [patRows] = await pool.query(
    'SELECT id, first_name, last_name, phone, dob, gender, patient_code FROM tbl_patient WHERE id = ? LIMIT 1',
    [pid]
  );
  const patient = patRows[0];
  if (!patient) return null;

  const [records] = await pool.query(
    `SELECT vr.*, vv.code AS vaccine_code, vv.name AS vaccine_name, vv.doses_required,
            u.username AS administered_by_name
     FROM vaccination_records vr
     JOIN vaccination_vaccines vv ON vv.id = vr.vaccine_id
     LEFT JOIN tbl_user u ON u.id = vr.administered_by
     WHERE vr.patient_id = ?
     ORDER BY vr.administered_date DESC, vr.id DESC`,
    [pid]
  );

  const [vaccines] = await pool.query(
    `SELECT * FROM vaccination_vaccines WHERE active = 1 ORDER BY sort_order, name`
  );

  const ageDays = calculateAgeDays(patient.dob);
  const dueRecords = records.filter(
    (r) => r.next_dose_due && r.next_dose_due <= new Date().toISOString().slice(0, 10) && r.status === 'given'
  );

  return {
    patient,
    records,
    vaccines,
    age_days: ageDays,
    due_count: dueRecords.length,
    total_doses: records.filter((r) => r.status === 'given').length,
    chart_url: `/vaccination/chart/${pid}`,
  };
}

async function loadPatientChartSummary(pool, patientId) {
  const summary = await loadPatientSummary(pool, patientId);
  if (!summary) return null;
  const recent = summary.records.slice(0, 8).map((r) => ({
    id: r.id,
    vaccine_name: r.vaccine_name,
    dose_number: r.dose_number,
    administered_date: formatDisplayDate(r.administered_date),
    next_dose_due: r.next_dose_due ? formatDisplayDate(r.next_dose_due) : null,
    status: r.status,
  }));
  return {
    total_doses: summary.total_doses,
    due_count: summary.due_count,
    recent,
    chart_url: summary.chart_url,
    has_records: summary.records.length > 0,
  };
}

async function getDuePatients(pool, limit = 12) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);
  const [rows] = await pool.query(
    `SELECT DISTINCT p.id, p.first_name, p.last_name, p.patient_code, p.phone,
            vr.next_dose_due, vv.name AS vaccine_name, vr.dose_number
     FROM vaccination_records vr
     JOIN tbl_patient p ON p.id = vr.patient_id
     JOIN vaccination_vaccines vv ON vv.id = vr.vaccine_id
     WHERE vr.next_dose_due IS NOT NULL AND vr.next_dose_due <= CURDATE() AND vr.status = 'given'
     ORDER BY vr.next_dose_due ASC
     LIMIT ?`,
    [lim]
  );
  return rows;
}

module.exports = {
  calculateAgeDays,
  calculateNextDoseDue,
  getDashboardStats,
  loadPatientSummary,
  loadPatientChartSummary,
  getDuePatients,
};
