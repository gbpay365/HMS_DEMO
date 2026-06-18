'use strict';

/**
 * Match a prescribed drug name to service catalog + inventory SKU.
 * @returns {Promise<{catId:number|null, inventoryItemId:number|null, name:string, price:number}>}
 */
async function resolveMedToCatalog(pool, name) {
  const n = String(name || '').trim();
  if (!n) return { catId: null, inventoryItemId: null, name: '', price: 0 };

  const tryQuery = async (where, params) => {
    const [rows] = await pool
      .query(
        `SELECT id, name, price FROM tbl_service_catalog
          WHERE LOWER(TRIM(category))='pharmacy' AND status=1 AND ${where}
          ORDER BY CHAR_LENGTH(name) ASC LIMIT 1`,
        params
      )
      .catch(() => [[]]);
    return rows && rows[0];
  };

  let hit = await tryQuery('LOWER(name)=LOWER(?)', [n]);
  if (!hit) hit = await tryQuery('LOWER(name) LIKE LOWER(?)', [n + '%']);
  if (!hit) hit = await tryQuery('LOWER(name) LIKE LOWER(?)', ['%' + n + '%']);

  if (hit) {
    const catId = parseInt(hit.id, 10) || null;
    const [[inv]] = await pool
      .query(
        'SELECT id FROM tbl_inventory_item WHERE service_catalog_id = ? ORDER BY id ASC LIMIT 1',
        [catId]
      )
      .catch(() => [[null]]);
    return {
      catId,
      inventoryItemId: inv && inv.id ? parseInt(inv.id, 10) || null : null,
      name: hit.name,
      price: parseFloat(hit.price || 0) || 0,
    };
  }

  const [invRows] = await pool
    .query(
      `SELECT inv.id AS inv_id, inv.service_catalog_id AS scid, sc.name AS sc_name, sc.price AS sc_price
         FROM tbl_inventory_item inv
         LEFT JOIN tbl_service_catalog sc ON sc.id = inv.service_catalog_id AND sc.status=1
        WHERE LOWER(inv.name) LIKE LOWER(?)
        ORDER BY CHAR_LENGTH(inv.name) ASC LIMIT 1`,
      ['%' + n + '%']
    )
    .catch(() => [[]]);

  if (invRows && invRows[0] && invRows[0].sc_name) {
    return {
      catId: parseInt(invRows[0].scid, 10) || null,
      inventoryItemId: parseInt(invRows[0].inv_id, 10) || null,
      name: invRows[0].sc_name,
      price: parseFloat(invRows[0].sc_price || 0) || 0,
    };
  }
  if (invRows && invRows[0] && invRows[0].inv_id) {
    const [[inv]] = await pool
      .query('SELECT id, name, unit_price, service_catalog_id FROM tbl_inventory_item WHERE id=? LIMIT 1', [
        invRows[0].inv_id,
      ])
      .catch(() => [[null]]);
    if (inv) {
      return {
        catId: parseInt(inv.service_catalog_id, 10) || null,
        inventoryItemId: parseInt(inv.id, 10) || null,
        name: inv.name || n,
        price: parseFloat(inv.unit_price || 0) || 0,
      };
    }
  }

  return { catId: null, inventoryItemId: null, name: n, price: 0 };
}

module.exports = { resolveMedToCatalog };
