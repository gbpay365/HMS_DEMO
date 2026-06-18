'use strict';

const recordInventoryMovement = require('./recordInventoryMovement');

/**
 * Deduct pharmacy stock when an OPD order line is dispensed.
 * @returns {Promise<{ok:boolean, error?:string, inventoryItemId?:number, qtyDeducted?:number}>}
 */
async function deductStockForOpdOrderItem(pool, oiId, userId, opts = {}) {
  const force = !!opts.force;
  const allowNegative = !!opts.allowNegative;
  const stockNote = opts.stockNote ? String(opts.stockNote).trim().slice(0, 255) : null;
  const oid = parseInt(oiId, 10) || 0;
  if (oid < 1) return { ok: false, error: 'Invalid order line.' };

  const [[oi]] = await pool
    .query(
      `SELECT id, item_type, item_name, quantity, inventory_item_id, catalog_id, stock_deducted_at, served_at,
              pharmacist_available, off_catalog_dispense
         FROM tbl_opd_order_item WHERE id = ? LIMIT 1`,
      [oid]
    )
    .catch(() => [[null]]);

  if (!oi || String(oi.item_type) !== 'pharmacy') {
    return { ok: false, error: 'Not a pharmacy order line.' };
  }
  if (oi.stock_deducted_at) {
    return { ok: true, inventoryItemId: oi.inventory_item_id, qtyDeducted: 0, alreadyDone: true };
  }

  let inventoryItemId = parseInt(oi.inventory_item_id, 10) || 0;
  if (inventoryItemId < 1 && oi.catalog_id) {
    const [[inv]] = await pool
      .query(
        'SELECT id FROM tbl_inventory_item WHERE service_catalog_id = ? ORDER BY id ASC LIMIT 1',
        [parseInt(oi.catalog_id, 10) || 0]
      )
      .catch(() => [[null]]);
    if (inv && inv.id) {
      inventoryItemId = parseInt(inv.id, 10) || 0;
      await pool
        .query('UPDATE tbl_opd_order_item SET inventory_item_id = ? WHERE id = ?', [inventoryItemId, oid])
        .catch(() => {});
    }
  }
  if (inventoryItemId < 1) {
    const [[invByName]] = await pool
      .query(
        'SELECT id FROM tbl_inventory_item WHERE LOWER(name) LIKE LOWER(?) ORDER BY id ASC LIMIT 1',
        ['%' + String(oi.item_name || '').trim() + '%']
      )
      .catch(() => [[null]]);
    if (invByName && invByName.id) {
      inventoryItemId = parseInt(invByName.id, 10) || 0;
      await pool
        .query('UPDATE tbl_opd_order_item SET inventory_item_id = ? WHERE id = ?', [inventoryItemId, oid])
        .catch(() => {});
    }
  }

  if (inventoryItemId < 1) {
    return { ok: true, inventoryItemId: null, qtyDeducted: 0, noSku: true };
  }

  const qty = Math.max(1, Math.round(parseFloat(oi.quantity) || 1));
  const [[sku]] = await pool
    .query('SELECT id, name, quantity FROM tbl_inventory_item WHERE id = ? LIMIT 1', [inventoryItemId])
    .catch(() => [[null]]);
  if (!sku) return { ok: false, error: 'Inventory SKU not found.' };

  const before = parseInt(sku.quantity, 10) || 0;
  const offCatalog =
    allowNegative ||
    Number(oi.pharmacist_available) === 1 ||
    Number(oi.off_catalog_dispense) === 1;
  const mayForce = force || offCatalog;

  if (before < qty && !mayForce) {
    return {
      ok: false,
      error: `Insufficient stock for ${sku.name || oi.item_name}: need ${qty}, on hand ${before}.`,
      inventoryItemId,
      qtyNeeded: qty,
      qtyOnHand: before,
    };
  }

  const after = offCatalog ? before - qty : Math.max(0, before - qty);
  const movementNote =
    stockNote ||
    (offCatalog
      ? require('./opdPharmacyFulfillment').OFF_CATALOG_STOCK_NOTE
      : `OPD dispense · line #${oid}`);

  await pool.query('UPDATE tbl_inventory_item SET quantity = ? WHERE id = ?', [after, inventoryItemId]);
  await recordInventoryMovement(pool, {
    inventory_item_id: inventoryItemId,
    change_qty: -qty,
    qty_before: before,
    qty_after: after,
    reason: offCatalog ? 'dispense_off_catalog' : 'dispense',
    note: movementNote,
    user_id: userId,
  });
  await pool
    .query(
      `UPDATE tbl_opd_order_item SET stock_deducted_at = NOW(), inventory_item_id = ?,
       off_catalog_dispense = ?, stock_dispense_note = COALESCE(?, stock_dispense_note)
       WHERE id = ?`,
      [inventoryItemId, offCatalog ? 1 : 0, offCatalog ? movementNote : null, oid]
    )
    .catch(() => {});

  return { ok: true, inventoryItemId, qtyDeducted: qty, qtyAfter: after, offCatalog };
}

/**
 * Load stock snapshot for pharmacy validate UI.
 */
async function stockHintForOrderItem(pool, oiRow) {
  if (!oiRow) return null;
  let invId = parseInt(oiRow.inventory_item_id, 10) || 0;
  if (invId < 1 && oiRow.catalog_id) {
    const [[inv]] = await pool
      .query('SELECT id, quantity, name FROM tbl_inventory_item WHERE service_catalog_id = ? LIMIT 1', [
        parseInt(oiRow.catalog_id, 10) || 0,
      ])
      .catch(() => [[null]]);
    if (inv) return { id: inv.id, name: inv.name, onHand: parseInt(inv.quantity, 10) || 0 };
  }
  if (invId > 0) {
    const [[inv]] = await pool
      .query('SELECT id, quantity, name FROM tbl_inventory_item WHERE id = ? LIMIT 1', [invId])
      .catch(() => [[null]]);
    if (inv) return { id: inv.id, name: inv.name, onHand: parseInt(inv.quantity, 10) || 0 };
  }
  return null;
}

module.exports = {
  deductStockForOpdOrderItem,
  stockHintForOrderItem,
};
