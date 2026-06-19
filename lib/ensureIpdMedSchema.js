'use strict';

/**
 * Self-healing schema for the IPD Medication Management module.
 *
 * Anchors on existing `tbl_admission` so the new tables plug into the
 * existing IPD bed board / billing flow without disruption.
 *
 *   tbl_ipd_treatment           — diagnosis episode (doctor-owned)
 *   tbl_ipd_prescription        — Rx lines under a treatment
 *   tbl_ipd_dose_slot           — pre-generated scheduled dose slots
 *                                 (one row per dose; admin checkbox lives here)
 *   tbl_ipd_consumable_catalog  — pre-loaded ward consumables (cannula, drip set…)
 *   tbl_ipd_consumable_log      — consumables actually used during a shift
 *   tbl_ipd_shift_report        — nurse shift report (report_status: open | submitted)
 *   tbl_ipd_shift_report_revision — superseded field text (audit + red strikethrough UI)
 *   tbl_ipd_message             — in-system messages (nurse ↔ doctor)
 *   tbl_ipd_med_audit           — append-only log of IPD Rx & message actions
 *
 * Idempotent.
 */

module.exports = async function ensureIpdMedSchema(pool) {
  if (pool && pool.driver === 'postgres') return;
  const sq = (s, p=[]) => pool.query(s, p);

  // ── 1. tbl_ipd_treatment ────────────────────────────────────────────
  //   status ∈ { active, terminated, discharged }
  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_treatment (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      admission_id        INT          NOT NULL,
      patient_id          INT          NOT NULL,
      doctor_id           INT          NOT NULL,
      diagnosis           VARCHAR(500) NOT NULL,
      est_duration_days   INT          DEFAULT NULL,
      start_date          DATE         DEFAULT NULL,
      notes               TEXT         DEFAULT NULL,
      status              VARCHAR(20)  NOT NULL DEFAULT 'active',
      terminated_at       DATETIME     DEFAULT NULL,
      terminated_by       INT          DEFAULT NULL,
      terminated_reason   VARCHAR(300) DEFAULT NULL,
      replaced_by         INT          DEFAULT NULL,
      created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_admission   (admission_id, status),
      KEY idx_patient     (patient_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // ── 2. tbl_ipd_prescription ────────────────────────────────────────
  //   drug_type   ∈ { tablet, injection, drip, oral_liquid, topical, other }
  //   route       ∈ { oral, iv, im, sc, topical, inhalation, rectal, sublingual }
  //   frequency_label ∈ free text but normally one of OD, BD, TDS, QID, Q6H, …
  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_prescription (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      treatment_id      INT           NOT NULL,
      admission_id      INT           NOT NULL,
      patient_id        INT           NOT NULL,
      drug_name         VARCHAR(200)  NOT NULL,
      drug_type         VARCHAR(20)   NOT NULL DEFAULT 'tablet',
      dosage            VARCHAR(80)   NOT NULL,
      route             VARCHAR(20)   NOT NULL DEFAULT 'oral',
      frequency_label   VARCHAR(20)   NOT NULL,
      times_per_day     INT           NOT NULL DEFAULT 1,
      duration_days     INT           NOT NULL DEFAULT 1,
      scheduled_times   VARCHAR(255)  DEFAULT NULL,           -- comma-separated HH:MM
      unit_price        DECIMAL(12,2) NOT NULL DEFAULT 0,
      notes             TEXT          DEFAULT NULL,
      locked            TINYINT(1)    NOT NULL DEFAULT 0,
      created_at        DATETIME      DEFAULT CURRENT_TIMESTAMP,
      created_by        INT           DEFAULT NULL,
      KEY idx_treatment (treatment_id),
      KEY idx_admission (admission_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // ── 3. tbl_ipd_dose_slot ───────────────────────────────────────────
  //   Pre-generated row for each scheduled dose. Tick → administered=1.
  //   hidden_on_terminate=1 hides untaken doses from the working nurse view
  //   once the treatment is terminated, while preserving the audit trail.
  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_dose_slot (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      prescription_id     INT           NOT NULL,
      treatment_id        INT           NOT NULL,
      admission_id        INT           NOT NULL,
      patient_id          INT           NOT NULL,
      scheduled_at        DATETIME      NOT NULL,
      day_index           INT           NOT NULL DEFAULT 1,
      administered        TINYINT(1)    NOT NULL DEFAULT 0,
      administered_at     DATETIME      DEFAULT NULL,
      administered_by     INT           DEFAULT NULL,
      missed_reason       VARCHAR(200)  DEFAULT NULL,
      notes               VARCHAR(255)  DEFAULT NULL,
      hidden_on_terminate TINYINT(1)    NOT NULL DEFAULT 0,
      billed              TINYINT(1)    NOT NULL DEFAULT 0,
      charge_id           INT           DEFAULT NULL,
      KEY idx_admission_sched (admission_id, scheduled_at),
      KEY idx_treatment       (treatment_id, administered),
      KEY idx_prescription    (prescription_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await sq(
    'ALTER TABLE tbl_ipd_dose_slot ADD COLUMN IF NOT EXISTS doctor_ack TINYINT(1) NOT NULL DEFAULT 0'
  ).catch(() => {});
  await sq(
    'ALTER TABLE tbl_ipd_dose_slot ADD COLUMN IF NOT EXISTS doctor_comment VARCHAR(500) DEFAULT NULL'
  ).catch(() => {});
  await sq(
    'ALTER TABLE tbl_ipd_dose_slot ADD COLUMN IF NOT EXISTS slot_dosage VARCHAR(80) DEFAULT NULL'
  ).catch(() => {});
  await sq(
    'ALTER TABLE tbl_ipd_dose_slot ADD COLUMN IF NOT EXISTS nurse_comment VARCHAR(500) DEFAULT NULL'
  ).catch(() => {});
  await sq(
    'ALTER TABLE tbl_ipd_dose_slot ADD COLUMN IF NOT EXISTS admin_locked TINYINT(1) NOT NULL DEFAULT 0'
  ).catch(() => {});

  // ── 4. tbl_ipd_consumable_catalog ──────────────────────────────────
  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_consumable_catalog (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      sku         VARCHAR(40)  NOT NULL,
      name        VARCHAR(160) NOT NULL,
      category    VARCHAR(60)  DEFAULT 'consumable',
      unit_price  DECIMAL(12,2) NOT NULL DEFAULT 0,
      uom         VARCHAR(20)  NOT NULL DEFAULT 'unit',
      is_active   TINYINT(1)   NOT NULL DEFAULT 1,
      UNIQUE KEY uk_sku (sku)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  const [catCountRows] = await pool.query(
    'SELECT COUNT(*) AS n FROM tbl_ipd_consumable_catalog'
  ).catch(() => [[{ n: 0 }]]);
  const catN = (catCountRows && catCountRows[0] && catCountRows[0].n) || 0;
  if (!catN) {
    const seed = [
      ['IVC-G18',  'IV Cannula 18G',          'cannula',    500,  'unit'],
      ['IVC-G20',  'IV Cannula 20G',          'cannula',    500,  'unit'],
      ['IVC-G22',  'IV Cannula 22G',          'cannula',    500,  'unit'],
      ['DRP-SET',  'Drip Set (Standard)',     'iv_supplies',1000, 'set'],
      ['DRP-PED',  'Drip Set (Paediatric)',   'iv_supplies',1200, 'set'],
      ['SYR-5',    'Syringe 5 ml',            'syringe',    150,  'unit'],
      ['SYR-10',   'Syringe 10 ml',           'syringe',    200,  'unit'],
      ['SYR-20',   'Syringe 20 ml',           'syringe',    300,  'unit'],
      ['NDL-21',   'Needle 21G',              'syringe',    100,  'unit'],
      ['NDL-23',   'Needle 23G',              'syringe',    100,  'unit'],
      ['GAU-S',    'Sterile Gauze (small)',   'dressing',   250,  'pack'],
      ['GAU-L',    'Sterile Gauze (large)',   'dressing',   400,  'pack'],
      ['BAN-CR',   'Crepe Bandage',           'dressing',   600,  'roll'],
      ['BAN-EL',   'Elastic Bandage',         'dressing',   800,  'roll'],
      ['ALC-SW',   'Alcohol Swab',            'dressing',   50,   'unit'],
      ['BTD-IO',   'Iodine Solution 100ml',   'antiseptic', 1500, 'bottle'],
      ['BTD-CHL',  'Chlorhexidine 100ml',     'antiseptic', 1800, 'bottle'],
      ['GLO-SM',   'Examination Gloves (S)',  'gloves',     80,   'pair'],
      ['GLO-MD',   'Examination Gloves (M)',  'gloves',     80,   'pair'],
      ['GLO-LG',   'Examination Gloves (L)',  'gloves',     80,   'pair'],
      ['STG-SX',   'Sterile Gloves Surgical', 'gloves',     400,  'pair'],
      ['THM-OR',   'Disposable Thermometer Probe Cover', 'monitoring', 120, 'unit'],
      ['CATH-F',   'Foley Catheter',          'catheter',   2000, 'unit'],
      ['UR-BAG',   'Urine Drainage Bag',      'catheter',   1500, 'unit'],
      ['SAL-NS',   'Normal Saline 500ml',     'iv_fluid',   1200, 'bottle'],
      ['SAL-RL',   "Ringer's Lactate 500ml",  'iv_fluid',   1300, 'bottle'],
      ['DX5-W',    'Dextrose 5% 500ml',       'iv_fluid',   1200, 'bottle'],
      ['DX10-W',   'Dextrose 10% 500ml',      'iv_fluid',   1500, 'bottle'],
      ['MAS-SUR',  'Surgical Mask',           'ppe',        100,  'unit'],
      ['MAS-N95',  'N95 Respirator',          'ppe',        800,  'unit'],
      ['DIA-LG',   'Adult Diaper (large)',    'hygiene',    500,  'unit'],
      ['DIA-MD',   'Adult Diaper (medium)',   'hygiene',    500,  'unit'],
    ];
    for (const [sku, name, cat, price, uom] of seed) {
      await pool.query(
        `INSERT IGNORE INTO tbl_ipd_consumable_catalog (sku, name, category, unit_price, uom)
         VALUES (?,?,?,?,?)`,
        [sku, name, cat, price, uom]
      );
    }
  }

  // ── 5. tbl_ipd_consumable_log ──────────────────────────────────────
  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_consumable_log (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      admission_id  INT          NOT NULL,
      treatment_id  INT          DEFAULT NULL,
      patient_id    INT          NOT NULL,
      catalog_id    INT          DEFAULT NULL,
      item_name     VARCHAR(160) NOT NULL,
      unit_price    DECIMAL(12,2) NOT NULL DEFAULT 0,
      quantity      DECIMAL(8,2) NOT NULL DEFAULT 1,
      total         DECIMAL(12,2) NOT NULL DEFAULT 0,
      notes         VARCHAR(255) DEFAULT NULL,
      shift_report_id INT        DEFAULT NULL,
      logged_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
      logged_by     INT          DEFAULT NULL,
      billed        TINYINT(1)   NOT NULL DEFAULT 0,
      charge_id     INT          DEFAULT NULL,
      KEY idx_admission (admission_id, logged_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // ── 6. tbl_ipd_shift_report ───────────────────────────────────────
  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_shift_report (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      admission_id      INT          NOT NULL,
      patient_id        INT          NOT NULL,
      nurse_id          INT          NOT NULL,
      shift_label       VARCHAR(40)  DEFAULT NULL,          -- 'Morning', 'Evening', 'Night'
      shift_started_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
      shift_ended_at    DATETIME     DEFAULT NULL,
      ward_rounds       TEXT         DEFAULT NULL,
      done_notes        TEXT         DEFAULT NULL,
      not_done_notes    TEXT         DEFAULT NULL,
      pending_notes     TEXT         DEFAULT NULL,
      free_notes        TEXT         DEFAULT NULL,
      next_nurse_id     INT          DEFAULT NULL,
      handover_notes    TEXT         DEFAULT NULL,
      report_status     VARCHAR(20)  NOT NULL DEFAULT 'open',
      locked            TINYINT(1)   NOT NULL DEFAULT 0,
      KEY idx_admission_started (admission_id, shift_started_at),
      KEY idx_nurse             (nurse_id),
      KEY idx_report_status     (admission_id, report_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await sq(
    `ALTER TABLE tbl_ipd_shift_report ADD COLUMN IF NOT EXISTS report_status VARCHAR(20) NOT NULL DEFAULT 'open'`
  ).catch(() => {});
  await sq(
    `UPDATE tbl_ipd_shift_report SET report_status = IF(locked=1,'submitted','open')`
  ).catch(() => {});
  await sq(
    `ALTER TABLE tbl_ipd_shift_report ADD COLUMN IF NOT EXISTS patient_status VARCHAR(80) DEFAULT NULL`
  ).catch(() => {});
  await sq(
    `ALTER TABLE tbl_ipd_shift_report ADD COLUMN IF NOT EXISTS treatment_summary MEDIUMTEXT DEFAULT NULL`
  ).catch(() => {});
  await sq(
    `ALTER TABLE tbl_ipd_shift_report ADD COLUMN IF NOT EXISTS submitted_to_doctor_at DATETIME DEFAULT NULL`
  ).catch(() => {});
  await sq(
    `ALTER TABLE tbl_ipd_shift_report ADD COLUMN IF NOT EXISTS recalled_at DATETIME DEFAULT NULL`
  ).catch(() => {});
  await sq(
    `ALTER TABLE tbl_ipd_shift_report ADD COLUMN IF NOT EXISTS recalled_by INT DEFAULT NULL`
  ).catch(() => {});

  // ── 6b. tbl_ipd_shift_report_revision — field-level history for audits / UI strikethrough
  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_shift_report_revision (
      id                BIGINT AUTO_INCREMENT PRIMARY KEY,
      shift_report_id   INT           NOT NULL,
      admission_id      INT           NOT NULL,
      field_key         VARCHAR(40)   NOT NULL,
      old_text          MEDIUMTEXT    NULL,
      new_text          MEDIUMTEXT    NULL,
      edited_by         INT           DEFAULT NULL,
      edited_name       VARCHAR(120)  DEFAULT NULL,
      created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_shift (shift_report_id, id),
      KEY idx_admission (admission_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // ── 7. tbl_ipd_message — in-system messages (nurse → doctor) ──────
  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_message (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      admission_id  INT          DEFAULT NULL,
      treatment_id  INT          DEFAULT NULL,
      patient_id    INT          DEFAULT NULL,
      from_user_id  INT          NOT NULL,
      to_user_id    INT          NOT NULL,
      subject       VARCHAR(200) DEFAULT NULL,
      body          TEXT         DEFAULT NULL,
      source        VARCHAR(40)  DEFAULT 'manual',
      source_id     INT          DEFAULT NULL,
      sent_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
      read_at       DATETIME     DEFAULT NULL,
      KEY idx_to_unread (to_user_id, read_at),
      KEY idx_admission (admission_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // ── 8. tbl_ipd_med_audit — clinical IPD actions (Rx changes, messages) ─
  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_ipd_med_audit (
      id               BIGINT AUTO_INCREMENT PRIMARY KEY,
      created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      admission_id     INT          NULL,
      patient_id       INT          NULL,
      treatment_id     INT          NULL,
      prescription_id  INT          NULL,
      actor_id         INT          NULL,
      actor_name       VARCHAR(120) NULL,
      action           VARCHAR(80)  NOT NULL,
      detail           TEXT         NULL,
      KEY idx_ipd_med_audit_adm (admission_id, created_at),
      KEY idx_ipd_med_audit_rx  (prescription_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // IPD running-bill line: optional prescription-style JSON (dosage, frequency, …)
  await sq(
    'ALTER TABLE tbl_ipd_charge ADD COLUMN IF NOT EXISTS clinical_detail TEXT NULL'
  ).catch(() => {});

  await sq(
    'ALTER TABLE tbl_ipd_prescription ADD COLUMN IF NOT EXISTS treatment_start DATE NULL'
  ).catch(() => {});
};
