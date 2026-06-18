'use strict';

const { resolveMedToCatalog } = require('./pharmacyCatalogResolve');

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isCustomDrug(catalogName, customName) {
  return !!String(customName || '').trim();
}

function resolvedDrugName(catalogName, customName, legacyName) {
  return String(customName || '').trim() || String(catalogName || '').trim() || String(legacyName || '').trim();
}

function priceFromCatalogList(catalog, catalogName) {
  const key = normName(catalogName);
  if (!key) return 0;
  const hit = (catalog || []).find((item) => normName(item.name) === key);
  return hit ? parseFloat(hit.price != null ? hit.price : 0) || 0 : 0;
}

/**
 * OPD / shared pharmacy catalog unit price (per dispense unit).
 */
async function resolveOpdDrugUnitPrice(pool, { catalogName, customName, legacyName, catalogList }) {
  const custom = String(customName || '').trim();
  const name = resolvedDrugName(catalogName, customName, legacyName);
  if (!name) return { name: '', unitPrice: 0, isCustom: false, catId: null };
  if (custom) return { name: custom, unitPrice: 0, isCustom: true, catId: null };

  if (Array.isArray(catalogList) && catalogList.length) {
    const fromList = priceFromCatalogList(catalogList, catalogName || name);
    if (fromList > 0) {
      const hit = catalogList.find((item) => normName(item.name) === normName(catalogName || name));
      return {
        name: hit?.name || name,
        unitPrice: fromList,
        isCustom: false,
        catId: hit?.id ? parseInt(hit.id, 10) || null : null,
      };
    }
  }

  const info = await resolveMedToCatalog(pool, name);
  return {
    name: info.name || name,
    unitPrice: info.catId ? parseFloat(info.price || 0) || 0 : 0,
    isCustom: !info.catId,
    catId: info.catId,
    inventoryItemId: info.inventoryItemId,
  };
}

/**
 * IPD inventory / service catalog unit price (per dose).
 */
async function resolveIpdDrugUnitPrice(pool, { catalogName, customName, inventoryList }) {
  const custom = String(customName || '').trim();
  const catalog = String(catalogName || '').trim();
  const name = custom || catalog;
  if (!name) return { name: '', unitPrice: 0, isCustom: false };

  if (custom) return { name: custom, unitPrice: 0, isCustom: true };

  if (Array.isArray(inventoryList) && inventoryList.length) {
    const p = priceFromCatalogList(inventoryList, catalog);
    if (p > 0) return { name: catalog, unitPrice: p, isCustom: false };
  }

  const info = await resolveMedToCatalog(pool, catalog || name);
  return {
    name: info.name || catalog || name,
    unitPrice: info.catId ? parseFloat(info.price || 0) || 0 : 0,
    isCustom: !info.catId,
    catId: info.catId,
  };
}

function prescriptionDoseTotal(unitPrice, timesPerDay, durationDays) {
  const price = parseFloat(unitPrice) || 0;
  const tpd = Math.max(1, parseInt(timesPerDay, 10) || 1);
  const days = Math.max(1, parseInt(durationDays, 10) || 1);
  return Math.round(price * tpd * days * 100) / 100;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  isCustomDrug,
  resolvedDrugName,
  priceFromCatalogList,
  resolveOpdDrugUnitPrice,
  resolveIpdDrugUnitPrice,
  prescriptionDoseTotal,
  todayIsoDate,
};
