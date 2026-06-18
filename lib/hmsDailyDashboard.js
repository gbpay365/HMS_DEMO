'use strict';

/**
 * HMS Daily Dashboard — MySQL data layer + route helpers.
 * Mirrors the hmsDashboard.js route map using tbl_* schema (not PostgreSQL).
 *
 * Route map (mount via mountDailyDashboardRoutes):
 *   GET /portal/api/daily/:date/all
 *   GET /portal/api/daily/:date/patient-flow/summary|hourly|er-wait
 *   GET /portal/api/daily/:date/beds/summary|by-ward|map
 *   GET /portal/api/daily/:date/staff/summary|by-department|absences
 *   GET /portal/api/daily/:date/revenue/summary|by-category|pending
 *   GET /portal/api/daily/:date/lab/summary|overdue|critical
 *   GET /portal/api/daily/pharmacy/summary|stock-alerts|expiry-alerts|controlled
 *
 * :date accepts "today" or "YYYY-MM-DD".
 */

const { fetchDirectorCashierRevenue } = require('./directorCashierRevenue');
const { lineItemCategory, lineItemAmount } = require('./billingLineCategory');
const { buildVisibleDashboardModel } = require('./directorDashboardCatalog');

const TAT_THRESHOLD_HOURS = 4;
const LOW_STOCK_DAYS_AHEAD = 30;
const NOT_DISCHARGED = `(a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')`;

const REVENUE_CATEGORY_LABELS = {
  consultation: 'OPD consultations',
  laboratory: 'Laboratory tests',
  radiology: 'Radiology & imaging',
  pharmacy: 'Pharmacy sales',
  maternity: 'Maternity services',
  surgery: 'Surgical procedures',
  nursing: 'Nursing services',
  material: 'Materials',
  service: 'Other services',
  other: 'Other charges',
};

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtXaf(v) {
  return Math.round(n(v));
}

function patientLabel(row) {
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
  return name || `Patient #${row.patient_id || '—'}`;
}

function hoursAgoLabel(fromDate) {
  if (!fromDate) return '—';
  const ms = Date.now() - new Date(fromDate).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

async function q1(pool, sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows?.[0] || null;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn('[hms-daily]', err.message);
    return null;
  }
}

async function qAll(pool, sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows || [];
  } catch (_) {
    return [];
  }
}

