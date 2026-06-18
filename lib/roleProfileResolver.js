'use strict';

/**
 * Resolve or create ACL roles by title — never hard-code role ids in feature code.
 */

async function findRoleByTitlePattern(pool, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i');
  const [rows] = await pool
    .query('SELECT CAST(role AS CHAR) AS role, title FROM tbl_role ORDER BY role')
    .catch(() => [[]]);
  for (const row of rows || []) {
    if (re.test(String(row.title || ''))) return String(row.role);
  }
  return null;
}

async function nextRoleId(pool) {
  const [[row]] = await pool
    .query('SELECT COALESCE(MAX(CAST(role AS UNSIGNED)), 99) + 1 AS nextRole FROM tbl_role')
    .catch(() => [[{ nextRole: 110 }]]);
  const next = Math.max(100, parseInt(row?.nextRole, 10) || 110);
  return next >= 999 ? null : String(next);
}

async function findOrCreateRole(pool, { title, titleMatch, excludeMatch = null }) {
  const match = titleMatch instanceof RegExp ? titleMatch : new RegExp(String(titleMatch), 'i');
  const [rows] = await pool
    .query('SELECT CAST(role AS CHAR) AS role, title FROM tbl_role ORDER BY role')
    .catch(() => [[]]);
  for (const row of rows || []) {
    const t = String(row.title || '');
    if (!match.test(t)) continue;
    if (excludeMatch && excludeMatch.test(t)) continue;
    return { role: String(row.role), created: false, title: t };
  }

  const role = await nextRoleId(pool);
  if (!role) throw new Error(`Cannot allocate role id for "${title}"`);
  await pool.query('INSERT INTO tbl_role (role, title) VALUES (?, ?)', [role, title]);
  return { role, created: true, title };
}

async function grantPermissions(pool, role, codes = []) {
  for (const code of codes) {
    await pool
      .query(
        `INSERT IGNORE INTO tbl_acl_permission (code, label, gap_area, module_code, action)
         VALUES (?, ?, 0, ?, SUBSTRING_INDEX(?, '.', -1))`,
        [code, code, String(code).split('.')[0] || 'general', code]
      )
      .catch(() => {});
    await pool.query(
      `INSERT IGNORE INTO tbl_acl_role_permission (role, permission_id)
       SELECT ?, id FROM tbl_acl_permission WHERE code = ? LIMIT 1`,
      [role, code]
    );
  }
}

async function assignPortal(pool, role, portalCode, { isHome = false } = {}) {
  await pool.query(
    `INSERT IGNORE INTO tbl_acl_role_portal (role, portal_code, is_home) VALUES (?, ?, ?)`,
    [role, portalCode, isHome ? 1 : 0]
  );
  if (isHome) {
    await pool.query('UPDATE tbl_acl_role_portal SET is_home = 0 WHERE role = ? AND portal_code <> ?', [
      role,
      portalCode,
    ]);
    await pool.query('UPDATE tbl_acl_role_portal SET is_home = 1 WHERE role = ? AND portal_code = ?', [
      role,
      portalCode,
    ]);
  }
}

async function unhidePortalWidgets(pool, role, prefixes = []) {
  if (!prefixes.length) return;
  const clauses = prefixes.map(() => 'element_code LIKE ?').join(' OR ');
  await pool.query(`DELETE FROM tbl_acl_role_ui_hidden WHERE role = ? AND (${clauses})`, [
    role,
    ...prefixes.map((p) => `${p}%`),
  ]);
}

module.exports = {
  findRoleByTitlePattern,
  findOrCreateRole,
  grantPermissions,
  assignPortal,
  unhidePortalWidgets,
  nextRoleId,
};
