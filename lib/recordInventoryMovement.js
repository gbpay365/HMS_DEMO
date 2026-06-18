'use strict';

/**
 * Append one row to tbl_inventory_movement (best-effort; ignores failures if table missing).
 */
module.exports = async function recordInventoryMovement(pool, row) {
  if (!pool || !pool.query || !row || !row.inventory_item_id) return;
  try {
    await pool.query(
      `INSERT INTO tbl_inventory_movement (inventory_item_id, change_qty, qty_before, qty_after, reason, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(row.inventory_item_id, 10) || 0,
        parseInt(row.change_qty, 10) || 0,
        parseInt(row.qty_before, 10) || 0,
        parseInt(row.qty_after, 10) || 0,
        String(row.reason || 'adjust').slice(0, 40),
        row.note != null ? String(row.note).slice(0, 500) : null,
        row.user_id != null ? parseInt(String(row.user_id), 10) || null : null,
      ]
    );
  } catch (e) {
    console.warn('recordInventoryMovement:', e.message);
  }
};
