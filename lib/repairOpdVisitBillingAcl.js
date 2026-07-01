'use strict';

const { runAclBootstrapOnce } = require('./aclBootstrapMigration');

const VISIT_CREATE_PERM = 'front_desk.visit.create';
const ALLOWED_VISIT_CREATE_ROLES = ['3', '7', '8', '101', '103'];
const VISIT_CREATE_PORTALS = ['front_desk', 'nurse', 'nursing'];

async function permId(pool, code) {
  const [[row]] = await pool
    .query('SELECT id FROM tbl_acl_permission WHERE code = ? LIMIT 1', [code])
    .catch(() => [[null]]);
  return row?.id ? parseInt(row.id, 10) : 0;
}

async function grantVisitCreate(pool, role) {
  await pool
    .query(
      `INSERT IGNORE INTO tbl_acl_role_permission (role, permission_id)
       SELECT ?, id FROM tbl_acl_permission WHERE code = ? LIMIT 1`,
      [String(role), VISIT_CREATE_PERM]
    )
    .catch(() => {});
}

async function revokeVisitCreate(pool, role) {
  const pid = await permId(pool, VISIT_CREATE_PERM);
  if (!pid) return;
  await pool
    .query('DELETE FROM tbl_acl_role_permission WHERE role = ? AND permission_id = ?', [String(role), pid])
    .catch(() => {});
}

async function roleHasPortal(pool, role) {
  const placeholders = VISIT_CREATE_PORTALS.map(() => '?').join(', ');
  const [[row]] = await pool
    .query(
      `SELECT 1 AS ok FROM tbl_acl_role_portal
        WHERE role = ? AND portal_code IN (${placeholders}) LIMIT 1`,
      [String(role), ...VISIT_CREATE_PORTALS]
    )
    .catch(() => [[null]]);
  return !!row?.ok;
}

/**
 * Portable ACL repair for OPD visit creation + invoice settle (MySQL + PostgreSQL).
 */
async function repairOpdVisitBillingAcl(pool) {
  if (!pool) return;

  await runAclBootstrapOnce(pool, 'bootstrap.opd_new_visit_acl_v3', async () => {
    await pool
      .query(
        `UPDATE tbl_acl_ui_element SET required_perm = ?
         WHERE code IN ('am.opd_queue.new_visit', 'fd.tile.visit')`,
        [VISIT_CREATE_PERM]
      )
      .catch(() => {});

    for (const role of ALLOWED_VISIT_CREATE_ROLES) {
      await grantVisitCreate(pool, role);
    }

    for (const portal of VISIT_CREATE_PORTALS) {
      await pool
        .query(
          `INSERT IGNORE INTO tbl_acl_role_permission (role, permission_id)
           SELECT rp.role, p.id
             FROM tbl_acl_role_portal rp
             JOIN tbl_acl_permission p ON p.code = ?
            WHERE rp.portal_code = ?`,
          [VISIT_CREATE_PERM, portal]
        )
        .catch(() => {});
    }

    const visitCreateId = await permId(pool, VISIT_CREATE_PERM);
    if (!visitCreateId) return;

    const [holders] = await pool
      .query(
        `SELECT DISTINCT role FROM tbl_acl_role_permission WHERE permission_id = ?`,
        [visitCreateId]
      )
      .catch(() => [[]]);

    for (const row of holders || []) {
      const role = String(row.role || '');
      if (!role) continue;
      if (ALLOWED_VISIT_CREATE_ROLES.includes(role)) continue;
      if (await roleHasPortal(pool, role)) continue;
      await revokeVisitCreate(pool, role);
    }
  });
}

module.exports = { repairOpdVisitBillingAcl };
