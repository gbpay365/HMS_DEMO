'use strict';
/**
 * Grant all director report/dashboard ACL permissions to the Hospital Director role.
 * Safe to re-run (INSERT IGNORE). Also unhides director dashboard UI elements.
 *
 * Usage: node scripts/grant-director-reports-acl.js [roleId]
 * Default role: 106 (Director)
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { grantPermission } = require('../lib/accessControlCore');

async function main() {
  const role = String(process.argv[2] || '106');
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });

  const {
    ALL_DIRECTOR_DASHBOARD_PERMISSIONS,
    ALL_DIRECTOR_REVENUE_PERMISSIONS,
  } = require('../lib/directorDashboardCatalog');
  const { ALL_DIRECTOR_WEEKLY_PERMISSIONS } = require('../lib/directorWeeklyReportCatalog');
  const { ALL_DIRECTOR_MONTHLY_PERMISSIONS } = require('../lib/directorMonthlyPLCatalog');
  const { ALL_DIRECTOR_ANNUAL_PERMISSIONS } = require('../lib/directorAnnualScorecardCatalog');

  const permCodes = new Set([
    'dashboard.read',
    'hms_reports.full',
    'hms_reports.read',
    'director.monthly.costs.write',
  ]);

  for (const lists of [
    ALL_DIRECTOR_DASHBOARD_PERMISSIONS,
    ALL_DIRECTOR_REVENUE_PERMISSIONS,
    ALL_DIRECTOR_WEEKLY_PERMISSIONS,
    ALL_DIRECTOR_MONTHLY_PERMISSIONS,
    ALL_DIRECTOR_ANNUAL_PERMISSIONS,
  ]) {
    for (const row of lists || []) permCodes.add(row[0]);
  }

  // Ensure permission rows exist (ensureAclSchema normally seeds these on boot).
  for (const code of permCodes) {
    await pool.query(
      `INSERT IGNORE INTO tbl_acl_permission (code, label, gap_area, module_code, action)
       VALUES (?, ?, 0, 'director', SUBSTRING_INDEX(?, '.', -1))`,
      [code, code, code]
    ).catch(() => {});
  }

  let granted = 0;
  for (const code of permCodes) {
    await grantPermission(pool, role, code);
    const [[row]] = await pool.query(
      `SELECT 1 AS ok FROM tbl_acl_role_permission rp
       JOIN tbl_acl_permission p ON p.id = rp.permission_id
       WHERE rp.role = ? AND p.code = ? LIMIT 1`,
      [role, code]
    );
    if (row) granted += 1;
  }

  // Director portal home
  await pool.query(
    `INSERT IGNORE INTO tbl_acl_role_portal (role, portal_code, is_home) VALUES (?, 'director', 1)`,
    [role]
  );

  // Unhide all director dashboard / report widgets for this role
  const [unhidden] = await pool.query(
    `DELETE FROM tbl_acl_role_ui_hidden
      WHERE role = ?
        AND (
          element_code = 'dir.section.daily_dashboard'
          OR element_code LIKE 'dir.tab.%'
          OR element_code LIKE 'dir.kpi.%'
          OR element_code LIKE 'dir.panel.%'
          OR element_code LIKE 'dir.stat.revenue_%'
          OR element_code = 'dir.section.weekly_report'
          OR element_code LIKE 'dir.wk.%'
          OR element_code = 'dir.section.monthly_pl'
          OR element_code LIKE 'dir.mo.%'
          OR element_code = 'dir.section.annual_scorecard'
          OR element_code LIKE 'dir.yr.%'
          OR element_code = 'dir.tile.dashboard'
        )`,
    [role]
  );

  const aclLayout = require('../lib/aclLayout');
  await aclLayout.init(pool);

  const { buildVisibleDashboardModel } = require('../lib/directorDashboardCatalog');
  const { buildVisibleWeeklyModel } = require('../lib/directorWeeklyReportCatalog');
  const { buildVisibleMonthlyModel } = require('../lib/directorMonthlyPLCatalog');
  const { buildVisibleAnnualModel } = require('../lib/directorAnnualScorecardCatalog');
  const perms = (await pool.query(
    `SELECT p.code FROM tbl_acl_role_permission rp
     JOIN tbl_acl_permission p ON p.id = rp.permission_id WHERE rp.role = ?`,
    [role]
  ))[0].map((r) => r.code);
  const pack = aclLayout.forPortal('director', perms, role);
  const dash = buildVisibleDashboardModel(pack);
  const weekly = buildVisibleWeeklyModel(pack);
  const monthly = buildVisibleMonthlyModel(pack);
  const annual = buildVisibleAnnualModel(pack);

  console.log(`Role ${role}: granted/verified ${granted}/${permCodes.size} permissions`);
  console.log(`Unhidden ${unhidden.affectedRows || 0} director UI elements`);
  console.log('Director reports visible:', {
    daily: dash.hasShell && dash.tabs.length > 0,
    weekly: weekly.hasShell && (weekly.kpis.length > 0 || weekly.panels.length > 0),
    monthly: monthly.hasShell && (monthly.kpis.length > 0 || monthly.panels.length > 0),
    annual: annual.hasShell && (annual.panels.length > 0 || annual.domains.length > 0),
    monthlyKpis: monthly.kpis.length,
    monthlyPanels: monthly.panels.length,
  });
  console.log('Open Monthly P&L directly:', `/portal/hub/director?report=monthly`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
