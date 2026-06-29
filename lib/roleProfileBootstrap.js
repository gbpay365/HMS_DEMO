'use strict';

const {
  findOrCreateRole,
  grantPermissions,
  assignPortal,
  unhidePortalWidgets,
} = require('./roleProfileResolver');
const { ALL_ASSISTANT_DIRECTOR_DASHBOARD_PERMISSIONS } = require('./assistantDirectorDashboardCatalog');
const { ALL_FRONT_DESK_DASHBOARD_PERMISSIONS } = require('./frontDeskDashboardCatalog');
const { ALL_SECRETARY_DASHBOARD_PERMISSIONS } = require('./secretaryDashboardCatalog');
const { ALL_CASHIER_DASHBOARD_PERMISSIONS } = require('./cashierDashboardCatalog');
const { ALL_DIRECTOR_WEEKLY_PERMISSIONS } = require('./directorWeeklyReportCatalog');
const { ALL_DIRECTOR_MONTHLY_PERMISSIONS } = require('./directorMonthlyPLCatalog');

const ASSISTANT_DIRECTOR_BASE_PERMS = [
  'dashboard.read',
  'patient.read',
  'patient.write',
  'chart.read',
  'scheduling.read',
  'scheduling.write',
  'opd.read',
  'clinical.read',
  'adt.read',
  'nursing.read',
  'lab.read',
  'radiology.read',
  'billing.read',
  'cashier.read',
  'financials.read',
  'analytics.read',
  'employee.read',
  'hms_reports.read',
  'profile.self.write',
  'hr.self.read',
];

const FRONT_DESK_BASE_PERMS = [
  'dashboard.read',
  'patient.read',
  'patient.write',
  'patient.delete',
  'patient_portal.manage',
  'chart.read',
  'profile.self.write',
  'hr.self.read',
  'scheduling.read',
  'scheduling.write',
  'billing.read',
  'opd.read',
  'cashier.read',
  'adt.read',
  'nursing.read',
  'nursing.write',
  'payment.validity.read',
  'ipd_medication.read',
];

const SECRETARY_BASE_PERMS = [
  'dashboard.read',
  'patient.read',
  'chart.read',
  'scheduling.read',
  'scheduling.write',
  'opd.read',
  'employee.read',
  'hms_reports.read',
  'analytics.read',
  'profile.self.write',
  'hr.self.read',
  'billing.read',
];

function catalogPermCodes(catalogPerms) {
  return (catalogPerms || []).map((row) => row[0]);
}

