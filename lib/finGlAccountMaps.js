'use strict';

const hmsCountry = require('./hmsCountry');

/** Operational GL codes — Cameroon (OHADA 6-digit) vs Nigeria (IFRS hospital chart). */
const MAPS = {
  CM: {
    vatRate: 0.1925,
    vatCollected: '445710',
    vatDeductible: '445660',
    receivable: '411000',
    receivableLabel: 'Trade receivables — patients',
    supplierPayable: '401100',
    treasuryClass: 5,
    treasuryPrefix: '5',
    payoutDefault: '421100',
    payoutSalaryAdvance: '421200',
    pettyCash: '531000',
    revenue: {
      consultation: '701601',
      laboratory: '702606',
      radiology: '703601',
      pharmacy: '704601',
      hospitalisation: '706631',
      emergency: '701601',
      charge: '706631',
      default: '706631',
    },
    expense: {
      pharmacy: '602000',
      medical: '601000',
      utilities: '604000',
      rent: '622000',
      salary: '641000',
      external: '661000',
      bank: '671000',
      general: '601000',
    },
    purchaseStock: {
      pharmacy: '311100',
      procurement: '311200',
      default: '311100',
    },
    paymentHeader: {
      code: '552600',
      label: 'Treasury — Patient payment methods',
      ohada_class: 5,
      account_type: 'asset',
      parent_code: '500000',
      is_posting: 0,
    },
    paymentMethods: [
      { hms_method: 'Cash', hms_keys: ['cash'], code: '552601', label: 'Cash — patient receipts' },
      { hms_method: 'OM', hms_keys: ['om', 'orange money'], code: '552602', label: 'Orange Money (OM) — patient receipts' },
      { hms_method: 'MOMO', hms_keys: ['momo', 'mobile money', 'mobile_money'], code: '552603', label: 'MTN Mobile Money (MOMO) — patient receipts' },
      { hms_method: 'BANK', hms_keys: ['bank', 'transfer', 'bank transfer', 'wire', 'card'], code: '552604', label: 'Bank — patient receipts' },
      { hms_method: 'BetterPay', hms_keys: ['betterpay', 'qr code', 'qr'], code: '552605', label: 'BetterPay — patient receipts' },
      { hms_method: 'Wallet', hms_keys: ['wallet', 'patient wallet'], code: '552606', label: 'Patient wallet — patient receipts' },
    ],
    treasurySkeleton: [
      { code: '531000', label: 'Cash on hand (tills)' },
      { code: '552600', label: 'Treasury — Patient payment methods' },
      { code: '552601', label: 'Cash — patient receipts' },
      { code: '552602', label: 'Orange Money (OM) — patient receipts' },
      { code: '552603', label: 'MTN Mobile Money (MOMO) — patient receipts' },
      { code: '552604', label: 'Bank — patient receipts' },
      { code: '552605', label: 'BetterPay — patient receipts' },
      { code: '552606', label: 'Patient wallet — patient receipts' },
    ],
    chartTemplate: 'SYSCOHADA',
    coaLabel: 'OHADA 6-digit',
  },
  NG: {
    vatRate: 0.075,
    vatCollected: '440100',
    vatDeductible: '440200',
    receivable: '220100',
    receivableLabel: 'Trade receivables — patients',
    supplierPayable: '410100',
    treasuryClass: 2,
    treasuryPrefix: '23',
    payoutDefault: '420600',
    payoutSalaryAdvance: '420600',
    pettyCash: '230200',
    revenue: {
      consultation: '510101',
      laboratory: '510102',
      radiology: '510103',
      pharmacy: '510104',
      hospitalisation: '510105',
      emergency: '510106',
      charge: '510105',
      default: '510105',
    },
    expense: {
      pharmacy: '620000',
      medical: '610000',
      utilities: '720100',
      rent: '760000',
      salary: '710100',
      external: '740000',
      bank: '780000',
      general: '790000',
    },
    purchaseStock: {
      pharmacy: '210200',
      procurement: '210100',
      default: '210100',
    },
    paymentHeader: {
      code: '230500',
      label: 'Treasury — Patient payment methods',
      ohada_class: 2,
      account_type: 'asset',
      parent_code: '230000',
      is_posting: 0,
    },
    paymentMethods: [
      { hms_method: 'Cash', hms_keys: ['cash'], code: '230501', label: 'Cash — patient receipts' },
      { hms_method: 'BANK', hms_keys: ['bank', 'transfer', 'bank transfer', 'bank_transfer'], code: '230502', label: 'Bank transfer — patient receipts' },
      { hms_method: 'CARD', hms_keys: ['card', 'pos', 'debit', 'credit'], code: '230503', label: 'POS / Card — patient receipts' },
      { hms_method: 'Paystack', hms_keys: ['paystack', 'online', 'flutterwave'], code: '230504', label: 'Paystack — patient receipts' },
      { hms_method: 'MOMO', hms_keys: ['momo', 'mobile money', 'mobile_money', 'ussd'], code: '230504', label: 'USSD / mobile money — patient receipts' },
      { hms_method: 'Wallet', hms_keys: ['wallet', 'patient wallet'], code: '230505', label: 'Patient wallet — patient receipts' },
    ],
    treasurySkeleton: [
      { code: '230100', label: 'Cash in hand (main till)' },
      { code: '230200', label: 'Petty cash' },
      { code: '230300', label: 'Bank — current account' },
      { code: '230400', label: 'Bank — POS settlement' },
      { code: '230500', label: 'Treasury — Patient payment methods' },
      { code: '230501', label: 'Cash — patient receipts' },
      { code: '230502', label: 'Bank transfer — patient receipts' },
      { code: '230503', label: 'POS / Card — patient receipts' },
      { code: '230504', label: 'Paystack / mobile money — patient receipts' },
      { code: '230505', label: 'Patient wallet — patient receipts' },
    ],
    chartTemplate: 'NIGERIA_IFRS',
    coaLabel: 'Nigeria IFRS hospital',
  },
};

function glMaps() {
  const profile = hmsCountry.profileService.getActiveProfile();
  const template = profile?.chartOfAccounts?.template || 'SYSCOHADA';
  if (template === 'NIGERIA_IFRS') return MAPS.NG;
  return MAPS.CM;
}

function vatRateDefault() {
  const rate = Number(hmsCountry.defaultVatRate());
  if (Number.isFinite(rate) && rate >= 0) return rate / 100;
  return glMaps().vatRate;
}

function vatCollectedAccount() {
  return glMaps().vatCollected;
}

function vatDeductibleAccount() {
  return glMaps().vatDeductible;
}

function revenueAccountForCategory(category) {
  const key = String(category || 'default').toLowerCase();
  const rev = glMaps().revenue;
  return rev[key] || rev.default;
}

module.exports = {
  MAPS,
  glMaps,
  vatRateDefault,
  vatCollectedAccount,
  vatDeductibleAccount,
  revenueAccountForCategory,
};
