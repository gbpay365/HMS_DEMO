#!/usr/bin/env node
'use strict';

/**
 * Compare row counts: local MySQL vs Railway PostgreSQL.
 * Usage: node scripts/verify-mysql-pg-sync.js [--fix-hints]
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const SCRIPT_DIR = __dirname;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

async function main() {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  loadEnvFile(path.join(SCRIPT_DIR, 'railway-postgres.env'));

  const mysqlPool = await mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.LOCAL_DB_PORT || process.env.DB_PORT || '3306', 10),
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || 'root',
    password: process.env.LOCAL_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || 'hms',
  });

  const pgUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!pgUrl) throw new Error('Set DATABASE_PUBLIC_URL in scripts/railway-postgres.env');
  const pg = new Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const [mysqlTables] = await mysqlPool.query(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`
  );
  const pgTables = await pg.query(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );

  const mysqlSet = new Set(mysqlTables.map((r) => r.name));
  const pgSet = new Set(pgTables.rows.map((r) => r.name));

  const missingOnPg = [...mysqlSet].filter((t) => !pgSet.has(t));
  const extraOnPg = [...pgSet].filter((t) => !mysqlSet.has(t));

  const diffs = [];
  let matched = 0;
  for (const name of mysqlSet) {
    if (!pgSet.has(name)) continue;
    const [[mc]] = await mysqlPool.query(`SELECT COUNT(*) AS n FROM \`${name}\``);
    const pr = await pg.query(`SELECT COUNT(*)::bigint AS n FROM "${name}"`);
    const mn = Number(mc.n);
    const pn = Number(pr.rows[0].n);
    if (mn !== pn) diffs.push({ table: name, mysql: mn, postgres: pn, delta: pn - mn });
    else matched += 1;
  }

  console.log('\n=== MySQL → PostgreSQL sync report ===\n');
  console.log(`MySQL tables:    ${mysqlSet.size}`);
  console.log(`Postgres tables: ${pgSet.size}`);
  console.log(`Row-count match: ${matched}`);
  console.log(`Row-count diff:  ${diffs.length}`);
  console.log(`Missing on PG:   ${missingOnPg.length}`);
  if (missingOnPg.length) console.log('  ', missingOnPg.slice(0, 20).join(', '), missingOnPg.length > 20 ? '…' : '');

  if (diffs.length) {
    console.log('\nTables with different row counts:');
    for (const d of diffs.sort((a, b) => Math.abs(b.mysql - b.postgres) - Math.abs(a.mysql - a.postgres)).slice(0, 40)) {
      console.log(`  ${d.table}: MySQL=${d.mysql}  PG=${d.postgres}  (Δ ${d.delta >= 0 ? '+' : ''}${d.delta})`);
    }
    if (diffs.length > 40) console.log(`  … and ${diffs.length - 40} more`);
    console.log('\nRe-run full migration: node scripts/migrate-mysql-to-postgres.js');
    process.exitCode = 1;
  } else if (missingOnPg.length) {
    console.log('\nRe-run migration for missing tables.');
    process.exitCode = 1;
  } else {
    console.log('\nAll table row counts match.');
  }

  await mysqlPool.end();
  await pg.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
