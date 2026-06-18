'use strict';

/** Legacy global deployment modes (super-admin.ejs). */
const PRODUCT_MODES = Object.freeze([
  'full',
  'hms',
  'accounting',
  'leave_attendance',
  'payroll',
  'inventory',
  'procurement',
]);

const PRODUCT_MODE_LABELS = Object.freeze({
  full: 'Full Suite',
  hms: 'HMS',
  accounting: 'Accounting',
  leave_attendance: 'Leave & Attendance',
  payroll: 'Payroll',
  inventory: 'Inventory',
  procurement: 'Procurement',
});

function productModeLabel(mode) {
  const key = String(mode || '').trim();
  return PRODUCT_MODE_LABELS[key] || key || 'Full Suite';
}

function isValidProductMode(mode) {
  return PRODUCT_MODES.includes(String(mode || '').trim());
}

/** JSON array stored in tbl_app_settings.product_slices for a legacy product_mode. */
function productSlicesForMode(mode) {
  const m = String(mode || '').trim();
  if (m === 'full') return ['full'];
  if (m === 'procurement') return ['inventory', 'procurement'];
  return [m];
}

/** Derive legacy product_mode key from stored slice list (keeps UI in sync with profiles). */
function legacyModeFromSlices(slicesInput) {
  let list = slicesInput;
  if (typeof slicesInput === 'string') {
    try {
      list = JSON.parse(slicesInput);
    } catch (_) {
      list = ['full'];
    }
  }
  if (!Array.isArray(list) || !list.length) return 'full';
  if (list.includes('full')) return 'full';
  if (list.includes('procurement')) return 'procurement';
  if (list.length === 1 && list[0] === 'inventory') return 'inventory';
  const primary = list.find((s) => s !== 'inventory');
  if (primary && isValidProductMode(primary)) return primary;
  return 'full';
}

async function loadAppSettings(pool) {
  const [rows] = await pool.query(
    `SELECT id, product_mode, product_slices, active_deployment_profile_id,
            active_deployment_profile_ids, legacy_modules_json
       FROM tbl_app_settings WHERE id=1 LIMIT 1`
  ).catch(() => [[]]);
  if (rows && rows[0]) {
    const row = rows[0];
    let hasProfiles = false;
    try {
      const arr = JSON.parse(row.active_deployment_profile_ids || '[]');
      hasProfiles = Array.isArray(arr) && arr.length > 0;
    } catch (_) {}
    if (!row.active_deployment_profile_id && !hasProfiles) {
      const derived = legacyModeFromSlices(row.product_slices || row.product_mode);
      if (derived && derived !== row.product_mode) {
        await pool
          .query('UPDATE tbl_app_settings SET product_mode = ? WHERE id = 1', [derived])
          .catch(() => {});
        row.product_mode = derived;
        if (!row.product_slices) {
          row.product_slices = JSON.stringify(productSlicesForMode(derived));
        }
      }
    }
    return row;
  }
  const slices = JSON.stringify(productSlicesForMode('full'));
  await pool.query(
    'INSERT INTO tbl_app_settings (id, product_mode, product_slices) VALUES (1, ?, ?)',
    ['full', slices]
  ).catch(() => {});
  return {
    id: 1,
    product_mode: 'full',
    product_slices: slices,
    active_deployment_profile_id: null,
    active_deployment_profile_ids: null,
  };
}

async function saveLegacyProductMode(pool, mode) {
  const slicesJson = JSON.stringify(productSlicesForMode(mode));
  await pool.query(
    `INSERT INTO tbl_app_settings (id, product_mode, product_slices, active_deployment_profile_id)
     VALUES (1, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE
       product_mode = VALUES(product_mode),
       product_slices = VALUES(product_slices),
       active_deployment_profile_id = NULL`,
    [mode, slicesJson]
  );
  return slicesJson;
}

module.exports = {
  PRODUCT_MODES,
  PRODUCT_MODE_LABELS,
  productModeLabel,
  isValidProductMode,
  productSlicesForMode,
  legacyModeFromSlices,
  loadAppSettings,
  saveLegacyProductMode,
};
