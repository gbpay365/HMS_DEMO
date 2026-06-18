'use strict';

/**
 * Maternity services tariff (XAF) — Service Catalog (category: maternity).
 * Source: MATERNITY SERVICES — TARIFF SCHEDULE (97 procedures + first-night ward fee).
 */
const SECTION = {
  ANC: 'Antenatal Care (ANC)',
  LABOUR: 'Labour & Delivery',
  PNC: 'Postnatal Care (PNC)',
  NEONATAL: 'Neonatal / Newborn Care',
  OBSTETRIC: 'Obstetric Complications & Emergency',
};

function d(unit, notes) {
  const p = [];
  if (unit) p.push(`Unit: ${unit}`);
  if (notes) p.push(notes);
  return p.length ? p.join(' | ') : null;
}

const MATERNITY_CATALOG_2026 = [
  // 1. ANTENATAL CARE (ANC)
  { sn: 1, section: SECTION.ANC, name: 'ANC Booking / Registration', price: 2000, unit: 'Once', notes: 'Includes patient file & ANC card' },
  { sn: 2, section: SECTION.ANC, name: 'ANC Booking Visit (First Visit)', price: 20000, unit: 'Once', notes: 'Full examination + booking bloods' },
  { sn: 3, section: SECTION.ANC, name: 'ANC Routine Visit — General', price: 2000, unit: 'Per visit' },
  { sn: 4, section: SECTION.ANC, name: 'ANC Specialist Visit', price: 5000, unit: 'Per visit', notes: 'High-risk patients' },
  { sn: 5, section: SECTION.ANC, name: 'Blood Pressure Monitoring (ANC)', price: 500, unit: 'Per visit' },
  { sn: 6, section: SECTION.ANC, name: 'Weight & Fundal Height Measurement', price: 500, unit: 'Per visit' },
  { sn: 7, section: SECTION.ANC, name: 'Urine Dipstick (ANC)', price: 500, unit: 'Per visit', notes: 'Protein/glucose/ketones' },
  { sn: 8, section: SECTION.ANC, name: 'Haemoglobin Estimation (ANC)', price: 1000, unit: 'Per visit' },
  { sn: 9, section: SECTION.ANC, name: 'Blood Group & Rhesus Factor', price: 2000, unit: 'Once', notes: 'First visit' },
  { sn: 10, section: SECTION.ANC, name: 'HIV Screening (PMTCT)', price: 2000, unit: 'Per test', notes: 'Opt-out counselling included' },
  { sn: 11, section: SECTION.ANC, name: 'Syphilis Screening (VDRL/RPR)', price: 2000, unit: 'Per test' },
  { sn: 12, section: SECTION.ANC, name: 'Malaria Rapid Test (RDT)', price: 1500, unit: 'Per test' },
  { sn: 13, section: SECTION.ANC, name: 'Tetanus Toxoid (TT) Vaccination', price: 1000, unit: 'Per dose', notes: 'TT1—TT5' },
  { sn: 14, section: SECTION.ANC, name: 'IPTp (Intermittent Preventive Treatment)', price: 1500, unit: 'Per dose', notes: 'SP/Fansidar — 3 doses' },
  { sn: 15, section: SECTION.ANC, name: 'Iron + Folate Supplementation', price: 500, unit: 'Per issue' },
  { sn: 16, section: SECTION.ANC, name: 'Long-Lasting Insecticidal Net (LLIN)', price: 2000, unit: 'Once', notes: 'First ANC visit' },
  { sn: 17, section: SECTION.ANC, name: 'Nutritional Counselling (ANC)', price: 1000, unit: 'Per session' },
  { sn: 18, section: SECTION.ANC, name: 'Birth Preparedness Counselling', price: 1000, unit: 'Per session' },
  { sn: 19, section: SECTION.ANC, name: 'Obstetric Ultrasound — Dating', price: 7000, unit: 'Per scan', notes: 'EGA <14 weeks' },
  { sn: 20, section: SECTION.ANC, name: 'Obstetric Ultrasound — Routine', price: 7000, unit: 'Per scan' },
  { sn: 21, section: SECTION.ANC, name: 'Obstetric Ultrasound — Anomaly Scan', price: 15000, unit: 'Per scan', notes: '18-22 weeks' },
  { sn: 22, section: SECTION.ANC, name: 'Obstetric Ultrasound — Growth Scan', price: 7000, unit: 'Per scan', notes: '3rd trimester' },
  { sn: 23, section: SECTION.ANC, name: 'Obstetric Ultrasound — Doppler', price: 25000, unit: 'Per scan', notes: 'Colour Doppler — high risk' },
  { sn: 24, section: SECTION.ANC, name: 'CTG / Cardiotocography', price: 5000, unit: 'Per session', notes: 'Non-stress test' },
  { sn: 25, section: SECTION.ANC, name: 'Risk Assessment Form', price: 1000, unit: 'Perform' },
  { sn: 26, section: SECTION.ANC, name: 'Referral Letter (ANC)', price: 1000, unit: 'Per letter' },
  // 2. LABOUR & DELIVERY
  { sn: 27, section: SECTION.LABOUR, name: 'Labour Ward Admission', price: 3000, unit: 'Once', notes: 'Includes monitoring' },
  { sn: 28, section: SECTION.LABOUR, name: 'Labour Monitoring — Active Phase', price: 5000, unit: 'Per 6 hours', notes: 'Midwife + CTG' },
  { sn: 29, section: SECTION.LABOUR, name: 'Partograph', price: 1000, unit: 'Per labour', notes: 'WHO partograph' },
  { sn: 30, section: SECTION.LABOUR, name: 'ARM (Artificial Rupture of Membranes)', price: 5000, unit: 'Once' },
  { sn: 31, section: SECTION.LABOUR, name: 'Oxytocin Infusion for Induction', price: 5000, unit: 'Once', notes: 'Drug cost extra' },
  { sn: 32, section: SECTION.LABOUR, name: 'IV Access & IV Fluids Setup', price: 2000, unit: 'Once', notes: 'Consumables billed separately' },
  { sn: 33, section: SECTION.LABOUR, name: 'Supervised Normal Delivery (SND)', price: 25000, unit: 'Once', notes: 'Midwife/nurse' },
  { sn: 34, section: SECTION.LABOUR, name: 'Delivery by Doctor (SND)', price: 50000, unit: 'Once', notes: 'Complicated SND' },
  { sn: 35, section: SECTION.LABOUR, name: 'Vacuum Extraction', price: 50000, unit: 'Once' },
  { sn: 36, section: SECTION.LABOUR, name: 'Forceps Delivery', price: 50000, unit: 'Once' },
  { sn: 37, section: SECTION.LABOUR, name: 'Caesarean Section (Elective)', price: 225000, unit: 'Once', notes: 'See Surgeries sheet for breakdown' },
  { sn: 38, section: SECTION.LABOUR, name: 'Caesarean Section (Emergency)', price: 250000, unit: 'Once' },
  { sn: 39, section: SECTION.LABOUR, name: 'Caesarean + Tubal Ligation', price: 180000, unit: 'Once' },
  { sn: 40, section: SECTION.LABOUR, name: 'Episiotomy & Repair', price: 20000, unit: 'Once' },
  { sn: 41, section: SECTION.LABOUR, name: 'Perineal Tear Repair (1st/2nd Degree)', price: 15000, unit: 'Once' },
  { sn: 42, section: SECTION.LABOUR, name: 'Perineal Tear Repair (3rd/4th Degree)', price: 45000, unit: 'Once', notes: 'Specialist' },
  { sn: 43, section: SECTION.LABOUR, name: 'Manual Removal of Placenta', price: 40000, unit: 'Once', notes: 'Under anaesthesia' },
  { sn: 44, section: SECTION.LABOUR, name: 'Manual Exploration', price: 20000, unit: 'Once' },
  { sn: 45, section: SECTION.LABOUR, name: 'Bimanual Compression (PPH)', price: 10000, unit: 'Once', notes: 'PPH management' },
  { sn: 46, section: SECTION.LABOUR, name: 'Blood Transfusion (per unit)', price: 15000, unit: 'Per unit', notes: 'Cross-match billed separately' },
  { sn: 47, section: SECTION.LABOUR, name: 'Ergometrine Injection', price: 2000, unit: 'Once' },
  { sn: 48, section: SECTION.LABOUR, name: 'Oxytocin Injection (Active 3rd Stage)', price: 1500, unit: 'Once' },
  { sn: 49, section: SECTION.LABOUR, name: 'Delivery Room Fee', price: 10000, unit: 'Once' },
  { sn: 50, section: SECTION.LABOUR, name: 'After-Hours Delivery Surcharge', price: 10000, unit: 'Once', notes: '18:00-08:00 & weekends' },
  // 3. POSTNATAL CARE (PNC)
  { sn: 51, section: SECTION.PNC, name: 'Postnatal Ward — Per Day (General)', price: 2000, unit: 'Per day' },
  { sn: 511, section: SECTION.PNC, name: 'Postnatal Ward — First Night', price: 5000, unit: 'Once', notes: 'General ward first night' },
  { sn: 52, section: SECTION.PNC, name: 'Postnatal Ward — Per Day (Private)', price: 20000, unit: 'Per day' },
  { sn: 53, section: SECTION.PNC, name: 'Postnatal Visit — Routine', price: 2000, unit: 'Per visit' },
  { sn: 54, section: SECTION.PNC, name: 'Postnatal Visit — Specialist', price: 5000, unit: 'Per visit', notes: 'High risk' },
  { sn: 55, section: SECTION.PNC, name: 'Wound Dressing (CS Wound)', price: 1500, unit: 'Per dressing' },
  { sn: 56, section: SECTION.PNC, name: 'Suture Removal (CS / Episiotomy)', price: 1000, unit: 'Once' },
  { sn: 57, section: SECTION.PNC, name: 'Breastfeeding Counselling', price: 1000, unit: 'Per session' },
  { sn: 58, section: SECTION.PNC, name: 'Edinburgh Depression Screening (EPDS)', price: 1000, unit: 'Per screen' },
  { sn: 59, section: SECTION.PNC, name: 'Family Planning Counselling', price: 1000, unit: 'Per session' },
  { sn: 60, section: SECTION.PNC, name: 'IUCD / Copper T Insertion', price: 5000, unit: 'Once', notes: 'Device cost extra' },
  { sn: 61, section: SECTION.PNC, name: 'Norplant / Implant Insertion', price: 10000, unit: 'Once', notes: 'Implant cost extra' },
  { sn: 62, section: SECTION.PNC, name: 'Injectables (DMPA/Depo)', price: 3000, unit: 'Per injection', notes: 'Incl. drug' },
  { sn: 63, section: SECTION.PNC, name: 'Postnatal Haemoglobin Check', price: 1000, unit: 'Once' },
  { sn: 64, section: SECTION.PNC, name: 'Discharge Summary (Mother)', price: 1000, unit: 'Once' },
  { sn: 65, section: SECTION.PNC, name: 'Postnatal Vitamin A Supplementation', price: 500, unit: 'Once' },
  // 4. NEONATAL / NEWBORN CARE
  { sn: 66, section: SECTION.NEONATAL, name: 'Birth Registration', price: 500, unit: 'Once' },
  { sn: 67, section: SECTION.NEONATAL, name: 'Routine Newborn Assessment', price: 2000, unit: 'Once', notes: 'APGAR, weight, measurements' },
  { sn: 68, section: SECTION.NEONATAL, name: 'Vitamin K Injection (Newborn)', price: 1500, unit: 'Once' },
  { sn: 69, section: SECTION.NEONATAL, name: 'Eye Prophylaxis (Tetracycline Drops)', price: 500, unit: 'Once' },
  { sn: 70, section: SECTION.NEONATAL, name: 'BCG Vaccination', price: 1000, unit: 'Once' },
  { sn: 71, section: SECTION.NEONATAL, name: 'OPV 0 (Birth Dose)', price: 1000, unit: 'Once' },
  { sn: 72, section: SECTION.NEONATAL, name: 'Hepatitis B Birth Dose', price: 1500, unit: 'Once' },
  { sn: 73, section: SECTION.NEONATAL, name: 'Newborn Hearing Screening', price: 3000, unit: 'Once' },
  { sn: 74, section: SECTION.NEONATAL, name: 'Newborn Screening (Metabolic)', price: 5000, unit: 'Once', notes: 'PKU, thyroid etc' },
  { sn: 75, section: SECTION.NEONATAL, name: 'Phototherapy — Per Day', price: 5000, unit: 'Per day', notes: 'Neonatal jaundice' },
  { sn: 76, section: SECTION.NEONATAL, name: 'Incubator Care — Per Day', price: 10000, unit: 'Per day', notes: 'Prematurity / low birth weight' },
  { sn: 77, section: SECTION.NEONATAL, name: 'NICU Admission — Per Day', price: 15000, unit: 'Per day', notes: 'Sick neonate' },
  { sn: 78, section: SECTION.NEONATAL, name: 'Neonatal Resuscitation', price: 10000, unit: 'Once', notes: 'Advanced resuscitation' },
  { sn: 79, section: SECTION.NEONATAL, name: 'Nasogastric Feeding Setup', price: 3000, unit: 'Once', notes: 'Tube + setup' },
  { sn: 80, section: SECTION.NEONATAL, name: 'Kangaroo Mother Care (KMC) — Per Day', price: 2000, unit: 'Per day', notes: 'Low birth weight' },
  { sn: 81, section: SECTION.NEONATAL, name: 'Neonatal IV Access', price: 3000, unit: 'Once' },
  { sn: 82, section: SECTION.NEONATAL, name: 'Umbilical Cord Care Kit', price: 1000, unit: 'Once' },
  { sn: 83, section: SECTION.NEONATAL, name: 'Newborn HIV DNA PCR Test', price: 10000, unit: 'Per test', notes: 'PMTCT programme' },
  { sn: 84, section: SECTION.NEONATAL, name: 'Neonatal Blood Glucose Monitoring', price: 500, unit: 'Per check' },
  { sn: 85, section: SECTION.NEONATAL, name: 'Discharge Summary (Newborn)', price: 1000, unit: 'Once' },
  // 5. OBSTETRIC COMPLICATIONS & EMERGENCY
  { sn: 86, section: SECTION.OBSTETRIC, name: 'Management of Eclampsia / Pre-Eclampsia', price: 20000, unit: 'Episode', notes: 'Magnesium sulphate extra' },
  { sn: 87, section: SECTION.OBSTETRIC, name: 'Management of Postpartum Haemorrhage (PPH)', price: 25000, unit: 'Episode', notes: 'Blood products billed separately' },
  { sn: 88, section: SECTION.OBSTETRIC, name: 'Management of Sepsis (Maternal)', price: 20000, unit: 'Episode', notes: 'Antibiotics billed separately' },
  { sn: 89, section: SECTION.OBSTETRIC, name: 'Emergency Uterine Tamponade', price: 15000, unit: 'Once', notes: 'Balloon/packing' },
  { sn: 90, section: SECTION.OBSTETRIC, name: 'B-Lynch Suture', price: 30000, unit: 'Once', notes: 'Theatre fee extra' },
  { sn: 91, section: SECTION.OBSTETRIC, name: 'Internal Iliac Artery Ligation', price: 80000, unit: 'Once', notes: 'Theatre fee extra' },
  { sn: 92, section: SECTION.OBSTETRIC, name: 'Repair of Ruptured Uterus', price: 200000, unit: 'Once', notes: 'Emergency — See Surgeries' },
  { sn: 93, section: SECTION.OBSTETRIC, name: 'Repair of Vesico-Vaginal Fistula (VVF)', price: 200000, unit: 'Once', notes: 'Specialist referral may apply' },
  { sn: 94, section: SECTION.OBSTETRIC, name: 'Management of Shoulder Dystocia', price: 10000, unit: 'Episode' },
  { sn: 95, section: SECTION.OBSTETRIC, name: 'Management of Cord Prolapse', price: 10000, unit: 'Episode' },
  { sn: 96, section: SECTION.OBSTETRIC, name: 'Obstetric ICU Care — Per Day', price: 30000, unit: 'Per day', notes: 'Critical care bed' },
  { sn: 97, section: SECTION.OBSTETRIC, name: 'Maternal Resuscitation (CPR/ACLS)', price: 20000, unit: 'Episode' },
].map((row) => ({
  ...row,
  description: d(row.unit, row.notes),
}));

