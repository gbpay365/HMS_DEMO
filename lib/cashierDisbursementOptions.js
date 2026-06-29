'use strict';

const { glMaps } = require('./finGlAccountMaps');
const hmsCountry = require('./hmsCountry');

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

/** Petty-cash disbursements may only leave the till via these methods. */
const DISBURSEMENT_PAYMENT_METHODS_CM = ['Cash', 'MOMO', 'OM'];
const DISBURSEMENT_PAYMENT_METHODS_NG = ['Cash', 'Bank', 'CARD', 'Paystack', 'MOMO', 'Wallet'];

function disbursementPaymentMethods() {
  return hmsCountry.isNigeria ? [...DISBURSEMENT_PAYMENT_METHODS_NG] : [...DISBURSEMENT_PAYMENT_METHODS_CM];
}

const DISBURSEMENT_PAYMENT_METHODS = disbursementPaymentMethods();

const DISBURSEMENT_PAYMENT_ALIASES = hmsCountry.isNigeria
  ? {
      'mobile money': 'MOMO',
      ussd: 'MOMO',
      pos: 'CARD',
      card: 'CARD',
      transfer: 'Bank',
      paystack: 'Paystack',
      wallet: 'Wallet',
    }
  : {
      'mobile money': 'MOMO',
      'orange money': 'OM',
    };

function normalizeDisbursementPaymentMethod(raw) {
  let v = String(raw || 'Cash').trim();
  if (v === 'Mobile Money') v = 'MOMO';
  if (v === 'Orange Money') v = 'OM';
  const alias = DISBURSEMENT_PAYMENT_ALIASES[v.toLowerCase()];
  if (alias) v = alias;
  const allowed = new Set(disbursementPaymentMethods());
  if (!allowed.has(v)) {
    const methodsLabel = disbursementPaymentMethods().join(', ');
    return { ok: false, value: 'Cash', error: `Payment method must be one of: ${methodsLabel}.` };
  }
  return { ok: true, value: v };
}

const TYPE_GL_KIND = Object.fromEntries(DISBURSEMENT_TYPES.map((t) => [t.value, t.glKind]));

/** Payout GL mother templates (country-aware). */
const PAYOUT_GL_DEFAULT = glMaps().payoutDefault;
const PAYOUT_GL_BY_DISBURSEMENT_TYPE = {
  salary_advance: glMaps().payoutSalaryAdvance,
  payout: glMaps().payoutDefault,
  emergency: glMaps().payoutDefault,
  petty_cash: glMaps().pettyCash,
};

function payoutGlMotherForType(disbursementType) {
  const t = String(disbursementType || 'payout').trim().toLowerCase();
  return PAYOUT_GL_BY_DISBURSEMENT_TYPE[t] || PAYOUT_GL_DEFAULT;
}

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
  disbursementPaymentMethods,
  normalizeDisbursementPaymentMethod,
  PAYOUT_GL_DEFAULT,
  PAYOUT_GL_BY_DISBURSEMENT_TYPE,
  normalizeDisbursementType,
  normalizeDisbursementCategory,
  disbursementTypeLabel,
  payoutGlMotherForType,
};
