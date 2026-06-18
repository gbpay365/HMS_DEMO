'use strict';

/**
 * Bidirectional MySQL synchronisation: local deployed server ↔ Railway.
 *
 * - Tables with updated_at / modified_at / created_at: newer row wins on each side.
 * - Tables without a timestamp column: one-way copy (default owner = local).
 *
 * Setup:
 *   copy docs/scripts/railway-sync.env.example → docs/scripts/railway-sync.env
 *
 * Usage:
 *   node docs/scripts/bidirectional-sync-local-railway.js
 *   node docs/scripts/bidirectional-sync-local-railway.js --dry-run
 *   node docs/scripts/bidirectional-sync-local-railway.js --exclude tbl_session
 *
 * Schedule every 10 minutes (run register-bidirectional-sync-task.bat as Administrator):
 *   scripts\register-bidirectional-sync-task.bat
 *   scripts\register-bidirectional-sync-task.bat 10
 */

const mysql = require('mysql2/promise');
const {
  loadSyncEnv,
  getLocalConfig,
  getRailwayConfig,
  listDatabaseTables,
  parseCsvList,
  filterTables,
  syncTablesBidirectional,
  printSummary,
} = require('./railway-sync-core');

const DEFAULT_EXCLUDE = [
  '_hms_sync_meta',
  'tbl_acl_migration',
];

function parseArgs(argv) {
  const opts = { dryRun: false, exclude: [...DEFAULT_EXCLUDE], include: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--exclude' && argv[i + 1]) opts.exclude.push(...parseCsvList(argv[++i]));
    else if (a.startsWith('--exclude=')) opts.exclude.push(...parseCsvList(a.slice(9)));
    else if (a === '--tables' && argv[i + 1]) opts.include.push(...parseCsvList(argv[++i]));
    else if (a.startsWith('--tables=')) opts.include.push(...parseCsvList(a.slice(9)));
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  opts.exclude = [...new Set([...opts.exclude, ...parseCsvList(process.env.BIDIRECTIONAL_EXCLUDE_TABLES)])];
  return opts;
}

function printHelp() {
  console.log(`Usage: node docs/scripts/bidirectional-sync-local-railway.js [options]

Options:
  --dry-run              Plan merge only; no writes
  --exclude t1,t2        Skip tables (also BIDIRECTIONAL_EXCLUDE_TABLES in .env)
  --tables t1,t2         Sync only these tables
  --help                 Show this help

Environment (docs/scripts/railway-sync.env):
  LOCAL_DB_*             Local deployed MySQL (hms_demo)
  RAILWAY_MYSQL_*        Railway public proxy host/port
  BIDIRECTIONAL_NO_TS_OWNER   local (default) | railway — tables without timestamps
  BIDIRECTIONAL_EXCLUDE_TABLES  Extra comma-separated excludes
`);
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const envInfo = loadSyncEnv();
  const localCfg = getLocalConfig();
  const railwayCfg = getRailwayConfig();

  console.log('=== Bidirectional sync: local MySQL ↔ Railway ===');
  console.log('Started:', new Date().toISOString());
  if (envInfo.syncEnvFile) console.log('Sync env:', envInfo.syncEnvFile);
  if (envInfo.hmsLoaded?.length) console.log('HMS env:', envInfo.hmsLoaded.join(', '));
  if (envInfo.usedHms) console.log('Local DB: using HMS .env credentials (LOCAL_DB_USE_HMS_ENV)');
  console.log(`Local:   ${localCfg.user}@${localCfg.host}:${localCfg.port}/${localCfg.database}`);
  console.log(`Railway: ${railwayCfg.user}@${railwayCfg.host}:${railwayCfg.port}/${railwayCfg.database}`);
  if (opts.dryRun) console.log('Mode: DRY-RUN');
  if (opts.exclude.length) console.log('Exclude:', opts.exclude.join(', '));
  console.log('');

  const localConn = await mysql.createConnection(localCfg);
  const railConn = await mysql.createConnection(railwayCfg);

  try {
    const localTables = await listDatabaseTables(localConn);
    const railTables = await listDatabaseTables(railConn);
    const union = [...new Set([...localTables, ...railTables])].sort();
    const tables = filterTables(union, { include: opts.include, exclude: opts.exclude });
    console.log(`Tables to sync: ${tables.length} (local=${localTables.length}, railway=${railTables.length})`);
    console.log('');

    const results = await syncTablesBidirectional(localConn, railConn, tables, {
      dryRun: opts.dryRun,
      noTsOwner: process.env.BIDIRECTIONAL_NO_TS_OWNER || 'local',
    });

    printSummary(results);
    const errors = results.filter((r) => r.skipped && r.reason && !r.reason.startsWith('missing'));
    if (errors.length) process.exitCode = 1;
  } finally {
    await localConn.end();
    await railConn.end();
  }

  console.log('\nFinished:', new Date().toISOString());
}

main().catch((err) => {
  console.error('Bidirectional sync failed:', err.message);
  process.exit(1);
});
