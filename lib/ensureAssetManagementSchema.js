'use strict';

const ensureFacilityRow = require('./ensureFacilityRow');

const DEFAULT_CATEGORIES = [
  ['Medical equipment', 10],
  ['Furniture & fixtures', 20],
  ['IT & office', 30],
  ['Vehicles', 40],
  ['Buildings & infrastructure', 50],
];

async function addCol(pool, sql) {
  try {
    await pool.query(sql);
  } catch (e) {
    const msg = String(e.message || '');
    if (e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060 || /Duplicate column/i.test(msg)) return;
    throw e;
  }
}

async function seedCategories(pool, fid) {
  for (const [name, sort] of DEFAULT_CATEGORIES) {
    await pool
      .query(
        `INSERT INTO tbl_asset_category (facility_id, name, sort_order, is_active)
         SELECT ?, ?, ?, 1 FROM DUAL
         WHERE NOT EXISTS (
           SELECT 1 FROM tbl_asset_category WHERE facility_id = ? AND name = ?
         )`,
        [fid, name, sort, fid, name]
      )
      .catch(() => {});
  }
}

module.exports = async function ensureAssetManagementSchema(pool) {
  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_asset_category (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL DEFAULT 1,
        name VARCHAR(120) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        KEY idx_asset_cat_fac (facility_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});

  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_asset (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL,
        asset_tag VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        category_id INT DEFAULT NULL,
        asset_type VARCHAR(32) NOT NULL DEFAULT 'equipment',
        status VARCHAR(24) NOT NULL DEFAULT 'active',
        location VARCHAR(120) DEFAULT NULL,
        department VARCHAR(120) DEFAULT NULL,
        serial_number VARCHAR(120) DEFAULT NULL,
        model VARCHAR(120) DEFAULT NULL,
        manufacturer VARCHAR(120) DEFAULT NULL,
        purchase_date DATE DEFAULT NULL,
        purchase_cost DECIMAL(14,2) DEFAULT NULL,
        warranty_expires DATE DEFAULT NULL,
        inventory_item_id INT DEFAULT NULL,
        assigned_to INT DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by INT DEFAULT NULL,
        updated_at DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        updated_by INT DEFAULT NULL,
        UNIQUE KEY uq_asset_tag (facility_id, asset_tag),
        KEY ix_asset_fac (facility_id),
        KEY ix_asset_status (status),
        KEY ix_asset_cat (category_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});

  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_asset_maintenance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT NOT NULL,
        facility_id INT NOT NULL,
        maintenance_type VARCHAR(24) NOT NULL DEFAULT 'preventive',
        status VARCHAR(24) NOT NULL DEFAULT 'scheduled',
        scheduled_date DATE DEFAULT NULL,
        completed_at DATETIME DEFAULT NULL,
        vendor_name VARCHAR(120) DEFAULT NULL,
        cost DECIMAL(14,2) DEFAULT NULL,
        description TEXT DEFAULT NULL,
        next_due_date DATE DEFAULT NULL,
        performed_by INT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by INT DEFAULT NULL,
        KEY ix_maint_asset (asset_id),
        KEY ix_maint_fac (facility_id),
        KEY ix_maint_due (next_due_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});

  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_asset_rental_unit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL,
        asset_id INT DEFAULT NULL,
        unit_code VARCHAR(32) NOT NULL,
        label VARCHAR(255) NOT NULL,
        location VARCHAR(120) DEFAULT NULL,
        monthly_rent DECIMAL(14,2) DEFAULT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'available',
        notes TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by INT DEFAULT NULL,
        UNIQUE KEY uq_rental_unit (facility_id, unit_code),
        KEY ix_rental_unit_fac (facility_id),
        KEY ix_rental_unit_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});

  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_asset_rental_contract (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL,
        rental_unit_id INT NOT NULL,
        tenant_name VARCHAR(255) NOT NULL,
        tenant_phone VARCHAR(64) DEFAULT NULL,
        tenant_email VARCHAR(120) DEFAULT NULL,
        start_date DATE NOT NULL,
        end_date DATE DEFAULT NULL,
        monthly_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        deposit_amount DECIMAL(14,2) DEFAULT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'active',
        notes TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by INT DEFAULT NULL,
        KEY ix_contract_fac (facility_id),
        KEY ix_contract_unit (rental_unit_id),
        KEY ix_contract_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});

  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_asset_rental_payment (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contract_id INT NOT NULL,
        facility_id INT NOT NULL,
        amount DECIMAL(14,2) NOT NULL,
        paid_at DATE NOT NULL,
        reference VARCHAR(120) DEFAULT NULL,
        notes VARCHAR(512) DEFAULT NULL,
        recorded_by INT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY ix_payment_contract (contract_id),
        KEY ix_payment_fac (facility_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});

  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_asset_audit (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT NOT NULL,
        facility_id INT NOT NULL,
        action VARCHAR(32) NOT NULL,
        from_status VARCHAR(32) DEFAULT NULL,
        to_status VARCHAR(32) DEFAULT NULL,
        note VARCHAR(2000) DEFAULT NULL,
        snapshot_json MEDIUMTEXT DEFAULT NULL,
        performed_by INT NOT NULL,
        performed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY ix_asset_audit_asset (asset_id),
        KEY ix_asset_audit_at (performed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});

  await addCol(pool, 'ALTER TABLE tbl_asset ADD COLUMN assigned_to INT DEFAULT NULL');
  await addCol(pool, 'ALTER TABLE tbl_asset ADD COLUMN warranty_expires DATE DEFAULT NULL');

  const fid = await ensureFacilityRow(pool, 1);
  await seedCategories(pool, fid);
};
