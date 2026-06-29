-- Nigeria HMS branding & fiscal defaults (run after clone from hms_demo)
UPDATE tbl_facility SET name = 'Nigeria HMS Hospital', timezone = 'Africa/Lagos' WHERE id = 1;
UPDATE tbl_facility SET name = 'Nigeria HMS Branch' WHERE id = 2;

INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('company.legal_name', 'Nigeria HMS')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('company.name', 'Nigeria HMS')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('company.city', 'Lagos')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('company.currency', 'NGN')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('company.fiscal_regime', 'Nigeria (Companies Act / IFRS)')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('tax.tva_rate_standard', '7.5')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('accounting.chart', 'NIGERIA_IFRS')
  ON DUPLICATE KEY UPDATE v = VALUES(v);

-- Nigeria payroll statutory defaults (PAYE 2026 + Pension Reform Act)
UPDATE tbl_hms_payroll_settings SET
  cnps_employee_rate = 8.0,
  cimr_employee_rate = 2.5,
  crtv_rate = 0,
  council_tax_rate = 0,
  development_tax_rate = 10.0,
  cnhc_rate = 0,
  tax_brackets = '[{"min":0,"max":800000,"rate":0},{"min":800001,"max":3000000,"rate":15},{"min":3000001,"max":12000000,"rate":18},{"min":12000001,"max":25000000,"rate":21},{"min":25000001,"max":50000000,"rate":23},{"min":50000001,"max":null,"rate":25}]'
WHERE facility_id = 1;

UPDATE tbl_service_catalog SET currency = 'NGN' WHERE currency IS NULL OR currency = '' OR currency = 'XAF';

SELECT k, v FROM tbl_hms_fin_setting WHERE k LIKE 'company.%' OR k LIKE 'accounting.%' OR k = 'tax.tva_rate_standard';
