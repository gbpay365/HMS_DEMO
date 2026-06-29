'use strict';

const fs = require('fs');
const path = require('path');
const { glMaps, revenueAccountForCategory: mapRevenueCode } = require('./finGlAccountMaps');
const hmsCountry = require('./hmsCountry');

const CATALOG_PATH = path.join(__dirname, 'data', 'hospital_service_catalog_prices.json');

/** Default posting revenue accounts per HMS service category (country-aware). */
function revenueServiceAccounts() {
  return { ...glMaps().revenue };
}

const REVENUE_SERVICE_ACCOUNTS = revenueServiceAccounts();

function loadCatalogPayloadRaw() {
  try {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch (_) {
    return { by_account_code: {} };
  }
}

/** Remap OHADA revenue codes (7016xx…) to Nigeria IFRS category accounts (5101xx). */
function remapCatalogForCountry(payload) {
  if (!hmsCountry.isNigeria || !payload?.by_account_code) return payload;
  const by = {};
  for (const entry of Object.values(payload.by_account_code)) {
    const ngCode = mapRevenueCode(entry.hms_category);
    if (!ngCode) continue;
    const prev = by[ngCode];
    if (!prev) {
      by[ngCode] = {
        ...entry,
        account_code: ngCode,
        label: entry.label?.replace(/\b70\d{4}\b/g, ngCode) || entry.label,
      };
      continue;
    }
    const mergedServices = [...(prev.services || []), ...(entry.services || [])];
    const seen = new Set();
    prev.services = mergedServices.filter((s) => {
      const k = String(s.key || s.name || '');
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if ((entry.default_price || 0) > (prev.default_price || 0)) {
      prev.default_price = entry.default_price;
    }
  }
  return { ...payload, by_account_code: by };
}

function loadCatalogPayload() {
  return remapCatalogForCountry(loadCatalogPayloadRaw());
}

function revenueAccountForCategory(category) {
  return mapRevenueCode(category);
}

function catalogEntryForAccount(code) {
  const payload = loadCatalogPayload();
  return payload.by_account_code?.[String(code || '').trim()] || null;
}

module.exports = {
  REVENUE_SERVICE_ACCOUNTS,
  revenueServiceAccounts,
  loadCatalogPayload,
  loadCatalogPayloadRaw,
  remapCatalogForCountry,
  revenueAccountForCategory,
  catalogEntryForAccount,
};
