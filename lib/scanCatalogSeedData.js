'use strict';

/**
 * CT / MRI / nuclear medicine / fluoroscopy tariff (XAF) — Service Catalog (category: scan).
 */
const SECTION = {
  CT: 'CT Scan (Computed Tomography)',
  MRI: 'MRI (Magnetic Resonance Imaging)',
  NUC: 'Nuclear Medicine / Scintigraphy',
  FLUORO: 'Fluoroscopy & Special Studies',
};

function desc(contrast, notes) {
  const p = [];
  if (contrast === true) p.push('Contrast: Yes');
  else if (contrast === false) p.push('Contrast: No');
  if (notes) p.push(notes);
  return p.length ? p.join(' | ') : null;
}

const SCAN_CATALOG_2026 = [
  // CT SCAN
  { sn: 1, section: SECTION.CT, name: 'Head / Brain — Plain', price: 35000, contrast: false },
  { sn: 2, section: SECTION.CT, name: 'Head / Brain — With Contrast', price: 55000, contrast: true, notes: 'IV contrast required' },
  { sn: 3, section: SECTION.CT, name: 'Head + Neck — Plain', price: 50000, contrast: false },
  { sn: 4, section: SECTION.CT, name: 'Head + Neck — With Contrast', price: 75000, contrast: true },
  { sn: 5, section: SECTION.CT, name: 'Chest / Thorax — Plain', price: 40000, contrast: false, notes: 'HRCT available' },
  { sn: 6, section: SECTION.CT, name: 'Chest — With Contrast', price: 60000, contrast: true, notes: 'Pulmonary embolism protocol' },
  { sn: 7, section: SECTION.CT, name: 'Abdomen — Plain', price: 40000, contrast: false },
  { sn: 8, section: SECTION.CT, name: 'Abdomen — With Contrast', price: 60000, contrast: true },
  { sn: 9, section: SECTION.CT, name: 'Abdominopelvic — Plain', price: 50000, contrast: false },
  { sn: 10, section: SECTION.CT, name: 'Abdominopelvic — With Contrast', price: 75000, contrast: true },
  { sn: 11, section: SECTION.CT, name: 'Pelvis — Plain', price: 35000, contrast: false },
  { sn: 12, section: SECTION.CT, name: 'Pelvis — With Contrast', price: 55000, contrast: true },
  { sn: 13, section: SECTION.CT, name: 'Spine (Cervical) — Plain', price: 40000, contrast: false },
  { sn: 14, section: SECTION.CT, name: 'Spine (Thoracic) — Plain', price: 40000, contrast: false },
  { sn: 15, section: SECTION.CT, name: 'Spine (Lumbar) — Plain', price: 40000, contrast: false },
  { sn: 16, section: SECTION.CT, name: 'Whole Spine', price: 80000, contrast: false },
  { sn: 17, section: SECTION.CT, name: 'Extremity (Upper or Lower Limb)', price: 35000, contrast: false },
  { sn: 18, section: SECTION.CT, name: 'Sinuses / PNS', price: 35000, contrast: false },
  { sn: 19, section: SECTION.CT, name: 'Orbits', price: 35000, contrast: false },
  { sn: 20, section: SECTION.CT, name: 'Temporal Bones / IAM', price: 40000, contrast: false },
  { sn: 21, section: SECTION.CT, name: 'CT Angiography (CTA) — Any Region', price: 90000, contrast: true, notes: 'Requires timing bolus' },
  { sn: 22, section: SECTION.CT, name: 'CT Urography (CTU)', price: 80000, contrast: true, notes: 'Triple phase' },
  { sn: 23, section: SECTION.CT, name: 'CT Colonoscopy / Virtual', price: 85000, contrast: false, notes: 'Bowel prep needed' },
  { sn: 24, section: SECTION.CT, name: 'CT Guided Biopsy', price: 75000, contrast: true, notes: 'Interventional' },
  { sn: 25, section: SECTION.CT, name: 'CT Guided Drainage', price: 80000, contrast: true, notes: 'Interventional' },
  { sn: 26, section: SECTION.CT, name: 'Whole Body CT', price: 150000, contrast: true, notes: 'Oncology / trauma protocol' },
  // MRI
  { sn: 27, section: SECTION.MRI, name: 'Brain — Plain', price: 65000, contrast: false },
  { sn: 28, section: SECTION.MRI, name: 'Brain — With Contrast', price: 90000, contrast: true, notes: 'Gadolinium contrast' },
  { sn: 29, section: SECTION.MRI, name: 'Brain — MR Angiography (MRA)', price: 110000, contrast: false },
  { sn: 30, section: SECTION.MRI, name: 'Brain — Spectroscopy', price: 120000, contrast: false },
  { sn: 31, section: SECTION.MRI, name: 'Spine (Cervical) — Plain', price: 65000, contrast: false },
  { sn: 32, section: SECTION.MRI, name: 'Spine (Cervical) — With Contrast', price: 90000, contrast: true },
  { sn: 33, section: SECTION.MRI, name: 'Spine (Thoracic) — Plain', price: 65000, contrast: false },
  { sn: 34, section: SECTION.MRI, name: 'Spine (Lumbar) — Plain', price: 65000, contrast: false },
  { sn: 35, section: SECTION.MRI, name: 'Spine (Lumbar) — With Contrast', price: 90000, contrast: true },
  { sn: 36, section: SECTION.MRI, name: 'Whole Spine', price: 150000, contrast: false },
  { sn: 37, section: SECTION.MRI, name: 'Shoulder', price: 85000, contrast: false },
  { sn: 38, section: SECTION.MRI, name: 'Knee', price: 85000, contrast: false },
  { sn: 39, section: SECTION.MRI, name: 'Hip', price: 85000, contrast: false },
  { sn: 40, section: SECTION.MRI, name: 'Ankle & Foot', price: 85000, contrast: false },
  { sn: 41, section: SECTION.MRI, name: 'Wrist & Hand', price: 85000, contrast: false },
  { sn: 42, section: SECTION.MRI, name: 'Elbow', price: 85000, contrast: false },
  { sn: 43, section: SECTION.MRI, name: 'Abdomen — Plain', price: 75000, contrast: false },
  { sn: 44, section: SECTION.MRI, name: 'Abdomen — With Contrast', price: 100000, contrast: true },
  { sn: 45, section: SECTION.MRI, name: 'Pelvis — Plain', price: 70000, contrast: false },
  { sn: 46, section: SECTION.MRI, name: 'Pelvis — With Contrast', price: 95000, contrast: true },
  { sn: 47, section: SECTION.MRI, name: 'MRCP (Biliary / Pancreatic Ducts)', price: 80000, contrast: false, notes: 'No contrast needed' },
  { sn: 48, section: SECTION.MRI, name: 'MR Urography', price: 85000, contrast: false },
  { sn: 49, section: SECTION.MRI, name: 'Cardiac MRI', price: 130000, contrast: true, notes: 'Requires ECG gating' },
  { sn: 50, section: SECTION.MRI, name: 'Breast MRI (Bilateral)', price: 110000, contrast: true },
  { sn: 51, section: SECTION.MRI, name: 'Fetal MRI', price: 100000, contrast: false, notes: 'Obstetric indication' },
  { sn: 52, section: SECTION.MRI, name: 'MR Angiography — Any Region', price: 90000, contrast: false, notes: 'Time of flight' },
  { sn: 53, section: SECTION.MRI, name: 'Whole Body MRI', price: 200000, contrast: true, notes: 'Oncology staging' },
  // NUCLEAR MEDICINE
  { sn: 54, section: SECTION.NUC, name: 'Bone Scan (Scintigraphy)', price: 80000, contrast: true, notes: 'Technetium-99m' },
  { sn: 55, section: SECTION.NUC, name: 'Thyroid Scan', price: 60000, contrast: true, notes: 'Iodine-123 / Tc-99m' },
  { sn: 56, section: SECTION.NUC, name: 'Renal Scan (DMSA / DTPA)', price: 70000, contrast: true },
  { sn: 57, section: SECTION.NUC, name: 'Lung Ventilation-Perfusion (V/Q) Scan', price: 75000, contrast: true, notes: 'PE exclusion' },
  { sn: 58, section: SECTION.NUC, name: 'Hepatobiliary Scan (HIDA)', price: 75000, contrast: true },
  { sn: 59, section: SECTION.NUC, name: 'Sentinel Node Mapping', price: 80000, contrast: true, notes: 'Pre-operative' },
  { sn: 60, section: SECTION.NUC, name: 'PET-CT Scan', price: 250000, contrast: true, notes: 'FDG / Oncology' },
  // FLUOROSCOPY & SPECIAL
  { sn: 61, section: SECTION.FLUORO, name: 'Barium Swallow (TOGD)', price: 50000, contrast: true, notes: 'Oral contrast' },
  { sn: 62, section: SECTION.FLUORO, name: 'Barium Meal', price: 50000, contrast: true },
  { sn: 63, section: SECTION.FLUORO, name: 'Barium Enema', price: 55000, contrast: true, notes: 'Bowel prep needed' },
  { sn: 64, section: SECTION.FLUORO, name: 'Fluoroscopic Joint Injection', price: 35000, contrast: true, notes: 'Therapeutic / diagnostic' },
  { sn: 65, section: SECTION.FLUORO, name: 'Myelogram', price: 60000, contrast: true, notes: 'Intrathecal contrast' },
  { sn: 66, section: SECTION.FLUORO, name: 'Sialography', price: 45000, contrast: true, notes: 'Salivary gland' },
  { sn: 67, section: SECTION.FLUORO, name: 'Dacryocystography', price: 45000, contrast: true, notes: 'Lacrimal duct' },
  { sn: 68, section: SECTION.FLUORO, name: 'Sinogram / Fistulogram', price: 45000, contrast: true },
].map((row) => ({
  ...row,
  description: desc(row.contrast, row.notes),
}));

