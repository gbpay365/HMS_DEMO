'use strict';

/**
 * Payroll / statutory identity fields on tbl_employee (payslip & HR records).
 */
async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (e) {
    const msg = String(e.message || '');
    if (
      e.code === 'ER_DUP_FIELDNAME' ||
      e.errno === 1060 ||
      /Duplicate column/i.test(msg) ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    console.warn('[ensureEmployeeHrSchema]', msg);
  }
}

module.exports = async function ensureEmployeeHrSchema(pool) {
  await safeAlter(
    pool,
    "ALTER TABLE tbl_employee ADD COLUMN job_title VARCHAR(120) NULL DEFAULT NULL COMMENT 'Position / poste on payslip'"
  );
  await safeAlter(
    pool,
    "ALTER TABLE tbl_employee ADD COLUMN cnps_number VARCHAR(32) NOT NULL DEFAULT '' COMMENT 'Employee CNPS registration'"
  );
  await safeAlter(
    pool,
    "ALTER TABLE tbl_employee ADD COLUMN tax_niu VARCHAR(32) NOT NULL DEFAULT '' COMMENT 'Employee tax ID (NIU)'"
  );
  await safeAlter(
    pool,
    "ALTER TABLE tbl_employee ADD COLUMN nic_number VARCHAR(32) NOT NULL DEFAULT '' COMMENT 'National ID card number'"
  );
  await safeAlter(
    pool,
    "ALTER TABLE tbl_employee ADD COLUMN bank_name VARCHAR(120) NOT NULL DEFAULT '' COMMENT 'Salary bank name'"
  );
  await safeAlter(
    pool,
    "ALTER TABLE tbl_employee ADD COLUMN bank_account_no VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'Salary bank account'"
  );
  await safeAlter(
    pool,
    "ALTER TABLE tbl_employee ADD COLUMN specialisation VARCHAR(120) NULL DEFAULT NULL COMMENT 'Clinical specialty for doctors (Cardiology, General Medicine, etc.)'"
  );
  await safeAlter(
    pool,
    "ALTER TABLE tbl_employee ADD COLUMN profile_emoji VARCHAR(32) NULL DEFAULT NULL COMMENT 'Emoji profile avatar for staff directory'"
  );
  await safeAlter(
    pool,
    "ALTER TABLE tbl_employee ADD COLUMN photo_path VARCHAR(255) NULL DEFAULT NULL COMMENT 'Uploaded staff profile photo path under /uploads'"
  );
  try {
    await pool.query(
      `UPDATE tbl_employee e
       LEFT JOIN tbl_role r ON CAST(r.role AS UNSIGNED) = CAST(e.role AS UNSIGNED)
       SET e.specialisation = TRIM(e.primary_department)
       WHERE (e.specialisation IS NULL OR TRIM(e.specialisation) = '')
         AND e.primary_department IS NOT NULL AND TRIM(e.primary_department) <> ''
         AND (r.title REGEXP 'Doctor|Physician|M[eé]decin|Specialist|Sp[eé]cialiste' OR CAST(e.role AS UNSIGNED) = 2)`
    );
  } catch (e) {
    console.warn('[ensureEmployeeHrSchema] specialisation backfill:', e.message);
  }
  try {
    const { registerDoctorSpecialisation } = require('./hmsDoctorSpecialisations');
    const [rows] = await pool.query(
      `SELECT DISTINCT TRIM(specialisation) AS name FROM tbl_employee
       WHERE specialisation IS NOT NULL AND TRIM(specialisation) <> ''`
    );
    for (const r of rows || []) {
      await registerDoctorSpecialisation(pool, r.name);
    }
  } catch (e) {
    console.warn('[ensureEmployeeHrSchema] specialisation catalog sync:', e.message);
  }
};
