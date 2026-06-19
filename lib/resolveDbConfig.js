'use strict';

const HMS_BUILD = 'postgres-railway-fix-15';

function nonEmpty(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

/** Railway internal network does not use TLS; public proxy (rlwy.net) does. */
function postgresSslOption(host, env = process.env, urlSslMode) {
  const mode = String(urlSslMode || env.PGSSLMODE || '').toLowerCase();
  if (mode === 'disable' || mode === 'off' || mode === 'false') return false;
  if (mode === 'require' || mode === 'verify-full' || mode === 'verify-ca') {
    return { rejectUnauthorized: false };
  }
  const h = String(host || '').toLowerCase();
  if (/\.railway\.internal$/i.test(h)) return false;
  if (isLocalHost(h)) return false;
  if (/\.rlwy\.net$/i.test(h) || /\.proxy\.rlwy\.net$/i.test(h)) {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: false };
}

function scanEnvForPostgresUrl(env) {
  for (const [key, raw] of Object.entries(env || {})) {
    const parsed = parsePostgresUrl(raw, key);
    if (parsed) return parsed;
  }
  return null;
}

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
    const urlSslMode = u.searchParams.get('sslmode');
    return {
      driver: 'postgres',
      host,
      port: parseInt(u.port || '5432', 10),
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      database,
      connectionString: raw,
      ssl: postgresSslOption(host, process.env, urlSslMode),
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

  const scanned = scanEnvForPostgresUrl(env);
  if (scanned) return scanned;

  const host = nonEmpty(env.PGHOST);
  const password = nonEmpty(env.PGPASSWORD) ?? nonEmpty(env.POSTGRES_PASSWORD);
  if (host && password) {
    const port = parseInt(nonEmpty(env.PGPORT) || '5432', 10);
    const user = nonEmpty(env.PGUSER) || nonEmpty(env.POSTGRES_USER) || 'postgres';
    const database = nonEmpty(env.PGDATABASE) || nonEmpty(env.POSTGRES_DB) || 'railway';
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
      ssl: postgresSslOption(host, env),
      source: 'PGHOST+POSTGRES_PASSWORD',
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
    return {
      driver: 'postgres',
      valid: false,
      error:
        'Postgres variables exist on Railway but are EMPTY. Delete empty DATABASE_URL / PGHOST on the ' +
        'web service, then re-add DATABASE_URL using Add Reference → Postgres service → DATABASE_URL. ' +
        'Or set PGHOST, PGPORT, PGUSER, POSTGRES_PASSWORD, PGDATABASE from Postgres references.',
      host: '',
      port: 5432,
      user: '',
      password: '',
      database: env.PGDATABASE || env.POSTGRES_DB || 'railway',
      connectionString: '',
      ssl: false,
      source: 'missing',
    };
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

module.exports = {
  resolveDbConfig,
  parseMysqlUrl,
  parsePostgresUrl,
  resolvePostgresConfig,
  wantsPostgres,
  postgresSslOption,
  HMS_BUILD,
};
