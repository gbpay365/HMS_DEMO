'use strict';
const mysql = require('mysql2/promise');
const { execSync } = require('child_process');

async function main() {
  const root = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    multipleStatements: true,
  });
  await root.query(
    'CREATE DATABASE IF NOT EXISTS hms_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  );
  const [[{ n }]] = await root.query(
    "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'hms_demo'"
  );
  await root.end();
  if (Number(n) > 0) {
    console.log(`hms_demo already has ${n} tables — skip clone`);
    return;
  }
  console.log('Cloning hms -> hms_demo (first-time setup)...');
  const dump = 'C:\\tools\\mysql\\current\\bin\\mysqldump.exe';
  const cli = 'C:\\tools\\mysql\\current\\bin\\mysql.exe';
  try {
    execSync(`"${dump}" -u root --single-transaction --routines --triggers hms | "${cli}" -u root hms_demo`, {
      stdio: 'inherit',
      shell: true,
    });
  } catch (e) {
    console.error('mysqldump failed, trying node-based copy of core tables only...');
    await cloneViaNode();
  }
  console.log('Clone done');
}

async function cloneViaNode() {
  const src = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'hms' });
  const dst = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'hms_demo', multipleStatements: true });
  await dst.query('SET FOREIGN_KEY_CHECKS=0');
  const [tables] = await src.query('SHOW TABLES');
  const key = Object.keys(tables[0] || {})[0] || 'Tables_in_hms';
  for (const row of tables) {
    const table = row[key];
    const [create] = await src.query(`SHOW CREATE TABLE \`${table}\``);
    await dst.query(`DROP TABLE IF EXISTS \`${table}\``);
    await dst.query(create[0]['Create Table']);
    const [rows] = await src.query(`SELECT * FROM \`${table}\``);
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => '?').join(',');
    const sql = `INSERT INTO \`${table}\` (\`${cols.join('`,`')}\`) VALUES (${placeholders})`;
    for (const r of rows) {
      await dst.query(sql, cols.map((c) => r[c]));
    }
    process.stdout.write('.');
  }
  await dst.query('SET FOREIGN_KEY_CHECKS=1');
  console.log('');
  await src.end();
  await dst.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
