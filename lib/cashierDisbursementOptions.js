'use strict';

/**
 * Cash disbursement modal options — shared by cashier UI and server validation.
 */

const DISBURSEMENT_TYPES = [
  { value: 'expense', glKind: 'expense', label: 'Operating expense (utilities, supplies…)' },
  { value: 'payout', glKind: 'payout', label: 'Staff / admin advance (payout)' },
  { value: 'vendor', glKind: 'expense', label: 'Vendor / supplier payment' },
  { value: 'salary_advance', glKind: 'payout', label: 'Salary advance' },
  { value: 'emergency', glKind: 'payout', label: 'Emergency cash out' },
  { value: 'petty_cash', glKind: 'payout', label: 'Petty cash replenishment' },
  { value: 'equipment', glKind: 'expense', label: 'Equipment purchase' },
  { value: 'pharmacy', glKind: 'expense', label: 'Pharmacy stock / drugs' },
  { value: 'fuel', glKind: 'expense', label: 'Fuel / transport' },
  { value: 'maintenance', glKind: 'expense', label: 'Repairs & maintenance' },
  { value: 'professional', glKind: 'expense', label: 'Professional / consultancy fees' },
  { value: 'tax_duty', glKind: 'expense', label: 'Taxes & statutory duties' },
  { value: 'bank_charges', glKind: 'expense', label: 'Bank charges & fees' },
  { value: 'insurance', glKind: 'expense', label: 'Insurance premium' },
  { value: 'cleaning', glKind: 'expense', label: 'Cleaning & hygiene' },
  { value: 'security', glKind: 'expense', label: 'Security services' },
  { value: 'catering', glKind: 'expense', label: 'Food / catering' },
  { value: 'laundry', glKind: 'expense', label: 'Laundry & linen' },
  { value: 'communication', glKind: 'expense', label: 'Phone / internet / postage' },
  { value: 'rent', glKind: 'expense', label: 'Rent & lease' },
];

const DISBURSEMENT_CATEGORIES = [
  { value: 'utilities', label: 'Utilities (water, electricity)' },
  { value: 'supplies', label: 'Office & medical supplies' },
  { value: 'pharmacy', label: 'Pharmacy / drugs' },
  { value: 'medical', label: 'Medical consumables' },
  { value: 'equipment', label: 'Equipment & instruments' },
  { value: 'rent', label: 'Rent & facilities' },
  { value: 'transport', label: 'Transport & fuel' },
  { value: 'communications', label: 'Communications' },
  { value: 'maintenance', label: 'Maintenance & repairs' },
  { value: 'salary', label: 'Salaries & wages' },
  { value: 'external', label: 'External services' },
  { value: 'professional_fees', label: 'Professional fees' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'tax_duty', label: 'Taxes & duties' },
  { value: 'bank', label: 'Bank charges' },
  { value: 'cleaning', label: 'Cleaning & waste' },
  { value: 'security', label: 'Security' },
  { value: 'catering', label: 'Catering & meals' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'general', label: 'General / other' },
];

const DISBURSEMENT_PAYMENT_METHODS = [
  'Cash',
  'MOMO',
  'OM',
  'Bank',
  'Bank Transfer',
  'BetterPay',
  'Wallet',
  'Card',
];

const TYPE_GL_KIND = Object.fromEntries(DISBURSEMENT_TYPES.map((t) => [t.value, t.glKind]));

function normalizeDisbursementType(raw) {
  const v = String(raw || 'expense').trim().toLowerCase();
  if (TYPE_GL_KIND[v]) {
    return { txnType: v, glKind: TYPE_GL_KIND[v] };
  }
  if (v === 'payout' || v.includes('advance')) {
    return { txnType: 'payout', glKind: 'payout' };
  }
  return { txnType: 'expense', glKind: 'expense' };
}

function normalizeDisbursementCategory(raw) {
  const v = String(raw || 'general').trim().toLowerCase().slice(0, 48);
  const allowed = new Set(DISBURSEMENT_CATEGORIES.map((c) => c.value));
  return allowed.has(v) ? v : 'general';
}

function disbursementTypeLabel(value) {
  const row = DISBURSEMENT_TYPES.find((t) => t.value === value);
  return row?.label || value;
}

module.exports = {
  DISBURSEMENT_TYPES,
  DISBURSEMENT_CATEGORIES,
  DISBURSEMENT_PAYMENT_METHODS,
  normalizeDisbursementType,
  normalizeDisbursementCategory,
  disbursementTypeLabel,
};
