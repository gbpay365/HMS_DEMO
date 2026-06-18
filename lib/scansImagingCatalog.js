'use strict';

/** Unified service-catalog category for radiology + advanced scan tariffs. */
const SCANS_IMAGING_CATEGORY = 'scans_imaging';
const SCANS_IMAGING_LABEL = 'Scans & Imaging';
const LEGACY_IMAGING_CATEGORIES = ['radiology', 'scan', SCANS_IMAGING_CATEGORY];

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Loose key for duplicate detection (strips parentheticals, normalizes x-ray). */
function normNameKey(s) {
  return normName(s)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bx\s*ray\b/g, 'xray')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRadiologySourceRow(row) {
  const cat = String(row.category || '').toLowerCase().trim();
  if (cat === 'radiology') return true;
  const code = String(row.cpt_code || '').toUpperCase();
  if (/^SCN\d{3}$/.test(code)) return false;
  if (/^(US_|XR_|SP_|ECG)/.test(code)) return true;
  if (cat === 'scan') return false;
  if (cat === SCANS_IMAGING_CATEGORY && /^SCN\d{3}$/.test(code)) return false;
  if (cat === SCANS_IMAGING_CATEGORY && /^(US_|XR_|SP_|ECG)/.test(code)) return true;
  return cat !== 'scan';
}

/** Lower rank = preferred winner when duplicate names exist (radiology beats scan). */
function imagingWinnerRank(row) {
  const cat = String(row.category || '').toLowerCase().trim();
  if (cat === 'radiology') return 0;
  if (isRadiologySourceRow(row) && cat !== 'scan') return 1;
  if (cat === SCANS_IMAGING_CATEGORY && isRadiologySourceRow(row)) return 2;
  if (cat === SCANS_IMAGING_CATEGORY) return 3;
  if (cat === 'scan') return 5;
  return 4;
}

function pickImagingWinner(rows) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return null;
  return list.slice().sort((a, b) => {
    const d = imagingWinnerRank(a) - imagingWinnerRank(b);
    if (d !== 0) return d;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  })[0];
}

function imagingCategorySqlIn() {
  return LEGACY_IMAGING_CATEGORIES.map((c) => `'${c}'`).join(', ');
}

function imagingCategoryWhere(alias) {
  const col = alias ? `${alias}.category` : 'category';
  return `LOWER(TRIM(${col})) IN (${imagingCategorySqlIn()})`;
}

/**
 * Merge radiology + scan catalog rows into scans_imaging; dedupe by name (radiology price wins).
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ facilityId?: number, hardDelete?: boolean }} [opts]
 */
async function mergeScansImagingCatalog(pool, opts = {}) {
  const hardDelete = opts.hardDelete !== false;
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  const [rows] = await pool.query(
    `SELECT id, name, price, category, cpt_code, department_name, subcategory, description,
            sort_order, status, facility_id
     FROM tbl_service_catalog
     WHERE ${imagingCategoryWhere()}
       AND facility_id = ?`,
    [facilityId]
  );

  const groups = new Map();
  for (const row of rows || []) {
    const key = normNameKey(row.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let winnersUpdated = 0;
  let duplicatesRemoved = 0;

  for (const group of groups.values()) {
    const active = group.filter((r) => Number(r.status) === 1);
    const poolRows = active.length ? active : group;
    const radRows = poolRows.filter(isRadiologySourceRow);
    const winner = radRows[0] || poolRows[0];
    if (!winner) continue;

    const price = radRows.length
      ? Math.max(...radRows.map((r) => parseFloat(r.price) || 0))
      : parseFloat(winner.price) || 0;
    const department = String(
      (radRows[0] || winner).department_name || (radRows[0] || winner).subcategory || SCANS_IMAGING_LABEL
    ).trim();
    const subcategory = String((radRows[0] || winner).subcategory || department).trim();

    await pool.query(
      `UPDATE tbl_service_catalog
       SET category = ?, subcategory = ?, department_name = ?, price = ?, status = 1
       WHERE id = ? LIMIT 1`,
      [SCANS_IMAGING_CATEGORY, subcategory, department, price, winner.id]
    );
    winnersUpdated++;

    for (const row of group) {
      if (row.id === winner.id) continue;
      if (Number(row.status) === 0 && String(row.category).toLowerCase() === SCANS_IMAGING_CATEGORY) continue;
      await pool.query('UPDATE tbl_service_catalog SET status = 0 WHERE id = ? LIMIT 1', [row.id]);
      duplicatesRemoved++;
    }
  }

  return {
    totalRows: (rows || []).length,
    uniqueServices: groups.size,
    winnersUpdated,
    duplicatesRemoved,
  };
}

module.exports = {
  SCANS_IMAGING_CATEGORY,
  SCANS_IMAGING_LABEL,
  LEGACY_IMAGING_CATEGORIES,
  normName,
  normNameKey,
  isRadiologySourceRow,
  imagingWinnerRank,
  pickImagingWinner,
  imagingCategorySqlIn,
  imagingCategoryWhere,
  mergeScansImagingCatalog,
};
