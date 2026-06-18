-- Age entered at registration: estimated DOB stored internally; UI shows age only.
ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS age_only_registration TINYINT(1) NOT NULL DEFAULT 0;

-- Legacy rows: age_years without DOB were registered as age-only.
UPDATE tbl_patient SET age_only_registration = 1
 WHERE age_years IS NOT NULL AND (dob IS NULL OR dob = '0000-00-00');
