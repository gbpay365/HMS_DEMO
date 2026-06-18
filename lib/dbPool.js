'use strict';

const mysql = require('mysql2/promise');
const { Pool: PgPool } = require('pg');
const { resolveDbConfig } = require('./resolveDbConfig');
const {
  adaptQuery,
  isSelectLike,
  buildInsertReturning,
  toMysqlStyleResult,
  mapPgError,
} = require('./pgSqlAdapter');

function createMysqlPool(config) {
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 15000,
  });
  pool.driver = 'mysql';
  pool.config = config;
  return pool;
}

function wrapPgClient(client, release) {
  const runner = {
    driver: 'postgres',
    async query(sql, params) {
      try {
        const original = String(sql || '');
        let { text, values } = adaptQuery(original, params);
        if (/^\s*INSERT\s+/i.test(original) && !/\bRETURNING\b/i.test(text)) {
          text = buildInsertReturning(text);
        }
        const result = await client.query(text, values);
        return toMysqlStyleResult(original, result);
      } catch (err) {
        throw mapPgError(err);
      }
    },
    async execute(sql, params) {
      return this.query(sql, params);
    },
    async beginTransaction() {
      await client.query('BEGIN');
    },
    async commit() {
      await client.query('COMMIT');
    },
    async rollback() {
      await client.query('ROLLBACK');
    },
    release() {
      if (typeof release === 'function') release();
    },
  };
  return runner;
}

function createPostgresPool(config) {
  const pool = new PgPool({
    connectionString: config.connectionString,
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });

  const api = {
    driver: 'postgres',
    config,
    nativePool: pool,
    async query(sql, params) {
      const client = await pool.connect();
      try {
        return await wrapPgClient(client, () => client.release()).query(sql, params);
      } catch (err) {
        client.release(err);
        throw err;
      }
    },
    async execute(sql, params) {
      return this.query(sql, params);
    },
    async getConnection() {
      const client = await pool.connect();
      return wrapPgClient(client, () => client.release());
    },
    async end() {
      await pool.end();
    },
  };

  return api;
}

function createDbPool(env = process.env) {
  const config = resolveDbConfig(env);
  if (config.valid === false) {
    const err = new Error(config.error || 'Database configuration is incomplete.');
    err.code = 'DB_CONFIG_MISSING';
    throw err;
  }
  if (!config.database && config.driver !== 'postgres') {
    throw new Error('DB_NAME / database is required');
  }
  if (config.driver === 'postgres') {
    return createPostgresPool(config);
  }
  const pool = createMysqlPool(config);
  pool.config = config;
  return pool;
}

module.exports = { createDbPool, resolveDbConfig };
