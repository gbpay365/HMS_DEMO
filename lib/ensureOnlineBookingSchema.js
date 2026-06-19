'use strict';

/**
 * Online appointment booking — types, slot metadata, doctor weekly hours.
 */
module.exports = async function ensureOnlineBookingSchema(pool) {
  if (pool && pool.driver === 'postgres') return;
  const q = (sql) =>
    pool.query(sql).catch((e) => {
      const msg = String(e.message || '');
      if (/Duplicate|already exists|ER_DUP/i.test(msg)) return;
      throw e;
    });

  await pool.query('ALTER TABLE tbl_appointment ADD COLUMN appointment_type VARCHAR(40) NULL').catch(() => {});
  await pool.query('ALTER TABLE tbl_appointment ADD COLUMN slot_start VARCHAR(12) NULL').catch(() => {});
  await pool.query('ALTER TABLE tbl_appointment ADD COLUMN duration_minutes INT NOT NULL DEFAULT 30').catch(() => {});

  await q(`
    CREATE TABLE IF NOT EXISTS tbl_booking_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(64) NOT NULL,
      setting_value VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_booking_setting (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS tbl_doctor_availability (
      id INT AUTO_INCREMENT PRIMARY KEY,
      doctor_id INT NOT NULL,
      weekday TINYINT NOT NULL COMMENT '0=Sun .. 6=Sat',
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      slot_minutes INT NOT NULL DEFAULT 30,
      active TINYINT(1) NOT NULL DEFAULT 1,
      KEY idx_doc_avail_doctor (doctor_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const defaults = [
    ['slot_start_hour', '8'],
    ['slot_end_hour', '17'],
    ['slot_interval_minutes', '30'],
    ['max_days_ahead', '60'],
    ['min_hours_notice', '2'],
    ['allow_same_day', '1'],
  ];
  for (const [k, v] of defaults) {
    await pool
      .query('INSERT IGNORE INTO tbl_booking_settings (setting_key, setting_value) VALUES (?, ?)', [k, v])
      .catch(() => {});
  }
};
