#!/usr/bin/env node
'use strict';
/** Generates lib/surgeryCatalogSeedData.js from embedded tariff tuples. */
const fs = require('fs');
const path = require('path');

const sections = {
  gs: 'General Surgery',
  ob: 'Obstetrics & Gynecology',
  or: 'Orthopedics & Trauma',
  ur: 'Urology',
  en: 'ENT',
  op: 'Ophthalmology',
};

const data = require('./surgery-tariff-tuples.json');

const items = data.map(([sn, key, name, s, t, a, notes]) => {
  const section = sections[key];
  const price = s + t + a;
  const code = 'SURG' + String(sn).padStart(3, '0');
  const descParts = [
    'Surgeon: ' + s.toLocaleString('en-US'),
    'Theatre: ' + t.toLocaleString('en-US'),
    'Anaesthesia: ' + a.toLocaleString('en-US'),
  ];
  if (notes) descParts.push(notes);
  return {
    sn,
    name,
    section,
    surgeon: s,
    theatre: t,
    anaesthesia: a,
    price,
    code,
    notes: notes || '',
    description: descParts.join('; '),
  };
});

const out = `'use strict';

/**
 * Surgical procedures tariff — Service Catalog (category: surgery).
 * Bundled price = surgeon + theatre + anaesthesia (per hospital tariff schedule).
 * Source: SURGICAL PROCEDURES — TARIFF SCHEDULE (127 procedures).
 */
const SURGERY_CATALOG_2026 = ${JSON.stringify(items, null, 2)};

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\\s+/g, ' ');
}

function cptForItem(item) {
  if (item.code) return String(item.code).slice(0, 20);
  const sn = parseInt(item.sn, 10) || 0;
  return 'SURG' + String(sn).padStart(3, '0');
}

/**
 * Upsert surgery rows into tbl_service_catalog.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ deactivateMissing?: boolean, facilityId?: number }} [opts]
 */
async function seedSurgeryServiceCatalog(pool, opts = {}) {
  const category = 'surgery';
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  let inserted = 0;
  let updated = 0;

  const [existing] = await pool.query(
    \`SELECT id, name, price, department_name, status, cpt_code, facility_id, description
     FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) IN ('surgery', 'procedure') AND facility_id = ?\`,
    [facilityId]
  );
  const byName = new Map();
  const byCpt = new Map();
  for (const row of existing || []) {
    byName.set(normName(row.name), row);
    if (row.cpt_code) byCpt.set(String(row.cpt_code), row);
  }

  const seededCodes = new Set();

  for (const item of SURGERY_CATALOG_2026) {
    const name = String(item.name).trim();
    const department = String(item.section || 'Surgery').trim();
    const subcategory = department;
    const sortSn = parseInt(item.sn, 10) || 0;
    const cptCode = cptForItem(item);
    const price = Math.max(0, parseInt(item.price, 10) || 0);
    const description = item.description ? String(item.description).trim() : null;
    seededCodes.add(cptCode);

    const prev = byCpt.get(cptCode) || byName.get(normName(name));
    if (prev) {
      await pool.query(
        \`UPDATE tbl_service_catalog
         SET category = ?, subcategory = ?, name = ?, department_name = ?, cpt_code = ?,
             price = ?, description = ?, status = 1, sort_order = ?, currency = 'XAF'
         WHERE id = ? LIMIT 1\`,
        [category, subcategory, name, department, cptCode, price, description, sortSn, prev.id]
      );
      updated++;
    } else {
      await pool.query(
        \`INSERT INTO tbl_service_catalog
         (facility_id, category, subcategory, name, department_name, cpt_code, price, currency, status, sort_order, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'XAF', 1, ?, ?)\`,
        [facilityId, category, subcategory, name, department, cptCode, price, sortSn, description]
      );
      inserted++;
    }
  }

  let deactivated = 0;
  if (opts.deactivateMissing) {
    for (const row of existing || []) {
      const code = String(row.cpt_code || '');
      if (code.startsWith('SURG') && seededCodes.has(code)) continue;
      if (seededCodes.has(code)) continue;
      if (normName(row.name) && SURGERY_CATALOG_2026.some((i) => normName(i.name) === normName(row.name))) continue;
      if (row.status === 0) continue;
      await pool.query('UPDATE tbl_service_catalog SET status = 0 WHERE id = ? LIMIT 1', [row.id]);
      deactivated++;
    }
  }

  return { total: SURGERY_CATALOG_2026.length, inserted, updated, deactivated };
}

module.exports = {
  SURGERY_CATALOG_2026,
  seedSurgeryServiceCatalog,
};
`;

const tuplesPath = path.join(__dirname, 'surgery-tariff-tuples.json');
if (!fs.existsSync(tuplesPath)) {
  console.error('Missing', tuplesPath);
  process.exit(1);
}

fs.writeFileSync(path.join(__dirname, '..', 'lib', 'surgeryCatalogSeedData.js'), out, 'utf8');
console.log('Wrote lib/surgeryCatalogSeedData.js with', items.length, 'procedures');
