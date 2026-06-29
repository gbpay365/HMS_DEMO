'use strict';

const catalog = require('./countryProfileCatalog');

let activeCode = catalog.envDefaultCode();
let activeProfile = catalog.getProfile(activeCode);

function getActiveCode() {
  return activeCode;
}

function getActiveProfile() {
  return activeProfile || catalog.getProfile(catalog.envDefaultCode());
}

function setActiveProfile(code, profile) {
  const key = String(code || '').trim().toUpperCase();
  activeCode = key;
  activeProfile = profile || catalog.getProfile(key);
}

function listProfiles() {
  return catalog.listProfiles();
}

function getProfile(code) {
  return catalog.getProfile(code);
}

async function readActiveCodeFromDb(pool) {
  const [[row]] = await pool.query('SELECT active_country_code FROM tbl_app_settings WHERE id=1 LIMIT 1').catch(() => [[{}]]);
  let code = String(row?.active_country_code || '').trim().toUpperCase();
  if (catalog.getProfile(code)) return code;

  const [[activeRow]] = await pool
    .query('SELECT code FROM tbl_hms_country_profile WHERE is_active=1 ORDER BY id LIMIT 1')
    .catch(() => [[{}]]);
  code = String(activeRow?.code || '').trim().toUpperCase();
  if (catalog.getProfile(code)) return code;

  return catalog.envDefaultCode();
}

let loadPromise = null;

async function ensureLoaded(pool) {
  if (!pool) return getActiveProfile();
  if (!loadPromise) {
    loadPromise = loadActiveFromDb(pool).catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  await loadPromise;
  return getActiveProfile();
}

function invalidateLoadCache() {
  loadPromise = null;
}

async function loadActiveFromDb(pool) {
  const code = await readActiveCodeFromDb(pool);
  setActiveProfile(code, catalog.getProfile(code));
  return getActiveProfile();
}

async function upsertFinSetting(pool, key, value) {
  if (value == null || value === '') return;
  await pool.query(
    'INSERT INTO tbl_hms_fin_setting (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [key, String(value)]
  );
}

async function syncProfileToSystemSettings(pool, profile) {
  await upsertFinSetting(pool, 'company.currency', profile.currency.code);
  await upsertFinSetting(pool, 'company.currency_locale', profile.currency.locale);
  await upsertFinSetting(pool, 'company.city', profile.defaultCity);
  await upsertFinSetting(pool, 'company.fiscal_regime', profile.fiscalRegime);
  await upsertFinSetting(pool, 'accounting.chart', profile.chartOfAccounts.template);
  await upsertFinSetting(pool, 'tax.tva_rate_standard', String(profile.vatRateStandard));
  await upsertFinSetting(pool, 'country.code', profile.code);
  await upsertFinSetting(pool, 'country.name', profile.name);
  await upsertFinSetting(pool, 'geo.api_path', profile.geo.apiPath);
  await upsertFinSetting(pool, 'geo.region_label', profile.geo.regionLabel);
  await upsertFinSetting(pool, 'geo.sub_region_label', profile.geo.subRegionLabel);
  await upsertFinSetting(pool, 'tax.rates_json', JSON.stringify(profile.taxes || []));
  await upsertFinSetting(pool, 'payroll.taxes_json', JSON.stringify(profile.payrollTaxes || []));
  await upsertFinSetting(pool, 'payment.methods_json', JSON.stringify(profile.paymentMethods || []));
  await upsertFinSetting(pool, 'payment.cashier_methods_json', JSON.stringify(profile.cashierMethods || []));
  const erPayroll = (profile.payrollTaxes || []).find((r) =>
    /^(CNPS_ER|SS_ER|PENSION_ER)$/i.test(String(r.code || ''))
  );
  if (erPayroll?.rate != null) {
    await upsertFinSetting(pool, 'tax.cnps_employer_pct', String(erPayroll.rate));
  }
}

async function applyProfile(pool, code, userId) {
  const profile = catalog.getProfile(code);
  if (!profile) throw new Error('Unknown country profile: ' + code);

  await pool.query('UPDATE tbl_app_settings SET active_country_code=? WHERE id=1', [profile.code]).catch(async () => {
    await pool.query(
      'INSERT INTO tbl_app_settings (id, product_mode, product_slices, active_country_code) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE active_country_code = VALUES(active_country_code)',
      ['full', JSON.stringify(['full']), profile.code]
    );
  });

  await pool.query('UPDATE tbl_hms_country_profile SET is_active=0');
  await pool.query(
    'UPDATE tbl_hms_country_profile SET is_active=1, applied_at=NOW(), applied_by=? WHERE code=?',
    [userId || null, profile.code]
  );

  await syncProfileToSystemSettings(pool, profile);
  setActiveProfile(profile.code, profile);
  invalidateLoadCache();
  try {
    const { ensureProfileCoaSeeded } = require('./ensureProfileCoa');
    await ensureProfileCoaSeeded(pool, { force: true });
  } catch (e) {
    console.warn('[country-profile] COA reseed skipped:', e.message);
  }
  try {
    const { syncCountryCreditProviders } = require('./labCreditProviderSeed');
    await syncCountryCreditProviders(pool, profile.code);
  } catch (e) {
    console.warn('[country-profile] credit provider seed skipped:', e.message);
  }
  return profile;
}

function publicPayload() {
  const p = getActiveProfile();
  return {
    country: p.code,
    code: p.code,
    isNigeria: p.code === 'NG',
    isCameroon: p.code === 'CM',
    showsLanguageSwitcher: p.code === 'CM',
    regionGroup: p.regionGroup,
    geoApi: p.geo.apiPath,
    geo: {
      apiPath: p.geo.apiPath,
      regionLabel: p.geo.regionLabel,
      subRegionLabel: p.geo.subRegionLabel,
      divisionLabel: p.geo.divisionLabel,
      description: p.geo.description,
    },
    currencyCode: p.currency.code,
    currencySymbol: p.currency.symbol,
    currencyLocale: p.currency.locale,
    currencyDisplaySuffix: p.currency.displaySuffix,
    defaultTimezone: p.timezone,
    defaultCity: p.defaultCity,
    fiscalRegime: p.fiscalRegime,
    vatRateStandard: p.vatRateStandard,
    chartOfAccounts: p.chartOfAccounts,
    taxes: p.taxes,
    payrollTaxes: p.payrollTaxes,
    languages: p.languages,
    paymentMethods: p.paymentMethods,
    cashierMethods: p.cashierMethods,
    patientRegistration: p.patientRegistration,
  };
}

module.exports = {
  getActiveCode,
  getActiveProfile,
  setActiveProfile,
  listProfiles,
  getProfile,
  loadActiveFromDb,
  ensureLoaded,
  invalidateLoadCache,
  applyProfile,
  syncProfileToSystemSettings,
  publicPayload,
};
