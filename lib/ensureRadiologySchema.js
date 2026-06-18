'use strict';

/**
 * Radiology module — requests, test groups, rooms (Odoo-style workflow).
 * Idempotent; safe on every boot.
 */
module.exports = async function ensureRadiologySchema(pool) {
  if (pool && pool.driver === 'postgres') return;
  const q = (sql) =>
    pool.query(sql).catch((e) => {
      const msg = String(e.message || '');
      if (/Duplicate|already exists|ER_DUP/i.test(msg)) return;
      throw e;
    });

  await q(`
    CREATE TABLE IF NOT EXISTS tbl_radiology_room (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(20) NOT NULL,
      name VARCHAR(120) NOT NULL,
      modality VARCHAR(40) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_rad_room_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS tbl_radiology_test_group (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(255) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS tbl_radiology_test_group_line (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      exam_name VARCHAR(200) NOT NULL,
      modality VARCHAR(40) NULL,
      body_part VARCHAR(80) NULL,
      service_catalog_id INT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      KEY idx_rad_tgl_group (group_id),
      CONSTRAINT fk_rad_tgl_group FOREIGN KEY (group_id)
        REFERENCES tbl_radiology_test_group(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS tbl_radiology_request (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_no VARCHAR(32) NOT NULL,
      patient_id INT NOT NULL,
      status ENUM('draft','submitted','accepted','in_progress','done','cancelled') NOT NULL DEFAULT 'draft',
      scheduled_at DATETIME NULL,
      referred_by_id INT NULL,
      room_id INT NULL,
      test_group_id INT NULL,
      is_group_request TINYINT(1) NOT NULL DEFAULT 0,
      group_patient_ids JSON NULL,
      notes TEXT NULL,
      invoice_ref VARCHAR(64) NULL,
      created_by INT NULL,
      submitted_at DATETIME NULL,
      accepted_at DATETIME NULL,
      completed_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_rad_req_no (request_no),
      KEY idx_rad_req_patient (patient_id),
      KEY idx_rad_req_status (status),
      KEY idx_rad_req_sched (scheduled_at),
      CONSTRAINT fk_rad_req_patient FOREIGN KEY (patient_id) REFERENCES tbl_patient(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query('ALTER TABLE tbl_radiology_result ADD COLUMN request_id INT NULL').catch(() => {});
  await pool.query('ALTER TABLE tbl_radiology_result ADD COLUMN room_id INT NULL').catch(() => {});
  await pool.query('ALTER TABLE tbl_radiology_result ADD COLUMN scheduled_at DATETIME NULL').catch(() => {});
  await pool.query('ALTER TABLE tbl_radiology_result ADD COLUMN line_sort INT NOT NULL DEFAULT 0').catch(() => {});
  await pool
    .query('CREATE INDEX idx_rad_result_request ON tbl_radiology_result (request_id)')
    .catch(() => {});

  const [[roomCnt]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_radiology_room').catch(() => [[{ c: 1 }]]);
  if (Number(roomCnt?.c || 0) === 0) {
    await q(`
      INSERT INTO tbl_radiology_room (code, name, modality, active) VALUES
      ('XR-A', 'Room A — General X-Ray', 'X-Ray', 1),
      ('US-B', 'Room B — Ultrasound', 'Ultrasound', 1),
      ('CT-1', 'CT Suite', 'CT', 1),
      ('MRI-1', 'MRI Suite', 'MRI', 1)
    `);
  }

  const [[grpCnt]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_radiology_test_group').catch(() => [[{ c: 1 }]]);
  if (Number(grpCnt?.c || 0) === 0) {
    const [g1] = await pool.query(
      `INSERT INTO tbl_radiology_test_group (name, description, active) VALUES ('Chest workup', 'PA chest + lateral views', 1)`
    );
    const [g2] = await pool.query(
      `INSERT INTO tbl_radiology_test_group (name, description, active) VALUES ('Abdominal imaging', 'KUB + ultrasound abdomen', 1)`
    );
    const [g3] = await pool.query(
      `INSERT INTO tbl_radiology_test_group (name, description, active) VALUES ('Trauma CT bundle', 'CT head + chest + abdomen/pelvis', 1)`
    );
    const id1 = g1.insertId;
    const id2 = g2.insertId;
    const id3 = g3.insertId;
    const lines = [
      [id1, 'Chest X-Ray (PA)', 'X-Ray', 'Chest', 0],
      [id1, 'Chest X-Ray (Lateral)', 'X-Ray', 'Chest', 1],
      [id2, 'Abdomen X-Ray (KUB)', 'X-Ray', 'Abdomen', 0],
      [id2, 'Ultrasound Abdomen', 'Ultrasound', 'Abdomen', 1],
      [id3, 'CT Head (non-contrast)', 'CT', 'Head', 0],
      [id3, 'CT Chest (contrast)', 'CT', 'Chest', 1],
      [id3, 'CT Abdomen/Pelvis (contrast)', 'CT', 'Abdomen', 2],
    ];
    for (const row of lines) {
      await pool
        .query(
          `INSERT INTO tbl_radiology_test_group_line (group_id, exam_name, modality, body_part, sort_order) VALUES (?, ?, ?, ?, ?)`,
          row
        )
        .catch(() => {});
    }
  }
};
