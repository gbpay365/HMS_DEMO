'use strict';
// =============================================================================
// patch.js — ONE-SHOT FIX for broken nested mysql2 on iFastNet
// =============================================================================
// INSTRUCTIONS:
//   1. Upload this file to /demo/zaizens/hms-app/patch.js
//   2. In cPanel -> Setup Node.js App -> Edit -> set startup file to: patch.js
//   3. Click Save, then click Start
//   4. Wait 10 seconds, then click Stop
//   5. Change startup file back to: app.js
//   6. Click Save, then click Start
//   7. Visit https://localhost:3004/ — it should work!
// =============================================================================

var fs   = require('fs');
var path = require('path');

var results = [];
function log(msg) {
  var s = '[' + new Date().toISOString() + '] ' + msg;
  results.push(s);
  try { console.log(s); } catch(_) {}
}

log('=== HMS patch.js starting ===');
log('cwd: ' + process.cwd());
log('__dirname: ' + __dirname);
log('Node.js: ' + process.version);

// ── FIX 1: Delete broken nested mysql2 ───────────────────────────────────────
var brokenMysql2 = path.join(
  __dirname,
  'node_modules',
  'express-mysql-session',
  'node_modules',
  'mysql2'
);
log('Checking for broken nested mysql2 at: ' + brokenMysql2);

if (fs.existsSync(brokenMysql2)) {
  log('FOUND broken nested mysql2. Deleting...');
  try {
    // Node 14.14+ supports fs.rmSync with recursive
    if (typeof fs.rmSync === 'function') {
      fs.rmSync(brokenMysql2, { recursive: true, force: true });
    } else {
      // Fallback for older Node — manual recursive delete
      deleteFolderRecursive(brokenMysql2);
    }
    // Verify it's gone
    if (!fs.existsSync(brokenMysql2)) {
      log('SUCCESS: Deleted broken nested mysql2 folder.');
    } else {
      log('ERROR: Folder still exists after delete attempt!');
    }
  } catch (e) {
    log('ERROR deleting nested mysql2: ' + e.message);
  }
} else {
  log('INFO: Nested mysql2 NOT found at that path (already deleted or never existed).');

  // Check if it's in a slightly different location
  var altPath = path.join(
    __dirname,
    'node_modules',
    'express-mysql-session',
    'node_modules'
  );
  if (fs.existsSync(altPath)) {
    log('express-mysql-session/node_modules/ EXISTS. Contents:');
    try {
      var items = fs.readdirSync(altPath);
      items.forEach(function(item) { log('  - ' + item); });
    } catch(e) { log('  (could not list: ' + e.message + ')'); }
  } else {
    log('express-mysql-session/node_modules/ does NOT exist (good — no nested deps).');
  }
}

// ── FIX 2: Delete stale Passenger lock file ───────────────────────────────────
var home = process.env.HOME || process.env.USERPROFILE || '';
var appName = path.basename(__dirname);
var lockPaths = [
  path.join(home, 'nodevenv', appName, '.lock'),
  path.join(__dirname, '.lock'),
  path.join(__dirname, 'tmp', '.lock'),
];
lockPaths.forEach(function(lp) {
  try {
    if (fs.existsSync(lp)) {
      fs.unlinkSync(lp);
      log('SUCCESS: Deleted stale lock file: ' + lp);
    } else {
      log('INFO: No lock file at: ' + lp);
    }
  } catch(e) {
    log('WARN: Could not delete lock ' + lp + ': ' + e.message);
  }
});

// ── FIX 3: Verify top-level mysql2 is intact ─────────────────────────────────
try {
  var mysql2 = require('mysql2/promise');
  log('SUCCESS: Top-level mysql2 loads OK (will be used by express-mysql-session).');
} catch(e) {
  log('ERROR: Top-level mysql2 failed to load: ' + e.message);
  log('  -> Run NPM Install in cPanel Setup Node.js App to fix.');
}

// ── FIX 4: Verify express-mysql-session loads after the fix ──────────────────
try {
  var session = require('express-session');
  var MySQLStore = require('express-mysql-session')(session);
  log('SUCCESS: express-mysql-session loads OK after fix! Sessions will use MySQL.');
} catch(e) {
  log('ERROR: express-mysql-session still fails after fix: ' + e.message);
  log('  -> You may need to run NPM Install, or manually delete:');
  log('     node_modules/express-mysql-session/node_modules/');
}

// ── Save results ──────────────────────────────────────────────────────────────
log('');
log('=== Patch complete. Next steps: ===');
log('  1. Click STOP in cPanel Setup Node.js App');
log('  2. Change startup file from patch.js back to: app.js');
log('  3. Click SAVE, then click START');
log('  4. Visit https://localhost:3004/ to confirm it works');
log('');

try {
  var outPath = path.join(__dirname, 'patch-output.txt');
  fs.writeFileSync(outPath, results.join('\n') + '\n', 'utf8');
  log('Results saved to: patch-output.txt (download from File Manager)');
} catch(e) {
  try { console.log('Could not save output: ' + e.message); } catch(_) {}
}

// Always exit 0 so cPanel doesn't show an error
setTimeout(function() { process.exit(0); }, 1000);

// ── Helper: recursive delete for older Node ───────────────────────────────────
function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach(function(file) {
      var curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}
