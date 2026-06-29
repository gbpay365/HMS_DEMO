/** Country-aware currency + locale — reads window.HMS boot payload from header.ejs */

function hmsBoot() {
  try {
    return window?.HMS || {};
  } catch (_) {
    return {};
  }
}

export function isNigeriaInstall() {
  const code = activeCountryCode();
  return code === 'NG' || hmsBoot().isNigeria === true;
}

export function isCameroonInstall() {
  const code = activeCountryCode();
  return code === 'CM' || hmsBoot().isCameroon === true;
}

/** True when the active profile uses the IFRS hospital chart (Nigeria, Ghana, Liberia, etc.). */
export function usesIfrsCoa() {
  const template = String(hmsBoot().chartOfAccounts?.template || '').trim().toUpperCase();
  return template === 'IFRS_HOSPITAL' || template === 'NIGERIA_IFRS';
}

/** Journal / GL rules for IFRS-style charts — not limited to Nigeria country code. */
export function isIfrsAccounting() {
  return isNigeriaInstall() || usesIfrsCoa();
}

export function activeCountryCode() {
  const boot = hmsBoot();
  return String(boot.code || boot.country || '').trim().toUpperCase();
}

export function currencyCode() {
  const c = String(hmsBoot().currencyCode || '').trim().toUpperCase();
  return c || '';
}

export function currencySymbol() {
  const s = String(hmsBoot().currencySymbol || '').trim();
  return s || currencyCode();
}

export function currencyLocale() {
  return String(hmsBoot().currencyLocale || 'en-GB').trim() || 'en-GB';
}

export function vatRateStandard() {
  const v = Number(hmsBoot().vatRateStandard);
  return Number.isFinite(v) ? v : 0;
}

export function formatAmount(amount) {
  const n = Math.round(Number(amount) || 0);
  return n.toLocaleString(currencyLocale(), { maximumFractionDigits: 0 });
}

/** Full price string for UI labels — amount then ISO currency code (e.g. 1,500 XAF). */
export function formatMoney(amount) {
  const n = Math.round(Number(amount) || 0);
  const locale = currencyLocale();
  const code = currencyCode();
  const formatted = n.toLocaleString(locale, { maximumFractionDigits: 0 });
  return code ? `${formatted} ${code}` : formatted;
}

/** Short unit beside catalog search rows and amount field labels. */
export function priceUnitLabel() {
  return currencyCode() || hmsBoot().currencyDisplaySuffix || '';
}

/** Legacy suffix for components that append currency after the amount. */
export function priceSuffixLabel() {
  return priceUnitLabel();
}

export function cashierMethodsFromBoot() {
  const list = hmsBoot().cashierMethods;
  return Array.isArray(list) ? [...list] : [];
}

export function paymentMethodsFromBoot() {
  const list = hmsBoot().paymentMethods;
  return Array.isArray(list) ? [...list] : [];
}

export function geoFromBoot() {
  return hmsBoot().geo || {};
}

export function patientRegistrationFromBoot() {
  return hmsBoot().patientRegistration || {};
}

export function phoneDialCode() {
  return String(patientRegistrationFromBoot().phoneDialCode || '').trim();
}

export function defaultPhoneWithDial() {
  const dial = phoneDialCode();
  return dial ? `${dial} ` : '';
}

/** Keep the active country dial prefix while the user types a phone number. */
export function applyPhoneDialPrefix(raw) {
  const dial = phoneDialCode();
  let v = String(raw ?? '');
  v = v.replace(/[^\d+\s\-()]/g, '');
  if (!dial) return v.slice(0, 32);
  if (!v.trim()) return `${dial} `;
  if (v.startsWith(dial)) return v.slice(0, 32);
  if (v.startsWith('+')) {
    const rest = v.replace(/^\+\d+\s*/, '').trim();
    return rest ? `${dial} ${rest}`.slice(0, 32) : `${dial} `;
  }
  return `${dial} ${v}`.trimEnd().slice(0, 32);
}

export function addressComponentFromBoot() {
  const boot = patientRegistrationFromBoot();
  const fromProfile = String(boot.addressComponent || '').toLowerCase();
  const code = activeCountryCode();
  if (code === 'GH') return 'ghana';
  if (code === 'NG') return 'nigeria';
  if (code === 'CM') return 'cameroon';
  if (fromProfile && fromProfile !== 'profile') return fromProfile;
  const geoApi = String(hmsBoot().geoApi || hmsBoot().geo?.apiPath || '');
  if (geoApi.includes('/api/geo/') || geoApi.includes('-geo')) return 'cascade';
  return fromProfile || 'profile';
}