const DEPARTMENT = 'Advanced Imaging';

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cptForItem(item) {
  const sn = parseInt(item.sn, 10) || 0;
  return `SCN${String(sn).padStart(3, '0')}`;
}

/**
 * Upsert scan imaging tariff into tbl_service_catalog (category: scan).
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ deactivateMissing?: boolean, facilityId?: number }} [opts]
 */
const {
  SCANS_IMAGING_CATEGORY,
  normNameKey,
  isRadiologySourceRow,
  imagingCategoryWhere,
  mergeScansImagingCatalog,
} = require('./scansImagingCatalog');

async function seedScanServiceCatalog(pool, opts = {}) {
  const category = SCANS_IMAGING_CATEGORY;
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  let inserted = 0;
  let updated = 0;
  let skippedRadiologyDup = 0;

  const [existing] = await pool.query(
    `SELECT id, name, price, department_name, status, cpt_code, facility_id, description, subcategory, category
     FROM tbl_service_catalog
     WHERE ${imagingCategoryWhere()} AND facility_id = ?`,
    [facilityId]
  );
  const byName = new Map();
  const byNameKey = new Map();
  const byCpt = new Map();
  for (const row of existing || []) {
    byName.set(normName(row.name), row);
    byNameKey.set(normNameKey(row.name), row);
    if (row.cpt_code) byCpt.set(String(row.cpt_code), row);
  }

  const seededNames = new Set();

  for (const item of SCAN_CATALOG_2026) {
    const name = String(item.name).trim();
    const key = normName(name);
    seededNames.add(key);
    const price = Math.max(0, parseInt(item.price, 10) || 0);
    const sortSn = parseInt(item.sn, 10) || 0;
    const cptCode = cptForItem(item);
    const subcategory = String(item.section || DEPARTMENT).trim();
    const department = subcategory;
    const description = item.description || desc(item.contrast, item.notes);

    const nameKey = normNameKey(name);
    const radDup = byNameKey.get(nameKey);
    if (radDup && isRadiologySourceRow(radDup)) {
      seededNames.add(key);
      skippedRadiologyDup++;
      continue;
    }

    const prev = byCpt.get(cptCode) || byName.get(key);
    if (prev) {
      await pool.query(
        `UPDATE tbl_service_catalog
         SET category = ?, subcategory = ?, name = ?, department_name = ?, cpt_code = ?,
             price = ?, description = ?, status = 1, sort_order = ?, currency = 'XAF'
         WHERE id = ? LIMIT 1`,
        [category, subcategory, name, department, cptCode, price, description, sortSn, prev.id]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO tbl_service_catalog
         (facility_id, category, subcategory, name, department_name, cpt_code, price, currency, status, sort_order, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'XAF', 1, ?, ?)`,
        [facilityId, category, subcategory, name, department, cptCode, price, sortSn, description]
      );
      inserted++;
    }
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

  const merge = await mergeScansImagingCatalog(pool, { facilityId });

  return {
    total: SCAN_CATALOG_2026.length,
    inserted,
    updated,
    deactivated,
    skippedRadiologyDup,
    merge,
  };
}

module.exports = {
  SCAN_CATALOG_2026,
  seedScanServiceCatalog,
};
