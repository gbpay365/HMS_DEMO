'use strict';

/**
 * Radiology & imaging tariffs (XAF) — Service Catalog / billing.
 * Source: hospital radiology price list (ultrasound, ECG, special procedures, X-ray).
 */
const RADIOLOGY_CATALOG_2026 = [
  // Ultrasound scans
  { sn: 1, name: 'Abdominal Ultrasound', price: 7000, department: 'Ultrasound Scans', code: 'US_ABD' },
  { sn: 2, name: 'Pelvic Ultrasound', price: 7000, department: 'Ultrasound Scans', code: 'US_PELV' },
  { sn: 3, name: 'Abdominopelvic Ultrasound', price: 15000, department: 'Ultrasound Scans', code: 'US_ABDPEL' },
  { sn: 4, name: 'Renal / Kidney Ultrasound', price: 10000, department: 'Ultrasound Scans', code: 'US_RENAL' },
  { sn: 5, name: 'Breast Ultrasound', price: 13000, department: 'Ultrasound Scans', code: 'US_BREAST' },
  { sn: 6, name: 'Cervical / Neck Ultrasound', price: 10000, department: 'Ultrasound Scans', code: 'US_CERV' },
  { sn: 7, name: 'Doppler Arterial', price: 35000, department: 'Ultrasound Scans', code: 'US_DOP_ART' },
  { sn: 8, name: 'Doppler Testicular', price: 35000, department: 'Ultrasound Scans', code: 'US_DOP_TES' },
  { sn: 9, name: 'Doppler Venous', price: 35000, department: 'Ultrasound Scans', code: 'US_DOP_VEN' },
  { sn: 10, name: 'Obstetrical Ultrasound', price: 7000, department: 'Ultrasound Scans', code: 'US_OBST' },
  { sn: 11, name: 'Ocular / Eye Ultrasound', price: 15000, department: 'Ultrasound Scans', code: 'US_EYE' },
  { sn: 12, name: 'Pleural / Lung Ultrasound', price: 10000, department: 'Ultrasound Scans', code: 'US_PLEUR' },
  { sn: 13, name: 'Reno-Vesico-Prostatic Ultrasound', price: 13000, department: 'Ultrasound Scans', code: 'US_RVP' },
  { sn: 14, name: 'Soft Tissue Ultrasound', price: 15000, department: 'Ultrasound Scans', code: 'US_SOFT' },
  { sn: 15, name: 'Testicular Ultrasound', price: 15000, department: 'Ultrasound Scans', code: 'US_TEST' },
  { sn: 16, name: 'Thyroid Ultrasound', price: 15000, department: 'Ultrasound Scans', code: 'US_THY' },
  {
    sn: 17,
    name: 'Articular Ultrasound (Wrist/Knee/Ankle/Elbow/Shoulder/Hip)',
    price: 25000,
    department: 'Ultrasound Scans',
    code: 'US_ART',
    notes: 'Any single joint',
  },
  { sn: 18, name: 'Endovaginal Ultrasound', price: 15000, department: 'Ultrasound Scans', code: 'US_ENDOVAG' },
  { sn: 19, name: 'Follicular Ultrasound', price: 15000, department: 'Ultrasound Scans', code: 'US_FOLL' },
  {
    sn: 20,
    name: 'Hysterosonography / Sonohysterography',
    price: 25000,
    department: 'Ultrasound Scans',
    code: 'US_HYSTERO',
  },
  { sn: 21, name: 'Heart Echocardiography', price: 25000, department: 'Ultrasound Scans', code: 'US_ECHO' },
  { sn: 22, name: 'Echo Control (Follow-up)', price: 23000, department: 'Ultrasound Scans', code: 'US_ECHO_CTL' },
  { sn: 23, name: 'Puncture / Biopsy Guidance (Ultrasound)', price: 15000, department: 'Ultrasound Scans', code: 'US_PUNCT' },
  // ECG
  { sn: 24, name: 'ECG (12-lead)', price: 10000, department: 'Electrocardiography', code: 'ECG', notes: 'Standard 12-lead' },
  { sn: 25, name: 'ECG Control (Follow-up)', price: 7000, department: 'Electrocardiography', code: 'ECG_CTL', notes: 'Follow-up ECG' },
  // Special radiological procedures
  { sn: 26, name: 'Bone: Hip', price: 7000, department: 'Special Radiological Procedures', code: 'SP_HIP' },
  {
    sn: 27,
    name: 'Fistulography',
    price: 0,
    department: 'Special Radiological Procedures',
    code: 'SP_FISTULO',
    notes: 'Price to be confirmed (TBC)',
  },
  {
    sn: 28,
    name: 'Hysterosalpingography',
    price: 100000,
    price2: 125000,
    department: 'Special Radiological Procedures',
    code: 'SP_HSG',
    notes: 'PU1 / PU2 pricing tiers',
  },
  { sn: 29, name: 'Thorax (Fluoroscopy)', price: 10000, department: 'Special Radiological Procedures', code: 'SP_THOR_FLUOR' },
  { sn: 30, name: 'TOGD (Barium Swallow)', price: 50000, department: 'Special Radiological Procedures', code: 'SP_TOGD' },
  { sn: 31, name: 'UCRM (Cystourethrography)', price: 25000, department: 'Special Radiological Procedures', code: 'SP_UCRM' },
  { sn: 32, name: 'UIV (Intravenous Urography)', price: 50000, department: 'Special Radiological Procedures', code: 'SP_UIV' },
  { sn: 33, name: 'Cystography', price: 65000, department: 'Special Radiological Procedures', code: 'SP_CYSTO' },
  { sn: 34, name: 'Retrograde Urethrography', price: 55000, department: 'Special Radiological Procedures', code: 'SP_RETRO_URE' },
  { sn: 35, name: 'Urethrography', price: 55000, department: 'Special Radiological Procedures', code: 'SP_URETHRO' },
  { sn: 36, name: 'Pangonometry / Pelvimetry', price: 20000, department: 'Special Radiological Procedures', code: 'SP_PELVIM' },
  // X-ray examinations
  { sn: 37, name: 'Skull / Cranium X-Ray', price: 15000, department: 'X-Ray Examinations', code: 'XR_SKULL' },
  { sn: 38, name: 'Blondeau / Waters View (Sinuses)', price: 15000, department: 'X-Ray Examinations', code: 'XR_SINUS' },
  { sn: 39, name: 'Sella Turcica X-Ray', price: 15000, department: 'X-Ray Examinations', code: 'XR_SELLA' },
  { sn: 40, name: 'Shoulder X-Ray', price: 15000, department: 'X-Ray Examinations', code: 'XR_SHOULDER', notes: 'Adult' },
  { sn: 41, name: 'Clavicle X-Ray (Paediatric)', price: 10000, department: 'X-Ray Examinations', code: 'XR_CLAV_PED' },
  { sn: 42, name: 'Clavicle X-Ray (Adult)', price: 15000, department: 'X-Ray Examinations', code: 'XR_CLAV_AD' },
  { sn: 43, name: 'Humerus X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_HUMERUS' },
  { sn: 44, name: 'Arm X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_ARM' },
  { sn: 45, name: 'Forearm X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_FOREARM' },
  { sn: 46, name: 'Elbow X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_ELBOW' },
  { sn: 47, name: 'Wrist X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_WRIST' },
  { sn: 48, name: 'Hand X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_HAND' },
  { sn: 49, name: 'Finger X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_FINGER' },
  { sn: 50, name: 'Ribs / Costal Grid X-Ray', price: 13000, department: 'X-Ray Examinations', code: 'XR_RIBS' },
  { sn: 51, name: 'Thorax (Chest X-Ray) — Single View', price: 10000, department: 'X-Ray Examinations', code: 'XR_THORAX_1V' },
  { sn: 52, name: 'Thorax F/P (Two Views)', price: 13000, department: 'X-Ray Examinations', code: 'XR_THORAX_FP', notes: 'Front + Profile' },
  { sn: 53, name: 'ASP (Abdominal Plain Film)', price: 18000, department: 'X-Ray Examinations', code: 'XR_ASP' },
  { sn: 54, name: 'Pelvis / Basin X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_PELVIS' },
  { sn: 55, name: 'Femur / Thigh X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_FEMUR' },
  { sn: 56, name: 'Knee X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_KNEE' },
  { sn: 57, name: 'Leg X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_LEG' },
  { sn: 58, name: 'Ankle X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_ANKLE' },
  { sn: 59, name: 'Foot X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_FOOT' },
  { sn: 60, name: 'Heel / Calcaneum X-Ray', price: 10000, department: 'X-Ray Examinations', code: 'XR_HEEL' },
  { sn: 61, name: 'Lumbo-Sacral Rachis X-Ray', price: 18000, department: 'X-Ray Examinations', code: 'XR_LS_SPINE' },
  { sn: 62, name: 'Lumbar Rachis X-Ray', price: 18000, department: 'X-Ray Examinations', code: 'XR_LUMBAR' },
  { sn: 63, name: 'Lumbar Rachis F/P + 3/4', price: 10000, department: 'X-Ray Examinations', code: 'XR_LUMBAR_FP' },
  { sn: 64, name: 'Dorsal / Thoracic Rachis X-Ray', price: 18000, department: 'X-Ray Examinations', code: 'XR_DORSAL' },
  { sn: 65, name: 'Cervical Rachis X-Ray', price: 18000, department: 'X-Ray Examinations', code: 'XR_CERV_SPINE' },
  { sn: 66, name: 'Cervical X-Ray (Cervical Spine)', price: 18000, department: 'X-Ray Examinations', code: 'XR_CERVICAL' },
  { sn: 67, name: 'Cervico-Dorso-Lumbar Rachis X-Ray', price: 25000, department: 'X-Ray Examinations', code: 'XR_CDL_SPINE', notes: 'Full spine' },
  {
    sn: 68,
    name: 'Hysterosalpingography (X-Ray Contrast Study)',
    price: 35000,
    department: 'X-Ray Examinations',
    code: 'XR_HSG',
    notes: 'Contrast study',
  },
];

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildDescription(item) {
  const parts = [];
  if (item.notes) parts.push(String(item.notes).trim());
  const p2 = parseInt(item.price2, 10);
  if (p2 > 0) {
    const p1 = Math.max(0, parseInt(item.price, 10) || 0);
    parts.push(`Price 1 (PU1): ${p1.toLocaleString('en-US')} XAF; Price 2 (PU2): ${p2.toLocaleString('en-US')} XAF`);
  }
  return parts.length ? parts.join(' — ') : null;
}

