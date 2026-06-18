'use strict';

const TEMPLATES = Object.freeze({
  executive: [
    ['dashboard', 'Executive dashboard', '/dashboard', 'fa-dashboard', '#714b67', '*', 10],
    ['patients', 'Patient directory', '/patients', 'fa-users', '#0ea5e9', 'patient.read|patient.write', 20],
    ['opd', 'OPD queue', '/opd-queue', 'fa-list-alt', '#0c8b8b', 'opd.read|clinical.read', 30],
    ['wards', 'Ward board', '/wards', 'fa-bed', '#0891b2', 'adt.read|nursing.read', 40],
    ['employees', 'Employees', '/employees', 'fa-id-badge', '#7c3aed', 'employee.read|employee.write', 50],
    ['payroll', 'Payroll & HR', '/payroll', 'fa-money', '#475569', 'payroll.read|payroll.write', 60],
    ['financials', 'Financials', '/financials', 'fa-line-chart', '#1a6bd8', 'accounting.read|financials.read', 70],
    ['guides', 'Workflow guides', '/workflow-guides', 'fa-sitemap', '#f59e0b', '*', 80],
  ],
  clinical: [
    ['patients', 'Patient records', '/patients', 'fa-user', '#0ea5e9', 'patient.read|patient.write', 10],
    ['opd', 'OPD queue', '/opd-queue', 'fa-list-alt', '#0c8b8b', 'opd.read|clinical.read', 20],
    ['consult', 'New consultation', '/consultation-new', 'fa-stethoscope', '#1a6bd8', 'clinical.write', 30],
    ['wards', 'Wards / IPD', '/wards', 'fa-bed', '#0891b2', 'adt.read|nursing.read', 40],
    ['emergency', 'Emergency', '/emergency', 'fa-ambulance', '#dc2626', 'emergency.read', 50],
  ],
  minimal: [
    ['home', 'Dashboard', '/dashboard', 'fa-dashboard', '#714b67', '*', 10],
    ['profile', 'My profile', '/profile', 'fa-user-circle', '#475569', 'profile.self.write', 20],
  ],
});

async function seedStarterTiles(pool, portalCode, templateName) {
  const code = String(portalCode || '').trim();
  const template = TEMPLATES[templateName] || TEMPLATES.minimal;
  const prefix = code.replace(/[^a-z0-9_]/g, '_');
  let inserted = 0;
  for (const [key, label, url, icon, color, perm, sort] of template) {
    const elementCode = `${prefix}.tile.${key}`;
    const [ex] = await pool.query(
      'SELECT id FROM tbl_acl_ui_element WHERE code=? LIMIT 1',
      [elementCode]
    );
    if (ex && ex.length) continue;
    await pool.query(
      `INSERT INTO tbl_acl_ui_element
        (code, portal_code, kind, parent_code, label, url, icon, color, sort_order, required_perm, enabled)
       VALUES (?, ?, 'tile', NULL, ?, ?, ?, ?, ?, ?, 1)`,
      [elementCode, code, label, url, icon, color, sort, perm]
    );
    inserted++;
  }
  return inserted;
}

module.exports = { seedStarterTiles, TEMPLATES };
