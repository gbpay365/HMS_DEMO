'use strict';

/** Legacy tbl_employee.role id used before custom role catalogues. */
const LEGACY_DOCTOR_ROLE = 2;

const DOCTOR_TITLE_REGEXP =
  'Doctor|Physician|M[eé]decin|Specialist|Sp[eé]cialiste';

const EXCLUDED_EMPLOYEE_ROLES = Object.freeze([1, 99]);

/**
 * SQL fragment + params for active clinical doctors.
 * Matches tbl_role.title (e.g. role 100 = Doctor) and legacy role=2 when no custom doctor roles exist.
 */
function doctorEmployeeWhereSql() {
  const vdList = require('./visitingDoctor').VISITING_DOCTOR_USERNAMES.map((u) => `'${u}'`).join(',');
  return `e.status = 1
    AND CAST(e.role AS UNSIGNED) NOT IN (1, 99)
    AND (
      UPPER(e.username) NOT IN (${vdList})
      OR (
        e.visiting_account_status = 'active'
        AND e.profile_setup_complete = 1
      )
    )
    AND (
      r.title REGEXP ?
      OR (
        CAST(e.role AS UNSIGNED) = ?
        AND NOT EXISTS (
          SELECT 1 FROM tbl_role dr
          WHERE dr.title REGEXP ?
        )
      )
    )`;
}

function doctorEmployeeWhereParams() {
  return [DOCTOR_TITLE_REGEXP, LEGACY_DOCTOR_ROLE, DOCTOR_TITLE_REGEXP];
}

/** Active doctors for dashboard, directory, OPD dropdowns, etc. */
async function fetchActiveDoctors(pool, columns = 'e.id, e.first_name, e.last_name, e.bio, e.primary_department, e.specialisation') {
  const where = doctorEmployeeWhereSql();
  const params = doctorEmployeeWhereParams();
  const baseFrom = `FROM tbl_employee e
         LEFT JOIN tbl_role r ON CAST(r.role AS UNSIGNED) = CAST(e.role AS UNSIGNED)`;
  const order = 'ORDER BY e.first_name, e.last_name';

  async function runQuery(cols) {
    const [rows] = await pool.query(`SELECT ${cols} ${baseFrom} WHERE ${where} ${order}`, params);
    return rows || [];
  }

  try {
    return await runQuery(columns);
  } catch (err) {
    console.warn('[fetchActiveDoctors]', err.message || err);
    const fallbacks = [
      'e.id, e.first_name, e.last_name, e.primary_department, e.specialisation',
      'e.id, e.first_name, e.last_name, e.primary_department',
      'e.id, e.first_name, e.last_name',
    ];
    for (const cols of fallbacks) {
      if (cols === columns) continue;
      try {
        const rows = await runQuery(cols);
        if (rows.length) return rows;
      } catch (_) {}
    }
    return [];
  }
}

async function fetchActiveDoctorsWithClinicalLinks(pool, columns = 'e.id, e.first_name, e.last_name, e.bio, e.primary_department, e.specialisation') {
  const rows = await fetchActiveDoctors(pool, columns);
  try {
    const { enrichDoctorsWithClinicalLinks } = require('./hmsDoctorClinicalFilter');
    return await enrichDoctorsWithClinicalLinks(pool, rows);
  } catch (e) {
    console.warn('[fetchActiveDoctorsWithClinicalLinks]', e.message || e);
    return rows;
  }
}

async function countActiveDoctors(pool) {
  const rows = await fetchActiveDoctors(pool, 'e.id');
  return rows.length;
}

module.exports = {
  LEGACY_DOCTOR_ROLE,
  DOCTOR_TITLE_REGEXP,
  EXCLUDED_EMPLOYEE_ROLES,
  doctorEmployeeWhereSql,
  doctorEmployeeWhereParams,
  fetchActiveDoctors,
  fetchActiveDoctorsWithClinicalLinks,
  countActiveDoctors,
};
