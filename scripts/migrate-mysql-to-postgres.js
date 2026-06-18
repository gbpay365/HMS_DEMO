#!/usr/bin/env node
'use strict';

/**
 * One-way migration: local MySQL (XAMPP) → Railway PostgreSQL.
 *
 * IMPORTANT: ZAIZENS HMS runs on MySQL (mysql2). This script copies schema + data
 * to Postgres for hosting experiments / analytics — the Node app will NOT work on
 * Postgres without a major SQL portability rewrite. For Railway production, use
 * Railway MySQL + scripts/sync-mysql-to-railway.js instead.
 *
 * Usage:
 *   node scripts/migrate-mysql-to-postgres.js [--dry-run] [--tables=a,b] [--skip-fks]
 *
 * Config: scripts/railway-postgres.env (copy from railway-postgres.env.example)
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { Client } = require('pg');

const SCRIPT_DIR = __dirname;
const ROOT = path.join(SCRIPT_DIR, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function loadConfig() {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  loadEnvFile(path.join(SCRIPT_DIR, 'railway-postgres.env'));

  const useHms = process.env.LOCAL_DB_USE_HMS_ENV !== '0';
  const local = {
    host: process.env.LOCAL_DB_HOST || (useHms ? process.env.DB_HOST : 'localhost') || 'localhost',
    port: parseInt(process.env.LOCAL_DB_PORT || (useHms ? process.env.DB_PORT : '3306') || '3306', 10),
    user: process.env.LOCAL_DB_USER || (useHms ? process.env.DB_USER : 'root') || 'root',
    password: process.env.LOCAL_DB_PASSWORD ?? (useHms ? process.env.DB_PASSWORD : '') ?? '',
    database: process.env.LOCAL_DB_NAME || (useHms ? process.env.DB_NAME : 'hms') || 'hms',
  };

  const pgUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!pgUrl) {
    throw new Error('Set DATABASE_PUBLIC_URL in scripts/railway-postgres.env');
  }
  if (pgUrl.includes('railway.internal')) {
    throw new Error('Use DATABASE_PUBLIC_URL (turntable.proxy.rlwy.net), not railway.internal');
  }

  return {
    local,
    pgUrl,
    batchSize: parseInt(process.env.MIGRATE_BATCH_SIZE || '300', 10),
    skipTables: new Set(
      String(process.env.MIGRATE_SKIP_TABLES || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
    onlyTables: String(process.env.MIGRATE_ONLY_TABLES || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function parseArgs(argv) {
  const opts = { dryRun: false, skipFks: false, tables: [] };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--skip-fks') opts.skipFks = true;
    else if (arg.startsWith('--tables=')) {
      opts.tables = arg
        .slice('--tables='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return opts;
}

function qIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function mysqlTypeToPg(column) {
  const columnType = String(column.COLUMN_TYPE || '').toLowerCase();
  const dataType = String(column.DATA_TYPE || '').toLowerCase();

  if (columnType.startsWith('enum(') || columnType.startsWith('set(')) return 'TEXT';
  if (columnType === 'tinyint(1)' || columnType === 'tinyint(1) unsigned') return 'SMALLINT';
  if (columnType.includes('unsigned')) {
    if (dataType === 'bigint') return 'NUMERIC(20,0)';
    if (dataType === 'int' || dataType === 'integer') return 'BIGINT';
    if (dataType === 'smallint' || dataType === 'tinyint' || dataType === 'mediumint') return 'INTEGER';
  }
  if (dataType === 'tinyint' || dataType === 'smallint' || dataType === 'mediumint') return 'SMALLINT';
  if (dataType === 'int' || dataType === 'integer') return 'INTEGER';
  if (dataType === 'bigint') return 'BIGINT';
  if (dataType === 'decimal' || dataType === 'numeric') {
    const p = column.NUMERIC_PRECISION || 10;
    const s = column.NUMERIC_SCALE || 0;
    return `NUMERIC(${p},${s})`;
  }
  if (dataType === 'float') return 'REAL';
  if (dataType === 'double') return 'DOUBLE PRECISION';
  if (dataType === 'bit') return 'BIT';
  if (dataType === 'date') return 'DATE';
  if (dataType === 'time') return 'TIME';
  if (dataType === 'datetime' || dataType === 'timestamp') return 'TIMESTAMP';
  if (dataType === 'year') return 'SMALLINT';
  if (dataType === 'json') return 'JSONB';
  if (dataType === 'blob' || dataType === 'tinyblob' || dataType === 'mediumblob' || dataType === 'longblob') {
    return 'BYTEA';
  }
  if (dataType === 'text' || dataType === 'tinytext' || dataType === 'mediumtext' || dataType === 'longtext') {
    return 'TEXT';
  }
  if (dataType === 'char' || dataType === 'varchar') {
    const len = column.CHARACTER_MAXIMUM_LENGTH;
    if (!len || len > 10485760) return 'TEXT';
    return `VARCHAR(${len})`;
  }
  if (dataType === 'binary' || dataType === 'varbinary') return 'BYTEA';
  return 'TEXT';
}

function normalizeDefault(column, pgType) {
  let def = column.COLUMN_DEFAULT;
  if (def === null || def === undefined) return null;
  def = String(def).trim();
  if (def.toUpperCase() === 'NULL') return null;
  if ((def.startsWith("'") && def.endsWith("'")) || (def.startsWith('"') && def.endsWith('"'))) {
    def = def.slice(1, -1).replace(/''/g, "'");
  }
  if (/^current_timestamp(\(\))?$/i.test(def)) return 'CURRENT_TIMESTAMP';
  if (/^now\(\)$/i.test(def)) return 'CURRENT_TIMESTAMP';
  if (/^curdate\(\)$/i.test(def)) return 'CURRENT_DATE';
  if (/^current_date(\(\))?$/i.test(def)) return 'CURRENT_DATE';
  if (/^curtime\(\)$/i.test(def)) return 'CURRENT_TIME';
  if (/^\w+\(\)$/i.test(def)) return null; /* skip other MySQL function defaults */
  if (pgType === 'SMALLINT' || pgType === 'INTEGER' || pgType === 'BIGINT' || pgType.startsWith('NUMERIC')) {
    if (/^-?\d+(\.\d+)?$/.test(def)) return def;
  }
  if (pgType === 'TIMESTAMP' && def === '0000-00-00 00:00:00') return null;
  if (pgType === 'DATE' && def === '0000-00-00') return null;
  return `'${def.replace(/'/g, "''")}'`;
}

