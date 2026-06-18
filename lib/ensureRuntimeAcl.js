'use strict';

const { assignPortal } = require('./roleProfileResolver');
const { ensureDepartmentPortals } = require('./ensureDepartmentPortals');

/**
 * Idempotent ACL rows needed at runtime when full schema migrations are skipped
 * (PostgreSQL / Railway demo). Ensures department portals exist and Director
 * has a home portal in tbl_acl_role_portal.
 */
async function ensureRuntimeAcl(pool) {
  if (!pool) return { ok: false, reason: 'no pool' };

  await ensureDepartmentPortals(pool).catch(() => {});

  let directorRole = null;
  try {
    const [rows] = await pool.query(
      `SELECT CAST(role AS CHAR) AS role FROM tbl_role
        WHERE LOWER(title) LIKE '%director%'
          AND LOWER(title) NOT LIKE '%deputy%'
          AND LOWER(title) NOT LIKE '%assistant%'
        ORDER BY role LIMIT 1`
    );
    if (rows && rows[0] && rows[0].role != null) directorRole = String(rows[0].role);
  } catch (_) { /* tbl_role optional on legacy DBs */ }

  if (directorRole) {
    await assignPortal(pool, directorRole, 'director', { isHome: true });
  }

  return { ok: true, directorRole };
}

module.exports = { ensureRuntimeAcl };
