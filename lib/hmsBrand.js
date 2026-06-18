'use strict';

/**
 * Central product & facility branding (override via environment).
 */
const name = String(process.env.HMS_BRAND_NAME || 'ZAIZENS').trim() || 'ZAIZENS';
const tagline = String(process.env.HMS_BRAND_TAGLINE || 'Digital Intelligence. Redefined.').trim();
const legalName = String(process.env.HMS_FACILITY_LEGAL_NAME || 'ZAIZENS').trim();
const facilityName = String(process.env.HMS_FACILITY_NAME || 'ZAIZENS Demo Hospital').trim();
const orgName = String(process.env.HMS_ORG_NAME || facilityName).trim();
const logoPath = String(process.env.HMS_LOGO_PATH || '/img/zaizens-brand.svg').trim();
const faviconPath = String(process.env.HMS_FAVICON_PATH || '/img/zaizens-favicon.svg').trim();
const letterheadPath = String(process.env.HMS_LETTERHEAD_PATH || '/img/hms-letterhead.png?v=20260515').trim();
const copyrightYear = String(process.env.HMS_COPYRIGHT_YEAR || new Date().getFullYear()).trim();
const pageSuffix = name;
const productName = String(process.env.HMS_PRODUCT_NAME || 'ZAIZENS Integrated HMS').trim();
const loginSubtitle = String(
  process.env.HMS_LOGIN_SUBTITLE || 'An integrated HMS'
).trim();
const websiteUrl = String(process.env.HMS_BRAND_WEBSITE || 'https://www.zaizens.com/').trim();
/** Thermal / payment slips (no product vendor branding). */
const slipHeader = String(
  process.env.HMS_SLIP_HEADER || 'ZAIZENS'
).trim();

function pageTitle(pageName) {
  const p = String(pageName || '').trim();
  if (!p) return name;
  if (p.endsWith(pageSuffix) || p.endsWith('— ' + pageSuffix) || p.endsWith('- ' + pageSuffix)) {
    return p;
  }
  return p + ' — ' + pageSuffix;
}

module.exports = {
  name,
  tagline,
  legalName,
  facilityName,
  orgName,
  logoPath,
  faviconPath,
  letterheadPath,
  copyrightYear,
  pageSuffix,
  pageTitle,
  websiteUrl,
  copyrightLine:
    String(process.env.HMS_COPYRIGHT_LINE || '').trim() ||
    '© ' + copyrightYear + ' ' + loginSubtitle,
  productName,
  loginSubtitle,
  loginTitle: 'Sign in — ' + productName,
  appsLauncherTitle: name + ' Applications',
  slipHeader,
};