function buildCreateTable(table, columns) {
  const colDefs = [];
  const pkCols = [];
  for (const col of columns) {
    const name = qIdent(col.COLUMN_NAME);
    let pgType = mysqlTypeToPg(col);
    const extra = String(col.EXTRA || '').toLowerCase();
    const isAuto = extra.includes('auto_increment');
    if (isAuto) {
      if (pgType === 'INTEGER') pgType = 'SERIAL';
      else if (pgType === 'BIGINT') pgType = 'BIGSERIAL';
      else if (pgType === 'SMALLINT') pgType = 'SMALLSERIAL';
      else pgType = 'SERIAL';
    }
    let line = `${name} ${pgType}`;
    if (!isAuto && col.IS_NULLABLE === 'NO') line += ' NOT NULL';
    if (!isAuto) {
      const def = normalizeDefault(col, pgType);
      if (def !== null) line += ` DEFAULT ${def}`;
    }
    colDefs.push(line);
    if (col.COLUMN_KEY === 'PRI') pkCols.push(qIdent(col.COLUMN_NAME));
  }
  if (pkCols.length) colDefs.push(`PRIMARY KEY (${pkCols.join(', ')})`);
  return `CREATE TABLE IF NOT EXISTS ${qIdent(table)} (\n  ${colDefs.join(',\n  ')}\n);`;
}

