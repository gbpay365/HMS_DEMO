'use strict';

/** Canonical cashier module landing (Odoo shell + dashboard overview). */
const CASHIER_MODULE_LANDING = '/cashier?page=dashboard';

function normalizePathOnly(url) {
  return String(url || '')
    .trim()
    .split('?')[0]
    .replace(/\/+$/, '')
    .toLowerCase();
}

function isCashierPortalCode(code) {
  return String(code || '')
    .trim()
    .toLowerCase() === 'cashier';
}

function isCashierLandingPath(url) {
  const path = normalizePathOnly(url);
  return path === '/cashier' || path === '/portal/cashier' || path === '/portal/hub/cashier';
}

/** Map legacy cashier portal URLs to the cashier module. */
function resolveCashierLandingUrl(url) {
  if (isCashierLandingPath(url)) return CASHIER_MODULE_LANDING;
  return url;
}

module.exports = {
  CASHIER_MODULE_LANDING,
  isCashierPortalCode,
  isCashierLandingPath,
  resolveCashierLandingUrl,
};
