'use strict';

const { countActiveDoctors } = require('./hmsDoctorStaff');

/** Executive portal summary cards (director / management hubs). */
async function getExecutivePortalStats(pool) {
  const today = new Date().toISOString().split('T')[0];
  const [[pat]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_patient WHERE COALESCE(status, 1) = 1`)
    .catch(() => [[{ c: 0 }]]);
  const [[appt]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_appointment WHERE status = 1 AND date = ?`, [today])
    .catch(() => [[{ c: 0 }]]);
  const [[ipd]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_admission WHERE discharged_at IS NULL OR discharged_at <= '0000-01-02'`
    )
    .catch(() => [[{ c: 0 }]]);
  const doctors = await countActiveDoctors(pool).catch(() => 0);
  return {
    patients: pat?.c || 0,
    appointments: appt?.c || 0,
    inpatients: ipd?.c || 0,
    doctors: doctors || 0,
  };
}

async function getHubStats(pool) {
  const today = new Date().toISOString().split('T')[0];
  const [[opd]] = await pool
    .query(
      `SELECT
         SUM(CASE WHEN visit_date=? AND queue_status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) AS opd_open,
         SUM(CASE WHEN visit_date=? AND queue_status='in_consultation' THEN 1 ELSE 0 END) AS in_consult
       FROM tbl_opd_visit`,
      [today, today]
    )
    .catch(() => [[{}]]);

  const [[appt]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_appointment WHERE status=1 AND date=?`,
      [today]
    )
    .catch(() => [[{ c: 0 }]]);

  const [[ipd]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_admission WHERE discharged_at IS NULL OR discharged_at <= '0000-01-02'`
    )
    .catch(() => [[{ c: 0 }]]);

  const [[lab]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_opd_order_item
       WHERE LOWER(TRIM(item_type)) = 'laboratory'
         AND status IN ('pending', 'in_progress')`
    )
    .catch(() => [[{ c: 0 }]]);

  let labOpen = lab?.c || 0;
  if (!labOpen) {
    const [[labReq]] = await pool
      .query(
        `SELECT COUNT(*) AS c FROM tbl_lab_request WHERE status IN ('submitted','accepted','in_progress')`
      )
      .catch(() => [[{ c: 0 }]]);
    labOpen = labReq?.c || 0;
  }

  const [[radOi]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_opd_order_item oi
       WHERE LOWER(TRIM(oi.item_type)) = 'radiology'
         AND oi.status IN ('pending', 'in_progress', 'paid')
         AND NOT EXISTS (
           SELECT 1 FROM tbl_radiology_result rr
            WHERE rr.opd_order_item_id = oi.id
              AND LOWER(TRIM(rr.status)) IN ('received', 'done', 'completed')
         )`
    )
    .catch(() => [[{ c: 0 }]]);

  let radOpen = radOi?.c || 0;
  if (!radOpen) {
    const [[radReq]] = await pool
      .query(
        `SELECT COUNT(*) AS c FROM tbl_radiology_request WHERE status IN ('submitted','accepted','in_progress')`
      )
      .catch(() => [[{ c: 0 }]]);
    radOpen = radReq?.c || 0;
  }
  if (!radOpen) {
    const [[radRes]] = await pool
      .query(
        `SELECT COUNT(*) AS c FROM tbl_radiology_result WHERE status IN ('pending', 'in_progress')`
      )
      .catch(() => [[{ c: 0 }]]);
    radOpen = radRes?.c || 0;
  }

  const [[rev]] = await pool
    .query(
      `SELECT COALESCE(SUM(amount),0) AS s FROM tbl_transaction WHERE status='completed' AND transaction_date=?`,
      [today]
    )
    .catch(() => [[{ s: 0 }]]);

  const [[pendingTickets]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_payment_ticket WHERE status='pending'`)
    .catch(() => [[{ c: 0 }]]);

  const [[pendingOrders]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_opd_order_item WHERE status='pending'`)
    .catch(() => [[{ c: 0 }]]);

  const [[pat]] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_patient WHERE COALESCE(status, 1) = 1`)
    .catch(() => [[{ c: 0 }]]);
  const doctors = await countActiveDoctors(pool).catch(() => 0);

  return {
    opd_open: opd?.opd_open || 0,
    in_consult: opd?.in_consult || 0,
    appointments_today: appt?.c || 0,
    ipd_active: ipd?.c || 0,
    lab_open: labOpen,
    rad_open: radOpen,
    revenue_today: rev?.s || 0,
    pending_tickets: pendingTickets?.c || 0,
    pending_orders: pendingOrders?.c || 0,
    patients: pat?.c || 0,
    appointments: appt?.c || 0,
    inpatients: ipd?.c || 0,
    doctors: doctors || 0,
  };
}

