'use strict';

/**
 * Resolve MySQL connection settings for HMS (mysql2 / express-mysql-session).
 * Supports: DB_* vars, Railway MySQL plugin (MYSQL*), and mysql:// DATABASE_URL.
 * PostgreSQL DATABASE_URL is ignored — HMS requires MySQL/MariaDB.
 */
function parseMysqlUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || !/^mysql:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    return {
      host: u.hostname || 'localhost',
      port: parseInt(u.port || '3306', 10),
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      database: (u.pathname || '/').replace(/^\//, '') || 'railway',
    };
  } catch {
    return null;
  }
}

function isRemoteRailwayHost(host) {
  const h = String(host || '').toLowerCase();
  return h.includes('.rlwy.net') || h.includes('railway.internal') || h.includes('crossover.proxy');
}

function resolveDbConfig(env = process.env) {
  const localOnly =
    String(env.HMS_LOCAL_ONLY || '').trim() === '1' ||
    String(env.HMS_LOCAL_ONLY || '').toLowerCase() === 'true';

  const fromUrl = parseMysqlUrl(env.DATABASE_URL);
  let host =
    env.DB_HOST ||
    env.MYSQLHOST ||
    env.RAILWAY_MYSQL_HOST ||
    (fromUrl && fromUrl.host) ||
    'localhost';
  let port = parseInt(
    env.DB_PORT || env.MYSQLPORT || env.RAILWAY_MYSQL_PORT || (fromUrl && fromUrl.port) || '3306',
    10
  );
  let user =
    env.DB_USER || env.MYSQLUSER || env.RAILWAY_MYSQL_USER || (fromUrl && fromUrl.user) || '';
  let password =
    env.DB_PASSWORD ?? env.MYSQLPASSWORD ?? env.RAILWAY_MYSQL_PASSWORD ?? (fromUrl && fromUrl.password) ?? '';
  let database =
    env.DB_NAME || env.MYSQLDATABASE || env.RAILWAY_MYSQL_DATABASE || (fromUrl && fromUrl.database) || '';

  if (localOnly) {
    if (isRemoteRailwayHost(host)) {
      console.warn(
        `[HMS] HMS_LOCAL_ONLY=1 — ignoring remote DB host "${host}"; using localhost / DB_* from .env`
      );
    }
    host = env.DB_HOST || 'localhost';
    port = parseInt(env.DB_PORT || '3306', 10);
    user = env.DB_USER || 'root';
    password = env.DB_PASSWORD ?? '';
    database = env.DB_NAME || 'hms';
  }

  const pgUrl = String(env.DATABASE_URL || env.DATABASE_PUBLIC_URL || '').trim();
  const postgresLinked = /^postgres(ql)?:\/\//i.test(pgUrl);

  return {
    host,
    port,
    user,
    password,
    database,
    postgresLinked,
    source: env.DB_HOST
      ? 'DB_*'
      : env.MYSQLHOST
        ? 'MYSQL*'
        : fromUrl
          ? 'mysql DATABASE_URL'
          : 'defaults',
  };
}

module.exports = { resolveDbConfig, parseMysqlUrl };
