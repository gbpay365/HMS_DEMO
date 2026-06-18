'use strict';

function parseMysqlUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || !/^mysql:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    return {
      driver: 'mysql',
      host: u.hostname || 'localhost',
      port: parseInt(u.port || '3306', 10),
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      database: (u.pathname || '/').replace(/^\//, '') || 'railway',
      connectionString: raw,
      ssl: false,
    };
  } catch {
    return null;
  }
}

function parsePostgresUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || !/^postgres(ql)?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    const database = (u.pathname || '/').replace(/^\//, '') || 'railway';
    return {
      driver: 'postgres',
      host: u.hostname || 'localhost',
      port: parseInt(u.port || '5432', 10),
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      database,
      connectionString: raw,
      ssl: !/localhost|127\.0\.0\.1/i.test(u.hostname),
    };
  } catch {
    return null;
  }
}

function resolveDbConfig(env = process.env) {
  const explicitDriver = String(env.HMS_DB_DRIVER || env.DB_DRIVER || '').trim().toLowerCase();
  const pgUrl = String(
    env.DATABASE_PUBLIC_URL || env.DATABASE_URL || env.PGURL || ''
  ).trim();
  const fromPg = parsePostgresUrl(pgUrl);
  const fromMysql = parseMysqlUrl(env.DATABASE_URL);

  if (explicitDriver === 'postgres' || explicitDriver === 'postgresql') {
    if (fromPg) return fromPg;
    return {
      driver: 'postgres',
      host: env.PGHOST || env.DB_HOST || 'localhost',
      port: parseInt(env.PGPORT || env.DB_PORT || '5432', 10),
      user: env.PGUSER || env.DB_USER || 'postgres',
      password: env.PGPASSWORD ?? env.DB_PASSWORD ?? '',
      database: env.PGDATABASE || env.POSTGRES_DB || env.DB_NAME || 'railway',
      connectionString:
        pgUrl ||
        `postgresql://${encodeURIComponent(env.PGUSER || 'postgres')}:${encodeURIComponent(env.PGPASSWORD || '')}@${env.PGHOST || 'localhost'}:${env.PGPORT || 5432}/${env.PGDATABASE || 'railway'}`,
      ssl: env.PGSSLMODE === 'disable' ? false : !/localhost|127\.0\.0\.1/i.test(env.PGHOST || ''),
    };
  }

  if (fromPg && (explicitDriver === 'postgres' || !fromMysql)) {
    return fromPg;
  }

  const host =
    env.DB_HOST ||
    env.MYSQLHOST ||
    env.RAILWAY_MYSQL_HOST ||
    (fromMysql && fromMysql.host) ||
    'localhost';
  const port = parseInt(
    env.DB_PORT || env.MYSQLPORT || env.RAILWAY_MYSQL_PORT || (fromMysql && fromMysql.port) || '3306',
    10
  );
  const user =
    env.DB_USER || env.MYSQLUSER || env.RAILWAY_MYSQL_USER || (fromMysql && fromMysql.user) || '';
  const password =
    env.DB_PASSWORD ?? env.MYSQLPASSWORD ?? env.RAILWAY_MYSQL_PASSWORD ?? (fromMysql && fromMysql.password) ?? '';
  const database =
    env.DB_NAME || env.MYSQLDATABASE || env.RAILWAY_MYSQL_DATABASE || (fromMysql && fromMysql.database) || '';

  return {
    driver: 'mysql',
    host,
    port,
    user,
    password,
    database,
    connectionString: fromMysql && fromMysql.connectionString,
    ssl: false,
  };
}

module.exports = { resolveDbConfig, parseMysqlUrl, parsePostgresUrl };
