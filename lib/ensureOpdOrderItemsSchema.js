'use strict';

async function ensureOpdOrderItemsSchema(db) {
  if (db && db.driver === 'postgres') return;
  await db.query(`
  CREATE TABLE IF NOT EXISTS tbl_opd_order_item (
   id INT AUTO_INCREMENT PRIMARY KEY,
   facility_id INT DEFAULT 1,
   patient_id INT NOT NULL,
   opd_visit_id INT NULL,
   consultation_id INT NULL,
   item_type VARCHAR(20) NOT NULL,
   catalog_id INT NULL,
   item_name VARCHAR(255) DEFAULT NULL,
   unit_price DECIMAL(12,2) DEFAULT 0,
   quantity DECIMAL(10,2) DEFAULT 1,
   status VARCHAR(20) DEFAULT 'pending',
   service_code VARCHAR(40) NULL,
   ticket_id INT NULL,
   paid_at DATETIME NULL,
   served_at DATETIME NULL,
   served_by INT NULL,
   served_notes TEXT NULL,
   created_by INT NULL,
   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
   KEY idx_status_patient (status, patient_id),
   KEY idx_consult (consultation_id),
   KEY idx_visit (opd_visit_id),
   KEY idx_service_code (service_code)
  )
 `).catch(() => {});

  const addCol = async (table, colDef) => {
    try {
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
    } catch (e) {
      const msg = String(e.message || '');
      const ignore =
        e.code === 'ER_DUP_FIELDNAME' ||
        e.errno === 1060 ||
        /Duplicate column/i.test(msg) ||
        /already exists/i.test(msg);
      if (!ignore) console.warn(`ensureOpdOrderItemsSchema(${table}):`, msg);
    }
  };
  await addCol('tbl_lab_result', 'opd_order_item_id INT NULL');
  await addCol('tbl_radiology_result', 'opd_order_item_id INT NULL');
  await addCol('tbl_opd_order_item', 'service_code VARCHAR(40) NULL');
  await addCol('tbl_opd_order_item', 'served_at DATETIME NULL');
  await addCol('tbl_opd_order_item', 'served_by INT NULL');
  await addCol('tbl_opd_order_item', 'served_notes TEXT NULL');
  await addCol('tbl_opd_order_item', 'inventory_item_id INT NULL');
  await addCol('tbl_opd_order_item', 'stock_deducted_at DATETIME NULL');
  await addCol('tbl_opd_order_item', 'pharmacist_available TINYINT(1) NOT NULL DEFAULT 0');
  await addCol('tbl_opd_order_item', 'off_catalog_dispense TINYINT(1) NOT NULL DEFAULT 0');
  await addCol('tbl_opd_order_item', 'stock_dispense_note VARCHAR(255) NULL');
  await addCol('tbl_lab_result', 'source VARCHAR(20) DEFAULT NULL');
  await addCol('tbl_radiology_result', 'source VARCHAR(20) DEFAULT NULL');
  await addCol('tbl_lab_result', 'external_doc_id INT NULL');
  await addCol('tbl_radiology_result', 'external_doc_id INT NULL');
  await addCol('tbl_lab_result', 'structured_result LONGTEXT NULL');
  await addCol('tbl_lab_result', 'template_test_id VARCHAR(80) NULL');
  await addCol('tbl_radiology_result', 'structured_result LONGTEXT NULL');
  await addCol('tbl_radiology_result', 'template_test_id VARCHAR(80) NULL');
}

module.exports = { ensureOpdOrderItemsSchema };
