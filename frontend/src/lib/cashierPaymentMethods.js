import {
  cashierMethodsFromBoot,
  activeCountryCode,
  paymentMethodsFromBoot,
  isCameroonInstall,
} from './hmsLocale';

const HIDDEN_CASHIER_METHODS = new Set(['Insurance']);

const CARD_CASHIER_METHODS = new Set(['POS', 'Bank Transfer', 'Card', 'CARD', 'Paystack']);

const GATEWAY_CASHIER_METHODS = new Set(['Wallet', 'BetterPay']);

const PROFILE_CODE_CASHIER_CANDIDATES = {
  momo: ['MOMO', 'Lonestar MTN MoMo'],
  om: ['OM'],
  orange: ['Orange Money', 'OM'],
  ussd: ['USSD'],
  betterpay: ['BetterPay'],
  wave: ['Wave'],
  flooz: ['Flooz'],
  bankily: ['Bankily'],
  masrvi: ['Masrvi'],
  telecel: ['Telecel Cash'],
  airtel: ['Airtel Money'],
  mpesa: ['M-Pesa'],
  africell: ['Africell Money'],
  qcell: ['QCell'],
  muni: ['Muni Dinero'],
};

function defaultMethodsByCountry() {
  const code = activeCountryCode();
  if (code === 'NG') return ['Cash', 'Bank Transfer', 'POS', 'Paystack', 'USSD', 'Wallet'];
  if (code === 'GH') return ['Cash', 'MOMO', 'Telecel Cash', 'Bank Transfer', 'Wallet'];
  if (code === 'CM') return ['Cash', 'MOMO', 'OM', 'Wallet', 'BetterPay'];
  return ['Cash', 'Bank Transfer', 'Wallet'];
}

/** Server pageData + window.HMS boot payload — always prefer active country profile. */
export function resolveCashierPaymentMethods(serverList) {
  const fromBoot = cashierMethodsFromBoot();
  const raw =
    fromBoot.length > 0
      ? fromBoot
      : Array.isArray(serverList) && serverList.length
        ? serverList
        : defaultMethodsByCountry();

  const out = [];
  for (const m of raw) {
    let v = String(m || '').trim();
    if (v === 'Mobile Money') v = 'MOMO';
    if (v === 'Orange Money') v = 'OM';
    if (v === 'QR Code') v = 'BetterPay';
    if (!v || HIDDEN_CASHIER_METHODS.has(v)) continue;
    if (!out.includes(v)) out.push(v);
  }
  if (isCameroonInstall() && !out.includes('BetterPay')) {
    out.push('BetterPay');
  }
  return out;
}

/** @deprecated Use resolveCashierPaymentMethods() */
export function defaultCashierPaymentMethods() {
  return resolveCashierPaymentMethods([]);
}

function matchCashierMethod(candidates, cashierMethods) {
  for (const c of candidates) {
    if (cashierMethods.includes(c)) return c;
  }
  return null;
}

function profilePmToCashierName(pm, cashierMethods) {
  const code = String(pm.code || '').toLowerCase();
  const label = String(pm.label || '').trim();
  const fromCode = PROFILE_CODE_CASHIER_CANDIDATES[code];
  if (fromCode) {
    const hit = matchCashierMethod(fromCode, cashierMethods);
    if (hit) return hit;
  }
  if (cashierMethods.includes(label)) return label;
  const fuzzy = cashierMethods.find((m) => {
    const ml = m.toLowerCase();
    const ll = label.toLowerCase();
    return ml === ll || ll.includes(ml) || ml.includes(code);
  });
  return fuzzy || null;
}

function isMobileCashierMethod(name, countryCode) {
  const m = String(name || '').trim();
  if (!m || m === 'Cash' || CARD_CASHIER_METHODS.has(m) || m === 'Insurance') return false;
  if (GATEWAY_CASHIER_METHODS.has(m)) return countryCode === 'CM' && m === 'BetterPay';
  return true;
}

/** Mobile-money options for POS — from country profile + cashierMethods (CM adds BetterPay). */
export function resolvePosMobileMethods(serverList) {
  const cashierMethods = resolveCashierPaymentMethods(serverList);
  const countryCode = activeCountryCode();
  const profileMethods = paymentMethodsFromBoot();
  const out = [];

  for (const pm of profileMethods) {
    const isMobile = pm.type === 'mobile_money';
    const isCmBetterPay = countryCode === 'CM' && String(pm.code || '').toLowerCase() === 'betterpay';
    if (!isMobile && !isCmBetterPay) continue;
    const name = profilePmToCashierName(pm, cashierMethods);
    if (name && !out.includes(name)) out.push(name);
  }

  for (const m of cashierMethods) {
    if (isMobileCashierMethod(m, countryCode) && !out.includes(m)) out.push(m);
  }

  if (isCameroonInstall() && !out.includes('BetterPay')) {
    out.push('BetterPay');
  }

  return out;
}

export function resolvePosCardMethod(serverList) {
  const methods = resolveCashierPaymentMethods(serverList);
  return methods.find((m) => CARD_CASHIER_METHODS.has(m))
    || methods.find((m) => m === 'Bank Transfer')
    || 'Cash';
}

export function resolveHmsPayMethodForPos(payCategory, mobileSubMethod, serverList) {
  const methods = resolveCashierPaymentMethods(serverList);
  if (payCategory === 'cash') return methods.find((m) => m === 'Cash') || methods[0] || 'Cash';
  if (payCategory === 'card') return resolvePosCardMethod(serverList);
  if (payCategory === 'wallet') return methods.find((m) => m === 'Wallet') || 'Wallet';
  if (payCategory === 'betterpay') return 'BetterPay';
  if (payCategory === 'insurance') return methods.find((m) => m === 'Cash') || methods[0] || 'Cash';
  if (payCategory === 'mobile') {
    const mobileMethods = resolvePosMobileMethods(serverList);
    if (mobileSubMethod && mobileMethods.includes(mobileSubMethod)) return mobileSubMethod;
    return mobileMethods[0] || methods.find((m) => m !== 'Cash') || 'Cash';
  }
  return methods.find((m) => m === 'Cash') || methods[0] || 'Cash';
}

export const POS_GATEWAY_METHODS = GATEWAY_CASHIER_METHODS;
