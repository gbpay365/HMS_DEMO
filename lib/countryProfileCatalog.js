'use strict';

const fs = require('fs');
const path = require('path');

/** Static country profiles — no runtime deps on hmsCountry (avoids circular imports). */

const OHADA_COA = Object.freeze({
  template: 'SYSCOHADA',
  label: 'OHADA 6-digit chart',
  dataFile: 'lib/data/ohada_english_6digit_coa.json',
});

const NIGERIA_COA = Object.freeze({
  template: 'NIGERIA_IFRS',
  label: 'Nigeria IFRS hospital chart',
  dataFile: 'lib/data/nigeria_ifrs_coa.json',
});

const IFRS_COA = Object.freeze({
  template: 'IFRS_HOSPITAL',
  label: 'IFRS hospital chart',
  dataFile: 'lib/data/nigeria_ifrs_coa.json',
});

function paymentMethodsNg() {
  return [
    { code: 'cash', label: 'Cash', glCode: '230501', type: 'physical' },
    { code: 'bank_transfer', label: 'Bank Transfer', glCode: '230502', type: 'digital' },
    { code: 'pos', label: 'POS / Card', glCode: '230503', type: 'digital' },
    { code: 'paystack', label: 'Paystack', glCode: '230504', type: 'digital' },
    { code: 'ussd', label: 'USSD / Mobile Money', glCode: '230504', type: 'mobile_money' },
    { code: 'wallet', label: 'Patient Wallet', glCode: '230505', type: 'wallet' },
  ];
}

function paymentMethodsCm() {
  return [
    { code: 'cash', label: 'Cash', glCode: '552601', type: 'physical' },
    { code: 'om', label: 'Orange Money (OM)', glCode: '552602', type: 'mobile_money' },
    { code: 'momo', label: 'MTN Mobile Money (MOMO)', glCode: '552603', type: 'mobile_money' },
    { code: 'bank', label: 'Bank Transfer', glCode: '552604', type: 'digital' },
    { code: 'betterpay', label: 'BetterPay', glCode: '552605', type: 'digital' },
    { code: 'wallet', label: 'Patient Wallet', glCode: '552606', type: 'wallet' },
  ];
}

function paymentMethodsMobileMoney(glPrefix, extras = []) {
  const base = [
    { code: 'cash', label: 'Cash', glCode: `${glPrefix}601`, type: 'physical' },
    { code: 'momo', label: 'MTN Mobile Money', glCode: `${glPrefix}602`, type: 'mobile_money' },
    { code: 'orange', label: 'Orange Money', glCode: `${glPrefix}603`, type: 'mobile_money' },
    { code: 'bank', label: 'Bank Transfer', glCode: `${glPrefix}604`, type: 'digital' },
    { code: 'wallet', label: 'Patient Wallet', glCode: `${glPrefix}605`, type: 'wallet' },
  ];
  return base.concat(extras);
}

/** IFRS hospital chart payment slots (lib/data/nigeria_ifrs_coa.json 230501–230505). */
function paymentMethodsIfrs(labelOverrides = {}) {
  return [
    { code: 'cash', label: labelOverrides.cash || 'Cash', glCode: '230501', type: 'physical' },
    { code: 'bank', label: labelOverrides.bank || 'Bank Transfer', glCode: '230502', type: 'digital' },
    { code: 'pos', label: labelOverrides.pos || 'POS / Card', glCode: '230503', type: 'digital' },
    {
      code: 'momo',
      label: labelOverrides.momo || labelOverrides.mobile || 'Mobile Money',
      glCode: '230504',
      type: 'mobile_money',
    },
    { code: 'wallet', label: labelOverrides.wallet || 'Patient Wallet', glCode: '230505', type: 'wallet' },
  ];
}

function taxesOhada(vatRate) {
  return [
    { code: 'TVA', label: 'Taxe sur la Valeur Ajoutée (TVA)', rate: vatRate, unit: '%' },
    { code: 'IRPP', label: 'Impôt sur le Revenu des Personnes Physiques', note: 'Progressive brackets' },
    { code: 'IS', label: 'Impôt sur les Sociétés', rate: 30, unit: '%', note: 'Corporate tax (varies)' },
  ];
}

