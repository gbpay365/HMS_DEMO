-- Run after importing or cloning DB for demo branding (MySQL)
UPDATE tbl_facility SET name = 'ZAIZENS', code = 'MAIN' WHERE id = 1;
UPDATE tbl_facility SET name = 'ZAIZENS Branch' WHERE id = 2 AND name LIKE '%TSSF%';

-- Financial settings org name (if table exists)
UPDATE tbl_hms_fin_setting SET setting_value = 'ZAIZENS'
 WHERE setting_key IN ('company.legal_name', 'company.name') AND setting_value LIKE '%TSSF%';

SELECT id, code, name FROM tbl_facility;
