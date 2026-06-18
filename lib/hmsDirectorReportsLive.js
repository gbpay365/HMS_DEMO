'use strict';

/** Live KPIs for Management Reports — queries operational DB tables. */

const { defaultRangeForSection, priorPeriodRange } = require('./hmsDirectorReportsPeriod');
const { fetchReportDetails } = require('./hmsDirectorReportsDetails');

function todaySql() {
  return new Date().toISOString().slice(0, 10);
}

function resolveRange(range, sectionKey) {
  if (range && range.start && range.end) return range;
  return defaultRangeForSection(sectionKey);
}

function dateBetween(col, start, end) {
  return { clause: `DATE(${col}) BETWEEN ? AND ?`, params: [start, end] };
}

function dtBetween(col, start, end) {
  return dateBetween(col, start, end);
}

function periodTag(range) {
  if (range.start === range.end) return range.start;
  return `${range.start} – ${range.end}`;
}

const NOT_DISCHARGED = `(a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')`;

function ipdAsOfEnd(end) {
  return `(DATE(a.admitted_at) <= ? AND (${NOT_DISCHARGED} OR DATE(a.discharged_at) > ?))`;
}

async function q1(pool, sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows && rows[0] ? rows[0] : null;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[management-reports] query failed:', err.message);
    }
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

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtInt(v) {
  return n(v).toLocaleString('en-GB');
}

