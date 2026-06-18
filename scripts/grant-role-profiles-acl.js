'use strict';
/**
 * Bootstrap Assistant Director, Front Desk, and Secretary profiles with ACL + dashboards.
 * Safe to re-run. Resolves roles by title — no hard-coded role ids.
 *
 * Usage: node scripts/grant-role-profiles-acl.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { bootstrapRoleProfiles } = require('../lib/roleProfileBootstrap');
const { buildVisibleDashboardModel: buildAssistantModel } = require('../lib/assistantDirectorDashboardCatalog');
const { buildVisibleDashboardModel: buildFrontDeskModel } = require('../lib/frontDeskDashboardCatalog');
const { buildVisibleDashboardModel: buildSecretaryModel } = require('../lib/secretaryDashboardCatalog');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });

  const result = await bootstrapRoleProfiles(pool);
  const aclLayout = require('../lib/aclLayout');
  await aclLayout.init(pool);

  for (const [key, info] of Object.entries(result)) {
    const perms = (
      await pool.query(
        `SELECT p.code FROM tbl_acl_role_permission rp
         JOIN tbl_acl_permission p ON p.id = rp.permission_id WHERE rp.role = ?`,
        [info.role]
      )
    )[0].map((r) => r.code);

    const portalCode = info.portal;
    const pack = aclLayout.forPortal(portalCode, perms, info.role) || {};
    const build =
      portalCode === 'assistant_director'
        ? buildAssistantModel
        : portalCode === 'secretary'
          ? buildSecretaryModel
          : buildFrontDeskModel;
    const model = build(pack);
    console.log(`${key}:`, {
      role: info.role,
      created: info.created,
      portal: portalCode,
      dashboard: model.hasShell,
      tabs: model.tabs.length,
      kpis: model.kpis.length,
      panels: model.panels.length,
      homeUrl: `/portal/hub/${portalCode}`,
    });
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