async function ensurePortalRow(pool, row) {
  const [code, label, sort, homeUrl, icon, color, description] = row;
  const [ex] = await pool.query('SELECT id FROM tbl_acl_portal WHERE code=? LIMIT 1', [code]).catch(() => [[]]);
  if (ex?.length) {
    await pool.query(
      `UPDATE tbl_acl_portal SET label=?, sort_order=?, home_url=?, icon=?, color=?, description=?, enabled=1 WHERE code=?`,
      [label, sort, homeUrl, icon, color, description, code]
    );
  } else {
    await pool.query(
      `INSERT INTO tbl_acl_portal (code, label, sort_order, home_url, icon, color, description, enabled, is_builtin)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [code, label, sort, homeUrl, icon, color, description]
    );
  }
}

async function bootstrapAssistantDirector(pool) {
  const { role, created } = await findOrCreateRole(pool, {
    title: 'Assistant Director',
    titleMatch: /assistant\s*director/i,
    excludeMatch: /hospital\s*director/i,
  });

  await ensurePortalRow(pool, [
    'assistant_director',
    'Assistant Director',
    16,
    '/portal/hub/assistant_director',
    'fa-sitemap',
    '#4338ca',
    'Operational oversight — dashboards, reports, and hospital performance (delegated executive view).',
  ]);

  const perms = [
    ...ASSISTANT_DIRECTOR_BASE_PERMS,
    ...catalogPermCodes(ALL_ASSISTANT_DIRECTOR_DASHBOARD_PERMISSIONS),
    ...catalogPermCodes(ALL_DIRECTOR_WEEKLY_PERMISSIONS),
    ...catalogPermCodes(ALL_DIRECTOR_MONTHLY_PERMISSIONS).filter((c) => !c.includes('costs.write')),
  ];
  await grantPermissions(pool, role, [...new Set(perms)]);
  await assignPortal(pool, role, 'assistant_director', { isHome: true });
  await unhidePortalWidgets(pool, role, ['adir.']);

  return { role, created, portal: 'assistant_director' };
}

async function bootstrapFrontDesk(pool) {
  const { role, created } = await findOrCreateRole(pool, {
    title: 'Front Desk',
    titleMatch: /front\s*desk|reception/i,
  });

  const perms = [...FRONT_DESK_BASE_PERMS, ...catalogPermCodes(ALL_FRONT_DESK_DASHBOARD_PERMISSIONS)];
  await grantPermissions(pool, role, [...new Set(perms)]);
  await assignPortal(pool, role, 'front_desk', { isHome: true });
  await assignPortal(pool, role, 'patient_support', { isHome: false });
  await unhidePortalWidgets(pool, role, ['fd.tab.', 'fd.kpi.', 'fd.panel.', 'fd.section.', 'fd.tile.']);

  return { role, created, portal: 'front_desk' };
}

async function bootstrapSecretary(pool) {
  const { role, created } = await findOrCreateRole(pool, {
    title: 'Secretary',
    titleMatch: /^secretary$/i,
  });

  await ensurePortalRow(pool, [
    'secretary',
    'Director\'s Secretary',
    17,
    '/portal/hub/secretary',
    'fa-envelope-o',
    '#5b21b6',
    'Executive support for the Hospital Director — calendar, briefings, correspondence, and reports.',
  ]);

  const perms = [...SECRETARY_BASE_PERMS, ...catalogPermCodes(ALL_SECRETARY_DASHBOARD_PERMISSIONS)];
  await grantPermissions(pool, role, [...new Set(perms)]);
  await assignPortal(pool, role, 'secretary', { isHome: true });
  await assignPortal(pool, role, 'front_desk', { isHome: false });
  await unhidePortalWidgets(pool, role, ['sec.']);

  return { role, created, portal: 'secretary' };
}

async function bootstrapCashier(pool) {
  const { role, created } = await findOrCreateRole(pool, {
    title: 'Cashier',
    titleMatch: /cashier/i,
  });

  const perms = [
    'cashier.write',
    'cashier.read',
    'patient.read',
    'chart.read',
    'billing.read',
    'payment.validity.read',
    'profile.self.write',
    'hr.self.read',
    ...catalogPermCodes(ALL_CASHIER_DASHBOARD_PERMISSIONS),
  ];
  await grantPermissions(pool, role, [...new Set(perms)]);
  await assignPortal(pool, role, 'cashier', { isHome: true });
  await unhidePortalWidgets(pool, role, ['cash.tab.', 'cash.kpi.', 'cash.section.']);

  return { role, created, portal: 'cashier' };
}

async function bootstrapRoleProfiles(pool) {
  const assistant = await bootstrapAssistantDirector(pool);
  const frontDesk = await bootstrapFrontDesk(pool);
  const secretary = await bootstrapSecretary(pool);
  const cashier = await bootstrapCashier(pool);
  return { assistant, frontDesk, secretary, cashier };
}

module.exports = {
  bootstrapRoleProfiles,
  bootstrapAssistantDirector,
  bootstrapFrontDesk,
  bootstrapSecretary,
  bootstrapCashier,
  ASSISTANT_DIRECTOR_BASE_PERMS,
  FRONT_DESK_BASE_PERMS,
  SECRETARY_BASE_PERMS,
};
