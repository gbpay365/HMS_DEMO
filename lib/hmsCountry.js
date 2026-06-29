'use strict';

/**
 * Deployment country profile — DB-driven with env fallback.
 * Use hmsCountryProfileService.applyProfile() to switch country at runtime.
 */
const profileSvc = require('./hmsCountryProfileService');

function active() {
  return profileSvc.getActiveProfile();
}

function isNigeriaInstall() {
  return active().code === 'NG';
}

function isCameroonInstall() {
  return active().code === 'CM';
}

function showsLanguageSwitcher() {
  return isCameroonInstall();
}

function currencyCode() {
  return active().currency.code;
}

function currencyLabel() {
  return active().currency.code;
}

function currencySymbol() {
  return active().currency.symbol;
}

function defaultCity() {
  return active().defaultCity;
}

function defaultTimezone() {
  return active().timezone;
}

function geoApiPath() {
  return active().geo.apiPath;
}

function fiscalRegime() {
  return active().fiscalRegime;
}

function defaultVatRate() {
  return String(active().vatRateStandard);
}

function publicPayload() {
  return profileSvc.publicPayload();
}

function getCashierPaymentMethods() {
  return [...(active().cashierMethods || [])];
}

module.exports = {
  get code() {
    return active().code;
  },
  get isNigeria() {
    return isNigeriaInstall();
  },
  get isCameroon() {
    return isCameroonInstall();
  },
  get showsLanguageSwitcher() {
    return showsLanguageSwitcher();
  },
  currencyCode,
  currencyLabel,
  currencySymbol,
  defaultCity,
  defaultTimezone,
  geoApiPath,
  fiscalRegime,
  defaultVatRate,
  publicPayload,
  getCashierPaymentMethods,
  profileService: profileSvc,
};
