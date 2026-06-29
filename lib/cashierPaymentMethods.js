'use strict';

const hmsCountry = require('./hmsCountry');

/** Canonical key for a country-profile payment method code. */
function canonicalProfileMethodKey(code) {
  const k = String(code || '').trim().toLowerCase();
  if (!k) return '';
  if (k === 'orange' || k === 'orange money' || k === 'om') return 'om';
  if (k === 'mobile money' || k === 'mobile_money' || k === 'mobile' || k === 'momo') return 'momo';
  if (k === 'bank transfer' || k === 'bank_transfer' || k === 'transfer' || k === 'bank') return 'bank';
  if (k === 'pos' || k === 'card') return 'pos';
  if (k === 'qr code' || k === 'betterpay') return 'betterpay';
  return k;
}

const PROFILE_LABELS = {
  cash: 'Cash',
  momo: 'MOMO',
  om: 'OM',
  wallet: 'Wallet',
  betterpay: 'BetterPay',
  bank: 'Bank Transfer',
  pos: 'POS',
  paystack: 'Paystack',
  ussd: 'USSD',
  insurance: 'Insurance',
};

function profileMethodLabel(key, fallbackLabel) {
  if (key === 'om') return 'OM';
  if (key === 'momo') return 'MOMO';
  const fb = String(fallbackLabel || '').trim();
  if (/orange/i.test(fb)) return 'OM';
  if (PROFILE_LABELS[key]) return PROFILE_LABELS[key];
  if (fb) return fb;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** BetterPay is a Cameroon (CM) payment rail — also honour explicit profile config. */
function profileSupportsBetterPay() {
  if (hmsCountry.isCameroon) return true;
  const profile = hmsCountry.profileService.getActiveProfile();
  if (!profile) return false;
  for (const m of profile.paymentMethods || []) {
    if (canonicalProfileMethodKey(m.code) === 'betterpay') return true;
  }
  for (const m of profile.cashierMethods || []) {
    if (canonicalProfileMethodKey(m) === 'betterpay') return true;
  }
  return false;
}

function ensureBetterPayInMap(seen) {
  if (profileSupportsBetterPay() && !seen.has('betterpay')) {
    seen.set('betterpay', { key: 'betterpay', label: 'BetterPay' });
  }
}

function getCashierPaymentMethods() {
  const fromProfile = hmsCountry.getCashierPaymentMethods?.();
  const list = fromProfile && fromProfile.length ? [...fromProfile] : ['Cash', 'Wallet'];
  if (profileSupportsBetterPay() && !list.includes('BetterPay')) {
    list.push('BetterPay');
  }
  return list;
}

function getStandardPaymentMethodKeys() {
  const methods = hmsCountry.profileService.getActiveProfile()?.paymentMethods || [];
  if (!methods.length) return Object.freeze(['cash', 'wallet']);
  const seen = new Set();
  const out = [];
  for (const m of methods) {
    const k = canonicalProfileMethodKey(m.code);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  if (profileSupportsBetterPay() && !seen.has('betterpay')) {
    out.push('betterpay');
  }
  return Object.freeze(out);
}

/** Country-profile methods for dashboard charts — deduped, canonical keys + labels. */
function getProfileChartMethods() {
  const methods = hmsCountry.profileService.getActiveProfile()?.paymentMethods || [];
  const seen = new Map();
  for (const m of methods) {
    const key = canonicalProfileMethodKey(m.code);
    if (!key || seen.has(key)) continue;
    seen.set(key, { key, label: profileMethodLabel(key, m.label) });
  }
  ensureBetterPayInMap(seen);
  return [...seen.values()];
}

module.exports = {
  getCashierPaymentMethods,
  getStandardPaymentMethodKeys,
  getProfileChartMethods,
  profileSupportsBetterPay,
  canonicalProfileMethodKey,
};
