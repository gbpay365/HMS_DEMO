'use strict';

const { normalizePaymentMethod } = require('./betterPayQr');

/**
 * HMS cashier payment methods → OHADA class 5 posting accounts (6-digit).
 * Block 5526xx — treasury / patient payment methods.
 */
const PAYMENT_METHOD_HEADER = {
  code: '552600',
  label: 'Treasury — Patient payment methods',
  ohada_class: 5,
  account_type: 'asset',
  parent_code: '500000',
  is_posting: 0,
};

/** @type {Array<{hms_method:string,hms_keys:string[],code:string,label:string,ohada_class:number,account_type:string,is_posting:number}>} */
const PAYMENT_METHOD_ACCOUNTS = [
  {
    hms_method: 'Cash',
    hms_keys: ['cash'],
    code: '552601',
    label: 'Cash — patient receipts',
    ohada_class: 5,
    account_type: 'asset',
    is_posting: 1,
  },
  {
    hms_method: 'OM',
    hms_keys: ['om', 'orange money'],
    code: '552602',
    label: 'Orange Money (OM) — patient receipts',
    ohada_class: 5,
    account_type: 'asset',
    is_posting: 1,
  },
  {
    hms_method: 'MOMO',
    hms_keys: ['momo', 'mobile money', 'mobile_money'],
    code: '552603',
    label: 'MTN Mobile Money (MOMO) — patient receipts',
    ohada_class: 5,
    account_type: 'asset',
    is_posting: 1,
  },
  {
    hms_method: 'BANK',
    hms_keys: ['bank', 'transfer', 'bank transfer', 'wire', 'card'],
    code: '552604',
    label: 'Bank — patient receipts',
    ohada_class: 5,
    account_type: 'asset',
    is_posting: 1,
  },
  {
    hms_method: 'BetterPay',
    hms_keys: ['betterpay', 'qr code', 'qr'],
    code: '552605',
    label: 'BetterPay — patient receipts',
    ohada_class: 5,
    account_type: 'asset',
    is_posting: 1,
  },
  {
    hms_method: 'Wallet',
    hms_keys: ['wallet', 'patient wallet'],
    code: '552606',
    label: 'Patient wallet — patient receipts',
    ohada_class: 5,
    account_type: 'asset',
    is_posting: 1,
  },
];

function paymentMethodKey(method) {
  const normalized = normalizePaymentMethod(String(method || 'Cash').trim());
  const k = normalized.toLowerCase();
  if (k === 'mobile money' || k === 'mobile_money') return 'momo';
  if (k === 'orange money') return 'om';
  if (k === 'qr code') return 'betterpay';
  return k || 'cash';
}

function glAccountForPaymentMethod(paymentMethod) {
  const key = paymentMethodKey(paymentMethod);
  for (const row of PAYMENT_METHOD_ACCOUNTS) {
    if (row.hms_keys.includes(key) || row.hms_method.toLowerCase() === key) {
      return { code: row.code, label: row.label };
    }
  }
  if (key.includes('bank') || key.includes('transfer') || key.includes('card')) {
    const bank = PAYMENT_METHOD_ACCOUNTS.find((r) => r.hms_method === 'BANK');
    return bank ? { code: bank.code, label: bank.label } : { code: '552604', label: 'Bank — patient receipts' };
  }
  const cash = PAYMENT_METHOD_ACCOUNTS.find((r) => r.hms_method === 'Cash');
  return cash ? { code: cash.code, label: cash.label } : { code: '552601', label: 'Cash — patient receipts' };
}

function coaAccountRows() {
  const rows = [
    {
      code: PAYMENT_METHOD_HEADER.code,
      label: PAYMENT_METHOD_HEADER.label,
      ohada_class: PAYMENT_METHOD_HEADER.ohada_class,
      account_type: PAYMENT_METHOD_HEADER.account_type,
      parent_code: PAYMENT_METHOD_HEADER.parent_code,
      is_posting: PAYMENT_METHOD_HEADER.is_posting,
    },
  ];
  for (const row of PAYMENT_METHOD_ACCOUNTS) {
    rows.push({
      code: row.code,
      label: row.label,
      ohada_class: row.ohada_class,
      account_type: row.account_type,
      parent_code: PAYMENT_METHOD_HEADER.code,
      is_posting: row.is_posting,
      hms_method: row.hms_method,
      hms_keys: row.hms_keys,
    });
  }
  return rows;
}

module.exports = {
  PAYMENT_METHOD_HEADER,
  PAYMENT_METHOD_ACCOUNTS,
  paymentMethodKey,
  glAccountForPaymentMethod,
  coaAccountRows,
};