function coerceRowValue(value, column) {
  if (value === null || value === undefined) return null;
  const columnType = String(column.COLUMN_TYPE || '').toLowerCase();
  const dataType = String(column.DATA_TYPE || '').toLowerCase();

  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Date) return value;

  if (columnType.startsWith('bit')) {
    if (Buffer.isBuffer(value)) return value;
    if (typeof value === 'number') return Buffer.from([value & 1]);
  }

  if (dataType === 'json' && typeof value === 'object') return JSON.stringify(value);
  if (dataType === 'json' && typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }

  if (
    (dataType === 'datetime' || dataType === 'timestamp' || dataType === 'date') &&
    typeof value === 'string'
  ) {
    if (value.startsWith('0000-00-00')) return null;
  }

  if (columnType === 'tinyint(1)' || columnType === 'tinyint(1) unsigned') {
    return value ? 1 : 0;
  }

  return value;
}

async function fetchMysqlTables(conn, cfg, cliTables) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME AS name
       FROM information_schema.tables
      WHERE table_schema = ?
        AND table_type = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
    [cfg.local.database]
  );
  let names = rows.map((r) => r.name);
  if (cfg.onlyTables.length) {
    const allow = new Set(cfg.onlyTables);
    names = names.filter((n) => allow.has(n));
  }
  if (cliTables.length) {
    const allow = new Set(cliTables);
    names = names.filter((n) => allow.has(n));
  }
  names = names.filter((n) => !cfg.skipTables.has(n));
  return names;
}

async function fetchColumns(conn, schema, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
            COLUMN_KEY, EXTRA, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [schema, table]
  );
  return rows;
}

async function fetchForeignKeys(conn, schema) {
  const [rows] = await conn.query(
    `SELECT k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
            rc.UPDATE_RULE, rc.DELETE_RULE
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
        AND rc.CONSTRAINT_NAME = k.CONSTRAINT_NAME
      WHERE k.TABLE_SCHEMA = ?
        AND k.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY k.TABLE_NAME, k.ORDINAL_POSITION`,
    [schema]
  );
  return rows;
}

async function copyTableData(mysqlConn, pgClient, table, columns, batchSize) {
  const colNames = columns.map((c) => c.COLUMN_NAME);
  const quotedCols = colNames.map((c) => qIdent(c)).join(', ');
  const placeholders = colNames.map((_, i) => `$${i + 1}`).join(', ');
  const insertSql = `INSERT INTO ${qIdent(table)} (${quotedCols}) VALUES (${placeholders})`;

  const [rows] = await mysqlConn.query(`SELECT * FROM \`${table}\``);
  if (!rows.length) return 0;

  let copied = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    await pgClient.query('BEGIN');
    try {
      for (const row of chunk) {
        const values = colNames.map((name, idx) => coerceRowValue(row[name], columns[idx]));
        await pgClient.query(insertSql, values);
      }
      await pgClient.query('COMMIT');
      copied += chunk.length;
    } catch (err) {
      await pgClient.query('ROLLBACK');
      throw new Error(`${table} row batch @${i}: ${err.message}`);
    }
  }
  return copied;
}

async function resetSequences(pgClient, table, columns) {
  const autoCols = columns.filter((c) => String(c.EXTRA || '').toLowerCase().includes('auto_increment'));
  if (!autoCols.length) return;
  const col = autoCols[0].COLUMN_NAME;
  const seqName = `${table}_${col}_seq`;
  await pgClient.query(
    `SELECT setval(pg_get_serial_sequence($1, $2),
      COALESCE((SELECT MAX(${qIdent(col)}) FROM ${qIdent(table)}), 1),
      (SELECT COUNT(*) > 0 FROM ${qIdent(table)}))`,
    [table, col]
  ).catch(() => {
    /* SERIAL naming may differ; non-fatal */
  });
}

