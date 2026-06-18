'use strict';

const { BUILTIN_HOME_URLS } = require('./ensurePortalSchema');

/** Built-in department portals — dedicated landing pages, not hospital-wide overview. */
const DEPT_PORTAL_CODES = new Set([
  'front_desk',
  'doctors',
  'doctor',
  'nursing',
  'nurse',
  'nurse_station',
  'nursing_station',
  'laboratory',
  'labtech',
  'lab_tech',
  'pharmacy',
  'radiology',
  'cashier',
  'accountant',
  'patient_support',
]);

/** Custom / executive hubs that may show the full hospital overview widget grid. */
const EXECUTIVE_OVERVIEW_PORTALS = new Set(['director', 'hms', 'management', 'admin', 'executive']);

function normalizePortalCode(code) {
  return String(code || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_');
}

function isDepartmentPortal(portalCode) {
  return DEPT_PORTAL_CODES.has(normalizePortalCode(portalCode));
}

/**
 * Whether portal-generic should embed the hospital overview (stats + clinical modules).
 * Department staff portals never get it; executive/custom hubs may.
 */
function shouldShowHospitalOverview(portalCode, role, opts) {
  opts = opts || {};
  const r = String(role != null ? role : '');
  if (r === '1' || r === '99') return true;
  const code = normalizePortalCode(portalCode);
  if (isDepartmentPortal(code)) return false;
  if (EXECUTIVE_OVERVIEW_PORTALS.has(code)) return true;
  if (opts.homePortalCode && isDepartmentPortal(opts.homePortalCode)) return false;
  return false;
}

/** Redirect /portal/hub/radiology → /portal/radiology when a dedicated page exists. */
function dedicatedPortalRedirect(portalCode) {
  const code = normalizePortalCode(portalCode);
  const url = BUILTIN_HOME_URLS[code];
  if (!url || !String(url).startsWith('/portal/')) return null;
  const hubPath = `/portal/hub/${code}`;
  if (url === hubPath) return null;
  return url;
}

function userHasDashboardPermission(userPerms) {
  const perms = Array.isArray(userPerms) ? userPerms : [];
  return perms.includes('*') || perms.includes('dashboard.read');
}

/**
 * Show ZAIZENS brand link → /dashboard in global chrome.
 * Permission-only: granted when the user has dashboard.read (same gate as GET /dashboard).
 * Home portal / department type is not considered.
 */
function canShowHospitalDashboardBrand(userPerms, role, opts) {
  void opts;
  const r = String(role != null ? role : '');
  if (r === '1' || r === '99') return true;
  return userHasDashboardPermission(userPerms);
}

module.exports = {
  DEPT_PORTAL_CODES,
  EXECUTIVE_OVERVIEW_PORTALS,
  normalizePortalCode,
  isDepartmentPortal,
  shouldShowHospitalOverview,
  dedicatedPortalRedirect,
  userHasDashboardPermission,
  canShowHospitalDashboardBrand,
};
