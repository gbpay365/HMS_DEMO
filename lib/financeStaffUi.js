'use strict';

/** Accountant role id in tbl_role (see ensureAclSchema role 9). Director is not finance staff. */
const ACCOUNTANT_ROLE_IDS = new Set(['9']);

function isAccountantRole(role) {
  return ACCOUNTANT_ROLE_IDS.has(String(role != null ? role : ''));
}

/** True when staff should use the Accounting module shell (sidebar + home), not the hospital dashboard. */
function isFinanceStaffUser(role, aclLayout) {
  const r = String(role != null ? role : '');
  if (r === '1' || r === '99') return false;
  if (isAccountantRole(r)) return true;
  if (aclLayout && typeof aclLayout.homePortal === 'function') {
    return aclLayout.homePortal(r) === 'accountant';
  }
  return false;
}

/** Landing URL for accountant / finance-primary staff. */
function financeStaffHomeUrl() {
  return '/financials';
}

/** Active fin-rail key from request path (for sidebar highlight). */
function finNavFromPath(path) {
  const p = String(path || '').split('?')[0];
  if (p === '/financials' || p === '/portal/accountant') return 'dashboard';
  if (p === '/billing' || p.startsWith('/billing/')) return 'billing';
  if (p === '/cashier' || p.startsWith('/cashier/')) return 'cashier';
  if (p === '/tax' || p.startsWith('/tax/')) return 'tax_hub';
  if (p === '/payroll' || p.startsWith('/payroll/') || p.startsWith('/hr/')) return 'payroll';
  if (p.startsWith('/financials/journal-new')) return 'journal';
  if (p.startsWith('/financials/journal-loader')) return 'journal';
  if (p.startsWith('/financials/journal-diagnostics')) return 'diag';
  if (p.startsWith('/financials/journal')) return 'journal';
  if (p.startsWith('/financials/expenses')) return 'expenses';
  if (p.startsWith('/financials/treasury')) return 'banking';
  if (p.startsWith('/financials/bank-reconciliation')) return 'reconcile';
  if (p.startsWith('/financials/accounts')) return 'coa';
  if (p.startsWith('/financials/general-ledger')) return 'gl';
  if (p.startsWith('/financials/trial-balance')) return 'tb';
  if (p.startsWith('/financials/balance-sheet')) return 'bs';
  if (p.startsWith('/financials/cash-flow')) return 'cf';
  if (p.startsWith('/financials/accounts-receivable')) return 'ar';
  if (p.startsWith('/financials/accounts-payable')) return 'ap';
  if (p.startsWith('/financials/statement-monthly')) return 'reports';
  if (p.startsWith('/financials/year-end')) return 'reports';
  if (p.startsWith('/financials/settings')) return 'settings';
  if (p.startsWith('/financials/tax')) return 'settings';
  if (p.startsWith('/financials/sync-gl')) return 'sync';
  if (p.startsWith('/financials/platform-overview')) return 'setup';
  if (p.startsWith('/financials/')) return 'dashboard';
  return '';
}

module.exports = {
  isAccountantRole,
  isFinanceStaffUser,
  financeStaffHomeUrl,
  finNavFromPath,
};
