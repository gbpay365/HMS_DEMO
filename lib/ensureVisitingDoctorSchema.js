'use strict';

const {
  ACCOUNT_COUNT,
  VISITING_DOCTOR_ROLE_NUM,
  VISITING_DOCTOR_ROLE_TITLE,
  VISITING_DOCTOR_USERNAMES,
  hashDefaultPassword,
  resolveVisitingDoctorRoleId,
} = require('./visitingDoctor');

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (e) {
    const msg = String(e.message || '');
    if (e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060 || /Duplicate column/i.test(msg)) return;
    console.warn('[ensureVisitingDoctorSchema]', msg);
  }
}

module.exports = async function ensureVisitingDoctorSchema(pool) {
  await safeAlter(
    pool,
    `ALTER TABLE tbl_employee ADD COLUMN visiting_account_status
       ENUM('idle','claiming','active','expired') NOT NULL DEFAULT 'idle'
       COMMENT 'Shared visiting-doctor pool slot state'`
  );
  await safeAlter(
    pool,
    `ALTER TABLE tbl_employee ADD COLUMN profile_setup_complete TINYINT(1) NOT NULL DEFAULT 1
       COMMENT '0 = must complete visiting doctor setup wizard'`
  );
  await safeAlter(
    pool,
    `ALTER TABLE tbl_employee ADD COLUMN password_must_change TINYINT(1) NOT NULL DEFAULT 0
       COMMENT '1 = must change password from default'`
  );
  await safeAlter(pool, `ALTER TABLE tbl_employee ADD COLUMN visit_start_date DATE NULL`);
  await safeAlter(pool, `ALTER TABLE tbl_employee ADD COLUMN visit_end_date DATE NULL`);
  await safeAlter(pool, `ALTER TABLE tbl_employee ADD COLUMN claimed_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE tbl_employee ADD COLUMN last_reset_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE tbl_employee ADD COLUMN preferred_consultation_room_id INT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_visiting_doctor_session_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      username VARCHAR(40) NOT NULL,
      doctor_display_name VARCHAR(255) NULL,
      phone VARCHAR(40) NULL,
      email VARCHAR(255) NULL,
      department_name VARCHAR(120) NULL,
      specialisation VARCHAR(120) NULL,
      consultation_room_id INT NULL,
      visit_start_date DATE NULL,
      visit_end_date DATE NULL,
      claimed_at DATETIME NULL,
      released_at DATETIME NULL,
      KEY idx_vdsl_employee (employee_id),
      KEY idx_vdsl_username (username),
      KEY idx_vdsl_end (visit_end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `).catch(() => {});

  await pool.query(
    `INSERT IGNORE INTO tbl_role (title, role) VALUES (?, ?)`,
    [VISITING_DOCTOR_ROLE_TITLE, VISITING_DOCTOR_ROLE_NUM]
  ).catch(() => {});

  const roleId = await resolveVisitingDoctorRoleId(pool);
  const defaultHash = await hashDefaultPassword();
  const year = new Date().getFullYear();

  for (let i = 1; i <= ACCOUNT_COUNT; i += 1) {
    const username = `VD${i}`;
    const slot = String(i).padStart(2, '0');
    await pool.query(
      `INSERT IGNORE INTO tbl_employee
        (first_name, last_name, username, emailid, password, dob, gender, address, bio,
         employee_id, joining_date, phone, role, status,
         visiting_account_status, profile_setup_complete, password_must_change)
       VALUES (?, ?, ?, ?, ?, '', 'Male', '', '',
               ?, CURDATE(), '', ?, 1,
               'idle', 0, 1)`,
      [
        'Visiting',
        `Doctor ${slot}`,
        username,
        `${username.toLowerCase()}@visiting.local`,
        defaultHash,
        `VD-${year}-${slot}`,
        roleId,
      ]
    );

    await pool.query(
      `UPDATE tbl_employee SET
         role=?,
         visiting_account_status='idle',
         profile_setup_complete=0,
         password_must_change=1,
         visit_start_date=NULL,
         visit_end_date=NULL,
         claimed_at=NULL
       WHERE UPPER(username)=UPPER(?)
         AND (visiting_account_status IS NULL OR visiting_account_status='idle')
         AND (profile_setup_complete IS NULL OR profile_setup_complete=0)`,
      [roleId, username]
    ).catch(() => {});
  }

  const { runAclBootstrapOnce } = require('./aclBootstrapMigration');
  await runAclBootstrapOnce(pool, 'bootstrap.visiting_doctor_v1', async () => {
    const perms = [
      'visiting_doctor.setup',
      'clinical.read',
      'clinical.write',
      'opd.read',
      'prescription.read',
      'prescription.write',
      'patient.read',
      'chart.read',
      'chart.write',
      'scheduling.read',
      'lab.read',
      'radiology.read',
      'profile.self.write',
    ];
    for (const code of perms) {
      await pool.query(
        `INSERT IGNORE INTO tbl_acl_role_permission (role, permission_id)
         SELECT ?, id FROM tbl_acl_permission WHERE code = ? LIMIT 1`,
        [roleId, code]
      );
    }
    await pool.query(
      `INSERT IGNORE INTO tbl_acl_role_portal (role, portal_code, is_home) VALUES (?, 'doctor', 1)`,
      [roleId]
    );
  });

  await runAclBootstrapOnce(pool, 'bootstrap.visiting_doctor_manage_v1', async () => {
    const manageCode = 'visiting_doctor.manage';
    const roleIds = new Set(['1', '99']);
    try {
      const [dirRows] = await pool.query(
        `SELECT CAST(role AS CHAR) AS role_key FROM tbl_role
          WHERE LOWER(title) LIKE '%director%' AND LOWER(title) NOT LIKE '%assistant%'
          ORDER BY role LIMIT 3`
      );
      for (const row of dirRows || []) {
        if (row?.role_key != null) roleIds.add(String(row.role_key));
      }
    } catch (_) {
      /* optional */
    }
    for (const rid of roleIds) {
      await pool.query(
        `INSERT IGNORE INTO tbl_acl_role_permission (role, permission_id)
         SELECT ?, id FROM tbl_acl_permission WHERE code = ? LIMIT 1`,
        [rid, manageCode]
      );
    }
  });

  const { registerDoctorSpecialisation, ensureDoctorSpecialisationCatalog } = require('./hmsDoctorSpecialisations');
  await ensureDoctorSpecialisationCatalog(pool);
  await registerDoctorSpecialisation(pool, 'General Practitioner');

  return { roleId, accounts: VISITING_DOCTOR_USERNAMES.length };
};
