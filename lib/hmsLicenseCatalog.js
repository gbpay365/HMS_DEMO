'use strict';

const { PRODUCT_MODE_LABELS } = require('./appProductMode');
const { profileMeta } = require('./deploymentCatalog');

/** Sellable solutions mapped to deployment slices / profiles. */
const SOLUTIONS = Object.freeze([
  {
    key: 'hms',
    label: PRODUCT_MODE_LABELS.hms,
    desc: 'Clinical operations — OPD, wards, lab, radiology, pharmacy.',
    profileName: 'HMS',
    slices: ['hms'],
    icon: 'fa-hospital-o',
    color: '#0891b2',
  },
  {
    key: 'accounting',
    label: PRODUCT_MODE_LABELS.accounting,
    desc: 'Financials, journals, expenses, and tax reporting.',
    profileName: 'Accounting',
    slices: ['accounting'],
    icon: 'fa-line-chart',
    color: '#334155',
  },
  {
    key: 'leave_attendance',
    label: PRODUCT_MODE_LABELS.leave_attendance,
    desc: 'Staff directory, leave, attendance, and holidays.',
    profileName: 'Leave & Attendance',
    slices: ['leave_attendance'],
    icon: 'fa-calendar-check-o',
    color: '#7c3aed',
  },
  {
    key: 'payroll',
    label: PRODUCT_MODE_LABELS.payroll,
    desc: 'Payroll processing, payslips, and allowances.',
    profileName: 'Payroll',
    slices: ['payroll'],
    icon: 'fa-money',
    color: '#1e40af',
  },
  {
    key: 'inventory',
    label: PRODUCT_MODE_LABELS.inventory,
    desc: 'Catalog and inventory management.',
    profileName: 'Inventory',
    slices: ['inventory'],
    icon: 'fa-cubes',
    color: '#b45309',
  },
  {
    key: 'procurement',
    label: PRODUCT_MODE_LABELS.procurement,
    desc: 'Catalog, inventory, and purchase orders.',
    profileName: 'Procurement',
    slices: ['inventory', 'procurement'],
    icon: 'fa-truck',
    color: '#0ea5e9',
  },
  {
    key: 'assets',
    label: 'Asset Management',
    desc: 'Hospital assets, apartments, rentals, and contracts.',
    profileName: null,
    slices: ['assets'],
    icon: 'fa-building',
    color: '#6366f1',
  },
  {
    key: 'full',
    label: PRODUCT_MODE_LABELS.full,
    desc: 'All ZAIZENS modules — full hospital suite.',
    profileName: 'Full Suite',
    slices: ['full'],
    icon: 'fa-th-large',
    color: '#714b67',
  },
]);

const BY_KEY = Object.freeze(Object.fromEntries(SOLUTIONS.map((s) => [s.key, s])));

function listSolutions() {
  return SOLUTIONS.map((s) => {
    const meta = s.profileName ? profileMeta(s.profileName) : {};
    return {
      ...s,
      icon: s.icon || meta.icon || 'fa-cube',
      color: s.color || meta.color || '#64748b',
    };
  });
}

function getSolution(key) {
  return BY_KEY[String(key || '').trim()] || null;
}

function slicesForSolution(key) {
  const s = getSolution(key);
  return s ? s.slices.slice() : [];
}

function isValidSolutionKey(key) {
  return !!getSolution(key);
}

module.exports = {
  SOLUTIONS,
  listSolutions,
  getSolution,
  slicesForSolution,
  isValidSolutionKey,
};
