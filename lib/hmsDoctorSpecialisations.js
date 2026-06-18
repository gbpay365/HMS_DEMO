'use strict';

const { DOCTOR_TITLE_REGEXP, LEGACY_DOCTOR_ROLE } = require('./hmsDoctorStaff');

/** Clinical specialties for physician profiles (merged with tbl_department on load). */
const DEFAULT_SPECIALISATIONS = Object.freeze([
  'General Practitioner',
  'General Medicine',
  'Family Medicine',
  'Internal Medicine',
  'Emergency / A&E',
  'General Surgery',
  'Cardiology',
  'Pediatrics',
  'Obstetrics & Gynecology',
  'Orthopedics',
  'Dermatology',
  'Ophthalmology',
  'ENT / Otorhinolaryngology',
  'Neurology',
  'Nephrology',
  'Urology',
  'Hematology',
  'Oncology',
  'Hematologist',
  'Oncologist',
  'Gastroenterology',
  'Pulmonology',
  'Psychiatry',
  'Anesthesiology',
  'Radiology',
  'Pathology',
  'Critical Care / ICU',
  'Physical Medicine & Rehabilitation',
  'Allergy & Immunology',
]);

function normSpec(value) {
  return String(value || '').trim().slice(0, 120);
}

function expandClinicalLabels(value) {
  const label = normSpec(value);
  if (!label) return [];
  const key = label.toLowerCase().replace(/\s+/g, ' ').trim();
  if (
    key === 'hematology and oncology' ||
    key === 'haematology and oncology' ||
    key === 'hematology & oncology' ||
    key === 'haematology & oncology'
  ) {
    return ['Hematology', 'Oncology'];
  }
  if (
    key === 'hematologist and oncologist' ||
    key === 'haematologist and oncologist' ||
    key === 'hematologist & oncologist' ||
    key === 'haematologist & oncologist' ||
    key === 'hermatologist and oncologist' ||
    key === 'hermatologist & oncologist'
  ) {
    return ['Hematologist', 'Oncologist'];
  }
  return [label];
}

async function ensureSpecialisationRemovedTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_doctor_specialisation_removed (
      name VARCHAR(120) NOT NULL,
      removed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (name(120))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => {});
}

async function loadSuppressedSpecialisationNames(pool) {
  await ensureSpecialisationRemovedTable(pool);
  const [rows] = await pool.query(
    'SELECT LOWER(TRIM(name)) AS n FROM tbl_doctor_specialisation_removed'
  ).catch(() => [[]]);
  return new Set((rows || []).map((r) => String(r.n || '').trim()).filter(Boolean));
}

/** Record an admin-removed catalog label so default seeding does not restore it. */
async function suppressSpecialisation(pool, name) {
  const label = normSpec(name);
  if (!label) return;
  await ensureSpecialisationRemovedTable(pool);
  await pool.query(
    'INSERT IGNORE INTO tbl_doctor_specialisation_removed (name) VALUES (?)',
    [label]
  ).catch(() => {});
}

/** Allow a label back into the catalog after explicit admin or staff assignment. */
async function unsuppressSpecialisation(pool, name) {
  const label = normSpec(name);
  if (!label) return;
  await ensureSpecialisationRemovedTable(pool);
  await pool.query(
    'DELETE FROM tbl_doctor_specialisation_removed WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
    [label]
  ).catch(() => {});
}

async function ensureDoctorSpecialisationCatalog(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_doctor_specialisation (
      id INT NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      status TINYINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_doctor_spec_name (name(120))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => {});
  const suppressed = await loadSuppressedSpecialisationNames(pool);
  for (const label of DEFAULT_SPECIALISATIONS) {
    if (suppressed.has(label.toLowerCase())) continue;
    await pool.query(
      'INSERT IGNORE INTO tbl_doctor_specialisation (name, status) VALUES (?, 1)',
      [label]
    ).catch(() => {});
  }
}

/** Persist a specialisation label in the shared catalog (for dropdown reuse). */
async function registerDoctorSpecialisation(pool, name) {
  const label = normSpec(name);
  if (!label) return null;
  await ensureDoctorSpecialisationCatalog(pool);
  await unsuppressSpecialisation(pool, label);
  await pool.query(
    `INSERT INTO tbl_doctor_specialisation (name, status) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE status = 1`,
    [label]
  ).catch(() => {});
  return label;
}

function isDoctorRoleTitle(title) {
  return new RegExp(DOCTOR_TITLE_REGEXP, 'i').test(String(title || ''));
}

function isDoctorRoleId(roleId, doctorRoleIds) {
  const key = String(roleId ?? '').trim();
  if (!key) return false;
  return (doctorRoleIds || []).some((id) => String(id) === key);
}

