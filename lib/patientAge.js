'use strict';

const { toIsoDatePart } = require('./hmsFormatDate');

/**
 * Full years between date of birth and asOf (birthday not yet reached this year → subtract one).
 * @param {string|Date|null|undefined} dob
 * @param {Date} [asOf]
 * @returns {number|null}
 */
function ageFromDob(dob, asOf = new Date()) {
  if (dob == null || dob === '') return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  let age = asOf.getFullYear() - d.getFullYear();
  const m = asOf.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < d.getDate())) age--;
  if (age < 0 || age > 200) return null;
  return age;
}

/** @param {unknown} row */
function isAgeOnlyPatient(row) {
  if (!row) return false;
  const v = row.age_only_registration;
  return v === 1 || v === true || v === '1';
}

/**
 * DOB with today's month/day and birth year = asOf.year − age (registration-day anchor).
 * @param {number} age
 * @param {Date} [asOf]
 * @returns {string|null} YYYY-MM-DD
 */
function dobFromAgeYears(age, asOf = new Date()) {
  const n = parseInt(String(age), 10);
  if (!Number.isFinite(n) || n < 0 || n > 130) return null;
  const y = asOf.getFullYear() - n;
  const m = String(asOf.getMonth() + 1).padStart(2, '0');
  const d = String(asOf.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Age for UI: age-only patients use stored age_years; others prefer DOB-derived age.
 * @param {{ dob?: unknown, age_years?: unknown, age_only_registration?: unknown }} row
 * @param {Date} [asOf]
 * @returns {number|null}
 */
function patientDisplayAgeYears(row, asOf = new Date()) {
  if (!row) return null;
  if (isAgeOnlyPatient(row)) {
    const raw = row.age_years;
    if (raw == null || raw === '') return null;
    const n = parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 0 || n > 200) return null;
    return n;
  }
  if (row.dob) {
    const a = ageFromDob(row.dob, asOf);
    if (a != null) return a;
  }
  const raw = row.age_years;
  if (raw == null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0 || n > 200) return null;
  return n;
}

/** Whether to show date of birth on patient-facing UI. */
function patientShowsDob(row) {
  return !isAgeOnlyPatient(row) && row && row.dob != null && String(row.dob).trim() !== '';
}

/**
 * Registration / edit: age mode stores estimated DOB (today's month/day) + age_years + age_only flag.
 * @param {Record<string, unknown>} body
 * @param {string} [modeFieldName]
 * @returns {{ dob: string|null, age_years: number|null, age_only_registration: 0|1 }}
 */
function resolvePatientDobAgeFromBody(body, modeFieldName = 'ap_dob_mode') {
  const mode = String(body[modeFieldName] || 'dob').trim();
  const dobRaw = body.dob != null ? String(body.dob).trim() : '';
  const ageRaw = body.age_years != null ? String(body.age_years).trim() : '';
  const dobIso = dobRaw ? toIsoDatePart(dobRaw) : '';
  if (mode === 'age') {
    const age = parseInt(ageRaw, 10);
    if (Number.isFinite(age) && age >= 0 && age <= 130) {
      return {
        dob: dobFromAgeYears(age),
        age_years: age,
        age_only_registration: 1,
      };
    }
    return { dob: dobRaw || null, age_years: null, age_only_registration: 0 };
  }
  return { dob: dobIso || null, age_years: null, age_only_registration: 0 };
}

async function patientColumnExists(pool, columnName) {
  const [[row]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_patient' AND COLUMN_NAME = ?`,
      [columnName]
    )
    .catch(() => [[{ c: 0 }]]);
  return parseInt(row?.c || 0, 10) > 0;
}

async function addPatientColumn(pool, sql) {
  try {
    await pool.query(sql);
  } catch (e) {
    if (e && (e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060)) return;
    throw e;
  }
}

const PATIENT_PHONE_MAX = 32;

/** Strip formatting; keep digits and optional leading +; fit DB column. */
function normalizePatientPhone(raw, maxLen = PATIENT_PHONE_MAX) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  const leadPlus = s.startsWith('+');
  s = s.replace(/[^\d+]/g, '');
  if (leadPlus) {
    s = '+' + s.replace(/\+/g, '');
  } else {
    s = s.replace(/\+/g, '');
  }
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

async function patientColumnMeta(pool, columnName) {
  const [[row]] = await pool
    .query(
      `SELECT CHARACTER_MAXIMUM_LENGTH AS maxLen, IS_NULLABLE AS nullable
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_patient' AND COLUMN_NAME = ?`,
      [columnName]
    )
    .catch(() => [[null]]);
  return row || null;
}

async function ensurePatientPhoneColumn(pool) {
  const meta = await patientColumnMeta(pool, 'phone');
  if (!meta) return;
  const maxLen = parseInt(meta.maxLen, 10) || 0;
  if (maxLen >= PATIENT_PHONE_MAX) return;
  const nullSql = String(meta.nullable || '').toUpperCase() === 'YES' ? 'NULL' : 'NOT NULL';
  await pool.query(
    `ALTER TABLE tbl_patient MODIFY COLUMN phone VARCHAR(${PATIENT_PHONE_MAX}) ${nullSql}`
  );
}

/** Empty address → NULL for optional patient residence. */
function normalizePatientAddress(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s ? s : null;
}

async function ensurePatientAddressColumn(pool) {
  const meta = await patientColumnMeta(pool, 'address');
  if (!meta) return;
  if (String(meta.nullable || '').toUpperCase() === 'YES') return;
  await pool.query('ALTER TABLE tbl_patient MODIFY COLUMN address TEXT NULL');
}

/** Ensures age_years + age_only_registration + widened phone + nullable address (MySQL 5.7–safe). */
async function ensurePatientAgeColumns(pool) {
  if (!(await patientColumnExists(pool, 'age_years'))) {
    await addPatientColumn(pool, 'ALTER TABLE tbl_patient ADD COLUMN age_years SMALLINT UNSIGNED NULL');
  }
  if (!(await patientColumnExists(pool, 'age_only_registration'))) {
    await addPatientColumn(
      pool,
      'ALTER TABLE tbl_patient ADD COLUMN age_only_registration TINYINT(1) NOT NULL DEFAULT 0'
    );
  }
  await ensurePatientPhoneColumn(pool);
  await ensurePatientAddressColumn(pool);
}

module.exports = {
  ageFromDob,
  dobFromAgeYears,
  isAgeOnlyPatient,
  patientDisplayAgeYears,
  patientShowsDob,
  resolvePatientDobAgeFromBody,
  normalizePatientPhone,
  normalizePatientAddress,
  ensurePatientPhoneColumn,
  ensurePatientAddressColumn,
  ensurePatientAgeColumns,
  PATIENT_PHONE_MAX,
};
