'use strict';

const cfg = require('./integrationConfig');

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
 * Register a capital asset received in HMS into Account_Core fixed asset register.
 * @param {object} opts - { externalRef, code, name, category, acquisitionDate, cost, usefulLifeMonths, serialNumber, location, custodian, purchaseOrderRef, postAcquisition }
 */
async function syncFixedAssetToCoreAccount(opts = {}) {
  if (!cfg.isIntegrationEnabled()) return { ok: false, skipped: true, reason: 'disabled' };
  const url = cfg.coreAccountUrl();
  const key = cfg.coreAccountApiKey();
  if (!url || !key) return { ok: false, skipped: true, reason: 'missing config' };

  const externalRef = String(opts.externalRef || opts.external_ref || '').trim();
  if (!externalRef) return { ok: false, skipped: true, reason: 'missing external_ref' };

  const cost = parseFloat(opts.cost) || 0;
  if (cost <= 0) return { ok: false, skipped: true, reason: 'zero cost' };

  const body = {
    externalRef,
    code: String(opts.code || `HMS-${externalRef}`).trim(),
    name: String(opts.name || 'Capital asset').trim(),
    category: String(opts.category || 'medical').trim(),
    acquisitionDate: opts.acquisitionDate || opts.acquisition_date || new Date().toISOString().slice(0, 10),
    cost,
    usefulLifeMonths: parseInt(String(opts.usefulLifeMonths || opts.useful_life_months || 60), 10) || 60,
    serialNumber: opts.serialNumber || opts.serial_number || null,
    location: opts.location || null,
    custodian: opts.custodian || null,
    purchaseOrderRef: opts.purchaseOrderRef || opts.purchase_order_ref || null,
    postAcquisition: opts.postAcquisition === true || opts.post_acquisition === true,
    creditAccountCode: opts.creditAccountCode || opts.credit_account_code || '401100',
  };

  const headers = {
    'X-API-Key': key,
    'X-Facility-Id': String(cfg.facilityId()),
  };

  try {
    const res = await postJson(`${url}/api/v1/integrations/fixed-asset`, body, headers);
    const ok = res.ok || res.status === 409 || res.data?.status === 'duplicate';
    return { ok, status: res.status, data: res.data };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = { syncFixedAssetToCoreAccount };
