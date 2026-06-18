'use strict';

/**
 * Access control — single source of truth.
 *
 * GRANTS (who can do what):  tbl_acl_role_permission  →  res.locals.userPerms
 * PORTALS (login home):      tbl_acl_role_portal
 * MENU HIDES (cosmetic):     tbl_acl_role_ui_hidden   — does NOT grant access
 * ROUTE RULES:               tbl_acl_ui_element.required_perm + aclRouteRegistry
 * WORKFLOW MAP:              tbl_workflow_step_roles  — documentation only
 *
 * Deprecated (not used at runtime): tbl_role_permission, tbl_permission_list
 */

const GRANT_TABLE = 'tbl_acl_role_permission';
const PORTAL_TABLE = 'tbl_acl_role_portal';
const UI_HIDE_TABLE = 'tbl_acl_role_ui_hidden';
const WORKFLOW_TABLE = 'tbl_workflow_step_roles';

async function loadRolePermissionCodes(pool, role) {
  const [rows] = await pool.query(
    `SELECT p.code FROM ${GRANT_TABLE} rp
     INNER JOIN tbl_acl_permission p ON p.id = rp.permission_id
     WHERE rp.role = ?`,
    [String(role)]
  );
  return rows.map((r) => r.code);
}

async function grantPermission(pool, role, permCode) {
  await pool.query(
    `INSERT IGNORE INTO ${GRANT_TABLE} (role, permission_id)
     SELECT ?, id FROM tbl_acl_permission WHERE code = ? LIMIT 1`,
    [String(role), permCode]
  );
}

async function revokePermission(pool, role, permCode) {
  await pool.query(
    `DELETE rp FROM ${GRANT_TABLE} rp
     INNER JOIN tbl_acl_permission p ON p.id = rp.permission_id
     WHERE rp.role = ? AND p.code = ?`,
    [String(role), permCode]
  );
}

module.exports = {
  GRANT_TABLE,
  PORTAL_TABLE,
  UI_HIDE_TABLE,
  WORKFLOW_TABLE,
  loadRolePermissionCodes,
  grantPermission,
  revokePermission,
};
