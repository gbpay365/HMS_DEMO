'use strict';

/** True when a DATETIME column is NULL or a legacy zero date (no zero literals — strict-mode safe). */
function isZeroOrNullDateSql(col) {
  return `(${col} IS NULL OR DATE_FORMAT(${col}, '%Y') = '0000')`;
}

/** Normalize legacy zero dates to NULL in SELECT/ORDER (strict-mode safe). */
function safeDateTimeSql(col) {
  return `IF(${isZeroOrNullDateSql(col)}, NULL, ${col})`;
}

const NOT_DISCHARGED = isZeroOrNullDateSql('a.discharged_at');
const IS_DISCHARGED = `(a.discharged_at IS NOT NULL AND DATE_FORMAT(a.discharged_at, '%Y') <> '0000')`;
const ORDER_ADMISSION_RECENT = `COALESCE(${safeDateTimeSql('a.discharged_at')}, ${safeDateTimeSql('a.admitted_at')}) DESC, a.id DESC`;

async function ensureAdmissionChecklists(pool, admissionId) {
  const [tpls] = await pool.query(
    'SELECT id FROM tbl_ipd_checklist_template WHERE active=1'
  );
  for (const t of tpls || []) {
    await pool.query(
      `INSERT IGNORE INTO tbl_ipd_admission_checklist (admission_id, template_id) VALUES (?,?)`,
      [admissionId, t.id]
    );
  }
}

async function getChecklistProgress(pool, admissionId) {
  const [rows] = await pool.query(
    `SELECT t.id AS template_id, t.checklist_type, t.label, t.sort_order, c.completed_at, c.completed_by
     FROM tbl_ipd_checklist_template t
     LEFT JOIN tbl_ipd_admission_checklist c
       ON c.template_id = t.id AND c.admission_id = ?
     WHERE t.active = 1
     ORDER BY t.checklist_type, t.sort_order, t.id`,
    [admissionId]
  );
  const byType = { admission: [], pre_ward: [], pre_op: [] };
  let done = 0;
  let total = 0;
  for (const r of rows || []) {
    total++;
    if (r.completed_at) done++;
    const bucket = byType[r.checklist_type] || byType.admission;
    bucket.push(r);
  }
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { rows: rows || [], byType, done, total, pct };
}

async function getInvoiceForecast(pool, admissionId) {
  const safeAdm = safeDateTimeSql('a.admitted_at');
  const [[adm]] = await pool.query(
    `SELECT a.id, a.deposit_amount, a.running_bill, ${safeAdm} AS admitted_at,
            DATEDIFF(CURDATE(), DATE(${safeAdm})) AS los_days
     FROM tbl_admission a WHERE a.id=? LIMIT 1`,
    [admissionId]
  );
  if (!adm) return null;
  const [charges] = await pool.query(
    `SELECT charge_type, description, amount FROM tbl_ipd_charge WHERE admission_id=? ORDER BY id`,
    [admissionId]
  );
  const lines = (charges || []).map((c) => ({
    type: c.charge_type,
    description: c.description,
    amount: Number(c.amount) || 0,
  }));
  const chargesTotal = lines.reduce((s, l) => s + l.amount, 0);
  const running = Number(adm.running_bill) || chargesTotal;
  const deposit = Number(adm.deposit_amount) || 0;
  const balanceDue = Math.max(0, running - deposit);
  return {
    los_days: adm.los_days || 0,
    lines,
    charges_total: chargesTotal,
    running_bill: running,
    deposit,
    balance_due: balanceDue,
    forecast_total: running,
  };
}

async function loadAdmissionDetail(pool, admissionId) {
  const [[adm]] = await pool.query(
    `SELECT a.*, p.first_name, p.last_name, p.phone, p.dob,
            b.ward_name, b.bed_label,
            doc.first_name AS doc_fn, doc.last_name AS doc_ln,
            surg.first_name AS surg_fn, surg.last_name AS surg_ln,
            nur.first_name AS nur_fn, nur.last_name AS nur_ln,
            cp.name AS care_plan_name
     FROM tbl_admission a
     JOIN tbl_patient p ON p.id = a.patient_id
     LEFT JOIN tbl_bed b ON b.id = a.bed_id
     LEFT JOIN tbl_employee doc ON doc.id = a.admitting_doctor_id
     LEFT JOIN tbl_employee surg ON surg.id = a.primary_surgeon_id
     LEFT JOIN tbl_employee nur ON nur.id = a.primary_nurse_id
     LEFT JOIN tbl_ipd_care_plan_template cp ON cp.id = a.care_plan_template_id
     WHERE a.id = ? LIMIT 1`,
    [admissionId]
  );
  return adm || null;
}

module.exports = {
  NOT_DISCHARGED,
  IS_DISCHARGED,
  safeDateTimeSql,
  ORDER_ADMISSION_RECENT,
  ensureAdmissionChecklists,
  getChecklistProgress,
  getInvoiceForecast,
  loadAdmissionDetail,
};
