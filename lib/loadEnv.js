'use strict';
/**
 * Load environment variables for HMS.
 * Tries .env first, then .env.production if DB_NAME is still unset (cPanel only).
 * On Railway, never load file-based MySQL localhost overrides.
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const prodPath = path.join(root, '.env.production');

function isRailwayRuntime() {
  return !!(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_STATIC_URL
  );
}

function wantsPostgresEnv() {
  const d = String(process.env.HMS_DB_DRIVER || process.env.DB_DRIVER || '').toLowerCase();
  if (d === 'postgres' || d === 'postgresql') return true;
  return /^postgres(ql)?:\/\//i.test(String(process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL || ''));
}

/** Remove legacy MySQL DB_* vars that break Railway Postgres when mixed in. */
function sanitizeDbEnv() {
  if (!wantsPostgresEnv()) return;

  const host = String(process.env.DB_HOST || '').trim();
  const onRailway = isRailwayRuntime();

  // On Railway Postgres deploys, never use file/platform MySQL-style DB_* leftovers.
  if (onRailway || /^localhost$|127\.0\.0\.1|^::1$/i.test(host)) {
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;
  }
}

function loadEnv() {
  const onRailway = isRailwayRuntime();
  const r1 = dotenv.config({ path: envPath });
  let loadedFrom = fs.existsSync(envPath) ? '.env' : null;

  // cPanel fallback only — Railway must use service variables, not committed .env.production
  if (!onRailway && !process.env.DB_NAME && fs.existsSync(prodPath)) {
    dotenv.config({ path: prodPath });
    loadedFrom = loadedFrom || '.env.production';
  }

  sanitizeDbEnv();

  return {
    loadedFrom,
    onRailway,
    envExists: fs.existsSync(envPath),
    prodExists: fs.existsSync(prodPath),
    dotenvError: r1.error && r1.error.code !== 'ENOENT' ? r1.error.message : null,
  };
}

module.exports = { loadEnv, envPath, prodPath, isRailwayRuntime, sanitizeDbEnv };
