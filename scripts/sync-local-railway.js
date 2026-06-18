'use strict';

/**
 * Selective database synchronisation between local MySQL and Railway MySQL.
 *
 * Copies selected table groups (or explicit table list) from source → target.
 * Default direction: local → Railway. Use --direction railway-to-local to pull.
 *
 * Presets (combine with --preset):
 *   acl            Access & workflow tables
 *   catalog        Service catalog + lab/radiology/surgery definitions
 *   specialisation Doctor specialisation dropdown data
 *   roles          tbl_role only
 *   employees      Employee + department/specialisation links
 *   all-config     acl + catalog + specialisation + roles (no full patient data)
 *
 * Setup:
 *   copy docs/scripts/railway-sync.env.example → docs/scripts/railway-sync.env
 *
 * Examples:
 *   node docs/scripts/sync-local-railway.js --preset all-config
 *   node docs/scripts/sync-local-railway.js --preset catalog --preset specialisation
 *   node docs/scripts/sync-local-railway.js --tables tbl_service_catalog,tbl_role
 *   node docs/scripts/sync-local-railway.js --preset acl --direction railway-to-local
 *   node docs/scripts/sync-local-railway.js --preset specialisation --dry-run
 *
 * Run via PowerShell (loads .env):
 *   powershell -ExecutionPolicy Bypass -File docs/scripts/run-sync-local-railway.ps1 --Preset all-config
 */

const mysql = require('mysql2/promise');
const {
  loadSyncEnv,
  getLocalConfig,
  getRailwayConfig,
  parseCsvList,
  resolvePresetTables,
  SYNC_PRESETS,
  syncTables,
  printSummary,
} = require('./railway-sync-core');

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    direction: 'local-to-railway',
    presets: [],
    tables: [],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--preset' && argv[i + 1]) opts.presets.push(argv[++i]);
    else if (a.startsWith('--preset=')) opts.presets.push(a.slice(9));
    else if (a === '--tables' && argv[i + 1]) opts.tables.push(...parseCsvList(argv[++i]));
    else if (a.startsWith('--tables=')) opts.tables.push(...parseCsvList(a.slice(9)));
    else if (a === '--direction' && argv[i + 1]) opts.direction = argv[++i];
    else if (a.startsWith('--direction=')) opts.direction = a.slice(12);
  }
  if (process.env.SYNC_PRESETS) {
    opts.presets.push(...parseCsvList(process.env.SYNC_PRESETS));
  }
  if (process.env.SYNC_TABLES) {
    opts.tables.push(...parseCsvList(process.env.SYNC_TABLES));
  }
  if (process.env.SYNC_DIRECTION) {
    opts.direction = process.env.SYNC_DIRECTION;
  }
  return opts;
}

function printHelp() {
  const presetList = Object.keys(SYNC_PRESETS).concat(['all-config']).join(', ');
  console.log(`Usage: node docs/scripts/sync-local-railway.js [options]

Options:
  --preset NAME          Preset table group (${presetList}); repeat for multiple
  --tables t1,t2         Explicit table list (merged with presets)
  --direction DIR        local-to-railway (default) | railway-to-local
  --dry-run              Show planned sync without writing
  --help                 Show this help

Environment: docs/scripts/railway-sync.env
  SYNC_PRESETS, SYNC_TABLES, SYNC_DIRECTION optional overrides

Examples:
  node docs/scripts/sync-local-railway.js --preset all-config
  node docs/scripts/sync-local-railway.js --preset catalog --preset specialisation
`);
}

function resolveTables(opts) {
  const seen = new Set();
  const out = [];
  const add = (name) => {
    const t = String(name || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const p of opts.presets) {
    for (const t of resolvePresetTables(p)) add(t);
  }
  for (const t of opts.tables) add(t);

  if (!out.length) {
    throw new Error('No tables selected. Use --preset NAME and/or --tables t1,t2 (see --help).');
  }
  return out;
}

async function syncEmployeeSpecialisationFields(sourceConn, targetConn, direction) {
  if (direction !== 'local-to-railway') return { updated: 0, skipped: 0 };

  const [localRows] = await sourceConn.query(
    `SELECT id, specialisation, primary_department FROM tbl_employee WHERE status = 1`
  ).catch(() => [[]]);
  const [targetEmp] = await targetConn.query('SELECT id FROM tbl_employee').catch(() => [[]]);
  const targetIds = new Set((targetEmp || []).map((r) => Number(r.id)));

  let updated = 0;
  let skipped = 0;
  for (const row of localRows || []) {
    const id = Number(row.id);
    if (!targetIds.has(id)) {
      skipped++;
      continue;
    }
    await targetConn.query(
      `UPDATE tbl_employee SET specialisation = ?, primary_department = ? WHERE id = ? LIMIT 1`,
      [row.specialisation, row.primary_department, id]
    ).catch(() => {});
    updated++;
  }
  if (updated || skipped) {
    console.log(`Updated tbl_employee clinical fields on target: ${updated}, skipped ${skipped}`);
  }
  return { updated, skipped };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const direction = String(opts.direction || '').trim().toLowerCase();
  if (!['local-to-railway', 'railway-to-local'].includes(direction)) {
    throw new Error('Invalid --direction. Use local-to-railway or railway-to-local.');
  }

  const envInfo = loadSyncEnv();
  if (envInfo.usedHms) console.log('Local DB: using HMS .env credentials');
  const localCfg = getLocalConfig();
  const railwayCfg = getRailwayConfig();
  const tables = resolveTables(opts);

  const sourceCfg = direction === 'local-to-railway' ? localCfg : railwayCfg;
  const targetCfg = direction === 'local-to-railway' ? railwayCfg : localCfg;
  const sourceLabel = direction === 'local-to-railway' ? 'local' : 'Railway';
  const targetLabel = direction === 'local-to-railway' ? 'Railway' : 'local';

  console.log('=== Synchronise MySQL tables ===');
  console.log('Started:', new Date().toISOString());
  console.log(`Direction: ${direction} (${sourceLabel} → ${targetLabel})`);
  console.log(`Local DB:   ${localCfg.user}@${localCfg.host}:${localCfg.port}/${localCfg.database}`);
  console.log(`Railway DB: ${railwayCfg.user}@${railwayCfg.host}:${railwayCfg.port}/${railwayCfg.database}`);
  if (opts.presets.length) console.log('Presets:', opts.presets.join(', '));
  console.log('Tables:', tables.join(', '));
  if (opts.dryRun) console.log('Mode: DRY-RUN');
  console.log('');

  const sourceConn = await mysql.createConnection(sourceCfg);
  const targetConn = await mysql.createConnection(targetCfg);

  try {
    const results = await syncTables(sourceConn, targetConn, tables, {
      dryRun: opts.dryRun,
      label: opts.dryRun ? 'Would sync' : 'Syncing',
    });

    if (
      !opts.dryRun &&
      direction === 'local-to-railway' &&
      tables.some((t) => t.startsWith('tbl_doctor_specialisation') || t === 'tbl_employee_doctor_specialisation')
    ) {
      await syncEmployeeSpecialisationFields(sourceConn, targetConn, direction);
    }

    const ok = printSummary(results);
    if (!opts.dryRun && !ok) throw new Error('One or more tables did not match after sync');

    console.log('\nFinished:', new Date().toISOString());
  } finally {
    await sourceConn.end();
    await targetConn.end();
  }
}

main().catch((err) => {
  console.error('SYNC FAILED:', err.message);
  process.exit(1);
});
