'use strict';

const { urlAllowedBySlices } = require('./aclNavSlices');
const deploymentConfig = require('./deploymentConfig');

/**
 * Path → { perms, codes } built from tbl_acl_ui_element + static supplements.
 * Longest-prefix wins for dynamic segments (e.g. /patients/edit/12).
 */

let _entries = [];
let _urlToCodes = new Map();

/** Routes not in UI catalogue or needing explicit permission lists. */
const STATIC_ROUTES = Object.freeze([
  { path: '/dashboard', perms: 'dashboard.read|*' },
  { path: '/profile', perms: 'profile.self.read|profile.self.write|*' },
  { path: '/my-profile', perms: 'profile.self.read|profile.self.write|*' },
  { path: '/super-admin', perms: '*', roles: ['99'] },
  { path: '/access-control', perms: 'access_control.manage|*' },
  { path: '/hms-admin/access', perms: 'access_control.manage|*' },
  { path: '/hms-admin/subscriptions', perms: 'subscriptions.manage|*' },
  { path: '/admin/consultation-rooms', perms: 'access_control.manage|opd.write|nursing.write|scheduling.read|*' },
  { path: '/docs/product-document', perms: '*' },
  { path: '/docs/comprehensive-user-guide', perms: '*' },
  { path: '/user-manual', perms: '*' },
  { path: '/front-desk/validate-payment-code', perms: 'front_desk.payment_code.validate|opd.read|patient.read|*' },
  { path: '/payment-validity', perms: 'payment.validity.read|payment.validity.write|billing.write|*' },
  { path: '/settings/employee-password', perms: 'employee.password.manage|*' },
  { path: '/employees/reset-password', perms: 'employee.password.manage|*' },
  { path: '/employees/add', perms: 'employee.write|*' },
  { path: '/settings/employee-add', perms: 'employee.write|*' },
  { path: '/wallet-management', perms: 'accounting.read|cashier.write|*' },
  { path: '/credit-receivables', perms: 'credit.read|credit.write|accounting.read|*' },
  { path: '/insurance-claims', perms: 'insurance.read|insurance.write|accounting.read|*' },
  { path: '/laboratory/order-alerts', perms: 'lab.write|lab.read' },
  { path: '/laboratory/supply-requests', perms: 'lab.read|lab.write' },
  { path: '/radiology/order-alerts', perms: 'radiology.write|radiology.read' },
  { path: '/radiology/supply-requests', perms: 'radiology.read|radiology.write' },
  { path: '/pharmacy/order-alerts', perms: 'pharmacy.write|pharmacy.read' },
  { path: '/lab/templates', perms: 'lab.write|lab.read' },
  { path: '/clinical/follow-up-opd', perms: 'clinical.write|prescription.write' },
  { path: '/ipd', perms: 'adt.read|adt.write|nursing.read|clinical.read|clinical.write' },
  { path: '/ipd/config', perms: 'adt.write|clinical.write|access_control.manage' },
  { path: '/death-registry', perms: 'adt.read|adt.write|clinical.read|clinical.write|nursing.read|nursing.write|emergency.read|maternity.read' },
  { path: '/death-registry/certifying-doctors', perms: 'adt.read|adt.write|clinical.read|clinical.write|nursing.read|nursing.write|emergency.read|maternity.read' },
  { path: '/ipd/death-registry', perms: 'adt.read|adt.write|clinical.write|nursing.write' },
  { path: '/hms', perms: 'clinical.read|clinical.write|opd.read|patient.read|nursing.read|cashier.read' },
  { path: '/hms/reports', perms: 'clinical.read|analytics.read|financials.read|cashier.read|billing.read' },
  { path: '/hms/waiting-screen', perms: '*' },
  { path: '/verify/rx', perms: '*' },
  { path: '/hms/commission', perms: 'payroll.read|financials.read|clinical.write' },
  { path: '/hms/prescription-verify', perms: 'pharmacy.read|pharmacy.write|clinical.read|prescription.read|opd.read|nursing.read|hms_reports.read' },
  { path: '/visiting-doctor', perms: '*' },
  { path: '/visiting-doctor/setup', perms: 'visiting_doctor.setup|clinical.read' },
  { path: '/visiting-doctor/my-visit', perms: 'visiting_doctor.setup|clinical.read' },
  { path: '/admin/visiting-doctors', perms: 'visiting_doctor.manage|employee.write|access_control.manage|*' },
  { path: '/hms/config', perms: 'service_catalog.write|facility.admin|clinical.write|settings.org_clinical.write|service_catalog.consultation.write|employee.write' },
  { path: '/hms/appointments/slots-config', perms: 'scheduling.write|clinical.write' },
  { path: '/hr/request-leave', perms: 'hr.self.read|payroll.read|payroll.write|*' },
  { path: '/hr/my-payslips', perms: 'hr.self.read|payroll.read|payroll.write|*' },
  { path: '/hr/my-attendance', perms: 'hr.self.read|payroll.read|payroll.write|*' },
  { path: '/hr/my-leave-balance', perms: 'hr.self.read|payroll.read|payroll.write|*' },
  { path: '/lims', perms: 'lab.read|lab.write|clinical.read|clinical.write|nursing.read' },
  { path: '/lims/config', perms: 'lab.write|service_catalog.laboratory.write' },
  { path: '/patient-chart', perms: 'patient.directory.chart|chart.read|patient.read|clinical.read|clinical.write' },
  { path: '/nurse-roster', perms: 'nurse_duty.read|nurse_duty.write' },
  { path: '/doctor-roster', perms: 'doctor_duty.read|doctor_duty.write' },
  { path: '/cashier/nurse-roster', perms: 'cashier.read|cashier.write|nurse_duty.read|nurse_duty.write' },
  { path: '/cashier/doctor-roster', perms: 'cashier.read|cashier.write|doctor_duty.read|doctor_duty.write' },
  { path: '/doctor/schedule', perms: 'doctor_duty.read|clinical.read|clinical.write|scheduling.read' },
  { path: '/facilities', perms: '*', roles: ['99'] },
  { path: '/cashier/print-batch', perms: 'cashier.read|billing.read|*' },
  { path: '/cashier/print-receipt-batch', perms: 'cashier.read|billing.read|*' },
  { path: '/cashier/print-slip', perms: 'cashier.read|cashier.write|billing.read|*' },
]);

