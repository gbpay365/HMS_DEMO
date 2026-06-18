'use strict';

/**
 * Maternity module — ANC through postnatal (MySQL / MariaDB).
 * Idempotent; safe to run on every boot.
 */
module.exports = async function ensureMaternitySchema(pool) {
  const q = (sql) => pool.query(sql).catch((e) => {
    const msg = String(e.message || '');
    if (/Duplicate|already exists|ER_DUP/i.test(msg)) return;
    throw e;
  });

  await q(`
    CREATE TABLE IF NOT EXISTS maternity_patients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      facility_id INT NULL,
      gravida INT NOT NULL DEFAULT 1,
      para INT NOT NULL DEFAULT 0,
      abortion INT NOT NULL DEFAULT 0,
      lmp DATE NULL,
      edd DATE NULL,
      ega_at_booking INT NULL,
      blood_group VARCHAR(5) NULL,
      rhesus_factor VARCHAR(10) NULL,
      booking_date DATE NULL,
      antenatal_number VARCHAR(50) NOT NULL,
      risk_level ENUM('low','medium','high') NOT NULL DEFAULT 'low',
      status ENUM('active','delivered','transferred','deceased','aborted') NOT NULL DEFAULT 'active',
      hiv_status ENUM('positive','negative','unknown') NOT NULL DEFAULT 'unknown',
      pmtct_enrolled TINYINT(1) NOT NULL DEFAULT 0,
      registered_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_mat_patient (patient_id),
      UNIQUE KEY uk_mat_anc_no (antenatal_number),
      KEY idx_mat_status (status),
      KEY idx_mat_risk (risk_level),
      KEY idx_mat_facility (facility_id),
      CONSTRAINT fk_mat_patient FOREIGN KEY (patient_id) REFERENCES tbl_patient(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS antenatal_visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      maternity_patient_id INT NOT NULL,
      visit_number INT NOT NULL,
      visit_date DATE NOT NULL,
      ega_weeks INT NULL,
      weight DECIMAL(5,2) NULL,
      height DECIMAL(5,2) NULL,
      bmi DECIMAL(5,2) NULL,
      blood_pressure_systolic INT NULL,
      blood_pressure_diastolic INT NULL,
      pulse_rate INT NULL,
      temperature DECIMAL(4,1) NULL,
      respiratory_rate INT NULL,
      fundal_height DECIMAL(5,2) NULL,
      fetal_heart_rate INT NULL,
      fetal_presentation VARCHAR(50) NULL,
      fetal_lie VARCHAR(50) NULL,
      fetal_movement VARCHAR(20) NULL,
      oedema ENUM('absent','mild','moderate','severe') DEFAULT 'absent',
      pallor VARCHAR(20) NULL,
      urine_protein VARCHAR(20) NULL,
      urine_glucose VARCHAR(20) NULL,
      haemoglobin DECIMAL(4,1) NULL,
      malaria_test VARCHAR(20) NULL,
      syphilis_test VARCHAR(20) NULL,
      tetanus_toxoid VARCHAR(50) NULL,
      ipt_dose VARCHAR(50) NULL,
      iron_folate_given TINYINT(1) NOT NULL DEFAULT 0,
      llin_given TINYINT(1) NOT NULL DEFAULT 0,
      counselling_done VARCHAR(255) NULL,
      complaints TEXT NULL,
      examination_findings TEXT NULL,
      diagnosis TEXT NULL,
      treatment_given TEXT NULL,
      next_visit_date DATE NULL,
      referral_made TINYINT(1) NOT NULL DEFAULT 0,
      referral_reason TEXT NULL,
      attended_by INT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_anc_mat (maternity_patient_id),
      CONSTRAINT fk_anc_mat FOREIGN KEY (maternity_patient_id) REFERENCES maternity_patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS risk_assessments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      maternity_patient_id INT NOT NULL,
      assessment_date DATE NOT NULL DEFAULT (CURRENT_DATE),
      risk_factors JSON NULL,
      obstetric_history JSON NULL,
      medical_history JSON NULL,
      social_history JSON NULL,
      overall_risk_score INT NOT NULL DEFAULT 0,
      risk_level ENUM('low','medium','high') NOT NULL DEFAULT 'low',
      action_plan TEXT NULL,
      reviewed_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_risk_mat (maternity_patient_id),
      CONSTRAINT fk_risk_mat FOREIGN KEY (maternity_patient_id) REFERENCES maternity_patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS ultrasound_scans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      maternity_patient_id INT NOT NULL,
      scan_date DATE NOT NULL,
      ega_by_scan INT NULL,
      scan_type VARCHAR(50) NULL,
      findings TEXT NULL,
      fetal_biometry JSON NULL,
      placenta_position VARCHAR(100) NULL,
      amniotic_fluid_index DECIMAL(5,2) NULL,
      number_of_fetuses INT NOT NULL DEFAULT 1,
      fetal_anomaly_detected TINYINT(1) NOT NULL DEFAULT 0,
      anomaly_details TEXT NULL,
      sonographer VARCHAR(100) NULL,
      report TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_scan_mat (maternity_patient_id),
      CONSTRAINT fk_scan_mat FOREIGN KEY (maternity_patient_id) REFERENCES maternity_patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS labor_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      maternity_patient_id INT NOT NULL,
      admission_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      admission_type ENUM('spontaneous','induced','elective_cs','emergency') NOT NULL,
      ega_at_admission INT NULL,
      cervical_dilation INT NULL,
      effacement INT NULL,
      station VARCHAR(10) NULL,
      membranes_status ENUM('intact','ruptured','artificial_rupture') NULL,
      liquor_color VARCHAR(30) NULL,
      presentation VARCHAR(50) NULL,
      position VARCHAR(50) NULL,
      contractions_frequency INT NULL,
      contractions_duration INT NULL,
      contractions_strength VARCHAR(20) NULL,
      fhr_at_admission INT NULL,
      bp_systolic INT NULL,
      bp_diastolic INT NULL,
      pulse INT NULL,
      temperature DECIMAL(4,1) NULL,
      urine_protein VARCHAR(20) NULL,
      haemoglobin DECIMAL(4,1) NULL,
      group_and_crossmatch_done TINYINT(1) NOT NULL DEFAULT 0,
      iv_access TINYINT(1) NOT NULL DEFAULT 0,
      partograph_started TINYINT(1) NOT NULL DEFAULT 0,
      oxytocin_infusion TINYINT(1) NOT NULL DEFAULT 0,
      induction_method VARCHAR(100) NULL,
      reason_for_induction TEXT NULL,
      decision_to_deliver_by VARCHAR(30) NULL,
      admitted_by INT NULL,
      status ENUM('in_labor','delivered','transferred','discharged') NOT NULL DEFAULT 'in_labor',
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_labor_mat (maternity_patient_id),
      KEY idx_labor_status (status),
      CONSTRAINT fk_labor_mat FOREIGN KEY (maternity_patient_id) REFERENCES maternity_patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS partograph (
      id INT AUTO_INCREMENT PRIMARY KEY,
      labor_record_id INT NOT NULL,
      recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      time_label VARCHAR(10) NULL,
      cervical_dilation INT NULL,
      descent_station VARCHAR(10) NULL,
      contractions_in_10min INT NULL,
      contraction_duration INT NULL,
      fhr INT NULL,
      bp_systolic INT NULL,
      bp_diastolic INT NULL,
      pulse INT NULL,
      temperature DECIMAL(4,1) NULL,
      urine_volume INT NULL,
      urine_protein VARCHAR(10) NULL,
      urine_acetone VARCHAR(10) NULL,
      oxytocin_units INT NULL,
      oxytocin_drops INT NULL,
      drugs_given TEXT NULL,
      liquor VARCHAR(20) NULL,
      moulding VARCHAR(5) NULL,
      caput VARCHAR(5) NULL,
      alert_line_crossed TINYINT(1) NOT NULL DEFAULT 0,
      action_line_crossed TINYINT(1) NOT NULL DEFAULT 0,
      recorded_by INT NULL,
      notes TEXT NULL,
      KEY idx_parto_labor (labor_record_id),
      CONSTRAINT fk_parto_labor FOREIGN KEY (labor_record_id) REFERENCES labor_records(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS delivery_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      labor_record_id INT NOT NULL,
      maternity_patient_id INT NOT NULL,
      delivery_date_time DATETIME NULL,
      delivery_type ENUM('svd','vacuum','forceps','emergency_cs','elective_cs','breech') NOT NULL,
      cs_indication TEXT NULL,
      cs_type VARCHAR(30) NULL,
      anaesthesia_type VARCHAR(50) NULL,
      duration_of_labor INT NULL,
      duration_second_stage INT NULL,
      third_stage_management VARCHAR(100) NULL,
      placenta_delivery_method VARCHAR(50) NULL,
      placenta_complete TINYINT(1) NOT NULL DEFAULT 1,
      placenta_abnormality TEXT NULL,
      cord_vessels INT NULL DEFAULT 3,
      cord_abnormality TEXT NULL,
      episiotomy TINYINT(1) NOT NULL DEFAULT 0,
      episiotomy_type VARCHAR(50) NULL,
      perineal_tear_degree INT NULL,
      repair_done TINYINT(1) NOT NULL DEFAULT 0,
      blood_loss_estimated INT NULL,
      blood_transfusion TINYINT(1) NOT NULL DEFAULT 0,
      blood_units_transfused DECIMAL(3,1) NULL,
      oxytocin_given TINYINT(1) NOT NULL DEFAULT 1,
      ergometrine_given TINYINT(1) NOT NULL DEFAULT 0,
      complications TEXT NULL,
      outcome ENUM('live_birth','stillbirth','nnd','maternal_death') NOT NULL,
      delivered_by INT NULL,
      assistant INT NULL,
      surgeon INT NULL,
      anaesthetist INT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_del_mat (maternity_patient_id),
      KEY idx_del_labor (labor_record_id),
      CONSTRAINT fk_del_labor FOREIGN KEY (labor_record_id) REFERENCES labor_records(id) ON DELETE CASCADE,
      CONSTRAINT fk_del_mat FOREIGN KEY (maternity_patient_id) REFERENCES maternity_patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS newborn_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      delivery_record_id INT NOT NULL,
      maternity_patient_id INT NOT NULL,
      baby_number INT NOT NULL DEFAULT 1,
      time_of_birth DATETIME NULL,
      sex ENUM('male','female','indeterminate') NOT NULL,
      birth_weight DECIMAL(5,3) NOT NULL,
      birth_length DECIMAL(5,2) NULL,
      head_circumference DECIMAL(5,2) NULL,
      gestational_age_at_birth INT NULL,
      apgar_score_1min INT NOT NULL,
      apgar_score_5min INT NOT NULL,
      apgar_score_10min INT NULL,
      resuscitation_needed TINYINT(1) NOT NULL DEFAULT 0,
      resuscitation_type VARCHAR(100) NULL,
      birth_outcome ENUM('alive','fresh_stillbirth','macerated_stillbirth','early_nnd') NOT NULL,
      congenital_anomaly TINYINT(1) NOT NULL DEFAULT 0,
      anomaly_details TEXT NULL,
      vitamin_k_given TINYINT(1) NOT NULL DEFAULT 1,
      eye_prophylaxis_given TINYINT(1) NOT NULL DEFAULT 1,
      bcg_given TINYINT(1) NOT NULL DEFAULT 0,
      opv0_given TINYINT(1) NOT NULL DEFAULT 0,
      hep_b_given TINYINT(1) NOT NULL DEFAULT 0,
      breastfeeding_initiated TINYINT(1) NOT NULL DEFAULT 0,
      time_to_first_breastfeed INT NULL,
      cord_condition VARCHAR(50) NULL,
      baby_nicu_admission TINYINT(1) NOT NULL DEFAULT 0,
      nicu_reason TEXT NULL,
      neonatal_number VARCHAR(50) NULL,
      discharge_status VARCHAR(30) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_nb_del (delivery_record_id),
      CONSTRAINT fk_nb_del FOREIGN KEY (delivery_record_id) REFERENCES delivery_records(id) ON DELETE CASCADE,
      CONSTRAINT fk_nb_mat FOREIGN KEY (maternity_patient_id) REFERENCES maternity_patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS postnatal_visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      maternity_patient_id INT NOT NULL,
      delivery_record_id INT NULL,
      visit_date DATE NOT NULL,
      visit_type ENUM('day1','day3','day7','week6','other') NOT NULL,
      days_postpartum INT NULL,
      general_condition VARCHAR(50) NULL,
      bp_systolic INT NULL,
      bp_diastolic INT NULL,
      pulse INT NULL,
      temperature DECIMAL(4,1) NULL,
      weight DECIMAL(5,2) NULL,
      uterine_involution VARCHAR(50) NULL,
      lochia_type VARCHAR(30) NULL,
      lochia_amount VARCHAR(20) NULL,
      perineal_healing VARCHAR(50) NULL,
      cs_wound_healing VARCHAR(50) NULL,
      breast_condition VARCHAR(100) NULL,
      breastfeeding_status VARCHAR(50) NULL,
      bladder_bowel_function VARCHAR(100) NULL,
      mood_assessment VARCHAR(50) NULL,
      postpartum_depression_score INT NULL,
      anaemia_present TINYINT(1) NOT NULL DEFAULT 0,
      haemoglobin DECIMAL(4,1) NULL,
      baby_weight DECIMAL(5,3) NULL,
      baby_general_condition VARCHAR(50) NULL,
      baby_breastfeeding VARCHAR(50) NULL,
      baby_cord_condition VARCHAR(50) NULL,
      baby_jaundice TINYINT(1) NOT NULL DEFAULT 0,
      immunizations_given TEXT NULL,
      family_planning_counselled TINYINT(1) NOT NULL DEFAULT 0,
      family_planning_method VARCHAR(100) NULL,
      treatment_given TEXT NULL,
      referral_made TINYINT(1) NOT NULL DEFAULT 0,
      referral_reason TEXT NULL,
      next_appointment DATE NULL,
      attended_by INT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_pn_mat (maternity_patient_id),
      CONSTRAINT fk_pn_mat FOREIGN KEY (maternity_patient_id) REFERENCES maternity_patients(id) ON DELETE CASCADE,
      CONSTRAINT fk_pn_del FOREIGN KEY (delivery_record_id) REFERENCES delivery_records(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS maternal_complications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      maternity_patient_id INT NOT NULL,
      labor_record_id INT NULL,
      complication_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      phase ENUM('antenatal','intrapartum','postpartum') NOT NULL,
      complication_type VARCHAR(100) NULL,
      pre_eclampsia TINYINT(1) NOT NULL DEFAULT 0,
      eclampsia TINYINT(1) NOT NULL DEFAULT 0,
      antepartum_haemorrhage TINYINT(1) NOT NULL DEFAULT 0,
      postpartum_haemorrhage TINYINT(1) NOT NULL DEFAULT 0,
      sepsis TINYINT(1) NOT NULL DEFAULT 0,
      obstructed_labor TINYINT(1) NOT NULL DEFAULT 0,
      cord_prolapse TINYINT(1) NOT NULL DEFAULT 0,
      placenta_praevia TINYINT(1) NOT NULL DEFAULT 0,
      placental_abruption TINYINT(1) NOT NULL DEFAULT 0,
      ruptured_uterus TINYINT(1) NOT NULL DEFAULT 0,
      fistula TINYINT(1) NOT NULL DEFAULT 0,
      severity ENUM('mild','moderate','severe','life_threatening') NULL,
      description TEXT NULL,
      management_given TEXT NULL,
      outcome VARCHAR(50) NULL,
      blood_transfusion TINYINT(1) NOT NULL DEFAULT 0,
      icu_admission TINYINT(1) NOT NULL DEFAULT 0,
      surgery_performed TINYINT(1) NOT NULL DEFAULT 0,
      surgery_details TEXT NULL,
      reported_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_comp_mat (maternity_patient_id),
      CONSTRAINT fk_comp_mat FOREIGN KEY (maternity_patient_id) REFERENCES maternity_patients(id) ON DELETE CASCADE,
      CONSTRAINT fk_comp_labor FOREIGN KEY (labor_record_id) REFERENCES labor_records(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const { ensureMaternityIntegrationSchema } = require('./maternityIntegration');
  const { ensureMaternityBillingSchema } = require('./maternityBilling');
  const { ensureNewbornFlowSchema } = require('./maternityNewbornFlow');
  await ensureMaternityIntegrationSchema(pool);
  await ensureMaternityBillingSchema(pool);
  await ensureNewbornFlowSchema(pool);
};
