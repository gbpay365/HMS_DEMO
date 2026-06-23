#!/usr/bin/env node
'use strict';

/**
 * Keep HMS lib/data/ohada_english_6digit_coa.json in sync with Account_Core canonical file.
 *
 *   node scripts/sync-coa-from-account-core.js          # compare only
 *   node scripts/sync-coa-from-account-core.js --write  # copy Core → HMS mirror
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { CORE_COA, LOCAL_COA, resolveOhadaCoaPath } = require('../lib/resolveOhadaCoaPath');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main() {
  const write = process.argv.includes('--write');
  const corePath = fs.existsSync(CORE_COA) ? CORE_COA : null;
  const activePath = resolveOhadaCoaPath();

  if (!corePath) {
    console.error(`Account_Core COA not found at ${CORE_COA}`);
    process.exit(1);
  }

  const coreHash = sha256(corePath);
  const localExists = fs.existsSync(LOCAL_COA);
  const localHash = localExists ? sha256(LOCAL_COA) : null;
  const inSync = localHash === coreHash;

  console.log(JSON.stringify({
    core_path: corePath,
    hms_mirror: LOCAL_COA,
    active_path: activePath,
    core_accounts: JSON.parse(fs.readFileSync(corePath, 'utf8')).accounts?.length || 0,
    in_sync: inSync,
    core_sha256: coreHash.slice(0, 16),
    local_sha256: localHash ? localHash.slice(0, 16) : null,
  }, null, 2));

  if (write && !inSync) {
    fs.mkdirSync(path.dirname(LOCAL_COA), { recursive: true });
    fs.copyFileSync(corePath, LOCAL_COA);
    console.log('Copied Account_Core COA → HMS mirror.');
  } else if (!inSync) {
    console.log('Out of sync — run with --write to refresh HMS mirror, or HMS will read Core path directly.');
    process.exit(2);
  }
}

main();
