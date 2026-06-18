import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

const I18N_OPTIONS = {
  resources,
  fallbackLng: 'en',
  supportedLngs: ['en', 'fr'],
  ns: ['common', 'errors', 'login', 'dashboard', 'nav', 'clinical', 'financials', 'print', 'payroll', 'ops', 'ipd', 'superAdmin', 'access', 'legacy', 'portal', 'visitingDoctor'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  initImmediate: false};

export function localeFromDocument() {
  if (typeof document === 'undefined') return 'en';
  const meta = document.querySelector('meta[name="hms-lang"]')?.getAttribute('content');
  const metaLang = String(meta || '').toLowerCase().slice(0, 2);
  if (metaLang === 'fr' || metaLang === 'en') return metaLang;
  const html = String(document.documentElement?.lang || '').toLowerCase().slice(0, 2);
  return html === 'fr' ? 'fr' : 'en';
}

export function localeFromPageData(pageData) {
  const fromData = String(pageData?.locale || pageData?.lang || '')
    .toLowerCase()
    .slice(0, 2);
  if (fromData === 'fr') return 'fr';
  if (fromData === 'en') return 'en';
  return localeFromDocument();
}

export function resolveBootLocale(pageData) {
  return localeFromPageData(pageData);
}

export async function ensureI18n(locale = 'en') {
  const lng = locale === 'fr' ? 'fr' : 'en';
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({ ...I18N_OPTIONS, lng });
  } else if (i18n.resolvedLanguage !== lng && i18n.language !== lng) {
    await i18n.changeLanguage(lng);
  }
  return i18n;
}

/** @deprecated use ensureI18n */
export function initI18n(locale = 'en') {
  const lng = locale === 'fr' ? 'fr' : 'en';
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({ ...I18N_OPTIONS, lng });
    return i18n;
  }
  if (i18n.language !== lng) i18n.changeLanguage(lng);
  return i18n;
}

export { i18n };
