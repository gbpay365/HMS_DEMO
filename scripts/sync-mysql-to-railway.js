'use strict';

/**
 * Sync local XAMPP MySQL database to Railway MySQL (full logical refresh).
 * Usage: node scripts/sync-mysql-to-railway.js [--redump]
 *
 * Environment variables — see docs/MYSQL-REPLICATION-LOCAL-TO-RAILWAY.html
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');

const LOCAL = {
  host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.LOCAL_DB_PORT || process.env.DB_PORT || '3306', 10),
  user: process.env.LOCAL_DB_USER || process.env.DB_USER || 'root',
  password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || 'hms_demo',
};

const RAILWAY = {
  host: process.env.RAILWAY_MYSQL_HOST || process.env.MYSQLHOST || '',
  port: parseInt(process.env.RAILWAY_MYSQL_PORT || process.env.MYSQLPORT || '3306', 10),
  user: process.env.RAILWAY_MYSQL_USER || process.env.MYSQLUSER || 'root',
  password: process.env.RAILWAY_MYSQL_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: process.env.RAILWAY_MYSQL_DATABASE || process.env.MYSQLDATABASE || 'railway',
};

const XAMPP_BIN = process.env.XAMPP_MYSQL_BIN || 'C:\\xampp\\mysql\\bin';
const DUMP_PATH =
  process.env.SYNC_DUMP_PATH ||
  path.join(__dirname, '..', 'tmp', `railway-sync-${LOCAL.database}.sql`);

function findBin(name) {
  const p = path.join(XAMPP_BIN, name);
  return fs.existsSync(p) ? p : name;
}

function ensureRailwayConfig() {
  if (!RAILWAY.host || !RAILWAY.password) {
    throw new Error('Set RAILWAY_MYSQL_HOST and RAILWAY_MYSQL_PASSWORD (from Railway MySQL plugin).');
  }
}

function dumpLocalDatabase() {
  console.log(`Dumping local database "${LOCAL.database}" from ${LOCAL.host}…`);
  fs.mkdirSync(path.dirname(DUMP_PATH), { recursive: true });

  const args = [
    `-h${LOCAL.host}`,
    `-P${LOCAL.port}`,
    `-u${LOCAL.user}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    '--add-drop-table',
    LOCAL.database,
  ];
  if (LOCAL.password) args.splice(4, 0, `-p${LOCAL.password}`);

  const dump = spawnSync(findBin('mysqldump.exe'), args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 512,
  });
  if (dump.status !== 0) {
    throw new Error((dump.stderr || dump.stdout || 'mysqldump failed').trim());
  }
  fs.writeFileSync(DUMP_PATH, dump.stdout, 'utf8');
  const sizeMb = (fs.statSync(DUMP_PATH).size / (1024 * 1024)).toFixed(2);
  console.log(`Dump saved: ${DUMP_PATH} (${sizeMb} MB)`);
}

async function clearRailwayDatabase(conn) {
  console.log(`Clearing Railway database "${RAILWAY.database}"…`);
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  const [tables] = await conn.query(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ?',
    [RAILWAY.database]
  );
  for (const row of tables) {
    const name = row.name || row.TABLE_NAME;
    if (!name) continue;
    await conn.query(`DROP TABLE IF EXISTS \`${name}\``);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log(`Dropped ${tables.length} table(s).`);
}

function sanitizeDumpForMysql8(sql) {
  return sql
    .replace(/DEFAULT curdate\(\)/gi, 'DEFAULT (CURDATE())')
    .replace(/DEFAULT current_date\(\)/gi, 'DEFAULT (CURRENT_DATE)')
    .replace(/DEFAULT utc_date\(\)/gi, 'DEFAULT (UTC_DATE)');
}

async function importSqlFile(conn, sqlPath) {
  console.log('Importing dump into Railway (this may take several minutes)…');
  let sql = fs.readFileSync(sqlPath, 'utf8');
  sql = sanitizeDumpForMysql8(sql);
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO"');
  await conn.query('SET NAMES utf8mb4');
  await conn.query(sql);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function verify(conn) {
  const [[{ ver }]] = await conn.query('SELECT VERSION() AS ver');
  const [[{ c }]] = await conn.query(
    'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = ?',
    [RAILWAY.database]
  );
  let patients = null;
  let employees = null;
  try {
    const [[p]] = await conn.query('SELECT COUNT(*) AS n FROM tbl_patient');
    patients = p.n;
  } catch (_) {}
  try {
    const [[e]] = await conn.query('SELECT COUNT(*) AS n FROM tbl_employee');
    employees = e.n;
  } catch (_) {}
  console.log('Railway MySQL version:', ver);
  console.log('Tables after import:', c);
  if (patients != null) console.log('Patients:', patients);
  if (employees != null) console.log('Employees:', employees);
  return { ver, tables: c, patients, employees };
}

async function main() {
  ensureRailwayConfig();
  const started = new Date().toISOString();
  console.log('=== ZAIZENS MySQL sync local → Railway ===');
  console.log('Started:', started);

  if (!fs.existsSync(DUMP_PATH) || process.argv.includes('--redump')) {
    dumpLocalDatabase();
  } else {
    console.log(`Using existing dump: ${DUMP_PATH} (pass --redump to refresh)`);
  }

  const conn = await mysql.createConnection({
    ...RAILWAY,
    multipleStatements: true,
    connectTimeout: 60000,
  });

  try {
    await clearRailwayDatabase(conn);
    await importSqlFile(conn, DUMP_PATH);
    const stats = await verify(conn);
    console.log('Done — local HMS database synced to Railway.');
    console.log('Finished:', new Date().toISOString());
    return stats;
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('SYNC FAILED:', err.message);
  process.exit(1);
});
