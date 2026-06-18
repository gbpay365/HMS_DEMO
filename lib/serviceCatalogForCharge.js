'use strict';

const { imagingCategoryWhere, LEGACY_IMAGING_CATEGORIES } = require('./scansImagingCatalog');

/** Bill-section keys (Add Charge modal) → service-catalog category values. */
const SECTION_CATEGORY_MAP = {
  consultation: ['consultation'],
  service: ['service', 'general', 'procedure'],
  ward: ['ward'],
  laboratory: ['laboratory'],
  radiology: LEGACY_IMAGING_CATEGORIES,
  scan: LEGACY_IMAGING_CATEGORIES,
  scans_imaging: LEGACY_IMAGING_CATEGORIES,
};

function categoriesForChargeSection(section) {
  const key = String(section || '').trim().toLowerCase();
  if (!key) return [];
  if (SECTION_CATEGORY_MAP[key]) return SECTION_CATEGORY_MAP[key].slice();
  return [key];
}

function isImagingChargeSection(section) {
  const key = String(section || '').trim().toLowerCase();
  return key === 'radiology' || key === 'scan' || key === 'scans_imaging';
}

function isWardChargeSection(section) {
  return String(section || '').trim().toLowerCase() === 'ward';
}

/** Nursing & ward tariffs are seeded under category `service` (NW* CPT / department name). */
function wardCatalogWhere(alias = '') {
  const cat = alias ? `${alias}.category` : 'category';
  const dept = alias ? `${alias}.department_name` : 'department_name';
  const cpt = alias ? `${alias}.cpt_code` : 'cpt_code';
  return `(
    LOWER(TRIM(${cat})) = 'ward'
    OR (
      LOWER(TRIM(${cat})) = 'service'
      AND (
        UPPER(TRIM(COALESCE(${cpt}, ''))) LIKE 'NW%'
        OR LOWER(TRIM(COALESCE(${dept}, ''))) = 'nursing & ward services'
      )
    )
  )`;
}

/**
 * Active catalog rows for IPD / ER Add Charge bill sections.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} section
 */
async function fetchCatalogForChargeSection(pool, section) {
  const key = String(section || '').trim().toLowerCase();
  if (!key) return [];

  if (isImagingChargeSection(key)) {
    const [rows] = await pool
      .query(
        `SELECT id, name, price FROM tbl_service_catalog WHERE status = 1 AND ${imagingCategoryWhere()} ORDER BY name`
      )
      .catch(() => [[]]);
    return rows || [];
  }

  if (isWardChargeSection(key)) {
    const [rows] = await pool
      .query(
        `SELECT id, name, price FROM tbl_service_catalog
         WHERE status = 1 AND ${wardCatalogWhere()}
         ORDER BY name`
      )
      .catch(() => [[]]);
    return rows || [];
  }

  const cats = categoriesForChargeSection(key);
  if (!cats.length) return [];

  const placeholders = cats.map(() => '?').join(', ');
  const [rows] = await pool
    .query(
      `SELECT id, name, price FROM tbl_service_catalog
       WHERE status = 1 AND LOWER(TRIM(category)) IN (${placeholders})
       ORDER BY name`,
      cats
    )
    .catch(() => [[]]);
  return rows || [];
}

module.exports = {
  categoriesForChargeSection,
  fetchCatalogForChargeSection,
  isImagingChargeSection,
  isWardChargeSection,
  wardCatalogWhere,
};
