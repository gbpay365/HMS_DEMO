'use strict';

const { patientDisplayAgeYears, isAgeOnlyPatient } = require('./patientAge');

function formatReportDateIso(value) {
  if (!value) return null;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch (_) {
    return null;
  }
}

/** Narrative text column varies by schema (notes vs findings). */
function extractResultNarrative(row) {
  if (!row) return '';
  const text = row.notes != null && String(row.notes).trim() ? row.notes : row.findings;
  return text != null ? String(text).trim() : '';
}

function structuredHasFilledValues(structured) {
  if (!structured || !Array.isArray(structured.results)) return false;
  return structured.results.some((r) => r.value != null && String(r.value).trim() !== '');
}

function computeAgeLabel(row) {
  if (!row) return '';
  const yrs = patientDisplayAgeYears(row);
  if (yrs == null) return '';
  if (isAgeOnlyPatient(row)) return `${yrs}y`;
  if (row.dob) {
    try {
      const d = new Date(row.dob);
      if (!Number.isNaN(d.getTime())) {
        const now = new Date();
        let age = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
        if (age >= 0) return `${age}y`;
      }
    } catch (_) {
      /* ignore */
    }
  }
  return `${yrs}y`;
}

/**
 * Build a JSON payload for HmsDiagnosticReportPrint (patient handover copy).
 *
 * @param {'laboratory'|'radiology'} module
 * @param {object} row — registry row with p_fn, p_ln, notes, etc.
 * @param {object|null} structured — parsed structured_result
 * @param {string} [validateCode]
 * @param {object|null} [patient] — optional tbl_patient row (dob, gender)
 */
function buildDiagnosticPrintPayload(module, row, structured, validateCode, patient) {
  const isLab = module === 'laboratory';
  const examName = isLab
    ? row.test_name || 'Laboratory test'
    : row.exam_name || row.test_name || 'Radiology examination';

  const patientName = [row.p_fn, row.p_ln].filter(Boolean).join(' ').trim();
  const ageSex = patient
    ? [computeAgeLabel(patient), patient.gender].filter(Boolean).join(' / ')
    : '';

  const resultRows = [];
  if (structured && Array.isArray(structured.results)) {
    structured.results.forEach((r) => {
      const val = r.value != null && r.value !== '' ? String(r.value).trim() : '';
      if (!val) return;
      resultRows.push({
        label: r.label || r.key || 'Result',
        value: val,
        unit: r.unit || '',
        refRange: r.refRange || r.ref_range || '',
        type: r.type || '',
        normalMin: r.normalMin,
        normalMax: r.normalMax,
      });
    });
  }

  const conclusion =
    (structured && structured.conclusion && String(structured.conclusion).trim()) ||
    (row.conclusion_code ? String(row.conclusion_code).trim() : '') ||
    '';
  const narrativeFindings = extractResultNarrative(row);

  const reportDate =
    formatReportDateIso(row.updated_at) ||
    formatReportDateIso(row.created_at) ||
    formatReportDateIso(row.appointment_date) ||
    new Date().toISOString();

  const registryRef = isLab
    ? `LAB-${String(row.id).padStart(4, '0')}`
    : `RAD-${String(row.id).padStart(4, '0')}`;

  const hasFilledStructured = structuredHasFilledValues(structured);
  const hasStructuredShell =
    !!(structured && Array.isArray(structured.results) && structured.results.length > 0);
  const canPrint = !!(resultRows.length || hasFilledStructured || conclusion);
  const shellOnly =
    !canPrint && hasStructuredShell && String(row.status || '').toLowerCase() === 'received';

  return {
    module,
    resultId: row.id,
    canPrint,
    shellOnly,
    deptLabel: isLab ? 'Laboratory Report' : 'Radiology Report',
    deptSubtitle: isLab ? 'Clinical laboratory department' : 'Medical imaging department',
    examName,
    serviceCode: validateCode ? String(validateCode).trim() : '',
    registryRef,
    reportDate,
    accent: isLab ? '#7c3aed' : '#0891b2',
    signatureLabel: isLab ? 'Reporting pathologist / lab scientist' : 'Reporting radiologist',
    patientRows: [
      { label: 'Patient ID', value: row.patient_id ? `#P-${row.patient_id}` : '—' },
      { label: 'Name', value: patientName || '—' },
      { label: 'Age / Sex', value: ageSex || '—' },
      { label: 'Requesting doctor', value: row.ref_display || '—' },
      { label: 'Report date', value: reportDate },
      { label: 'Registry ref.', value: registryRef },
    ],
    resultRows,
    conclusion,
    narrativeFindings,
  };
}

