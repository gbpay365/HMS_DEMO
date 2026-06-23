'use strict';

function envFlag(name, defaultValue = '0') {
  return String(process.env[name] ?? defaultValue).trim() === '1';
}

function envStr(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function envInt(name, fallback = 1) {
  const n = parseInt(String(process.env[name] ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

module.exports = {
  isIntegrationEnabled() {
    return envFlag('CORE_ACCOUNT_SYNC_ENABLED', '0');
  },
  isPayrollSelfServiceEnabled() {
    return envFlag('PAYROLL_SELF_SERVICE_ENABLED', '0');
  },
  integrationMode() {
    return envStr('INTEGRATION_MODE', 'account_core');
  },
  isAccountCoreMode() {
    return module.exports.integrationMode() === 'account_core' || module.exports.isIntegrationEnabled();
  },
  coreAccountUrl() {
    return envStr('CORE_ACCOUNT_URL', 'http://127.0.0.1:5072').replace(/\/+$/, '');
  },
  coreAccountApiKey() {
    return envStr('CORE_ACCOUNT_WEBHOOK_KEY', envStr('CORE_ACCOUNT_API_KEY', 'dev-integration-key-change-in-production'));
  },
  hmsInboundApiKey() {
    return envStr('HMS_INTEGRATION_API_KEY', 'dev-hms-inbound-key-change-in-production');
  },
  facilityId() {
    return envInt('CORE_ACCOUNT_FACILITY_ID', 1);
  },
  isZaizensPayrollSyncEnabled() {
    return envFlag('ZAIZENS_PAYROLL_SYNC_ENABLED', '0');
  },
  zaizensPayrollUrl() {
    return envStr('ZAIZENS_PAYROLL_URL', 'http://127.0.0.1:3010').replace(/\/+$/, '');
  },
  zaizensPayrollApiKey() {
    return envStr('ZAIZENS_PAYROLL_API_KEY', envStr('HMS_INTEGRATION_API_KEY', 'dev-hms-inbound-key-change-in-production'));
  },
  publicBaseUrl() {
    return envStr('PUBLIC_BASE_URL', envStr('HMS_PUBLIC_URL', '')).replace(/\/+$/, '');
  },
};