const SKIP_PREFIXES = Object.freeze([
  '/css/',
  '/js/',
  '/img/',
  '/favicon',
  '/login',
  '/logout',
  '/api/',
  '/portal/login',
  '/portal/patient',
  '/health',
]);

function shouldSkipPath(path) {
  const p = String(path || '');
  if (!p || p === '/') return true;
  for (const pre of SKIP_PREFIXES) {
    if (p === pre.replace(/\/$/, '') || p.startsWith(pre)) return true;
  }
  return false;
}

function mergePerm(existing, add) {
  const set = new Set(String(existing || '').split('|').map((s) => s.trim()).filter(Boolean));
  for (const k of String(add || '').split('|')) {
    const t = k.trim();
    if (t) set.add(t);
  }
  return Array.from(set).join('|') || '*';
}

function rebuildFromUiRows(rows) {
  const byPath = new Map();
  const urlCodes = new Map();

  for (const r of rows || []) {
    const url = String(r.url || '').trim().split('?')[0];
    if (!url || url === '__home__' || !url.startsWith('/')) continue;
    const code = String(r.code);
    if (!urlCodes.has(url)) urlCodes.set(url, []);
    urlCodes.get(url).push(code);

    const cur = byPath.get(url) || { path: url, perms: '', codes: [] };
    cur.perms = mergePerm(cur.perms, r.required_perm);
    if (!cur.codes.includes(code)) cur.codes.push(code);
    byPath.set(url, cur);
  }

  for (const s of STATIC_ROUTES) {
    const cur = byPath.get(s.path) || { path: s.path, perms: '', codes: [], roles: s.roles };
    cur.perms = mergePerm(cur.perms, s.perms);
    if (s.roles) cur.roles = s.roles;
    byPath.set(s.path, cur);
    if (!urlCodes.has(s.path)) urlCodes.set(s.path, []);
  }

  _entries = Array.from(byPath.values()).sort(
    (a, b) => b.path.length - a.path.length
  );
  _urlToCodes = urlCodes;
}

function refresh(uiRows) {
  rebuildFromUiRows(uiRows);
}

function match(pathname) {
  const path = String(pathname || '').split('?')[0];
  if (shouldSkipPath(path)) return null;
  for (const e of _entries) {
    if (path === e.path || path.startsWith(e.path + '/')) return e;
  }
  return null;
}

function permsSatisfied(perms, required) {
  if (!Array.isArray(perms) || perms.includes('*')) return true;
  const keys = String(required || '*').split('|').map((s) => s.trim()).filter(Boolean);
  if (!keys.length || keys.includes('*')) return true;
  return keys.some((k) => perms.includes(k));
}

/**
 * @returns {null|'ok'|{status:number, error:string}}
 */
function checkAccess(req, userPerms, viewerRole) {
  const role = String(viewerRole || '');
  if (role === '99') return null;

  const path = req.path || '';
  const hit = match(path);
  if (!hit) return null;

  if (hit.roles && hit.roles.length && !hit.roles.includes(role)) {
    return { status: 403, error: 'This area is restricted to Super Admin.' };
  }

  const slices = deploymentConfig.getSlices();
  const overrides = deploymentConfig.getModuleOverrides();
  if (!urlAllowedBySlices(hit.path, _urlToCodes, slices, overrides)) {
    const dep = deploymentConfig.getDeployment();
    return {
      status: 403,
      error:
        'This module is not enabled for the current hospital deployment' +
        (dep.profileName ? ' (“' + dep.profileName + '”).' : '.'),
    };
  }

  const hmsLicense = require('./hmsLicense');
  if (!hmsLicense.isRouteAllowedByLicense(hit.path, _urlToCodes)) {
    return {
      status: 403,
      error: 'This solution is not licensed or your subscription has expired. Open Solution Subscriptions to renew.',
    };
  }

  if (!permsSatisfied(userPerms, hit.perms)) {
    return {
      status: 403,
      error: 'Access denied. You do not have permission to open this section.',
    };
  }

  return null;
}

function getRegistrySize() {
  return _entries.length;
}

module.exports = {
  refresh,
  match,
  checkAccess,
  shouldSkipPath,
  getRegistrySize,
  STATIC_ROUTES,
};
