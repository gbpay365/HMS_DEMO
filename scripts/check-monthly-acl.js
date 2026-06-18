'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [perms] = await pool.query(
    `SELECT p.code FROM tbl_acl_role_permission rp
     JOIN tbl_acl_permission p ON p.id = rp.permission_id
     WHERE rp.role = '106' AND p.code LIKE 'director.monthly%'`
  );
  console.log('Role 106 monthly permissions:', perms.map((r) => r.code));

  const allPerms = (await pool.query(
    `SELECT p.code FROM tbl_acl_role_permission rp
     JOIN tbl_acl_permission p ON p.id = rp.permission_id WHERE rp.role = '106'`
  ))[0].map((r) => r.code);

  const aclLayout = require('../lib/aclLayout');
  await aclLayout.init(pool);
  const pack = aclLayout.forPortal('director', allPerms, '106');
  const { buildVisibleMonthlyModel } = require('../lib/directorMonthlyPLCatalog');
  const model = buildVisibleMonthlyModel(pack);
  console.log('Monthly model:', {
    hasShell: model.hasShell,
    kpis: model.kpis.length,
    panels: model.panels.length,
    codes: [...model.allCodes].filter((c) => c.includes('monthly') || c.includes('dir.mo')),
  });

  const [ui] = await pool.query(
    `SELECT code, enabled, required_perm FROM tbl_acl_ui_element
      WHERE portal_code = 'director' AND (code LIKE 'dir.mo%' OR code = 'dir.section.monthly_pl')`
  );
  console.log('Monthly UI elements in DB:', ui.length, ui.map((u) => u.code));

  const [hidden] = await pool.query(
    `SELECT element_code FROM tbl_acl_role_ui_hidden
      WHERE role = '106' AND element_code LIKE 'dir.mo%'`
  );
  console.log('Hidden monthly widgets for 106:', hidden);

  await pool.end();
}

main().catch(console.error);
