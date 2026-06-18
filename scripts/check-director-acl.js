'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });

  const [dirRoles] = await pool.query(
    `SELECT CAST(role AS CHAR) AS role, title FROM tbl_role
      WHERE LOWER(title) LIKE '%director%' AND LOWER(title) NOT LIKE '%deputy%'`
  );
  console.log('Director tbl_role rows:', dirRoles);

  for (const role of ['106', '7']) {
    const [perms] = await pool.query(
      `SELECT p.code FROM tbl_acl_role_permission rp
       JOIN tbl_acl_permission p ON p.id = rp.permission_id
       WHERE rp.role = ?
         AND (p.code LIKE 'director.%' OR p.code IN ('dashboard.read','hms_reports.full','hms_reports.read'))
       ORDER BY p.code`,
      [role]
    );
    console.log(`\nRole ${role} director-related perms (${perms.length}):`);
    console.log(perms.map((r) => r.code).join('\n'));
  }

  const needed = [
    'director.dashboard.read',
    'director.dashboard.tab.overview',
    'director.weekly.read',
    'director.monthly.read',
    'director.annual.read',
  ];
  const [missing] = await pool.query(
    `SELECT ? AS role, codes.code
     FROM (SELECT ? AS role) r
     CROSS JOIN (
       SELECT 'director.dashboard.read' AS code UNION ALL
       SELECT 'director.dashboard.tab.overview' UNION ALL
       SELECT 'director.weekly.read' UNION ALL
       SELECT 'director.monthly.read' UNION ALL
       SELECT 'director.annual.read'
     ) codes
     LEFT JOIN tbl_acl_role_permission rp ON rp.role = '106' AND rp.permission_id = (SELECT id FROM tbl_acl_permission p WHERE p.code = codes.code LIMIT 1)
     WHERE rp.role IS NULL`,
    ['106', '106']
  ).catch(() => [[]]);

  console.log('\nMissing for role 106:', missing);

  const [elements] = await pool.query(
    `SELECT code, label, enabled, required_perm, kind
       FROM tbl_acl_ui_element
      WHERE portal_code = 'director' AND code LIKE 'dir.%'
      ORDER BY code`
  );
  console.log(`\nDirector UI elements (${elements.length}):`);
  for (const e of elements) {
    console.log(`  ${e.code} [${e.kind}] enabled=${e.enabled} — ${e.label}`);
  }

  const [hidden] = await pool.query(
    `SELECT element_code FROM tbl_acl_role_ui_hidden
      WHERE role = '106' AND element_code LIKE 'dir.%'`
  );
  console.log('\nHidden dir.* for role 106:', hidden.map((h) => h.element_code));

  const { buildVisibleDashboardModel } = require('../lib/directorDashboardCatalog');
  const aclLayout = require('../lib/aclLayout');
  await aclLayout.init(pool);
  const perms = (await pool.query(
    `SELECT p.code FROM tbl_acl_role_permission rp
     JOIN tbl_acl_permission p ON p.id = rp.permission_id WHERE rp.role = '106'`
  ))[0].map((r) => r.code);
  const pack = aclLayout.forPortal('director', perms, '106');
  const model = buildVisibleDashboardModel(pack);
  console.log('\nVisible dashboard model:', {
    hasShell: model.hasShell,
    tabs: model.tabs.map((t) => t.id),
    kpis: model.kpis.length,
    panels: model.panels.length,
  });

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