function cptForItem(item) {
  const sn = parseInt(item.sn, 10) || 0;
  if (item.code) return String(item.code).slice(0, 20);
  return `R${String(sn).padStart(3, '0')}`;
}

/**
 * Upsert radiology rows into tbl_service_catalog.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ deactivateMissing?: boolean, facilityId?: number }} [opts]
 */
const {
  SCANS_IMAGING_CATEGORY,
  imagingCategoryWhere,
  mergeScansImagingCatalog,
} = require('./scansImagingCatalog');

async function seedRadiologyServiceCatalog(pool, opts = {}) {
  const category = SCANS_IMAGING_CATEGORY;
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  let inserted = 0;
  let updated = 0;

  const [existing] = await pool.query(
    `SELECT id, name, price, department_name, status, cpt_code, facility_id, description, category
     FROM tbl_service_catalog
     WHERE ${imagingCategoryWhere()} AND facility_id = ?`,
    [facilityId]
  );
  const byName = new Map();
  const byCpt = new Map();
  for (const row of existing || []) {
    byName.set(normName(row.name), row);
    if (row.cpt_code) byCpt.set(String(row.cpt_code), row);
  }

  const seededNames = new Set();

  for (const item of RADIOLOGY_CATALOG_2026) {
    const name = String(item.name).trim();
    const key = normName(name);
    seededNames.add(key);
    const price = Math.max(0, parseInt(item.price, 10) || 0);
    const department = String(item.department || 'Radiology').trim();
    const subcategory = department;
    const sortSn = parseInt(item.sn, 10) || 0;
    const cptCode = cptForItem(item);
    const description = buildDescription(item);

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
    total: RADIOLOGY_CATALOG_2026.length,
    inserted,
    updated,
    deactivated,
    merge,
  };
}

module.exports = {
  RADIOLOGY_CATALOG_2026,
  seedRadiologyServiceCatalog,
};
