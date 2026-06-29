'use strict';

const hmsCountry = require('./hmsCountry');

function activeCurrency() {
  const p = hmsCountry.profileService.getActiveProfile();
  return p?.currency || {};
}

function currencyCode() {
  return hmsCountry.currencyCode();
}

function currencySymbol() {
  return hmsCountry.currencySymbol();
}

function currencyLocale() {
  return activeCurrency().locale || (hmsCountry.isNigeria ? 'en-NG' : 'fr-FR');
}

function formatMoney(amount) {
  const n = Math.round(Number(amount) || 0);
  const locale = currencyLocale();
  const code = currencyCode();
  const formatted = n.toLocaleString(locale, { maximumFractionDigits: 0 });
  return code ? `${formatted} ${code}` : formatted;
}

module.exports = {
  currencyCode,
  currencySymbol,
  currencyLocale,
  formatMoney,
  isNigeria: hmsCountry.isNigeria,
};
