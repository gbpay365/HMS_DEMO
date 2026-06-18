'use strict';

const { normSpec, expandClinicalLabels, registerDoctorSpecialisation } = require('./hmsDoctorSpecialisations');

async function safeQuery(pool, sql) {
  try {
    await pool.query(sql);
  } catch (e) {
    console.warn('[hmsEmployeeClinicalLinks]', e.message || e);
  }
}

async function ensureEmployeeClinicalLinksSchema(pool) {
  await safeQuery(
    pool,
    `CREATE TABLE IF NOT EXISTS tbl_employee_department (
      id INT NOT NULL AUTO_INCREMENT,
      employee_id INT NOT NULL,
      department_name VARCHAR(120) NOT NULL,
      is_primary TINYINT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uq_emp_dept (employee_id, department_name(120)),
      KEY idx_emp_dept_employee (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await safeQuery(
    pool,
    `CREATE TABLE IF NOT EXISTS tbl_employee_doctor_specialisation (
      id INT NOT NULL AUTO_INCREMENT,
      employee_id INT NOT NULL,
      specialisation VARCHAR(120) NOT NULL,
      is_primary TINYINT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uq_emp_doc_spec (employee_id, specialisation(120)),
      KEY idx_emp_doc_spec_employee (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

function uniqLabels(values) {
  const out = [];
  const seen = new Set();
  for (const raw of values || []) {
    for (const label of expandClinicalLabels(raw)) {
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}

function parseMultiFromBody(body, arrayKey, scalarKey) {
  const b = body || {};
  let raw = b[arrayKey];
  if (raw === undefined || raw === null) raw = b[scalarKey];
  if (Array.isArray(raw)) return uniqLabels(raw);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return uniqLabels(parsed);
      } catch (_) {
        /* fall through */
      }
    }
    return uniqLabels(trimmed.split(/[,;|]/));
  }
  return [];
}

function parseDepartmentsFromBody(body) {
  const picked = parseMultiFromBody(body, 'departments', 'departments_json');
  const primary = normSpec(body?.primary_department);
  if (primary && !picked.some((d) => d.toLowerCase() === primary.toLowerCase())) {
    return [primary, ...picked];
  }
  if (!picked.length && primary) return [primary];
  return picked;
}

function parseSpecialisationsFromBody(body) {
  const picked = parseMultiFromBody(body, 'specialisations', 'specialisations_json');
  const legacy = normSpec(body?.specialisation);
  if (legacy && legacy !== '__new__' && !picked.some((s) => s.toLowerCase() === legacy.toLowerCase())) {
    return [legacy, ...picked];
  }
  if (!picked.length && legacy && legacy !== '__new__') return [legacy];
  const custom = normSpec(body?.specialisation_new || body?.specialisation_custom);
  if (custom && !picked.some((s) => s.toLowerCase() === custom.toLowerCase())) {
    return [custom, ...picked];
  }
  return picked;
}

function primaryLegacyFields(departments, specialisations) {
  return {
    primary_department: departments[0] || '',
    specialisation: specialisations[0] || null,
  };
}

async function loadEmployeeDepartments(pool, employeeId) {
  const [rows] = await pool
    .query(
      `SELECT department_name, is_primary, sort_order
       FROM tbl_employee_department
       WHERE employee_id=?
       ORDER BY is_primary DESC, sort_order ASC, department_name ASC`,
      [employeeId]
    )
    .catch(() => [[]]);
  return (rows || []).map((r) => normSpec(r.department_name)).filter(Boolean);
}

async function loadEmployeeSpecialisations(pool, employeeId) {
  const [rows] = await pool
    .query(
      `SELECT specialisation, is_primary, sort_order
       FROM tbl_employee_doctor_specialisation
       WHERE employee_id=?
       ORDER BY is_primary DESC, sort_order ASC, specialisation ASC`,
      [employeeId]
    )
    .catch(() => [[]]);
  return (rows || []).map((r) => normSpec(r.specialisation)).filter(Boolean);
}

async function syncEmployeeDepartments(pool, employeeId, departments) {
  await ensureEmployeeClinicalLinksSchema(pool);
  const list = uniqLabels(departments);
  await pool.query('DELETE FROM tbl_employee_department WHERE employee_id=?', [employeeId]).catch(() => {});
  for (let i = 0; i < list.length; i += 1) {
    await pool.query(
      `INSERT INTO tbl_employee_department (employee_id, department_name, is_primary, sort_order)
       VALUES (?, ?, ?, ?)`,
      [employeeId, list[i], i === 0 ? 1 : 0, i]
    );
  }
  return list;
}

async function syncEmployeeSpecialisations(pool, employeeId, specialisations) {
  await ensureEmployeeClinicalLinksSchema(pool);
  const list = uniqLabels(specialisations);
  await pool.query('DELETE FROM tbl_employee_doctor_specialisation WHERE employee_id=?', [employeeId]).catch(() => {});
  for (let i = 0; i < list.length; i += 1) {
    const label = list[i];
    await registerDoctorSpecialisation(pool, label);
    await pool.query(
      `INSERT INTO tbl_employee_doctor_specialisation (employee_id, specialisation, is_primary, sort_order)
       VALUES (?, ?, ?, ?)`,
      [employeeId, label, i === 0 ? 1 : 0, i]
    );
  }
  return list;
}

async function migrateLegacyEmployeeClinicalLinks(pool) {
  await ensureEmployeeClinicalLinksSchema(pool);
  const [rows] = await pool
    .query(
      `SELECT id, primary_department, specialisation FROM tbl_employee
       WHERE (primary_department IS NOT NULL AND TRIM(primary_department) <> '')
          OR (specialisation IS NOT NULL AND TRIM(specialisation) <> '')`
    )
    .catch(() => [[]]);
  for (const row of rows || []) {
    const id = row.id;
    const [deptCount] = await pool
      .query('SELECT COUNT(*) AS n FROM tbl_employee_department WHERE employee_id=?', [id])
      .catch(() => [[{ n: 0 }]]);
    if (!(deptCount[0]?.n > 0) && normSpec(row.primary_department)) {
      await syncEmployeeDepartments(pool, id, [row.primary_department]);
    }
    const [specCount] = await pool
      .query('SELECT COUNT(*) AS n FROM tbl_employee_doctor_specialisation WHERE employee_id=?', [id])
      .catch(() => [[{ n: 0 }]]);
    if (!(specCount[0]?.n > 0) && normSpec(row.specialisation)) {
      await syncEmployeeSpecialisations(pool, id, [row.specialisation]);
    }
  }
  await normalizeSplitClinicalLabels(pool);
}

async function normalizeSplitClinicalLabels(pool) {
  await ensureEmployeeClinicalLinksSchema(pool);
  const [empRows] = await pool
    .query(
      `SELECT id, primary_department, specialisation
       FROM tbl_employee
       WHERE LOWER(COALESCE(primary_department,'')) IN ('hematology and oncology','haematology and oncology','hematology & oncology','haematology & oncology')
          OR LOWER(COALESCE(specialisation,'')) IN ('hematologist and oncologist','haematologist and oncologist','hematologist & oncologist','haematologist & oncologist','hermatologist and oncologist','hermatologist & oncologist')`
    )
    .catch(() => [[]]);
  for (const row of empRows || []) {
    const deptExpanded = expandClinicalLabels(row.primary_department);
    const specExpanded = expandClinicalLabels(row.specialisation);
    if (deptExpanded.length > 1) {
      await pool.query('UPDATE tbl_employee SET primary_department=? WHERE id=?', [deptExpanded[0], row.id]).catch(() => {});
      await syncEmployeeDepartments(pool, row.id, deptExpanded);
    }
    if (specExpanded.length > 1) {
      await pool.query('UPDATE tbl_employee SET specialisation=? WHERE id=?', [specExpanded[0], row.id]).catch(() => {});
      await syncEmployeeSpecialisations(pool, row.id, specExpanded);
    }
  }

  const [deptRows] = await pool
    .query(
      `SELECT id, employee_id, department_name FROM tbl_employee_department
       WHERE LOWER(department_name) IN ('hematology and oncology','haematology and oncology','hematology & oncology','haematology & oncology')`
    )
    .catch(() => [[]]);
  for (const row of deptRows || []) {
    const current = await loadEmployeeDepartments(pool, row.employee_id);
    await syncEmployeeDepartments(pool, row.employee_id, current);
  }

  const [specRows] = await pool
    .query(
      `SELECT id, employee_id, specialisation FROM tbl_employee_doctor_specialisation
       WHERE LOWER(specialisation) IN ('hematologist and oncologist','haematologist and oncologist','hematologist & oncologist','haematologist & oncologist','hermatologist and oncologist','hermatologist & oncologist')`
    )
    .catch(() => [[]]);
  for (const row of specRows || []) {
    const current = await loadEmployeeSpecialisations(pool, row.employee_id);
    await syncEmployeeSpecialisations(pool, row.employee_id, current);
  }

  await pool
    .query(
      `UPDATE tbl_doctor_specialisation
       SET status=0
       WHERE LOWER(name) IN ('hematologist and oncologist','haematologist and oncologist','hematologist & oncologist','haematologist & oncologist','hermatologist and oncologist','hermatologist & oncologist','hematology and oncology','haematology and oncology','hematology & oncology','haematology & oncology')`
    )
    .catch(() => {});
}

/** SQL fragment: employee matches a department (primary or linked). */
function sqlEmployeeDepartmentMatch(columnExpr, paramPlaceholder) {
  return `(
    TRIM(LOWER(${columnExpr})) = TRIM(LOWER(${paramPlaceholder}))
    OR EXISTS (
      SELECT 1 FROM tbl_employee_department ed
      WHERE ed.employee_id = e.id
        AND TRIM(LOWER(ed.department_name)) = TRIM(LOWER(${paramPlaceholder}))
    )
  )`;
}

module.exports = {
  ensureEmployeeClinicalLinksSchema,
  parseDepartmentsFromBody,
  parseSpecialisationsFromBody,
  primaryLegacyFields,
  loadEmployeeDepartments,
  loadEmployeeSpecialisations,
  syncEmployeeDepartments,
  syncEmployeeSpecialisations,
  migrateLegacyEmployeeClinicalLinks,
  normalizeSplitClinicalLabels,
  sqlEmployeeDepartmentMatch,
};
