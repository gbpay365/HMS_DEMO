'use strict';

const { normalizePatientPhone, isAgeOnlyPatient, ageFromDob } = require('./patientAge');
const { parseDobIso, normalizeNamePart } = require('./patientIdentityKey');

/**
 * Same DOB or same registered age (age-only mode).
 */
function birthIdentityMatches(row, dobFinal, ageYearsFinal, ageOnlyFinal) {
  const rowAgeOnly = isAgeOnlyPatient(row);
  const newAgeOnly = ageOnlyFinal === 1 || ageOnlyFinal === true;

  if (newAgeOnly && rowAgeOnly) {
    const a = parseInt(row.age_years, 10);
    const b = parseInt(ageYearsFinal, 10);
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  }

  const isoNew = parseDobIso(dobFinal);
  const isoRow = parseDobIso(row.dob);
  if (isoNew && isoRow) return isoNew === isoRow;

  if (dobFinal && row.dob && String(dobFinal).trim() === String(row.dob).trim()) {
    return true;
  }

  if (newAgeOnly && !rowAgeOnly && isoRow && ageYearsFinal != null) {
    return ageFromDob(isoRow) === parseInt(ageYearsFinal, 10);
  }
  if (!newAgeOnly && rowAgeOnly && isoNew && row.age_years != null) {
    return ageFromDob(isoNew) === parseInt(row.age_years, 10);
  }

  return false;
}

/**
 * Find an active patient with same name + phone + DOB/age.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} pool
 * @param {{ first_name: string, last_name: string, phone: string, dob?: string|null, age_years?: number|null, age_only_registration?: 0|1, excludeId?: number }} opts
 * @returns {Promise<{ id: number, first_name: string, last_name: string }|null>}
 */
async function findDuplicatePatient(pool, opts) {
  const fn = normalizeNamePart(opts.first_name);
  const ln = normalizeNamePart(opts.last_name);
  const phone = normalizePatientPhone(opts.phone);
  if (!fn || !ln || !phone) return null;

  const excludeId = parseInt(opts.excludeId, 10) || 0;
  const params = [fn, ln];
  let excludeSql = '';
  if (excludeId > 0) {
    excludeSql = ' AND id <> ?';
    params.push(excludeId);
  }

  const [rows] = await pool.query(
    `SELECT id, first_name, last_name, dob, age_years, age_only_registration, phone
     FROM tbl_patient
     WHERE ${require('./patientDirectory').patientActiveWhere('', pool)}
       AND LOWER(TRIM(first_name)) = ?
       AND LOWER(TRIM(last_name)) = ?
       ${excludeSql}
     ORDER BY id ASC
     LIMIT 50`,
    params
  );

  const dobFinal = opts.dob != null ? opts.dob : null;
  const ageYearsFinal = opts.age_years;
  const ageOnlyFinal = opts.age_only_registration;

  for (const row of rows || []) {
    if (normalizePatientPhone(row.phone) !== phone) continue;
    if (birthIdentityMatches(row, dobFinal, ageYearsFinal, ageOnlyFinal)) {
      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
      };
    }
  }
  return null;
}

function duplicatePatientMessage(dup) {
  const name = `${dup.first_name || ''} ${dup.last_name || ''}`.trim() || 'Patient';
  return (
    `A patient with the same name, date of birth/age, and phone already exists ` +
    `(#${dup.id} — ${name}). Open their record instead of creating a duplicate.`
  );
}

const {
  patientIdentityCompositeKey,
  groupPatientsByIdentityKey,
} = require('./patientIdentityKey');

module.exports = {
  findDuplicatePatient,
  duplicatePatientMessage,
  birthIdentityMatches,
  parseDobIso,
  patientIdentityCompositeKey,
  groupPatientsByIdentityKey,
};