async function getPatientSmartCounts(pool, patientId) {
  const pid = parseInt(patientId, 10) || 0;
  if (pid < 1) return null;
  const q = async (sql, p) => {
    const [[r]] = await pool.query(sql, p).catch(() => [[{ c: 0 }]]);
    return r?.c || 0;
  };
  const [limsReq] = await pool
    .query(`SELECT COUNT(*) AS c FROM tbl_lab_request WHERE patient_id=?`, [pid])
    .catch(() => [[{ c: 0 }]]);
  return {
    appointments: await q('SELECT COUNT(*) AS c FROM tbl_appointment WHERE patient_id=?', [pid]),
    opd_visits: await q('SELECT COUNT(*) AS c FROM tbl_opd_visit WHERE patient_id=?', [pid]),
    consultations: await q('SELECT COUNT(*) AS c FROM tbl_consultation WHERE patient_id=?', [pid]),
    lab_results: await q('SELECT COUNT(*) AS c FROM tbl_lab_result WHERE patient_id=?', [pid]),
    lab_requests: limsReq[0]?.c || 0,
    rad_results: await q('SELECT COUNT(*) AS c FROM tbl_radiology_result WHERE patient_id=?', [pid]),
    prescriptions: await q('SELECT COUNT(*) AS c FROM tbl_prescription WHERE patient_id=?', [pid]),
    admissions: await q('SELECT COUNT(*) AS c FROM tbl_admission WHERE patient_id=?', [pid]),
    active_admissions: await q(
      `SELECT COUNT(*) AS c FROM tbl_admission WHERE patient_id=? AND (discharged_at IS NULL OR discharged_at <= '0000-01-02')`,
      [pid]
    ),
    transactions: await q('SELECT COUNT(*) AS c FROM tbl_transaction WHERE patient_id=?', [pid]),
    pending_orders: await q(
      `SELECT COUNT(*) AS c FROM tbl_opd_order_item WHERE patient_id=? AND status='pending'`,
      [pid]
    ),
  };
}

async function getVisitBillingPreview(pool, visitId) {
  const vid = parseInt(visitId, 10) || 0;
  if (vid < 1) return null;
  const [[visit]] = await pool.query(
    `SELECT v.*, p.first_name, p.last_name, p.phone,
            pt.id AS ticket_id, pt.ticket_code, pt.status AS ticket_status, pt.total_amount AS ticket_total
     FROM tbl_opd_visit v
     JOIN tbl_patient p ON p.id = v.patient_id
     LEFT JOIN tbl_payment_ticket pt ON pt.ticket_code = v.payment_code AND pt.patient_id = v.patient_id
     WHERE v.id = ? LIMIT 1`,
    [vid]
  );
  if (!visit) return null;

  const [pendingItems] = await pool
    .query(
      `SELECT oi.* FROM tbl_opd_order_item oi
       WHERE oi.patient_id = ? AND oi.status = 'pending'
         AND (oi.consultation_id IN (SELECT id FROM tbl_consultation WHERE opd_visit_id = ?)
              OR oi.consultation_id IS NULL)
       ORDER BY oi.id`,
      [visit.patient_id, vid]
    )
    .catch(() => [[]]);

  const [consultations] = await pool.query(
    `SELECT id, created_at, chief_complaint FROM tbl_consultation WHERE opd_visit_id = ? ORDER BY id DESC`,
    [vid]
  ).catch(() => [[]]);

  const pendingTotal = (pendingItems || []).reduce(
    (s, it) => s + (parseFloat(it.unit_price || 0) || 0) * (parseFloat(it.quantity || 1) || 1),
    0
  );

  return { visit, pendingItems: pendingItems || [], consultations: consultations || [], pendingTotal };
}

/** Stats + today's OPD list for /hms and portal hub landing pages. */
async function loadHubPageData(pool) {
  const stats = await getHubStats(pool);
  const today = new Date().toISOString().split('T')[0];
  const [todayVisits] = await pool
    .query(
      `SELECT v.id, v.ticket_number, v.queue_status, v.visit_date,
              p.first_name, p.last_name,
              doc.first_name AS doc_fn, doc.last_name AS doc_ln
       FROM tbl_opd_visit v
       JOIN tbl_patient p ON p.id = v.patient_id
       LEFT JOIN tbl_employee doc ON doc.id = v.assigned_doctor_id
       WHERE v.visit_date = ?
       ORDER BY v.queue_started_at DESC, v.id DESC
       LIMIT 12`,
      [today]
    )
    .catch(() => [[]]);
  return { stats, todayVisits: todayVisits || [] };
}

module.exports = {
  getHubStats,
  getExecutivePortalStats,
  getPatientSmartCounts,
  getVisitBillingPreview,
  loadHubPageData,
};
