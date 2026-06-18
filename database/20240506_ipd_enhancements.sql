-- IPD Enhancements Migration
-- Run via: GET /migrate-ipd-enhancements

-- 1. Running bill line-items table (tracks each charge added to the running bill)
CREATE TABLE IF NOT EXISTS tbl_ipd_charge (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    facility_id   INT NOT NULL DEFAULT 1,
    admission_id  INT NOT NULL,
    patient_id    INT NOT NULL,
    charge_type   ENUM('room_daily','lab','radiology','pharmacy','consultation','procedure','misc') DEFAULT 'misc',
    description   VARCHAR(300) NOT NULL,
    amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
    added_by      INT DEFAULT NULL,
    source_module VARCHAR(60) DEFAULT NULL,   -- 'lab', 'pharmacy', 'radiology', 'manual'
    source_pk     INT DEFAULT NULL,           -- FK to source row (lab_result.id, prescription_line.id…)
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_admission (admission_id),
    KEY idx_patient   (patient_id)
);

-- 2. Ensure tbl_admission columns are present
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_doctor_id INT DEFAULT NULL;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_diagnosis VARCHAR(500) DEFAULT '';
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_department VARCHAR(120) DEFAULT '';
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS running_bill DECIMAL(12,2) DEFAULT 0;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_status ENUM('admitted','clinical_discharged','discharged') DEFAULT 'admitted';
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS clinical_discharged_at DATETIME DEFAULT NULL;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS clinical_discharged_by INT DEFAULT NULL;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS financial_discharged_at DATETIME DEFAULT NULL;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS financial_discharged_by INT DEFAULT NULL;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS discharge_summary TEXT DEFAULT NULL;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS follow_up_instructions TEXT DEFAULT NULL;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS final_payment_amount DECIMAL(12,2) DEFAULT NULL;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS final_payment_method VARCHAR(60) DEFAULT NULL;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS facility_id INT DEFAULT 1;
ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS created_by INT DEFAULT NULL;

-- 3. Ensure tbl_bed has patient_id column
ALTER TABLE tbl_bed ADD COLUMN IF NOT EXISTS patient_id INT DEFAULT NULL;
