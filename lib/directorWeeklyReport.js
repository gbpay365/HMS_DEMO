'use strict';

const { fetchDirectorCashierRevenue } = require('./directorCashierRevenue');
const { buildVisibleWeeklyModel } = require('./directorWeeklyReportCatalog');
const {
  toIsoDate,
  mondayOfWeek,
  parseWeekInput,
  priorPeriodRange,
  formatRangeLabel,
  inputValuesForRange,
} = require('./hmsDirectorReportsPeriod');

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const NOT_DISCHARGED = `(a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')`;
const ALOS_TARGETS = {
  General: 3.5,
  Surgical: 4.8,
  Surgery: 4.8,
  Cardiology: 5.0,
  Pediatrics: 3.0,
  Orthopedics: 5.5,
  Neurology: 6.0,
  Maternity: 2.5,
  Oncology: 7.0,
  ICU: 5.0,
  Emergency: 2.0,
};

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtXaf(v) {
  return Math.round(n(v));
}

function round1(v) {
  return Math.round(n(v) * 10) / 10;
}

function pctDelta(curr, prev) {
  if (!prev) return curr > 0 ? 100 : 0;
  return round1(((curr - prev) / prev) * 100);
}

function absDelta(curr, prev) {
  return round1(curr - prev);
}

function pad2(x) {
  return String(x).padStart(2, '0');
}

function isoWeekKey(mondayDate) {
  const d = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate());
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const day = jan4.getDay() || 7;
  const week1 = new Date(jan4);
  week1.setDate(jan4.getDate() - day + 1);
  const weekNum = 1 + Math.round((d - week1) / (7 * 86400000));
  return `${d.getFullYear()}-W${pad2(weekNum)}`;
}

