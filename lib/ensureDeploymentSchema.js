'use strict';

const { productSlicesForMode, PRODUCT_MODES } = require('./appProductMode');
const { parseSlicesJson } = require('./aclNavSlices');

/**
 * Ensures tbl_hms_deployment_profile exists and seeds named profiles
 * matching legacy product_mode bundles.
 */
async function ensureDeploymentSchema(pool) {
  if (pool && pool.driver === 'postgres') return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_hms_deployment_profile (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      slices_json TEXT NOT NULL,
      modules_json TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_hms_dp_name (name(64))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const profileRenames = [
    ['Clinical HMS', 'HMS'],
    ['Accounting Only', 'Accounting'],
    ['Inventory / Catalog', 'Inventory'],
  ];
  for (const [oldName, newName] of profileRenames) {
    await pool.query('UPDATE tbl_hms_deployment_profile SET name=? WHERE name=?', [
      newName,
      oldName,
    ]);
  }

  const seeds = [
    ['Full Suite', JSON.stringify(['full']), null],
    ['HMS', JSON.stringify(['hms']), null],
    ['Accounting', JSON.stringify(['accounting']), null],
    ['Leave & Attendance', JSON.stringify(['leave_attendance']), null],
    ['Payroll', JSON.stringify(['payroll']), null],
    ['Inventory', JSON.stringify(['inventory']), null],
    ['Procurement', JSON.stringify(['inventory', 'procurement']), null],
  ];

  const addCol = async (col, def) => {
    const [ex] = await pool.query(`SHOW COLUMNS FROM tbl_app_settings LIKE ?`, [col]).catch(() => [[]]);
    if (!ex || !ex.length) {
      await pool.query(`ALTER TABLE tbl_app_settings ADD COLUMN ${col} ${def}`).catch(() => {});
    }
  };
  await addCol(
    'legacy_modules_json',
    "TEXT NULL COMMENT 'JSON nav overrides for legacy global mode'"
  );
  await addCol(
    'active_deployment_profile_ids',
    "TEXT NULL COMMENT 'JSON array of tbl_hms_deployment_profile.id — merged for end users'"
  );

  for (const [name, slicesJson, modulesJson] of seeds) {
    const [ex] = await pool.query(
      'SELECT id FROM tbl_hms_deployment_profile WHERE name=? LIMIT 1',
      [name]
    );
    if (ex && ex.length) continue;
    await pool.query(
      'INSERT INTO tbl_hms_deployment_profile (name, slices_json, modules_json) VALUES (?, ?, ?)',
      [name, slicesJson, modulesJson]
    );
  }

  // Link legacy product_mode labels to profile names for display.
  return true;
}

/** Find profile id for a legacy product_mode key (after seed). */
async function profileIdForLegacyMode(pool, mode) {
  const map = {
    full: 'Full Suite',
    hms: 'HMS',
    accounting: 'Accounting',
    leave_attendance: 'Leave & Attendance',
    payroll: 'Payroll',
    inventory: 'Inventory',
    procurement: 'Procurement',
  };
  const name = map[String(mode || '').trim()];
  if (!name) return null;
  const [rows] = await pool.query(
    'SELECT id FROM tbl_hms_deployment_profile WHERE name=? LIMIT 1',
    [name]
  );
  return rows[0]?.id || null;
}

module.exports = { ensureDeploymentSchema, profileIdForLegacyMode, PRODUCT_MODES };
