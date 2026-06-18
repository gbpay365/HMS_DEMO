'use strict';

/**
 * 1) Backup local `hms` database to C:\HMS_JS\database\Test Data\Test_DB.sql
 * 2) Create MySQL database `Test_DB` and import the backup
 * 3) Purge `hms`: keep facility ZAIZENS (id=1) and staff Super Admin, Admin, Filai
 *
 * Usage: node scripts/backup-and-purge-test-db.js
 * Add --purge-only to skip backup (if backup already exists)
 * Add --backup-only to skip purge
 */

require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const BACKUP_DIR = path.join('C:\\HMS_JS', 'database', 'Test Data');
const BACKUP_FILE = path.join(BACKUP_DIR, 'Test_DB.sql');
const TARGET_DB = 'Test_DB';
const SOURCE_DB = process.env.DB_NAME || 'hms';

const KEEP_FACILITY_IDS = [1];
const KEEP_EMPLOYEE_IDS = [1, 1228, 1237];

const MYSQL_BIN_DIRS = [
  'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin',
  'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin',
  'C:\\xampp\\mysql\\bin',
];

function findMysqlBin(exe) {
  for (const dir of MYSQL_BIN_DIRS) {
    const p = path.join(dir, exe);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function runBackupAsync() {
  const mysqldump = findMysqlBin('mysqldump.exe');
  const mysqlCli = findMysqlBin('mysql.exe');
  if (!mysqldump || !mysqlCli) {
    throw new Error('mysqldump/mysql not found.');
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const pass = process.env.DB_PASSWORD || '';

  const args = [
    `-h${host}`,
    `-u${user}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    SOURCE_DB,
  ];
  if (pass) args.splice(2, 0, `-p${pass}`);

  console.log(`Backing up database "${SOURCE_DB}"…`);
  const dump = spawnSync(mysqldump, args, {
    encoding: 'buffer',
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, MYSQL_PWD: pass || '' },
  });
  if (dump.status !== 0) {
    throw new Error((dump.stderr && dump.stderr.toString()) || 'mysqldump failed');
  }
  fs.writeFileSync(BACKUP_FILE, dump.stdout);
  const mb = (dump.stdout.length / 1024 / 1024).toFixed(2);
  console.log(`Wrote ${BACKUP_FILE} (${mb} MB)`);

  console.log(`Creating database "${TARGET_DB}" and importing backup…`);
  const pool = await mysql.createPool({
    host,
    user,
    password: pass,
    multipleStatements: true,
  });
  await pool.query(`CREATE DATABASE IF NOT EXISTS \`${TARGET_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.query(`DROP DATABASE IF EXISTS \`${TARGET_DB}\``);
  await pool.query(`CREATE DATABASE \`${TARGET_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  const importArgs = [`-h${host}`, `-u${user}`, TARGET_DB];
  if (pass) importArgs.splice(2, 0, `-p${pass}`);
  const imp = spawnSync(mysqlCli, importArgs, {
    input: dump.stdout,
    encoding: 'buffer',
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, MYSQL_PWD: pass || '' },
  });
  if (imp.status !== 0) {
    throw new Error((imp.stderr && imp.stderr.toString()) || 'mysql import failed');
  }
  console.log(`Database "${TARGET_DB}" is ready (full copy of ${SOURCE_DB} before purge).`);
  await pool.end();
}

async function purgeHms() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: SOURCE_DB,
    multipleStatements: true,
  });

  const conn = await pool.getConnection();
  try {
    const [facRows] = await conn.query('SELECT id, name FROM tbl_facility ORDER BY id');
    console.log('Facilities before purge:', facRows);

    const [empRows] = await conn.query(
      `SELECT id, first_name, last_name, username, role FROM tbl_employee
       WHERE id IN (?) OR role IN ('1','99') OR username IN ('admin','super','Filai')
       ORDER BY id`,
      [KEEP_EMPLOYEE_IDS]
    );
    console.log('Staff to keep:', empRows);

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    const [tables] = await conn.query(
      `SELECT table_name AS t FROM information_schema.tables
        WHERE table_schema = ? AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
      [SOURCE_DB]
    );

    let truncated = 0;
    for (const row of tables) {
      const t = row.t;
      if (t === 'tbl_facility') {
        const [r] = await conn.query(
          `DELETE FROM tbl_facility WHERE id NOT IN (${KEEP_FACILITY_IDS.map(() => '?').join(',')})`,
          KEEP_FACILITY_IDS
        );
        console.log(`tbl_facility: removed ${r.affectedRows} row(s), kept id(s) ${KEEP_FACILITY_IDS.join(', ')}`);
        continue;
      }
      if (t === 'tbl_employee') {
        const [r] = await conn.query(
          `DELETE FROM tbl_employee WHERE id NOT IN (${KEEP_EMPLOYEE_IDS.map(() => '?').join(',')})`,
          KEEP_EMPLOYEE_IDS
        );
        console.log(`tbl_employee: removed ${r.affectedRows} row(s), kept id(s) ${KEEP_EMPLOYEE_IDS.join(', ')}`);
        continue;
      }
      await conn.query(`TRUNCATE TABLE \`${t}\``);
      truncated += 1;
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    const [[fac]] = await conn.query('SELECT id, name, code FROM tbl_facility');
    const [emps] = await conn.query(
      'SELECT id, first_name, last_name, username, role FROM tbl_employee ORDER BY id'
    );
    const [[patCount]] = await conn.query('SELECT COUNT(*) AS c FROM tbl_patient').catch(() => [[{ c: 0 }]]);
    const [[txnCount]] = await conn.query('SELECT COUNT(*) AS c FROM tbl_transaction').catch(() => [[{ c: 0 }]]);

    console.log('\n--- After purge ---');
    console.log('Facility:', fac || '(none)');
    console.log('Staff:', emps);
    console.log('Patients:', patCount.c, '| Transactions:', txnCount.c);
    console.log(`Truncated ${truncated} tables; preserved tbl_facility + tbl_employee rows as requested.`);
  } finally {
    conn.release();
    await pool.end();
  }
}

(async () => {
  const args = process.argv.slice(2);
  const backupOnly = args.includes('--backup-only');
  const purgeOnly = args.includes('--purge-only');

  if (!purgeOnly) {
    await runBackupAsync();
  }
  if (!backupOnly) {
    console.log('\nPurging operational data from', SOURCE_DB, '…');
    await purgeHms();
  }
  console.log('\nDone.');
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
