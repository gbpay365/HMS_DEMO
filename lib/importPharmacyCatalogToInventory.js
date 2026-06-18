'use strict';

const ensureFacilityRow = require('./ensureFacilityRow');

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Stable SKU linked to service catalog (matches HMS-0001-* facility prefix). */
function skuForCatalog(facilityId, catalogId) {
  const fac = String(Math.max(1, parseInt(facilityId, 10) || 1)).padStart(4, '0');
  const cid = String(Math.max(1, parseInt(catalogId, 10) || 0)).padStart(8, '0');
  return `HMS-${fac}-C${cid}`;
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

async function ensureInventoryCategoryName(pool, name, facilityId) {
  const n = String(name || 'Pharmacy').trim().slice(0, 120);
  if (!n) return { id: null, name: null };
  const fid = await ensureFacilityRow(pool, facilityId || 1);
  const hasFacilityCol = await tableHasColumn(pool, 'tbl_inventory_category', 'facility_id');

  let selectSql =
    'SELECT id, name FROM tbl_inventory_category WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))';
  const selectParams = [n];
  if (hasFacilityCol) {
    selectSql += ' AND facility_id = ?';
    selectParams.push(fid);
  }
  selectSql += ' LIMIT 1';

  const [[existing]] = await pool.query(selectSql, selectParams);
  if (existing && existing.id) return { id: existing.id, name: existing.name };

  if (hasFacilityCol) {
    try {
      const [ins] = await pool.query(
        'INSERT INTO tbl_inventory_category (facility_id, name) VALUES (?, ?)',
        [fid, n]
      );
      return { id: ins.insertId, name: n };
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
        const [[dup]] = await pool.query(selectSql, selectParams);
        if (dup && dup.id) return { id: dup.id, name: dup.name };
      }
      throw e;
    }
  }

  const [ins] = await pool.query('INSERT INTO tbl_inventory_category (name) VALUES (?)', [n]);
  return { id: ins.insertId, name: n };
}

/**
 * Import active pharmacy rows from tbl_service_catalog into tbl_inventory_item.
 * New lines start with quantity 0 and reorder_level 0; existing stock levels are preserved.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ facilityId?: number }} [opts]
 */
