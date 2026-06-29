'use strict';

const { getTestById, getAllTests } = require('./labTestTemplates');

const PIPELINE_STAGES = [
  'bill_paid',
  'processing',
  'retest',
  'completed',
  'verified',
  'approved',
  'printed',
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function pipelineLabel(stage) {
  const map = {
    bill_paid: 'Bill paid',
    processing: 'Processing',
    retest: 'Re-test',
    completed: 'Completed',
    verified: 'Verified',
    approved: 'Approved',
    printed: 'Printed',
    dispatched: 'Dispatched',
  };
  return map[stage] || stage;
}

function overallStatusFromCounts(c) {
  if ((c.printed || 0) > 0 && c.printed >= c.total) return 'Completed';
  if ((c.approved || 0) > 0) return 'Partially completed';
  if ((c.processing || 0) > 0 || (c.completed || 0) > 0) return 'Pending';
  return 'Pending';
}

function derivePipelineStage(row) {
  const st = String(row.status || '').toLowerCase();
  if (row.printed_at) return 'printed';
  if (row.approved_at) return 'approved';
  if (row.verified_at) return 'verified';
  if (st === 'received' || row.pipeline_stage === 'completed') return 'completed';
  if ((row.retest_count || 0) > 0 || row.revision_pending) return 'retest';
  if (st === 'in_progress' || row.sample_collected) return 'processing';
  return 'bill_paid';
}

async function hasPhaseColumns(pool) {
  try {
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name='tbl_lab_result' AND column_name='pipeline_stage'`
    );
    return Number(r?.c || 0) > 0;
  } catch (_) {
    return false;
  }
}

async function syncPipelineStage(pool, labResultId) {
  if (!(await hasPhaseColumns(pool))) return;
  const id = parseInt(labResultId, 10) || 0;
  if (id < 1) return;
  const [[row]] = await pool.query(
    `SELECT lr.*,
            (SELECT COUNT(*) FROM tbl_lab_sample s
             JOIN tbl_lab_request_line l ON l.id=s.request_line_id
             WHERE l.lab_result_id=lr.id AND s.status IN ('collected','examined')) AS sample_collected
     FROM tbl_lab_result lr WHERE lr.id=? LIMIT 1`,
    [id]
  );
  if (!row) return;
  const stage = derivePipelineStage(row);
  await pool.query('UPDATE tbl_lab_result SET pipeline_stage=? WHERE id=?', [stage, id]);
}

function evaluateStructuredResult(report) {
  let isAbnormal = false;
  let isCritical = false;
  const flags = [];
  const testId = report?.testId;
  const tpl = testId ? getTestById(testId) : null;
  const fieldMap = new Map((tpl?.fields || []).map((f) => [f.key, f]));

  for (const r of report?.results || []) {
    const key = String(r.key || r.fieldKey || '').trim();
    const val = parseFloat(String(r.value ?? '').replace(/,/g, ''));
    if (!key || Number.isNaN(val)) continue;
    const f = fieldMap.get(key) || r;
    const min = f.normalMin ?? r.normalMin;
    const max = f.normalMax ?? r.normalMax;
    if (min == null || max == null) continue;
    if (val < min || val > max) {
      isAbnormal = true;
      flags.push({ key, level: 'abnormal', value: val, min, max });
      const span = max - min || 1;
      if (val < min - span * 0.5 || val > max + span * 0.5) {
        isCritical = true;
        flags[flags.length - 1].level = 'critical';
      }
    }
  }
  if (report?.criticalManual) isCritical = true;
  return { isAbnormal, isCritical, flags };
}

async function priorFieldValue(pool, patientId, testId, fieldKey, excludeResultId = 0) {
  const pid = parseInt(patientId, 10) || 0;
  if (pid < 1 || !testId || !fieldKey) return null;
  const [rows] = await pool.query(
    `SELECT id, structured_result, created_at FROM tbl_lab_result
     WHERE patient_id=? AND status='received' AND id<>?
     ORDER BY created_at DESC LIMIT 30`,
    [pid, parseInt(excludeResultId, 10) || 0]
  );
  for (const row of rows || []) {
    if (!row.structured_result) continue;
    try {
      const s = JSON.parse(row.structured_result);
      if (String(s.testId || '') !== String(testId)) continue;
      const hit = (s.results || []).find((x) => String(x.key || x.fieldKey) === String(fieldKey));
      if (hit && hit.value != null && String(hit.value).trim() !== '') {
        return { value: parseFloat(String(hit.value).replace(/,/g, '')), resultId: row.id, date: row.created_at };
      }
    } catch (_) {
      /* skip */
    }
  }
  return null;
}

async function computeDeltaCheck(pool, { patientId, testId, fieldKey, value, excludeResultId, thresholdPct = 15 }) {
  const val = parseFloat(value);
  if (Number.isNaN(val)) return { hasDelta: false };
  const prior = await priorFieldValue(pool, patientId, testId, fieldKey, excludeResultId);
  if (!prior || Number.isNaN(prior.value)) return { hasDelta: false, prior: null };
  const diff = Math.abs(val - prior.value);
  const base = Math.abs(prior.value) || 1;
  const pct = (diff / base) * 100;
  return {
    hasDelta: pct >= thresholdPct,
    priorValue: prior.value,
    priorDate: prior.date,
    deltaPct: Math.round(pct * 10) / 10,
    currentValue: val,
  };
}

function nextBarcode(prefix = 'SMP') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function baseResultSelect(pool) {
  const phase = await hasPhaseColumns(pool);
  const extra = phase
    ? `lr.pipeline_stage, lr.is_emergency, lr.is_abnormal, lr.is_critical,
       lr.verified_at, lr.approved_at, lr.printed_at, lr.dispatch_status, lr.retest_count,`
    : '';
  return `
    SELECT lr.id AS lab_result_id, lr.patient_id, lr.test_name, lr.status, lr.created_at, lr.appointment_date,
           lr.opd_order_item_id, lr.template_test_id, lr.referred_by_id, lr.revision_pending,
           ${extra}
           p.first_name, p.last_name, p.phone, p.gender, p.date_of_birth,
           r.id AS request_id, r.request_no, r.priority, r.visit_type, r.created_at AS request_created_at,
           ref.name AS referrer_name, cp.name AS credit_provider_name,
           oi.service_code, oi.status AS order_status,
           l.line_status, l.id AS request_line_id,
           c.name AS catalog_name, c.department_id,
           d.code AS dept_code, d.name AS dept_name
    FROM tbl_lab_result lr
    JOIN tbl_patient p ON p.id = lr.patient_id
    LEFT JOIN tbl_lab_request_line l ON l.lab_result_id = lr.id
    LEFT JOIN tbl_lab_request r ON r.id = l.request_id
    LEFT JOIN tbl_lab_referrer ref ON ref.id = COALESCE(lr.referrer_id, r.referrer_id)
    LEFT JOIN tbl_lab_credit_provider cp ON cp.id = COALESCE(lr.credit_provider_id, r.credit_provider_id)
    LEFT JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
    LEFT JOIN tbl_lab_catalog c ON c.id = l.catalog_id
    LEFT JOIN tbl_lab_department d ON d.id = c.department_id
  `;
}

async function listInvestigationOrders(pool, opts = {}) {
  const date = opts.date || todayIso();
  const q = String(opts.q || '').trim();
  const params = [date];
  let where = 'DATE(COALESCE(r.created_at, lr.created_at)) = ?';
  if (q) {
    where += ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR r.request_no LIKE ? OR lr.test_name LIKE ? OR oi.service_code LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  const sql = `
    SELECT order_key, MAX(order_date) AS order_date, MAX(patient_label) AS patient_label,
           MAX(referred_by) AS referred_by, MAX(provider_name) AS provider_name,
           SUM(bill_paid) AS bill_paid, SUM(processing) AS processing, SUM(retest) AS retest,
           SUM(completed) AS completed, SUM(verified) AS verified, SUM(approved) AS approved,
           SUM(printed) AS printed, COUNT(*) AS total
    FROM (
      SELECT COALESCE(r.request_no, CONCAT('LR-', lr.id)) AS order_key,
             COALESCE(r.created_at, lr.created_at) AS order_date,
             CONCAT(p.first_name, ' ', p.last_name) AS patient_label,
             COALESCE(ref.name, '') AS referred_by,
             COALESCE(cp.name, 'Walk-in') AS provider_name,
             CASE WHEN lr.status IN ('pending') AND (oi.status IS NULL OR oi.status='paid') THEN 1 ELSE 0 END AS bill_paid,
             CASE WHEN lr.status='in_progress' OR l.line_status='sample_collected' THEN 1 ELSE 0 END AS processing,
             CASE WHEN COALESCE(lr.retest_count,0)>0 OR lr.revision_pending=1 THEN 1 ELSE 0 END AS retest,
             CASE WHEN lr.status='received' THEN 1 ELSE 0 END AS completed,
             CASE WHEN lr.verified_at IS NOT NULL THEN 1 ELSE 0 END AS verified,
             CASE WHEN lr.approved_at IS NOT NULL THEN 1 ELSE 0 END AS approved,
             CASE WHEN lr.printed_at IS NOT NULL THEN 1 ELSE 0 END AS printed
      FROM tbl_lab_result lr
      JOIN tbl_patient p ON p.id = lr.patient_id
      LEFT JOIN tbl_lab_request_line l ON l.lab_result_id = lr.id
      LEFT JOIN tbl_lab_request r ON r.id = l.request_id
      LEFT JOIN tbl_lab_referrer ref ON ref.id = COALESCE(lr.referrer_id, r.referrer_id)
      LEFT JOIN tbl_lab_credit_provider cp ON cp.id = COALESCE(lr.credit_provider_id, r.credit_provider_id)
      LEFT JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
      WHERE ${where}
    ) x
    GROUP BY order_key
    ORDER BY order_date DESC
    LIMIT 200`;
  const [rows] = await pool.query(sql, params).catch(() => [[]]);
  return (rows || []).map((row) => ({
    ...row,
    overall_status: overallStatusFromCounts({
      total: row.total,
      printed: row.printed,
      approved: row.approved,
      processing: row.processing,
      completed: row.completed,
    }),
  }));
}

async function listStatusOrders(pool, opts = {}) {
  const date = opts.date || todayIso();
  const statusFilter = String(opts.status || 'all');
  const params = [date];
  let having = '';
  if (statusFilter === 'bill_paid') having = 'HAVING bill_paid_flag = 1';
  const [rows] = await pool.query(
    `SELECT lr.id, lr.test_name, lr.status, lr.created_at,
            p.first_name, p.last_name, p.phone, p.gender, p.date_of_birth,
            COALESCE(ref.name, 'Walk-in') AS referred_by,
            COALESCE(cp.name, '') AS provider_name,
            COALESCE(r.visit_type, 'OP') AS visit_type,
            CASE WHEN oi.status='paid' OR lr.status!='pending' OR r.id IS NOT NULL THEN 1 ELSE 0 END AS bill_paid_flag
     FROM tbl_lab_result lr
     JOIN tbl_patient p ON p.id = lr.patient_id
     LEFT JOIN tbl_lab_request_line l ON l.lab_result_id = lr.id
     LEFT JOIN tbl_lab_request r ON r.id = l.request_id
     LEFT JOIN tbl_lab_referrer ref ON ref.id = COALESCE(lr.referrer_id, r.referrer_id)
     LEFT JOIN tbl_lab_credit_provider cp ON cp.id = COALESCE(lr.credit_provider_id, r.credit_provider_id)
     LEFT JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
     WHERE DATE(COALESCE(r.created_at, lr.created_at)) = ?
     ${having}
     ORDER BY lr.created_at DESC
     LIMIT 200`,
    params
  ).catch(() => [[]]);
  return rows || [];
}

async function listPriorityQueue(pool, opts = {}) {
  const emergencyOnly = opts.emergency !== false;
  let where = emergencyOnly
    ? "(r.priority='emergency' OR lr.is_emergency=1 OR lr.source LIKE '%emergency%')"
    : '1=1';
  const [rows] = await pool.query(
    `${await baseResultSelect(pool)}
     WHERE ${where}
     ORDER BY (r.priority='emergency' OR lr.is_emergency=1) DESC, lr.created_at ASC
     LIMIT 100`
  ).catch(() => [[]]);
  return rows || [];
}

async function departmentMatrix(pool, date) {
  const d = date || todayIso();
  const [depts] = await pool.query('SELECT id, code, name FROM tbl_lab_department WHERE active=1 ORDER BY sort_order').catch(() => [[]]);
  const [rows] = await pool.query(
    `SELECT lr.id, lr.test_name, lr.status, lr.pipeline_stage, lr.verified_at, lr.approved_at,
            p.first_name, p.last_name, d.code AS dept_code
     FROM tbl_lab_result lr
     JOIN tbl_patient p ON p.id = lr.patient_id
     LEFT JOIN tbl_lab_request_line l ON l.lab_result_id = lr.id
     LEFT JOIN tbl_lab_catalog c ON c.id = l.catalog_id
     LEFT JOIN tbl_lab_department d ON d.id = c.department_id
     WHERE DATE(lr.created_at) = ?
     ORDER BY lr.created_at DESC
     LIMIT 300`,
    [d]
  ).catch(() => [[]]);

  const byPatient = new Map();
  for (const row of rows || []) {
    const key = `${row.first_name} ${row.last_name}`.trim();
    if (!byPatient.has(key)) {
      byPatient.set(key, { patient: key, cells: {}, total: 0, status: 'Pending' });
    }
    const rec = byPatient.get(key);
    const dc = row.dept_code || 'OTHER';
    rec.cells[dc] = row.status === 'received' || row.approved_at ? 'done' : 'pending';
    rec.total += 1;
    if (rec.cells[dc] === 'pending') rec.status = 'Pending';
    else if (rec.status !== 'Pending') rec.status = 'Completed';
    else rec.status = 'Partially completed';
  }
  return { departments: depts || [], rows: [...byPatient.values()] };
}

async function testWiseStatus(pool, date) {
  const d = date || todayIso();
  const [rows] = await pool.query(
    `SELECT lr.test_name,
            SUM(CASE WHEN oi.status='paid' OR lr.status!='pending' THEN 1 ELSE 0 END) AS bill_paid,
            SUM(CASE WHEN lr.status='in_progress' THEN 1 ELSE 0 END) AS processing,
            SUM(CASE WHEN COALESCE(lr.retest_count,0)>0 THEN 1 ELSE 0 END) AS retest,
            SUM(CASE WHEN lr.status='received' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN lr.verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified,
            SUM(CASE WHEN lr.approved_at IS NOT NULL THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN lr.printed_at IS NOT NULL THEN 1 ELSE 0 END) AS printed,
            COUNT(*) AS total
     FROM tbl_lab_result lr
     LEFT JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
     WHERE DATE(lr.created_at) = ?
     GROUP BY lr.test_name
     ORDER BY total DESC, lr.test_name ASC
     LIMIT 300`,
    [d]
  ).catch(() => [[]]);
  return (rows || []).map((r) => ({
    ...r,
    status: overallStatusFromCounts(r),
  }));
}

async function listDispatchQueue(pool, opts = {}) {
  const pendingOnly = opts.pending !== false;
  const where = pendingOnly
    ? "lr.status='received' AND (lr.dispatch_status IS NULL OR lr.dispatch_status IN ('pending','ready'))"
    : '1=1';
  const [rows] = await pool.query(
    `${await baseResultSelect(pool)}
     WHERE ${where}
     ORDER BY lr.approved_at DESC, lr.created_at ASC
     LIMIT 200`
  ).catch(() => [[]]);
  return rows || [];
}

async function dispatchResult(pool, labResultId, channel, userId, recipient) {
  const id = parseInt(labResultId, 10) || 0;
  const [[lr]] = await pool.query('SELECT id, patient_id FROM tbl_lab_result WHERE id=? LIMIT 1', [id]);
  if (!lr) return { ok: false, error: 'Result not found' };
  const ch = String(channel || 'print').toLowerCase();
  await pool.query(
    `INSERT INTO tbl_lab_dispatch_log (facility_id, lab_result_id, patient_id, channel, status, recipient, sent_at, sent_by)
     VALUES (1, ?, ?, ?, 'sent', ?, NOW(), ?)`,
    [id, lr.patient_id, ch, recipient || null, userId || null]
  );
  if (await hasPhaseColumns(pool)) {
    await pool.query(
      `UPDATE tbl_lab_result SET dispatch_status='sent', printed_at=COALESCE(printed_at, NOW()) WHERE id=?`,
      [id]
    );
    await syncPipelineStage(pool, id);
  }
  return { ok: true };
}

async function verifyResult(pool, labResultId, userId) {
  const id = parseInt(labResultId, 10) || 0;
  if (!(await hasPhaseColumns(pool))) return { ok: false, error: 'Pipeline not enabled' };
  await pool.query('UPDATE tbl_lab_result SET verified_at=NOW(), verified_by=? WHERE id=?', [userId || null, id]);
  await syncPipelineStage(pool, id);
  return { ok: true };
}

async function approveResult(pool, labResultId, userId) {
  const id = parseInt(labResultId, 10) || 0;
  if (!(await hasPhaseColumns(pool))) return { ok: false, error: 'Pipeline not enabled' };
  await pool.query(
    'UPDATE tbl_lab_result SET approved_at=NOW(), approved_by=?, verified_at=COALESCE(verified_at, NOW()), verified_by=COALESCE(verified_by, ?) WHERE id=?',
    [userId || null, userId || null, id]
  );
  await syncPipelineStage(pool, id);
  return { ok: true };
}

async function markPrinted(pool, labResultId) {
  const id = parseInt(labResultId, 10) || 0;
  if (!(await hasPhaseColumns(pool))) return { ok: false };
  await pool.query('UPDATE tbl_lab_result SET printed_at=NOW() WHERE id=?', [id]);
  await syncPipelineStage(pool, id);
  return { ok: true };
}

async function importAnalyzerValues(pool, labResultId, readings, userId, instrumentId) {
  const id = parseInt(labResultId, 10) || 0;
  if (id < 1) return { ok: false, error: 'Invalid result id' };
  const [[lr]] = await pool.query('SELECT id, structured_result, patient_id, template_test_id FROM tbl_lab_result WHERE id=?', [id]);
  if (!lr) return { ok: false, error: 'Result not found' };

  let structured = {};
  try {
    structured = lr.structured_result ? JSON.parse(lr.structured_result) : {};
  } catch (_) {
    structured = {};
  }
  if (!structured.results) structured.results = [];
  const byKey = new Map(structured.results.map((r) => [String(r.key || r.fieldKey), r]));

  for (const rd of readings || []) {
    const key = String(rd.fieldKey || rd.key || '').trim();
    if (!key) continue;
    const val = String(rd.value ?? '').trim();
    await pool.query(
      `INSERT INTO tbl_lab_analyzer_import (lab_result_id, instrument_id, field_key, raw_value, imported_by)
       VALUES (?,?,?,?,?)`,
      [id, instrumentId || rd.instrumentId || null, key, val, userId || null]
    );
    const prev = byKey.get(key) || { key, fieldKey: key };
    prev.value = val;
    prev.automated = true;
    byKey.set(key, prev);
  }
  structured.results = [...byKey.values()];
  structured.analyzerImport = true;
  const evalFlags = evaluateStructuredResult(structured);
  await pool.query(
    `UPDATE tbl_lab_result SET structured_result=?, analyzer_import_at=NOW(),
     is_abnormal=?, is_critical=?, status=COALESCE(NULLIF(status,'pending'),'in_progress')
     WHERE id=?`,
    [JSON.stringify(structured), evalFlags.isAbnormal ? 1 : 0, evalFlags.isCritical ? 1 : 0, id]
  );
  await syncPipelineStage(pool, id);
  return { ok: true, structured, flags: evalFlags };
}

async function applyPersistPipeline(pool, labResultId, report, userId) {
  if (!(await hasPhaseColumns(pool))) return;
  const flags = evaluateStructuredResult(report);
  await pool.query(
    `UPDATE tbl_lab_result SET pipeline_stage='completed', is_abnormal=?, is_critical=?,
     verified_at=NULL, approved_at=NULL, dispatch_status='pending'
     WHERE id=?`,
    [flags.isAbnormal ? 1 : 0, flags.isCritical ? 1 : 0, labResultId]
  );
  await syncPipelineStage(pool, labResultId);
  return flags;
}

async function listReferrers(pool) {
  const [rows] = await pool.query(
    'SELECT * FROM tbl_lab_referrer WHERE active=1 ORDER BY name LIMIT 500'
  ).catch(() => [[]]);
  return rows || [];
}

async function listCreditProviders(pool, opts = {}) {
  const profileSvc = require('./hmsCountryProfileService');
  await profileSvc.ensureLoaded(pool).catch(() => {});
  const countryCode = opts.countryCode || profileSvc.getActiveCode();
  const { syncCountryCreditProviders } = require('./labCreditProviderSeed');
  await syncCountryCreditProviders(pool, countryCode, opts.facilityId);
  const cc = require('./labCreditProviderCatalog').resolveCountryCode(countryCode);
  const [rows] = await pool.query(
    `SELECT * FROM tbl_lab_credit_provider
      WHERE active=1 AND country_code=?
      ORDER BY CASE WHEN code='CP-SELF' THEN 0 ELSE 1 END, name
      LIMIT 500`,
    [cc]
  ).catch(() => [[]]);
  return rows || [];
}

async function upsertReferrer(pool, body, facilityId = 1) {
  const name = String(body.name || '').trim();
  if (!name) return { ok: false, error: 'Name required' };
  const id = parseInt(body.id, 10) || 0;
  const row = [
    facilityId,
    String(body.code || '').trim() || null,
    name,
    String(body.referrer_type || 'doctor').slice(0, 32),
    String(body.mobile || '').trim() || null,
    String(body.email || '').trim() || null,
    String(body.address || '').trim() || null,
  ];
  if (id > 0) {
    await pool.query(
      `UPDATE tbl_lab_referrer SET code=?, name=?, referrer_type=?, mobile=?, email=?, address=? WHERE id=?`,
      row.slice(1).concat(id)
    );
  } else {
    await pool.query(
      `INSERT INTO tbl_lab_referrer (facility_id, code, name, referrer_type, mobile, email, address, active)
       VALUES (?,?,?,?,?,?,?,1)`,
      row
    );
  }
  return { ok: true };
}

async function upsertCreditProvider(pool, body, facilityId = 1) {
  const name = String(body.name || '').trim();
  if (!name) return { ok: false, error: 'Name required' };
  const id = parseInt(body.id, 10) || 0;
  const row = [
    facilityId,
    String(body.code || '').trim() || null,
    name,
    String(body.provider_type || 'corporate').slice(0, 32),
    String(body.contact_phone || '').trim() || null,
    String(body.contact_email || '').trim() || null,
  ];
  if (id > 0) {
    await pool.query(
      `UPDATE tbl_lab_credit_provider SET code=?, name=?, provider_type=?, contact_phone=?, contact_email=? WHERE id=?`,
      row.slice(1).concat(id)
    );
  } else {
    await pool.query(
      `INSERT INTO tbl_lab_credit_provider (facility_id, code, name, provider_type, contact_phone, contact_email, active)
       VALUES (?,?,?,?,?,?,1)`,
      row
    );
  }
  return { ok: true };
}

async function walkInRegister(pool, body, userId, facilityId = 1) {
  return require('./labWalkinCashier').registerWalkin(pool, body, userId, facilityId);
}

async function misHubStats(pool, date) {
  const d = date || todayIso();
  const [[lab]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status='received' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN is_abnormal=1 THEN 1 ELSE 0 END) AS abnormal
     FROM tbl_lab_result WHERE DATE(created_at)=?`,
    [d]
  ).catch(() => [[{}]]);
  const [[dispatch]] = await pool.query(
    `SELECT COUNT(*) AS sent FROM tbl_lab_dispatch_log WHERE DATE(COALESCE(sent_at, created_at))=?`,
    [d]
  ).catch(() => [[{}]]);
  const [[requests]] = await pool.query(
    `SELECT COUNT(*) AS open FROM tbl_lab_request WHERE status NOT IN ('done','cancelled') AND DATE(created_at)=?`,
    [d]
  ).catch(() => [[{}]]);
  return {
    date: d,
    labResults: lab || {},
    dispatchSent: dispatch?.sent || 0,
    openRequests: requests?.open || 0,
  };
}

function exportTestWiseCsv(rows) {
  const header = ['Test', 'Bill paid', 'Processing', 'Re-test', 'Completed', 'Verified', 'Approved', 'Printed', 'Total', 'Status'];
  const lines = [header.join(',')];
  for (const r of rows || []) {
    lines.push(
      [
        `"${String(r.test_name || '').replace(/"/g, '""')}"`,
        r.bill_paid,
        r.processing,
        r.retest,
        r.completed,
        r.verified,
        r.approved,
        r.printed,
        r.total,
        `"${r.status}"`,
      ].join(',')
    );
  }
  return lines.join('\n');
}

module.exports = {
  PIPELINE_STAGES,
  pipelineLabel,
  derivePipelineStage,
  syncPipelineStage,
  evaluateStructuredResult,
  computeDeltaCheck,
  priorFieldValue,
  nextBarcode,
  listInvestigationOrders,
  listStatusOrders,
  listPriorityQueue,
  departmentMatrix,
  testWiseStatus,
  listDispatchQueue,
  dispatchResult,
  verifyResult,
  approveResult,
  markPrinted,
  importAnalyzerValues,
  applyPersistPipeline,
  listReferrers,
  listCreditProviders,
  upsertReferrer,
  upsertCreditProvider,
  walkInRegister,
  misHubStats,
  exportTestWiseCsv,
  getAllTests,
};
