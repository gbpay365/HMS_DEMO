/** Patient payment method GL accounts — driven by active country profile (window.HMS). */

import { isNigeriaInstall, isIfrsAccounting, paymentMethodsFromBoot } from './hmsLocale';

const CM_CODES = Object.freeze(['552601', '552602', '552603', '552604', '552605', '552606']);
const IFRS_CODES = Object.freeze(['230501', '230502', '230503', '230504', '230505']);

const METHOD_CODE_TO_IFRS_GL = Object.freeze({
  cash: '230501',
  bank: '230502',
  bank_transfer: '230502',
  pos: '230503',
  momo: '230504',
  orange: '230504',
  mobile_money: '230504',
  paystack: '230504',
  ussd: '230504',
  betterpay: '230504',
  telecel: '230504',
  wallet: '230505',
});

function defaultIfrsLabels() {
  return {
    230501: 'Cash',
    230502: 'Bank Transfer',
    230503: 'POS / Card',
    230504: 'Mobile Money',
    230505: 'Patient Wallet',
  };
}

function profileOhadaCodes() {
  const methods = paymentMethodsFromBoot();
  const codes = methods.map((m) => String(m.glCode || '').trim()).filter(Boolean);
  return codes.length ? codes : null;
}

function ifrsLabelsFromProfile() {
  const labels = defaultIfrsLabels();
  for (const m of paymentMethodsFromBoot()) {
    const gl = String(m.glCode || '').trim();
    const label = String(m.label || m.code || '').trim();
    if (!label) continue;
    if (IFRS_CODES.includes(gl)) {
      labels[gl] = label;
      continue;
    }
    const slot = METHOD_CODE_TO_IFRS_GL[String(m.code || '').toLowerCase()];
    if (slot) labels[slot] = label;
  }
  return labels;
}

function fallbackCodes() {
  return isIfrsAccounting() ? IFRS_CODES : CM_CODES;
}

export function paymentMethodAccountCodes() {
  if (isIfrsAccounting()) {
    return IFRS_CODES;
  }
  return profileOhadaCodes() || CM_CODES;
}

export function paymentMethodShortLabels() {
  if (isIfrsAccounting()) {
    return ifrsLabelsFromProfile();
  }
  const methods = paymentMethodsFromBoot();
  if (methods.length) {
    const labels = {};
    for (const m of methods) {
      if (m.glCode) labels[m.glCode] = m.label || m.code;
    }
    return labels;
  }
  return {
    552601: 'Cash',
    552602: 'OM',
    552603: 'MOMO',
    552604: 'Bank',
    552605: 'BetterPay',
    552606: 'Wallet',
  };
}

export function isPaymentMethodAccountCode(code) {
  return paymentMethodAccountCodes().includes(String(code || '').trim());
}

export function paymentMethodsFromAccounts(postingAccounts) {
  const byCode = new Map(postingAccounts.map((a) => [a.code, a]));
  const labels = paymentMethodShortLabels();
  const out = [];
  for (const code of paymentMethodAccountCodes()) {
    const acct = byCode.get(code);
    if (!acct) continue;
    out.push({
      ...acct,
      shortLabel: labels[code] || acct.label,
    });
  }
  return out;
}

export { isNigeriaInstall, isIfrsAccounting };

/** @deprecated Use paymentMethodShortLabels() */
export const PAYMENT_METHOD_SHORT_LABELS = paymentMethodShortLabels();

/** @deprecated Use paymentMethodAccountCodes() */
export const PAYMENT_METHOD_ACCOUNT_CODES = paymentMethodAccountCodes();