function taxesAnglo(vatLabel, vatRate) {
  return [
    { code: 'VAT', label: vatLabel, rate: vatRate, unit: '%' },
    { code: 'WHT', label: 'Withholding Tax', note: 'Rate varies by transaction type' },
    { code: 'CIT', label: 'Corporate / Companies Income Tax', note: 'Progressive or flat rate' },
  ];
}

function payrollOhadaFranc() {
  return [
    { code: 'SS_EE', label: 'Social security — employee', rate: 3.6, unit: '%', note: 'Country-specific fund' },
    { code: 'SS_ER', label: 'Social security — employer', rate: 8, unit: '%', note: 'Country-specific fund' },
    { code: 'IRPP', label: 'IRPP (payroll withholding)', note: 'Monthly income tax brackets' },
  ];
}

function payrollAnglo() {
  return [
    { code: 'PAYE', label: 'Pay As You Earn (PAYE)', note: 'Progressive personal income tax' },
    { code: 'SSNIT_EE', label: 'Social security — employee', note: 'Country-specific rates' },
    { code: 'SSNIT_ER', label: 'Social security — employer', note: 'Country-specific rates' },
  ];
}

function payrollNigeria() {
  return [
    { code: 'PAYE', label: 'Pay As You Earn (PAYE)', note: 'Progressive personal income tax' },
    { code: 'PENSION_EE', label: 'Pension — employee', rate: 8, unit: '%' },
    { code: 'PENSION_ER', label: 'Pension — employer', rate: 10, unit: '%' },
    { code: 'NHF', label: 'National Housing Fund', rate: 2.5, unit: '%' },
    { code: 'NHIS', label: 'NHIS / health insurance levies', note: 'Employer & employee contributions' },
  ];
}

function payrollCm() {
  return [
    { code: 'CNPS_EE', label: 'CNPS — employee share', rate: 4.2, unit: '%' },
    { code: 'CNPS_ER', label: 'CNPS — employer share', rate: 7.5, unit: '%' },
    { code: 'IRPP', label: 'IRPP (payroll withholding)', note: 'Monthly income tax brackets' },
    { code: 'CAC', label: 'CAC / audio-visual levy', rate: 3, unit: '%', note: 'On gross salary' },
  ];
}

function langsFrEn() {
  return [
    { code: 'fr', label: 'French', default: true },
    { code: 'en', label: 'English', default: false },
  ];
}

function langsEnFr() {
  return [
    { code: 'en', label: 'English', default: true },
    { code: 'fr', label: 'French', default: false },
  ];
}

function geo(code, regionLabel, subRegionLabel, description) {
  return {
    apiPath: `/api/geo/${String(code).toLowerCase()}`,
    regionLabel,
    subRegionLabel,
    divisionLabel: subRegionLabel,
    description,
  };
}

function bundledGeoPath(code) {
  return path.join(__dirname, 'data', 'geo', `${String(code).toUpperCase()}.json`);
}

function hasBundledGeo(code) {
  try {
    return fs.existsSync(bundledGeoPath(code));
  } catch (_) {
    return false;
  }
}

const DIAL_CODES = Object.freeze({
  NG: '+234',
  GH: '+233',
  CM: '+237',
  SN: '+221',
  CI: '+225',
  BJ: '+229',
  BF: '+226',
  ML: '+223',
  NE: '+227',
  TG: '+228',
  GW: '+245',
  GN: '+224',
  GM: '+220',
  LR: '+231',
  SL: '+232',
  CV: '+238',
  MR: '+222',
  TD: '+235',
  CF: '+236',
  CG: '+242',
  CD: '+243',
  GA: '+241',
  GQ: '+240',
  ST: '+239',
});

const IDENTITY_OVERRIDES = Object.freeze({
  NG: {
    identityIdLabel: 'NIN (National Identification Number)',
    identityIssueDateLabel: 'NIN issue date',
    identityHint: '11-digit NIN',
    identityInputMode: 'numeric',
    identityMaxLength: 11,
    identityPattern: '^\\d{11}$',
    addressComponent: 'nigeria',
    locationHint: 'Geopolitical zone → state → LGA → street',
  },
  CM: {
    identityIdLabel: 'CNI / National ID',
    identityIssueDateLabel: 'CNI issue date',
    addressComponent: 'cameroon',
    locationHint: 'Region → department → council → village',
  },
  GH: {
    identityIdLabel: 'Ghana Card / National ID',
    identityIssueDateLabel: 'Ghana Card issue date',
    identityHint: 'Ghana Card number',
    addressComponent: 'ghana',
    locationHint: 'Region → district → locality',
  },
});