function enrichRefDisplay(row) {
  if (!row) return row;
  let refDisplay = '';
  if (row.referred_by_id && (row.ref_fn || row.ref_ln)) {
    refDisplay = (`Dr. ${[row.ref_fn, row.ref_ln].filter(Boolean).join(' ')}`).trim();
  }
  if (!refDisplay && (row.oi_ref_fn || row.oi_ref_ln)) {
    refDisplay = (`Dr. ${[row.oi_ref_fn, row.oi_ref_ln].filter(Boolean).join(' ')}`).trim();
  }
  if (!refDisplay && row.structured_result) {
    try {
      const j = JSON.parse(row.structured_result);
      if (j.patientInfo && j.patientInfo.doctor) refDisplay = String(j.patientInfo.doctor).trim();
    } catch (_) {
      /* ignore */
    }
  }
  row.ref_display = refDisplay || null;
  return row;
}

function parseStructured(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/** Patient DOB column name differs across deployments (dob only vs dob + date_of_birth). */
const PATIENT_JOIN_COL_VARIANTS = [
  'p.dob AS patient_dob, p.gender AS patient_gender, p.age_years AS patient_age_years',
  'COALESCE(p.dob, p.date_of_birth) AS patient_dob, p.gender AS patient_gender, p.age_years AS patient_age_years',
  'p.dob AS patient_dob, p.gender AS patient_gender',
];

async function queryOneWithPatientCols(pool, buildSql, params = []) {
  for (const patientCols of PATIENT_JOIN_COL_VARIANTS) {
    try {
      const [[row]] = await pool.query(buildSql(patientCols), params);
      if (row) return row;
    } catch (e) {
      if (!/Unknown column/i.test(e.message || '')) throw e;
    }
  }
  return null;
}

async function queryAllWithPatientCols(pool, buildSql, params = []) {
  for (const patientCols of PATIENT_JOIN_COL_VARIANTS) {
    try {
      const [rows] = await pool.query(buildSql(patientCols), params);
      return rows || [];
    } catch (e) {
      if (!/Unknown column/i.test(e.message || '')) throw e;
    }
  }
  return [];
}

async function loadLabPrintPayload(pool, id) {
  const row = await queryOneWithPatientCols(
    pool,
    (patientCols) =>
      `SELECT lr.*, p.first_name AS p_fn, p.last_name AS p_ln,
              ${patientCols},
              e.first_name AS ref_fn, e.last_name AS ref_ln,
              oi_ref.first_name AS oi_ref_fn, oi_ref.last_name AS oi_ref_ln,
              oi.service_code AS validate_service_code
         FROM tbl_lab_result lr
         JOIN tbl_patient p ON p.id = lr.patient_id
         LEFT JOIN tbl_employee e ON e.id = lr.referred_by_id
         LEFT JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
         LEFT JOIN tbl_consultation cons ON cons.id = oi.consultation_id
         LEFT JOIN tbl_employee oi_ref ON oi_ref.id = cons.created_by
        WHERE lr.id = ? LIMIT 1`,
    [id]
  );
  if (!row) return null;
  enrichRefDisplay(row);
  const structured = parseStructured(row.structured_result);
  const validateCode = row.validate_service_code ? String(row.validate_service_code).trim() : '';
  const patient = {
    dob: row.patient_dob,
    gender: row.patient_gender,
    age_years: row.patient_age_years,
  };
  return buildDiagnosticPrintPayload('laboratory', row, structured, validateCode, patient);
}

async function loadRadPrintPayload(pool, id) {
  const cols = await pool
    .query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_radiology_result'`
    )
    .then(([r]) => new Set((r || []).map((c) => c.COLUMN_NAME)))
    .catch(() => new Set());
  const structCol = cols.has('structured_result')
    ? 'structured_result'
    : cols.has('result_template_json')
      ? 'result_template_json'
      : null;
  const structSel = structCol ? `lr.${structCol}` : 'NULL';
  const nameSel = cols.has('exam_name') ? 'lr.exam_name' : 'lr.test_name';
  const row = await queryOneWithPatientCols(
    pool,
    (patientCols) =>
      `SELECT lr.*, ${nameSel} AS exam_name, ${structSel} AS structured_raw,
              p.first_name AS p_fn, p.last_name AS p_ln,
              ${patientCols},
              e.first_name AS ref_fn, e.last_name AS ref_ln,
              oi_ref.first_name AS oi_ref_fn, oi_ref.last_name AS oi_ref_ln,
              oi.service_code AS validate_service_code
         FROM tbl_radiology_result lr
         JOIN tbl_patient p ON p.id = lr.patient_id
         LEFT JOIN tbl_employee e ON e.id = lr.referred_by_id
         LEFT JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
         LEFT JOIN tbl_consultation cons ON cons.id = oi.consultation_id
         LEFT JOIN tbl_employee oi_ref ON oi_ref.id = cons.created_by
        WHERE lr.id = ? LIMIT 1`,
    [id]
  );
  if (!row) return null;
  enrichRefDisplay(row);
  const structured = parseStructured(row.structured_raw || row.structured_result);
  const validateCode = row.validate_service_code ? String(row.validate_service_code).trim() : '';
  const patient = {
    dob: row.patient_dob,
    gender: row.patient_gender,
    age_years: row.patient_age_years,
  };
  return buildDiagnosticPrintPayload('radiology', row, structured, validateCode, patient);
}

