'use strict';

const { dobFromAgeYears } = require('./patientAge');
const { resolveInsertPatientId } = require('./patientDirectory');

function normalizeGender(gender) {
  const g = String(gender || '').trim();
  return g === 'Female' ? 'Female' : 'Male';
}

function resolveQuickRegBirth({ dob, age }) {
  let ageYearsFinal = null;
  let ageOnlyFinal = 0;
  let computedDob = String(dob ?? '').trim() || null;
  const ageStr = age === '' || age == null ? '' : String(age).trim();
  if (!computedDob && ageStr) {
    const yrs = parseInt(ageStr, 10);
    if (yrs > 0 && yrs < 130) {
      computedDob = dobFromAgeYears(yrs);
      ageYearsFinal = yrs;
      ageOnlyFinal = 1;
    }
  }
  if (!computedDob) {
    computedDob = new Date().toISOString().slice(0, 10);
    ageOnlyFinal = 1;
  }
  return { dob: computedDob, age_years: ageYearsFinal, age_only_registration: ageOnlyFinal };
}

/**
 * Minimal patient row for ER quick registration — satisfies tbl_patient NOT NULL columns on PostgreSQL.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ first_name?: string, last_name?: string, gender?: string, dob?: string, age?: string|number, phone?: string, facility_id?: number }} opts
 */
async function createErQuickPatient(conn, opts = {}) {
  const fn = String(opts.first_name || '').trim() || 'Unknown';
  const ln = String(opts.last_name || '').trim() || `ER-${Date.now().toString().slice(-6)}`;
  const gender = normalizeGender(opts.gender);
  const birth = resolveQuickRegBirth({ dob: opts.dob, age: opts.age });
  const phoneForInsert = String(opts.phone ?? '').trim() || '000000000';
  const patientType = String(opts.patient_type || 'OutPatient').trim() || 'OutPatient';
  const facilityId = Math.max(1, parseInt(String(opts.facility_id ?? 1), 10) || 1);
  const address = String(opts.address ?? '').trim() || 'Emergency registration';

  const ensurePatientCodeSchema = require('./ensurePatientCodeSchema');
  const { allocateNextPatientCodeLocked } = require('./hmsPatientCode');
  await ensurePatientCodeSchema(conn).catch(() => {});

  const patientCode = await allocateNextPatientCodeLocked(conn);
  const email = `er-${String(patientCode).toLowerCase()}@emergency.local`;

  const [ins] = await conn.query(
    `INSERT INTO tbl_patient
       (patient_code, first_name, last_name, gender, dob, age_years, age_only_registration,
        phone, email, address, patient_type, portal_enabled, status, facility_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
    [
      patientCode,
      fn,
      ln,
      gender,
      birth.dob,
      birth.age_years,
      birth.age_only_registration,
      phoneForInsert,
      email,
      address,
      patientType,
      0,
      1,
      facilityId,
    ]
  );

  const patientId = await resolveInsertPatientId(conn, ins);
  if (!patientId) throw new Error('Could not create emergency patient record');
  return { patientId, patientCode, email };
}

module.exports = {
  createErQuickPatient,
  normalizeGender,
  resolveQuickRegBirth,
};
