-- Optional: age-only registration (dob NULL, age_years set). Application also runs
-- ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS age_years on patient add/edit.
ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS age_years SMALLINT UNSIGNED NULL;
