'use strict';

/** Laboratory LIMS tables (Odoo ACS HMS–style requests, samples, panels). */
module.exports = async function ensureLabLimsSchema(pool) {
  const sq = (s, p = []) => pool.query(s, p);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_collection_center (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      notes VARCHAR(500) DEFAULT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_sample_type (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      container_hint VARCHAR(200) DEFAULT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_test_group (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(40) DEFAULT NULL,
      name VARCHAR(160) NOT NULL,
      description VARCHAR(500) DEFAULT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_test_group_line (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      catalog_id INT DEFAULT NULL,
      test_name VARCHAR(255) NOT NULL,
      template_test_id VARCHAR(80) DEFAULT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      KEY idx_group (group_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_request (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      request_no VARCHAR(32) DEFAULT NULL,
      patient_id INT NOT NULL,
      prescribing_doctor_id INT DEFAULT NULL,
      collection_center_id INT DEFAULT NULL,
      test_group_id INT DEFAULT NULL,
      scheduled_date DATE NOT NULL,
      scheduled_time TIME DEFAULT NULL,
      is_group_request TINYINT(1) NOT NULL DEFAULT 0,
      status ENUM('submitted','accepted','in_progress','done','cancelled') NOT NULL DEFAULT 'submitted',
      notes TEXT DEFAULT NULL,
      created_by INT DEFAULT NULL,
      accepted_at DATETIME DEFAULT NULL,
      completed_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_patient (patient_id),
      KEY idx_status (status),
      KEY idx_scheduled (scheduled_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_request_line (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      catalog_id INT DEFAULT NULL,
      test_name VARCHAR(255) NOT NULL,
      template_test_id VARCHAR(80) DEFAULT NULL,
      lab_result_id INT DEFAULT NULL,
      line_status ENUM('pending','sample_collected','in_progress','done','cancelled') NOT NULL DEFAULT 'pending',
      sort_order INT NOT NULL DEFAULT 0,
      KEY idx_request (request_id),
      KEY idx_lab_result (lab_result_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_sample (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      request_line_id INT DEFAULT NULL,
      sample_type_id INT DEFAULT NULL,
      container_no VARCHAR(80) DEFAULT NULL,
      status ENUM('pending','collected','examined') NOT NULL DEFAULT 'pending',
      collected_at DATETIME DEFAULT NULL,
      examined_at DATETIME DEFAULT NULL,
      collected_by INT DEFAULT NULL,
      notes VARCHAR(500) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_request (request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await sq(`
    CREATE TABLE IF NOT EXISTS tbl_lab_consumed_material (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_line_id INT NOT NULL,
      description VARCHAR(255) NOT NULL,
      quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
      unit VARCHAR(40) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_line (request_line_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const centers = [['Main laboratory', null], ['OPD collection point', null], ['Emergency desk', null]];
  for (const [name, notes] of centers) {
    await sq(
      `INSERT IGNORE INTO tbl_lab_collection_center (name, notes, active) SELECT ?, ?, 1 FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM tbl_lab_collection_center WHERE name=? LIMIT 1)`,
      [name, notes, name]
    ).catch(() => {});
  }

  const sampleTypes = [
    ['EDTA blood', 'Purple top tube', 10],
    ['Serum', 'Red/gold top', 20],
    ['Urine', 'Sterile container', 30],
    ['Citrate', 'Blue top', 40],
  ];
  for (const [name, hint, ord] of sampleTypes) {
    await sq(
      `INSERT IGNORE INTO tbl_lab_sample_type (name, container_hint, sort_order, active)
       SELECT ?, ?, ?, 1 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tbl_lab_sample_type WHERE name=? LIMIT 1)`,
      [name, hint, ord, name]
    ).catch(() => {});
  }

  const [[hasGroup]] = await sq(`SELECT id FROM tbl_lab_test_group WHERE code='FBC' LIMIT 1`).catch(() => [[null]]);
  if (!hasGroup) {
    const [ins] = await sq(
      `INSERT INTO tbl_lab_test_group (code, name, description, active) VALUES ('FBC','Full blood count panel','CBC group',1)`
    );
    const gid = ins.insertId;
    const tests = [
      [1, 'Numération formule sanguine complète', null, 10],
      [2, 'Hémoglobine', null, 11],
      [3, 'Globules blancs', null, 12],
      [4, 'Plaquettes', null, 13],
    ];
    for (const [cid, tname, tpl, ord] of tests) {
      await sq(
        `INSERT INTO tbl_lab_test_group_line (group_id, catalog_id, test_name, template_test_id, sort_order) VALUES (?,?,?,?,?)`,
        [gid, cid, tname, tpl, ord]
      );
    }
  }
};