function rowIsPrintable(module, row, structured) {
  if (!row || Number(row.revision_pending) === 1) return false;
  const payload = buildDiagnosticPrintPayload(module, row, structured, '', null);
  return !!payload.canPrint;
}

async function loadLabPrintPayloadsByCode(pool, code) {
  const serviceCode = String(code || '').trim().toUpperCase();
  if (!serviceCode) return [];
  const rows = await queryAllWithPatientCols(
    pool,
    (patientCols) =>
      `SELECT lr.*, p.first_name AS p_fn, p.last_name AS p_ln,
              ${patientCols},
              e.first_name AS ref_fn, e.last_name AS ref_ln,
              oi_ref.first_name AS oi_ref_fn, oi_ref.last_name AS oi_ref_ln,
              oi.service_code AS validate_service_code, oi.item_name AS order_item_name
         FROM tbl_lab_result lr
         JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
         JOIN tbl_patient p ON p.id = lr.patient_id
         LEFT JOIN tbl_employee e ON e.id = lr.referred_by_id
         LEFT JOIN tbl_consultation cons ON cons.id = oi.consultation_id
         LEFT JOIN tbl_employee oi_ref ON oi_ref.id = cons.created_by
        WHERE UPPER(TRIM(oi.service_code)) = ?
          AND COALESCE(lr.revision_pending, 0) = 0
        ORDER BY oi.id ASC, lr.id ASC`,
    [serviceCode]
  );
  const payloads = [];
  for (const row of rows || []) {
    enrichRefDisplay(row);
    const structured = parseStructured(row.structured_result);
    if (!rowIsPrintable('laboratory', row, structured)) continue;
    const patient = {
      dob: row.patient_dob,
      gender: row.patient_gender,
      age_years: row.patient_age_years,
    };
    const payload = buildDiagnosticPrintPayload('laboratory', row, structured, serviceCode, patient);
    if (payload.canPrint) payloads.push(payload);
  }
  return payloads;
}