function shortMonthDay(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function weekLabelFromRange(start, end) {
  const mon = new Date(start + 'T12:00:00');
  const weekNum = parseInt(isoWeekKey(mon).split('-W')[1], 10);
  return `Week ${weekNum} · ${shortMonthDay(start)}–${shortMonthDay(end)}`;
}

function daysInRange(start, end) {
  const out = [];
  const cur = new Date(start + 'T12:00:00');
  const last = new Date(end + 'T12:00:00');
  while (cur <= last) {
    out.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function dayLabelForIso(iso) {
  const d = new Date(iso + 'T12:00:00');
  const idx = (d.getDay() + 6) % 7;
  return DAY_LABELS[idx] || d.toLocaleDateString('en-GB', { weekday: 'short' });
}

async function q1(pool, sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows?.[0] || null;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn('[director-weekly]', err.message);
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

function listRecentWeeks(count = 3) {
  const weeks = [];
  const today = new Date();
  for (let i = 0; i < count; i += 1) {
    const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i * 7);
    const mon = mondayOfWeek(anchor);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    const start = toIsoDate(mon);
    const end = toIsoDate(sun);
    weeks.push({
      key: isoWeekKey(mon),
      label: weekLabelFromRange(start, end),
      start,
      end,
    });
  }
  return weeks;
}

function resolveWeekRange(query = {}) {
  const weeks = listRecentWeeks(12);
  const weekKey = String(query.week || '').trim();
  let picked = weeks.find((w) => w.key === weekKey);
  if (!picked && weekKey) {
    const anchor = parseWeekInput(weekKey);
    if (anchor) {
      const mon = mondayOfWeek(anchor);
      const sun = new Date(mon);
      sun.setDate(sun.getDate() + 6);
      const start = toIsoDate(mon);
      const end = toIsoDate(sun);
      picked = { key: weekKey, label: weekLabelFromRange(start, end), start, end };
    }
  }
  if (!picked) picked = weeks[0];
  return {
    period: 'week',
    start: picked.start,
    end: picked.end,
    anchor: picked.start,
    label: picked.label,
    weekKey: picked.key,
  };
}

async function countPatients(pool, start, end) {
  const opd = n((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_opd_visit WHERE visit_date BETWEEN ? AND ?`, [start, end]))?.c);
  const ipd = n((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_admission WHERE DATE(admitted_at) BETWEEN ? AND ?`, [start, end]))?.c);
  return opd + ipd;
}

async function avgOccupancy(pool, start, end) {
  const bedRow = await q1(pool, `SELECT COUNT(*) AS total, SUM(CASE WHEN patient_id IS NOT NULL AND patient_id > 0 THEN 1 ELSE 0 END) AS occupied FROM tbl_bed`);
  const total = n(bedRow?.total);
  if (!total) return 0;
  const days = daysInRange(start, end);
  let sum = 0;
  for (const day of days) {
    const row = await q1(
      pool,
      `SELECT COUNT(*) AS c FROM tbl_admission a
        WHERE DATE(a.admitted_at) <= ?
          AND (${NOT_DISCHARGED} OR DATE(a.discharged_at) > ?)`,
      [day, day]
    );
    const occ = Math.min(100, Math.round((n(row?.c) / total) * 100));
    sum += occ;
  }
  return days.length ? Math.round(sum / days.length) : Math.round((n(bedRow?.occupied) / total) * 100);
}

async function avgAlos(pool, start, end) {
  const row = await q1(
    pool,
    `SELECT AVG(DATEDIFF(a.discharged_at, a.admitted_at)) AS m
       FROM tbl_admission a
      WHERE DATE(a.discharged_at) BETWEEN ? AND ?
        AND a.discharged_at IS NOT NULL
        AND a.discharged_at > a.admitted_at
        AND a.discharged_at > '0000-01-02'`,
    [start, end]
  );
  return round1(row?.m);
}

async function avgErWait(pool, start, end) {
  const row = await q1(
    pool,
    `SELECT AVG(TIMESTAMPDIFF(MINUTE, queue_started_at,
            COALESCE(NULLIF(completed_at, '0000-00-00 00:00:00'), NOW()))) AS m
       FROM tbl_opd_visit
      WHERE visit_date BETWEEN ? AND ?
        AND (department LIKE '%Emergency%' OR department LIKE '%A&E%' OR department LIKE '%AE%' OR is_emergency = 1)
        AND queue_started_at IS NOT NULL`,
    [start, end]
  );
  return Math.round(n(row?.m));
}

async function fetchDailyVolume(pool, start, end) {
  const days = daysInRange(start, end);
  const out = [];
  for (const iso of days) {
    const opd = n((await q1(
      pool,
      `SELECT COUNT(*) AS c FROM tbl_opd_visit
        WHERE visit_date = ? AND COALESCE(is_emergency, 0) = 0`,
      [iso]
    ))?.c);
    const emergency = n((await q1(
      pool,
      `SELECT COUNT(*) AS c FROM tbl_opd_visit
        WHERE visit_date = ? AND (COALESCE(is_emergency, 0) = 1 OR department LIKE '%Emergency%' OR department LIKE '%A&E%' OR department LIKE '%AE%')`,
      [iso]
    ))?.c);
    const ipd = n((await q1(
      pool,
      `SELECT COUNT(*) AS c FROM tbl_admission WHERE DATE(admitted_at) = ?`,
      [iso]
    ))?.c);
    out.push({ day: dayLabelForIso(iso), iso, opd, ipd, emergency });
  }
  return out;
}

async function fetchOccupancyTrend(pool, start, end) {
  const bedRow = await q1(pool, `SELECT COUNT(*) AS total FROM tbl_bed`);
  const total = n(bedRow?.total) || 1;
  const days = daysInRange(start, end);
  const out = [];
  for (const iso of days) {
    const row = await q1(
      pool,
      `SELECT COUNT(*) AS c FROM tbl_admission a
        WHERE DATE(a.admitted_at) <= ?
          AND (${NOT_DISCHARGED} OR DATE(a.discharged_at) > ?)`,
      [iso, iso]
    );
    out.push({
      day: dayLabelForIso(iso),
      occupancy: Math.min(100, Math.round((n(row?.c) / total) * 100)),
    });
  }
  return out;
}

async function fetchRevenueByDay(pool, start, end) {
  const days = daysInRange(start, end);
  const weekdayTarget = 28000;
  const weekendTarget = 18000;
  const out = [];
  for (const iso of days) {
    const rev = await fetchDirectorCashierRevenue(pool, { start: iso, end: iso, period: 'day' });
    const collected = n(rev.grandTotal);
    const billedRows = await qAll(
      pool,
      `SELECT total_amount FROM tbl_payment_ticket
        WHERE DATE(created_at) = ? AND LOWER(TRIM(COALESCE(status,''))) IN ('paid','pending')`,
      [iso]
    );
    const billed = billedRows.reduce((s, r) => s + n(r.total_amount), 0) || collected;
    const d = new Date(iso + 'T12:00:00');
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    out.push({
      day: dayLabelForIso(iso),
      billed: Math.round(billed),
      collected: Math.round(collected),
      target: isWeekend ? weekendTarget : weekdayTarget,
    });
  }
  return out;
}

async function fetchAlosByDept(pool, start, end) {
  const rows = await qAll(
    pool,
    `SELECT COALESCE(NULLIF(TRIM(admitting_department), ''), 'General') AS dept,
            AVG(DATEDIFF(a.discharged_at, a.admitted_at)) AS alos
       FROM tbl_admission a
      WHERE DATE(a.discharged_at) BETWEEN ? AND ?
        AND a.discharged_at IS NOT NULL
        AND a.discharged_at > a.admitted_at
        AND a.discharged_at > '0000-01-02'
      GROUP BY COALESCE(NULLIF(TRIM(admitting_department), ''), 'General')
      ORDER BY alos DESC
      LIMIT 12`,
    [start, end]
  );
  return rows.map((r) => {
    const dept = String(r.dept || 'General');
    return {
      dept,
      alos: round1(r.alos),
      target: ALOS_TARGETS[dept] || 4.0,
    };
  });
}

async function fetchDoctorPerf(pool, start, end) {
  const rows = await qAll(
    pool,
    `SELECT CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,'')) AS name,
            COALESCE(NULLIF(TRIM(e.primary_department), ''), 'General') AS dept,
            COUNT(v.id) AS patients
       FROM tbl_opd_visit v
       INNER JOIN tbl_employee e ON e.id = v.assigned_doctor_id
      WHERE v.visit_date BETWEEN ? AND ?
        AND v.assigned_doctor_id IS NOT NULL
      GROUP BY v.assigned_doctor_id, e.first_name, e.last_name, e.primary_department
      ORDER BY patients DESC
      LIMIT 12`,
    [start, end]
  );
  return rows.map((r) => ({
    name: String(r.name || '').trim() || 'Doctor',
    dept: r.dept,
    patients: n(r.patients),
    surgeries: 0,
    satisfaction: 4.6,
  }));
}

async function fetchIncidents(pool, start, end) {
  const labCritical = n((await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_lab_result
      WHERE DATE(created_at) BETWEEN ? AND ?
        AND LOWER(TRIM(COALESCE(status,''))) LIKE '%critical%'`,
    [start, end]
  ))?.c);
  const pharmacyOut = n((await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_inventory_item
      WHERE quantity <= 0 AND reorder_level > 0`,
    []
  ))?.c);
  const overdueLab = n((await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_order_item
      WHERE LOWER(TRIM(item_type)) = 'laboratory'
        AND status IN ('pending','in_progress')
        AND created_at < DATE_SUB(NOW(), INTERVAL 4 HOUR)`,
    []
  ))?.c);

  const items = [];
  if (labCritical > 0) {
    items.push({ type: 'Lab result critical', count: labCritical, severity: 'major', open: labCritical });
  }
  if (overdueLab > 0) {
    items.push({ type: 'Overdue laboratory results', count: overdueLab, severity: 'moderate', open: overdueLab });
  }
  if (pharmacyOut > 0) {
    items.push({ type: 'Pharmacy stock-out', count: pharmacyOut, severity: 'moderate', open: pharmacyOut });
  }
  return items;
}

async function fetchSupplyDigest(pool, start, end) {
  const consumed = await qAll(
    pool,
    `SELECT COALESCE(i.name, 'Item') AS item,
            SUM(CASE WHEN m.movement_type IN ('out','issue','dispense') THEN ABS(m.quantity) ELSE 0 END) AS consumed,
            SUM(CASE WHEN m.movement_type IN ('in','restock','receive') THEN ABS(m.quantity) ELSE 0 END) AS restocked
       FROM tbl_inventory_movement m
       LEFT JOIN tbl_inventory_item i ON i.id = m.item_id
      WHERE DATE(m.created_at) BETWEEN ? AND ?
      GROUP BY m.item_id, i.name
      ORDER BY consumed DESC
      LIMIT 8`,
    [start, end]
  ).catch(() => []);

  if (consumed.length) {
    return consumed.map((r) => {
      const c = n(r.consumed);
      const rest = n(r.restocked);
      const balance = rest - c;
      return {
        item: r.item,
        consumed: c,
        restocked: rest,
        balance,
        status: balance < 0 ? 'deficit' : 'ok',
      };
    });
  }

  const low = await qAll(
    pool,
    `SELECT name AS item, COALESCE(quantity, 0) AS stock, COALESCE(reorder_level, 0) AS minStock
       FROM tbl_inventory_item
      WHERE reorder_level > 0
      ORDER BY (quantity - reorder_level) ASC
      LIMIT 8`
  );
  return low.map((r) => ({
    item: r.item,
    consumed: n(r.minStock),
    restocked: n(r.stock),
    balance: n(r.stock) - n(r.minStock),
    status: n(r.stock) <= n(r.minStock) ? 'deficit' : 'ok',
  }));
}

async function buildSummary(pool, range, prevRange, codes) {
  const need = (code) => codes.has(code);

  const [
    patients,
    prevPatients,
    occupancy,
    prevOccupancy,
    alos,
    prevAlos,
    revenue,
    prevRevenue,
    erWait,
    prevErWait,
  ] = await Promise.all([
    need('dir.wk.kpi.total_patients') ? countPatients(pool, range.start, range.end) : 0,
    need('dir.wk.kpi.total_patients') ? countPatients(pool, prevRange.start, prevRange.end) : 0,
    need('dir.wk.kpi.avg_occupancy') || need('dir.wk.panel.occupancy_trend') ? avgOccupancy(pool, range.start, range.end) : 0,
    need('dir.wk.kpi.avg_occupancy') ? avgOccupancy(pool, prevRange.start, prevRange.end) : 0,
    need('dir.wk.kpi.avg_alos') || need('dir.wk.panel.alos_chart') ? avgAlos(pool, range.start, range.end) : 0,
    need('dir.wk.kpi.avg_alos') ? avgAlos(pool, prevRange.start, prevRange.end) : 0,
    need('dir.wk.kpi.weekly_revenue') || need('dir.wk.panel.revenue_chart')
      ? fetchDirectorCashierRevenue(pool, range).then((r) => n(r.grandTotal))
      : 0,
    need('dir.wk.kpi.weekly_revenue') ? fetchDirectorCashierRevenue(pool, prevRange).then((r) => n(r.grandTotal)) : 0,
    need('dir.wk.kpi.avg_er_wait') ? avgErWait(pool, range.start, range.end) : 0,
    need('dir.wk.kpi.avg_er_wait') ? avgErWait(pool, prevRange.start, prevRange.end) : 0,
  ]);

  let incidents = [];
  if (need('dir.wk.kpi.incidents') || need('dir.wk.panel.incidents')) {
    incidents = await fetchIncidents(pool, range.start, range.end);
  }
  let prevIncidents = [];
  if (need('dir.wk.kpi.incidents')) {
    prevIncidents = await fetchIncidents(pool, prevRange.start, prevRange.end);
  }
  const incidentCount = incidents.reduce((s, i) => s + n(i.count), 0);
  const prevIncidentCount = prevIncidents.reduce((s, i) => s + n(i.count), 0);

  return {
    totalPatients: patients,
    patientsVsPrev: pctDelta(patients, prevPatients),
    avgOccupancy: occupancy,
    occupancyVsPrev: absDelta(occupancy, prevOccupancy),
    avgALOS: alos,
    alosVsPrev: absDelta(alos, prevAlos),
    revenueWeek: revenue,
    revenueVsPrev: pctDelta(revenue, prevRevenue),
    avgERWait: erWait,
    erWaitVsPrev: absDelta(erWait, prevErWait),
    incidentCount,
    incidentsVsPrev: absDelta(incidentCount, prevIncidentCount),
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ start: string, end: string, weekKey?: string, label?: string }} range
 * @param {{ aclPack?: object }} opts
 */
async function fetchDirectorWeeklyReport(pool, range, opts = {}) {
  const model = buildVisibleWeeklyModel(opts.aclPack || {});
  const codes = model.allCodes;
  const prevRange = priorPeriodRange(range);

  const summary = await buildSummary(pool, range, prevRange, codes);

  const [dailyVolume, occupancyTrend, revenueByDay, alos, doctorPerf, incidents, supplyAlerts] = await Promise.all([
    codes.has('dir.wk.panel.patient_volume') ? fetchDailyVolume(pool, range.start, range.end) : [],
    codes.has('dir.wk.panel.occupancy_trend') ? fetchOccupancyTrend(pool, range.start, range.end) : [],
    codes.has('dir.wk.panel.revenue_chart') ? fetchRevenueByDay(pool, range.start, range.end) : [],
    codes.has('dir.wk.panel.alos_chart') ? fetchAlosByDept(pool, range.start, range.end) : [],
    codes.has('dir.wk.panel.doctor_perf') ? fetchDoctorPerf(pool, range.start, range.end) : [],
    codes.has('dir.wk.panel.incidents') ? fetchIncidents(pool, range.start, range.end) : [],
    codes.has('dir.wk.panel.supply_digest') ? fetchSupplyDigest(pool, range.start, range.end) : [],
  ]);

  return {
    range: {
      period: 'week',
      start: range.start,
      end: range.end,
      weekKey: range.weekKey || inputValuesForRange(range).week,
      label: range.label || formatRangeLabel('week', range.start, range.end),
    },
    weeks: listRecentWeeks(3),
    summary,
    dailyVolume,
    occupancyTrend,
    revenueByDay,
    alos,
    doctorPerf,
    incidents,
    supplyAlerts,
    updatedAt: new Date().toISOString(),
    visible: {
      kpis: model.kpis.map((k) => k.dataKey),
      panels: model.panels.map((p) => p.dataKey),
    },
  };
}

module.exports = {
  listRecentWeeks,
  resolveWeekRange,
  fetchDirectorWeeklyReport,
};