function fmtMoney(v) {
  return n(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' XAF';
}

function fmtPct(v) {
  return n(v).toFixed(1) + '%';
}

function metric(label, value, subtext) {
  return { label, value: value == null ? '—' : String(value), subtext: subtext || null };
}

function trendMetric(label, current, previous, formatter = fmtInt) {
  const c = n(current);
  const p = n(previous);
  let sub = null;
  if (p > 0) {
    const pct = ((c - p) / p) * 100;
    sub = (pct >= 0 ? '+' : '') + pct.toFixed(0) + '% vs prior period';
  } else if (c > 0) sub = 'New activity';
  return metric(label, formatter(c), sub);
}

async function fetchDaily(pool, fid, rangeIn) {
  const range = resolveRange(rangeIn, 'daily');
  const { start, end } = range;
  const tag = periodTag(range);
  const fAdm = fid ? ' AND a.facility_id = ?' : '';
  const fAdmP = fid ? [fid] : [];
  const fVis = fid ? ' AND v.facility_id = ?' : '';
  const fVisP = fid ? [fid] : [];
  const admB = dateBetween('a.admitted_at', start, end);
  const disB = dateBetween('a.discharged_at', start, end);
  const visB = dateBetween('v.visit_date', start, end);

  const admToday = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_admission a WHERE ${admB.clause}${fAdm}`,
    [...admB.params, ...fAdmP]
  );
  const disToday = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_admission a WHERE ${disB.clause}${fAdm}`,
    [...disB.params, ...fAdmP]
  );
  const ipdNow = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_admission a WHERE ${ipdAsOfEnd(end)}${fAdm}`,
    [end, end, ...fAdmP]
  );
  const pendingBeds = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_admission a WHERE ${ipdAsOfEnd(end)} AND (a.bed_id IS NULL OR a.bed_id = 0)${fAdm}`,
    [end, end, ...fAdmP]
  );
  const beds = await q1(
    pool,
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN patient_id IS NOT NULL AND patient_id > 0 THEN 1 ELSE 0 END) AS occupied
       FROM tbl_bed`
  );
  const totalBeds = n(beds?.total);
  const occ = totalBeds ? (n(beds?.occupied) / totalBeds) * 100 : 0;

  const opdToday = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_visit v WHERE ${visB.clause}${fVis}`,
    [...visB.params, ...fVisP]
  );
  const erToday = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_visit v
      WHERE ${visB.clause} AND (v.department LIKE '%Emergency%' OR v.department LIKE '%A&E%' OR v.department LIKE '%AE%')${fVis}`,
    [...visB.params, ...fVisP]
  );
  const opdWaiting = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_visit v
      WHERE ${visB.clause} AND v.queue_status NOT IN ('completed','cancelled')${fVis}`,
    [...visB.params, ...fVisP]
  );
  let walkIns = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_visit v
      WHERE ${visB.clause} AND (v.visit_type IN ('walk_in','walkin','walk-in') OR v.visit_type LIKE '%walk%')${fVis}`,
    [...visB.params, ...fVisP]
  );
  if (!walkIns) {
    walkIns = await q1(
      pool,
      `SELECT COUNT(*) AS c FROM tbl_opd_visit v
        WHERE ${visB.clause} AND COALESCE(v.booking_type,'') IN ('walk_in','walkin','')${fVis}`,
      [...visB.params, ...fVisP]
    );
  }

  const surgToday = await q1(
    pool,
    `SELECT
       SUM(CASE WHEN DATE(s.created_at) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS scheduled,
       SUM(CASE WHEN s.status = 'completed' AND DATE(s.completed_at) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN s.status = 'cancelled' AND DATE(s.created_at) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS cancelled
     FROM tbl_ipd_surgery s`,
    [start, end, start, end, start, end]
  );

  const deathsB = dateBetween('date_of_death', start, end);
  const deathsToday = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_death_registry WHERE ${deathsB.clause}`,
    deathsB.params
  );
  const icuNow = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_admission a
      LEFT JOIN tbl_bed b ON b.id = a.bed_id
     WHERE ${ipdAsOfEnd(end)}
       AND (b.ward_name LIKE '%ICU%' OR b.ward_name LIKE '%HDU%' OR a.admitting_department LIKE '%ICU%')${fAdm}`,
    [end, end, ...fAdmP]
  );
  const labCritB = dtBetween('created_at', start, end);
  const criticalLab = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_lab_result
      WHERE ${labCritB.clause}
        AND (status LIKE '%critical%' OR status LIKE '%abnormal%' OR status LIKE '%urgent%')`,
    labCritB.params
  );

  const rxB = dateBetween('created_at', start, end);
  const rxToday = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_prescription WHERE ${rxB.clause}`,
    rxB.params
  );
  const lowStock = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_inventory_item
      WHERE quantity <= reorder_level AND reorder_level > 0`
  );

  const txnB = dateBetween('transaction_date', start, end);
  const revToday = await q1(
    pool,
    `SELECT COALESCE(SUM(amount),0) AS s, COUNT(*) AS c
       FROM tbl_transaction WHERE status = 'completed' AND ${txnB.clause}`,
    txnB.params
  );
  const ticketsPending = await q1(
    pool,
    `SELECT COUNT(*) AS c, COALESCE(SUM(total_amount),0) AS s
       FROM tbl_payment_ticket WHERE status = 'pending'`
  );
  const clinDischargePending = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_admission a
      WHERE a.ipd_status = 'clinical_discharged' AND ${ipdAsOfEnd(end)}${fAdm}`,
    [end, end, ...fAdmP]
  );

  const wardRows = await qAll(
    pool,
    `SELECT COALESCE(b.ward_name, 'Unassigned') AS ward, COUNT(*) AS c
       FROM tbl_admission a
       LEFT JOIN tbl_bed b ON b.id = a.bed_id
      WHERE ${ipdAsOfEnd(end)}${fAdm}
      GROUP BY COALESCE(b.ward_name, 'Unassigned')
      ORDER BY c DESC LIMIT 5`,
    [end, end, ...fAdmP]
  );

  const pSub = tag;

  return {
    census: {
      metrics: [
        metric('Admissions', fmtInt(admToday?.c), pSub),
        metric('Discharges', fmtInt(disToday?.c), pSub),
        metric('Inpatients (end of period)', fmtInt(ipdNow?.c), `as of ${end}`),
        metric('Bed occupancy', totalBeds ? fmtPct(occ) : '—', totalBeds ? `${fmtInt(beds?.occupied)} / ${fmtInt(totalBeds)} beds` : null),
        metric('Awaiting bed assignment', fmtInt(pendingBeds?.c), `as of ${end}`),
        ...wardRows.map((w) => metric(w.ward, fmtInt(w.c), 'inpatients')),
      ],
    },
    opd_emergency: {
      metrics: [
        metric('OPD visits', fmtInt(opdToday?.c), pSub),
        metric('Emergency / A&E', fmtInt(erToday?.c), pSub),
        metric('Queue (not completed)', fmtInt(opdWaiting?.c), pSub),
        metric('Walk-ins', fmtInt(walkIns?.c), pSub),
        metric('Appointments (est.)', fmtInt(n(opdToday?.c) - n(walkIns?.c)), pSub),
      ],
    },
    theatre: {
      metrics: surgToday
        ? [
            metric('Scheduled / logged', fmtInt(surgToday.scheduled), pSub),
            metric('Completed', fmtInt(surgToday.done), pSub),
            metric('Cancelled', fmtInt(surgToday.cancelled), pSub),
            metric('Completion rate', n(surgToday.scheduled) ? fmtPct((n(surgToday.done) / n(surgToday.scheduled)) * 100) : '—', pSub),
          ]
        : [metric('Surgery module', '—', 'No surgery data table')],
    },
    clinical_alerts: {
      metrics: [
        metric('Deaths recorded', fmtInt(deathsToday?.c), pSub),
        metric('ICU / HDU inpatients', fmtInt(icuNow?.c), `as of ${end}`),
        metric('Critical / urgent labs', fmtInt(criticalLab?.c), pSub),
        metric('Clinical discharge pending financial', fmtInt(clinDischargePending?.c), `as of ${end}`),
      ],
    },
    pharmacy: {
      metrics: [
        metric('Prescriptions', fmtInt(rxToday?.c), pSub),
        metric('Low-stock SKUs', fmtInt(lowStock?.c), 'current stock'),
        metric('Active prescriptions', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_prescription WHERE status = 'active'`))?.c), 'now'),
      ],
    },
    daily_revenue: {
      metrics: [
        metric('Collections', fmtMoney(revToday?.s), pSub),
        metric('Completed transactions', fmtInt(revToday?.c), pSub),
        metric('Pending cashier tickets', fmtInt(ticketsPending?.c), fmtMoney(ticketsPending?.s)),
        metric('Awaiting financial discharge', fmtInt(clinDischargePending?.c), `as of ${end}`),
      ],
    },
  };
}