function buildPatientRegistration(spec) {
  const geoSpec = spec.geo || {};
  const override = IDENTITY_OVERRIDES[spec.code] || {};
  const custom = spec.patientRegistration || {};
  const merged = { ...override, ...custom };
  const dial = merged.phoneDialCode || DIAL_CODES[spec.code] || '';
  return {
    locationTitle: merged.locationTitle || `Location (${spec.name})`,
    locationHint:
      merged.locationHint ||
      `${geoSpec.regionLabel || 'Region'} → ${geoSpec.subRegionLabel || 'District'}`,
    identityIdLabel: merged.identityIdLabel || 'National ID',
    identityIssueDateLabel: merged.identityIssueDateLabel || 'ID issue date',
    identityHint: merged.identityHint || '',
    identityInputMode: merged.identityInputMode || 'text',
    identityMaxLength: merged.identityMaxLength || 100,
    identityPattern: merged.identityPattern || null,
    phoneDialCode: dial,
    addressComponent: merged.addressComponent || (hasBundledGeo(spec.code) ? 'cascade' : 'profile'),
  };
}

/** @param {object} spec */
function buildFromSpec(spec) {
  return {
    code: spec.code,
    name: spec.name,
    regionGroup: spec.regionGroup,
    currency: spec.currency,
    timezone: spec.timezone,
    defaultCity: spec.defaultCity,
    fiscalRegime: spec.fiscalRegime,
    vatRateStandard: spec.vatRateStandard,
    geo: spec.geo,
    chartOfAccounts: spec.chartOfAccounts,
    taxes: spec.taxes,
    payrollTaxes: spec.payrollTaxes,
    paymentMethods: spec.paymentMethods,
    cashierMethods: spec.cashierMethods,
    languages: spec.languages,
    patientRegistration: buildPatientRegistration(spec),
  };
}

