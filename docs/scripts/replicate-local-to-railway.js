'use strict';

/**
 * Full database replication: local MySQL → Railway MySQL.
 *
 * Replaces every table on Railway with data from local (DELETE + INSERT per table).
 * Uses Node mysql2 only (no mysqldump import to Railway).
 *
 * Setup:
 *   copy docs/scripts/railway-sync.env.example → docs/scripts/railway-sync.env
 *   fill RAILWAY_MYSQL_PASSWORD and local DB settings
 *
 * Usage:
 *   node docs/scripts/replicate-local-to-railway.js
 *   node docs/scripts/replicate-local-to-railway.js --exclude tbl_patient,tbl_employee
 *   node docs/scripts/replicate-local-to-railway.js --dry-run
 *
 * Schedule (every 15 minutes) — PowerShell as Administrator:
 *   powershell -ExecutionPolicy Bypass -File docs/scripts/register-replicate-scheduled-task.ps1 -IntervalMinutes 15
 *
 * Or run manually anytime:
 *   powershell -ExecutionPolicy Bypass -File docs/scripts/run-replicate-local-to-railway.ps1
 */

const mysql = require('mysql2/promise');
const {
  loadSyncEnv,
  getLocalConfig,
  getRailwayConfig,
  listDatabaseTables,
  parseCsvList,
  filterTables,
  syncTables,
  printSummary,
} = require('./railway-sync-core');

function parseArgs(argv) {
  const opts = { dryRun: false, exclude: [], include: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--exclude' && argv[i + 1]) opts.exclude.push(...parseCsvList(argv[++i]));
    else if (a.startsWith('--exclude=')) opts.exclude.push(...parseCsvList(a.slice(9)));
    else if (a === '--tables' && argv[i + 1]) opts.include.push(...parseCsvList(argv[++i]));
    else if (a.startsWith('--tables=')) opts.include.push(...parseCsvList(a.slice(9)));
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  const envExclude = parseCsvList(process.env.REPLICATE_EXCLUDE_TABLES);
  opts.exclude = [...new Set([...opts.exclude, ...envExclude])];
  return opts;
}

function printHelp() {
  console.log(`Usage: node docs/scripts/replicate-local-to-railway.js [options]

Options:
  --dry-run              List tables and row counts only; no writes to Railway
  --exclude t1,t2        Skip tables (also REPLICATE_EXCLUDE_TABLES in .env)
  --tables t1,t2         Replicate only these tables (default: all local tables)
  --help                 Show this help

Environment: docs/scripts/railway-sync.env (see railway-sync.env.example)
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

  console.log('=== Replicate local MySQL → Railway ===');
  console.log('Started:', new Date().toISOString());
  if (envInfo.syncEnvFile) console.log('Sync env:', envInfo.syncEnvFile);
  if (envInfo.usedHms) console.log('Local DB: using HMS .env credentials');
  console.log(`Local:   ${localCfg.user}@${localCfg.host}:${localCfg.port}/${localCfg.database}`);
  console.log(`Railway: ${railwayCfg.user}@${railwayCfg.host}:${railwayCfg.port}/${railwayCfg.database}`);
  if (opts.dryRun) console.log('Mode: DRY-RUN (no Railway writes)');
  if (opts.exclude.length) console.log('Exclude:', opts.exclude.join(', '));
  if (opts.include.length) console.log('Include only:', opts.include.join(', '));
  console.log('');

  const localConn = await mysql.createConnection(localCfg);
  const railConn = await mysql.createConnection(railwayCfg);

  try {
    const allTables = await listDatabaseTables(localConn);
    const tables = filterTables(allTables, { include: opts.include, exclude: opts.exclude });
    console.log(`Tables to replicate: ${tables.length} / ${allTables.length}`);
    console.log('');

    const results = await syncTables(localConn, railConn, tables, {
      dryRun: opts.dryRun,
      label: opts.dryRun ? 'Would replicate' : 'Replicating',
    });

    const ok = printSummary(results);
    if (!opts.dryRun && !ok) throw new Error('One or more tables did not match after replication');

    console.log('\nFinished:', new Date().toISOString());
    if (opts.dryRun) console.log('Dry-run complete — no changes written to Railway.');
    else console.log('Replication complete — Railway now mirrors local (excluding any --exclude tables).');
  } finally {
    await localConn.end();
    await railConn.end();
  }
}

main().catch((err) => {
  console.error('REPLICATION FAILED:', err.message);
  process.exit(1);
});
