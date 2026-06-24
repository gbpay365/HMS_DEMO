/**
 * Lab / radiology → procurement requisitions (reagents, consumables, equipment).
 */
module.exports = async function ensureClinicalDeptRequisitionSchema(pool) {
  if (!pool || !pool.query) return;

  if (pool.driver === 'postgres') {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_clinical_dept_requisition (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        department VARCHAR(24) NOT NULL,
        req_number VARCHAR(32) NOT NULL,
        requested_by INTEGER NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'submitted',
        notes TEXT NULL,
        needed_by DATE NULL,
        procurement_pr_id INTEGER NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL
      )
    `);
    await pool
      .query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_cdr_num ON tbl_clinical_dept_requisition (facility_id, req_number)`
      )
      .catch(() => {});
    await pool
      .query(`CREATE INDEX IF NOT EXISTS idx_cdr_dept ON tbl_clinical_dept_requisition (department)`)
      .catch(() => {});
    await pool
      .query(`CREATE INDEX IF NOT EXISTS idx_cdr_status ON tbl_clinical_dept_requisition (status)`)
      .catch(() => {});
    await pool
      .query(`CREATE INDEX IF NOT EXISTS idx_cdr_reqby ON tbl_clinical_dept_requisition (requested_by)`)
      .catch(() => {});
    await pool
      .query(`CREATE INDEX IF NOT EXISTS idx_cdr_pr ON tbl_clinical_dept_requisition (procurement_pr_id)`)
      .catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_clinical_dept_requisition_line (
        id SERIAL PRIMARY KEY,
        requisition_id INTEGER NOT NULL,
        item_type VARCHAR(24) NOT NULL DEFAULT 'consumable',
        description VARCHAR(512) NOT NULL,
        quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
        uom VARCHAR(32) NOT NULL DEFAULT 'unit',
        inventory_item_id INTEGER NULL DEFAULT NULL,
        remarks VARCHAR(500) NULL
      )
    `);
    await pool
      .query(
        `CREATE INDEX IF NOT EXISTS idx_cdrl_req ON tbl_clinical_dept_requisition_line (requisition_id)`
      )
      .catch(() => {});
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_clinical_dept_requisition (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      department VARCHAR(24) NOT NULL,
      req_number VARCHAR(32) NOT NULL,
      requested_by INT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'submitted',
      notes TEXT NULL,
      needed_by DATE NULL,
      procurement_pr_id INT NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cdr_num (facility_id, req_number),
      KEY idx_cdr_dept (department),
      KEY idx_cdr_status (status),
      KEY idx_cdr_reqby (requested_by),
      KEY idx_cdr_pr (procurement_pr_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_clinical_dept_requisition_line (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requisition_id INT NOT NULL,
      item_type VARCHAR(24) NOT NULL DEFAULT 'consumable',
      description VARCHAR(512) NOT NULL,
      quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
      uom VARCHAR(32) NOT NULL DEFAULT 'unit',
      inventory_item_id INT NULL DEFAULT NULL,
      remarks VARCHAR(500) NULL,
      KEY idx_cdrl_req (requisition_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
};