const DEPARTMENT = 'Maternity Services';

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cptForItem(item) {
  const sn = parseInt(item.sn, 10) || 0;
  if (sn >= 1 && sn <= 97) return `MAT${String(sn).padStart(3, '0')}`;
  if (String(item.sn) === '511') return 'MAT051F';
  return `MAT${String(item.sn).slice(0, 20)}`;
}

/**
 * Upsert maternity tariff into tbl_service_catalog (category: maternity).
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ deactivateMissing?: boolean, facilityId?: number }} [opts]
 */
async function seedMaternityServiceCatalog(pool, opts = {}) {
  const category = 'maternity';
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  let inserted = 0;
  let updated = 0;

  const [existing] = await pool.query(
    `SELECT id, name, price, department_name, status, cpt_code, facility_id, description, subcategory
     FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = ? AND facility_id = ?
       AND (cpt_code LIKE 'MAT%' OR LOWER(TRIM(department_name)) = LOWER(?))`,
    [category, facilityId, DEPARTMENT]
  );
  const byName = new Map();
  const byCpt = new Map();
  for (const row of existing || []) {
    byName.set(normName(row.name), row);
    if (row.cpt_code) byCpt.set(String(row.cpt_code), row);
  }

  const seededNames = new Set();

  for (const item of MATERNITY_CATALOG_2026) {
    const name = String(item.name).trim();
    const key = normName(name);
    seededNames.add(key);
    const price = Math.max(0, parseInt(item.price, 10) || 0);
    const sortSn = parseInt(item.sn, 10) || 0;
    const cptCode = cptForItem(item);
    const subcategory = String(item.section || DEPARTMENT).trim();
    const description = item.description || d(item.unit, item.notes);

    const prev = byCpt.get(cptCode) || byName.get(key);
    if (prev) {
      await pool.query(
        `UPDATE tbl_service_catalog
         SET category = ?, subcategory = ?, name = ?, department_name = ?, cpt_code = ?,
             price = ?, description = ?, status = 1, sort_order = ?, currency = 'XAF'
         WHERE id = ? LIMIT 1`,
        [category, subcategory, name, DEPARTMENT, cptCode, price, description, sortSn, prev.id]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO tbl_service_catalog
         (facility_id, category, subcategory, name, department_name, cpt_code, price, currency, status, sort_order, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'XAF', 1, ?, ?)`,
        [facilityId, category, subcategory, name, DEPARTMENT, cptCode, price, sortSn, description]
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

  return {
    total: MATERNITY_CATALOG_2026.length,
    inserted,
    updated,
    deactivated,
  };
}

module.exports = {
  MATERNITY_CATALOG_2026,
  seedMaternityServiceCatalog,
};
