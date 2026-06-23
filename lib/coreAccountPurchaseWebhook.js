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

async function syncPurchaseOrderToCoreAccount(pool, poId, opts = {}) {
  if (!cfg.isIntegrationEnabled()) return { ok: false, skipped: true, reason: 'disabled' };
  const url = cfg.coreAccountUrl();
  const key = cfg.coreAccountApiKey();
  if (!url || !key) return { ok: false, skipped: true, reason: 'missing config' };

  const id = parseInt(String(poId || ''), 10) || 0;
  if (id < 1) return { ok: false, skipped: true, reason: 'invalid po id' };

  const po = opts.po || null;
  if (!po) return { ok: false, skipped: true, reason: 'missing po' };

  const amount = parseFloat(po.total_amount) || parseFloat(opts.amount) || 0;
  if (amount <= 0) return { ok: false, skipped: true, reason: 'zero amount' };

  const body = {
    po_id: id,
    po_number: po.po_number || `PO-${id}`,
    supplier_name: po.supplier_name || po.vendor_name || 'Vendor',
    amount,
    stock_kind: opts.stockKind || 'procurement',
    entry_date: opts.entryDate || new Date().toISOString().slice(0, 10),
    reference: po.po_number || `PO-${id}`,
    narration: opts.narration || `Purchase order ${po.po_number || id}`,
  };

  const headers = {
    'X-API-Key': key,
    'X-Facility-Id': String(cfg.facilityId()),
  };

  try {
    const res = await postJson(`${url}/api/v1/integrations/purchase-order`, body, headers);
    const ok = res.ok || res.status === 409 || res.data?.status === 'duplicate';
    const status = ok ? 'sent' : 'failed';
    await pool
      .query(
        `UPDATE tbl_purchase_order SET external_core_sync_status=?, external_core_sync_at=NOW() WHERE id=?`,
        [status, id]
      )
      .catch(() => {});
    return { ok, status: res.status, data: res.data };
  } catch (e) {
    await pool
      .query(
        `UPDATE tbl_purchase_order SET external_core_sync_status='failed', external_core_sync_at=NOW() WHERE id=?`,
        [id]
      )
      .catch(() => {});
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = { syncPurchaseOrderToCoreAccount };
