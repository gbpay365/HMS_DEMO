#!/usr/bin/env node
'use strict';
/**
 * cPanel / iFastNet: express-mysql-session sometimes leaves a nested
 * node_modules/express-mysql-session/node_modules/mysql2 that is incomplete
 * (missing pool_cluster.js etc.). Requiring it crashes the app.
 * Top-level mysql2 is fine — remove the nested copy after every npm install.
 */
const fs = require('fs');
const path = require('path');
const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'express-mysql-session',
  'node_modules',
  'mysql2'
);
try {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log('[postinstall] Removed nested mysql2:', target);
  }
} catch (e) {
  console.warn('[postinstall] Could not remove nested mysql2 (non-fatal):', e.message);
}
