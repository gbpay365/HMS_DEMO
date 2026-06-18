'use strict';

function normClinicalLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseClinicalList(value) {
  if (Array.isArray(value)) {
    return value.map(normClinicalLabel).filter(Boolean);
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normClinicalLabel).filter(Boolean);
    } catch (_) {
      /* fall through */
    }
  }
  return raw.split(/[,;|]/).map(normClinicalLabel).filter(Boolean);
}

function uniqClinicalLabels(values) {
  const out = [];
  const seen = new Set();
  for (const label of values || []) {
    const norm = normClinicalLabel(label);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}

function doctorClinicalDepartments(doc) {
  const fromArrays = [
    ...(Array.isArray(doc?.departments) ? doc.departments : []),
    ...parseClinicalList(doc?.departments_all),
  ];
  const legacy = normClinicalLabel(doc?.primary_department);
  if (legacy) fromArrays.unshift(legacy);
  return uniqClinicalLabels(fromArrays);
}

function doctorClinicalSpecialisations(doc) {
  const fromArrays = [
    ...(Array.isArray(doc?.specialisations) ? doc.specialisations : []),
    ...parseClinicalList(doc?.specialisations_all),
  ];
  const legacy = normClinicalLabel(doc?.specialisation);
  if (legacy) fromArrays.unshift(legacy);
  return uniqClinicalLabels(fromArrays);
}

function doctorMatchesDepartment(doc, departmentName) {
  const want = normClinicalLabel(departmentName).toLowerCase();
  if (!want) return true;
  return doctorClinicalDepartments(doc).some((label) => label.toLowerCase() === want);
}

function labelsMatchSpecialisation(label, want) {
  const l = normClinicalLabel(label).toLowerCase();
  const w = normClinicalLabel(want).toLowerCase();
  if (!l || !w) return false;
  return l === w || l.includes(w) || w.includes(l);
}

function doctorMatchesSpecialisation(doc, specialisationName) {
  const want = normClinicalLabel(specialisationName);
  if (!want) return true;
  return doctorClinicalSpecialisations(doc).some((label) => labelsMatchSpecialisation(label, want));
}

function filterDoctorsByDepartment(doctors, departmentName) {
  const want = normClinicalLabel(departmentName);
  if (!want) return doctors || [];
  return (doctors || []).filter((doc) => doctorMatchesDepartment(doc, want));
}

/** Appointment / portal booking: department pick matches assigned dept or same-named specialty. */
function filterDoctorsForBookingDepartment(doctors, departmentName) {
  const want = normClinicalLabel(departmentName);
  if (!want) return doctors || [];
  return (doctors || []).filter(
    (doc) => doctorMatchesDepartment(doc, want) || doctorMatchesSpecialisation(doc, want)
  );
}

function filterDoctorsBySpecialisation(doctors, specialisationName) {
  const want = normClinicalLabel(specialisationName);
  if (!want) return doctors || [];
  return (doctors || []).filter((doc) => doctorMatchesSpecialisation(doc, want));
}

/** When both criteria are set, the doctor must match both. */
function filterDoctorsByClinicalCriteria(doctors, { department, specialisation } = {}) {
  let list = doctors || [];
  const dept = normClinicalLabel(department);
  const spec = normClinicalLabel(specialisation);
  if (dept) list = filterDoctorsByDepartment(list, dept);
  if (spec) list = filterDoctorsBySpecialisation(list, spec);
  return list;
}

async function enrichDoctorsWithClinicalLinks(pool, doctors) {
  const list = Array.isArray(doctors) ? doctors : [];
  if (!list.length) return list;
  const { ensureEmployeeClinicalLinksSchema } = require('./hmsEmployeeClinicalLinks');
  await ensureEmployeeClinicalLinksSchema(pool);
  const ids = list.map((d) => parseInt(d.id, 10)).filter((id) => id > 0);
  if (!ids.length) return list;

  const [deptRows] = await pool
    .query(
      `SELECT employee_id, department_name
         FROM tbl_employee_department
        WHERE employee_id IN (?)
        ORDER BY is_primary DESC, sort_order ASC, department_name ASC`,
      [ids]
    )
    .catch(() => [[]]);
  const [specRows] = await pool
    .query(
      `SELECT employee_id, specialisation
         FROM tbl_employee_doctor_specialisation
        WHERE employee_id IN (?)
        ORDER BY is_primary DESC, sort_order ASC, specialisation ASC`,
      [ids]
    )
    .catch(() => [[]]);

  const deptMap = new Map();
  const specMap = new Map();
  for (const row of deptRows || []) {
    const id = parseInt(row.employee_id, 10);
    if (!deptMap.has(id)) deptMap.set(id, []);
    deptMap.get(id).push(normClinicalLabel(row.department_name));
  }
  for (const row of specRows || []) {
    const id = parseInt(row.employee_id, 10);
    if (!specMap.has(id)) specMap.set(id, []);
    specMap.get(id).push(normClinicalLabel(row.specialisation));
  }

  return list.map((doc) => {
    const id = parseInt(doc.id, 10);
    const departments = uniqClinicalLabels([
      ...doctorClinicalDepartments(doc),
      ...(deptMap.get(id) || []),
    ]);
    const specialisations = uniqClinicalLabels([
      ...doctorClinicalSpecialisations(doc),
      ...(specMap.get(id) || []),
    ]);
    return {
      ...doc,
      departments,
      specialisations,
      departments_all: departments.join(', '),
      specialisations_all: specialisations.join(', '),
    };
  });
}

async function employeeMatchesDepartment(pool, employeeId, departmentName) {
  const id = parseInt(employeeId, 10);
  const dept = normClinicalLabel(departmentName);
  if (!id || !dept) return !dept;
  const { ensureEmployeeClinicalLinksSchema } = require('./hmsEmployeeClinicalLinks');
  await ensureEmployeeClinicalLinksSchema(pool);
  const [[row]] = await pool
    .query(
      `SELECT 1 AS ok
         FROM tbl_employee e
        WHERE e.id = ?
          AND (
            TRIM(LOWER(e.primary_department)) = TRIM(LOWER(?))
            OR EXISTS (
              SELECT 1 FROM tbl_employee_department ed
               WHERE ed.employee_id = e.id
                 AND TRIM(LOWER(ed.department_name)) = TRIM(LOWER(?))
            )
          )
        LIMIT 1`,
      [id, dept, dept]
    )
    .catch(() => [[null]]);
  return !!(row && row.ok);
}

async function employeeMatchesSpecialisation(pool, employeeId, specialisationName) {
  const id = parseInt(employeeId, 10);
  const spec = normClinicalLabel(specialisationName);
  if (!id || !spec) return !spec;
  const { ensureEmployeeClinicalLinksSchema } = require('./hmsEmployeeClinicalLinks');
  await ensureEmployeeClinicalLinksSchema(pool);
  const [rows] = await pool
    .query(
      `SELECT TRIM(specialisation) AS label
         FROM tbl_employee_doctor_specialisation
        WHERE employee_id = ?
        UNION
       SELECT TRIM(specialisation) AS label
         FROM tbl_employee
        WHERE id = ? AND specialisation IS NOT NULL AND TRIM(specialisation) <> ''`,
      [id, id]
    )
    .catch(() => [[]]);
  return (rows || []).some((row) => labelsMatchSpecialisation(row.label, spec));
}

module.exports = {
  normClinicalLabel,
  parseClinicalList,
  doctorClinicalDepartments,
  doctorClinicalSpecialisations,
  doctorMatchesDepartment,
  doctorMatchesSpecialisation,
  filterDoctorsByDepartment,
  filterDoctorsForBookingDepartment,
  filterDoctorsBySpecialisation,
  filterDoctorsByClinicalCriteria,
  enrichDoctorsWithClinicalLinks,
  employeeMatchesDepartment,
  employeeMatchesSpecialisation,
};
