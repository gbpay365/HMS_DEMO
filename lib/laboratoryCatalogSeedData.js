'use strict';

/**
 * Laboratory investigations price list (XAF per test) — Service Catalog / billing.
 * Source: hospital laboratory tariff (SN 1–103).
 */
const LABORATORY_CATALOG_2026 = [
  // Haematology
  { sn: 1, name: 'Full Blood Count (FBC / CBC)', price: 6000, department: 'Haematology', code: 'FBC' },
  { sn: 2, name: 'Haemoglobin (Hb) Estimation', price: 1500, department: 'Haematology', code: 'HB' },
  { sn: 3, name: 'Blood Group & Rhesus Factor', price: 2000, department: 'Haematology', code: 'BG_RH' },
  { sn: 4, name: 'Cross-Match', price: 5000, department: 'Haematology', code: 'XMATCH' },
  { sn: 5, name: 'Erythrocyte Sedimentation Rate (ESR)', price: 1500, department: 'Haematology', code: 'ESR' },
  { sn: 6, name: 'Peripheral Blood Film', price: 2000, department: 'Haematology', code: 'PBF' },
  { sn: 7, name: 'Platelet Count', price: 2000, department: 'Haematology', code: 'PLT' },
  { sn: 8, name: 'Prothrombin Time (PT/INR)', price: 8000, department: 'Haematology', code: 'PT_INR' },
  { sn: 9, name: 'Activated Partial Thromboplastin Time (aPTT)', price: 8000, department: 'Haematology', code: 'APTT' },
  { sn: 10, name: 'Reticulocyte Count', price: 2000, department: 'Haematology', code: 'RETIC' },
  { sn: 11, name: 'Bleeding / clotting time', price: 2000, department: 'Haematology', code: 'BLEED_CLOTT' },
  { sn: 12, name: 'Fluid analysis', price: 2000, department: 'Haematology', code: 'FLUID_ANAL' },
  { sn: 13, name: 'CSF', price: 3500, department: 'Haematology', code: 'CSF' },
  { sn: 14, name: 'Sputum AFB', price: 1500, department: 'Haematology', code: 'SPUTUM_AFB' },
  { sn: 15, name: 'Total WBC', price: 1000, department: 'Haematology', code: 'WBC_TOTAL' },
  { sn: 16, name: 'WBC differential', price: 1500, department: 'Haematology', code: 'WBC_DIFF' },
  { sn: 17, name: 'HB ELECTROPHORESIS', price: 7000, department: 'Haematology', code: 'HB_ELECTRO' },
  // Clinical chemistry
  { sn: 18, name: 'Random Blood Sugar (RBS)', price: 1000, department: 'Biochemistry', code: 'RBS' },
  { sn: 19, name: 'Fasting Blood Sugar(FBS)', price: 1000, department: 'Biochemistry', code: 'FBS' },
  { sn: 20, name: 'HbA1c (Glycated Haemoglobin)', price: 6000, department: 'Biochemistry', code: 'HBA1C' },
  { sn: 21, name: 'Urea', price: 2500, department: 'Biochemistry', code: 'UREA' },
  { sn: 22, name: 'Creatinine', price: 2500, department: 'Biochemistry', code: 'CREA' },
  {
    sn: 23,
    name: 'Urea + Creatinine + calcium, uric acid, albumin, glucose, CO2 (Renal Panel)',
    price: 15000,
    department: 'Biochemistry',
    code: 'RENAL_FULL',
  },
  { sn: 24, name: 'Serum Uric Acid', price: 2500, department: 'Biochemistry', code: 'URIC' },
  { sn: 25, name: 'Total Protein', price: 2500, department: 'Biochemistry', code: 'TP' },
  { sn: 26, name: 'Albumin', price: 2500, department: 'Biochemistry', code: 'ALB' },
  { sn: 27, name: 'Total Bilirubin', price: 2500, department: 'Biochemistry', code: 'BILI_T' },
  { sn: 28, name: 'Direct Bilirubin', price: 2500, department: 'Biochemistry', code: 'BILI_D' },
  { sn: 29, name: 'ALT (SGPT)', price: 3500, department: 'Biochemistry', code: 'ALT' },
  { sn: 30, name: 'AST (SGOT)', price: 3500, department: 'Biochemistry', code: 'AST' },
  { sn: 31, name: 'Liver Function Tests (LFT) — Full Panel', price: 15000, department: 'Biochemistry', code: 'LFT' },
  { sn: 32, name: 'Alkaline Phosphatase (ALP)', price: 2500, department: 'Biochemistry', code: 'ALP' },
  { sn: 33, name: 'GGT (Gamma GT)', price: 2500, department: 'Biochemistry', code: 'GGT' },
  { sn: 34, name: 'Lipid Profile — Full Panel', price: 12000, department: 'Biochemistry', code: 'LIPID' },
  { sn: 35, name: 'Sodium (Na+)', price: 2500, department: 'Biochemistry', code: 'NA' },
  { sn: 36, name: 'Potassium (K+)', price: 2500, department: 'Biochemistry', code: 'K' },
  { sn: 37, name: 'Chloride (Cl-)', price: 2500, department: 'Biochemistry', code: 'CL' },
  { sn: 38, name: 'Electrolytes Panel (Na/K/Cl)', price: 15000, department: 'Biochemistry', code: 'LYTES' },
  { sn: 39, name: 'Calcium (Ca2+)', price: 2500, department: 'Biochemistry', code: 'CA' },
  { sn: 40, name: 'Phosphate', price: 2500, department: 'Biochemistry', code: 'PHOS' },
  { sn: 41, name: 'Magnesium', price: 2500, department: 'Biochemistry', code: 'MG' },
  { sn: 42, name: 'C-Reactive Protein (CRP)', price: 2500, department: 'Biochemistry', code: 'CRP' },
  { sn: 43, name: 'PSA (Prostate-Specific Antigen)', price: 12000, department: 'Biochemistry', code: 'PSA' },
  { sn: 44, name: 'AFP', price: 10000, department: 'Biochemistry', code: 'AFP' },
  { sn: 45, name: 'Oestrogen', price: 10000, department: 'Biochemistry', code: 'OESTROGEN' },
  { sn: 46, name: 'Prolactin', price: 10000, department: 'Biochemistry', code: 'PROLACTIN' },
  { sn: 47, name: 'LH', price: 10000, department: 'Biochemistry', code: 'LH' },
  { sn: 48, name: 'Progesterone', price: 10000, department: 'Biochemistry', code: 'PROGEST' },
  { sn: 49, name: 'Testosterone', price: 10000, department: 'Biochemistry', code: 'TESTO' },
  { sn: 50, name: 'FSH', price: 10000, department: 'Biochemistry', code: 'FSH' },
  { sn: 51, name: 'TSH (Thyroid Stimulating Hormone)', price: 10000, department: 'Biochemistry', code: 'TSH' },
  { sn: 52, name: 'T3 Free', price: 10000, department: 'Biochemistry', code: 'FT3' },
  { sn: 53, name: 'T4 Free', price: 10000, department: 'Biochemistry', code: 'FT4' },
  { sn: 54, name: 'Thyroid Profile (TSH + FT3 + FT4)', price: 30000, department: 'Biochemistry', code: 'THYROID' },
  { sn: 55, name: 'Pregnancy Test', price: 1500, department: 'Biochemistry', code: 'PREG_TEST' },
  { sn: 56, name: 'Amylase', price: 2500, department: 'Biochemistry', code: 'AMYL' },
  { sn: 57, name: 'Lipase', price: 2500, department: 'Biochemistry', code: 'LIPASE' },
  // Microbiology & serology
  { sn: 58, name: 'Malaria RDT (Rapid Test)', price: 1500, department: 'Microbiology', code: 'MAL_RDT' },
  { sn: 59, name: 'Malaria Thick/Thin Film', price: 1500, department: 'Microbiology', code: 'MAL_FILM' },
  { sn: 60, name: 'HIV 1 & 2 Screening (ELISA)', price: 0, department: 'Serology', code: 'HIV_ELISA' },
  { sn: 61, name: 'HIV Rapid Test', price: 1000, department: 'Serology', code: 'HIV_RDT' },
  { sn: 62, name: 'HBsAg (Hepatitis B Surface Antigen)', price: 3000, department: 'Serology', code: 'HBSAG' },
  { sn: 63, name: 'Hepatitis C Antibody (Anti-HCV)', price: 3000, department: 'Serology', code: 'HCV' },
  { sn: 64, name: 'Hepatitis B Panel', price: 10000, department: 'Serology', code: 'HEP_B_PANEL' },
  { sn: 65, name: 'VDRL / RPR (Syphilis Screening)', price: 2000, department: 'Serology', code: 'VDRL' },
  { sn: 66, name: 'TPHA (Treponema Confirmation)', price: 3000, department: 'Serology', code: 'TPHA' },
  { sn: 67, name: 'Widal Test (Typhoid)', price: 2000, department: 'Microbiology', code: 'WIDAL' },
  { sn: 68, name: 'Blood Culture & Sensitivity', price: 10000, department: 'Microbiology', code: 'BC_S' },
  { sn: 69, name: 'Urine Culture & Sensitivity', price: 8000, department: 'Microbiology', code: 'UC_S' },
  { sn: 70, name: 'Stool Culture & Sensitivity', price: 8000, department: 'Microbiology', code: 'STOOL_C_S' },
  { sn: 71, name: 'Sputum Culture', price: 7000, department: 'Microbiology', code: 'SPUTUM_C' },
  { sn: 72, name: 'Body fluid culture', price: 7000, department: 'Microbiology', code: 'BODY_FL_C' },
  { sn: 73, name: 'V/S / U/S Culture', price: 7000, department: 'Microbiology', code: 'VS_US_C' },
  { sn: 74, name: 'Fungi culture', price: 7000, department: 'Microbiology', code: 'FUNGI_C' },
  { sn: 75, name: 'Swab culture', price: 7000, department: 'Microbiology', code: 'SWAB_C' },
  { sn: 76, name: 'Semen culture', price: 10000, department: 'Microbiology', code: 'SEMEN_C' },
  { sn: 77, name: 'Pus culture', price: 7000, department: 'Microbiology', code: 'PUS_C' },
  { sn: 78, name: 'AFB Smear (TB/Tuberculosis)', price: 6000, department: 'Microbiology', code: 'AFB' },
  { sn: 79, name: 'Rheumatoid Factor', price: 3000, department: 'Microbiology', code: 'RF' },
  { sn: 80, name: 'ASLO', price: 3000, department: 'Microbiology', code: 'ASLO' },
  { sn: 81, name: 'Fungal scrubbing', price: 1500, department: 'Microbiology', code: 'FUNG_SCRUB' },
  { sn: 82, name: 'Chlamydia IgM', price: 6000, department: 'Microbiology', code: 'CHLAM_IGM' },
  { sn: 83, name: 'TORCH', price: 10000, department: 'Microbiology', code: 'TORCH' },
  { sn: 84, name: 'TOXO', price: 3000, department: 'Microbiology', code: 'TOXO' },
  { sn: 85, name: 'CrAg', price: 5000, department: 'Microbiology', code: 'CRAG' },
  { sn: 86, name: 'Semen analysis', price: 10000, department: 'Microbiology', code: 'SEMEN_ANAL' },
  { sn: 87, name: 'Chlamydia IgG', price: 6000, department: 'Microbiology', code: 'CHLAM_IGG' },
  { sn: 88, name: 'Genexpert MTB/RIF', price: 0, department: 'Microbiology', code: 'GENEXPERT' },
  // Urinalysis
  { sn: 89, name: 'Urine Dipstick (Routine)', price: 1000, department: 'Urinalysis', code: 'UR_DIP' },
  { sn: 90, name: 'Urine Microscopy (Full Urinalysis)', price: 1500, department: 'Urinalysis', code: 'UR_MICRO' },
  { sn: 91, name: 'Urine Pregnancy Test (Qualitative)', price: 1500, department: 'Urinalysis', code: 'UR_HCG' },
  { sn: 92, name: '24-hour Urine Protein', price: 0, department: 'Urinalysis', code: 'UR_PROT24' },
  // Parasitology / stool
  { sn: 93, name: 'Stool Microscopy (Ova & Parasites)', price: 1500, department: 'Parasitology', code: 'STOOL_OVP' },
  { sn: 94, name: 'Occult Blood (Stool)', price: 3000, department: 'Parasitology', code: 'STOOL_OB' },
  { sn: 95, name: 'H. Pylori Antigen (Stool)', price: 3000, department: 'Parasitology', code: 'HPYLORI' },
  { sn: 96, name: 'Filaria', price: 2000, department: 'Parasitology', code: 'FILARIA' },
  { sn: 97, name: 'V/S', price: 2000, department: 'Parasitology', code: 'VS' },
  { sn: 98, name: 'U/S', price: 2000, department: 'Parasitology', code: 'US' },
  { sn: 99, name: 'H/S', price: 3000, department: 'Parasitology', code: 'HS' },
  // Others (blood bank / transfusion)
  { sn: 100, name: 'Blood Screening', price: 15000, department: 'Blood Bank', code: 'BLOOD_SCR' },
  { sn: 101, name: 'Cross match (blood screening with Donor)', price: 20000, department: 'Blood Bank', code: 'XMATCH_DONOR' },
  { sn: 102, name: 'Only cross match', price: 5000, department: 'Blood Bank', code: 'XMATCH_ONLY' },
  { sn: 103, name: 'Transfusion bill', price: 10000, department: 'Blood Bank', code: 'TRANSFUSION' },
];

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function catalogSubcategory(department) {
  const d = String(department || '').trim();
  if (d === 'Biochemistry') return 'Clinical Chemistry';
  if (d === 'Serology' || d === 'Microbiology') return 'Microbiology & Serology';
  if (d === 'Parasitology') return 'Parasitology / Stool';
  if (d === 'Blood Bank') return 'Others';
  return d || 'Laboratory';
}