async function loadRadPrintPayloadsByCode(pool, code) {
  const serviceCode = String(code || '').trim().toUpperCase();
  if (!serviceCode) return [];
  const cols = await pool
    .query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_radiology_result'`
    )
    .then(([r]) => new Set((r || []).map((c) => c.COLUMN_NAME)))
    .catch(() => new Set());
  const structCol = cols.has('structured_result')
    ? 'structured_result'
    : cols.has('result_template_json')
      ? 'result_template_json'
      : null;
  const structSel = structCol ? `rr.${structCol}` : 'NULL';
  const nameSel = cols.has('exam_name') ? 'rr.exam_name' : 'rr.test_name';
  const rows = await queryAllWithPatientCols(
    pool,
    (patientCols) =>
      `SELECT rr.*, ${nameSel} AS exam_name, ${structSel} AS structured_raw,
              p.first_name AS p_fn, p.last_name AS p_ln,
              ${patientCols},
              e.first_name AS ref_fn, e.last_name AS ref_ln,
              oi_ref.first_name AS oi_ref_fn, oi_ref.last_name AS oi_ref_ln,
              oi.service_code AS validate_service_code, oi.item_name AS order_item_name
         FROM tbl_radiology_result rr
         JOIN tbl_opd_order_item oi ON oi.id = rr.opd_order_item_id
         JOIN tbl_patient p ON p.id = rr.patient_id
         LEFT JOIN tbl_employee e ON e.id = rr.referred_by_id
         LEFT JOIN tbl_consultation cons ON cons.id = oi.consultation_id
         LEFT JOIN tbl_employee oi_ref ON oi_ref.id = cons.created_by
        WHERE UPPER(TRIM(oi.service_code)) = ?
          AND COALESCE(rr.revision_pending, 0) = 0
        ORDER BY oi.id ASC, rr.id ASC`,
    [serviceCode]
  );
  const payloads = [];
  for (const row of rows || []) {
    enrichRefDisplay(row);
    const structured = parseStructured(row.structured_raw || row.structured_result);
    if (!rowIsPrintable('radiology', row, structured)) continue;
    const patient = {
      dob: row.patient_dob,
      gender: row.patient_gender,
      age_years: row.patient_age_years,
    };
    const payload = buildDiagnosticPrintPayload('radiology', row, structured, serviceCode, patient);
    if (payload.canPrint) payloads.push(payload);
  }
  return payloads;
}

function buildBatchPrintResponse(module, code, reports, meta = {}) {
  const list = (reports || []).filter((r) => r && r.canPrint);
  const first = list[0] || null;
  const patientRow = first && (first.patientRows || []).find((r) => r.label === 'Name');
  const patientIdRow = first && (first.patientRows || []).find((r) => r.label === 'Patient ID');
  const doctorRow = first && (first.patientRows || []).find((r) => r.label === 'Requesting doctor');
  const batchType = meta.batchType || (code ? 'code' : 'patient');
  const patientNumericId = meta.patientNumericId != null ? meta.patientNumericId : null;
  return {
    module,
    batchType,
    serviceCode: String(code || '').trim().toUpperCase(),
    count: list.length,
    canPrintAll: list.length > 0,
    patientName: meta.patientName || (patientRow ? patientRow.value : ''),
    patientId: meta.patientId || (patientIdRow ? patientIdRow.value : ''),
    patientNumericId,
    referringDoctor: doctorRow ? doctorRow.value : '',
    deptLabel: module === 'radiology' ? 'Radiology Report' : 'Laboratory Report',
    accent: module === 'radiology' ? '#0891b2' : '#7c3aed',
    reports: list,
  };
}

async function loadLabPrintPayloadsByPatient(pool, patientId, opts = {}) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return [];
  const rows = await queryAllWithPatientCols(
    pool,
    (patientCols) =>
      `SELECT lr.*, p.first_name AS p_fn, p.last_name AS p_ln,
              ${patientCols},
              e.first_name AS ref_fn, e.last_name AS ref_ln,
              oi_ref.first_name AS oi_ref_fn, oi_ref.last_name AS oi_ref_ln,
              oi.service_code AS validate_service_code, oi.item_name AS order_item_name
         FROM tbl_lab_result lr
         JOIN tbl_patient p ON p.id = lr.patient_id
         LEFT JOIN tbl_employee e ON e.id = lr.referred_by_id
         LEFT JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
         LEFT JOIN tbl_consultation cons ON cons.id = oi.consultation_id
         LEFT JOIN tbl_employee oi_ref ON oi_ref.id = cons.created_by
        WHERE lr.patient_id = ?
          AND COALESCE(lr.revision_pending, 0) = 0
        ORDER BY COALESCE(lr.updated_at, lr.created_at) ASC, lr.id ASC`,
    [pid]
  );
  const payloads = [];
  for (const row of rows || []) {
    enrichRefDisplay(row);
    const structured = parseStructured(row.structured_result);
    if (!rowIsPrintable('laboratory', row, structured)) continue;
    const patient = {
      dob: row.patient_dob,
      gender: row.patient_gender,
      age_years: row.patient_age_years,
    };
    const validateCode = row.validate_service_code ? String(row.validate_service_code).trim() : '';
    const payload = buildDiagnosticPrintPayload('laboratory', row, structured, validateCode, patient);
    if (payload.canPrint) payloads.push(payload);
  }
  return payloads;
}