/** Parse "today" or YYYY-MM-DD → { date, dateStr, yesterday } */
function parseDailyDate(raw) {
  const input = String(raw || 'today').trim().toLowerCase();
  let d;
  if (input === 'today') {
    d = new Date();
  } else {
    d = new Date(input + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return null;
  }
  const dateStr = d.toISOString().slice(0, 10);
  const yesterday = new Date(d);
  yesterday.setDate(yesterday.getDate() - 1);
  return { date: d, dateStr, yesterday: yesterday.toISOString().slice(0, 10) };
}

function hasAnyCode(codes, list) {
  return list.some((c) => codes.has(c));
}

// ─── Patient flow ─────────────────────────────────────────────────────────────

async function fetchPatientFlowSummary(pool, dateStr, yesterday) {
  const [today, prior] = await Promise.all([
    q1(pool, `
      SELECT
        (SELECT COUNT(*) FROM tbl_admission WHERE DATE(admitted_at) = ?) AS admitted,
        (SELECT COUNT(*) FROM tbl_admission WHERE DATE(discharged_at) = ? AND discharged_at > '0000-01-02') AS discharged,
        (SELECT COUNT(*) FROM tbl_admission a WHERE ${NOT_DISCHARGED}) AS active_inpatients,
        (SELECT COUNT(*) FROM tbl_opd_visit WHERE visit_date = ? AND COALESCE(is_emergency,0)=0) AS opd_visits,
        (SELECT COUNT(*) FROM tbl_opd_visit WHERE visit_date = ? AND (COALESCE(is_emergency,0)=1 OR department LIKE '%Emergency%' OR department LIKE '%A&E%')) AS er_visits,
        (SELECT COUNT(*) FROM antenatal_visits WHERE DATE(visit_date) = ?) AS anc_visits,
        (SELECT COUNT(*) FROM delivery_records WHERE DATE(delivery_date_time) = ?) AS deliveries,
        (SELECT COUNT(*) FROM newborn_records WHERE DATE(COALESCE(time_of_birth, created_at)) = ?) AS newborns
    `, [dateStr, dateStr, dateStr, dateStr, dateStr, dateStr, dateStr]),
    q1(pool, `
      SELECT
        (SELECT COUNT(*) FROM tbl_admission WHERE DATE(admitted_at) = ?) AS admitted,
        (SELECT COUNT(*) FROM tbl_admission WHERE DATE(discharged_at) = ? AND discharged_at > '0000-01-02') AS discharged,
        (SELECT COUNT(*) FROM tbl_opd_visit WHERE visit_date = ? AND COALESCE(is_emergency,0)=0) AS opd_visits,
        (SELECT COUNT(*) FROM tbl_opd_visit WHERE visit_date = ? AND (COALESCE(is_emergency,0)=1 OR department LIKE '%Emergency%')) AS er_visits,
        (SELECT COUNT(*) FROM antenatal_visits WHERE DATE(visit_date) = ?) AS anc_visits,
        (SELECT COUNT(*) FROM delivery_records WHERE DATE(delivery_date_time) = ?) AS deliveries,
        (SELECT COUNT(*) FROM newborn_records WHERE DATE(COALESCE(time_of_birth, created_at)) = ?) AS newborns
    `, [yesterday, yesterday, yesterday, yesterday, yesterday, yesterday, yesterday]),
  ]);
  return {
    admitted: n(today?.admitted),
    discharged: n(today?.discharged),
    active_inpatients: n(today?.active_inpatients),
    opd_visits: n(today?.opd_visits),
    er_visits: n(today?.er_visits),
    anc_visits: n(today?.anc_visits),
    deliveries: n(today?.deliveries),
    newborns: n(today?.newborns),
    admitted_delta: n(today?.admitted) - n(prior?.admitted),
    discharged_delta: n(today?.discharged) - n(prior?.discharged),
    opd_delta: n(today?.opd_visits) - n(prior?.opd_visits),
    er_delta: n(today?.er_visits) - n(prior?.er_visits),
    anc_delta: n(today?.anc_visits) - n(prior?.anc_visits),
    deliveries_delta: n(today?.deliveries) - n(prior?.deliveries),
    newborns_delta: n(today?.newborns) - n(prior?.newborns),
  };
}

async function fetchPatientFlowHourly(pool, dateStr) {
  const [admits, discharges, er] = await Promise.all([
    qAll(pool, `SELECT HOUR(admitted_at) AS h, COUNT(*) AS c FROM tbl_admission WHERE DATE(admitted_at)=? GROUP BY HOUR(admitted_at)`, [dateStr]),
    qAll(pool, `SELECT HOUR(discharged_at) AS h, COUNT(*) AS c FROM tbl_admission WHERE DATE(discharged_at)=? AND discharged_at>'0000-01-02' GROUP BY HOUR(discharged_at)`, [dateStr]),
    qAll(pool, `SELECT HOUR(COALESCE(queue_started_at, CONCAT(visit_date,' 08:00:00'))) AS h, COUNT(*) AS c FROM tbl_opd_visit WHERE visit_date=? AND (COALESCE(is_emergency,0)=1 OR department LIKE '%Emergency%' OR department LIKE '%A&E%') GROUP BY 1`, [dateStr]),
  ]);
  const admitMap = new Map(admits.map((r) => [n(r.h), n(r.c)]));
  const disMap = new Map(discharges.map((r) => [n(r.h), n(r.c)]));
  const erMap = new Map(er.map((r) => [n(r.h), n(r.c)]));
  const out = [];
  for (let h = 0; h < 24; h += 1) {
    out.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      admitted: admitMap.get(h) || 0,
      discharged: disMap.get(h) || 0,
      emergency: erMap.get(h) || 0,
    });
  }
  return out;
}

async function fetchErWait(pool, dateStr, yesterday) {
  const sql = `
    SELECT AVG(TIMESTAMPDIFF(MINUTE, queue_started_at,
           COALESCE(NULLIF(completed_at,'0000-00-00 00:00:00'), NOW()))) AS avg_wait,
           COUNT(*) AS c
      FROM tbl_opd_visit
     WHERE visit_date = ?
       AND (department LIKE '%Emergency%' OR department LIKE '%A&E%' OR department LIKE '%AE%' OR COALESCE(is_emergency,0)=1)
       AND queue_started_at IS NOT NULL`;
  const [today, prior] = await Promise.all([
    q1(pool, sql, [dateStr]),
    q1(pool, sql, [yesterday]),
  ]);
  const avgToday = round1(today?.avg_wait);
  const avgYesterday = round1(prior?.avg_wait);
  return {
    avg_wait_today: avgToday,
    avg_wait_yesterday: avgYesterday,
    wait_delta_minutes: round1(avgToday - avgYesterday),
    visit_count_today: n(today?.c),
  };
}

function round1(v) {
  return Math.round(n(v) * 10) / 10;
}

// ─── Beds ─────────────────────────────────────────────────────────────────────

async function fetchBedsSummary(pool) {
  const row = await q1(pool, `
    SELECT COUNT(*) AS total_beds,
      SUM(CASE WHEN patient_id IS NOT NULL AND patient_id > 0 THEN 1 ELSE 0 END) AS occupied,
      SUM(CASE WHEN LOWER(TRIM(status))='available' AND (patient_id IS NULL OR patient_id=0) THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN LOWER(TRIM(status)) IN ('reserved','blocked') THEN 1 ELSE 0 END) AS reserved,
      SUM(CASE WHEN LOWER(TRIM(status)) IN ('maintenance','housekeeping','cleaning') THEN 1 ELSE 0 END) AS maintenance
    FROM tbl_bed`);
  const total = n(row?.total_beds);
  const occupied = n(row?.occupied);
  return {
    total_beds: total,
    occupied,
    available: n(row?.available),
    reserved: n(row?.reserved),
    maintenance: n(row?.maintenance),
    occupancy_pct: total ? round1((occupied / total) * 100) : 0,
  };
}

