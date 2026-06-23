'use strict';

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'data', 'hospital_service_catalog_prices.json');

/**
 * Default posting revenue accounts per HMS service category (Core_Account 6-digit leaves).
 */
const REVENUE_SERVICE_ACCOUNTS = {
  consultation: '701601',
  laboratory: '702606',
  radiology: '703601',
  pharmacy: '704601',
  hospitalisation: '706631',
  emergency: '701601',
  charge: '706631',
  default: '706631',
};

function loadCatalogPayload() {
  try {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch (_) {
    return { by_account_code: {} };
  }
}

function revenueAccountForCategory(category) {
  const key = String(category || 'default').toLowerCase();
  return REVENUE_SERVICE_ACCOUNTS[key] || REVENUE_SERVICE_ACCOUNTS.default;
}

function catalogEntryForAccount(code) {
  const payload = loadCatalogPayload();
  return payload.by_account_code?.[String(code || '').trim()] || null;
}

module.exports = {
  REVENUE_SERVICE_ACCOUNTS,
  loadCatalogPayload,
  revenueAccountForCategory,
  catalogEntryForAccount,
};
