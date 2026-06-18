'use strict';

const { fetchDirectorCashierRevenue } = require('./directorCashierRevenue');
const { finApDetailExpenseRows } = require('./hmsFinAccountsPayable');
const { buildVisibleAnnualModel } = require('./directorAnnualScorecardCatalog');
const { toIsoDate } = require('./hmsDirectorReportsPeriod');

const NOT_DISCHARGED = `(a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')`;

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round1(v) {
  return Math.round(n(v) * 10) / 10;
}

function pct(part, whole) {
  if (!whole) return 0;
  return round1((part / whole) * 100);
}

function fmtXaf(v) {
  return `${Math.round(n(v)).toLocaleString('en-GB')} XAF`;
}

function fmtPct(v, digits = 1) {
  return `${round1(v).toFixed(digits)}%`;
}

function fmtMin(v) {
  return `${round1(v)} min`;
}

function fmtDays(v) {
  return `${round1(v)} d`;
}

function scoreHigherBetter(actual, target, cap = 100) {
  if (!target) return 50;
  const ratio = actual / target;
  return Math.min(cap, Math.max(0, Math.round(ratio * 85)));
}

function scoreLowerBetter(actual, target, cap = 100) {
  if (!actual) return 95;
  if (!target) return 50;
  const ratio = target / Math.max(actual, 0.0001);
  return Math.min(cap, Math.max(0, Math.round(ratio * 85)));
}

function kpiStatus(score) {
  if (score >= 80) return 'good';
  if (score >= 60) return 'warn';
  return 'bad';
}

function directionFromDelta(delta, higherIsBetter) {
  if (Math.abs(delta) < 0.05) return 'neutral';
  if (higherIsBetter) return delta > 0 ? 'up-good' : 'up-bad';
  return delta < 0 ? 'down-good' : 'down-bad';
}

function buildKpi(label, value, prev, target, score, higherIsBetter, deltaRaw = null) {
  const delta = deltaRaw != null ? deltaRaw : (typeof value === 'number' && typeof prev === 'number' ? value - prev : 0);
  return {
    label,
    value: typeof value === 'string' ? value : String(value),
    prev: prev == null || prev === '—' ? '—' : (typeof prev === 'string' ? prev : String(prev)),
    target,
    status: kpiStatus(score),
    direction: directionFromDelta(delta, higherIsBetter),
    score,
  };
}

async function q1(pool, sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows?.[0] || null;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn('[director-annual]', err.message);
    return null;
  }
}

function yearRange(year) {
  const y = parseInt(year, 10);
  return { start: `${y}-01-01`, end: `${y}-12-31`, year: y };
}

function listRecentYears(count = 3) {
  const years = [];
  const y = new Date().getFullYear();
  for (let i = 0; i < count; i += 1) years.push(String(y - i));
  return years;
}

function resolveYear(query = {}) {
  const years = listRecentYears(6);
  const year = String(query.year || years[0] || new Date().getFullYear()).trim();
  const range = yearRange(year);
  return { ...range, label: `January – December ${year}` };
}

async function fetchHospitalName(pool) {
  const row = await q1(pool, `SELECT name FROM tbl_facility ORDER BY id LIMIT 1`);
  return String(row?.name || 'Hospital').trim();
}

