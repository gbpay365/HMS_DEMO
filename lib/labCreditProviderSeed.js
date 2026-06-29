'use strict';

const { creditProvidersForCountry, resolveCountryCode } = require('./labCreditProviderCatalog');

async function columnExists(pool, table, col) {
  try {
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [table, col]
    );
    return Number(r?.c || 0) > 0;
  } catch (_) {
    return false;
  }
}

async function ensureCreditProviderCountryColumn(pool) {
  if (!(await columnExists(pool, 'tbl_lab_credit_provider', 'country_code'))) {
    await pool.query(
      `ALTER TABLE tbl_lab_credit_provider
         ADD COLUMN country_code CHAR(2) NULL DEFAULT NULL AFTER facility_id,
         ADD KEY idx_country (country_code)`
    ).catch(() => {});
  }
  await pool.query(
    `UPDATE tbl_lab_credit_provider SET country_code='NG'
     WHERE country_code IS NULL OR country_code=''`
  ).catch(() => {});
}

/** Upsert walk-in credit providers for the active country profile. */
async function syncCountryCreditProviders(pool, countryCode, facilityId = 1) {
  if (!pool || pool.driver === 'postgres') return;
  await ensureCreditProviderCountryColumn(pool);
  const cc = resolveCountryCode(countryCode);
  const providers = creditProvidersForCountry(cc);
  const fid = Math.max(1, parseInt(String(facilityId), 10) || 1);

  for (const [code, name, providerType, phone] of providers) {
    const [[existing]] = await pool.query(
      `SELECT id FROM tbl_lab_credit_provider WHERE country_code=? AND code=? LIMIT 1`,
      [cc, code]
    ).catch(() => [[null]]);
    if (existing?.id) {
      await pool.query(
        `UPDATE tbl_lab_credit_provider
            SET name=?, provider_type=?, contact_phone=?, active=1
          WHERE id=?`,
        [name, providerType, phone, existing.id]
      ).catch(() => {});
    } else {
      await pool.query(
        `INSERT INTO tbl_lab_credit_provider
           (facility_id, country_code, code, name, provider_type, contact_phone, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [fid, cc, code, name, providerType, phone]
      ).catch(() => {});
    }
  }

  const [carriers] = await pool.query(
    'SELECT code, name, phone FROM tbl_insurance_carrier WHERE status=1 ORDER BY name LIMIT 200'
  ).catch(() => [[]]);
  for (const c of carriers || []) {
    const icCode = `IC-${String(c.code || '').trim().slice(0, 24)}`;
    const icName = String(c.name || c.code || '').trim();
    if (!icCode || icCode === 'IC-' || !icName) continue;
    const [[existing]] = await pool.query(
      `SELECT id FROM tbl_lab_credit_provider WHERE country_code=? AND code=? LIMIT 1`,
      [cc, icCode]
    ).catch(() => [[null]]);
    if (existing?.id) {
      await pool.query(
        `UPDATE tbl_lab_credit_provider SET name=?, contact_phone=?, active=1 WHERE id=?`,
        [icName, c.phone || null, existing.id]
      ).catch(() => {});
    } else {
      await pool.query(
        `INSERT INTO tbl_lab_credit_provider
           (facility_id, country_code, code, name, provider_type, contact_phone, active)
         VALUES (?, ?, ?, ?, 'insurance', ?, 1)`,
        [fid, cc, icCode, icName, c.phone || null]
      ).catch(() => {});
    }
  }
}

module.exports = {
  ensureCreditProviderCountryColumn,
  syncCountryCreditProviders,
};