async function fetchWeekly(pool, fid, rangeIn) {
  const range = resolveRange(rangeIn, 'weekly');
  const { start, end } = range;
  const prev = priorPeriodRange(range);
  const tag = periodTag(range);
  const admB = dateBetween('admitted_at', start, end);
  const admPrevB = dateBetween('admitted_at', prev.start, prev.end);
  const disB = dateBetween('discharged_at', start, end);
  const visB = dateBetween('visit_date', start, end);
  const labB = dtBetween('created_at', start, end);
  const txnB = dateBetween('transaction_date', start, end);

  const admWeek = await q1(pool, `SELECT COUNT(*) AS c FROM tbl_admission WHERE ${admB.clause}`, admB.params);
  const admPrev = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_admission WHERE ${admPrevB.clause}`,
    admPrevB.params
  );
  const alos = await q1(
    pool,
    `SELECT AVG(DATEDIFF(DATE(discharged_at), DATE(admitted_at))) AS d
       FROM tbl_admission
      WHERE discharged_at IS NOT NULL
        AND ${disB.clause}
        AND discharged_at <> '0000-00-00 00:00:00'`,
    disB.params
  );
  const opdWeek = await q1(pool, `SELECT COUNT(*) AS c FROM tbl_opd_visit WHERE ${visB.clause}`, visB.params);
  const labOrdered = await q1(pool, `SELECT COUNT(*) AS c FROM tbl_lab_result WHERE ${labB.clause}`, labB.params);
  const labDone = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_lab_result
      WHERE ${labB.clause}
        AND status IN ('completed','validated','approved')`,
    labB.params
  );
  const radWeek = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_radiology_order WHERE ${labB.clause}`,
    labB.params
  ).catch(() => null);
  const revWeek = await q1(
    pool,
    `SELECT COALESCE(SUM(amount),0) AS s FROM tbl_transaction WHERE status='completed' AND ${txnB.clause}`,
    txnB.params
  );
  const staffActive = await q1(pool, `SELECT COUNT(*) AS c FROM tbl_employee WHERE status = 1 AND role NOT IN (99)`);
  const leavePending = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_hms_leave_request WHERE status = 'pending'`
  ).catch(() => null);
  const attB = dateBetween('attendance_date', start, end);
  const attendanceWeek = await q1(
    pool,
    `SELECT COUNT(DISTINCT employee_id) AS c FROM tbl_hr_attendance WHERE ${attB.clause}`,
    attB.params
  ).catch(() => null);
  const lowStock = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_inventory_item WHERE quantity <= reorder_level`
  );

  const deptDist = await qAll(
    pool,
    `SELECT COALESCE(admitting_department, 'Unknown') AS dept, COUNT(*) AS c
       FROM tbl_admission
      WHERE ${admB.clause}
      GROUP BY COALESCE(admitting_department, 'Unknown')
      ORDER BY c DESC LIMIT 4`,
    admB.params
  );

  const deathsB = dateBetween('date_of_death', start, end);

  return {
    patient_flow: {
      metrics: [
        trendMetric('Admissions', admWeek?.c, admPrev?.c),
        metric('OPD visits', fmtInt(opdWeek?.c), tag),
        metric('Average length of stay', alos?.d != null ? n(alos.d).toFixed(1) + ' days' : '—', 'discharged in period'),
        ...deptDist.map((d) => metric(d.dept, fmtInt(d.c), 'admissions')),
      ],
    },
    hr_staffing: {
      metrics: [
        metric('Active staff', fmtInt(staffActive?.c), 'now'),
        metric('Staff with attendance', attendanceWeek ? fmtInt(attendanceWeek.c) : '—', tag),
        metric('Pending leave requests', leavePending ? fmtInt(leavePending.c) : '—', 'now'),
      ],
    },
    lab_radiology: {
      metrics: [
        metric('Lab tests ordered', fmtInt(labOrdered?.c), tag),
        metric('Lab completed', fmtInt(labDone?.c), tag),
        metric('Lab completion rate', n(labOrdered?.c) ? fmtPct((n(labDone?.c) / n(labOrdered?.c)) * 100) : '—', tag),
        metric('Radiology orders', radWeek ? fmtInt(radWeek.c) : '—', tag),
      ],
    },
    quality_safety: {
      metrics: [
        metric('Deaths', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_ipd_death_registry WHERE ${deathsB.clause}`, deathsB.params))?.c), tag),
        metric('Critical labs', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_lab_result WHERE ${labB.clause} AND (status LIKE '%critical%' OR status LIKE '%urgent%')`, labB.params))?.c), tag),
      ],
    },
    supply_inventory: {
      metrics: [
        metric('SKUs at/below reorder', fmtInt(lowStock?.c), 'now'),
        metric('Inventory items tracked', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_inventory_item`))?.c)),
      ],
    },
    weekly_financial: {
      metrics: [
        metric('Revenue', fmtMoney(revWeek?.s), tag),
        metric('Pending tickets (now)', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_payment_ticket WHERE status='pending'`))?.c)),
      ],
    },
  };
}

async function fetchMonthly(pool, rangeIn) {
  const range = resolveRange(rangeIn, 'monthly');
  const { start, end } = range;
  const tag = periodTag(range);
  const admB = dateBetween('admitted_at', start, end);
  const disB = dateBetween('discharged_at', start, end);
  const visB = dateBetween('visit_date', start, end);
  const txnB = dateBetween('transaction_date', start, end);
  const expB = dateBetween('expense_date', start, end);
  const deathsB = dateBetween('date_of_death', start, end);
  const surgB = dtBetween('completed_at', start, end);

  const admMonth = await q1(pool, `SELECT COUNT(*) AS c FROM tbl_admission WHERE ${admB.clause}`, admB.params);
  const disMonth = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_admission WHERE discharged_at IS NOT NULL AND ${disB.clause}`,
    disB.params
  );
  const opdMonth = await q1(pool, `SELECT COUNT(*) AS c FROM tbl_opd_visit WHERE ${visB.clause}`, visB.params);
  const revMonth = await q1(
    pool,
    `SELECT COALESCE(SUM(amount),0) AS s FROM tbl_transaction WHERE status='completed' AND ${txnB.clause}`,
    txnB.params
  );
  const expMonth = await q1(
    pool,
    `SELECT COALESCE(SUM(amount_xaf),0) AS s, COUNT(*) AS c FROM tbl_expense WHERE ${expB.clause}`,
    expB.params
  ).catch(() => null);
  const deathsMonth = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_death_registry WHERE ${deathsB.clause}`,
    deathsB.params
  );
  const patientsTotal = await q1(pool, `SELECT COUNT(*) AS c FROM tbl_patient WHERE COALESCE(status,1)=1`);

  const topDx = await qAll(
    pool,
    `SELECT COALESCE(admitting_diagnosis, 'Unspecified') AS dx, COUNT(*) AS c
       FROM tbl_admission WHERE ${admB.clause}
       GROUP BY COALESCE(admitting_diagnosis, 'Unspecified')
       ORDER BY c DESC LIMIT 5`,
    admB.params
  ).catch(() => []);

  return {
    clinical_performance: {
      metrics: [
        metric('Deaths', fmtInt(deathsMonth?.c), tag),
        metric('Admissions', fmtInt(admMonth?.c), tag),
        metric('Discharges', fmtInt(disMonth?.c), tag),
        ...topDx.slice(0, 3).map((d, i) => metric(`Top diagnosis #${i + 1}`, (d.dx || '').slice(0, 40), fmtInt(d.c) + ' cases')),
      ],
    },
    dept_activity: {
      metrics: [
        metric('OPD visits', fmtInt(opdMonth?.c), tag),
        metric('Active patients (registry)', fmtInt(patientsTotal?.c), 'now'),
        metric('Surgeries completed', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_ipd_surgery WHERE status='completed' AND ${surgB.clause}`, surgB.params))?.c), tag),
      ],
    },
    pl_summary: {
      metrics: [
        metric('Revenue', fmtMoney(revMonth?.s), tag),
        metric('Expenses', expMonth ? fmtMoney(expMonth.s) : '—', expMonth ? fmtInt(expMonth.c) + ' claims' : 'tbl_expense'),
        metric('Net (revenue − expenses)', expMonth ? fmtMoney(n(revMonth?.s) - n(expMonth?.s)) : fmtMoney(revMonth?.s), tag),
        metric('Inpatients', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_admission a WHERE ${ipdAsOfEnd(end)}`, [end, end]))?.c), `as of ${end}`),
      ],
    },
    patient_satisfaction: {
      metrics: [metric('Patient feedback module', '—', 'Connect CSAT/NPS source to enable')],
    },
    infection_control: {
      metrics: [metric('HAI tracking', '—', 'Connect infection surveillance to enable')],
    },
    assets_maintenance: {
      metrics: [metric('Equipment maintenance', '—', 'Connect CMMS to enable')],
    },
  };
}

