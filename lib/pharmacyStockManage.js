'use strict';

const { pharmacyCatalogJoin } = require('./pharmacyProductScope');
const recordInventoryMovement = require('./recordInventoryMovement');

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} itemId
 */
async function loadPharmacyInventoryItem(pool, itemId) {
  const id = parseInt(itemId, 10) || 0;
  if (id < 1) return null;
  const [[row]] = await pool.query(
    `SELECT i.id, i.quantity, i.reorder_level, i.sku, i.name, i.service_catalog_id,
            sc.id AS catalog_id, sc.name AS catalog_name, sc.price AS catalog_price,
            sc.department_name AS catalog_used_for
     FROM tbl_inventory_item i
     ${pharmacyCatalogJoin('i', 'sc')}
     WHERE i.id = ? LIMIT 1`,
    [id]
  );
  return row || null;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ itemId: number, delta: number, note?: string, userId?: number|null, reason?: string }} opts
 */
async function adjustPharmacyStock(pool, opts) {
  const item = await loadPharmacyInventoryItem(pool, opts.itemId);
  if (!item) return { ok: false, error: 'Pharmacy product not found or not linked to the service catalog.' };

  const delta = parseInt(opts.delta, 10);
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: 'Enter a non-zero quantity change.' };
  }
  if (Math.abs(delta) > 10000000) {
    return { ok: false, error: 'Adjustment is too large.' };
  }

  const before = parseInt(item.quantity, 10) || 0;
  const after = before + delta;
  if (after < 0) {
    return { ok: false, error: 'Resulting quantity cannot be negative.' };
  }

  await pool.query('UPDATE tbl_inventory_item SET quantity = ? WHERE id = ? LIMIT 1', [after, item.id]);
  await recordInventoryMovement(pool, {
    inventory_item_id: item.id,
    change_qty: delta,
    qty_before: before,
    qty_after: after,
    reason: opts.reason || 'adjust',
    note: opts.note || 'Pharmacy stock adjustment',
    user_id: opts.userId ?? null,
  });

  return { ok: true, item, qtyBefore: before, qtyAfter: after };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ itemId: number, reorderLevel: number }} opts
 */
async function setPharmacyReorderLevel(pool, opts) {
  const item = await loadPharmacyInventoryItem(pool, opts.itemId);
  if (!item) return { ok: false, error: 'Pharmacy product not found.' };
  const reorder = Math.max(0, parseInt(opts.reorderLevel, 10) || 0);
  await pool.query('UPDATE tbl_inventory_item SET reorder_level = ? WHERE id = ? LIMIT 1', [reorder, item.id]);
  return { ok: true, reorder };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ itemId: number, qtyAdd: number, userId?: number|null }} opts
 */
async function receivePharmacyStock(pool, opts) {
  return adjustPharmacyStock(pool, {
    itemId: opts.itemId,
    delta: opts.qtyAdd,
    reason: 'pharmacy_receive',
    note: 'Pharmacy — receive stock',
    userId: opts.userId ?? null,
  });
}

function safePharmacyReturnUrl(raw) {
  const ret = String(raw || '').trim();
  if (ret.startsWith('/pharmacy') && !ret.startsWith('//')) return ret;
  return '/pharmacy?view=products';
}

module.exports = {
  loadPharmacyInventoryItem,
  adjustPharmacyStock,
  setPharmacyReorderLevel,
  receivePharmacyStock,
  safePharmacyReturnUrl,
};