async function loadRadPrintPayloadsByPatient(pool, patientId, opts = {}) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return [];
  const cols = await pool
    .query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_radiology_result'`
    )
    .then(([r]) => new Set((r || []).map((c) => c.COLUMN_NAME)))
    .catch(() => new Set());
  const structCol = cols.has('structured_result')
    ? 'structured_result'
    : cols.has('result_template_json')
      ? 'result_template_json'
      : null;
  const structSel = structCol ? `rr.${structCol}` : 'NULL';
  const nameSel = cols.has('exam_name') ? 'rr.exam_name' : 'rr.test_name';
  const rows = await queryAllWithPatientCols(
    pool,
    (patientCols) =>
      `SELECT rr.*, ${nameSel} AS exam_name, ${structSel} AS structured_raw,
              p.first_name AS p_fn, p.last_name AS p_ln,
              ${patientCols},
              e.first_name AS ref_fn, e.last_name AS ref_ln,
              oi_ref.first_name AS oi_ref_fn, oi_ref.last_name AS oi_ref_ln,
              oi.service_code AS validate_service_code, oi.item_name AS order_item_name
         FROM tbl_radiology_result rr
         JOIN tbl_patient p ON p.id = rr.patient_id
         LEFT JOIN tbl_employee e ON e.id = rr.referred_by_id
         LEFT JOIN tbl_opd_order_item oi ON oi.id = rr.opd_order_item_id
         LEFT JOIN tbl_consultation cons ON cons.id = oi.consultation_id
         LEFT JOIN tbl_employee oi_ref ON oi_ref.id = cons.created_by
        WHERE rr.patient_id = ?
          AND COALESCE(rr.revision_pending, 0) = 0
        ORDER BY COALESCE(rr.updated_at, rr.created_at) ASC, rr.id ASC`,
    [pid]
  );
  const payloads = [];
  for (const row of rows || []) {
    enrichRefDisplay(row);
    const structured = parseStructured(row.structured_raw || row.structured_result);
    if (!rowIsPrintable('radiology', row, structured)) continue;
    const patient = {
      dob: row.patient_dob,
      gender: row.patient_gender,
      age_years: row.patient_age_years,
    };
    const validateCode = row.validate_service_code ? String(row.validate_service_code).trim() : '';
    const payload = buildDiagnosticPrintPayload('radiology', row, structured, validateCode, patient);
    if (payload.canPrint) payloads.push(payload);
  }
  return payloads;
}

function parseResultIdList(raw) {
  if (raw == null || raw === '') return [];
  const s = Array.isArray(raw) ? raw.join(',') : String(raw);
  const ids = s
    .split(/[,\s]+/)
    .map((x) => parseInt(String(x).trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(ids)];
}

function filterBatchByResultIds(batchData, ids) {
  if (!batchData) return batchData;
  const idList = parseResultIdList(ids);
  if (!idList.length) return batchData;
  const idSet = new Set(idList.map((n) => Number(n)));
  const reports = (batchData.reports || []).filter((r) => r && idSet.has(Number(r.resultId)));
  return {
    ...batchData,
    reports,
    count: reports.length,
    canPrintAll: reports.length > 0,
  };
}

module.exports = {
  buildDiagnosticPrintPayload,
  buildBatchPrintResponse,
  computeAgeLabel,
  enrichRefDisplay,
  loadLabPrintPayload,
  loadRadPrintPayload,
  loadLabPrintPayloadsByCode,
  loadRadPrintPayloadsByCode,
  loadLabPrintPayloadsByPatient,
  loadRadPrintPayloadsByPatient,
  queryOneWithPatientCols,
  parseResultIdList,
  filterBatchByResultIds,
};
