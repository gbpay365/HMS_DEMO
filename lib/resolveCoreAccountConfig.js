'use strict';

const envCfg = require('./integrationConfig');
const { getSettings } = require('./facilityIntegrationSettings');

/**
 * Resolve Account_Core URL, API key, and enabled flag from facility DB settings with env fallbacks.
 */
async function resolveCoreAccountConfig(pool, facilityId = 1) {
  const fid = Math.max(1, parseInt(String(facilityId), 10) || 1);
  let row = null;
  if (pool) {
    try {
      row = await getSettings(pool, fid);
    } catch (_) {
      row = null;
    }
  }

  const url = String(row?.core_account_url || envCfg.coreAccountUrl() || '')
    .trim()
    .replace(/\/+$/, '');
  const key = String(row?.core_account_api_key || envCfg.coreAccountApiKey() || '').trim();
  const enabled = row
    ? parseInt(String(row.core_account_sync_enabled), 10) === 1
    : envCfg.isIntegrationEnabled();

  return { url, key, enabled, facilityId: fid, source: row ? 'facility+env' : 'env' };
}

module.exports = { resolveCoreAccountConfig };