/** Role ids whose tbl_role.title matches doctor (plus legacy role 2). */
async function resolveDoctorRoleIds(pool) {
  const ids = new Set([String(LEGACY_DOCTOR_ROLE)]);
  try {
    const [rows] = await pool.query(
      `SELECT CAST(role AS CHAR) AS role_key FROM tbl_role WHERE title REGEXP ?`,
      [DOCTOR_TITLE_REGEXP]
    );
    for (const r of rows || []) {
      const k = String(r.role_key ?? '').trim();
      if (k) ids.add(k);
    }
  } catch (_) {
    /* tbl_role optional during setup */
  }
  return [...ids];
}

/** Sorted unique specialisation labels for doctor dropdowns. */
async function listDoctorSpecialisations(pool) {
  const seen = new Map();
  await ensureDoctorSpecialisationCatalog(pool);
  try {
    const [catalogRows] = await pool.query(
      `SELECT name FROM tbl_doctor_specialisation
       WHERE status = 1 AND name IS NOT NULL AND TRIM(name) <> ''
       ORDER BY name`
    );
    for (const r of catalogRows || []) {
      const label = normSpec(r.name);
      if (expandClinicalLabels(label).length > 1) continue;
      if (label) seen.set(label.toLowerCase(), label);
    }
  } catch (_) {
    /* table may not exist yet */
  }
  const suppressed = await loadSuppressedSpecialisationNames(pool);
  for (const label of DEFAULT_SPECIALISATIONS) {
    const k = label.toLowerCase();
    if (suppressed.has(k)) continue;
    if (!seen.has(k)) seen.set(k, label);
  }
  try {
    const [deptRows] = await pool.query(
      `SELECT department_name FROM tbl_department
       WHERE status = 1 AND department_name IS NOT NULL AND TRIM(department_name) <> ''
       ORDER BY department_name`
    );
    for (const r of deptRows || []) {
      for (const label of expandClinicalLabels(r.department_name)) {
        if (label) seen.set(label.toLowerCase(), label);
      }
    }
  } catch (_) {
    /* ignore */
  }
  try {
    const [empRows] = await pool.query(
      `SELECT DISTINCT TRIM(specialisation) AS spec FROM tbl_employee
       WHERE status = 1 AND specialisation IS NOT NULL AND TRIM(specialisation) <> ''`
    );
    for (const r of empRows || []) {
      for (const label of expandClinicalLabels(r.spec)) {
        if (label) seen.set(label.toLowerCase(), label);
      }
    }
  } catch (_) {
    /* column may not exist yet */
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function resolveSpecialisationFromBody(body) {
  const b = body || {};
  const pick = normSpec(b.specialisation);
  if (pick && pick !== '__new__') return pick;
  return normSpec(b.specialisation_new || b.specialisation_custom);
}

function parseDoctorSpecialisation(body, roleId, doctorRoleIds) {
  if (!isDoctorRoleId(roleId, doctorRoleIds)) return '';
  return resolveSpecialisationFromBody(body);
}

function requireDoctorSpecialisation(roleId, body, doctorRoleIds) {
  const specs = requireDoctorSpecialisations(roleId, body, doctorRoleIds);
  return specs[0] || '';
}

function requireDoctorSpecialisations(roleId, body, doctorRoleIds) {
  if (!isDoctorRoleId(roleId, doctorRoleIds)) return [];
  const { parseSpecialisationsFromBody } = require('./hmsEmployeeClinicalLinks');
  const specs = parseSpecialisationsFromBody(body);
  if (!specs.length) {
    const err = new Error('At least one specialisation is required when the role is Doctor.');
    err.code = 'DOCTOR_SPEC_REQUIRED';
    throw err;
  }
  return specs;
}

function requireDoctorDepartments(roleId, body, doctorRoleIds) {
  if (!isDoctorRoleId(roleId, doctorRoleIds)) return [];
  const { parseDepartmentsFromBody } = require('./hmsEmployeeClinicalLinks');
  const depts = parseDepartmentsFromBody(body);
  if (!depts.length) {
    const err = new Error('At least one department is required when the role is Doctor.');
    err.code = 'DOCTOR_DEPT_REQUIRED';
    throw err;
  }
  return depts;
}

module.exports = {
  DEFAULT_SPECIALISATIONS,
  normSpec,
  expandClinicalLabels,
  isDoctorRoleTitle,
  isDoctorRoleId,
  resolveDoctorRoleIds,
  ensureDoctorSpecialisationCatalog,
  suppressSpecialisation,
  unsuppressSpecialisation,
  registerDoctorSpecialisation,
  listDoctorSpecialisations,
  resolveSpecialisationFromBody,
  parseDoctorSpecialisation,
  requireDoctorSpecialisation,
  requireDoctorSpecialisations,
  requireDoctorDepartments,
};
