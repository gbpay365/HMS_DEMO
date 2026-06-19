'use strict';

/**
 * Pharmacy module tables: medicine types/categories, product expiry, manufacturing.
 */
module.exports = async function ensurePharmacySchema(pool) {
  if (pool && pool.driver === 'postgres') return;
  if (!pool || !pool.query) return;

  const ensureInventorySchema = require('./ensureInventorySchema');
  await ensureInventorySchema(pool).catch(() => {});

  await pool
    .query(
      `
    CREATE TABLE IF NOT EXISTS tbl_pharmacy_medicine_type (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(500) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_pha_med_type_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `
    )
    .catch(() => {});

  await pool
    .query(
      `
    CREATE TABLE IF NOT EXISTS tbl_pharmacy_medicine_category (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(500) NULL,
      requires_prescription TINYINT(1) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_pha_med_cat_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `
    )
    .catch(() => {});

  const addCol = async (sql) => {
    try {
      await pool.query(sql);
    } catch (e) {
      const msg = String(e.message || '');
      if (
        e.code === 'ER_DUP_FIELDNAME' ||
        e.errno === 1060 ||
        /Duplicate column/i.test(msg) ||
        /already exists/i.test(msg)
      ) {
        return;
      }
      throw e;
    }
  };

  await addCol('ALTER TABLE tbl_inventory_item ADD COLUMN medicine_type_id INT NULL');
  await addCol('ALTER TABLE tbl_inventory_item ADD COLUMN medicine_category_id INT NULL');
  await addCol('ALTER TABLE tbl_inventory_item ADD COLUMN expiry_date DATE NULL');
  await addCol('ALTER TABLE tbl_inventory_item ADD COLUMN manufacturing_company VARCHAR(255) NULL');
  await addCol(
    'ALTER TABLE tbl_inventory_item ADD COLUMN requires_prescription TINYINT(1) NOT NULL DEFAULT 0'
  );

  const seeds = [
    ['Tablet', 'Solid oral dose forms', 10],
    ['Capsule', 'Encapsulated medicines', 20],
    ['Syrup', 'Liquid oral preparations', 30],
    ['Injection', 'Parenteral products', 40],
    ['Cream / Ointment', 'Topical preparations', 50],
    ['Inhaler', 'Respiratory delivery', 60]
  ];
  for (const [name, desc, ord] of seeds) {
    await pool
      .query(
        'INSERT IGNORE INTO tbl_pharmacy_medicine_type (name, description, sort_order) VALUES (?,?,?)',
        [name, desc, ord]
      )
      .catch(() => {});
  }

  const catSeeds = [
    ['Analgesic', 'Pain relief', 0, 10],
    ['Antibiotic', 'Anti-infective agents', 1, 20],
    ['Antihypertensive', 'Blood pressure', 1, 30],
    ['Antidiabetic', 'Diabetes therapy', 1, 40],
    ['Vitamin / Supplement', 'Nutritional products', 0, 50],
    ['General', 'Uncategorized medicines', 0, 99]
  ];
  for (const [name, desc, rx, ord] of catSeeds) {
    await pool
      .query(
        'INSERT IGNORE INTO tbl_pharmacy_medicine_category (name, description, requires_prescription, sort_order) VALUES (?,?,?,?)',
        [name, desc, rx, ord]
      )
      .catch(() => {});
  }
};
