'use strict';

const { PRODUCT_MODES, PRODUCT_MODE_LABELS, productSlicesForMode } = require('./appProductMode');

const PROFILE_BY_NAME = Object.freeze({
  'Full Suite': { key: 'full', icon: 'fa-th-large', color: '#714b67', desc: 'All modules visible hospital-wide.' },
  HMS: { key: 'hms', icon: 'fa-hospital-o', color: '#0891b2', desc: 'Clinical operations, OPD, wards, lab, radiology.' },
  Accounting: { key: 'accounting', icon: 'fa-line-chart', color: '#334155', desc: 'Financials and expense management.' },
  'Leave & Attendance': { key: 'leave_attendance', icon: 'fa-calendar-check-o', color: '#7c3aed', desc: 'Staff, leave, attendance, holidays.' },
  Payroll: { key: 'payroll', icon: 'fa-money', color: '#1e40af', desc: 'Payroll-focused bundle.' },
  Inventory: { key: 'inventory', icon: 'fa-cubes', color: '#b45309', desc: 'Catalog and inventory.' },
  Procurement: { key: 'procurement', icon: 'fa-truck', color: '#0ea5e9', desc: 'Catalog, inventory, and purchase orders.' },
  'Asset Management': { key: 'assets', icon: 'fa-building', color: '#6366f1', desc: 'Fixed assets and equipment registry.' },
});

/** Legacy profile names in DB before rename migration. */
const PROFILE_NAME_ALIASES = Object.freeze({
  'Clinical HMS': 'HMS',
  'Accounting Only': 'Accounting',
  'Inventory / Catalog': 'Inventory',
});

const MODE_META_BY_KEY = Object.freeze(
  Object.fromEntries(
    Object.values(PROFILE_BY_NAME).map((m) => [m.key, m])
  )
);

const MODE_DESC = Object.freeze({
  full: 'All modules visible.',
  hms: 'Clinical operations — hides accounting, HR nav bundles, inventory, payroll.',
  accounting: 'Financials and expense management only.',
  leave_attendance: 'Staff, leave, attendance, holidays, self-service.',
  payroll: 'Payroll-focused bundle.',
  inventory: 'Catalog + inventory.',
  procurement: 'Catalog + inventory + purchase orders.',
});

function modeMeta(key) {
  return MODE_META_BY_KEY[key] || { key, icon: 'fa-cube', color: '#64748b' };
}

/** Legacy hospital-wide modes (Odoo app tiles). */
const DEPLOYMENT_MODES = Object.freeze(
  PRODUCT_MODES.map((key) => {
    const m = modeMeta(key);
    return {
      key,
      label: PRODUCT_MODE_LABELS[key] || key,
      icon: m.icon,
      color: m.color,
      desc: MODE_DESC[key] || m.desc || '',
      slices: productSlicesForMode(key),
    };
  })
);

function profileMeta(profileName) {
  const raw = String(profileName || '').trim();
  const name = PROFILE_NAME_ALIASES[raw] || raw;
  if (PROFILE_BY_NAME[name]) return { ...PROFILE_BY_NAME[name], name };
  return { key: 'custom', icon: 'fa-puzzle-piece', color: '#64748b', desc: 'Named deployment preset.', name: raw };
}

module.exports = {
  DEPLOYMENT_MODES,
  PROFILE_BY_NAME,
  profileMeta,
};