const COUNTRY_SPECS = [
  // —— West Africa ——
  {
    code: 'NG',
    name: 'Nigeria',
    regionGroup: 'West Africa',
    currency: { code: 'NGN', symbol: '₦', locale: 'en-NG', displaySuffix: 'NGN' },
    timezone: 'Africa/Lagos',
    defaultCity: 'Lagos',
    fiscalRegime: 'Nigeria (Companies Act / IFRS)',
    vatRateStandard: 7.5,
    geo: {
      apiPath: '/api/geo/ng',
      regionLabel: 'State',
      subRegionLabel: 'LGA (Local Government Area)',
      divisionLabel: 'State',
      description: '36 states + FCT with local government areas',
    },
    chartOfAccounts: NIGERIA_COA,
    taxes: [
      { code: 'VAT_STANDARD', label: 'Value Added Tax (VAT)', rate: 7.5, unit: '%' },
      { code: 'WHT', label: 'Withholding Tax', rate: 5, unit: '%', note: 'Rate varies by transaction type' },
      { code: 'CIT', label: 'Companies Income Tax', rate: 30, unit: '%', note: 'Large companies' },
    ],
    payrollTaxes: payrollNigeria(),
    paymentMethods: paymentMethodsNg(),
    cashierMethods: ['Cash', 'Bank Transfer', 'POS', 'Paystack', 'USSD', 'Wallet'],
    languages: langsEnFr(),
  },
  {
    code: 'GH',
    name: 'Ghana',
    regionGroup: 'West Africa',
    currency: { code: 'GHS', symbol: 'GH₵', locale: 'en-GH', displaySuffix: 'GHS' },
    timezone: 'Africa/Accra',
    defaultCity: 'Accra',
    fiscalRegime: 'Ghana Companies Act / IFRS',
    vatRateStandard: 15,
    geo: {
      apiPath: '/api/geo/gh',
      regionLabel: 'Region',
      subRegionLabel: 'District',
      divisionLabel: 'District',
      description: '16 regions with metropolitan, municipal, and district assemblies',
    },
    chartOfAccounts: IFRS_COA,
    taxes: taxesAnglo('Value Added Tax (VAT / NHIL / GETFund)', 15),
    payrollTaxes: [
      { code: 'PAYE', label: 'Pay As You Earn (PAYE)', note: 'Progressive personal income tax' },
      { code: 'SSNIT_EE', label: 'SSNIT — employee', rate: 5.5, unit: '%' },
      { code: 'SSNIT_ER', label: 'SSNIT — employer', rate: 13, unit: '%' },
    ],
    paymentMethods: paymentMethodsIfrs({ momo: 'MTN Mobile Money (MOMO)' }),
    cashierMethods: ['Cash', 'MOMO', 'Telecel Cash', 'Bank Transfer', 'Wallet'],
    languages: langsEnFr(),
  },
  {
    code: 'SN',
    name: 'Senegal',
    regionGroup: 'West Africa',
    currency: { code: 'XOF', symbol: 'CFA', locale: 'fr-SN', displaySuffix: 'XOF' },
    timezone: 'Africa/Dakar',
    defaultCity: 'Dakar',
    fiscalRegime: 'SYSCOHADA / UEMOA',
    vatRateStandard: 18,
    geo: geo('SN', 'Region', 'Department', '14 regions with departments and communes'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(18),
    payrollTaxes: [
      { code: 'CSS_EE', label: 'CSS — employee (IPRES)', rate: 5.6, unit: '%' },
      { code: 'CSS_ER', label: 'CSS — employer (IPRES)', rate: 8.4, unit: '%' },
      { code: 'IRPP', label: 'IRPP (payroll withholding)', note: 'Monthly income tax brackets' },
    ],
    paymentMethods: paymentMethodsMobileMoney('221', [
      { code: 'wave', label: 'Wave', glCode: '221606', type: 'mobile_money' },
    ]),
    cashierMethods: ['Cash', 'Orange Money', 'Wave', 'MOMO', 'Bank Transfer', 'Wallet'],
    languages: langsFrEn(),
  },
  {
    code: 'CI',
    name: "Côte d'Ivoire",
    regionGroup: 'West Africa',
    currency: { code: 'XOF', symbol: 'CFA', locale: 'fr-CI', displaySuffix: 'XOF' },
    timezone: 'Africa/Abidjan',
    defaultCity: 'Abidjan',
    fiscalRegime: 'SYSCOHADA / UEMOA',
    vatRateStandard: 18,
    geo: geo('CI', 'District', 'Region', 'Districts, regions, departments, and sub-prefectures'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(18),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('225', [
      { code: 'wave', label: 'Wave', glCode: '225606', type: 'mobile_money' },
    ]),
    cashierMethods: ['Cash', 'Orange Money', 'Wave', 'MOMO', 'Bank Transfer', 'Wallet'],
    languages: langsFrEn(),
  },
  {
    code: 'BJ',
    name: 'Benin',
    regionGroup: 'West Africa',
    currency: { code: 'XOF', symbol: 'CFA', locale: 'fr-BJ', displaySuffix: 'XOF' },
    timezone: 'Africa/Porto-Novo',
    defaultCity: 'Cotonou',
    fiscalRegime: 'SYSCOHADA / UEMOA',
    vatRateStandard: 18,
    geo: geo('BJ', 'Department', 'Commune', '12 departments with communes and arrondissements'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(18),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('229'),
    cashierMethods: ['Cash', 'MOMO', 'Orange Money', 'Bank Transfer', 'Wallet'],
    languages: langsFrEn(),
  },
  {
    code: 'BF',
    name: 'Burkina Faso',
    regionGroup: 'West Africa',
    currency: { code: 'XOF', symbol: 'CFA', locale: 'fr-BF', displaySuffix: 'XOF' },
    timezone: 'Africa/Ouagadougou',
    defaultCity: 'Ouagadougou',
    fiscalRegime: 'SYSCOHADA / UEMOA',
    vatRateStandard: 18,
    geo: geo('BF', 'Region', 'Province', '13 regions with provinces and departments'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(18),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('226'),
    cashierMethods: ['Cash', 'Orange Money', 'MOMO', 'Bank Transfer', 'Wallet'],
    languages: langsFrEn(),
  },
  {
    code: 'ML',
    name: 'Mali',
    regionGroup: 'West Africa',
    currency: { code: 'XOF', symbol: 'CFA', locale: 'fr-ML', displaySuffix: 'XOF' },
    timezone: 'Africa/Bamako',
    defaultCity: 'Bamako',
    fiscalRegime: 'SYSCOHADA / UEMOA',
    vatRateStandard: 18,
    geo: geo('ML', 'Region', 'Cercle', 'Regions, cercles, communes, and quarters'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(18),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('223'),
    cashierMethods: ['Cash', 'Orange Money', 'MOMO', 'Bank Transfer', 'Wallet'],
    languages: langsFrEn(),
  },
  {
    code: 'NE',
    name: 'Niger',
    regionGroup: 'West Africa',
    currency: { code: 'XOF', symbol: 'CFA', locale: 'fr-NE', displaySuffix: 'XOF' },
    timezone: 'Africa/Niamey',
    defaultCity: 'Niamey',
    fiscalRegime: 'SYSCOHADA / UEMOA',
    vatRateStandard: 19,
    geo: geo('NE', 'Region', 'Department', '7 regions with departments and communes'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(19),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('227'),
    cashierMethods: ['Cash', 'Orange Money', 'MOMO', 'Bank Transfer', 'Wallet'],
    languages: langsFrEn(),
  },
  {
    code: 'TG',
    name: 'Togo',
    regionGroup: 'West Africa',
    currency: { code: 'XOF', symbol: 'CFA', locale: 'fr-TG', displaySuffix: 'XOF' },
    timezone: 'Africa/Lome',
    defaultCity: 'Lomé',
    fiscalRegime: 'SYSCOHADA / UEMOA',
    vatRateStandard: 18,
    geo: geo('TG', 'Region', 'Prefecture', '5 regions with prefectures and communes'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(18),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('228', [
      { code: 'flooz', label: 'Flooz (Moov Money)', glCode: '228606', type: 'mobile_money' },
    ]),
    cashierMethods: ['Cash', 'Flooz', 'Orange Money', 'Bank Transfer', 'Wallet'],
    languages: langsFrEn(),
  },
  {
    code: 'GW',
    name: 'Guinea-Bissau',
    regionGroup: 'West Africa',
    currency: { code: 'XOF', symbol: 'CFA', locale: 'pt-GW', displaySuffix: 'XOF' },
    timezone: 'Africa/Bissau',
    defaultCity: 'Bissau',
    fiscalRegime: 'SYSCOHADA / UEMOA',
    vatRateStandard: 15,
    geo: geo('GW', 'Region', 'Sector', 'Regions, sectors, and tabancas'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(15),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('245'),
    cashierMethods: ['Cash', 'Orange Money', 'Bank Transfer', 'Wallet'],
    languages: [
      { code: 'pt', label: 'Portuguese', default: true },
      { code: 'fr', label: 'French', default: false },
    ],
  },
  {
    code: 'GN',
    name: 'Guinea',
    regionGroup: 'West Africa',
    currency: { code: 'GNF', symbol: 'FG', locale: 'fr-GN', displaySuffix: 'GNF' },
    timezone: 'Africa/Conakry',
    defaultCity: 'Conakry',
    fiscalRegime: 'OHADA-inspired / local fiscal code',
    vatRateStandard: 18,
    geo: geo('GN', 'Region', 'Prefecture', '8 regions with prefectures and sub-prefectures'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(18),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('224'),
    cashierMethods: ['Cash', 'Orange Money', 'MOMO', 'Bank Transfer', 'Wallet'],
    languages: langsFrEn(),
  },
  {
    code: 'GM',
    name: 'Gambia',
    regionGroup: 'West Africa',
    currency: { code: 'GMD', symbol: 'D', locale: 'en-GM', displaySuffix: 'GMD' },
    timezone: 'Africa/Banjul',
    defaultCity: 'Banjul',
    fiscalRegime: 'Gambia Companies Act / IFRS',
    vatRateStandard: 15,
    geo: geo('GM', 'Region', 'District', 'Local government areas and districts'),
    chartOfAccounts: IFRS_COA,
    taxes: taxesAnglo('Value Added Tax (VAT)', 15),
    payrollTaxes: payrollAnglo(),
    paymentMethods: paymentMethodsIfrs({ momo: 'Africell Money / QCell' }),
    cashierMethods: ['Cash', 'Africell Money', 'QCell', 'Bank Transfer', 'Wallet'],
    languages: langsEnFr(),
  },
  {
    code: 'LR',
    name: 'Liberia',
    regionGroup: 'West Africa',
    currency: { code: 'LRD', symbol: 'L$', locale: 'en-LR', displaySuffix: 'LRD' },
    timezone: 'Africa/Monrovia',
    defaultCity: 'Monrovia',
    fiscalRegime: 'Liberia Revenue Code / IFRS',
    vatRateStandard: 7,
    geo: geo('LR', 'County', 'District', '15 counties with districts and clans'),
    chartOfAccounts: IFRS_COA,
    taxes: taxesAnglo('Goods & Services Tax (GST)', 7),
    payrollTaxes: payrollAnglo(),
    paymentMethods: paymentMethodsIfrs({ momo: 'Lonestar MTN MoMo / Orange Money' }),
    cashierMethods: ['Cash', 'Lonestar MTN MoMo', 'Orange Money', 'Bank Transfer', 'Wallet'],
    languages: langsEnFr(),
  },
  {
    code: 'SL',
    name: 'Sierra Leone',
    regionGroup: 'West Africa',
    currency: { code: 'SLE', symbol: 'Le', locale: 'en-SL', displaySuffix: 'SLE' },
    timezone: 'Africa/Freetown',
    defaultCity: 'Freetown',
    fiscalRegime: 'Sierra Leone Finance Act / IFRS',
    vatRateStandard: 15,
    geo: geo('SL', 'Province', 'District', '4 provinces with districts and chiefdoms'),
    chartOfAccounts: IFRS_COA,
    taxes: taxesAnglo('Goods & Services Tax (GST)', 15),
    payrollTaxes: payrollAnglo(),
    paymentMethods: paymentMethodsIfrs({ momo: 'Orange Money / Africell Money' }),
    cashierMethods: ['Cash', 'Orange Money', 'Africell Money', 'Bank Transfer', 'Wallet'],
    languages: langsEnFr(),
  },
  {
    code: 'CV',
    name: 'Cape Verde',
    regionGroup: 'West Africa',
    currency: { code: 'CVE', symbol: '$', locale: 'pt-CV', displaySuffix: 'CVE' },
    timezone: 'Atlantic/Cape_Verde',
    defaultCity: 'Praia',
    fiscalRegime: 'Cape Verde fiscal code / IFRS',
    vatRateStandard: 15,
    geo: geo('CV', 'Island', 'Municipality', 'Islands grouped into municipalities'),
    chartOfAccounts: IFRS_COA,
    taxes: taxesAnglo('Imposto sobre Valor Acrescentado (IVA)', 15),
    payrollTaxes: payrollAnglo(),
    paymentMethods: paymentMethodsIfrs(),
    cashierMethods: ['Cash', 'Bank Transfer', 'Wallet'],
    languages: [
      { code: 'pt', label: 'Portuguese', default: true },
      { code: 'en', label: 'English', default: false },
    ],
  },
  {
    code: 'MR',
    name: 'Mauritania',
    regionGroup: 'West Africa',
    currency: { code: 'MRU', symbol: 'UM', locale: 'fr-MR', displaySuffix: 'MRU' },
    timezone: 'Africa/Nouakchott',
    defaultCity: 'Nouakchott',
    fiscalRegime: 'Mauritanian fiscal code / OHADA observer',
    vatRateStandard: 16,
    geo: geo('MR', 'Region', 'Department', 'Regions (wilayas) with departments (moughataas)'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(16),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('222'),
    cashierMethods: ['Cash', 'Bankily', 'Masrvi', 'Bank Transfer', 'Wallet'],
    languages: [
      { code: 'ar', label: 'Arabic', default: true },
      { code: 'fr', label: 'French', default: false },
    ],
  },
  // —— Central Africa ——
  {
    code: 'CM',
    name: 'Cameroon',
    regionGroup: 'Central Africa',
    currency: { code: 'XAF', symbol: 'FCFA', locale: 'fr-FR', displaySuffix: 'XAF' },
    timezone: 'Africa/Douala',
    defaultCity: 'Douala',
    fiscalRegime: 'SYSCOHADA / CEMAC',
    vatRateStandard: 19.25,
    geo: {
      apiPath: '/api/geo/cm',
      regionLabel: 'Region',
      subRegionLabel: 'Division',
      divisionLabel: 'Province / Division',
      description: 'Regions, divisions, and districts',
    },
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(19.25),
    payrollTaxes: payrollCm(),
    paymentMethods: paymentMethodsCm(),
    cashierMethods: ['Cash', 'MOMO', 'OM', 'Wallet', 'BetterPay'],
    languages: langsFrEn(),
  },
  {
    code: 'TD',
    name: 'Chad',
    regionGroup: 'Central Africa',
    currency: { code: 'XAF', symbol: 'FCFA', locale: 'fr-TD', displaySuffix: 'XAF' },
    timezone: 'Africa/Ndjamena',
    defaultCity: "N'Djamena",
    fiscalRegime: 'SYSCOHADA / CEMAC',
    vatRateStandard: 18,
    geo: geo('TD', 'Region', 'Department', '23 regions with departments and sub-prefectures'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(18),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('235'),
    cashierMethods: ['Cash', 'Airtel Money', 'MOMO', 'Bank Transfer', 'Wallet'],
    languages: [
      { code: 'fr', label: 'French', default: true },
      { code: 'ar', label: 'Arabic', default: false },
    ],
  },
  {
    code: 'CF',
    name: 'Central African Republic',
    regionGroup: 'Central Africa',
    currency: { code: 'XAF', symbol: 'FCFA', locale: 'fr-CF', displaySuffix: 'XAF' },
    timezone: 'Africa/Bangui',
    defaultCity: 'Bangui',
    fiscalRegime: 'SYSCOHADA / CEMAC',
    vatRateStandard: 19,
    geo: geo('CF', 'Prefecture', 'Sub-prefecture', 'Prefectures and sub-prefectures'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(19),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('236'),
    cashierMethods: ['Cash', 'Orange Money', 'MOMO', 'Bank Transfer', 'Wallet'],
    languages: langsFrEn(),
  },
  {
    code: 'CG',
    name: 'Congo',
    regionGroup: 'Central Africa',
    currency: { code: 'XAF', symbol: 'FCFA', locale: 'fr-CG', displaySuffix: 'XAF' },
    timezone: 'Africa/Brazzaville',
    defaultCity: 'Brazzaville',
    fiscalRegime: 'SYSCOHADA / CEMAC',
    vatRateStandard: 18.9,
    geo: geo('CG', 'Department', 'District', 'Departments, districts, and communes'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(18.9),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('242'),
    cashierMethods: ['Cash', 'Airtel Money', 'MOMO', 'Bank Transfer', 'Wallet'],
    languages: langsFrEn(),
  },
  {
    code: 'CD',
    name: 'Democratic Republic of the Congo',
    regionGroup: 'Central Africa',
    currency: { code: 'CDF', symbol: 'FC', locale: 'fr-CD', displaySuffix: 'CDF' },
    timezone: 'Africa/Kinshasa',
    defaultCity: 'Kinshasa',
    fiscalRegime: 'OHADA / DRC fiscal code',
    vatRateStandard: 16,
    geo: geo('CD', 'Province', 'Territory', '26 provinces with cities, communes, and territories'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(16),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('243', [
      { code: 'airtel', label: 'Airtel Money', glCode: '243606', type: 'mobile_money' },
      { code: 'mpesa', label: 'M-Pesa (Vodacom)', glCode: '243607', type: 'mobile_money' },
    ]),
    cashierMethods: ['Cash', 'Airtel Money', 'M-Pesa', 'Orange Money', 'Bank Transfer', 'Wallet'],
    languages: [
      { code: 'fr', label: 'French', default: true },
      { code: 'sw', label: 'Swahili', default: false },
    ],
  },
  {
    code: 'GA',
    name: 'Gabon',
    regionGroup: 'Central Africa',
    currency: { code: 'XAF', symbol: 'FCFA', locale: 'fr-GA', displaySuffix: 'XAF' },
    timezone: 'Africa/Libreville',
    defaultCity: 'Libreville',
    fiscalRegime: 'SYSCOHADA / CEMAC',
    vatRateStandard: 18,
    geo: geo('GA', 'Province', 'Department', '9 provinces with departments and communes'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(18),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('241'),
    cashierMethods: ['Cash', 'Airtel Money', 'MOMO', 'Bank Transfer', 'Wallet'],
    languages: langsFrEn(),
  },
  {
    code: 'GQ',
    name: 'Equatorial Guinea',
    regionGroup: 'Central Africa',
    currency: { code: 'XAF', symbol: 'FCFA', locale: 'es-GQ', displaySuffix: 'XAF' },
    timezone: 'Africa/Malabo',
    defaultCity: 'Malabo',
    fiscalRegime: 'SYSCOHADA / CEMAC',
    vatRateStandard: 15,
    geo: geo('GQ', 'Province', 'District', 'Insular and continental provinces with districts'),
    chartOfAccounts: OHADA_COA,
    taxes: taxesOhada(15),
    payrollTaxes: payrollOhadaFranc(),
    paymentMethods: paymentMethodsMobileMoney('240'),
    cashierMethods: ['Cash', 'Muni Dinero', 'Bank Transfer', 'Wallet'],
    languages: [
      { code: 'es', label: 'Spanish', default: true },
      { code: 'fr', label: 'French', default: false },
    ],
  },
  {
    code: 'ST',
    name: 'São Tomé and Príncipe',
    regionGroup: 'Central Africa',
    currency: { code: 'STN', symbol: 'Db', locale: 'pt-ST', displaySuffix: 'STN' },
    timezone: 'Africa/Sao_Tome',
    defaultCity: 'São Tomé',
    fiscalRegime: 'Local fiscal code / IFRS',
    vatRateStandard: 15,
    geo: geo('ST', 'District', 'Municipality', 'Districts and autonomous region of Príncipe'),
    chartOfAccounts: IFRS_COA,
    taxes: taxesAnglo('Imposto sobre Valor Acrescentado (IVA)', 15),
    payrollTaxes: payrollAnglo(),
    paymentMethods: paymentMethodsIfrs(),
    cashierMethods: ['Cash', 'Bank Transfer', 'Wallet'],
    languages: [
      { code: 'pt', label: 'Portuguese', default: true },
      { code: 'en', label: 'English', default: false },
    ],
  },
];

const CODE_ALIASES = Object.freeze({
  NIGERIA: 'NG',
  CAMEROON: 'CM',
  GHANA: 'GH',
  SENEGAL: 'SN',
  BENIN: 'BJ',
  'BURKINA FASO': 'BF',
  MALI: 'ML',
  NIGER: 'NE',
  TOGO: 'TG',
  'GUINEA-BISSAU': 'GW',
  GUINEA: 'GN',
  GAMBIA: 'GM',
  LIBERIA: 'LR',
  'SIERRA LEONE': 'SL',
  'CAPE VERDE': 'CV',
  MAURITANIA: 'MR',
  "COTE D'IVOIRE": 'CI',
  'CÔTE D\'IVOIRE': 'CI',
  'IVORY COAST': 'CI',
  CHAD: 'TD',
  'CENTRAL AFRICAN REPUBLIC': 'CF',
  CONGO: 'CG',
  'DEMOCRATIC REPUBLIC OF THE CONGO': 'CD',
  DRC: 'CD',
  GABON: 'GA',
  'EQUATORIAL GUINEA': 'GQ',
  'SAO TOME AND PRINCIPE': 'ST',
  'SÃO TOMÉ AND PRÍNCIPE': 'ST',
});

const PROFILES = Object.freeze(
  COUNTRY_SPECS.reduce((acc, spec) => {
    acc[spec.code] = Object.freeze(buildFromSpec(spec));
    return acc;
  }, {})
);

function listProfiles() {
  return Object.values(PROFILES).sort((a, b) => {
    const byRegion = String(a.regionGroup || '').localeCompare(b.regionGroup || '');
    if (byRegion) return byRegion;
    return a.name.localeCompare(b.name);
  });
}

function resolveCode(code) {
  const key = String(code || '').trim().toUpperCase();
  if (PROFILES[key]) return key;
  return CODE_ALIASES[key] || null;
}

function getProfile(code) {
  const key = resolveCode(code);
  return key ? PROFILES[key] : null;
}

function envDefaultCode() {
  const raw = String(process.env.HMS_COUNTRY || 'NG').trim().toUpperCase();
  const key = resolveCode(raw) || (PROFILES[raw] ? raw : null);
  if (key) return key;
  return PROFILES.NG ? 'NG' : Object.keys(PROFILES)[0];
}

module.exports = {
  PROFILES,
  listProfiles,
  getProfile,
  envDefaultCode,
};
