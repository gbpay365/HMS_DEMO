'use strict';

/**
 * Nursing & ward services tariff (XAF) — Service Catalog (category: service).
 * Source: standard nursing & ward price list (SN 1–25).
 */
const NURSING_WARD_CATALOG_2026 = [
  { sn: 1, name: 'Cannula Insertion / Removal', price: 500, code: 'NW_CANNULA' },
  { sn: 2, name: 'Change of Soiled Linen', price: 500, code: 'NW_LINEN' },
  { sn: 3, name: 'Bed Making', price: 500, code: 'NW_BED_MAKE' },
  { sn: 4, name: 'Insertion of Foley Catheter', price: 2000, code: 'NW_FOLEY_INS' },
  { sn: 5, name: 'Placement of Freedom Catheter', price: 1500, code: 'NW_FREEDOM_CAT' },
  { sn: 6, name: 'Collection of Lab Specimen', price: 500, code: 'NW_LAB_SPEC' },
  { sn: 7, name: 'Turning of Patient in Bed', price: 500, code: 'NW_TURN_PAT' },
  { sn: 8, name: 'Removal of Catheter', price: 1000, code: 'NW_CATH_REM' },
  {
    sn: 9,
    name: 'Alcohol Dressing (Minor)',
    price: 500,
    code: 'NW_ALC_MIN',
    notes: 'Simple/small wound',
  },
  {
    sn: 10,
    name: 'Alcohol Dressing (Major)',
    price: 2000,
    code: 'NW_ALC_MAJ',
    notes: 'Complex/large wound',
  },
  { sn: 11, name: 'Bed Bath', price: 2500, code: 'NW_BED_BATH' },
  { sn: 12, name: 'Shower Bath', price: 2000, code: 'NW_SHOWER' },
  { sn: 13, name: 'Suctioning', price: 5000, code: 'NW_SUCTION' },
  { sn: 14, name: 'Minor Wound Dressing', price: 500, code: 'NW_WND_MIN' },
  { sn: 15, name: 'Major Wound Dressing', price: 1500, code: 'NW_WND_MAJ' },
  { sn: 16, name: 'Last Offices', price: 3000, code: 'NW_LAST_OFF', notes: 'Post-mortem care' },
  { sn: 17, name: 'Insertion of Nasogastric Tube (NGT)', price: 3000, code: 'NW_NGT' },
  {
    sn: 18,
    name: 'Nursing Care — Below 5 Days',
    price: 2000,
    code: 'NW_CARE_LT5',
    notes: 'Per stay',
  },
  { sn: 19, name: 'General Ward — First Day', price: 5000, code: 'NW_GW_DAY1' },
  {
    sn: 20,
    name: 'General Ward — Subsequent Days',
    price: 2000,
    code: 'NW_GW_DAYN',
    notes: 'Per day',
  },
  { sn: 21, name: 'Private Ward', price: 20000, code: 'NW_PRIVATE', notes: 'Per day' },
  { sn: 22, name: 'Utilities', price: 2500, code: 'NW_UTIL' },
  { sn: 23, name: 'Booklets / Patient File', price: 500, code: 'NW_BOOKLET' },
];

/** Consultation tariffs mistakenly bundled in older nursing price lists — not ward services. */
const RETIRED_NURSING_CONSULT_CPT = ['NW_GEN_CONS', 'NW_SPEC_CONS'];

const DEPARTMENT = 'Nursing & Ward Services';
const SUBCATEGORY = 'Nursing & Ward Services';

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cptForItem(item) {
  if (item.code) return String(item.code).slice(0, 20);
  const sn = parseInt(item.sn, 10) || 0;
  return `NW${String(sn).padStart(3, '0')}`;
}

/**
 * Upsert nursing & ward rows into tbl_service_catalog (category: service).
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ deactivateMissing?: boolean, facilityId?: number }} [opts]
 */
async function seedNursingWardServiceCatalog(pool, opts = {}) {
  const category = 'service';
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  let inserted = 0;
  let updated = 0;

  const [existing] = await pool.query(
    `SELECT id, name, price, department_name, status, cpt_code, facility_id, description
     FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = ? AND facility_id = ?
       AND (
         LOWER(TRIM(department_name)) = LOWER(?)
         OR cpt_code LIKE 'NW%'
       )`,
    [category, facilityId, DEPARTMENT]
  );
  const byName = new Map();
  const byCpt = new Map();
  for (const row of existing || []) {
    byName.set(normName(row.name), row);
    if (row.cpt_code) byCpt.set(String(row.cpt_code), row);
  }

  const seededNames = new Set();

  for (const item of NURSING_WARD_CATALOG_2026) {
    const name = String(item.name).trim();
    const key = normName(name);
    seededNames.add(key);
    const price = Math.max(0, parseInt(item.price, 10) || 0);
    const sortSn = parseInt(item.sn, 10) || 0;
    const cptCode = cptForItem(item);
    const description = item.notes ? String(item.notes).trim() : null;

    const prev = byCpt.get(cptCode) || byName.get(key);
    if (prev) {
      await pool.query(
        `UPDATE tbl_service_catalog
         SET category = ?, subcategory = ?, name = ?, department_name = ?, cpt_code = ?,
             price = ?, description = ?, status = 1, sort_order = ?, currency = 'XAF'
         WHERE id = ? LIMIT 1`,
        [category, SUBCATEGORY, name, DEPARTMENT, cptCode, price, description, sortSn, prev.id]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO tbl_service_catalog
         (facility_id, category, subcategory, name, department_name, cpt_code, price, currency, status, sort_order, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'XAF', 1, ?, ?)`,
        [facilityId, category, SUBCATEGORY, name, DEPARTMENT, cptCode, price, sortSn, description]
      );
      inserted++;
    }
  }

  let retiredConsults = 0;
  for (const cpt of RETIRED_NURSING_CONSULT_CPT) {
    const [r] = await pool.query(
      `UPDATE tbl_service_catalog SET status = 0
       WHERE cpt_code = ? AND LOWER(TRIM(category)) = 'service' AND status = 1`,
      [cpt]
    );
    retiredConsults += r.affectedRows || 0;
  }

  let deactivated = 0;
  if (opts.deactivateMissing) {
    for (const row of existing || []) {
      if (seededNames.has(normName(row.name))) continue;
      if (row.status === 0) continue;
      await pool.query('UPDATE tbl_service_catalog SET status = 0 WHERE id = ? LIMIT 1', [row.id]);
      deactivated++;
    }
  }

  return {
    total: NURSING_WARD_CATALOG_2026.length,
    inserted,
    updated,
    deactivated,
    retiredConsults,
  };
}

module.exports = {
  NURSING_WARD_CATALOG_2026,
  seedNursingWardServiceCatalog,
};