async function fetchBedsByWard(pool) {
  const rows = await qAll(pool, `
    SELECT COALESCE(NULLIF(TRIM(ward_name),''),'Unassigned') AS ward_name,
      COUNT(*) AS total,
      SUM(CASE WHEN patient_id IS NOT NULL AND patient_id > 0 THEN 1 ELSE 0 END) AS occupied,
      SUM(CASE WHEN LOWER(TRIM(status))='available' AND (patient_id IS NULL OR patient_id=0) THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN LOWER(TRIM(status)) IN ('reserved','blocked') THEN 1 ELSE 0 END) AS reserved,
      SUM(CASE WHEN LOWER(TRIM(status)) IN ('maintenance','housekeeping','cleaning') THEN 1 ELSE 0 END) AS out_of_service
    FROM tbl_bed GROUP BY COALESCE(NULLIF(TRIM(ward_name),''),'Unassigned')
    ORDER BY occupied DESC`);
  return rows.map((r) => {
    const total = n(r.total);
    const occupied = n(r.occupied);
    return {
      ward_name: r.ward_name,
      total,
      occupied,
      available: n(r.available),
      reserved: n(r.reserved),
      out_of_service: n(r.out_of_service),
      occupancy_pct: total ? round1((occupied / total) * 100) : 0,
    };
  });
}

async function fetchBedsMap(pool, wardName) {
  const params = [];
  let wardFilter = '';
  if (wardName) {
    wardFilter = ' AND b.ward_name = ?';
    params.push(wardName);
  }
  const rows = await qAll(pool, `
    SELECT b.id AS bed_id, b.bed_label AS bed_number, b.ward_name, b.status,
      b.patient_id, p.first_name, p.last_name,
      a.admitted_at,
      ROUND(TIMESTAMPDIFF(HOUR, a.admitted_at, NOW()), 1) AS hours_admitted
    FROM tbl_bed b
    LEFT JOIN tbl_patient p ON p.id = b.patient_id
    LEFT JOIN tbl_admission a ON a.patient_id = b.patient_id AND ${NOT_DISCHARGED}
    WHERE 1=1 ${wardFilter}
    ORDER BY b.ward_name, b.bed_label`, params);
  return rows.map((r) => ({
    bed_id: r.bed_id,
    bed_number: r.bed_number,
    ward_name: r.ward_name,
    status: r.status,
    patient_id: r.patient_id,
    patient_name: patientLabel(r),
    admitted_at: r.admitted_at,
    hours_admitted: n(r.hours_admitted),
  }));
}

// ─── Staff ────────────────────────────────────────────────────────────────────

