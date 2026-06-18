'use strict';

/**
 * Opening stock & reorder levels — PHARMACY MEDICATION & MATERIALS (139 lines).
 * Matched to catalog/inventory by serial number (sort_order / PH### cpt_code).
 */
const PHARMACY_INVENTORY_STOCK_2026 = [
  { sn: 1, stock: 125, reorder: 100 },
  { sn: 2, stock: 500, reorder: 250 },
  { sn: 3, stock: 100, reorder: 50 },
  { sn: 4, stock: 50, reorder: 25 },
  { sn: 5, stock: 100, reorder: 50 },
  { sn: 6, stock: 100, reorder: 50 },
  { sn: 7, stock: 50, reorder: 25 },
  { sn: 8, stock: 100, reorder: 50 },
  { sn: 9, stock: 150, reorder: 100 },
  { sn: 10, stock: 100, reorder: 50 },
  { sn: 11, stock: 150, reorder: 100 },
  { sn: 12, stock: 100, reorder: 50 },
  { sn: 13, stock: 150, reorder: 50 },
  { sn: 14, stock: 100, reorder: 50 },
  { sn: 15, stock: 20, reorder: 10 },
  { sn: 16, stock: 50, reorder: 25 },
  { sn: 17, stock: 100, reorder: 50 },
  { sn: 18, stock: 50, reorder: 25 },
  { sn: 19, stock: 100, reorder: 50 },
  { sn: 20, stock: 100, reorder: 50 },
  { sn: 21, stock: 100, reorder: 50 },
  { sn: 22, stock: 50, reorder: 25 },
  { sn: 23, stock: 20, reorder: 10 },
  { sn: 24, stock: 200, reorder: 100 },
  { sn: 25, stock: 100, reorder: 50 },
  { sn: 26, stock: 50, reorder: 25 },
  { sn: 27, stock: 100, reorder: 50 },
  { sn: 28, stock: 100, reorder: 50 },
  { sn: 29, stock: 50, reorder: 25 },
  { sn: 30, stock: 50, reorder: 25 },
  { sn: 31, stock: 100, reorder: 50 },
  { sn: 32, stock: 100, reorder: 50 },
  { sn: 33, stock: 100, reorder: 50 },
  { sn: 34, stock: 20, reorder: 10 },
  { sn: 35, stock: 100, reorder: 50 },
  { sn: 36, stock: 100, reorder: 50 },
  { sn: 37, stock: 200, reorder: 100 },
  { sn: 38, stock: 100, reorder: 50 },
  { sn: 39, stock: 100, reorder: 50 },
  { sn: 40, stock: 100, reorder: 50 },
  { sn: 41, stock: 100, reorder: 50 },
  { sn: 42, stock: 50, reorder: 25 },
  { sn: 43, stock: 50, reorder: 25 },
  { sn: 44, stock: 50, reorder: 25 },
  { sn: 45, stock: 50, reorder: 25 },
  { sn: 46, stock: 25, reorder: 10 },
  { sn: 47, stock: 50, reorder: 25 },
  { sn: 48, stock: 50, reorder: 25 },
  { sn: 49, stock: 200, reorder: 100 },
  { sn: 50, stock: 200, reorder: 100 },
  { sn: 51, stock: 100, reorder: 50 },
  { sn: 52, stock: 200, reorder: 100 },
  { sn: 53, stock: 100, reorder: 50 },
  { sn: 54, stock: 100, reorder: 50 },
  { sn: 55, stock: 100, reorder: 50 },
  { sn: 56, stock: 100, reorder: 50 },
  { sn: 57, stock: 100, reorder: 50 },
  { sn: 58, stock: 100, reorder: 50 },
  { sn: 59, stock: 100, reorder: 50 },
  { sn: 60, stock: 50, reorder: 25 },
  { sn: 61, stock: 100, reorder: 50 },
  { sn: 62, stock: 100, reorder: 50 },
  { sn: 63, stock: 100, reorder: 50 },
  { sn: 64, stock: 100, reorder: 50 },
  { sn: 65, stock: 100, reorder: 50 },
  { sn: 66, stock: 100, reorder: 50 },
  { sn: 67, stock: 500, reorder: 250 },
  { sn: 68, stock: 100, reorder: 50 },
  { sn: 69, stock: 50, reorder: 25 },
  { sn: 70, stock: 50, reorder: 25 },
  { sn: 71, stock: 50, reorder: 25 },
  { sn: 72, stock: 100, reorder: 50 },
  { sn: 73, stock: 100, reorder: 50 },
  { sn: 74, stock: 50, reorder: 25 },
  { sn: 75, stock: 50, reorder: 25 },
  { sn: 76, stock: 50, reorder: 25 },
  { sn: 77, stock: 100, reorder: 50 },
  { sn: 78, stock: 100, reorder: 50 },
  { sn: 79, stock: 10, reorder: 5 },
  { sn: 80, stock: 100, reorder: 50 },
  { sn: 81, stock: 200, reorder: 100 },
  { sn: 82, stock: 200, reorder: 100 },
  { sn: 83, stock: 100, reorder: 50 },
  { sn: 84, stock: 50, reorder: 25 },
  { sn: 85, stock: 50, reorder: 25 },
  { sn: 86, stock: 100, reorder: 50 },
  { sn: 87, stock: 20, reorder: 10 },
  { sn: 88, stock: 20, reorder: 10 },
  { sn: 89, stock: 20, reorder: 10 },
  { sn: 90, stock: 50, reorder: 25 },
  { sn: 91, stock: 50, reorder: 25 },
  { sn: 92, stock: 100, reorder: 50 },
  { sn: 93, stock: 50, reorder: 25 },
  { sn: 94, stock: 20, reorder: 10 },
  { sn: 95, stock: 20, reorder: 10 },
  { sn: 96, stock: 20, reorder: 10 },
  { sn: 97, stock: 20, reorder: 10 },
  { sn: 98, stock: 20, reorder: 10 },
  { sn: 99, stock: 100, reorder: 50 },
  { sn: 100, stock: 100, reorder: 50 },
  { sn: 101, stock: 100, reorder: 50 },
  { sn: 102, stock: 50, reorder: 25 },
  { sn: 103, stock: 20, reorder: 10 },
  { sn: 104, stock: 50, reorder: 25 },
  { sn: 105, stock: 100, reorder: 50 },
  { sn: 106, stock: 20, reorder: 10 },
  { sn: 107, stock: 200, reorder: 100 },
  { sn: 108, stock: 200, reorder: 100 },
  { sn: 109, stock: 100, reorder: 50 },
  { sn: 110, stock: 100, reorder: 50 },
  { sn: 111, stock: 100, reorder: 50 },
  { sn: 112, stock: 100, reorder: 50 },
  { sn: 113, stock: 100, reorder: 50 },
  { sn: 114, stock: 200, reorder: 100 },
  { sn: 115, stock: 500, reorder: 250 },
  { sn: 116, stock: 500, reorder: 250 },
  { sn: 117, stock: 200, reorder: 100 },
  { sn: 118, stock: 100, reorder: 50 },
  { sn: 119, stock: 50, reorder: 25 },
  { sn: 120, stock: 500, reorder: 250 },
  { sn: 121, stock: 50, reorder: 25 },
  { sn: 122, stock: 20, reorder: 10 },
  { sn: 123, stock: 20, reorder: 10 },
  { sn: 124, stock: 20, reorder: 10 },
  { sn: 125, stock: 20, reorder: 10 },
  { sn: 126, stock: 100, reorder: 50 },
  { sn: 127, stock: 100, reorder: 50 },
  { sn: 128, stock: 200, reorder: 100 },
  { sn: 129, stock: 50, reorder: 25 },
  { sn: 130, stock: 20, reorder: 10 },
  { sn: 131, stock: 100, reorder: 50 },
  { sn: 132, stock: 50, reorder: 25 },
  { sn: 133, stock: 500, reorder: 250 },
  { sn: 134, stock: 20, reorder: 10 },
  { sn: 135, stock: 20, reorder: 10 },
  { sn: 136, stock: 20, reorder: 10 },
  { sn: 137, stock: 20, reorder: 10 },
  { sn: 138, stock: 100, reorder: 50 },
  { sn: 139, stock: 20, reorder: 10 },
];

