'use strict';

const { normName, normPharmacyNameKey } = require('./pharmacyCatalogFileImport');

/** SQL join: inventory row linked to an active pharmacy service-catalog entry. */
function pharmacyCatalogJoin(alias = 'i', catalogAlias = 'sc') {
  return `INNER JOIN tbl_service_catalog ${catalogAlias}
    ON ${catalogAlias}.id = ${alias}.service_catalog_id
   AND LOWER(TRIM(${catalogAlias}.category)) = 'pharmacy'
   AND ${catalogAlias}.status = 1`;
}

/**
 * Count pharmacy products (aligned with Service Catalog → Pharmacy tab).
 * @param {import('mysql2/promise').Pool} pool
 */
async function countPharmacyProducts(pool) {
  const [[row]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN i.quantity > 5 THEN 1 ELSE 0 END) AS ok,
       SUM(CASE WHEN i.quantity > 0 AND i.quantity <= 5 THEN 1 ELSE 0 END) AS low,
       SUM(CASE WHEN i.quantity = 0 THEN 1 ELSE 0 END) AS out_stock
     FROM tbl_inventory_item i
     ${pharmacyCatalogJoin('i', 'sc')}`
  );
  const [[catalogOnly]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = 'pharmacy' AND status = 1`
  );
  const stats = row || { total: 0, ok: 0, low: 0, out_stock: 0 };
  const catalogTotal = parseInt(catalogOnly && catalogOnly.total, 10) || 0;
  stats.total = catalogTotal;
  return stats;
}

/**
 * Remove inventory SKUs that no longer match the active pharmacy service catalog.
 * @param {import('mysql2/promise').Pool} pool
 */
async function pruneOrphanPharmacyInventory(pool) {
  const hasServiceCol = await tableHasColumn(pool, 'tbl_inventory_item', 'service_catalog_id');
  if (!hasServiceCol) return { removed: 0, linked: 0 };

  const [orphans] = await pool.query(
    `SELECT i.id, i.name, i.sku, i.service_catalog_id, i.quantity
     FROM tbl_inventory_item i
     LEFT JOIN tbl_service_catalog sc
       ON sc.id = i.service_catalog_id
      AND LOWER(TRIM(sc.category)) = 'pharmacy'
      AND sc.status = 1
     WHERE sc.id IS NULL
       AND (
         i.service_catalog_id IS NOT NULL
         OR i.sku REGEXP '^HMS-[0-9]+-C[0-9]+$'
       )`
  );

  const orphanMap = new Map();
  for (const row of orphans || []) {
    orphanMap.set(row.id, row);
  }

  const [activeCatalog] = await pool.query(
    `SELECT id, name FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = 'pharmacy' AND status = 1`
  );
  const byName = new Map();
  const byKey = new Map();
  for (const row of activeCatalog || []) {
    byName.set(normName(row.name), row);
    const key = normPharmacyNameKey(row.name);
    if (key && !byKey.has(key)) byKey.set(key, row);
  }

  let removed = 0;
  let linked = 0;

  for (const row of orphanMap.values()) {
    const key = normPharmacyNameKey(row.name) || normName(row.name);
    const match = byName.get(normName(row.name)) || (key ? byKey.get(key) : null);
    if (match) {
      const [[existingInv]] = await pool.query(
        'SELECT id FROM tbl_inventory_item WHERE service_catalog_id = ? LIMIT 1',
        [match.id]
      );
      if (existingInv && existingInv.id) {
        await pool.query('DELETE FROM tbl_inventory_item WHERE id = ? LIMIT 1', [row.id]);
        removed++;
        continue;
      }
      await pool.query(
        'UPDATE tbl_inventory_item SET service_catalog_id = ?, name = ? WHERE id = ? LIMIT 1',
        [match.id, match.name, row.id]
      );
      linked++;
      continue;
    }
    const isPharmacySku =
      row.service_catalog_id != null || /^HMS-[0-9]+-C[0-9]+$/i.test(String(row.sku || ''));
    if (!isPharmacySku) continue;
    await pool.query('DELETE FROM tbl_inventory_item WHERE id = ? LIMIT 1', [row.id]);
    removed++;
  }

  const [dupes] = await pool.query(
    `SELECT i.service_catalog_id AS catalog_id, GROUP_CONCAT(i.id ORDER BY i.id) AS ids
     FROM tbl_inventory_item i
     INNER JOIN tbl_service_catalog sc ON sc.id = i.service_catalog_id
     WHERE LOWER(TRIM(sc.category)) = 'pharmacy' AND sc.status = 1
     GROUP BY i.service_catalog_id
     HAVING COUNT(*) > 1`
  );
  for (const group of dupes || []) {
    const ids = String(group.ids || '')
      .split(',')
      .map((id) => parseInt(id, 10))
      .filter((id) => id > 0);
    ids.sort((a, b) => a - b);
    for (let i = 1; i < ids.length; i++) {
      await pool.query('DELETE FROM tbl_inventory_item WHERE id = ? LIMIT 1', [ids[i]]);
      removed++;
    }
  }

  return { removed, linked };
}

async function tableHasColumn(pool, table, column) {
  const [[row]] = await pool
    .query(
      `SELECT 1 AS ok FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [table, column]
    )
    .catch(() => [[null]]);
  return !!(row && row.ok);
}

module.exports = {
  pharmacyCatalogJoin,
  countPharmacyProducts,
  pruneOrphanPharmacyInventory,
};
