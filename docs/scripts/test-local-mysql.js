'use strict';

const mysql = require('mysql2/promise');
const { loadSyncEnv, getLocalConfig } = require('./railway-sync-core');

async function main() {
  const info = loadSyncEnv();
  const cfg = getLocalConfig();

  console.log('=== Test local MySQL connection ===');
  if (info.syncEnvFile) console.log('Sync env:', info.syncEnvFile);
  if (info.hmsLoaded?.length) console.log('HMS env:', info.hmsLoaded.join(', '));
  console.log('Using HMS .env for local:', info.usedHms ? 'yes' : 'no');
  console.log(`Connecting: ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);

  const conn = await mysql.createConnection(cfg);
  const [[row]] = await conn.query('SELECT DATABASE() AS db, VERSION() AS version');
  console.log('[OK] Connected');
  console.log('  Database:', row.db);
  console.log('  Version: ', row.version);
  await conn.end();
}

main().catch((err) => {
  console.error('[FAIL]', err.message);
  console.error('');
  console.error('Fix: edit C:\\Program Files\\ZAIZENS\\HMS\\.env (same file HMS uses)');
  console.error('     or set LOCAL_DB_USER / LOCAL_DB_PASSWORD in docs\\scripts\\railway-sync.env');
  console.error('     and set LOCAL_DB_USE_HMS_ENV=0 to use railway-sync.env instead of .env');
  process.exit(1);
});
