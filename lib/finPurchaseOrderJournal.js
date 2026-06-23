'use strict';

const { finTablesOk } = require('./hmsFinGeneralLedger');
const { toIsoDatePart } = require('./hmsFormatDate');
const { journalPostExtended, journalPostLastError } = require('./hmsFinJournalPost');
const { loadTvaRate, buildPurchaseOrderLines } = require('./finPostingTemplates');
const { APPLY_TVA_ON_SYNC } = require('./finAccountingConfig');

function inferStockKindFromPoNumber(poNumber) {
  const n = String(poNumber || '').trim().toUpperCase();
  if (n.startsWith('PHA-PO') || n.startsWith('PHA')) return 'pharmacy';
  return 'procurement';
}

function computePoAmount(po, lines = []) {
  const stored = Math.round((parseFloat(po?.total_amount) || 0) * 100) / 100;
  if (stored > 0) return stored;
  let total = 0;
  for (const l of lines || []) {
    const qty = parseFloat(l.quantity) || 0;
    const price = parseFloat(l.unit_price) || 0;
    total += qty * price;
  }
  return Math.round(total * 100) / 100;
}

function poEntryDate(po) {
  for (const raw of [po?.issued_at, po?.approved_at, po?.updated_at, po?.created_at]) {
    const d = toIsoDatePart(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  return new Date().toISOString().slice(0, 10);
}

function purchaseOrderJournalSuffix(code) {
  if (code === 1) return ' Posted to journal.';
  if (code === 2) return ' (Journal entry already exists.)';
  return '';
}

/**
 * Post ACH journal when a purchase order is received (stock in · supplier payable).
 * @returns {Promise<0|1|2>} 0 failed/skipped, 1 inserted, 2 duplicate
 */
async function postPurchaseOrderToGl(pool, opts = {}) {
  const fid = Math.max(1, parseInt(String(opts.facilityId || 1), 10) || 1);
  const poId = Math.max(0, parseInt(String(opts.poId || 0), 10) || 0);
  const po = opts.po || null;
  const lines = opts.lines || [];
  const createdBy = Math.max(0, parseInt(String(opts.createdBy || 0), 10) || 0);
  if (!(await finTablesOk(pool)) || fid < 1 || poId < 1 || !po) return 0;

  const amount = computePoAmount(po, lines);
  if (amount <= 0) return 0;

  const stockKind = String(opts.stockKind || inferStockKindFromPoNumber(po.po_number)).trim() || 'procurement';
  const entryDate = poEntryDate(po);
  const supplier = String(po.supplier_name || po.vendor_name || 'Vendor').trim().slice(0, 120);
  const poNumber = String(po.po_number || `PO-${poId}`).trim().slice(0, 64);
  const notes = String(po.po_notes || po.summary_description || '').trim().slice(0, 200);
  const nar = `Purchase order · ${poNumber} · ${supplier}${notes ? ` — ${notes}` : ''}`.slice(0, 512);

  const tvaRate = await loadTvaRate(pool, fid);
  const glLines = buildPurchaseOrderLines(amount, stockKind, tvaRate, APPLY_TVA_ON_SYNC);
  if (!glLines.length) return 0;

  const r = await journalPostExtended(pool, {
    facilityId: fid,
    sourceType: 'purchase_order',
    sourceId: poId,
    reference: poNumber,
    narration: nar,
    createdBy,
    lines: glLines,
    entryDate,
    journalCode: 'ACH',
    status: 'posted',
  });
  if (r.duplicate) return 2;
  if (r.code === 1) {
    try {
      const { syncPurchaseOrderToCoreAccount } = require('./coreAccountPurchaseWebhook');
      await syncPurchaseOrderToCoreAccount(pool, poId, {
        po,
        lines,
        stockKind,
        entryDate,
        amount,
        narration: nar,
      });
    } catch (_) { /* non-blocking */ }
    if (stockKind === 'capital') {
      try {
        const { syncFixedAssetToCoreAccount } = require('./coreAccountFixedAssetSync');
        const firstLine = (lines && lines[0]) || {};
        await syncFixedAssetToCoreAccount({
          externalRef: `po-${poId}`,
          code: `PO-${poNumber}`,
          name: notes || `${supplier} · ${poNumber}`,
          category: 'equipment',
          acquisitionDate: entryDate,
          cost: amount,
          purchaseOrderRef: poNumber,
          postAcquisition: false,
        });
      } catch (_) { /* non-blocking */ }
    }
    return 1;
  }
  return r.code === 1 ? 1 : 0;
}

module.exports = {
  inferStockKindFromPoNumber,
  computePoAmount,
  poEntryDate,
  purchaseOrderJournalSuffix,
  postPurchaseOrderToGl,
  journalPostLastError,
};
