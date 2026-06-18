'use strict';

const {
  ensureDoctorSpecialisationCatalog,
  normSpec,
  registerDoctorSpecialisation,
  suppressSpecialisation,
} = require('./hmsDoctorSpecialisations');

async function ensureDepartmentTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_department (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      department_name  VARCHAR(120) NOT NULL,
      description      VARCHAR(500) NOT NULL DEFAULT '',
      status           TINYINT(1)   NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  const [dups] = await pool.query(`
    SELECT TRIM(LOWER(department_name)) AS norm,
           MIN(id) AS keep_id,
           GROUP_CONCAT(id ORDER BY id) AS all_ids
      FROM tbl_department
     GROUP BY TRIM(LOWER(department_name))
    HAVING COUNT(*) > 1
  `).catch(() => [[]]);

  for (const row of dups || []) {
    const ids = String(row.all_ids).split(',').map(Number);
    const keepId = Number(row.keep_id);
    const dropIds = ids.filter((i) => i !== keepId);
    if (!dropIds.length) continue;

    const [[keep]] = await pool.query(
      'SELECT department_name FROM tbl_department WHERE id=? LIMIT 1',
      [keepId]
    ).catch(() => [[null]]);
    const keepName = keep && keep.department_name ? keep.department_name : null;
    if (keepName) {
      await pool.query(
        `UPDATE tbl_employee SET primary_department=?
          WHERE TRIM(LOWER(primary_department)) = ?`,
        [keepName, row.norm]
      ).catch(() => {});
      await pool.query(
        `UPDATE tbl_employee_department SET department_name=?
          WHERE TRIM(LOWER(department_name)) = ?`,
        [keepName, row.norm]
      ).catch(() => {});
    }
    await pool.query('DELETE FROM tbl_department WHERE id IN (?)', [dropIds]).catch(() => {});
  }

  try {
    const [hasIdx] = await pool.query(`
      SELECT 1 FROM information_schema.STATISTICS
       WHERE table_schema = DATABASE()
         AND table_name   = 'tbl_department'
         AND index_name   = 'uk_dept_name'
       LIMIT 1
    `);
    if (!hasIdx.length) {
      await pool.query('ALTER TABLE tbl_department ADD UNIQUE KEY uk_dept_name (department_name)');
    }
  } catch (_) { /* best effort */ }

  try {
    const [hasDesc] = await pool.query(`
      SELECT 1 FROM information_schema.COLUMNS
       WHERE table_schema = DATABASE()
         AND table_name   = 'tbl_department'
         AND column_name  = 'description'
       LIMIT 1
    `);
    if (!hasDesc.length) {
      await pool.query(
        "ALTER TABLE tbl_department ADD COLUMN description VARCHAR(500) NOT NULL DEFAULT ''"
      );
    }
  } catch (_) { /* best effort */ }
}

async function listDepartments(pool) {
  await ensureDepartmentTable(pool);
  const [rows] = await pool.query(
    'SELECT id, department_name AS name, status FROM tbl_department ORDER BY department_name'
  ).catch(() => [[]]);
  return rows || [];
}

async function getDepartmentById(pool, id) {
  const [[row]] = await pool.query(
    'SELECT id, department_name AS name, status FROM tbl_department WHERE id=? LIMIT 1',
    [id]
  ).catch(() => [[null]]);
  return row || null;
}

