'use strict';

/**
 * OPD medication management — treatment episodes, prescriptions, dose slots.
 * Mirrors IPD med flow but anchored on tbl_opd_visit (outpatient visits).
 */

module.exports = async function ensureOpdMedSchema(pool) {
  const sq = (s, p = []) => pool.query(s, p);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_opd_treatment (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      opd_visit_id        INT          NOT NULL,
      patient_id          INT          NOT NULL,
      doctor_id           INT          NOT NULL,
      diagnosis           VARCHAR(500) NOT NULL,
      est_duration_days   INT          DEFAULT NULL,
      start_date          DATE         DEFAULT NULL,
      alert_on_administer TINYINT(1)   NOT NULL DEFAULT 0,
      notes               TEXT         DEFAULT NULL,
      status              VARCHAR(20)  NOT NULL DEFAULT 'active',
      terminated_at       DATETIME     DEFAULT NULL,
      terminated_by       INT          DEFAULT NULL,
      terminated_reason   VARCHAR(300) DEFAULT NULL,
      created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_visit_status (opd_visit_id, status),
      KEY idx_patient      (patient_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_opd_prescription (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      treatment_id      INT           NOT NULL,
      opd_visit_id      INT           NOT NULL,
      patient_id        INT           NOT NULL,
      drug_name         VARCHAR(200)  NOT NULL,
      drug_type         VARCHAR(20)   NOT NULL DEFAULT 'tablet',
      dosage            VARCHAR(80)   NOT NULL,
      route             VARCHAR(20)   NOT NULL DEFAULT 'oral',
      frequency_label   VARCHAR(20)   NOT NULL,
      times_per_day     INT           NOT NULL DEFAULT 1,
      duration_days     INT           NOT NULL DEFAULT 1,
      scheduled_times   VARCHAR(255)  DEFAULT NULL,
      unit_price        DECIMAL(12,2) NOT NULL DEFAULT 0,
      treatment_start   DATE          DEFAULT NULL,
      notes             TEXT          DEFAULT NULL,
      locked            TINYINT(1)    NOT NULL DEFAULT 0,
      created_at        DATETIME      DEFAULT CURRENT_TIMESTAMP,
      created_by        INT           DEFAULT NULL,
      KEY idx_treatment (treatment_id),
      KEY idx_visit     (opd_visit_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_opd_dose_slot (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      prescription_id     INT           NOT NULL,
      treatment_id        INT           NOT NULL,
      opd_visit_id        INT           NOT NULL,
      patient_id          INT           NOT NULL,
      scheduled_at        DATETIME      NOT NULL,
      day_index           INT           NOT NULL DEFAULT 1,
      administered        TINYINT(1)    NOT NULL DEFAULT 0,
      administered_at     DATETIME      DEFAULT NULL,
      administered_by     INT           DEFAULT NULL,
      missed_reason       VARCHAR(200)  DEFAULT NULL,
      nurse_comment       VARCHAR(500)  DEFAULT NULL,
      hidden_on_terminate TINYINT(1)    NOT NULL DEFAULT 0,
      admin_locked        TINYINT(1)    NOT NULL DEFAULT 0,
      KEY idx_visit_sched (opd_visit_id, scheduled_at),
      KEY idx_treatment   (treatment_id, administered),
      KEY idx_prescription (prescription_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_opd_med_doctor_alert (
      id                BIGINT AUTO_INCREMENT PRIMARY KEY,
      facility_id       INT DEFAULT 1,
      opd_visit_id      INT NOT NULL,
      patient_id        INT NOT NULL,
      target_doctor_id  INT NOT NULL,
      prescription_id   INT NULL,
      dose_slot_id      INT NULL,
      drug_display      VARCHAR(300) NULL,
      dose_display      VARCHAR(120) NULL,
      nurse_display     VARCHAR(120) NULL,
      created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_doctor (target_doctor_id, created_at),
      KEY idx_visit (opd_visit_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_opd_med_doctor_alert_ack (
      alert_id BIGINT NOT NULL,
      user_id INT NOT NULL,
      acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (alert_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => {});

  await sq(
    "ALTER TABLE tbl_opd_order_item ADD COLUMN IF NOT EXISTS source_module VARCHAR(32) NULL"
  ).catch(() => {});
  await sq(
    'ALTER TABLE tbl_opd_order_item ADD COLUMN IF NOT EXISTS source_pk INT NULL'
  ).catch(() => {});
  await sq(
    'ALTER TABLE tbl_opd_order_item ADD KEY IF NOT EXISTS idx_opd_source (source_module, source_pk)'
  ).catch(() => {});
};
