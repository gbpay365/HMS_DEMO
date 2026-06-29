'use strict';

const { normalizePaymentMethod } = require('./betterPayQr');
const { glMaps } = require('./finGlAccountMaps');

function paymentMaps() {
  const m = glMaps();
  return {
    header: m.paymentHeader,
    methods: m.paymentMethods.map((row) => ({
      ...row,
      ohada_class: row.ohada_class ?? m.paymentHeader.ohada_class,
      account_type: 'asset',
      is_posting: 1,
    })),
  };
}

const PAYMENT_METHOD_HEADER = paymentMaps().header;
const PAYMENT_METHOD_ACCOUNTS = paymentMaps().methods;

function paymentMethodKey(method) {
  const normalized = normalizePaymentMethod(String(method || 'Cash').trim());
  const k = normalized.toLowerCase();
  if (k === 'mobile money' || k === 'mobile_money') return 'momo';
  if (k === 'orange money') return 'om';
  if (k === 'qr code') return 'betterpay';
  if (k === 'bank transfer') return 'bank';
  if (k === 'pos' || k === 'card') return 'card';
  if (k === 'ussd') return 'ussd';
  return k || 'cash';
}

function glAccountForPaymentMethod(paymentMethod) {
  const key = paymentMethodKey(paymentMethod);
  for (const row of PAYMENT_METHOD_ACCOUNTS) {
    if (row.hms_keys.includes(key) || row.hms_method.toLowerCase() === key) {
      return { code: row.code, label: row.label };
    }
  }
  if (key.includes('bank') || key.includes('transfer') || key.includes('card') || key.includes('pos')) {
    const bank = PAYMENT_METHOD_ACCOUNTS.find((r) => r.hms_method === 'BANK' || r.hms_method === 'CARD');
    return bank ? { code: bank.code, label: bank.label } : { code: PAYMENT_METHOD_ACCOUNTS[0]?.code, label: 'Bank — patient receipts' };
  }
  const cash = PAYMENT_METHOD_ACCOUNTS.find((r) => r.hms_method === 'Cash');
  return cash ? { code: cash.code, label: cash.label } : { code: '230501', label: 'Cash — patient receipts' };
}

function coaAccountRows() {
  const header = PAYMENT_METHOD_HEADER;
  const rows = [
    {
      code: header.code,
      label: header.label,
      ohada_class: header.ohada_class,
      account_type: header.account_type,
      parent_code: header.parent_code,
      is_posting: header.is_posting,
    },
  ];
  for (const row of PAYMENT_METHOD_ACCOUNTS) {
    rows.push({
      code: row.code,
      label: row.label,
      ohada_class: row.ohada_class,
      account_type: row.account_type,
      parent_code: header.code,
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
