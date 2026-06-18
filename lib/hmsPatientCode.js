'use strict';

const PREFIX = String(process.env.HMS_PATIENT_CODE_PREFIX || 'ZAI').trim() || 'SHG';
const SUFFIX = String(process.env.HMS_PATIENT_CODE_SUFFIX || 'ZNS').trim() || 'SOA';
const PAD = Math.max(4, Math.min(8, parseInt(process.env.HMS_PATIENT_CODE_PAD || '6', 10) || 6));

/** @returns {string} e.g. ZAI-000001-ZNS */
function formatPatientCode(seq) {
  const n = parseInt(seq, 10);
  if (!Number.isFinite(n) || n < 1) {
    return `${PREFIX}-${String(1).padStart(PAD, '0')}-${SUFFIX}`;
  }
  return `${PREFIX}-${String(n).padStart(PAD, '0')}-${SUFFIX}`;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePatientCodeNumber(code) {
  const re = new RegExp(`^${escapeRe(PREFIX)}-(\\d+)-${escapeRe(SUFFIX)}$`, 'i');
  const m = String(code || '').trim().match(re);
  return m ? parseInt(m[1], 10) : null;
}

/** Highest numeric sequence already assigned (parsed codes and patient ids). */
async function maxAssignedSequence(poolOrConn) {
  let max = 0;
  const [rows] = await poolOrConn.query(
    `SELECT patient_code FROM tbl_patient
     WHERE patient_code IS NOT NULL AND TRIM(patient_code) <> ''`
  );
  for (const r of rows || []) {
    const n = parsePatientCodeNumber(r.patient_code);
    if (n != null && n > max) max = n;
  }
  const [[idRow]] = await poolOrConn.query('SELECT COALESCE(MAX(id), 0) AS m FROM tbl_patient');
  const maxId = parseInt(idRow?.m, 10) || 0;
  return Math.max(max, maxId);
}

async function allocateNextPatientCode(poolOrConn) {
  const next = (await maxAssignedSequence(poolOrConn)) + 1;
  return formatPatientCode(next);
}

const LOCK_NAME = 'hms_patient_code_alloc';

/** Serialize code assignment during INSERT (use same connection as transaction). */
async function allocateNextPatientCodeLocked(conn) {
  const [[lockRow]] = await conn.query('SELECT GET_LOCK(?, 15) AS l', [LOCK_NAME]);
  if (!lockRow || lockRow.l !== 1) {
    throw new Error('Could not allocate patient ID (lock timeout).');
  }
  try {
    return await allocateNextPatientCode(conn);
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
  }
}

function displayPatientCode(patient) {
  if (!patient) return '';
  const code = patient.patient_code;
  if (code != null && String(code).trim() !== '') return String(code).trim();
  if (patient.id != null) return '#P-' + patient.id;
  return '';
}

module.exports = {
  PREFIX,
  SUFFIX,
  PAD,
  formatPatientCode,
  parsePatientCodeNumber,
  maxAssignedSequence,
  allocateNextPatientCode,
  allocateNextPatientCodeLocked,
  displayPatientCode,
};
