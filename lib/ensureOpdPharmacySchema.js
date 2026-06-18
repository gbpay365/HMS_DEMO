'use strict';

/** OPD order line columns for pharmacy ↔ inventory linkage. */
module.exports = async function ensureOpdPharmacySchema(pool) {
  if (!pool || !pool.query) return;
  const addCol = async (sql) => {
    try {
      await pool.query(sql);
    } catch (e) {
      const msg = String(e.message || '');
      if (e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060 || /Duplicate column/i.test(msg)) return;
      throw e;
    }
  };
  await addCol('ALTER TABLE tbl_opd_order_item ADD COLUMN inventory_item_id INT NULL');
  await addCol('ALTER TABLE tbl_opd_order_item ADD COLUMN stock_deducted_at DATETIME NULL');
  await addCol(
    'ALTER TABLE tbl_opd_order_item ADD COLUMN pharmacist_available TINYINT(1) NOT NULL DEFAULT 0 COMMENT \'Pharmacist confirmed: available off-catalog, not yet stocked\''
  );
  await addCol(
    'ALTER TABLE tbl_opd_order_item ADD COLUMN off_catalog_dispense TINYINT(1) NOT NULL DEFAULT 0 COMMENT \'Dispensed via off-catalog path (allows negative stock)\''
  );
  await addCol(
    'ALTER TABLE tbl_opd_order_item ADD COLUMN stock_dispense_note VARCHAR(255) NULL'
  );
  await pool
    .query('ALTER TABLE tbl_opd_order_item ADD KEY idx_oi_inventory (inventory_item_id)')
    .catch(() => {});
};
