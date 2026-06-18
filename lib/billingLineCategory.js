'use strict';

/** Server-side billing line category helpers (mirrors frontend billingPrintGroups). */

const BILLING_SECTION_ORDER = Object.freeze([
  'consultation',
  'laboratory',
  'radiology',
  'pharmacy',
  'maternity',
  'surgery',
  'nursing',
  'material',
  'service',
  'other',
]);

const PRIMARY_REVENUE_KEYS = Object.freeze([
  'consultation',
  'laboratory',
  'radiology',
  'pharmacy',
]);

function normalizeLineCategory(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'other';
  if (s === 'lab') return 'laboratory';
  if (s === 'rad') return 'radiology';
  if (s === 'pha' || s === 'medication' || s === 'medications') return 'pharmacy';
  if (BILLING_SECTION_ORDER.includes(s)) return s;
  return 'other';
}

function lineItemCategory(it) {
  if (!it) return 'other';
  return normalizeLineCategory(it.category || it.kind || it.item_type || it.department);
}

function lineItemAmount(it) {
  const direct = Number(it?.amount || 0);
  if (direct > 0) return direct;
  const unit = Number(it?.unit_price || 0);
  const qty = Number(it?.quantity || 1) || 1;
  return unit * qty;
}

function emptyTotals() {
  const out = {};
  for (const key of BILLING_SECTION_ORDER) out[key] = 0;
  return out;
}

module.exports = {
  BILLING_SECTION_ORDER,
  PRIMARY_REVENUE_KEYS,
  normalizeLineCategory,
  lineItemCategory,
  lineItemAmount,
  emptyTotals,
};
