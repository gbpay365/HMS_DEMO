'use strict';

const HMS_BUILD = 'postgres-railway-fix-04';

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
      source: 'mysql DATABASE_URL',
    };
  } catch {
    return null;
  }
}

function parsePostgresUrl(url, source = 'DATABASE_URL') {
  const raw = String(url || '').trim();
  if (!raw || !/^postgres(ql)?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    const database = (u.pathname || '/').replace(/^\//, '') || 'railway';
    const host = u.hostname || 'localhost';
    const isLocal = /localhost|127\.0\.0\.1|^::1$/i.test(host);
    return {
      driver: 'postgres',
      host,
      port: parseInt(u.port || '5432', 10),
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      database,
      connectionString: raw,
      ssl: !isLocal && process.env.PGSSLMODE !== 'disable',
      source,
    };
  } catch {
    return null;
  }
}

function isLocalHost(host) {
  return /localhost|127\.0\.0\.1|^::1$/i.test(String(host || '').trim());
}

/** Railway / PG* vars — never mix with legacy MySQL DB_* on Postgres deploys. */
function resolvePostgresConfig(env) {
  const urlCandidates = [
    ['DATABASE_PUBLIC_URL', env.DATABASE_PUBLIC_URL],
    ['DATABASE_URL', env.DATABASE_URL],
    ['PGURL', env.PGURL],
  ];
  for (const [label, raw] of urlCandidates) {
    const parsed = parsePostgresUrl(raw, label);
    if (parsed) return parsed;
  }

  const host = String(env.PGHOST || '').trim();
  if (host) {
    const port = parseInt(env.PGPORT || '5432', 10);
    const user = env.PGUSER || env.POSTGRES_USER || 'postgres';
    const password = env.PGPASSWORD ?? env.POSTGRES_PASSWORD ?? '';
    const database = env.PGDATABASE || env.POSTGRES_DB || 'railway';
    const isLocal = isLocalHost(host);
    const userEnc = encodeURIComponent(user);
    const passEnc = encodeURIComponent(password);
    return {
      driver: 'postgres',
      host,
      port,
      user,
      password,
      database,
      connectionString: `postgresql://${userEnc}:${passEnc}@${host}:${port}/${database}`,
      ssl: !isLocal && env.PGSSLMODE !== 'disable',
      source: 'PGHOST',
    };
  }

  return null;
}

function wantsPostgres(env) {
  const explicit = String(env.HMS_DB_DRIVER || env.DB_DRIVER || '').trim().toLowerCase();
  if (explicit === 'postgres' || explicit === 'postgresql') return true;
  const url = String(env.DATABASE_PUBLIC_URL || env.DATABASE_URL || '').trim();
  return /^postgres(ql)?:\/\//i.test(url);
}

function resolveDbConfig(env = process.env) {
  const pgConfig = resolvePostgresConfig(env);
  const fromMysql = parseMysqlUrl(env.DATABASE_URL);

  if (wantsPostgres(env)) {
    if (pgConfig) return pgConfig;
    throw new Error(
      'HMS_DB_DRIVER=postgres but no Postgres connection found. On Railway: link the Postgres ' +
        'service and set DATABASE_URL=${{Postgres.DATABASE_URL}} (or PGHOST/PGPASSWORD). ' +
        'Remove legacy DB_HOST=localhost from the web service.'
    );
  }

  if (pgConfig && !fromMysql) return pgConfig;

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
    source: 'DB_* / MYSQL*',
  };
}

module.exports = { resolveDbConfig, parseMysqlUrl, parsePostgresUrl, resolvePostgresConfig, wantsPostgres, HMS_BUILD };
