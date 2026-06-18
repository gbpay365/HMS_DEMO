'use strict';

/** Accounting module shell top bar (Cashier, Financials, Billing pages). */
const ACCOUNTING_TOPNAV_PARENT_ORDER = Object.freeze([
  'fin.nav.customers',
  'fin.nav.transactions',
  'fin.nav.books',
  'fin.nav.reporting',
  'fin.nav.configuration',
]);

const ACCOUNTING_PRIMARY_CODES = Object.freeze(['fin.nav.dashboard', 'fin.nav.payroll']);

/** Maps finNavActive keys (set on pages) to dropdown menus. */
const FIN_MENU_ACTIVE_KEYS = Object.freeze({
  'fin.nav.customers': ['billing', 'cashier', 'ar'],
  'fin.nav.transactions': ['journal', 'expenses', 'banking', 'reconcile'],
  'fin.nav.books': ['coa', 'gl', 'tb'],
  'fin.nav.reporting': ['bs', 'cf', 'ap', 'reports'],
  'fin.nav.configuration': ['settings', 'sync', 'diag', 'setup', 'tax_hub'],
});

function finMenuActiveClass(menuCode, finNavKey, path, childUrls) {
  const key = String(finNavKey || '').trim();
  const groups = FIN_MENU_ACTIVE_KEYS[menuCode];
  if (key && groups && groups.includes(key)) return ' active';
  const p = String(path || '').split('?')[0];
  if (!p) return '';
  for (const u of childUrls || []) {
    const url = String(u || '').trim().split('?')[0];
    if (!url) continue;
    if (p === url || p.indexOf(url + '/') === 0) return ' active';
  }
  return '';
}

module.exports = {
  ACCOUNTING_TOPNAV_PARENT_ORDER,
  ACCOUNTING_PRIMARY_CODES,
  FIN_MENU_ACTIVE_KEYS,
  finMenuActiveClass,
};
