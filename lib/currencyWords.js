'use strict';

const hmsCountry = require('./hmsCountry');

/** Legal / receipt phrasing for amount-in-words by ISO currency code. */
const CURRENCY_WORDS = {
  XAF: { en: 'francs CFA', fr: 'francs CFA', subEn: 'centime', subFr: 'centime' },
  XOF: { en: 'francs CFA', fr: 'francs CFA', subEn: 'centime', subFr: 'centime' },
  NGN: { en: 'naira', fr: 'nairas', subEn: 'kobo', subFr: 'kobo' },
  GHS: { en: 'Ghana cedis', fr: 'cedis ghanéens', subEn: 'pesewa', subFr: 'pesewa' },
  LRD: { en: 'Liberian dollars', fr: 'dollars libériens', subEn: 'cent', subFr: 'cent' },
  GMD: { en: 'dalasis', fr: 'dalasis', subEn: 'butut', subFr: 'butut' },
  SLE: { en: 'leones', fr: 'leones', subEn: 'cent', subFr: 'cent' },
  GNF: { en: 'Guinean francs', fr: 'francs guinéens', subEn: 'centime', subFr: 'centime' },
  CVE: { en: 'escudos', fr: 'escudos', subEn: 'centavo', subFr: 'centavo' },
  MRU: { en: 'ouguiyas', fr: 'ouguiyas', subEn: 'khoums', subFr: 'khoums' },
  CDF: { en: 'Congolese francs', fr: 'francs congolais', subEn: 'centime', subFr: 'centime' },
  STN: { en: 'dobras', fr: 'dobras', subEn: 'centavo', subFr: 'centavo' },
};

function currencyWordsSpec(code) {
  const c = String(code || hmsCountry.currencyCode() || 'XAF').toUpperCase();
  const spec = CURRENCY_WORDS[c];
  if (spec) return { code: c, ...spec };
  return { code: c, en: c, fr: c, subEn: 'cent', subFr: 'cent' };
}

function subunitWord(spec, cents, lang) {
  const base = lang === 'fr' ? spec.subFr : spec.subEn;
  if (cents === 1) return base;
  if (base.endsWith('s')) return base;
  return `${base}s`;
}

module.exports = {
  currencyWordsSpec,
  subunitWord,
};
