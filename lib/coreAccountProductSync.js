'use strict';

const cfg = require('./integrationConfig');

/** Top-level HMS tbl_service_catalog.category → ERP product family. */
const CATEGORY_LABELS = {
  consultation: { en: 'Consultation', fr: 'Consultation' },
  laboratory: { en: 'Laboratory', fr: 'Laboratoire' },
  radiology: { en: 'Radiology', fr: 'Radiologie' },
  scans_imaging: { en: 'Scans & Imaging', fr: 'Imagerie médicale' },
  scan: { en: 'Scans & Imaging', fr: 'Imagerie médicale' },
  pharmacy: { en: 'Pharmacy', fr: 'Pharmacie' },
  surgery: { en: 'Surgery', fr: 'Chirurgie' },
  maternity: { en: 'Maternity & Obstetrics', fr: 'Maternité & obstétrique' },
  ward: { en: 'Ward & Nursing', fr: 'Soins & hospitalisation' },
  service: { en: 'Clinical Services', fr: 'Services cliniques' },
  hospitalisation: { en: 'Hospitalisation', fr: 'Hospitalisation' },
  emergency: { en: 'Emergency', fr: 'Urgences' },
  charge: { en: 'Patient Charges', fr: 'Frais patients' },
  inventory: { en: 'Stock & Supplies', fr: 'Stock & fournitures' },
};

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function titleCase(value) {
  return String(value || '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Map HMS catalog row → product family (category or pharmacy/lab subcategory).
 */
function familyForCatalogRow(row) {
  const cat = String(row.category || 'service').toLowerCase();
  const sub = String(row.subcategory || '').trim();

  // Pharmacy & laboratory: prefer therapeutic / departmental subcategory as family
  if ((cat === 'pharmacy' || cat === 'laboratory') && sub) {
    const key = `${cat}:${slug(sub)}`;
    return { key, nameEn: sub, nameFr: sub };
  }

  const labels = CATEGORY_LABELS[cat] || { en: titleCase(cat), fr: titleCase(cat) };
  return { key: cat, nameEn: labels.en, nameFr: labels.fr };
}

function safeCode(prefix, raw, id) {
  const base = String(raw || `${prefix}-${id}`)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 48);
  return `HMS-${prefix}-${base || id}`.slice(0, 64);
}

async function buildProductSyncPayload(pool) {
  const [catalogRows] = await pool
    .query(
      `SELECT id, category, subcategory, name, description, cpt_code, price, status
         FROM tbl_service_catalog
        ORDER BY category, subcategory, name`
    )
    .catch(() => [[]]);

  const [invRows] = await pool
    .query(
      `SELECT id, sku, name, category, quantity, reorder_level, unit_price, service_catalog_id
         FROM tbl_inventory_item
        ORDER BY name`
    )
    .catch(() => [[]]);

  const stockByCatalogId = new Map();
  for (const inv of invRows || []) {
    const catId = parseInt(String(inv.service_catalog_id || ''), 10);
    if (catId < 1) continue;
    const prev = stockByCatalogId.get(catId) || { qty: 0, reorder: null };
    stockByCatalogId.set(catId, {
      qty: prev.qty + (parseInt(String(inv.quantity), 10) || 0),
      reorder: inv.reorder_level != null ? Number(inv.reorder_level) : prev.reorder,
    });
  }

  const products = [];

  for (const row of catalogRows || []) {
    const id = parseInt(String(row.id), 10) || 0;
    if (id < 1) continue;
    const active = parseInt(String(row.status ?? 1), 10) !== 0;
    const family = familyForCatalogRow(row);
    const stock = stockByCatalogId.get(id);
    const cpt = String(row.cpt_code || '').trim();

    products.push({
      source: 'service_catalog',
      hms_id: id,
      code: safeCode('SVC', cpt || `SVC${id}`, id),
      name_en: String(row.name || '').trim(),
      name_fr: String(row.name || '').trim(),
      description: String(row.subcategory || row.description || '').trim(),
      unit_price: Math.max(0, parseFloat(row.price) || 0),
      stock_quantity: stock?.qty ?? 0,
      reorder_threshold: stock?.reorder ?? null,
      tax_rate: 19.25,
      family_key: family.key,
      family_name_en: family.nameEn,
      family_name_fr: family.nameFr,
      hms_category: String(row.category || '').toLowerCase(),
      hms_subcategory: String(row.subcategory || '').trim(),
      is_active: active,
      valuation_method: 'FIFO',
    });
  }

  for (const inv of invRows || []) {
    const catId = parseInt(String(inv.service_catalog_id || ''), 10);
    if (catId > 0) continue;

    const id = parseInt(String(inv.id), 10) || 0;
    if (id < 1) continue;
    const labels = CATEGORY_LABELS.inventory;

    products.push({
      source: 'inventory',
      hms_id: id,
      code: safeCode('INV', inv.sku, id),
      name_en: String(inv.name || '').trim(),
      name_fr: String(inv.name || '').trim(),
      description: String(inv.category || '').trim(),
      unit_price: Math.max(0, parseFloat(inv.unit_price) || 0),
      stock_quantity: Math.max(0, parseInt(String(inv.quantity), 10) || 0),
      reorder_threshold: inv.reorder_level != null ? Number(inv.reorder_level) : null,
      tax_rate: 19.25,
      family_key: 'inventory',
      family_name_en: labels.en,
      family_name_fr: labels.fr,
      is_active: true,
      valuation_method: 'FIFO',
    });
  }

  return {
    facility_id: cfg.facilityId(),
    replace_all: true,
    products,
  };
}

async function postJson(url, body, headers) {
  if (typeof fetch !== 'function') {
    return { ok: false, status: 0, data: { error: 'fetch unavailable' } };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Push HMS service catalog + inventory stock to Account_Core Products table.
 */
async function syncProductsToAccountCore(pool, opts = {}) {
  const payload = await buildProductSyncPayload(pool);
  const dryRun = !!opts.dryRun;

  if (dryRun) {
    return { ok: true, dryRun: true, count: payload.products.length, sample: payload.products.slice(0, 3) };
  }

  if (!cfg.isIntegrationEnabled()) {
    return { ok: false, skipped: true, reason: 'CORE_ACCOUNT_SYNC_ENABLED is not 1', count: payload.products.length };
  }

  const url = cfg.coreAccountUrl();
  const key = cfg.coreAccountApiKey();
  if (!url || !key) {
    return { ok: false, skipped: true, reason: 'missing CORE_ACCOUNT_URL or API key', count: payload.products.length };
  }

  const res = await postJson(`${url}/api/v1/integrations/products`, payload, {
    'X-API-Key': key,
    'X-Facility-Id': String(cfg.facilityId()),
  });

  if (!res.ok) {
    console.error('[product-sync] Account_Core rejected:', res.status, res.data);
    return { ok: false, status: res.status, data: res.data, count: payload.products.length };
  }

  console.log('[product-sync] pushed', payload.products.length, 'products to Account_Core');
  return { ok: true, status: res.status, data: res.data, count: payload.products.length };
}

let debounceTimer = null;

function scheduleProductSync(pool) {
  if (!pool) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    syncProductsToAccountCore(pool).catch((e) => {
      console.error('[product-sync]', e.message || e);
    });
  }, 600);
}

module.exports = {
  buildProductSyncPayload,
  syncProductsToAccountCore,
  scheduleProductSync,
  familyForCatalogRow,
  CATEGORY_LABELS,
};
