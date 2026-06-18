'use strict';

/** Facility-scoped reference-range overrides for lab/radiology template fields. */
module.exports = async function ensureDiagTemplateRefSchema(pool) {
  const q = (sql) =>
    pool.query(sql).catch((e) => {
      const msg = String(e.message || '');
      if (/Duplicate|already exists|ER_DUP/i.test(msg)) return;
      throw e;
    });

  await q(`
    CREATE TABLE IF NOT EXISTS tbl_diag_template_ref_override (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      module ENUM('laboratory','radiology') NOT NULL,
      template_key VARCHAR(80) NOT NULL,
      field_key VARCHAR(80) NOT NULL,
      ref_range VARCHAR(255) DEFAULT NULL,
      normal_min DECIMAL(12,4) DEFAULT NULL,
      normal_max DECIMAL(12,4) DEFAULT NULL,
      updated_by INT DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_fac_tpl_field (facility_id, module, template_key, field_key),
      KEY idx_fac_module_tpl (facility_id, module, template_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
};
