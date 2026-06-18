'use strict';

const { SUPER_ADMIN_ROLE, SYSTEM_ADMIN_ROLE } = require('./hmsStaffAccountGuard');

/** Permissions reserved for Super Admin product configuration only. */
const SUPER_ADMIN_ONLY_PERMISSION_CODES = Object.freeze([
  'super_admin.product',
]);

/**
 * Grant System Admin (role 1) every ACL permission except Super Admin product config.
 * Super Admin (99) uses runtime wildcard ['*'] — no DB rows required.
 */
async function ensureSystemAdminAclProfile(pool) {
  const codes = SUPER_ADMIN_ONLY_PERMISSION_CODES;
  const placeholders = codes.map(() => '?').join(', ');
  await pool.query(
    `INSERT IGNORE INTO tbl_acl_permission (code, label, gap_area, module_code, action)
     VALUES (?, 'Super Admin: product configuration', 0, 'super_admin', 'product')`,
    [codes[0]]
  );
  const [ins] = await pool.query(
    `INSERT IGNORE INTO tbl_acl_role_permission (role, permission_id)
     SELECT ?, p.id FROM tbl_acl_permission p
     WHERE p.code NOT IN (${placeholders})`,
    [SYSTEM_ADMIN_ROLE, ...codes]
  );
  await pool.query(
    `INSERT IGNORE INTO tbl_acl_role_permission (role, permission_id)
     SELECT ?, p.id FROM tbl_acl_permission p WHERE p.code = ? LIMIT 1`,
    [SUPER_ADMIN_ROLE, codes[0]]
  );

  return { role: SYSTEM_ADMIN_ROLE, grantsInserted: ins.affectedRows || 0 };
}

module.exports = {
  SUPER_ADMIN_ONLY_PERMISSION_CODES,
  ensureSystemAdminAclProfile,
};
