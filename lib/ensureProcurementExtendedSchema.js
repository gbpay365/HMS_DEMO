'use strict';

const { tableExists, columnExists } = require('./hmsFinGeneralLedger');

async function addCol(pool, table, columnName, def) {
  if (await columnExists(pool, table, columnName)) return;
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${def}`);
  } catch (e) {
    console.warn(`ensureProcurementExtendedSchema(${table}.${columnName}):`, e.message || e);
  }
}

/** PO line UoM, summary POs, attachments, audit trail, purchase requests. */
async function ensureProcurementExtendedSchema(pool) {
  if (pool && pool.driver === 'postgres') return;
  await addCol(pool, 'tbl_purchase_order_line', 'uom', 'uom VARCHAR(32) DEFAULT NULL');
  await addCol(pool, 'tbl_purchase_order_line', 'line_no', 'line_no INT DEFAULT NULL');

  await addCol(pool, 'tbl_purchase_order', 'summary_description', 'summary_description TEXT DEFAULT NULL');
  await addCol(pool, 'tbl_purchase_order', 'po_mode', "po_mode VARCHAR(16) NOT NULL DEFAULT 'lined'");
  await addCol(pool, 'tbl_purchase_order', 'purchase_request_id', 'purchase_request_id INT DEFAULT NULL');
  await addCol(pool, 'tbl_purchase_order', 'recalled_at', 'recalled_at DATETIME DEFAULT NULL');
  await addCol(pool, 'tbl_purchase_order', 'recalled_by', 'recalled_by INT DEFAULT NULL');
  await addCol(pool, 'tbl_purchase_order', 'recall_reason', 'recall_reason VARCHAR(512) DEFAULT NULL');

  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_procurement_po_attachment (
      id INT AUTO_INCREMENT PRIMARY KEY,
      purchase_order_id INT NOT NULL,
      facility_id INT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(128) DEFAULT NULL,
      doc_type VARCHAR(32) NOT NULL DEFAULT 'other',
      file_size INT DEFAULT NULL,
      uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      uploaded_by INT DEFAULT NULL,
      import_parsed TINYINT(1) NOT NULL DEFAULT 0,
      KEY ix_po_att_po (purchase_order_id),
      KEY ix_po_att_fac (facility_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});

  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_procurement_po_audit (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      purchase_order_id INT NOT NULL,
      facility_id INT NOT NULL,
      action VARCHAR(32) NOT NULL,
      from_status VARCHAR(32) DEFAULT NULL,
      to_status VARCHAR(32) DEFAULT NULL,
      note VARCHAR(2000) DEFAULT NULL,
      snapshot_json MEDIUMTEXT DEFAULT NULL,
      performed_by INT NOT NULL,
      performed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY ix_po_audit_po (purchase_order_id),
      KEY ix_po_audit_at (performed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});

  if (!(await tableExists(pool, 'tbl_procurement_purchase_request'))) {
    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS tbl_procurement_purchase_request (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL,
        pr_number VARCHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL DEFAULT 'Purchase request',
        status VARCHAR(24) NOT NULL DEFAULT 'draft',
        vendor_id INT DEFAULT NULL,
        needed_by DATE DEFAULT NULL,
        summary_description TEXT DEFAULT NULL,
        estimated_total DECIMAL(14,2) DEFAULT NULL,
        notes VARCHAR(512) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by INT DEFAULT NULL,
        issued_at DATETIME DEFAULT NULL,
        reviewed_at DATETIME DEFAULT NULL,
        reviewed_by INT DEFAULT NULL,
        converted_po_id INT DEFAULT NULL,
        UNIQUE KEY uq_pr_num (facility_id, pr_number),
        KEY ix_pr_fac (facility_id),
        KEY ix_pr_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      )
      .catch(() => {});
  }

  if (!(await tableExists(pool, 'tbl_procurement_purchase_request_line'))) {
    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS tbl_procurement_purchase_request_line (
        id INT AUTO_INCREMENT PRIMARY KEY,
        purchase_request_id INT NOT NULL,
        line_no INT NOT NULL DEFAULT 1,
        description VARCHAR(512) NOT NULL,
        quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
        uom VARCHAR(32) DEFAULT 'unit',
        inventory_item_id INT DEFAULT NULL,
        KEY ix_prl_pr (purchase_request_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      )
      .catch(() => {});
  }
}

module.exports = { ensureProcurementExtendedSchema };
