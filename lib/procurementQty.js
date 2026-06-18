'use strict';

const { PROCUREMENT_UNITS, normalizeProcurementUom } = require('./procurementUnits');

const UOM_DISPLAY = {
  unit: 'Units',
  pack: 'Packs',
  box: 'Boxes',
  carton: 'Cartons',
  case: 'Cases',
  bottle: 'Bottles',
  vial: 'Vials',
  ampoule: 'Ampoules',
  tube: 'Tubes',
  sachet: 'Sachets',
  roll: 'Rolls',
  pair: 'Pairs',
  set: 'Sets',
  kg: 'kg',
  g: 'g',
  L: 'L',
  ml: 'ml',
  m: 'm',
  dozen: 'Dozen',
  pallet: 'Pallets',
};

function uomDisplayLabel(uom) {
  const key = normalizeProcurementUom(uom);
  if (UOM_DISPLAY[key]) return UOM_DISPLAY[key];
  if (!key || key === 'unit') return 'Units';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Parse "50 Cartons", "45 Ampoules", or separate qty + uom fields. */
function parseQtyWithUom(rawQty, rawUom) {
  const uomHint = String(rawUom || '').trim();
  const s = String(rawQty ?? '').trim();
  if (!s && !uomHint) return { quantity: 0, uom: 'unit' };

  if (uomHint && /^[\d.,]+$/.test(s)) {
    const quantity = parseFloat(s.replace(',', '.')) || 0;
    return { quantity, uom: normalizeProcurementUom(uomHint) };
  }

  const m = s.match(/^([\d.,]+)\s*(.+)$/);
  if (m) {
    const quantity = parseFloat(m[1].replace(',', '.')) || 0;
    return { quantity, uom: normalizeProcurementUom(m[2]) };
  }

  const quantity = parseFloat(s.replace(',', '.')) || 0;
  return { quantity, uom: uomHint ? normalizeProcurementUom(uomHint) : 'unit' };
}

/** Display quantity with unit label, e.g. "50 Cartons". */
function formatQtyWithUom(quantity, uom) {
  const q = parseFloat(quantity);
  if (!Number.isFinite(q)) return '—';
  const qtyStr = q % 1 === 0 ? String(Math.round(q)) : String(q);
  const label = uomDisplayLabel(uom);
  if (!uom || uom === 'unit' || label === 'Units') {
    return qtyStr;
  }
  return `${qtyStr} ${label}`;
}

module.exports = {
  parseQtyWithUom,
  formatQtyWithUom,
  uomDisplayLabel,
  PROCUREMENT_UNITS,
};
