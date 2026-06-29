import { currencyCode } from './hmsLocale';

const CURRENCY_WORDS = {
  XAF: { en: 'francs CFA', fr: 'francs CFA' },
  XOF: { en: 'francs CFA', fr: 'francs CFA' },
  NGN: { en: 'naira', fr: 'nairas' },
  GHS: { en: 'Ghana cedis', fr: 'cedis ghanéens' },
  LRD: { en: 'Liberian dollars', fr: 'dollars libériens' },
  GMD: { en: 'dalasis', fr: 'dalasis' },
  SLE: { en: 'leones', fr: 'leones' },
  GNF: { en: 'Guinean francs', fr: 'francs guinéens' },
  CVE: { en: 'escudos', fr: 'escudos' },
  MRU: { en: 'ouguiyas', fr: 'ouguiyas' },
  CDF: { en: 'Congolese francs', fr: 'francs congolais' },
  STN: { en: 'dobras', fr: 'dobras' },
};

export function currencyWordsLabel(language) {
  const code = currencyCode() || 'XAF';
  const spec = CURRENCY_WORDS[code] || { en: code, fr: code };
  const lng = String(language || 'en').toLowerCase().slice(0, 2);
  return lng === 'fr' ? spec.fr : spec.en;
}
