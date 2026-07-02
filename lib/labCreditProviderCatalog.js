'use strict';

const catalog = require('./countryProfileCatalog');

/** @typedef {[string, string, string, string|null]} CreditProviderRow code, name, provider_type, phone */

/** @type {CreditProviderRow} */
const SELF_PAY = ['CP-SELF', 'Self pay (walk-in)', 'walkin', null];

/** @type {Record<string, CreditProviderRow[]>} */
const BY_COUNTRY = Object.freeze({
  NG: [
    SELF_PAY,
    ['CP-NHIS', 'NHIS / National Health Insurance', 'hmo', null],
    ['CP-HYG', 'Hygeia HMO', 'hmo', null],
    ['CP-REL', 'Reliance HMO', 'hmo', null],
    ['CP-AXA', 'AXA Mansard Health', 'insurance', null],
    ['CP-LWH', 'Leadway Health', 'insurance', null],
    ['CP-AVON', 'Avon Healthcare', 'hmo', null],
    ['CP-RED', 'Redcare HMO', 'hmo', null],
    ['CP-AIICO', 'AIICO Insurance', 'insurance', null],
    ['CP-CORP', 'Corporate — Company account', 'corporate', null],
    ['CP-UNI', 'University / School health scheme', 'corporate', null],
    ['CP-NGO', 'NGO / Mission partner billing', 'corporate', null],
    ['CP-GOV', 'Government agency / MDAs', 'corporate', null],
    ['CP-CRED', 'Credit — pay later (approved account)', 'corporate', null],
  ],
  CM: [
    SELF_PAY,
    ['CP-CNPS', 'CNPS — Caisse Nationale de Prévoyance Sociale', 'social', null],
    ['CP-MUT', 'Mutuelle santé communautaire', 'mutual', null],
    ['CP-MUT-CAM', 'CAMINA — Mutuelle santé', 'mutual', null],
    ['CP-NSIA', 'NSIA Assurances', 'insurance', null],
    ['CP-ACTIVA', 'ACTIVA Assurances', 'insurance', null],
    ['CP-SANLAM', 'Sanlam Allianz Cameroun', 'insurance', null],
    ['CP-AXA', 'AXA Cameroun', 'insurance', null],
    ['CP-SAAR', 'SAAR Assurances', 'insurance', null],
    ['CP-BICEC', 'BICEC Assurances', 'insurance', null],
    ['CP-ATL', 'Atlantique Assurance', 'insurance', null],
    ['CP-SUNU', 'SUNU Assurances Cameroun', 'insurance', null],
    ['CP-CHANAS', 'CHANAS Assurances', 'insurance', null],
    ['CP-COLINA', 'Colina Assurance', 'insurance', null],
    ['CP-BENEF', 'Beneficial Life / Health', 'insurance', null],
    ['CP-ALLIANZ', 'Allianz Cameroun', 'insurance', null],
    ['CP-PRIV', 'Assurance privée (other)', 'insurance', null],
    ['CP-CORP', 'Corporate — Company account', 'corporate', null],
    ['CP-GOV', 'Government / para-public agency', 'corporate', null],
    ['CP-NGO', 'NGO / Mission partner billing', 'corporate', null],
    ['CP-UNI', 'University / School health scheme', 'corporate', null],
    ['CP-EMB', 'Embassy / expatriate scheme', 'corporate', null],
    ['CP-CRED', 'Credit — pay later (approved account)', 'corporate', null],
  ],
  GH: [
    SELF_PAY,
    ['CP-NHIS', 'NHIS Ghana', 'hmo', null],
    ['CP-MET', 'Metropolitan Health Insurance', 'insurance', null],
    ['CP-ENT', 'Enterprise Insurance', 'insurance', null],
    ['CP-GLICO', 'GLICO Healthcare', 'insurance', null],
    ['CP-CORP', 'Corporate health scheme', 'corporate', null],
    ['CP-UNI', 'University / School health scheme', 'corporate', null],
    ['CP-CRED', 'Credit — pay later (approved account)', 'corporate', null],
  ],
  LR: [
    SELF_PAY,
    ['CP-NHIS', 'National Health Insurance (NHA)', 'hmo', null],
    ['CP-CORP', 'Corporate — Company account', 'corporate', null],
    ['CP-NGO', 'NGO / Mission partner billing', 'corporate', null],
    ['CP-GOV', 'Government agency', 'corporate', null],
    ['CP-CRED', 'Credit — pay later (approved account)', 'corporate', null],
  ],
  SL: [
    SELF_PAY,
    ['CP-NHIA', 'National Health Insurance (NHIA)', 'hmo', null],
    ['CP-CORP', 'Corporate — Company account', 'corporate', null],
    ['CP-CRED', 'Credit — pay later (approved account)', 'corporate', null],
  ],
  GM: [
    SELF_PAY,
    ['CP-NHIS', 'National Health Insurance', 'hmo', null],
    ['CP-CORP', 'Corporate — Company account', 'corporate', null],
    ['CP-CRED', 'Credit — pay later (approved account)', 'corporate', null],
  ],
});

/** Francophone OHADA / UEMOA / CEMAC default pool. */
const FRANCOPHONE_DEFAULT = Object.freeze([
  SELF_PAY,
  ['CP-CNPS', 'Caisse Nationale de Prévoyance Sociale (CNPS / CSS)', 'social', null],
  ['CP-MUT', 'Mutuelle santé', 'mutual', null],
  ['CP-MUT-CAM', 'Mutuelle communautaire', 'mutual', null],
  ['CP-PRIV', 'Assurance privée', 'insurance', null],
  ['CP-NSIA', 'NSIA Assurances', 'insurance', null],
  ['CP-ACTIVA', 'ACTIVA Assurances', 'insurance', null],
  ['CP-CORP', 'Corporate — Company account', 'corporate', null],
  ['CP-GOV', 'Government / para-public agency', 'corporate', null],
  ['CP-NGO', 'NGO / Mission partner', 'corporate', null],
  ['CP-CRED', 'Credit — pay later (approved account)', 'corporate', null],
]);

/** Anglophone IFRS default pool. */
const ANGLO_DEFAULT = Object.freeze([
  SELF_PAY,
  ['CP-NHIS', 'National Health Insurance', 'hmo', null],
  ['CP-PRIV', 'Private health insurance', 'insurance', null],
  ['CP-CORP', 'Corporate — Company account', 'corporate', null],
  ['CP-GOV', 'Government agency', 'corporate', null],
  ['CP-CRED', 'Credit — pay later (approved account)', 'corporate', null],
]);

function resolveCountryCode(code) {
  const key = catalog.getProfile(code)?.code || catalog.resolveCode(code);
  return key || catalog.envDefaultCode();
}

function creditProvidersForCountry(code) {
  const cc = resolveCountryCode(code);
  if (BY_COUNTRY[cc]) return BY_COUNTRY[cc].slice();
  const profile = catalog.getProfile(cc);
  if (!profile) return ANGLO_DEFAULT.slice();
  const regime = String(profile.fiscalRegime || '').toUpperCase();
  if (regime.includes('SYSCOHADA') || regime.includes('OHADA') || regime.includes('CEMAC') || regime.includes('UEMOA')) {
    return FRANCOPHONE_DEFAULT.slice();
  }
  return ANGLO_DEFAULT.slice();
}

module.exports = {
  creditProvidersForCountry,
  resolveCountryCode,
};
