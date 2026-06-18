'use strict';

/**
 * Canonical department portals for Access Control (tbl_acl_portal) and
 * migration of legacy role-portal alias codes (doctors → doctor, etc.).
 */

/** Legacy tbl_acl_role_portal.portal_code → canonical tbl_acl_portal.code */
const LEGACY_ROLE_PORTAL_ALIASES = Object.freeze({
  doctors: 'doctor',
  nursing: 'nurse',
  laboratory: 'labtech',
  nurse_station: 'nurse',
  nursing_station: 'nurse',
  lab_tech: 'labtech',
});

/**
 * [code, label, sort_order, home_url, icon, color, description, is_builtin]
 * is_builtin: 1 = seeded built-in department portal
 */
const DEPARTMENT_PORTALS = Object.freeze([
  [
    'director',
    'Hospital Director',
    15,
    '/portal/hub/director',
    'fa-user-md',
    '#714b67',
    'Executive overview — clinical operations, staff, and hospital performance.',
    0,
  ],
  [
    'assistant_director',
    'Assistant Director',
    16,
    '/portal/hub/assistant_director',
    'fa-sitemap',
    '#4338ca',
    'Operational oversight — dashboards, reports, and hospital performance.',
    0,
  ],
  [
    'secretary',
    'Director\'s Secretary',
    17,
    '/portal/hub/secretary',
    'fa-envelope-o',
    '#5b21b6',
    'Executive support for the Hospital Director — calendar, briefings, and reports.',
    0,
  ],
  [
    'front_desk',
    'Front Desk',
    20,
    '/portal/hub/front_desk',
    'fa-desktop',
    '#0ea5e9',
    'Reception, triage, appointments, and patient registration.',
    1,
  ],
  [
    'doctor',
    'Doctor',
    30,
    '/portal/hub/doctor',
    'fa-user-md',
    '#714b67',
    'Clinical consultations, prescriptions, and OPD.',
    1,
  ],
  [
    'nurse',
    'Nurse',
    40,
    '/portal/hub/nurse',
    'fa-heartbeat',
    '#ec4899',
    'Ward board, vitals, IPD medication, and nursing care.',
    1,
  ],
  [
    'labtech',
    'Laboratory Technician',
    50,
    '/portal/hub/labtech',
    'fa-flask',
    '#16a34a',
    'Lab worklist, specimen processing, and results.',
    1,
  ],
  [
    'pharmacy',
    'Pharmacy',
    60,
    '/portal/pharmacy',
    'fa-medkit',
    '#16a34a',
    'Dispensing queue, prescriptions, and drug inventory.',
    1,
  ],
  [
    'radiology',
    'Radiologist',
    70,
    '/portal/radiology',
    'fa-film',
    '#7c3aed',
    'Imaging worklist and radiology reports.',
    1,
  ],
  [
    'cashier',
    'Cashier',
    80,
    '/portal/cashier',
    'fa-money',
    '#10b981',
    'Payments, receipts, and billing at the desk.',
    1,
  ],
  [
    'accountant',
    'Accountant',
    90,
    '/financials',
    'fa-calculator',
    '#1e40af',
    'Accounting, journals, expenses, and financial reports.',
    1,
  ],
  [
    'patient_support',
    'Patient Portal',
    95,
    '/portal/login',
    'fa-heartbeat',
    '#0369a1',
    'Patient self-service login (secondary access for front desk / nursing).',
    1,
  ],
]);

async function ensureDepartmentPortals(pool) {
  if (!pool) return;
  for (const row of DEPARTMENT_PORTALS) {
    const [code, label, sort, homeUrl, icon, color, description, isBuiltin] = row;
    const [ex] = await pool.query('SELECT id FROM tbl_acl_portal WHERE code=? LIMIT 1', [code]).catch(() => [[]]);
    if (ex && ex.length) {
      await pool
        .query(
          `UPDATE tbl_acl_portal
              SET label=?,
                  sort_order=?,
                  home_url=CASE WHEN home_url IS NULL OR TRIM(home_url)='' THEN ? ELSE home_url END,
                  icon=COALESCE(NULLIF(icon,''), ?),
                  color=COALESCE(NULLIF(color,''), ?),
                  description=COALESCE(description, ?),
                  enabled=1
            WHERE code=?`,
          [label, sort, homeUrl, icon, color, description, code]
        )
        .catch((e) => console.warn('[ensureDepartmentPortals] update', code, e.message));
    } else {
      await pool
        .query(
          `INSERT INTO tbl_acl_portal
             (code, label, sort_order, home_url, icon, color, description, enabled, is_builtin)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [code, label, sort, homeUrl, icon, color, description, isBuiltin ? 1 : 0]
        )
        .catch((e) => console.warn('[ensureDepartmentPortals] insert', code, e.message));
    }
  }
}

/** Rewrite legacy role-portal rows to canonical portal codes (idempotent). */
async function migrateLegacyRolePortalCodes(pool) {
  if (!pool) return;
  for (const [legacy, canonical] of Object.entries(LEGACY_ROLE_PORTAL_ALIASES)) {
    const [legacyRows] = await pool
      .query('SELECT role, is_home FROM tbl_acl_role_portal WHERE portal_code=?', [legacy])
      .catch(() => [[]]);
    for (const row of legacyRows || []) {
      const role = String(row.role);
      const wantHome = !!row.is_home;
      const [exists] = await pool.query(
        'SELECT is_home FROM tbl_acl_role_portal WHERE role=? AND portal_code=? LIMIT 1',
        [role, canonical]
      );
      if (exists && exists.length) {
        if (wantHome && !exists[0].is_home) {
          await pool.query('UPDATE tbl_acl_role_portal SET is_home=0 WHERE role=?', [role]);
          await pool.query('UPDATE tbl_acl_role_portal SET is_home=1 WHERE role=? AND portal_code=?', [
            role,
            canonical,
          ]);
        }
        await pool.query('DELETE FROM tbl_acl_role_portal WHERE role=? AND portal_code=?', [role, legacy]);
      } else {
        await pool.query('UPDATE tbl_acl_role_portal SET portal_code=? WHERE role=? AND portal_code=?', [
          canonical,
          role,
          legacy,
        ]);
      }
    }
  }
}

module.exports = {
  LEGACY_ROLE_PORTAL_ALIASES,
  DEPARTMENT_PORTALS,
  ensureDepartmentPortals,
  migrateLegacyRolePortalCodes,
};
