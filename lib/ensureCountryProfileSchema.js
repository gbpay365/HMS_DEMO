'use strict';

const catalog = require('./countryProfileCatalog');

async function ensureCountryProfileSchema(pool) {
  if (pool && pool.driver === 'postgres') return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_hms_country_profile (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code CHAR(2) NOT NULL,
      name VARCHAR(120) NOT NULL,
      profile_json LONGTEXT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 0,
      applied_at TIMESTAMP NULL,
      applied_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_hms_country_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const addCol = async (col, def) => {
    const [ex] = await pool.query(`SHOW COLUMNS FROM tbl_app_settings LIKE ?`, [col]).catch(() => [[]]);
    if (!ex || !ex.length) {
      await pool.query(`ALTER TABLE tbl_app_settings ADD COLUMN ${col} ${def}`).catch(() => {});
    }
  };
  await addCol('active_country_code', "CHAR(2) NULL COMMENT 'NG or CM — runtime country profile'");

  for (const profile of catalog.listProfiles()) {
    const json = JSON.stringify(profile);
    const [ex] = await pool.query('SELECT id FROM tbl_hms_country_profile WHERE code=? LIMIT 1', [profile.code]);
    if (ex && ex.length) {
      await pool.query('UPDATE tbl_hms_country_profile SET name=?, profile_json=? WHERE code=?', [
        profile.name,
        json,
        profile.code,
      ]);
    } else {
      await pool.query(
        'INSERT INTO tbl_hms_country_profile (code, name, profile_json, is_active) VALUES (?, ?, ?, 0)',
        [profile.code, profile.name, json]
      );
    }
  }

  const defaultCode = catalog.envDefaultCode();
  const [[appRow]] = await pool.query('SELECT active_country_code FROM tbl_app_settings WHERE id=1 LIMIT 1').catch(() => [[{}]]);
  if (!appRow || !appRow.active_country_code) {
    await pool
      .query(
        'INSERT INTO tbl_app_settings (id, product_mode, product_slices, active_country_code) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE active_country_code = VALUES(active_country_code)',
        ['full', JSON.stringify(['full']), defaultCode]
      )
      .catch(async () => {
        await pool.query('UPDATE tbl_app_settings SET active_country_code=? WHERE id=1', [defaultCode]).catch(() => {});
      });
    await pool.query('UPDATE tbl_hms_country_profile SET is_active=0');
    await pool.query('UPDATE tbl_hms_country_profile SET is_active=1 WHERE code=?', [defaultCode]);
  }
}

module.exports = { ensureCountryProfileSchema };
