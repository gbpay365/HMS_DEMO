'use strict';

const { integrationMode } = require('./integrationConfig');

function isPayrollSelfServiceBlocked() {
  const mode = integrationMode();
  return mode === 'account_core' || String(process.env.PAYROLL_SELF_SERVICE_ENABLED || '0').trim() !== '1';
}

function blockPayrollSelfService(req, res) {
  if (!isPayrollSelfServiceBlocked()) return false;
  const wantsJson = String(req.headers.accept || '').includes('application/json')
    || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
  const msg = 'Payslips and salary details are managed in Account_Core. Contact HR or Finance.';
  if (wantsJson) {
    res.status(403).json({ ok: false, error: msg });
    return true;
  }
  res.status(403).render('error', { title: 'Access denied', message: msg, status: 403 });
  return true;
}

module.exports = {
  isPayrollSelfServiceBlocked,
  blockPayrollSelfService,
};
