'use strict';

/** Common units for medical / hospital supplier purchase orders. */
const PROCUREMENT_UNITS = [
  { value: 'unit', label: 'Unit (each)' },
  { value: 'pack', label: 'Pack' },
  { value: 'box', label: 'Box' },
  { value: 'carton', label: 'Carton' },
  { value: 'case', label: 'Case' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'vial', label: 'Vial' },
  { value: 'ampoule', label: 'Ampoule' },
  { value: 'tube', label: 'Tube' },
  { value: 'sachet', label: 'Sachet' },
  { value: 'roll', label: 'Roll' },
  { value: 'pair', label: 'Pair' },
  { value: 'set', label: 'Set' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'L', label: 'Litre (L)' },
  { value: 'ml', label: 'Millilitre (ml)' },
  { value: 'm', label: 'Metre (m)' },
  { value: 'dozen', label: 'Dozen' },
  { value: 'pallet', label: 'Pallet' },
];

function normalizeProcurementUom(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '');
  if (!s) return 'unit';
  const hit = PROCUREMENT_UNITS.find((u) => u.value === s || u.label.toLowerCase().includes(s));
  if (hit) return hit.value;
  if (/^pack/i.test(s)) return 'pack';
  if (/^carton/i.test(s)) return 'carton';
  if (/^box/i.test(s)) return 'box';
  if (/^ampoule/i.test(s)) return 'ampoule';
  if (/^sachet/i.test(s)) return 'sachet';
  if (/^vial/i.test(s)) return 'vial';
  if (/^bottle/i.test(s)) return 'bottle';
  if (/^kg/i.test(s)) return 'kg';
  if (/^g$/i.test(s)) return 'g';
  if (/^l$/i.test(s) || /^litre/i.test(s)) return 'L';
  if (/^ml/i.test(s)) return 'ml';
  return s.slice(0, 32);
}

module.exports = { PROCUREMENT_UNITS, normalizeProcurementUom };
