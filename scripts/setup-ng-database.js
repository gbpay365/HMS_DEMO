'use strict';

/**
 * Create MySQL database NG and clone all data from hms_demo.
 * Usage: node scripts/setup-ng-database.js
 */
const { execSync } = require('child_process');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MYSQL = process.env.MYSQL_CLI || 'C:\\ServBay\\packages\\defaultsqlserver\\current\\bin\\mysql.exe';
const DUMP = process.env.MYSQLDUMP_CLI || 'C:\\ServBay\\packages\\defaultsqlserver\\current\\bin\\mysqldump.exe';
const MYSQL_INI = process.env.MYSQL_INI || 'C:\\ServBay\\etc\\defaultsqlserver\\current\\my.ini';
const SOURCE_DB = process.env.SOURCE_DB || 'hms_demo';
const TARGET_DB = process.env.TARGET_DB || 'NG';

function mysqlArgs() {
  return MYSQL_INI && fs.existsSync(MYSQL_INI) ? `--defaults-file="${MYSQL_INI}"` : '';
}

async function main() {
  const root = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: SOURCE_DB,
    multipleStatements: true,
  });

  const [[src]] = await root.query('SELECT DATABASE() AS db');
  if (!src || !src.db) {
    throw new Error(`Source database "${SOURCE_DB}" not found. Start HMS_DEMO or import hms_demo first.`);
  }

  console.log(`Dropping and recreating ${TARGET_DB}...`);
  await root.query(`DROP DATABASE IF EXISTS \`${TARGET_DB}\``);
  await root.query(
    `CREATE DATABASE \`${TARGET_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await root.end();

  console.log(`Cloning ${SOURCE_DB} -> ${TARGET_DB} (mysqldump)...`);
  const ini = mysqlArgs();
  execSync(`"${DUMP}" ${ini} -u root --single-transaction --routines --triggers ${SOURCE_DB} | "${MYSQL}" ${ini} -u root ${TARGET_DB}`, {
    stdio: 'inherit',
    shell: true,
  });

  const rebrandPath = path.join(__dirname, '..', 'database', 'nigeria-rebrand.sql');
  if (fs.existsSync(rebrandPath)) {
    console.log('Applying Nigeria rebrand SQL...');
    execSync(`Get-Content "${rebrandPath}" | & "${MYSQL}" ${ini} -u root ${TARGET_DB}`, {
      stdio: 'inherit',
      shell: 'powershell.exe',
    });
  }

  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: TARGET_DB,
  });
  const [[{ tables }]] = await conn.query(
    'SELECT COUNT(*) AS tables FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
    [TARGET_DB]
  );
  await conn.end();

  process.env.HMS_COUNTRY = 'NG';
  process.env.DB_NAME = TARGET_DB;
  console.log(`Seeding Nigeria IFRS chart of accounts into ${TARGET_DB}…`);
  const { seedFinAccounts } = require('../lib/finAccountSeedData');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: TARGET_DB,
    waitForConnections: true,
    connectionLimit: 2,
  });
  const seedResult = await seedFinAccounts(pool, { forceReset: true });
  await pool.end();
  console.log('COA seed:', seedResult);

  console.log(`Done. ${TARGET_DB} has ${tables} tables.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
