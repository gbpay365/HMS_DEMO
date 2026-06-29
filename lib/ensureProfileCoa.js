'use strict';

const hmsCountry = require('./hmsCountry');

async function readSeededChartTemplate(pool) {
  const [[row]] = await pool
    .query("SELECT v FROM tbl_hms_fin_setting WHERE k='accounting.chart_seeded' LIMIT 1")
    .catch(() => [[null]]);
  return String(row?.v || '').trim();
}

async function markChartSeeded(pool, template) {
  await pool
    .query(
      "INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('accounting.chart_seeded', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      [String(template || '')]
    )
    .catch(() => {});
}

/** Reseed tbl_fin_account when the active country profile chart template changes. */
async function ensureProfileCoaSeeded(pool, options = {}) {
  const profile = hmsCountry.profileService.getActiveProfile();
  const template = String(profile?.chartOfAccounts?.template || '').trim();
  if (!template) return { skipped: true, reason: 'no_template' };

  const force = Boolean(options.force);
  const seeded = await readSeededChartTemplate(pool);
  if (!force && seeded === template) return { skipped: true, template };

  const { seedFinAccounts } = require('./finAccountSeedData');
  const result = await seedFinAccounts(pool, { forceReset: true });
  await markChartSeeded(pool, template);
  return { ...result, template, reseeded: true };
}

module.exports = {
  ensureProfileCoaSeeded,
  markChartSeeded,
  readSeededChartTemplate,
};
