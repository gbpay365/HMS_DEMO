'use strict';

/** Best-effort match of RFQ text to an inventory SKU. */
async function suggestInventoryId(pool, description, existingId) {
  const existing = parseInt(existingId, 10) || 0;
  if (existing > 0) return existing;
  const desc = String(description || '').trim();
  if (!desc || !pool?.query) return null;
  const [[hit]] = await pool
    .query(
      `SELECT id FROM tbl_inventory_item
        WHERE LOWER(name) = LOWER(?)
           OR LOWER(name) LIKE LOWER(?)
           OR LOWER(sku) LIKE LOWER(?)
        ORDER BY CASE WHEN LOWER(name) = LOWER(?) THEN 0 ELSE CHAR_LENGTH(name) END ASC
        LIMIT 1`,
      [desc, desc + '%', '%' + desc + '%', desc]
    )
    .catch(() => [[null]]);
  return hit && hit.id ? parseInt(hit.id, 10) || null : null;
}

async function loadInventoryPickList(pool, limit = 400) {
  const lim = Math.max(1, Math.min(500, parseInt(limit, 10) || 400));
  const [rows] = await pool
    .query('SELECT id, sku, name, quantity FROM tbl_inventory_item ORDER BY name ASC LIMIT ' + lim)
    .catch(() => [[]]);
  return rows || [];
}

module.exports = {
  suggestInventoryId,
  loadInventoryPickList,
};