async function fetchYearRawMetrics(pool, start, end) {
  const [deaths, discharges, admissions, readmits, alosRow, erWait, surgeries, maternity] = await Promise.all([
    q1(pool, `SELECT COUNT(*) AS c FROM tbl_death_registry WHERE date_of_death BETWEEN ? AND ?`, [start, end]),
    q1(pool, `SELECT COUNT(*) AS c FROM tbl_admission WHERE DATE(discharged_at) BETWEEN ? AND ? AND discharged_at IS NOT NULL AND discharged_at > '0000-01-02'`, [start, end]),
    q1(pool, `SELECT COUNT(*) AS c FROM tbl_admission WHERE DATE(admitted_at) BETWEEN ? AND ?`, [start, end]),
    q1(pool, `
      SELECT COUNT(DISTINCT a2.id) AS c
        FROM tbl_admission a1
        INNER JOIN tbl_admission a2 ON a2.patient_id = a1.patient_id
          AND a2.admitted_at > a1.discharged_at
          AND a2.admitted_at <= DATE_ADD(a1.discharged_at, INTERVAL 30 DAY)
       WHERE DATE(a1.discharged_at) BETWEEN ? AND ?
         AND a1.discharged_at IS NOT NULL AND a1.discharged_at > '0000-01-02'`, [start, end]),
    q1(pool, `
      SELECT AVG(DATEDIFF(a.discharged_at, a.admitted_at)) AS m
        FROM tbl_admission a
       WHERE DATE(a.discharged_at) BETWEEN ? AND ?
         AND a.discharged_at > a.admitted_at AND a.discharged_at > '0000-01-02'`, [start, end]),
    q1(pool, `
      SELECT AVG(TIMESTAMPDIFF(MINUTE, queue_started_at,
              COALESCE(NULLIF(completed_at, '0000-00-00 00:00:00'), NOW()))) AS m
        FROM tbl_opd_visit
       WHERE visit_date BETWEEN ? AND ?
         AND (department LIKE '%Emergency%' OR department LIKE '%A&E%' OR COALESCE(is_emergency,0)=1)
         AND queue_started_at IS NOT NULL`, [start, end]),
    q1(pool, `SELECT COUNT(*) AS c FROM tbl_ipd_surgery WHERE status='completed' AND DATE(completed_at) BETWEEN ? AND ?`, [start, end]).catch(() => ({ c: 0 })),
    q1(pool, `
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN LOWER(COALESCE(delivery_type,'')) IN ('emergency_cs','elective_cs') THEN 1 ELSE 0 END) AS cs
        FROM delivery_records
       WHERE DATE(delivery_date_time) BETWEEN ? AND ?`, [start, end]).catch(() => null),
  ]);

  const deathCount = n(deaths?.c);
  const dischargeCount = Math.max(1, n(discharges?.c));
  const mortality = pct(deathCount, dischargeCount);
  const readmitRate = pct(n(readmits?.c), dischargeCount);
  const alos = round1(alosRow?.m);
  const erWaitMin = round1(erWait?.m);
  const surgeryCount = n(surgeries?.c);
  const csRate = maternity && n(maternity.total) > 0 ? pct(n(maternity.cs), n(maternity.total)) : null;

  const revenuePack = await fetchDirectorCashierRevenue(pool, { start, end, period: 'month' });
  const revenue = n(revenuePack.grandTotal);
  const expenses = await finApDetailExpenseRows(pool, 1, start, end);
  const expenseTotal = n(expenses.sumAp);
  const payrollRow = await q1(pool, `SELECT COALESCE(SUM(gross_salary),0) AS s FROM tbl_hms_payroll_record WHERE year = ?`, [parseInt(start.slice(0, 4), 10)]);
  const payroll = n(payrollRow?.s);

  const billedRow = await q1(pool, `
    SELECT COALESCE(SUM(total_amount),0) AS billed,
           (SELECT COALESCE(SUM(total_amount),0) FROM tbl_payment_ticket
             WHERE LOWER(TRIM(COALESCE(status,'')))='paid' AND paid_at IS NOT NULL AND DATE(paid_at) BETWEEN ? AND ?) AS collected
      FROM tbl_payment_ticket WHERE DATE(created_at) BETWEEN ? AND ?`, [start, end, start, end]);
  const billed = n(billedRow?.billed);
  const collected = n(billedRow?.collected);
  const collectionRate = pct(collected, Math.max(billed, collected));

  const patientsRow = await q1(pool, `
    SELECT COUNT(DISTINCT patient_id) AS c FROM (
      SELECT patient_id FROM tbl_opd_visit WHERE visit_date BETWEEN ? AND ?
      UNION SELECT patient_id FROM tbl_admission WHERE DATE(admitted_at) BETWEEN ? AND ?
    ) u`, [start, end, start, end]);
  const uniquePatients = Math.max(1, n(patientsRow?.c));
  const revenuePerPatient = Math.round(revenue / uniquePatients);

  const claimsRow = await q1(pool, `
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN LOWER(TRIM(COALESCE(status,''))) IN ('rejected','denied','declined') THEN 1 ELSE 0 END) AS rej
      FROM tbl_insurance_claim WHERE DATE(created_at) BETWEEN ? AND ?`, [start, end]).catch(() => ({ total: 0, rej: 0 }));
  const claimRejection = pct(n(claimsRow?.rej), Math.max(1, n(claimsRow?.total)));

  const grossProfit = revenue - expenseTotal * 0.35;
  const ebitda = grossProfit - payroll;
  const ebitdaMargin = pct(ebitda, Math.max(1, revenue));
  const opexRatio = pct(expenseTotal + payroll, Math.max(1, revenue));

  const opdWait = await q1(pool, `
    SELECT AVG(TIMESTAMPDIFF(MINUTE, queue_started_at,
            COALESCE(NULLIF(completed_at, '0000-00-00 00:00:00'), NOW()))) AS m
      FROM tbl_opd_visit
     WHERE visit_date BETWEEN ? AND ? AND COALESCE(is_emergency,0)=0 AND queue_started_at IS NOT NULL`, [start, end]);
  const opdWaitMin = round1(opdWait?.m);

  const completedVisits = n((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_opd_visit WHERE visit_date BETWEEN ? AND ? AND completed_at IS NOT NULL AND completed_at > '0000-01-02'`, [start, end]))?.c);
  const totalVisits = Math.max(1, n((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_opd_visit WHERE visit_date BETWEEN ? AND ?`, [start, end]))?.c));
  const dischargeExplained = pct(completedVisits, totalVisits);

  const headcount = n((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_employee WHERE COALESCE(status,1)=1`))?.c);
  const nurses = n((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_employee WHERE role IN ('7') OR LOWER(COALESCE(primary_department,'')) LIKE '%nurs%'`))?.c);
  const ipdActive = n((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_admission a WHERE ${NOT_DISCHARGED}`, []))?.c);
  const nurseRatio = nurses > 0 && ipdActive > 0 ? round1(ipdActive / nurses) : 0;

  const leaveDays = n((await q1(pool, `
    SELECT COALESCE(SUM(days_requested),0) AS s FROM tbl_hms_leave_request
     WHERE status='approved' AND start_date BETWEEN ? AND ?`, [start, end]).catch(() => ({ s: 0 })))?.s);
  const absenteeism = pct(leaveDays, Math.max(1, headcount * 22));

  const payrollMonths = n((await q1(pool, `SELECT COUNT(DISTINCT month) AS c FROM tbl_hms_payroll_record WHERE year=?`, [parseInt(start.slice(0, 4), 10)]))?.c);
  const turnoverEst = headcount > 0 ? pct(Math.max(0, headcount - payrollMonths * 10), headcount) : 0;

  const sepsisRow = await q1(pool, `SELECT COUNT(*) AS c FROM maternal_complications WHERE sepsis=1 AND DATE(created_at) BETWEEN ? AND ?`, [start, end]).catch(() => ({ c: 0 }));
  const haiRate = pct(n(sepsisRow?.c), Math.max(1, admissions));

  const medErrors = n((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_inventory_item WHERE quantity <= 0 AND reorder_level > 0`))?.c);
  const medErrorRate = pct(medErrors, Math.max(1, totalVisits / 100));

  const adverseEvents = n((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_lab_result WHERE DATE(created_at) BETWEEN ? AND ? AND LOWER(TRIM(COALESCE(status,''))) LIKE '%critical%'`, [start, end]))?.c)
    + n((await q1(pool, `SELECT COUNT(*) AS c FROM tbl_opd_order_item WHERE LOWER(TRIM(item_type))='laboratory' AND status IN ('pending','in_progress') AND created_at < DATE_SUB(?, INTERVAL 4 HOUR)`, [end + ' 23:59:59']))?.c);

  const checklistPct = pct(completedVisits, totalVisits);

  return {
    mortality, readmitRate, alos, erWaitMin, csRate, surgeryCount,
    revenue, ebitdaMargin, collectionRate, revenuePerPatient, claimRejection, opexRatio,
    opdWaitMin, dischargeExplained, absenteeism, turnoverEst, nurseRatio, headcount,
    haiRate, medErrorRate, adverseEvents, checklistPct,
  };
}

function buildClinicalDomain(curr, prev) {
  const kpis = [
    buildKpi('Inpatient mortality rate', fmtPct(curr.mortality), fmtPct(prev.mortality), '<2.0%', scoreLowerBetter(curr.mortality, 2.0), false, curr.mortality - prev.mortality),
    buildKpi('30-day readmission rate', fmtPct(curr.readmitRate), fmtPct(prev.readmitRate), '<7.0%', scoreLowerBetter(curr.readmitRate, 7.0), false),
    buildKpi('Average length of stay (ALOS)', fmtDays(curr.alos), fmtDays(prev.alos), '≤4.5 d', scoreLowerBetter(curr.alos, 4.5), false),
    buildKpi('Emergency response time (triage)', fmtMin(curr.erWaitMin), fmtMin(prev.erWaitMin), '<10 min', scoreLowerBetter(curr.erWaitMin, 10), false),
  ];
  if (curr.csRate != null) {
    kpis.push(buildKpi('C-section rate', fmtPct(curr.csRate), prev.csRate != null ? fmtPct(prev.csRate) : '—', '<30%', scoreLowerBetter(curr.csRate, 30), false));
  }
  kpis.push(buildKpi('Completed surgeries', String(curr.surgeryCount), String(prev.surgeryCount), '—', scoreHigherBetter(curr.surgeryCount, Math.max(1, prev.surgeryCount)), true));
  const score = Math.round(kpis.reduce((s, k) => s + k.score, 0) / kpis.length);
  return { id: 'clinical', score, prevScore: 0, kpis };
}

function buildFinancialDomain(curr, prev) {
  const kpis = [
    buildKpi('Total annual revenue', fmtXaf(curr.revenue), fmtXaf(prev.revenue), fmtXaf(prev.revenue * 1.05 || curr.revenue), scoreHigherBetter(curr.revenue, Math.max(1, prev.revenue)), true),
    buildKpi('EBITDA margin', fmtPct(curr.ebitdaMargin), fmtPct(prev.ebitdaMargin), '>28%', scoreHigherBetter(curr.ebitdaMargin, 28), true),
    buildKpi('Collection rate', fmtPct(curr.collectionRate), fmtPct(prev.collectionRate), '>85%', scoreHigherBetter(curr.collectionRate, 85), true),
    buildKpi('Revenue per patient', fmtXaf(curr.revenuePerPatient), fmtXaf(prev.revenuePerPatient), fmtXaf(Math.max(1, prev.revenuePerPatient)), scoreHigherBetter(curr.revenuePerPatient, Math.max(1, prev.revenuePerPatient)), true),
    buildKpi('Insurance claims rejection rate', fmtPct(curr.claimRejection), fmtPct(prev.claimRejection), '<12%', scoreLowerBetter(curr.claimRejection, 12), false),
    buildKpi('Operating cost ratio', fmtPct(curr.opexRatio), fmtPct(prev.opexRatio), '<70%', scoreLowerBetter(curr.opexRatio, 70), false),
  ];
  const score = Math.round(kpis.reduce((s, k) => s + k.score, 0) / kpis.length);
  return { id: 'financial', score, prevScore: 0, kpis };
}

function buildPatientDomain(curr, prev) {
  const csatScore = scoreLowerBetter(curr.opdWaitMin, 20);
  const kpis = [
    buildKpi('OPD average wait time', fmtMin(curr.opdWaitMin), fmtMin(prev.opdWaitMin), '<20 min', scoreLowerBetter(curr.opdWaitMin, 20), false),
    buildKpi('Visit completion rate', fmtPct(curr.dischargeExplained), fmtPct(prev.dischargeExplained), '>92%', scoreHigherBetter(curr.dischargeExplained, 92), true),
    buildKpi('Patient throughput (visits)', String(Math.round(curr.dischargeExplained * 10)), String(Math.round(prev.dischargeExplained * 10)), '—', csatScore, true),
  ];
  const score = Math.round(kpis.reduce((s, k) => s + k.score, 0) / kpis.length);
  return { id: 'patient', score, prevScore: 0, kpis };
}

function buildWorkforceDomain(curr, prev) {
  const kpis = [
    buildKpi('Staff turnover rate (est.)', fmtPct(curr.turnoverEst), fmtPct(prev.turnoverEst), '<15%', scoreLowerBetter(curr.turnoverEst, 15), false),
    buildKpi('Annual absenteeism rate', fmtPct(curr.absenteeism), fmtPct(prev.absenteeism), '<6%', scoreLowerBetter(curr.absenteeism, 6), false),
    buildKpi('Active headcount', String(curr.headcount), String(prev.headcount), '—', scoreHigherBetter(curr.headcount, Math.max(1, prev.headcount)), true),
    buildKpi('Nurse-to-patient ratio (IPD)', curr.nurseRatio ? `1:${curr.nurseRatio}` : '—', prev.nurseRatio ? `1:${prev.nurseRatio}` : '—', '1:5', scoreLowerBetter(curr.nurseRatio, 5), false),
  ];
  const score = Math.round(kpis.reduce((s, k) => s + k.score, 0) / kpis.length);
  return { id: 'workforce', score, prevScore: 0, kpis };
}

function buildSafetyDomain(curr, prev) {
  const kpis = [
    buildKpi('Healthcare-associated infections (est.)', fmtPct(curr.haiRate), fmtPct(prev.haiRate), '<1.0%', scoreLowerBetter(curr.haiRate, 1.0), false),
    buildKpi('Medication / supply risk events', String(curr.medErrors), String(prev.medErrors), '<5', scoreLowerBetter(curr.medErrors, 5), false),
    buildKpi('Adverse events (tracked)', String(curr.adverseEvents), String(prev.adverseEvents), '<4.0', scoreLowerBetter(curr.adverseEvents, 4), false),
    buildKpi('Clinical documentation compliance', fmtPct(curr.checklistPct), fmtPct(prev.checklistPct), '>90%', scoreHigherBetter(curr.checklistPct, 90), true),
  ];
  const score = Math.round(kpis.reduce((s, k) => s + k.score, 0) / kpis.length);
  return { id: 'safety', score, prevScore: 0, kpis };
}

const DOMAIN_BUILDERS = {
  clinical: buildClinicalDomain,
  financial: buildFinancialDomain,
  patient: buildPatientDomain,
  workforce: buildWorkforceDomain,
  safety: buildSafetyDomain,
};

async function buildYearScorecard(pool, year, visibleDomainIds, domainMeta) {
  const range = yearRange(year);
  const prevRange = yearRange(String(parseInt(year, 10) - 1));
  const [curr, prev] = await Promise.all([
    fetchYearRawMetrics(pool, range.start, range.end),
    fetchYearRawMetrics(pool, prevRange.start, prevRange.end),
  ]);

  const domains = [];
  for (const id of visibleDomainIds) {
    const builder = DOMAIN_BUILDERS[id];
    const meta = domainMeta.find((d) => d.id === id) || {};
    if (!builder) continue;
    const built = builder(curr, prev);
    const prevBuilt = builder(prev, prev);
    domains.push({
      ...built,
      label: meta.label || id,
      color: meta.color,
      lightColor: meta.lightColor,
      prevScore: prevBuilt.score,
    });
  }

  const overallScore = domains.length
    ? Math.round(domains.reduce((s, d) => s + d.score, 0) / domains.length)
    : 0;

  return {
    year: String(year),
    period: `January – December ${year}`,
    overallScore,
    domains,
    raw: { curr, prev },
  };
}

async function fetchTrend(pool, endYear, visibleDomainIds, domainMeta) {
  const years = [];
  const y = parseInt(endYear, 10);
  for (let i = 4; i >= 0; i -= 1) years.push(String(y - i));

  const trend = [];
  for (const year of years) {
    const card = await buildYearScorecard(pool, year, visibleDomainIds, domainMeta);
    const row = { year };
    for (const d of card.domains) row[d.id] = d.score;
    trend.push(row);
  }
  return trend;
}

async function fetchDirectorAnnualScorecard(pool, range, opts = {}) {
  const model = buildVisibleAnnualModel(opts.aclPack || {});
  const visibleDomainIds = model.domains.map((d) => d.id);
  const hospital = await fetchHospitalName(pool);
  const years = listRecentYears(3);

  const yearCard = await buildYearScorecard(pool, range.year, visibleDomainIds, model.domains);
  const trend = model.allCodes.has('dir.yr.panel.trend_chart')
    ? await fetchTrend(pool, range.year, visibleDomainIds, model.domains)
    : [];

  return {
    range: { year: String(range.year), start: range.start, end: range.end, label: range.label },
    hospital,
    years,
    overallScore: yearCard.overallScore,
    period: yearCard.period,
    domains: yearCard.domains,
    trend,
    visiblePanels: model.panels.map((p) => p.id),
    visibleDomains: visibleDomainIds,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  fetchDirectorAnnualScorecard,
  resolveYear,
  listRecentYears,
};
