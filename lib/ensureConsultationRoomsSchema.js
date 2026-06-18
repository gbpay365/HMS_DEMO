'use strict';

/**
 * Consultation rooms (physical locations) + optional link on OPD visits.
 * Doctors are linked to rooms via tbl_consultation_room_doctor (many doctors per room for shifts / shared rooms).
 * tbl_consultation_room.assigned_doctor_id is kept as the primary seat for legacy code and simple displays.
 */
module.exports = async function ensureConsultationRoomsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_consultation_room (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      code VARCHAR(40) NOT NULL,
      name VARCHAR(160) NOT NULL,
      department VARCHAR(120) NULL,
      assigned_doctor_id INT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      status TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_room_facility_code (facility_id, code),
      KEY idx_room_facility (facility_id, status),
      KEY idx_room_doctor (assigned_doctor_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await pool
    .query(
      `
    CREATE TABLE IF NOT EXISTS tbl_consultation_room_doctor (
      room_id INT NOT NULL,
      doctor_id INT NOT NULL,
      PRIMARY KEY (room_id, doctor_id),
      KEY idx_crd_doctor (doctor_id),
      KEY idx_crd_room (room_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `
    )
    .catch(() => {});

  try {
    await pool.query(`
      INSERT IGNORE INTO tbl_consultation_room_doctor (room_id, doctor_id)
      SELECT id, assigned_doctor_id
        FROM tbl_consultation_room
       WHERE assigned_doctor_id IS NOT NULL AND assigned_doctor_id > 0
    `);
  } catch (_) {
    /* ignore if table missing or column mismatch */
  }

  const addVisitCol = async (sql) => {
    try {
      await pool.query(sql);
    } catch (e) {
      const msg = String(e.message || '');
      const dup = e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060 ||
        /Duplicate column/i.test(msg) || /already exists/i.test(msg);
      if (!dup) throw e;
    }
  };
  await addVisitCol('ALTER TABLE tbl_opd_visit ADD COLUMN consultation_room_id INT NULL');
  await addVisitCol('ALTER TABLE tbl_opd_visit ADD COLUMN transferred_to_room_at DATETIME NULL');
};
