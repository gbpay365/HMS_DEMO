'use strict';

const {
  DEFAULT_TVA_RATE,
  TVA_COLLECTED_ACCOUNT,
  TVA_DEDUCTIBLE_ACCOUNT,
} = require('./finAccountingConfig');
const { glMaps } = require('./finGlAccountMaps');

const EXPENSE_CATEGORY_ACCOUNTS = { ...glMaps().expense };

const EXPENSE_CATEGORY_ALIASES = {
  supplies: 'general',
  equipment: 'general',
  transport: 'general',
  communications: 'general',
  maintenance: 'general',
  insurance: 'general',
  'taxes & duties': 'general',
  'bank charges': 'bank',
  'salaries & wages': 'salary',
  'professional fees': 'external',
  professional_fees: 'external',
  tax_duty: 'general',
  cleaning: 'general',
  security: 'general',
  catering: 'general',
  laundry: 'general',
  fuel: 'transport',
  other: 'general',
};

/** Stock asset accounts when goods are received on a purchase order. */
const PURCHASE_STOCK_ACCOUNTS = { ...glMaps().purchaseStock };

const SUPPLIER_PAYABLE_ACCOUNT = glMaps().supplierPayable;

function resolveExpenseCategoryKey(category) {
  const k = String(category || 'general').trim().toLowerCase();
  if (EXPENSE_CATEGORY_ACCOUNTS[k]) return k;
  return EXPENSE_CATEGORY_ALIASES[k] || 'general';
}

async function loadTvaRate(pool, facilityId) {
  try {
    const [[r]] = await pool.query(
      `SELECT setting_value FROM tbl_hms_fin_setting
       WHERE facility_id = ? AND setting_key = 'tva_rate_standard' LIMIT 1`,
      [facilityId]
    );
    const v = parseFloat(r?.setting_value);
    return Number.isFinite(v) && v > 0 ? v / 100 : DEFAULT_TVA_RATE;
  } catch (_) {
    return DEFAULT_TVA_RATE;
  }
}

function splitTtcLines(ttcAmount, tvaRate, debitSide) {
  const ttc = Math.round((parseFloat(ttcAmount) || 0) * 100) / 100;
  if (ttc <= 0) return { ht: 0, tva: 0, ttc: 0, lines: [] };
  const rate = Number.isFinite(tvaRate) && tvaRate > 0 ? tvaRate : DEFAULT_TVA_RATE;
  const ht = Math.round((ttc / (1 + rate)) * 100) / 100;
  const tva = Math.round((ttc - ht) * 100) / 100;
  return { ht, tva, ttc, rate };
}

function buildReceiptLines(amount, paymentMethod, cashLikeAccount, serviceKey, tvaRate, applyTva) {
  const cash = cashLikeAccount(paymentMethod);
  const { revenueAccountForCategory } = require('./finGlAccountMaps');
  const revCode = revenueAccountForCategory(serviceKey);
  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  if (amt <= 0) return [];

  if (!applyTva) {
    return [
      { code: cash.code, label: cash.label, debit: amt, credit: 0 },
      { code: revCode, label: 'Healthcare revenue', debit: 0, credit: amt },
    ];
  }

  const { ht, tva } = splitTtcLines(amt, tvaRate, false);
  return [
    { code: cash.code, label: cash.label, debit: amt, credit: 0, tva_rate: null, tva_amount: null },
    { code: revCode, label: 'Healthcare revenue (HT)', debit: 0, credit: ht, tva_rate: null, tva_amount: null },
    {
      code: TVA_COLLECTED_ACCOUNT,
      label: 'VAT collected',
      debit: 0,
      credit: tva,
      tva_rate: tvaRate,
      tva_amount: tva,
    },
  ];
}

function buildExpenseLines(amount, paymentMethod, cashLikeAccount, category, tvaRate, applyTva) {
  const cash = cashLikeAccount(paymentMethod);
  const catKey = resolveExpenseCategoryKey(category);
  const expCode = EXPENSE_CATEGORY_ACCOUNTS[catKey] || EXPENSE_CATEGORY_ACCOUNTS.general;
  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  if (amt <= 0) return [];

  if (!applyTva) {
    return [
      { code: expCode, label: `Expense — ${category || 'General'}`, debit: amt, credit: 0 },
      { code: cash.code, label: cash.label, debit: 0, credit: amt },
    ];
  }

  const { ht, tva } = splitTtcLines(amt, tvaRate, true);
  return [
    { code: expCode, label: `Expense (HT) — ${category || 'General'}`, debit: ht, credit: 0 },
    {
      code: TVA_DEDUCTIBLE_ACCOUNT,
      label: 'VAT deductible',
      debit: tva,
      credit: 0,
      tva_rate: tvaRate,
      tva_amount: tva,
    },
    { code: cash.code, label: cash.label, debit: 0, credit: amt },
  ];
}

function buildPurchaseOrderLines(amount, stockKind, tvaRate, applyTva) {
  const stockCode = PURCHASE_STOCK_ACCOUNTS[stockKind] || PURCHASE_STOCK_ACCOUNTS.default;
  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  if (amt <= 0) return [];

  if (!applyTva) {
    return [
      { code: stockCode, label: 'Stock inventory', debit: amt, credit: 0 },
      { code: SUPPLIER_PAYABLE_ACCOUNT, label: 'Suppliers payable', debit: 0, credit: amt },
    ];
  }

  const { ht, tva } = splitTtcLines(amt, tvaRate, true);
  return [
    { code: stockCode, label: 'Stock inventory (HT)', debit: ht, credit: 0 },
    {
      code: TVA_DEDUCTIBLE_ACCOUNT,
      label: 'VAT deductible',
      debit: tva,
      credit: 0,
      tva_rate: tvaRate,
      tva_amount: tva,
    },
    { code: SUPPLIER_PAYABLE_ACCOUNT, label: 'Suppliers payable', debit: 0, credit: amt },
  ];
}

module.exports = {
  EXPENSE_CATEGORY_ACCOUNTS,
  EXPENSE_CATEGORY_ALIASES,
  PURCHASE_STOCK_ACCOUNTS,
  SUPPLIER_PAYABLE_ACCOUNT,
  resolveExpenseCategoryKey,
  loadTvaRate,
  splitTtcLines,
  buildReceiptLines,
  buildExpenseLines,
  buildPurchaseOrderLines,
  TVA_COLLECTED_ACCOUNT,
  TVA_DEDUCTIBLE_ACCOUNT,
};