async function fetchFinancial(pool, rangeIn) {
  const range = resolveRange(rangeIn, 'financial');
  const { start, end } = range;
  const tag = periodTag(range);
  const txnB = dateBetween('transaction_date', start, end);
  const expB = dateBetween('expense_date', start, end);
  const paidB = dateBetween('paid_at', start, end);
  const labB = dtBetween('created_at', start, end);
  const chargeB = dtBetween('created_at', start, end);

  const revPeriod = await q1(
    pool,
    `SELECT COALESCE(SUM(amount),0) AS s, COUNT(*) AS c FROM tbl_transaction
      WHERE status='completed' AND ${txnB.clause}`,
    txnB.params
  );
  const expPeriod = await q1(
    pool,
    `SELECT COALESCE(SUM(amount_xaf),0) AS s FROM tbl_expense WHERE ${expB.clause}`,
    expB.params
  ).catch(() => null);
  const pendingAr = await q1(
    pool,
    `SELECT COUNT(*) AS c, COALESCE(SUM(total_amount),0) AS s FROM tbl_payment_ticket WHERE status = 'pending'`
  );
  const paidPeriod = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_payment_ticket WHERE status = 'paid' AND ${paidB.clause}`,
    paidB.params
  );

  const byMethod = await qAll(
    pool,
    `SELECT COALESCE(payment_method, 'cash') AS m, COALESCE(SUM(amount),0) AS s
       FROM tbl_transaction WHERE status='completed' AND ${txnB.clause}
       GROUP BY COALESCE(payment_method, 'cash') ORDER BY s DESC LIMIT 5`,
    txnB.params
  ).catch(() => []);

  const unitRevenue = async (sql, params) => {
    const r = await q1(pool, sql, params);
    return r?.s != null ? fmtMoney(r.s) : '—';
  };

  const txnParams = txnB.params;
  const units = {
    pharmacy: {
      metrics: [
        metric('Rx revenue', await unitRevenue(
          `SELECT COALESCE(SUM(t.amount),0) AS s FROM tbl_transaction t
            WHERE t.status='completed' AND ${txnB.clause}
              AND (t.description LIKE '%pharm%' OR t.description LIKE '%drug%' OR t.description LIKE '%rx%')`,
          txnParams
        ), tag),
      ],
    },
    laboratory: {
      metrics: [
        metric('Lab tests', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_lab_result WHERE ${labB.clause}`, labB.params))?.c), tag),
      ],
    },
    radiology: {
      metrics: [
        metric('Imaging orders', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_radiology_order WHERE ${labB.clause}`, labB.params))?.c), tag),
      ],
    },
    theatre: {
      metrics: [
        metric('Surgeries completed', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_ipd_surgery WHERE status='completed' AND ${labB.clause}`, labB.params))?.c), tag),
      ],
    },
    ipd: {
      metrics: [
        metric('IPD charges', await unitRevenue(
          `SELECT COALESCE(SUM(c.amount),0) AS s FROM tbl_ipd_charge c WHERE ${chargeB.clause}`,
          chargeB.params
        ), tag),
      ],
    },
    icu: {
      metrics: [
        metric('ICU inpatients', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_admission a LEFT JOIN tbl_bed b ON b.id=a.bed_id WHERE ${ipdAsOfEnd(end)} AND (b.ward_name LIKE '%ICU%' OR b.ward_name LIKE '%HDU%')`, [end, end]))?.c), `as of ${end}`),
      ],
    },
    dietary: { metrics: [metric('Dietary billing', '—', 'Tag charges in service catalog')] },
    emergency: {
      metrics: [
        metric('A&E visits', fmtInt((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_opd_visit WHERE ${dateBetween('visit_date', start, end).clause} AND (department LIKE '%Emergency%' OR department LIKE '%A&E%')`, [start, end]))?.c), tag),
      ],
    },
  };

  const ipdNowFin = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_admission a WHERE ${ipdAsOfEnd(end)}`,
    [end, end]
  );

  const rowMetricsFor = (freq) => {
    if (freq === 'daily') {
      return [
        metric('Collections', fmtMoney(revPeriod?.s), tag),
        metric('Transactions', fmtInt(revPeriod?.c), tag),
      ];
    }
    if (freq === 'weekly') {
      return [
        metric('Revenue', fmtMoney(revPeriod?.s), tag),
        ...byMethod.map((m) => metric(m.m, fmtMoney(m.s))),
        metric('Outstanding tickets', fmtInt(pendingAr?.c), fmtMoney(pendingAr?.s)),
      ];
    }
    return [
      metric('Revenue', fmtMoney(revPeriod?.s), tag),
      metric('Inpatients', fmtInt(ipdNowFin?.c), `as of ${end}`),
    ];
  };

  return {
    rows: {
      daily_txn: { metrics: rowMetricsFor('daily') },
      daily_expense: {
        metrics: expPeriod
          ? [metric('Expenses', fmtMoney(expPeriod.s), tag)]
          : [metric('Expenses', '—', 'tbl_expense not available')],
      },
      weekly_txn: { metrics: rowMetricsFor('weekly') },
      weekly_procurement: {
        metrics: [
          metric('Paid tickets', fmtInt(paidPeriod?.c), tag),
          metric('Pending PO tracking', '—', 'Use Procurement module'),
        ],
      },
      monthly_pl: { metrics: rowMetricsFor('monthly') },
      monthly_expenses: {
        metrics: [metric('Expenses', expPeriod ? fmtMoney(expPeriod.s) : '—', tag)],
      },
      monthly_ar: {
        metrics: [
          metric('Pending payment tickets', fmtInt(pendingAr?.c), 'now'),
          metric('Outstanding amount', fmtMoney(pendingAr?.s), 'now'),
        ],
      },
    },
    units,
  };
}

async function fetchSectionLive(pool, fid, sectionKey, range) {
  if (sectionKey === 'daily') return fetchDaily(pool, fid, range);
  if (sectionKey === 'weekly') return fetchWeekly(pool, fid, range);
  if (sectionKey === 'monthly') return fetchMonthly(pool, range);
  if (sectionKey === 'financial') return fetchFinancial(pool, range);
  return {};
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ facilityId?: number, periodRange?: object, reportFilter?: { kind: string, id: string, sectionKey: string } }} opts
 */
async function fetchLiveReports(pool, opts = {}) {
  const fid = opts.facilityId ? parseInt(opts.facilityId, 10) : null;
  const periodRange = opts.periodRange || null;
  const filter = opts.reportFilter || null;

  if (filter) {
    const range = periodRange || defaultRangeForSection(filter.sectionKey);
    if (filter.kind === 'row' || filter.kind === 'unit') {
      const financial = await fetchFinancial(pool, range);
      const byFinancialRow = filter.kind === 'row' ? { [filter.id]: financial.rows[filter.id] } : {};
      const byFinancialUnit = filter.kind === 'unit' ? { [filter.id]: financial.units[filter.id] } : {};
      const detailsByReport =
        opts.includeDetails !== false
          ? await fetchReportDetails(pool, {
              facilityId: fid,
              periodRange: range,
              reportFilter: filter,
            })
          : {};
      return {
        generatedAt: new Date().toISOString(),
        periodLabel: range.label || periodTag(range),
        periodRange: range,
        byCard: {},
        byFinancialRow,
        byFinancialUnit,
        detailsByReport,
      };
    }
    const sectionData = await fetchSectionLive(pool, fid, filter.sectionKey, range);
    const detailsByReport =
      opts.includeDetails !== false
        ? await fetchReportDetails(pool, {
            facilityId: fid,
            periodRange: range,
            reportFilter: filter,
          })
        : {};
    return {
      generatedAt: new Date().toISOString(),
      periodLabel: range.label || periodTag(range),
      periodRange: range,
      byCard: sectionData[filter.id] ? { [filter.id]: sectionData[filter.id] } : {},
      byFinancialRow: {},
      byFinancialUnit: {},
      detailsByReport,
    };
  }

  const dailyRange = periodRange || defaultRangeForSection('daily');
  const weeklyRange = periodRange || defaultRangeForSection('weekly');
  const monthlyRange = periodRange || defaultRangeForSection('monthly');
  const financialRange = periodRange || defaultRangeForSection('financial');

  const [daily, weekly, monthly, financial] = await Promise.all([
    fetchDaily(pool, fid, dailyRange),
    fetchWeekly(pool, fid, weeklyRange),
    fetchMonthly(pool, monthlyRange),
    fetchFinancial(pool, financialRange),
  ]);

  const byCard = { ...daily, ...weekly, ...monthly };
  const byFinancialRow = financial.rows;
  const byFinancialUnit = {};
  for (const [id, data] of Object.entries(financial.units)) {
    byFinancialUnit[id] = data;
  }

  const periodLabel = periodRange
    ? periodRange.label || periodTag(periodRange)
    : `Updated ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;

  const sectionRanges = {
    daily: dailyRange,
    weekly: weeklyRange,
    monthly: monthlyRange,
    financial: financialRange,
  };

  const includeDetails = opts.includeDetails !== false;
  let detailsByReport = {};
  if (includeDetails) {
    detailsByReport = await fetchReportDetails(pool, {
      facilityId: fid,
      periodRange,
      reportFilter: filter,
      sectionRanges,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    periodLabel,
    periodRange: periodRange || null,
    byCard,
    byFinancialRow,
    byFinancialUnit,
    detailsByReport,
  };
}

module.exports = { fetchLiveReports, fetchSectionLive };
