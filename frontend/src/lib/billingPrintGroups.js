/** Canonical billing section order for print grouping. */
export const BILLING_SECTION_ORDER = [
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
];

const CATEGORY_LABEL_KEYS = {
  consultation: 'receipt.consultation',
  laboratory: 'receipt.laboratory',
  radiology: 'receipt.radiology',
  pharmacy: 'receipt.pharmacy',
  maternity: 'receipt.maternity',
  surgery: 'receipt.surgery',
  nursing: 'receipt.nursing',
  material: 'receipt.materials',
  service: 'receipt.other_services',
  other: 'receipt.other_services'};

export function normalizeLineCategory(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'other';
  if (s === 'lab') return 'laboratory';
  if (s === 'rad') return 'radiology';
  if (s === 'pha' || s === 'medication' || s === 'medications') return 'pharmacy';
  if (BILLING_SECTION_ORDER.includes(s)) return s;
  return 'other';
}

export function lineItemCategory(it) {
  if (!it) return 'other';
  return normalizeLineCategory(it.category || it.kind || it.item_type || it.department);
}

export function lineItemAmount(it) {
  const qty = Number(it.quantity || 1) || 1;
  const unit = Number(it.unit_price || 0) || 0;
  const patientDue = Number(it.patient_due);
  if (Number.isFinite(patientDue) && patientDue >= 0) return patientDue;
  return Number(it.amount || 0) || unit * qty;
}

export function categoryLabelKey(category) {
  return CATEGORY_LABEL_KEYS[category] || CATEGORY_LABEL_KEYS.other;
}

/** Group line items by category with per-section subtotals (preserves first-seen order within canonical sort). */
export function groupLineItemsByCategory(lineItems) {
  const buckets = new Map();
  for (const it of lineItems || []) {
    const key = lineItemCategory(it);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }

  const keys = [...buckets.keys()].sort(
    (a, b) => BILLING_SECTION_ORDER.indexOf(a) - BILLING_SECTION_ORDER.indexOf(b)
  );

  return keys.map((key) => {
    const items = buckets.get(key) || [];
    const subtotal = items.reduce((sum, it) => sum + lineItemAmount(it), 0);
    return { key, items, subtotal };
  });
}

/** Flatten grouped rows for table rendering: line rows + optional subtotal row after each group. */
export function flattenGroupedLineRows(groups, { subtotals = true } = {}) {
  const rows = [];
  let rowNo = 0;
  for (const group of groups || []) {
    for (const item of group.items) {
      rowNo += 1;
      rows.push({ type: 'item', rowNo, item, groupKey: group.key });
    }
    if (subtotals && group.items.length) {
      rows.push({ type: 'subtotal', groupKey: group.key, subtotal: group.subtotal });
    }
  }
  return rows;
}
