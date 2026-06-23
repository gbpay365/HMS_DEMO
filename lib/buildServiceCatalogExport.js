'use strict';

const fs = require('fs');
const path = require('path');
const { loadCatalogPayload, revenueAccountForCategory } = require('./hospitalServiceRevenueAccounts');

const CATALOG_PATH = path.join(__dirname, 'data', 'hospital_service_catalog_prices.json');

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function cloneByAccountCode(src) {
  const out = {};
  for (const [code, entry] of Object.entries(src || {})) {
    out[code] = {
      ...entry,
      services: Array.isArray(entry.services) ? entry.services.map((s) => ({ ...s })) : [],
    };
  }
  return out;
}

/**
 * Merge live tbl_service_catalog rows into the by_account_code structure used by Account_Core.
 * Existing JSON structure is preserved; prices and new services are updated from the database.
 */
async function buildServiceCatalogFromDb(pool) {
  const base = loadCatalogPayload();
  const byCode = cloneByAccountCode(base.by_account_code || {});

  const [rows] = await pool
    .query(
      `SELECT id, category, name, department_name, price, status
         FROM tbl_service_catalog
        ORDER BY category, name`
    )
    .catch(() => [[]]);

  for (const row of rows || []) {
    const name = String(row.name || '').trim();
    if (!name) continue;
    const price = Math.max(0, parseFloat(row.price) || 0);
    const active = parseInt(String(row.status ?? 1), 10) !== 0;
    const norm = normalizeName(name);

    let matched = false;
    for (const entry of Object.values(byCode)) {
      const services = entry.services || [];
      const svc = services.find((s) => normalizeName(s.name) === norm);
      if (svc) {
        if (active) svc.price = price;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (!active) continue;

    const accountCode = revenueAccountForCategory(row.category);
    if (!byCode[accountCode]) {
      const cat = String(row.category || 'service').toLowerCase();
      byCode[accountCode] = {
        account_code: accountCode,
        label: `Revenue — ${cat}`,
        hms_category: cat,
        hms_subcategory: row.department_name || null,
        services: [],
        default_price: price,
      };
    }
    const key = `DB${row.id}`;
    byCode[accountCode].services.push({ key, name, price });
  }

  for (const entry of Object.values(byCode)) {
    const services = (entry.services || []).filter((s) => s && s.name);
    entry.services = services;
    if (services.length) {
      entry.default_price = services[0].price;
    }
  }

  return {
    source: 'C:\\HMS_JS',
    generated_at: new Date().toISOString(),
    currency: base.currency || 'XAF',
    by_account_code: byCode,
  };
}

async function writeServiceCatalogFile(pool) {
  const payload = await buildServiceCatalogFromDb(pool);
  fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

module.exports = {
  CATALOG_PATH,
  buildServiceCatalogFromDb,
  writeServiceCatalogFile,
};
