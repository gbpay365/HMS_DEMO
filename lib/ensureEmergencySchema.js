'use strict';

/**
 * Self-healing schema for the Emergency Department workflow.
 *
 * The redesign keeps `tbl_opd_visit` as the anchor record (so existing
 * Consultation / IPD / Cashier / Billing flows still find the patient
 * through the same visit_id) but introduces dedicated ER tables for
 * each phase of the workflow:
 *
 *   tbl_er_triage       — Phase 1: acuity, vitals, flags, bed assignment
 *   tbl_er_bed          — Bed inventory (resuscitation / holding / SSU)
 *   tbl_er_order        — Phase 2: parallel orders (lab, rad, pharm, blood)
 *   tbl_er_disposition  — Phase 3: 4 pathways (Discharge / SSU / IPD / OT)
 *   tbl_er_mlc          — Medico-Legal Case (locked, tri-copy report)
 *
 * tbl_emergency_charge already exists (legacy) and is reused unchanged.
 *
 * Idempotent: re-running it on an upgraded DB is a no-op except for
 * picking up newly-introduced seed beds.
 */

module.exports = async function ensureEmergencySchema(pool) {
  if (pool && pool.driver === 'postgres') return;
  const addCol = async (sql) => {
    try { await pool.query(sql); }
    catch (e) {
      const msg = String(e.message || '');
      const dup = e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060 ||
                  /Duplicate column/i.test(msg) || /already exists/i.test(msg);
      if (!dup) throw e;
    }
  };

  // ── 1. Extend tbl_opd_visit with ER tracking columns ────────────────
  // arrival_mode      : ambulance / walk_in / referral / police
  // referral_source   : free text
  // acuity_level      : 1..5 (mirrors tbl_er_triage.acuity for fast filtering)
  // mlc_flag          : 1 if Medico-Legal Case
  // lwbs              : 1 if Left Without Being Seen
  // doctor_first_seen : when ED physician first touched the chart
  // disposition_at    : when phase 3 closed
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN is_emergency      TINYINT(1)   NOT NULL DEFAULT 0`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN waiver_reason     VARCHAR(200) DEFAULT NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN emg_credit_total  DECIMAL(12,2) DEFAULT 0`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN arrival_mode      VARCHAR(40)  DEFAULT NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN referral_source   VARCHAR(160) DEFAULT NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN acuity_level      TINYINT(1)   DEFAULT NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN mlc_flag          TINYINT(1)   NOT NULL DEFAULT 0`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN lwbs              TINYINT(1)   NOT NULL DEFAULT 0`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN doctor_first_seen DATETIME     NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN disposition_at    DATETIME     NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN er_bed_id         INT          NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN clinical_discharged_at DATETIME NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN clinical_discharged_by INT NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN er_status VARCHAR(30) DEFAULT NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN er_payment_code VARCHAR(40) DEFAULT NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN er_paid_at DATETIME NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN er_payment_code_generated_at DATETIME NULL`);
  await addCol(`ALTER TABLE tbl_opd_visit ADD COLUMN er_code_consumed_at DATETIME NULL`);

  // ── 2. tbl_er_bed: bay/bed inventory for the ED ────────────────────
  //   bay_type ∈ {resuscitation, holding, observation, ssu}
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_er_bed (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      bed_code        VARCHAR(20)  NOT NULL,
      bay_type        VARCHAR(20)  NOT NULL DEFAULT 'holding',
      label           VARCHAR(80)  NOT NULL,
      sort_order      INT          DEFAULT 0,
      is_active       TINYINT(1)   NOT NULL DEFAULT 1,
      current_visit_id INT         DEFAULT NULL,
      UNIQUE KEY uk_er_bed_code (bed_code),
      KEY idx_bay (bay_type, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // Seed a default set of beds if the table is empty.
  const [bedCount] = await pool.query('SELECT COUNT(*) AS n FROM tbl_er_bed');
  if (!bedCount[0] || bedCount[0].n === 0) {
    const beds = [
      // [bed_code, bay_type, label, sort_order]
      ['RES-1', 'resuscitation', 'Resuscitation Bay 1',  10],
      ['RES-2', 'resuscitation', 'Resuscitation Bay 2',  20],
      ['RES-3', 'resuscitation', 'Resuscitation Bay 3',  30],
      ['HOLD-1','holding',       'Holding Bed 1',        40],
      ['HOLD-2','holding',       'Holding Bed 2',        50],
      ['HOLD-3','holding',       'Holding Bed 3',        60],
      ['HOLD-4','holding',       'Holding Bed 4',        70],
      ['OBS-1', 'observation',   'Observation Cubicle 1',80],
      ['OBS-2', 'observation',   'Observation Cubicle 2',90],
      ['SSU-1', 'ssu',           'Short Stay Bed 1',     100],
      ['SSU-2', 'ssu',           'Short Stay Bed 2',     110],
      ['SSU-3', 'ssu',           'Short Stay Bed 3',     120],
    ];
    for (const [code, bay, label, ord] of beds) {
      await pool.query(
        `INSERT IGNORE INTO tbl_er_bed (bed_code, bay_type, label, sort_order)
         VALUES (?,?,?,?)`,
        [code, bay, label, ord]
      );
    }
  }

  // ── 3. tbl_er_triage: vitals + acuity per visit ────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_er_triage (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      visit_id          INT          NOT NULL,
      acuity_level      TINYINT(1)   NOT NULL,            -- 1..5
      bp_systolic       INT          DEFAULT NULL,
      bp_diastolic      INT          DEFAULT NULL,
      pulse             INT          DEFAULT NULL,
      spo2              INT          DEFAULT NULL,
      temp_celsius      DECIMAL(4,1) DEFAULT NULL,
      respiratory_rate  INT          DEFAULT NULL,
      gcs               INT          DEFAULT NULL,
      pain_score        TINYINT      DEFAULT NULL,        -- 0..10
      flag_trauma       TINYINT(1)   NOT NULL DEFAULT 0,
      flag_cardiac      TINYINT(1)   NOT NULL DEFAULT 0,
      flag_stroke       TINYINT(1)   NOT NULL DEFAULT 0,
      flag_pediatric    TINYINT(1)   NOT NULL DEFAULT 0,
      flag_psych        TINYINT(1)   NOT NULL DEFAULT 0,
      flag_obstetric    TINYINT(1)   NOT NULL DEFAULT 0,
      chief_complaint   TEXT         DEFAULT NULL,
      bed_id            INT          DEFAULT NULL,        -- FK to tbl_er_bed.id
      triage_nurse_id   INT          DEFAULT NULL,
      created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_visit (visit_id),
      KEY idx_acuity (acuity_level)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // ── 4. tbl_er_order: parallel orders (lab, rad, pharmacy, blood) ───
  //   order_type ∈ {lab, radiology, pharmacy, blood_bank, procedure}
  //   status     ∈ {ordered, sample_collected, in_progress, completed,
  //                 critical, cancelled}
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_er_order (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      visit_id        INT           NOT NULL,
      order_type      VARCHAR(20)   NOT NULL,
      description     VARCHAR(255)  NOT NULL,
      priority        VARCHAR(10)   NOT NULL DEFAULT 'stat',
      status          VARCHAR(20)   NOT NULL DEFAULT 'ordered',
      result_summary  TEXT          DEFAULT NULL,
      critical_alert  TINYINT(1)    NOT NULL DEFAULT 0,
      ordered_by      INT           DEFAULT NULL,
      ordered_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
      completed_at    DATETIME      DEFAULT NULL,
      KEY idx_visit (visit_id, status),
      KEY idx_critical (critical_alert)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // ── 5. tbl_er_disposition: the 4-pathway exit decision ─────────────
  //   pathway ∈ {discharge, ssu, ipd, ot, transfer, deceased, lwbs}
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_er_disposition (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      visit_id            INT           NOT NULL,
      pathway             VARCHAR(20)   NOT NULL,
      summary             TEXT          DEFAULT NULL,
      take_home_meds      TEXT          DEFAULT NULL,
      return_precautions  TEXT          DEFAULT NULL,
      admit_department    VARCHAR(120)  DEFAULT NULL,
      admit_request_id    INT           DEFAULT NULL,
      ssu_expected_hours  INT           DEFAULT NULL,
      ot_procedure        VARCHAR(255)  DEFAULT NULL,
      transfer_to         VARCHAR(160)  DEFAULT NULL,
      decided_by          INT           DEFAULT NULL,
      decided_at          DATETIME      DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_visit (visit_id),
      KEY idx_pathway (pathway, decided_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // ── 6. tbl_er_mlc: Medico-Legal Case — locked record ───────────────
  //   case_type ∈ {poisoning, assault, rta, burn, sexual_assault,
  //                domestic_violence, unknown_dead_body, other}
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_er_mlc (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      visit_id        INT           NOT NULL,
      mlc_number      VARCHAR(40)   NOT NULL,
      case_type       VARCHAR(40)   NOT NULL,
      incident_at     DATETIME      DEFAULT NULL,
      incident_place  VARCHAR(255)  DEFAULT NULL,
      brought_by      VARCHAR(160)  DEFAULT NULL,
      police_station  VARCHAR(160)  DEFAULT NULL,
      police_notified_at DATETIME   DEFAULT NULL,
      officer_name    VARCHAR(160)  DEFAULT NULL,
      narrative       TEXT          DEFAULT NULL,
      examination     TEXT          DEFAULT NULL,
      injuries        TEXT          DEFAULT NULL,
      provisional_dx  VARCHAR(255)  DEFAULT NULL,
      locked          TINYINT(1)    NOT NULL DEFAULT 0,
      locked_at       DATETIME      DEFAULT NULL,
      locked_by       INT           DEFAULT NULL,
      hash            CHAR(64)      DEFAULT NULL,
      created_by      INT           DEFAULT NULL,
      created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_mlc_visit (visit_id),
      UNIQUE KEY uk_mlc_number (mlc_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // ── 7. tbl_emergency_charge (legacy table) — ensure it exists ──────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_emergency_charge (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      facility_id   INT NOT NULL DEFAULT 1,
      visit_id      INT NOT NULL,
      patient_id    INT NOT NULL,
      charge_type   VARCHAR(40) DEFAULT 'misc',
      description   VARCHAR(300) NOT NULL,
      amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
      added_by      INT DEFAULT NULL,
      source_module VARCHAR(60) DEFAULT NULL,
      source_pk     INT DEFAULT NULL,
      clinical_detail TEXT NULL,
      settled       TINYINT(1) DEFAULT 0,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_visit   (visit_id),
      KEY idx_patient (patient_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await addCol('ALTER TABLE tbl_emergency_charge ADD COLUMN clinical_detail TEXT NULL');
};
