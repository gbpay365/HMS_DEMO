'use strict';

require('../lib/loadEnv').loadEnv();
const mysql = require('mysql2/promise');
const aclLayout = require('../lib/aclLayout');
const navAccessRuntime = require('../lib/navAccessRuntime');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306', 10),
  });

  await require('../lib/ensureAclSchema')(pool);
  aclLayout.init(pool);
  await aclLayout.refresh();

  const [emps] = await pool.query(
    `SELECT id, first_name, last_name, username, role FROM tbl_employee
      WHERE last_name LIKE '%Filai%' OR first_name LIKE '%Theresia%' OR username LIKE '%filai%'
      LIMIT 5`
  );
  console.log('Filai candidates:', emps);

  const [ui] = await pool.query(
    `SELECT code, label, enabled, required_perm, parent_code FROM tbl_acl_ui_element
      WHERE code = 'topnav.cfg.employee_password'`
  );
  console.log('UI element:', ui[0] || 'MISSING');

  const [dirs] = await pool.query(
    `SELECT CAST(role AS CHAR) AS role, title FROM tbl_role WHERE LOWER(title) LIKE '%director%'`
  );
  console.log('Director roles:', dirs);

  for (const emp of emps) {
    const role = String(emp.role);
    const [perms] = await pool.query(
      `SELECT p.code FROM tbl_acl_permission p
        JOIN tbl_acl_role_permission rp ON rp.permission_id = p.id
       WHERE rp.role = ?`,
      [role]
    );
    const permCodes = perms.map((p) => p.code);
    console.log(`\n--- ${emp.first_name} ${emp.last_name} role=${role} ---`);
    console.log('employee.password.manage:', permCodes.includes('employee.password.manage'));
    const [nav] = await pool.query(
      `SELECT nav_code, granted FROM tbl_acl_role_nav_grant WHERE role = ? ORDER BY nav_code`,
      [role]
    );
    const cfgNav = nav.filter((n) =>
      String(n.nav_code).includes('configuration') ||
      String(n.nav_code).includes('cfg') ||
      String(n.nav_code).includes('employee')
    );
    console.log('Nav grants (cfg/employee):', cfgNav);
    console.log('roleUsesNavGrants:', navAccessRuntime.roleUsesNavGrants(role));
    console.log('hasNavGrant nav.cfg.employee_password:', navAccessRuntime.hasNavGrant(role, 'topnav.cfg.employee_password'));
    console.log('hasNavGrant nav.configuration:', navAccessRuntime.hasNavGrant(role, 'topnav.configuration'));
    console.log('uiElementVisible:', aclLayout.uiElementVisible('topnav.cfg.employee_password', permCodes, role, { viewerRole: role }));
    console.log('isRoleHidden:', aclLayout.isRoleHidden(role, 'topnav.cfg.employee_password'));
    console.log('productSlices:', aclLayout.getProductSlices());
    const topnav = aclLayout.buildTopNav(permCodes, role, { viewerRole: role, navGrantMode: true });
    const settingsMenu = (topnav.menus || []).find((m) => m.parent && m.parent.code === 'topnav.configuration');
    if (settingsMenu) {
      console.log('Settings children:', (settingsMenu.children || []).map((c) => c.code + ':' + c.label));
    } else {
      console.log('Settings menu not in topnav');
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