async function importPharmacyCatalogToInventory(pool, opts = {}) {
  const facilityId = await ensureFacilityRow(pool, opts.facilityId || 1);
  const hasFacilityCol = await tableHasColumn(pool, 'tbl_inventory_item', 'facility_id');
  const hasServiceCol = await tableHasColumn(pool, 'tbl_inventory_item', 'service_catalog_id');

  let catalogSql = `
    SELECT id, name, price, COALESCE(subcategory, '') AS subcategory,
           COALESCE(department_name, '') AS department_name
    FROM tbl_service_catalog
    WHERE LOWER(TRIM(category)) = 'pharmacy' AND status = 1
  `;
  const catalogParams = [];
  const catalogHasFacility = await tableHasColumn(pool, 'tbl_service_catalog', 'facility_id');
  if (catalogHasFacility) {
    catalogSql += ' AND (facility_id = ? OR facility_id IS NULL OR facility_id = 0)';
    catalogParams.push(facilityId);
  }
  catalogSql += ' ORDER BY sort_order, name';

  const [catalogRows] = await pool.query(catalogSql, catalogParams);
  const items = Array.isArray(catalogRows) ? catalogRows : [];

  let existingSql = 'SELECT id, sku, name, quantity, reorder_level, service_catalog_id FROM tbl_inventory_item';
  const existingParams = [];
  if (hasFacilityCol) {
    existingSql += ' WHERE facility_id = ?';
    existingParams.push(facilityId);
  }
  const [existingRows] = await pool.query(existingSql, existingParams);

  const byCatalogId = new Map();
  const byNormName = new Map();
  for (const row of existingRows || []) {
    const cid = parseInt(row.service_catalog_id, 10) || 0;
    if (cid > 0) byCatalogId.set(cid, row);
    const key = normName(row.name);
    if (key && !byNormName.has(key)) byNormName.set(key, row);
  }

  const categoryCache = new Map();
  let inserted = 0;
  let updated = 0;
  let linked = 0;
  let skipped = 0;

  for (const cat of items) {
    const catalogId = parseInt(cat.id, 10) || 0;
    if (catalogId < 1) continue;

    const name = String(cat.name || '').trim().slice(0, 255);
    if (!name) continue;

    const subcategory = String(cat.subcategory || 'Pharmacy').trim().slice(0, 120) || 'Pharmacy';
    let catMeta = categoryCache.get(subcategory);
    if (!catMeta) {
      catMeta = await ensureInventoryCategoryName(pool, subcategory, facilityId);
      categoryCache.set(subcategory, catMeta);
    }

    const unitPrice = Math.max(0, parseFloat(cat.price) || 0);
    const sku = skuForCatalog(facilityId, catalogId);

    let existing = byCatalogId.get(catalogId);
    if (!existing) {
      const byName = byNormName.get(normName(name));
      if (byName && !(parseInt(byName.service_catalog_id, 10) > 0)) {
        existing = byName;
      }
    }

    if (existing && existing.id) {
      const sets = ['name = ?', 'category = ?', 'category_id = ?'];
      const params = [name, subcategory, catMeta.id || null];
      if (hasServiceCol) {
        sets.push('service_catalog_id = ?');
        params.push(catalogId);
      }
      if (!existing.sku || String(existing.sku).trim() === '') {
        sets.push('sku = ?');
        params.push(sku);
      }
      params.push(existing.id);
      await pool.query(
        `UPDATE tbl_inventory_item SET ${sets.join(', ')} WHERE id = ? LIMIT 1`,
        params
      );
      if (!(parseInt(existing.service_catalog_id, 10) > 0) && hasServiceCol) linked++;
      else updated++;
      byCatalogId.set(catalogId, { ...existing, service_catalog_id: catalogId, name });
      continue;
    }

    const cols = ['sku', 'name', 'quantity', 'reorder_level', 'category_id', 'category', 'unit_price'];
    const vals = [sku, name, 0, 0, catMeta.id || null, subcategory, unitPrice];
    if (hasFacilityCol) {
      cols.unshift('facility_id');
      vals.unshift(facilityId);
    }
    if (hasServiceCol) {
      cols.push('service_catalog_id');
      vals.push(catalogId);
    }

    try {
      const [ins] = await pool.query(
        `INSERT INTO tbl_inventory_item (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        vals
      );
      const newRow = {
        id: ins.insertId,
        sku,
        name,
        quantity: 0,
        reorder_level: 0,
        service_catalog_id: catalogId,
      };
      byCatalogId.set(catalogId, newRow);
      byNormName.set(normName(name), newRow);
      inserted++;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
        skipped++;
        continue;
      }
      const badCol = e.code === 'ER_BAD_FIELD_ERROR' || e.errno === 1054;
      if (!badCol) throw e;
      await pool.query(
        `INSERT INTO tbl_inventory_item (sku, name, quantity, reorder_level)
         VALUES (?, ?, 0, 0)`,
        [sku, name]
      );
      inserted++;
    }
  }

  return {
    catalogTotal: items.length,
    inserted,
    updated,
    linked,
    skipped,
  };
}

/**
 * Sync inventory with pharmacy catalog and drop orphan pharmacy SKUs.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ facilityId?: number }} [opts]
 */
async function syncPharmacyCatalogInventory(pool, opts = {}) {
  const result = await importPharmacyCatalogToInventory(pool, opts);
  const { pruneOrphanPharmacyInventory } = require('./pharmacyProductScope');
  const pruned = await pruneOrphanPharmacyInventory(pool);
  return { ...result, pruned };
}

module.exports = {
  skuForCatalog,
  importPharmacyCatalogToInventory,
  syncPharmacyCatalogInventory,
};
