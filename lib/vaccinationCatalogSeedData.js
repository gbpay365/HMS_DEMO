'use strict';

/**
 * EPI / routine vaccine catalog and service catalog seed (category: vaccination).
 */
const VACCINES = [
  { code: 'BCG', name: 'BCG (Tuberculosis)', doses: 1, interval: null, minAge: 0, route: 'ID', site: 'Left upper arm', category: 'routine', sort: 10 },
  { code: 'OPV0', name: 'OPV 0 (Birth dose)', doses: 1, interval: null, minAge: 0, route: 'Oral', site: 'Oral', category: 'routine', sort: 11 },
  { code: 'HEPB_BIRTH', name: 'Hepatitis B (Birth dose)', doses: 1, interval: null, minAge: 0, route: 'IM', site: 'Thigh', category: 'routine', sort: 12 },
  { code: 'PENTA1', name: 'Pentavalent 1 (DPT-Hib-HepB)', doses: 3, interval: 28, minAge: 42, route: 'IM', site: 'Thigh', category: 'routine', sort: 20 },
  { code: 'PENTA2', name: 'Pentavalent 2', doses: 3, interval: 28, minAge: 70, route: 'IM', site: 'Thigh', category: 'routine', sort: 21 },
  { code: 'PENTA3', name: 'Pentavalent 3', doses: 3, interval: 28, minAge: 98, route: 'IM', site: 'Thigh', category: 'routine', sort: 22 },
  { code: 'OPV1', name: 'OPV 1', doses: 3, interval: 28, minAge: 42, route: 'Oral', site: 'Oral', category: 'routine', sort: 30 },
  { code: 'OPV2', name: 'OPV 2', doses: 3, interval: 28, minAge: 70, route: 'Oral', site: 'Oral', category: 'routine', sort: 31 },
  { code: 'OPV3', name: 'OPV 3', doses: 3, interval: 28, minAge: 98, route: 'Oral', site: 'Oral', category: 'routine', sort: 32 },
  { code: 'PCV1', name: 'PCV 1 (Pneumococcal)', doses: 3, interval: 28, minAge: 42, route: 'IM', site: 'Thigh', category: 'routine', sort: 40 },
  { code: 'PCV2', name: 'PCV 2', doses: 3, interval: 28, minAge: 70, route: 'IM', site: 'Thigh', category: 'routine', sort: 41 },
  { code: 'PCV3', name: 'PCV 3', doses: 3, interval: 28, minAge: 98, route: 'IM', site: 'Thigh', category: 'routine', sort: 42 },
  { code: 'ROTA1', name: 'Rotavirus 1', doses: 2, interval: 28, minAge: 42, route: 'Oral', site: 'Oral', category: 'routine', sort: 50 },
  { code: 'ROTA2', name: 'Rotavirus 2', doses: 2, interval: 28, minAge: 70, route: 'Oral', site: 'Oral', category: 'routine', sort: 51 },
  { code: 'MR1', name: 'Measles-Rubella 1', doses: 2, interval: 180, minAge: 270, route: 'SC', site: 'Left upper arm', category: 'routine', sort: 60 },
  { code: 'MR2', name: 'Measles-Rubella 2', doses: 2, interval: 180, minAge: 450, route: 'SC', site: 'Left upper arm', category: 'routine', sort: 61 },
  { code: 'TT1', name: 'Tetanus Toxoid 1', doses: 5, interval: 28, minAge: null, route: 'IM', site: 'Upper arm', category: 'routine', sort: 70 },
  { code: 'TT2', name: 'Tetanus Toxoid 2', doses: 5, interval: 28, minAge: null, route: 'IM', site: 'Upper arm', category: 'routine', sort: 71 },
  { code: 'TT3', name: 'Tetanus Toxoid 3', doses: 5, interval: 180, minAge: null, route: 'IM', site: 'Upper arm', category: 'routine', sort: 72 },
  { code: 'TT4', name: 'Tetanus Toxoid 4', doses: 5, interval: 365, minAge: null, route: 'IM', site: 'Upper arm', category: 'routine', sort: 73 },
  { code: 'TT5', name: 'Tetanus Toxoid 5', doses: 5, interval: null, minAge: null, route: 'IM', site: 'Upper arm', category: 'routine', sort: 74 },
  { code: 'YELLOW_FEVER', name: 'Yellow Fever', doses: 1, interval: null, minAge: 270, route: 'SC', site: 'Left upper arm', category: 'travel', sort: 80 },
  { code: 'MENINGITIS', name: 'Meningitis A/C/Y/W-135', doses: 1, interval: null, minAge: null, route: 'IM', site: 'Upper arm', category: 'travel', sort: 81 },
  { code: 'HEPB_ADULT', name: 'Hepatitis B (Adult series)', doses: 3, interval: 30, minAge: null, route: 'IM', site: 'Upper arm', category: 'occupational', sort: 90 },
  { code: 'INFLUENZA', name: 'Influenza (Seasonal)', doses: 1, interval: 365, minAge: null, route: 'IM', site: 'Upper arm', category: 'other', sort: 91 },
  { code: 'COVID19', name: 'COVID-19', doses: 2, interval: 28, minAge: null, route: 'IM', site: 'Upper arm', category: 'other', sort: 92 },
  { code: 'HPV1', name: 'HPV 1', doses: 2, interval: 180, minAge: 3285, route: 'IM', site: 'Upper arm', category: 'routine', sort: 62 },
  { code: 'HPV2', name: 'HPV 2', doses: 2, interval: 180, minAge: 3465, route: 'IM', site: 'Upper arm', category: 'routine', sort: 63 },
];

const SERVICE_CATALOG = [
  { name: 'Vaccination — Routine EPI dose', price: 1000, unit: 'Per dose' },
  { name: 'Vaccination — Travel vaccine', price: 15000, unit: 'Per dose' },
  { name: 'Vaccination — Occupational / Hep B series', price: 5000, unit: 'Per dose' },
  { name: 'Vaccination — Influenza', price: 8000, unit: 'Per dose' },
  { name: 'Vaccination — COVID-19', price: 0, unit: 'Per dose' },
  { name: 'Immunization card / certificate', price: 500, unit: 'Once' },
  { name: 'Vaccination counselling session', price: 1000, unit: 'Per session' },
];

async function seedVaccinationCatalog(pool) {
  for (const v of VACCINES) {
    await pool.query(
      `INSERT INTO vaccination_vaccines (code, name, doses_required, interval_days, min_age_days, route, site, category, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), doses_required=VALUES(doses_required),
         interval_days=VALUES(interval_days), min_age_days=VALUES(min_age_days),
         route=VALUES(route), site=VALUES(site), category=VALUES(category), sort_order=VALUES(sort_order)`,
      [v.code, v.name, v.doses, v.interval, v.minAge, v.route, v.site, v.category, v.sort]
    );
  }

  for (const s of SERVICE_CATALOG) {
    const [ex] = await pool.query(
      `SELECT id FROM tbl_service_catalog WHERE category = 'vaccination' AND name = ? LIMIT 1`,
      [s.name]
    );
    if (ex.length) continue;
    await pool.query(
      `INSERT INTO tbl_service_catalog (category, name, unit_price, unit, active, description)
       VALUES ('vaccination', ?, ?, ?, 1, ?)`,
      [s.name, s.price, s.unit, 'Vaccination module']
    ).catch(() => {});
  }
}

module.exports = { VACCINES, SERVICE_CATALOG, seedVaccinationCatalog };
