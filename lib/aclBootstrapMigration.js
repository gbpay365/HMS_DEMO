'use strict';

/** Keys for one-time ACL permission bootstraps (never re-run after applied). */
const ACL_BOOTSTRAP_KEYS = Object.freeze([
  'bootstrap.payment_validity_v1',
  'bootstrap.hr_self_service_v1',
  'bootstrap.dashboard_read_v1',
  'bootstrap.director_capabilities_v1',
  'bootstrap.assets_v1',
  'bootstrap.mgmt_reports_v1',
  'bootstrap.director_revenue_v1',
  'bootstrap.director_dashboard_v1',
  'bootstrap.director_weekly_v1',
  'bootstrap.director_monthly_v1',
  'bootstrap.director_monthly_costs_v1',
  'bootstrap.director_annual_v1',
  'bootstrap.subscriptions_v1',
  'bootstrap.accountant_reports_v1',
  'bootstrap.nurse_duty_v1',
  'bootstrap.nursing_patient_v1',
  'bootstrap.system_admin_profile_v1',
  'bootstrap.role_profiles_v1',
]);

const META_SEAL_KEY = 'meta.bootstraps_sealed_v1';

async function ensureAclMigrationTable(pool) {
  if (pool?.driver === 'postgres') {
    await pool
      .query(`
        CREATE TABLE IF NOT EXISTS tbl_acl_migration (
          migration_key VARCHAR(80) NOT NULL PRIMARY KEY,
          applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      .catch(() => {});
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_acl_migration (
      migration_key VARCHAR(80) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function aclMigrationApplied(pool, key) {
  const [[row]] = await pool
    .query('SELECT 1 AS ok FROM tbl_acl_migration WHERE migration_key = ? LIMIT 1', [String(key)])
    .catch(() => [[null]]);
  return !!row;
}

/**
 * Run a permission bootstrap exactly once. After an admin revokes a grant,
 * server restarts must not INSERT IGNORE it back.
 */
async function runAclBootstrapOnce(pool, key, fn) {
  await ensureAclMigrationTable(pool);
  if (await aclMigrationApplied(pool, key)) return false;
  await fn();
  await pool.query('INSERT INTO tbl_acl_migration (migration_key) VALUES (?)', [String(key)]);
  return true;
}

/**
 * Existing databases already have role grants — mark all bootstraps as done
 * without executing them so current Access Control edits are preserved.
 */
async function sealAclBootstrapsForExistingInstall(pool, isExistingInstall) {
  await ensureAclMigrationTable(pool);
  if (!isExistingInstall) return false;
  if (await aclMigrationApplied(pool, META_SEAL_KEY)) return false;
  for (const key of ACL_BOOTSTRAP_KEYS) {
    await pool.query('INSERT IGNORE INTO tbl_acl_migration (migration_key) VALUES (?)', [key]);
  }
  await pool.query('INSERT INTO tbl_acl_migration (migration_key) VALUES (?)', [META_SEAL_KEY]);
  return true;
}

module.exports = {
  ACL_BOOTSTRAP_KEYS,
  META_SEAL_KEY,
  ensureAclMigrationTable,
  aclMigrationApplied,
  runAclBootstrapOnce,
  sealAclBootstrapsForExistingInstall,
};