async function main() {
  const cfg = loadConfig();
  const opts = parseArgs(process.argv.slice(2));

  console.log('=== MySQL → PostgreSQL migration ===');
  console.log(`Source: ${cfg.local.user}@${cfg.local.host}/${cfg.local.database}`);
  console.log(`Target: ${cfg.pgUrl.replace(/:[^:@/]+@/, ':***@')}`);
  if (opts.dryRun) console.log('DRY RUN — no writes to PostgreSQL');

  const mysqlConn = await mysql.createConnection(cfg.local);
  const tables = await fetchMysqlTables(mysqlConn, cfg, opts.tables);
  console.log(`Tables to migrate: ${tables.length}`);

  if (opts.dryRun) {
    for (const table of tables.slice(0, 5)) {
      const cols = await fetchColumns(mysqlConn, cfg.local.database, table);
      console.log('\n--', table);
      console.log(buildCreateTable(table, cols));
    }
    if (tables.length > 5) console.log(`\n... and ${tables.length - 5} more tables`);
    await mysqlConn.end();
    return;
  }

  const pgClient = new Client({ connectionString: cfg.pgUrl, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();

  console.log('Dropping existing public tables on Railway Postgres…');
  await pgClient.query('DROP SCHEMA public CASCADE');
  await pgClient.query('CREATE SCHEMA public');
  await pgClient.query('GRANT ALL ON SCHEMA public TO public');

  const tableColumns = new Map();
  for (const table of tables) {
    const cols = await fetchColumns(mysqlConn, cfg.local.database, table);
    tableColumns.set(table, cols);
    const ddl = buildCreateTable(table, cols);
    await pgClient.query(ddl);
  }
  console.log('Schema created.');

  let totalRows = 0;
  for (const table of tables) {
    const cols = tableColumns.get(table);
    const n = await copyTableData(mysqlConn, pgClient, table, cols, cfg.batchSize);
    await resetSequences(pgClient, table, cols);
    totalRows += n;
    if (n > 0) console.log(`  ${table}: ${n} rows`);
  }
  console.log(`Data copied: ${totalRows} rows total.`);

  if (!opts.skipFks) {
    const fks = await fetchForeignKeys(mysqlConn, cfg.local.database);
    let fkOk = 0;
    let fkFail = 0;
    for (const fk of fks) {
      if (!tables.includes(fk.TABLE_NAME) || !tables.includes(fk.REFERENCED_TABLE_NAME)) continue;
      const onDelete = String(fk.DELETE_RULE || 'NO ACTION').replace(' ', ' ');
      const onUpdate = String(fk.UPDATE_RULE || 'NO ACTION').replace(' ', ' ');
      const sql = `ALTER TABLE ${qIdent(fk.TABLE_NAME)}
        ADD CONSTRAINT ${qIdent(`fk_${fk.TABLE_NAME}_${fk.COLUMN_NAME}`)}
        FOREIGN KEY (${qIdent(fk.COLUMN_NAME)})
        REFERENCES ${qIdent(fk.REFERENCED_TABLE_NAME)} (${qIdent(fk.REFERENCED_COLUMN_NAME)})
        ON DELETE ${onDelete} ON UPDATE ${onUpdate}`;
      try {
        await pgClient.query(sql);
        fkOk += 1;
      } catch (err) {
        fkFail += 1;
        console.warn(`  FK skip ${fk.TABLE_NAME}.${fk.COLUMN_NAME}: ${err.message}`);
      }
    }
    console.log(`Foreign keys: ${fkOk} added, ${fkFail} skipped.`);
  }

  const verify = await pgClient.query(
    "SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_schema = 'public'"
  );
  console.log(`Done. PostgreSQL public tables: ${verify.rows[0].c}`);

  await pgClient.end();
  await mysqlConn.end();
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message || err);
  process.exit(1);
});