async function fetchStaffSummary(pool, dateStr) {
  const att = await q1(pool, `
    SELECT COUNT(*) AS scheduled,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(status,'')))='present' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(status,'')))='absent' THEN 1 ELSE 0 END) AS absent_unplanned,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(status,''))) IN ('on_leave','leave') THEN 1 ELSE 0 END) AS on_leave,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(status,'')))='late' THEN 1 ELSE 0 END) AS late
    FROM tbl_hms_attendance WHERE att_date = ?`, [dateStr]).catch(() => null);

  if (att && n(att.scheduled) > 0) {
    const scheduled = n(att.scheduled);
    const present = n(att.present);
    return {
      scheduled,
      present,
      absent_unplanned: n(att.absent_unplanned),
      on_leave: n(att.on_leave),
      late: n(att.late),
      attendance_rate_pct: scheduled ? round1((present / scheduled) * 100) : 0,
    };
  }

  const headcount = n((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_employee WHERE COALESCE(status,1)=1`))?.c);
  return {
    scheduled: headcount,
    present: headcount,
    absent_unplanned: 0,
    on_leave: 0,
    late: 0,
    attendance_rate_pct: headcount ? 100 : 0,
  };
}

async function fetchStaffByDepartment(pool, dateStr) {
  const attRows = await qAll(pool, `
    SELECT COALESCE(NULLIF(TRIM(e.primary_department),''),'General') AS dept_name,
      COALESCE(NULLIF(TRIM(e.specialisation),''), 'Staff') AS role,
      COUNT(*) AS scheduled,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(a.status,'')))='present' THEN 1 ELSE 0 END) AS present
    FROM tbl_hms_attendance a
    JOIN tbl_employee e ON e.id = a.employee_id
    WHERE a.att_date = ?
    GROUP BY dept_name, role ORDER BY dept_name, role`, [dateStr]).catch(() => []);

  if (attRows.length) {
    return attRows.map((r) => {
      const scheduled = n(r.scheduled);
      const present = n(r.present);
      const coverage = scheduled ? present / scheduled : 1;
      return {
        dept_name: r.dept_name,
        role: r.role,
        scheduled,
        present,
        gap: Math.max(0, scheduled - present),
        coverage_pct: scheduled ? round1(coverage * 100) : 0,
        status: coverage >= 1 ? 'ok' : coverage >= 0.8 ? 'warn' : 'critical',
      };
    });
  }

  const empRows = await qAll(pool, `
    SELECT COALESCE(NULLIF(TRIM(primary_department),''),'General') AS dept_name,
      COALESCE(NULLIF(TRIM(specialisation),''),'Staff') AS role,
      COUNT(*) AS present
    FROM tbl_employee WHERE COALESCE(status,1)=1
    GROUP BY dept_name, role ORDER BY dept_name, role LIMIT 40`);

  return empRows.map((r) => ({
    dept_name: r.dept_name,
    role: r.role,
    scheduled: n(r.present),
    present: n(r.present),
    gap: 0,
    coverage_pct: 100,
    status: 'ok',
  }));
}

async function fetchStaffAbsences(pool, dateStr) {
  const rows = await qAll(pool, `
    SELECT e.id AS staff_id, e.first_name, e.last_name,
      COALESCE(NULLIF(TRIM(e.primary_department),''),'General') AS dept_name,
      COALESCE(NULLIF(TRIM(e.specialisation),''),'Staff') AS role,
      COALESCE(a.status, 'not_clocked_in') AS attendance_status,
      a.check_in_time, a.check_out_time
    FROM tbl_hms_attendance a
    JOIN tbl_employee e ON e.id = a.employee_id
    WHERE a.att_date = ? AND LOWER(TRIM(COALESCE(a.status,''))) IN ('absent','')
    ORDER BY dept_name, e.last_name`, [dateStr]).catch(() => []);
  return rows.map((r) => ({
    staff_id: r.staff_id,
    staff_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
    dept_name: r.dept_name,
    role: r.role,
    attendance_status: r.attendance_status || 'absent',
  }));
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

async function fetchRevenueSummary(pool, dateStr, yesterday) {
  const revToday = await fetchDirectorCashierRevenue(pool, { start: dateStr, end: dateStr, period: 'day' });
  const revYesterday = await fetchDirectorCashierRevenue(pool, { start: yesterday, end: yesterday, period: 'day' });
  const billedRow = await q1(pool, `
    SELECT COALESCE(SUM(total_amount),0) AS billed FROM tbl_payment_ticket
     WHERE DATE(created_at) = ? AND LOWER(TRIM(COALESCE(status,''))) IN ('paid','pending','partial','issued','open')`, [dateStr]);
  const collected = n(revToday.grandTotal);
  const billed = Math.max(n(billedRow?.billed), collected);
  const prevCollected = n(revYesterday.grandTotal);
  return {
    total_billed: Math.round(billed),
    total_collected: Math.round(collected),
    outstanding: Math.round(Math.max(0, billed - collected)),
    collection_rate_pct: billed ? round1((collected / billed) * 100) : 0,
    prev_collected: Math.round(prevCollected),
    collected_delta: Math.round(collected - prevCollected),
  };
}

async function fetchRevenueByCategory(pool, dateStr, revenueStatCodes) {
  const rev = await fetchDirectorCashierRevenue(pool, { start: dateStr, end: dateStr, period: 'day' }, { visibleStatCodes: revenueStatCodes });
  const pending = await qAll(pool, `SELECT lines_json, total_amount FROM tbl_payment_ticket WHERE LOWER(TRIM(COALESCE(status,'')))='pending'`);
  const billedExtra = {};
  for (const row of pending) {
    let lines = [];
    try { lines = JSON.parse(row.lines_json || '[]'); } catch (_) { lines = []; }
    if (!lines.length) { billedExtra.other = n(billedExtra.other) + n(row.total_amount); continue; }
    for (const line of lines) {
      const cat = lineItemCategory(line);
      billedExtra[cat] = n(billedExtra[cat]) + lineItemAmount(line);
    }
  }
  return Object.keys(REVENUE_CATEGORY_LABELS).map((key) => {
    const collected = n(rev.totals?.[key]);
    const billed = collected + n(billedExtra[key]);
    if (collected <= 0 && billed <= 0) return null;
    return {
      category: REVENUE_CATEGORY_LABELS[key],
      key,
      billed: Math.round(billed),
      collected: Math.round(collected),
      outstanding: Math.round(Math.max(0, billed - collected)),
      collection_rate_pct: billed ? round1((collected / billed) * 100) : 0,
    };
  }).filter(Boolean).sort((a, b) => b.billed - a.billed);
}

async function fetchRevenuePending(pool, dateStr, limit = 50, offset = 0) {
  const rows = await qAll(pool, `
    SELECT t.id AS ticket_id, t.ticket_code, t.total_amount, t.status, t.created_at,
      p.id AS patient_id, p.first_name, p.last_name,
      ROUND(TIMESTAMPDIFF(HOUR, t.created_at, NOW()), 1) AS hours_outstanding
    FROM tbl_payment_ticket t
    LEFT JOIN tbl_patient p ON p.id = t.patient_id
    WHERE LOWER(TRIM(COALESCE(t.status,''))) IN ('pending','partial','issued','open')
      AND DATE(t.created_at) <= ?
    ORDER BY t.created_at ASC
    LIMIT ? OFFSET ?`, [dateStr, limit, offset]);
  return rows.map((r) => ({
    ticket_id: r.ticket_id,
    ticket_code: r.ticket_code,
    total_amount: fmtXaf(r.total_amount),
    status: r.status,
    patient_name: patientLabel(r),
    hours_outstanding: n(r.hours_outstanding),
  }));
}

// ─── Lab ──────────────────────────────────────────────────────────────────────

async function fetchLabSummary(pool, dateStr) {
  const row = await q1(pool, `
    SELECT COUNT(*) AS total_today,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(status,''))) IN ('pending','') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(status,''))) IN ('processing','in_progress') THEN 1 ELSE 0 END) AS processing,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(status,''))) IN ('completed','done','verified','resulted') THEN 1 ELSE 0 END) AS resulted,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(status,''))) NOT IN ('completed','done','verified','resulted','cancelled')
        AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR) THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN LOWER(TRIM(COALESCE(status,''))) LIKE '%critical%' THEN 1 ELSE 0 END) AS critical_total
    FROM tbl_lab_result WHERE DATE(created_at) = ?`, [TAT_THRESHOLD_HOURS, dateStr]).catch(() => ({}));
  return {
    total_today: n(row?.total_today),
    pending: n(row?.pending),
    processing: n(row?.processing),
    resulted: n(row?.resulted),
    overdue: n(row?.overdue),
    critical_total: n(row?.critical_total),
    critical_unnotified: n(row?.critical_total),
  };
}

async function fetchLabOverdue(pool, dateStr, thresholdHours = TAT_THRESHOLD_HOURS) {
  const rows = await qAll(pool, `
    SELECT lr.id AS order_id, lr.test_name, lr.status, lr.created_at AS ordered_at,
      ROUND(TIMESTAMPDIFF(MINUTE, lr.created_at, NOW())/60, 1) AS elapsed_hours,
      p.first_name, p.last_name, lr.patient_id
    FROM tbl_lab_result lr
    LEFT JOIN tbl_patient p ON p.id = lr.patient_id
    WHERE DATE(lr.created_at) = ?
      AND LOWER(TRIM(COALESCE(lr.status,''))) NOT IN ('completed','done','verified','resulted','cancelled')
      AND lr.created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
    ORDER BY lr.created_at ASC`, [dateStr, thresholdHours]);
  return rows.map((r) => ({
    order_id: r.order_id,
    test_name: r.test_name,
    status: r.status,
    ordered_at: r.ordered_at,
    elapsed_hours: n(r.elapsed_hours),
    patient_name: patientLabel(r),
  }));
}

async function fetchLabCritical(pool, dateStr) {
  const rows = await qAll(pool, `
    SELECT lr.id AS order_id, lr.test_name, lr.status, lr.created_at AS ordered_at,
      ROUND(TIMESTAMPDIFF(MINUTE, lr.created_at, NOW())/60, 1) AS elapsed_hours,
      p.first_name, p.last_name, lr.patient_id
    FROM tbl_lab_result lr
    LEFT JOIN tbl_patient p ON p.id = lr.patient_id
    WHERE DATE(lr.created_at) = ?
      AND LOWER(TRIM(COALESCE(lr.status,''))) LIKE '%critical%'
    ORDER BY lr.created_at ASC`, [dateStr]);
  return rows.map((r) => ({
    order_id: r.order_id,
    test_name: r.test_name,
    status: r.status,
    elapsed_hours: n(r.elapsed_hours),
    patient_name: patientLabel(r),
  }));
}

// ─── Pharmacy ───────────────────────────────────────────────────────────────

async function fetchPharmacySummary(pool) {
  const row = await q1(pool, `
    SELECT
      SUM(CASE WHEN COALESCE(quantity,0)=0 THEN 1 ELSE 0 END) AS out_of_stock,
      SUM(CASE WHEN COALESCE(quantity,0)>0 AND COALESCE(quantity,0)<=COALESCE(reorder_level,0)*0.5 THEN 1 ELSE 0 END) AS critical_low,
      SUM(CASE WHEN COALESCE(quantity,0)>COALESCE(reorder_level,0)*0.5 AND COALESCE(quantity,0)<=COALESCE(reorder_level,0) THEN 1 ELSE 0 END) AS below_reorder
    FROM tbl_inventory_item WHERE COALESCE(reorder_level,0)>0`);
  const nearExpiry = n((await q1(pool, `
    SELECT COUNT(*) AS c FROM tbl_inventory_item
     WHERE expiry_date IS NOT NULL AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       AND expiry_date >= CURDATE() AND COALESCE(quantity,0)>0`, [LOW_STOCK_DAYS_AHEAD]))?.c);
  return {
    out_of_stock: n(row?.out_of_stock),
    critical_low: n(row?.critical_low),
    below_reorder: n(row?.below_reorder),
    near_expiry: nearExpiry,
  };
}

async function fetchPharmacyStockAlerts(pool, type = 'all') {
  const rows = await qAll(pool, `
    SELECT name AS generic_name, COALESCE(quantity,0) AS total_stock, COALESCE(reorder_level,0) AS reorder_level,
      CASE WHEN COALESCE(quantity,0)=0 THEN 'out'
           WHEN COALESCE(quantity,0)<=COALESCE(reorder_level,0)*0.5 THEN 'critical'
           ELSE 'low' END AS alert_type
    FROM tbl_inventory_item
    WHERE COALESCE(reorder_level,0)>0 AND COALESCE(quantity,0)<=COALESCE(reorder_level,0)
    ORDER BY quantity ASC LIMIT 40`);
  if (type === 'all') return rows;
  return rows.filter((r) => r.alert_type === type || (type === 'low' && r.alert_type === 'low'));
}

async function fetchPharmacyExpiryAlerts(pool, days = LOW_STOCK_DAYS_AHEAD) {
  const rows = await qAll(pool, `
    SELECT name AS generic_name, expiry_date, COALESCE(quantity,0) AS qty_current,
      DATEDIFF(expiry_date, CURDATE()) AS days_to_expiry,
      CASE WHEN expiry_date <= CURDATE() THEN 'expired'
           WHEN expiry_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'critical'
           WHEN expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'warning'
           ELSE 'notice' END AS expiry_status
    FROM tbl_inventory_item
    WHERE expiry_date IS NOT NULL AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
      AND COALESCE(quantity,0)>0
    ORDER BY expiry_date ASC LIMIT 40`, [days]);
  return rows;
}

// ─── Aggregate /all ───────────────────────────────────────────────────────────

async function fetchDailyAll(pool, dateInput, opts = {}) {
  const parsed = typeof dateInput === 'string' ? parseDailyDate(dateInput) : dateInput;
  if (!parsed) throw Object.assign(new Error('Invalid date. Use YYYY-MM-DD or "today".'), { status: 400 });

  const { dateStr, yesterday } = parsed;
  const model = buildVisibleDashboardModel(opts.aclPack || {});
  const codes = model.allCodes;
  const revenueStatCodes = opts.revenueStatCodes || model.revenueStats.map((s) => s.code);
  const start = Date.now();

  const need = {
    patientFlow: hasAnyCode(codes, ['dir.panel.patient_flow', 'dir.kpi.flow_admitted', 'dir.kpi.patients_today', 'dir.tab.flow']),
    beds: hasAnyCode(codes, ['dir.panel.bed_grid', 'dir.kpi.bed_occupancy', 'dir.tab.beds']),
    staff: hasAnyCode(codes, ['dir.panel.staff_roster', 'dir.kpi.staff_onduty', 'dir.tab.staff']),
    revenue: hasAnyCode(codes, ['dir.panel.revenue_breakdown', 'dir.kpi.revenue_today', 'dir.tab.revenue', 'dir.kpi.revenue_collected']),
    lab: hasAnyCode(codes, ['dir.panel.lab_alerts', 'dir.kpi.pending_lab', 'dir.tab.alerts']),
    pharmacy: hasAnyCode(codes, ['dir.panel.pharmacy_alerts', 'dir.tab.alerts']),
  };

  const [
    pfSummary, pfHourly, erWait,
    bedSummary, bedsByWard,
    staffSummary, staffByDept,
    revSummary, revByCategory,
    labSummary, labOverdue, labCritical,
    pharmSummary, pharmStock,
  ] = await Promise.all([
    need.patientFlow ? fetchPatientFlowSummary(pool, dateStr, yesterday) : null,
    need.patientFlow ? fetchPatientFlowHourly(pool, dateStr) : null,
    need.patientFlow ? fetchErWait(pool, dateStr, yesterday) : null,
    need.beds ? fetchBedsSummary(pool) : null,
    need.beds ? fetchBedsByWard(pool) : null,
    need.staff ? fetchStaffSummary(pool, dateStr) : null,
    need.staff ? fetchStaffByDepartment(pool, dateStr) : null,
    need.revenue ? fetchRevenueSummary(pool, dateStr, yesterday) : null,
    need.revenue ? fetchRevenueByCategory(pool, dateStr, revenueStatCodes) : null,
    need.lab ? fetchLabSummary(pool, dateStr) : null,
    need.lab ? fetchLabOverdue(pool, dateStr) : null,
    need.lab ? fetchLabCritical(pool, dateStr) : null,
    need.pharmacy ? fetchPharmacySummary(pool) : null,
    need.pharmacy ? fetchPharmacyStockAlerts(pool) : null,
  ]);

  return {
    date: dateStr,
    patientFlow: pfSummary ? { summary: pfSummary, hourly: pfHourly, erWait } : null,
    beds: bedSummary ? { summary: bedSummary, byWard: bedsByWard } : null,
    staff: staffSummary ? { summary: staffSummary, byDepartment: staffByDept } : null,
    revenue: revSummary ? { summary: revSummary, byCategory: revByCategory } : null,
    lab: labSummary ? { summary: labSummary, overdue: labOverdue, critical: labCritical } : null,
    pharmacy: pharmSummary ? { summary: pharmSummary, stockAlerts: pharmStock } : null,
    meta: { generatedAt: new Date().toISOString(), durationMs: Date.now() - start },
    visible: {
      tabs: model.tabs.map((t) => t.id),
      kpis: model.kpis.map((k) => k.id),
      panels: model.panels.map((p) => p.id),
    },
  };
}

// ─── Express route mounting ───────────────────────────────────────────────────

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function parseDateMiddleware(req, res, next) {
  const parsed = parseDailyDate(req.params.date || req.query.date || 'today');
  if (!parsed) {
    return res.status(400).json({ ok: false, error: `Invalid date: "${req.params.date}". Use YYYY-MM-DD or "today".` });
  }
  req.reportDate = parsed.date;
  req.reportDateStr = parsed.dateStr;
  req.reportYesterday = parsed.yesterday;
  next();
}

function buildAclGuard(getDirectorPack) {
  return function dailyAclGuard(section) {
    return (req, res, next) => {
      try {
        const pack = getDirectorPack(req, res);
        const model = buildVisibleDashboardModel(pack);
        if (!model.hasShell && !model.tabs.length) {
          return res.status(403).json({ ok: false, error: 'You do not have access to the daily dashboard.' });
        }
        req.dailyAclPack = pack;
        req.dailyAclModel = model;
        const codes = model.allCodes;
        const allowed = {
          all: model.hasShell || codes.has('dir.section.daily_dashboard'),
          patientFlow: hasAnyCode(codes, ['dir.panel.patient_flow', 'dir.kpi.flow_admitted', 'dir.kpi.patients_today', 'dir.kpi.er_wait', 'dir.tab.flow']),
          beds: hasAnyCode(codes, ['dir.panel.bed_grid', 'dir.kpi.bed_occupancy', 'dir.tab.beds']),
          staff: hasAnyCode(codes, ['dir.panel.staff_roster', 'dir.kpi.staff_onduty', 'dir.tab.staff']),
          revenue: hasAnyCode(codes, ['dir.panel.revenue_breakdown', 'dir.kpi.revenue_today', 'dir.tab.revenue', 'dir.kpi.revenue_collected', 'dir.kpi.revenue_billed']),
          lab: hasAnyCode(codes, ['dir.panel.lab_alerts', 'dir.kpi.pending_lab', 'dir.tab.alerts']),
          pharmacy: hasAnyCode(codes, ['dir.panel.pharmacy_alerts', 'dir.tab.alerts']),
        };
        if (section && !allowed[section]) {
          return res.status(403).json({ ok: false, error: 'You do not have access to this dashboard section.' });
        }
        next();
      } catch (e) {
        next(e);
      }
    };
  };
}

/**
 * @param {import('express').Application} app
 * @param {{ pool: import('mysql2/promise').Pool, requireAuth: Function, getDirectorPack: Function }} deps
 */
function mountDailyDashboardRoutes(app, deps) {
  const { pool, requireAuth, getDirectorPack } = deps;
  const guard = buildAclGuard(getDirectorPack);
  const express = require('express');

  const daily = express.Router({ mergeParams: true });
  daily.use(requireAuth);
  daily.use(parseDateMiddleware);

  daily.get('/all', guard('all'), asyncRoute(async (req, res) => {
    const data = await fetchDailyAll(pool, req.reportDateStr, {
      aclPack: req.dailyAclPack,
      revenueStatCodes: req.dailyAclModel.revenueStats.map((s) => s.code),
    });
    return res.json({ ok: true, ...data });
  }));

  const pf = express.Router({ mergeParams: true });
  pf.use(guard('patientFlow'));
  pf.get('/summary', asyncRoute(async (req, res) => {
    const data = await fetchPatientFlowSummary(pool, req.reportDateStr, req.reportYesterday);
    res.json({ ok: true, date: req.reportDateStr, data });
  }));
  pf.get('/hourly', asyncRoute(async (req, res) => {
    const data = await fetchPatientFlowHourly(pool, req.reportDateStr);
    res.json({ ok: true, date: req.reportDateStr, data });
  }));
  pf.get('/er-wait', asyncRoute(async (req, res) => {
    const data = await fetchErWait(pool, req.reportDateStr, req.reportYesterday);
    res.json({ ok: true, date: req.reportDateStr, data });
  }));
  daily.use('/patient-flow', pf);

  const beds = express.Router({ mergeParams: true });
  beds.use(guard('beds'));
  beds.get('/summary', asyncRoute(async (req, res) => {
    res.json({ ok: true, date: req.reportDateStr, data: await fetchBedsSummary(pool) });
  }));
  beds.get('/by-ward', asyncRoute(async (req, res) => {
    res.json({ ok: true, date: req.reportDateStr, data: await fetchBedsByWard(pool) });
  }));
  beds.get('/map', asyncRoute(async (req, res) => {
    res.json({ ok: true, date: req.reportDateStr, ward: req.query.ward_name || null, data: await fetchBedsMap(pool, req.query.ward_name) });
  }));
  daily.use('/beds', beds);

  const staff = express.Router({ mergeParams: true });
  staff.use(guard('staff'));
  staff.get('/summary', asyncRoute(async (req, res) => {
    res.json({ ok: true, date: req.reportDateStr, data: await fetchStaffSummary(pool, req.reportDateStr) });
  }));
  staff.get('/by-department', asyncRoute(async (req, res) => {
    res.json({ ok: true, date: req.reportDateStr, data: await fetchStaffByDepartment(pool, req.reportDateStr) });
  }));
  staff.get('/absences', asyncRoute(async (req, res) => {
    res.json({ ok: true, date: req.reportDateStr, data: await fetchStaffAbsences(pool, req.reportDateStr) });
  }));
  daily.use('/staff', staff);

  const revenue = express.Router({ mergeParams: true });
  revenue.use(guard('revenue'));
  revenue.get('/summary', asyncRoute(async (req, res) => {
    res.json({ ok: true, date: req.reportDateStr, data: await fetchRevenueSummary(pool, req.reportDateStr, req.reportYesterday) });
  }));
  revenue.get('/by-category', asyncRoute(async (req, res) => {
    const data = await fetchRevenueByCategory(pool, req.reportDateStr, req.dailyAclModel.revenueStats.map((s) => s.code));
    res.json({ ok: true, date: req.reportDateStr, data });
  }));
  revenue.get('/pending', asyncRoute(async (req, res) => {
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
    const offset = parseInt(req.query.offset || '0', 10);
    res.json({ ok: true, date: req.reportDateStr, limit, offset, data: await fetchRevenuePending(pool, req.reportDateStr, limit, offset) });
  }));
  daily.use('/revenue', revenue);

  const lab = express.Router({ mergeParams: true });
  lab.use(guard('lab'));
  lab.get('/summary', asyncRoute(async (req, res) => {
    res.json({ ok: true, date: req.reportDateStr, tat_threshold_hours: TAT_THRESHOLD_HOURS, data: await fetchLabSummary(pool, req.reportDateStr) });
  }));
  lab.get('/overdue', asyncRoute(async (req, res) => {
    const threshold = parseInt(req.query.threshold_hours || TAT_THRESHOLD_HOURS, 10);
    res.json({ ok: true, date: req.reportDateStr, threshold_hours: threshold, data: await fetchLabOverdue(pool, req.reportDateStr, threshold) });
  }));
  lab.get('/critical', asyncRoute(async (req, res) => {
    res.json({ ok: true, date: req.reportDateStr, data: await fetchLabCritical(pool, req.reportDateStr) });
  }));
  daily.use('/lab', lab);

  app.use('/portal/api/daily/:date', daily);

  const pharmacy = express.Router();
  pharmacy.use(requireAuth);
  pharmacy.use(parseDateMiddleware);
  pharmacy.use(guard('pharmacy'));
  pharmacy.get('/summary', asyncRoute(async (req, res) => {
    res.json({ ok: true, data: await fetchPharmacySummary(pool) });
  }));
  pharmacy.get('/stock-alerts', asyncRoute(async (req, res) => {
    res.json({ ok: true, alert_type_filter: req.query.type || 'all', data: await fetchPharmacyStockAlerts(pool, req.query.type) });
  }));
  pharmacy.get('/expiry-alerts', asyncRoute(async (req, res) => {
    const days = parseInt(req.query.days || LOW_STOCK_DAYS_AHEAD, 10);
    res.json({ ok: true, days_ahead: days, data: await fetchPharmacyExpiryAlerts(pool, days) });
  }));
  app.use('/portal/api/daily/pharmacy', pharmacy);
}

module.exports = {
  parseDailyDate,
  fetchDailyAll,
  fetchPatientFlowSummary,
  fetchPatientFlowHourly,
  fetchErWait,
  fetchBedsSummary,
  fetchBedsByWard,
  fetchBedsMap,
  fetchStaffSummary,
  fetchStaffByDepartment,
  fetchStaffAbsences,
  fetchRevenueSummary,
  fetchRevenueByCategory,
  fetchRevenuePending,
  fetchLabSummary,
  fetchLabOverdue,
  fetchLabCritical,
  fetchPharmacySummary,
  fetchPharmacyStockAlerts,
  fetchPharmacyExpiryAlerts,
  mountDailyDashboardRoutes,
  asyncRoute,
  TAT_THRESHOLD_HOURS,
};