function cptForItem(item) {
  const sn = parseInt(item.sn, 10) || 0;
  if (item.code) return String(item.code).slice(0, 20);
  return `L${String(sn).padStart(3, '0')}`;
}

/**
 * Upsert laboratory rows into tbl_service_catalog and sync tbl_lab_catalog codes.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ deactivateMissing?: boolean, facilityId?: number }} [opts]
 */
async function seedLaboratoryServiceCatalog(pool, opts = {}) {
  const category = 'laboratory';
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  let inserted = 0;
  let updated = 0;
  let labCatalogUpserted = 0;

  const [existing] = await pool.query(
    `SELECT id, name, price, department_name, status, cpt_code, facility_id
     FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = ? AND facility_id = ?`,
    [category, facilityId]
  );
  const byName = new Map();
  const byCpt = new Map();
  for (const row of existing || []) {
    byName.set(normName(row.name), row);
    if (row.cpt_code) byCpt.set(String(row.cpt_code), row);
  }

  const seededNames = new Set();

  for (const item of LABORATORY_CATALOG_2026) {
    const name = String(item.name).trim();
    const key = normName(name);
    seededNames.add(key);
    const price = Math.max(0, parseInt(item.price, 10) || 0);
    const department = String(item.department || 'Laboratory').trim();
    const subcategory = catalogSubcategory(department);
    const sortSn = parseInt(item.sn, 10) || 0;
    const cptCode = cptForItem(item);

    const prev = byCpt.get(cptCode) || byName.get(key);
    if (prev) {
      await pool.query(
        `UPDATE tbl_service_catalog
         SET category = ?, subcategory = ?, name = ?, department_name = ?, cpt_code = ?, price = ?, status = 1, sort_order = ?
         WHERE id = ? LIMIT 1`,
        [category, subcategory, name, department, cptCode, price, sortSn, prev.id]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO tbl_service_catalog
         (facility_id, category, subcategory, name, department_name, cpt_code, price, currency, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'XAF', 1, ?)`,
        [facilityId, category, subcategory, name, department, cptCode, price, sortSn]
      );
      inserted++;
    }

    const code = String(item.code || `LAB${sortSn}`).slice(0, 40);
    const labCat = department;
    try {
      await pool.query(
        `INSERT INTO tbl_lab_catalog (code, name, category, specimen_hint, active, sort_order)
         VALUES (?, ?, ?, NULL, 1, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           category = VALUES(category),
           active = 1,
           sort_order = VALUES(sort_order)`,
        [code, name, labCat, sortSn]
      );
      labCatalogUpserted++;
    } catch (_) {
      /* tbl_lab_catalog may not exist on very old DBs */
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

  return {
    total: LABORATORY_CATALOG_2026.length,
    inserted,
    updated,
    deactivated,
    labCatalogUpserted,
  };
}

module.exports = {
  LABORATORY_CATALOG_2026,
  seedLaboratoryServiceCatalog,
};