function cptForSn(sn) {
  return `PH${String(parseInt(sn, 10) || 0).padStart(3, '0')}`;
}

/**
 * Apply stock sheet quantities to pharmacy inventory lines (by catalog SN / PH### code).
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ facilityId?: number, userId?: number|null, recordMovements?: boolean }} [opts]
 */
async function applyPharmacyInventoryStockLevels(pool, opts = {}) {
  const ensureFacilityRow = require('./ensureFacilityRow');
  const recordInventoryMovement = require('./recordInventoryMovement');
  const facilityId = await ensureFacilityRow(pool, opts.facilityId || 1);
  const userId = opts.userId != null ? parseInt(String(opts.userId), 10) || null : null;
  const recordMovements = opts.recordMovements !== false;

  const hasSort = await pool
    .query(
      `SELECT 1 AS ok FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_service_catalog' AND COLUMN_NAME = 'sort_order' LIMIT 1`
    )
    .then(([r]) => !!(r[0] && r[0].ok))
    .catch(() => false);

  const hasCpt = await pool
    .query(
      `SELECT 1 AS ok FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_service_catalog' AND COLUMN_NAME = 'cpt_code' LIMIT 1`
    )
    .then(([r]) => !!(r[0] && r[0].ok))
    .catch(() => false);

  const hasFacCat = await pool
    .query(
      `SELECT 1 AS ok FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_service_catalog' AND COLUMN_NAME = 'facility_id' LIMIT 1`
    )
    .then(([r]) => !!(r[0] && r[0].ok))
    .catch(() => false);

  const hasFacInv = await pool
    .query(
      `SELECT 1 AS ok FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_inventory_item' AND COLUMN_NAME = 'facility_id' LIMIT 1`
    )
    .then(([r]) => !!(r[0] && r[0].ok))
    .catch(() => false);

  let catalogSql = `SELECT id, name${hasSort ? ', sort_order' : ''}${hasCpt ? ', cpt_code' : ''}
    FROM tbl_service_catalog WHERE LOWER(TRIM(category)) = 'pharmacy' AND status = 1`;
  const catalogParams = [];
  if (hasFacCat) {
    catalogSql += ' AND (facility_id = ? OR facility_id IS NULL OR facility_id = 0)';
    catalogParams.push(facilityId);
  }
  const [catalogRows] = await pool.query(catalogSql, catalogParams);

  const catalogBySn = new Map();
  const catalogByCpt = new Map();
  for (const row of catalogRows || []) {
    const sn = hasSort ? parseInt(row.sort_order, 10) || 0 : 0;
    if (sn > 0) catalogBySn.set(sn, row.id);
    if (hasCpt && row.cpt_code) catalogByCpt.set(String(row.cpt_code).toUpperCase(), row.id);
  }

  let invSql =
    'SELECT id, service_catalog_id, quantity, reorder_level FROM tbl_inventory_item WHERE service_catalog_id IS NOT NULL';
  const invParams = [];
  if (hasFacInv) {
    invSql += ' AND facility_id = ?';
    invParams.push(facilityId);
  }
  const [invRows] = await pool.query(invSql, invParams);
  const invByCatalog = new Map();
  for (const row of invRows || []) {
    const cid = parseInt(row.service_catalog_id, 10) || 0;
    if (cid > 0) invByCatalog.set(cid, row);
  }

  let updated = 0;
  let unchanged = 0;
  const missingCatalog = [];
  const missingInventory = [];

  for (const line of PHARMACY_INVENTORY_STOCK_2026) {
    const sn = parseInt(line.sn, 10) || 0;
    if (sn < 1) continue;
    const stock = Math.max(0, parseInt(line.stock, 10) || 0);
    const reorder = Math.max(0, parseInt(line.reorder, 10) || 0);

    let catalogId = catalogBySn.get(sn);
    if (!catalogId && hasCpt) catalogId = catalogByCpt.get(cptForSn(sn));
    if (!catalogId) {
      missingCatalog.push(sn);
      continue;
    }

    const inv = invByCatalog.get(catalogId);
    if (!inv || !inv.id) {
      missingInventory.push(sn);
      continue;
    }

    const qtyBefore = parseInt(inv.quantity, 10) || 0;
    const reorderBefore = parseInt(inv.reorder_level, 10) || 0;
    if (qtyBefore === stock && reorderBefore === reorder) {
      unchanged++;
      continue;
    }

    await pool.query(
      'UPDATE tbl_inventory_item SET quantity = ?, reorder_level = ? WHERE id = ? LIMIT 1',
      [stock, reorder, inv.id]
    );

    if (recordMovements && qtyBefore !== stock) {
      await recordInventoryMovement(pool, {
        inventory_item_id: inv.id,
        change_qty: stock - qtyBefore,
        qty_before: qtyBefore,
        qty_after: stock,
        reason: 'stock_sheet',
        note: `Pharmacy stock sheet SN ${sn}`,
        user_id: userId,
      });
    }

    inv.quantity = stock;
    inv.reorder_level = reorder;
    updated++;
  }

  return {
    total: PHARMACY_INVENTORY_STOCK_2026.length,
    updated,
    unchanged,
    missingCatalog,
    missingInventory,
  };
}

module.exports = {
  PHARMACY_INVENTORY_STOCK_2026,
  cptForSn,
  applyPharmacyInventoryStockLevels,
};
