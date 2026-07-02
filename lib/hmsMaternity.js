'use strict';

function calculateEDD(lmp) {
  if (!lmp) return null;
  const d = new Date(lmp);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 280);
  return d.toISOString().slice(0, 10);
}

function calculateEGA(lmp, asOf) {
  if (!lmp) return null;
  const end = asOf ? new Date(asOf) : new Date();
  const start = new Date(lmp);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diff = end - start;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24 * 7)));
}

async function generateANCNumber(pool, facilityId) {
  const year = new Date().getFullYear();
  const fid = parseInt(facilityId, 10) || 0;
  const yearClause =
    pool?.driver === 'postgres'
      ? 'EXTRACT(YEAR FROM created_at) = ?'
      : 'YEAR(created_at) = ?';
  let sql = `SELECT COUNT(*) AS c FROM maternity_patients WHERE ${yearClause}`;
  const params = [year];
  if (fid > 0) {
    sql += ' AND (facility_id = ? OR facility_id IS NULL)';
    params.push(fid);
  }
  const [rows] = await pool.query(sql, params);
  const n = (parseInt(rows[0]?.c, 10) || 0) + 1;
  return `ANC-${year}-${String(n).padStart(4, '0')}`;
}

function parseJsonField(val, fallback) {
  if (val == null || val === '') return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (_) {
    return fallback;
  }
}

function stringifyJsonField(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

/** WHO-style simplified risk score from factor codes. */
function scoreRiskFactors(riskFactors, obstetric = {}, medical = {}) {
  let score = 0;
  const factors = Array.isArray(riskFactors) ? riskFactors : [];
  const weights = {
    age_under_18: 8,
    age_over_35: 8,
    grand_multipara: 6,
    previous_cs: 10,
    previous_pph: 12,
    previous_stillbirth: 10,
    hypertension: 10,
    diabetes: 8,
    anemia_severe: 6,
    hiv_positive: 6,
    multiple_pregnancy: 8,
    malpresentation: 6,
    placenta_previa: 12,
    pre_eclampsia: 15,
    no_anc: 5,
  };
  for (const f of factors) {
    const key = String(f.code || f).toLowerCase();
    score += weights[key] || 5;
  }
  if (Number(obstetric.previous_cs) > 0) score += weights.previous_cs;
  if (Number(obstetric.previous_pph) > 0) score += weights.previous_pph;
  if (medical.hypertension) score += weights.hypertension;
  if (medical.diabetes) score += weights.diabetes;
  const risk_level = score >= 20 ? 'high' : score >= 10 ? 'medium' : 'low';
  return { risk_score: score, risk_level };
}

/** Expected cervical dilation on WHO alert line (hours from active phase, simplified). */
function expectedAlertDilation(hoursSinceStart) {
  if (hoursSinceStart < 0) return 0;
  return Math.min(10, Math.floor(hoursSinceStart));
}

function partographLineFlags(laborAdmission, entries, cervicalDilation) {
  if (cervicalDilation == null) return { alert_line_crossed: 0, action_line_crossed: 0 };
  const start = laborAdmission ? new Date(laborAdmission) : new Date();
  const hours = (Date.now() - start.getTime()) / (1000 * 60 * 60);
  const expectedAlert = expectedAlertDilation(hours - 4);
  const expectedAction = expectedAlertDilation(hours - 6);
  const dil = Number(cervicalDilation);
  return {
    alert_line_crossed: dil < expectedAlert && hours >= 4 ? 1 : 0,
    action_line_crossed: dil < expectedAction && hours >= 6 ? 1 : 0,
  };
}

function countRowValue(row) {
  if (!row || typeof row !== 'object') return 0;
  const v = row.c ?? row.C ?? Object.values(row)[0];
  return parseInt(v, 10) || 0;
}

/** Live maternity dashboard KPIs (MySQL + PostgreSQL). */
async function getDashboardStats(pool) {
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  const since30Str = since30.toISOString().slice(0, 10);

  const [[t]] = await pool.query('SELECT COUNT(*) AS c FROM maternity_patients');
  const [[a]] = await pool.query(`SELECT COUNT(*) AS c FROM maternity_patients WHERE status = 'active'`);
  const [[l]] = await pool.query(`SELECT COUNT(*) AS c FROM labor_records WHERE status = 'in_labor'`);
  const [[d]] = await pool.query(
    `SELECT COUNT(*) AS c FROM delivery_records WHERE DATE(delivery_date_time) = CURDATE()`
  );
  const [[h]] = await pool.query(
    `SELECT COUNT(*) AS c FROM maternity_patients WHERE risk_level = 'high' AND status = 'active'`
  );
  const [types] = await pool.query(
    `SELECT delivery_type, COUNT(*) AS count FROM delivery_records
     WHERE delivery_date_time >= ? GROUP BY delivery_type`,
    [since30Str]
  );
  const [[c]] = await pool.query(
    `SELECT COUNT(*) AS c FROM maternal_complications WHERE complication_date >= ?`,
    [since30Str]
  );
  return {
    total_registered: countRowValue(t),
    active_anc: countRowValue(a),
    currently_in_labor: countRowValue(l),
    deliveries_today: countRowValue(d),
    high_risk_patients: countRowValue(h),
    delivery_types_last_30_days: types || [],
    complications_last_30_days: countRowValue(c),
  };
}

/** Deliveries on a calendar day (facility local date string YYYY-MM-DD). */
async function listDeliveriesForDate(pool, dateStr) {
  const day =
    String(dateStr || '')
      .trim()
      .slice(0, 10) || new Date().toISOString().slice(0, 10);
  const [rows] = await pool.query(
    `SELECT dr.id, dr.delivery_date_time, dr.delivery_type, dr.outcome, dr.blood_loss_estimated,
            dr.labor_record_id, mp.id AS maternity_patient_id, mp.antenatal_number,
            p.first_name, p.last_name, p.phone,
            (SELECT COUNT(*) FROM newborn_records nb WHERE nb.delivery_record_id = dr.id) AS newborn_count
       FROM delivery_records dr
       JOIN maternity_patients mp ON mp.id = dr.maternity_patient_id
       JOIN tbl_patient p ON p.id = mp.patient_id
      WHERE DATE(dr.delivery_date_time) = ?
      ORDER BY dr.delivery_date_time DESC, dr.id DESC`,
    [day]
  );
  return { date: day, rows: rows || [] };
}

module.exports = {
  calculateEDD,
  calculateEGA,
  generateANCNumber,
  parseJsonField,
  stringifyJsonField,
  scoreRiskFactors,
  partographLineFlags,
  getDashboardStats,
  listDeliveriesForDate,
};
