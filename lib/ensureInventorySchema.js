'use strict';

const ensureFacilityRow = require('./ensureFacilityRow');

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

/**
 * Inventory SKU tables used by Pharmacy hub, nursing supply requests, and /inventory.
 */
module.exports = async function ensureInventorySchema(pool) {
  if (pool && pool.driver === 'postgres') return;
  if (!pool || !pool.query) return;

  await pool
    .query(
      `
    CREATE TABLE IF NOT EXISTS tbl_inventory_category (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      KEY idx_invcat_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `
    )
    .catch(() => {});

  await pool
    .query(
      `
    CREATE TABLE IF NOT EXISTS tbl_inventory_item (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sku VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(120) NULL,
      category_id INT NULL,
      quantity INT NOT NULL DEFAULT 0,
      reorder_level INT NOT NULL DEFAULT 5,
      unit_price DECIMAL(12,2) NULL DEFAULT 0,
      service_catalog_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_inventory_item_sku (sku),
      KEY idx_inventory_item_cat (category_id),
      KEY idx_inventory_item_name (name(100))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `
    )
    .catch(() => {});

  const addCol = async (sql) => {
    try {
      await pool.query(sql);
    } catch (e) {
      const msg = String(e.message || '');
      const dup =
        e.code === 'ER_DUP_FIELDNAME' ||
        e.errno === 1060 ||
        /Duplicate column/i.test(msg) ||
        /already exists/i.test(msg);
      if (!dup) throw e;
    }
  };

  await addCol('ALTER TABLE tbl_inventory_category ADD COLUMN facility_id INT NOT NULL DEFAULT 1');
  await addCol('ALTER TABLE tbl_inventory_item ADD COLUMN facility_id INT NOT NULL DEFAULT 1');
  await addCol('ALTER TABLE tbl_inventory_item ADD COLUMN category VARCHAR(120) NULL');
  await addCol('ALTER TABLE tbl_inventory_item ADD COLUMN category_id INT NULL');
  await addCol('ALTER TABLE tbl_inventory_item ADD COLUMN unit_price DECIMAL(12,2) NULL DEFAULT 0');
  await addCol('ALTER TABLE tbl_inventory_item ADD COLUMN service_catalog_id INT NULL');

  const catHasFacility = await tableHasColumn(pool, 'tbl_inventory_category', 'facility_id');
  if (catHasFacility) {
    const fid = await ensureFacilityRow(pool, 1);
    await pool
      .query(`INSERT IGNORE INTO tbl_inventory_category (id, facility_id, name) VALUES (1, ?, 'General')`, [
        fid,
      ])
      .catch(() => {});
  } else {
    await pool.query(`INSERT IGNORE INTO tbl_inventory_category (id, name) VALUES (1, 'General')`).catch(() => {});
  }

  await pool
    .query(
      `
    CREATE TABLE IF NOT EXISTS tbl_inventory_movement (
      id INT AUTO_INCREMENT PRIMARY KEY,
      inventory_item_id INT NOT NULL,
      change_qty INT NOT NULL,
      qty_before INT NOT NULL DEFAULT 0,
      qty_after INT NOT NULL DEFAULT 0,
      reason VARCHAR(40) NOT NULL DEFAULT 'adjust',
      note VARCHAR(500) NULL,
      user_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_invmov_item (inventory_item_id),
      KEY idx_invmov_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `
    )
    .catch(() => {});
};
