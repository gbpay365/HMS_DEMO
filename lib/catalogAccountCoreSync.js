'use strict';

const { writeServiceCatalogFile } = require('./buildServiceCatalogExport');

function isEnabled() {
  return String(process.env.CORE_ACCOUNT_SYNC_ENABLED || '0').trim() === '1';
}

function baseUrl() {
  return String(process.env.CORE_ACCOUNT_URL || '').trim().replace(/\/+$/, '');
}

function apiKey() {
  return String(process.env.CORE_ACCOUNT_WEBHOOK_KEY || process.env.CORE_ACCOUNT_API_KEY || '').trim();
}

async function postJson(url, body, headers) {
  if (typeof fetch !== 'function') {
    return { ok: false, status: 0, data: { error: 'fetch unavailable' } };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Rebuild catalog JSON from MySQL and push to Account_Core integration endpoint.
 */
async function exportAndSyncServiceCatalog(pool) {
  const payload = await writeServiceCatalogFile(pool);

  if (!isEnabled()) {
    return { ok: true, skipped: true, reason: 'sync disabled', localOnly: true };
  }
  const url = baseUrl();
  const key = apiKey();
  if (!url || !key) {
    return { ok: true, skipped: true, reason: 'missing core config', localOnly: true };
  }

  const facilityId = parseInt(String(process.env.HMS_FACILITY_ID || '1'), 10) || 1;
  const res = await postJson(
    `${url}/api/v1/integrations/service-catalog`,
    {
      facility_id: facilityId,
      generated_at: payload.generated_at,
      currency: payload.currency,
      by_account_code: payload.by_account_code,
    },
    { 'X-API-Key': key, 'X-Facility-Id': String(facilityId) }
  );

  if (!res.ok) {
    console.error('[catalog-sync] Account_Core rejected:', res.status, res.data);
    return { ok: false, status: res.status, data: res.data, localOnly: false };
  }

  console.log('[catalog-sync] pushed to Account_Core at', payload.generated_at);
  return { ok: true, status: res.status, data: res.data };
}

let debounceTimer = null;

function scheduleServiceCatalogSync(pool) {
  if (!pool) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    exportAndSyncServiceCatalog(pool).catch((e) => {
      console.error('[catalog-sync]', e.message || e);
    });
  }, 400);
}

module.exports = {
  exportAndSyncServiceCatalog,
  scheduleServiceCatalogSync,
};
