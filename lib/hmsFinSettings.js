'use strict';

const hmsBrand = require('./hmsBrand');
const hmsCountry = require('./hmsCountry');
const { glMaps } = require('./finGlAccountMaps');
const { ohadaClassFromCode } = require('./hmsFinOhadaLabels');

const OHADA_CLASSES = [
  { id: 1, label: 'Class 1 — Equity & resources' },
  { id: 2, label: 'Class 2 — Fixed assets' },
  { id: 3, label: 'Class 3 — Inventory' },
  { id: 4, label: 'Class 4 — Third parties' },
  { id: 5, label: 'Class 5 — Cash & banks' },
  { id: 6, label: 'Class 6 — Expenses' },
  { id: 7, label: 'Class 7 — Revenue' },
];

async function getFinSetting(pool, key, def) {
  try {
    const [[r]] = await pool.query('SELECT v FROM tbl_hms_fin_setting WHERE k=? LIMIT 1', [key]);
    if (r && r.v != null && String(r.v).trim() !== '') return String(r.v);
  } catch (_) {}
  return def;
}

async function setFinSetting(pool, key, val) {
  await pool
    .query(
      'INSERT INTO tbl_hms_fin_setting (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
      [key, val == null ? '' : String(val)]
    )
    .catch(() => {});
}

async function loadTaxSettings(pool) {
  const profile = hmsCountry.profileService.getActiveProfile();
  const erPayroll = (profile?.payrollTaxes || []).find((r) =>
    /^(CNPS_ER|SS_ER|PENSION_ER)$/i.test(String(r.code || ''))
  );
  return {
    company_niu: await getFinSetting(pool, 'tax.company_niu', ''),
    company_legal_name: await getFinSetting(pool, 'company.legal_name', hmsBrand.orgName || 'ZAIZENS'),
    company_city: await getFinSetting(pool, 'company.city', hmsCountry.defaultCity()),
    tva_rate_standard: await getFinSetting(pool, 'tax.tva_rate_standard', hmsCountry.defaultVatRate()),
    cnps_employer_pct: await getFinSetting(
      pool,
      'tax.cnps_employer_pct',
      erPayroll?.rate != null ? String(erPayroll.rate) : '8.4'
    ),
    currency_code: await getFinSetting(pool, 'company.currency', hmsCountry.currencyCode()),
    fiscal_regime: await getFinSetting(pool, 'company.fiscal_regime', hmsCountry.fiscalRegime()),
    chart_template: await getFinSetting(pool, 'accounting.chart', glMaps().chartTemplate),
  };
}

async function monthlyRevenue(pool, y, m) {
  const pad = String(m).padStart(2, '0');
  const start = `${y}-${pad}-01`;
  const endDate = new Date(y, m, 0);
  const end = `${y}-${pad}-${String(endDate.getDate()).padStart(2, '0')}`;
  let rev = 0;
  try {
    const [[r]] = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS s FROM tbl_transaction
       WHERE status='completed' AND transaction_date >= ? AND transaction_date <= ?`,
      [start, end]
    );
    rev = Number(r?.s || 0);
  } catch (_) {}
  return rev;
}

async function loadAccountingStats(pool) {
  const stats = {
    accountCount: 0,
    journalCount: 0,
    glLineCount: 0,
    byClass: [],
    finOk: false,
  };
  try {
    const [[ac]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_fin_account').catch(() => [[{ c: 0 }]]);
    stats.accountCount = Number(ac?.c || 0);
    const [[jc]] = await pool
      .query('SELECT COUNT(*) AS c FROM tbl_fin_journal_header')
      .catch(() => [[{ c: 0 }]]);
    stats.journalCount = Number(jc?.c || 0);
    const [[lc]] = await pool
      .query('SELECT COUNT(*) AS c FROM tbl_fin_journal_line')
      .catch(() => [[{ c: 0 }]]);
    stats.glLineCount = Number(lc?.c || 0);
    stats.finOk = stats.accountCount > 0 || stats.journalCount > 0;
  } catch (_) {}

  if (stats.accountCount > 0) {
    try {
      const [rows] = await pool.query(
        'SELECT account_code FROM tbl_fin_account ORDER BY account_code LIMIT 5000'
      );
      const counts = {};
      for (const r of rows || []) {
        const cls = ohadaClassFromCode(r.account_code);
        if (cls >= 1 && cls <= 7) counts[cls] = (counts[cls] || 0) + 1;
      }
      stats.byClass = OHADA_CLASSES.map((c) => ({
        ...c,
        count: counts[c.id] || 0,
      }));
    } catch (_) {}
  }
  return stats;
}

async function loadSettingsPage(pool, opts) {
  const section = String(opts.section || 'general').toLowerCase();
  const m = Math.min(12, Math.max(1, parseInt(opts.m, 10) || new Date().getMonth() + 1));
  const y = Math.max(2000, parseInt(opts.y, 10) || new Date().getFullYear());
  const tax = await loadTaxSettings(pool);
  let betterpay = { partner_identifier: '', pay_base_url: '', configured: false };
  try {
    const betterPayConfig = require('./betterPayConfig');
    betterpay = await betterPayConfig.loadSettings(pool);
  } catch (_) {}
  const rev = await monthlyRevenue(pool, y, m);
  const accounting = await loadAccountingStats(pool);

  let dipeCount = 0;
  try {
    const [[d]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_hms_dipe_history').catch(() => [[{ c: 0 }]]);
    dipeCount = Number(d?.c || 0);
  } catch (_) {}

  return {
    section,
    m,
    y,
    tax,
    rev,
    accounting,
    ohadaClasses: OHADA_CLASSES,
    dipeCount,
    canWrite: !!opts.canWrite,
    betterpay,
  };
}

module.exports = {
  OHADA_CLASSES,
  getFinSetting,
  setFinSetting,
  loadTaxSettings,
  monthlyRevenue,
  loadAccountingStats,
  loadSettingsPage,
};
