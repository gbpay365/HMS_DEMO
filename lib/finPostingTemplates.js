'use strict';

const {
  DEFAULT_TVA_RATE,
  TVA_COLLECTED_ACCOUNT,
  TVA_DEDUCTIBLE_ACCOUNT,
} = require('./finAccountingConfig');

const EXPENSE_CATEGORY_ACCOUNTS = {
  pharmacy: '602000',
  medical: '601000',
  utilities: '604000',
  rent: '622000',
  salary: '641000',
  external: '661000',
  bank: '671000',
  general: '601000',
};

const REVENUE_SERVICE_ACCOUNTS = {
  consultation: '701000',
  laboratory: '702000',
  radiology: '703000',
  pharmacy: '704000',
  default: '706000',
};

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
  const revCode = REVENUE_SERVICE_ACCOUNTS[serviceKey] || REVENUE_SERVICE_ACCOUNTS.default;
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
      label: 'TVA collected',
      debit: 0,
      credit: tva,
      tva_rate: tvaRate,
      tva_amount: tva,
    },
  ];
}

function buildExpenseLines(amount, paymentMethod, cashLikeAccount, category, tvaRate, applyTva) {
  const cash = cashLikeAccount(paymentMethod);
  const catKey = String(category || 'general').toLowerCase();
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
      label: 'TVA deductible',
      debit: tva,
      credit: 0,
      tva_rate: tvaRate,
      tva_amount: tva,
    },
    { code: cash.code, label: cash.label, debit: 0, credit: amt },
  ];
}

module.exports = {
  EXPENSE_CATEGORY_ACCOUNTS,
  REVENUE_SERVICE_ACCOUNTS,
  loadTvaRate,
  splitTtcLines,
  buildReceiptLines,
  buildExpenseLines,
  TVA_COLLECTED_ACCOUNT,
  TVA_DEDUCTIBLE_ACCOUNT,
};
