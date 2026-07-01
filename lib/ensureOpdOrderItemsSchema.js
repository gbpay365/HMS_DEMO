'use strict';

async function ensureOpdOrderItemsSchema(db) {
  if (!db || !db.query) return;

  if (db.driver === 'postgres') {
    await db
      .query(`
        CREATE TABLE IF NOT EXISTS tbl_opd_order_item (
          id SERIAL PRIMARY KEY,
          facility_id INTEGER DEFAULT 1,
          patient_id INTEGER NOT NULL,
          opd_visit_id INTEGER NULL,
          consultation_id INTEGER NULL,
          item_type VARCHAR(20) NOT NULL,
          catalog_id INTEGER NULL,
          item_name VARCHAR(255) DEFAULT NULL,
          unit_price DECIMAL(12,2) DEFAULT 0,
          quantity DECIMAL(10,2) DEFAULT 1,
          status VARCHAR(20) DEFAULT 'pending',
          service_code VARCHAR(40) NULL,
          ticket_id INTEGER NULL,
          paid_at TIMESTAMP NULL,
          served_at TIMESTAMP NULL,
          served_by INTEGER NULL,
          served_notes TEXT NULL,
          created_by INTEGER NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          inventory_item_id INTEGER NULL,
          stock_deducted_at TIMESTAMP NULL,
          pharmacist_available SMALLINT NOT NULL DEFAULT 0,
          off_catalog_dispense SMALLINT NOT NULL DEFAULT 0,
          stock_dispense_note VARCHAR(255) NULL,
          source_module VARCHAR(32) NULL,
          source_pk INTEGER NULL
        )
      `)
      .catch(() => {});

    const pgCols = [
      'facility_id INTEGER DEFAULT 1',
      'patient_id INTEGER NOT NULL',
      'opd_visit_id INTEGER NULL',
      'consultation_id INTEGER NULL',
      'item_type VARCHAR(20) NOT NULL',
      'catalog_id INTEGER NULL',
      'item_name VARCHAR(255) DEFAULT NULL',
      'unit_price DECIMAL(12,2) DEFAULT 0',
      'quantity DECIMAL(10,2) DEFAULT 1',
      "status VARCHAR(20) DEFAULT 'pending'",
      'service_code VARCHAR(40) NULL',
      'ticket_id INTEGER NULL',
      'paid_at TIMESTAMP NULL',
      'served_at TIMESTAMP NULL',
      'served_by INTEGER NULL',
      'served_notes TEXT NULL',
      'created_by INTEGER NULL',
      'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      'inventory_item_id INTEGER NULL',
      'stock_deducted_at TIMESTAMP NULL',
      'pharmacist_available SMALLINT NOT NULL DEFAULT 0',
      'off_catalog_dispense SMALLINT NOT NULL DEFAULT 0',
      'stock_dispense_note VARCHAR(255) NULL',
      'source_module VARCHAR(32) NULL',
      'source_pk INTEGER NULL',
    ];
    for (const colDef of pgCols) {
      const colName = colDef.split(/\s+/)[0];
      await db
        .query(`ALTER TABLE tbl_opd_order_item ADD COLUMN IF NOT EXISTS ${colDef}`)
        .catch(() => {});
      void colName;
    }

    await db
      .query('CREATE INDEX IF NOT EXISTS idx_oi_status_patient ON tbl_opd_order_item (status, patient_id)')
      .catch(() => {});
    await db
      .query('CREATE INDEX IF NOT EXISTS idx_oi_consult ON tbl_opd_order_item (consultation_id)')
      .catch(() => {});
    await db
      .query('CREATE INDEX IF NOT EXISTS idx_oi_visit ON tbl_opd_order_item (opd_visit_id)')
      .catch(() => {});
    await db
      .query('CREATE INDEX IF NOT EXISTS idx_oi_service_code ON tbl_opd_order_item (service_code)')
      .catch(() => {});
    return;
  }

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