async function countDepartmentUsage(pool, departmentName) {
  const norm = String(departmentName || '').trim().toLowerCase();
  if (!norm) return 0;
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT e.id) AS n
       FROM tbl_employee e
       LEFT JOIN tbl_employee_department ed ON ed.employee_id = e.id
      WHERE TRIM(LOWER(e.primary_department)) = ?
         OR TRIM(LOWER(ed.department_name)) = ?`,
    [norm, norm]
  ).catch(() => [[{ n: 0 }]]);
  return parseInt(row && row.n, 10) || 0;
}

async function addDepartment(pool, name) {
  const label = String(name || '').trim();
  if (!label) throw Object.assign(new Error('Department name is required.'), { code: 'DEPT_NAME_REQUIRED' });
  await ensureDepartmentTable(pool);
  await pool.query(
    'INSERT INTO tbl_department (department_name, status, description) VALUES (?, 1, ?)',
    [label, '']
  );
}

async function renameDepartment(pool, id, name) {
  const deptId = parseInt(id, 10);
  const label = String(name || '').trim();
  if (!deptId || !label) throw Object.assign(new Error('Invalid department data.'), { code: 'DEPT_INVALID' });
  const current = await getDepartmentById(pool, deptId);
  if (!current) throw Object.assign(new Error('Department not found.'), { code: 'DEPT_NOT_FOUND' });
  if (current.name === label) return;
  await pool.query('UPDATE tbl_department SET department_name=? WHERE id=?', [label, deptId]);
  await pool.query(
    `UPDATE tbl_employee SET primary_department=?
      WHERE TRIM(LOWER(primary_department)) = TRIM(LOWER(?))`,
    [label, current.name]
  ).catch(() => {});
  await pool.query(
    `UPDATE tbl_employee_department SET department_name=?
      WHERE TRIM(LOWER(department_name)) = TRIM(LOWER(?))`,
    [label, current.name]
  ).catch(() => {});
}

async function toggleDepartment(pool, id) {
  const deptId = parseInt(id, 10);
  if (!deptId) throw Object.assign(new Error('Invalid department.'), { code: 'DEPT_INVALID' });
  const current = await getDepartmentById(pool, deptId);
  if (!current) throw Object.assign(new Error('Department not found.'), { code: 'DEPT_NOT_FOUND' });
  const status = current.status ? 0 : 1;
  await pool.query('UPDATE tbl_department SET status=? WHERE id=?', [status, deptId]);
  return status;
}

async function deleteDepartment(pool, id) {
  const deptId = parseInt(id, 10);
  if (!deptId) throw Object.assign(new Error('Invalid department.'), { code: 'DEPT_INVALID' });
  const current = await getDepartmentById(pool, deptId);
  if (!current) throw Object.assign(new Error('Department not found.'), { code: 'DEPT_NOT_FOUND' });
  const inUse = await countDepartmentUsage(pool, current.name);
  if (inUse > 0) {
    throw Object.assign(
      new Error(`Cannot delete — ${inUse} staff member(s) assigned to this department.`),
      { code: 'DEPT_IN_USE' }
    );
  }
  await pool.query('DELETE FROM tbl_department WHERE id=?', [deptId]);
}

async function listSpecialisationCatalog(pool) {
  await ensureDoctorSpecialisationCatalog(pool);
  const [rows] = await pool.query(
    'SELECT id, name, status FROM tbl_doctor_specialisation ORDER BY name'
  ).catch(() => [[]]);
  return rows || [];
}

async function getSpecialisationById(pool, id) {
  const [[row]] = await pool.query(
    'SELECT id, name, status FROM tbl_doctor_specialisation WHERE id=? LIMIT 1',
    [id]
  ).catch(() => [[null]]);
  return row || null;
}

async function countSpecialisationUsage(pool, name) {
  const norm = normSpec(name).toLowerCase();
  if (!norm) return 0;
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT src.employee_id) AS n
       FROM (
         SELECT id AS employee_id FROM tbl_employee
          WHERE TRIM(LOWER(specialisation)) = ?
         UNION
         SELECT employee_id FROM tbl_employee_doctor_specialisation
          WHERE TRIM(LOWER(specialisation)) = ?
       ) src`,
    [norm, norm]
  ).catch(() => [[{ n: 0 }]]);
  return parseInt(row && row.n, 10) || 0;
}

async function addSpecialisation(pool, name) {
  const label = normSpec(name);
  if (!label) throw Object.assign(new Error('Specialisation name is required.'), { code: 'SPEC_NAME_REQUIRED' });
  await registerDoctorSpecialisation(pool, label);
}

async function renameSpecialisation(pool, id, name) {
  const specId = parseInt(id, 10);
  const label = normSpec(name);
  if (!specId || !label) throw Object.assign(new Error('Invalid specialisation data.'), { code: 'SPEC_INVALID' });
  const current = await getSpecialisationById(pool, specId);
  if (!current) throw Object.assign(new Error('Specialisation not found.'), { code: 'SPEC_NOT_FOUND' });
  if (current.name === label) return;
  await pool.query('UPDATE tbl_doctor_specialisation SET name=? WHERE id=?', [label, specId]);
  await pool.query(
    `UPDATE tbl_employee SET specialisation=?
      WHERE TRIM(LOWER(specialisation)) = TRIM(LOWER(?))`,
    [label, current.name]
  ).catch(() => {});
  await pool.query(
    `UPDATE tbl_employee_doctor_specialisation SET specialisation=?
      WHERE TRIM(LOWER(specialisation)) = TRIM(LOWER(?))`,
    [label, current.name]
  ).catch(() => {});
}

async function toggleSpecialisation(pool, id) {
  const specId = parseInt(id, 10);
  if (!specId) throw Object.assign(new Error('Invalid specialisation.'), { code: 'SPEC_INVALID' });
  const current = await getSpecialisationById(pool, specId);
  if (!current) throw Object.assign(new Error('Specialisation not found.'), { code: 'SPEC_NOT_FOUND' });
  const status = current.status ? 0 : 1;
  await pool.query('UPDATE tbl_doctor_specialisation SET status=? WHERE id=?', [status, specId]);
  return status;
}

async function deleteSpecialisation(pool, id) {
  const specId = parseInt(id, 10);
  if (!specId) throw Object.assign(new Error('Invalid specialisation.'), { code: 'SPEC_INVALID' });
  const current = await getSpecialisationById(pool, specId);
  if (!current) throw Object.assign(new Error('Specialisation not found.'), { code: 'SPEC_NOT_FOUND' });
  const inUse = await countSpecialisationUsage(pool, current.name);
  if (inUse > 0) {
    throw Object.assign(
      new Error(`Cannot delete — ${inUse} staff member(s) use this specialisation.`),
      { code: 'SPEC_IN_USE' }
    );
  }
  await suppressSpecialisation(pool, current.name);
  await pool.query('DELETE FROM tbl_doctor_specialisation WHERE id=?', [specId]);
}

module.exports = {
  ensureDepartmentTable,
  listDepartments,
  addDepartment,
  renameDepartment,
  toggleDepartment,
  deleteDepartment,
  listSpecialisationCatalog,
  addSpecialisation,
  renameSpecialisation,
  toggleSpecialisation,
  deleteSpecialisation,
};
