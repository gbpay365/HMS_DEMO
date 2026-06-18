'use strict';

let ready = false;

/**
 * Extend tbl_doctor_duty_schedule with clinic hours, room, department.
 * Optional swap-request table for doctor self-service (Phase 3).
 */
async function ensureDoctorDutySchema(pool) {
  if (ready) return;
  const alters = [
    'ALTER TABLE tbl_doctor_duty_schedule ADD COLUMN start_time TIME NULL DEFAULT NULL',
    'ALTER TABLE tbl_doctor_duty_schedule ADD COLUMN end_time TIME NULL DEFAULT NULL',
    'ALTER TABLE tbl_doctor_duty_schedule ADD COLUMN consultation_room_id INT NULL DEFAULT NULL',
    'ALTER TABLE tbl_doctor_duty_schedule ADD COLUMN department VARCHAR(120) NULL DEFAULT NULL',
    'ALTER TABLE tbl_opd_visit ADD COLUMN consultation_started_at DATETIME NULL DEFAULT NULL',
    'ALTER TABLE tbl_appointment ADD COLUMN opd_visit_id INT NULL DEFAULT NULL',
  ];
  for (const sql of alters) {
    try {
      await pool.query(sql);
    } catch (_) {
      /* column exists */
    }
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_doctor_duty_swap_request (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL DEFAULT 1,
        requester_id INT NOT NULL,
        partner_id INT NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        note VARCHAR(500) NULL,
        status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
        reviewed_by INT NULL,
        reviewed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_swap_facility_status (facility_id, status),
        KEY idx_swap_requester (requester_id, from_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (_) {
    /* table exists */
  }
  ready = true;
}

module.exports = { ensureDoctorDutySchema };
