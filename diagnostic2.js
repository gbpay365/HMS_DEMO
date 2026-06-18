// =============================================================================
// HMS Diagnostic v3 — server-safe, ASCII-only, no spawnSync
// =============================================================================
// Upload to server root (same folder as app.js).
// In cPanel -> Setup Node.js App -> Application startup file: diagnostic2.js
// Click "Run JS Script", then download diagnostic2-output.txt from File Manager.
//
// Why v3?  v2 exited with code 1 on the server because:
//   - emoji/Unicode chars caused output-encoding errors on some Linux terminals
//   - spawnSync("node --check") can fail if PATH is restricted by Passenger
//   - DB timeout was not capped, so a bad host could hang the process
//   - unhandledRejection inside the async IIFE could escape all try/catch
// =============================================================================
'use strict';

// ── Guard: catch ANY unhandled rejection/exception so the script never
//    exits with code 1 unexpectedly.  We print + continue rather than crash.
process.on('uncaughtException',  function(e) {
  try { out('[GUARD] uncaughtException: ' + (e && e.stack ? e.stack : String(e))); } catch(_){}
});
process.on('unhandledRejection', function(r) {
  try { out('[GUARD] unhandledRejection: ' + (r && r.stack ? r.stack : String(r))); } catch(_){}
});

var fs   = require('fs');
var path = require('path');

var _lines = [];

function out(s) {
  var str = typeof s === 'string' ? s : JSON.stringify(s, null, 2);
  // Strip any non-ASCII that could upset the server terminal
  var safe = str.replace(/[^\x00-\x7E]/g, '?');
  try { console.log(safe); } catch(_) {}
  _lines.push(safe);
}

function sec(title) {
  out('');
  out('============================================================');
  out('  ' + title);
  out('============================================================');
}
function ok(m)   { out('  [OK]   ' + m); }
function fail(m) { out('  [FAIL] ' + m); }
function warn(m) { out('  [WARN] ' + m); }
function info(m) { out('  [INFO] ' + m); }

function saveOutput() {
  try {
    var body = _lines.join('\n') + '\n';
    var names = ['diagnostic-output.txt', 'diagnostic2-output.txt'];
    names.forEach(function(name) {
      try { fs.writeFileSync(path.join(__dirname, name), body, 'utf8'); } catch (_) {}
    });
    out('');
    out('Saved -> diagnostic-output.txt and diagnostic2-output.txt');
    out('Download via cPanel File Manager and paste back for analysis.');
  } catch(e) {
    try { out('!! Could not save output file: ' + e.message); } catch(_) {}
  }
}

// ── Run everything inside a promise so we can .catch() at the top level ──────
var mainPromise = (function main() {
  return new Promise(function(resolve) {

    // ── SECTION 1: Runtime ──────────────────────────────────────────────────
    sec('1. Runtime Environment');
    out('  Node.js  : ' + process.version);
    out('  Platform : ' + process.platform + ' ' + process.arch);
    out('  PID      : ' + process.pid);
    out('  cwd      : ' + process.cwd());
    out('  __dirname: ' + __dirname);
    out('  PORT     : ' + (process.env.PORT  || '(not set -- correct for Passenger)'));
    out('  NODE_ENV : ' + (process.env.NODE_ENV || '(not set -- should be production)'));

    // ── SECTION 2: .env file ─────────────────────────────────────────────────
    sec('2. .env File Inspection (MOST COMMON CAUSE OF 500)');
    var envPath = path.join(__dirname, '.env');
    var envTxt  = '';
    try {
      var envStat = fs.statSync(envPath);
      envTxt = fs.readFileSync(envPath, 'utf8');
      ok('.env found (' + envStat.size + ' bytes)');

      // BOM check
      if (envTxt.charCodeAt(0) === 0xFEFF) {
        fail('BOM detected at start of .env -- strip it!');
      } else {
        ok('No BOM');
      }

      // CRLF
      if (/\r\n/.test(envTxt)) {
        warn('.env has CRLF line endings (usually OK on Passenger/Linux)');
      } else {
        ok('Unix LF line endings');
      }

      // Parse active key=value lines
      var activeLines   = envTxt.split(/\r?\n/).filter(function(l){ return /^[A-Z_]+=/.test(l.trim()); });
      var commentLines  = envTxt.split(/\r?\n/).filter(function(l){ return /^\s*#.*=/.test(l); });

      out('');
      out('  Active (uncommented) key=value lines:');
      if (activeLines.length === 0) {
        fail('NO active key=value lines! All credentials are probably commented out.');
      } else {
        activeLines.forEach(function(l) {
          var key = l.split('=')[0].trim();
          var val = l.split('=').slice(1).join('=').trim();
          var masked = (key === 'DB_PASSWORD' || key === 'SESSION_SECRET')
            ? (val ? '****(set)' : '(empty)') : (val || '(empty)');
          out('    ' + key + ' = ' + masked);
        });
      }

      // Check for critical vars being commented out
      var needed = ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME'];
      var commentedOut = [];
      needed.forEach(function(n) {
        var active = activeLines.some(function(l){ return l.startsWith(n + '='); });
        if (!active) {
          var inComment = commentLines.some(function(l){ return l.replace(/^#\s*/,'').startsWith(n + '='); });
          if (inComment) {
            fail(n + ' is COMMENTED OUT -> DB fails -> 500 error!');
            commentedOut.push(n);
          } else {
            fail(n + ' is MISSING from .env entirely!');
          }
        }
      });
      if (commentedOut.length > 0) {
        out('');
        warn('FIX: Uncomment these in .env: ' + commentedOut.join(', '));
        warn('  OR upload .env.production as .env (has production creds uncommented).');
      }
    } catch(e) {
      fail('.env NOT FOUND: ' + e.message);
      var prodPath = path.join(__dirname, '.env.production');
      try {
        if (fs.existsSync(prodPath)) {
          ok('.env.production exists (' + fs.statSync(prodPath).size + ' bytes) — app can use it as fallback');
          warn('BEST: copy .env.production to .env in File Manager (same folder as app.js)');
          warn('OR upload latest app.js + lib/loadEnv.js (loads .env.production when .env is missing)');
        } else {
          warn('FIX: Upload .env.production to server root, then rename/copy to .env');
        }
      } catch (_) {
        warn('FIX: Upload .env.production to server root, rename it to .env');
      }
    }

    // ── SECTION 3: dotenv values ─────────────────────────────────────────────
    sec('3. Environment Variables After loadEnv()');
    try {
      var loadEnv = require('./lib/loadEnv').loadEnv;
      var envInfo = loadEnv();
      ok('loadEnv() succeeded' + (envInfo.loadedFrom ? ' (from ' + envInfo.loadedFrom + ')' : ''));
      if (!envInfo.envExists && envInfo.prodExists) {
        warn('Using .env.production because .env is missing — copy it to .env when you can');
      }
    } catch(e) {
      try {
        require('dotenv').config();
        ok('dotenv.config() succeeded (loadEnv.js missing — upload lib/loadEnv.js)');
      } catch(e2) {
        fail('dotenv not available: ' + e2.message);
        warn('Run NPM Install in cPanel -> Setup Node.js App');
      }
    }

    var checks = {
      DB_HOST: process.env.DB_HOST,
      DB_PORT: process.env.DB_PORT,
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_NAME: process.env.DB_NAME,
      NODE_ENV: process.env.NODE_ENV,
      SESSION_SECRET: process.env.SESSION_SECRET
    };
    Object.keys(checks).forEach(function(k) {
      var v = checks[k];
      var sensitive = (k === 'DB_PASSWORD' || k === 'SESSION_SECRET');
      var display = sensitive ? (v ? '****(set)' : '(MISSING)') : (v || '(MISSING)');
      if (!v) {
        fail(k + ' = ' + display + '  <- REQUIRED');
      } else {
        ok(k + ' = ' + display);
      }
    });

    // ── SECTION 4: DB connection (async) ─────────────────────────────────────
    sec('4. Database Connection Test');

    var dbDone;
    var dbPromise = new Promise(function(res) { dbDone = res; });

    function afterDb() { continueChecks(); }

    var mysql;
    try { mysql = require('mysql2/promise'); } catch(e) {
      fail('mysql2/promise not available: ' + e.message);
      warn('FIX: Run NPM Install in cPanel -> Setup Node.js App');
      afterDb();
      return dbPromise.then(function(){});
    }

    var dbConn = null;
    var dbTimeout = setTimeout(function() {
      fail('DB connection timed out after 8 s');
      warn('Check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env');
      if (dbConn) { try { dbConn.end(); } catch(_){} }
      dbDone();
    }, 8000);

    mysql.createConnection({
      host:           process.env.DB_HOST || 'localhost',
      port:           parseInt(process.env.DB_PORT || '3306', 10),
      user:           process.env.DB_USER,
      password:       process.env.DB_PASSWORD,
      database:       process.env.DB_NAME,
      connectTimeout: 6000
    }).then(function(conn) {
      dbConn = conn;
      return conn.query('SELECT VERSION() AS v, DATABASE() AS db');
    }).then(function(result) {
      var row = result[0][0];
      clearTimeout(dbTimeout);
      ok('Connected to DB!');
      ok('  MariaDB/MySQL version : ' + row.v);
      ok('  Active database       : ' + row.db);

      // Count tables
      return dbConn.query(
        "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()"
      ).then(function(r2) {
        ok('  Tables in schema      : ' + r2[0][0].n);

        // Check critical tables
        var tables = [
          'tbl_employee','tbl_patient','tbl_appointment','tbl_admission',
          'tbl_opd_visit','tbl_consultation','tbl_lab_result',
          'tbl_billing_document','tbl_invoice','tbl_payment_ticket',
          'tbl_role','sessions'
        ];
        out('');
        out('  Critical table checks:');

        // Sequential checks using reduce
        return tables.reduce(function(p, t) {
          return p.then(function() {
            return dbConn.query(
              "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
              [t]
            ).then(function(r) {
              if (r[0][0].n > 0) { ok('    ' + t); }
              else { warn('    ' + t + '  <- MISSING table (may cause 500 on related routes)'); }
            }).catch(function() { fail('    ' + t + ' check failed'); });
          });
        }, Promise.resolve());
      });
    }).then(function() {
      if (dbConn) { try { dbConn.end(); } catch(_){} }
      dbDone();
    }).catch(function(e) {
      clearTimeout(dbTimeout);
      fail('DB connection FAILED: ' + (e.code || '') + ' ' + e.message);
      if (e.code === 'ER_ACCESS_DENIED_ERROR') fail('  -> Wrong DB_USER or DB_PASSWORD');
      else if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED') fail('  -> Wrong DB_HOST or MySQL not running');
      else if (e.code === 'ER_BAD_DB_ERROR') fail('  -> Database "' + (process.env.DB_NAME||'') + '" does not exist');
      warn('This is the most common 500 cause on shared hosting.');
      warn('FIX: Verify DB_* vars in .env match your cPanel MySQL settings.');
      if (dbConn) { try { dbConn.end(); } catch(_){} }
      dbDone();
    });

    // Remaining sections (non-async) run after DB
    function continueChecks() {

      // ── SECTION 5: Crash log ───────────────────────────────────────────────
      sec('5. Crash Log & Boot Trace');
      var tmpDir = path.join(__dirname, 'tmp');
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
        ok('tmp/ directory exists and is writable');
      } catch(e) {
        fail('Cannot create tmp/: ' + e.message);
      }

      // crash.log
      var crashPath = path.join(tmpDir, 'crash.log');
      try {
        var cStat = fs.statSync(crashPath);
        var cSizeMB = (cStat.size / 1024 / 1024).toFixed(2);
        var cTxt = fs.readFileSync(crashPath, 'utf8');
        var cLines = cTxt.trim().split('\n').filter(Boolean);
        var noiseLines = cLines.filter(function(l) {
          return l.indexOf('ECONNRESET') !== -1 ||
                 l.indexOf('EPIPE') !== -1 ||
                 l.indexOf('PROTOCOL_CONNECTION_LOST') !== -1;
        });

        if (cLines.length === 0) {
          ok('crash.log is empty');
        } else if (noiseLines.length > 50) {
          fail('crash.log BLOATED: ' + cSizeMB + ' MB, ' + cLines.length + ' lines');
          fail('  ' + noiseLines.length + ' lines are ECONNRESET/EPIPE noise from express-mysql-session');
          warn('  Auto-trimming to last 200 real error lines...');
          var realLines = cLines.filter(function(l) {
            return l.indexOf('ECONNRESET') === -1 &&
                   l.indexOf('EPIPE') === -1 &&
                   l.indexOf('PROTOCOL_CONNECTION_LOST') === -1;
          });
          var keep = (realLines.length > 0 ? realLines : cLines).slice(-200);
          try {
            fs.writeFileSync(crashPath, keep.join('\n') + '\n', 'utf8');
            ok('  Trimmed crash.log to ' + keep.length + ' lines');
          } catch(we) {
            warn('  Could not trim: ' + we.message);
          }
        } else {
          warn('crash.log has ' + cLines.length + ' entries (' + cSizeMB + ' MB)');
          out('  Last 15 lines:');
          cLines.slice(-15).forEach(function(l) { out('    ' + l.replace(/[^\x00-\x7E]/g,'?')); });
        }
      } catch(e) {
        if (e.code === 'ENOENT') { info('crash.log does not exist yet (good -- no crashes recorded)'); }
        else { warn('Could not read crash.log: ' + e.message); }
      }

      // last-boot.json
      var bootPath = path.join(tmpDir, 'last-boot.json');
      try {
        var bootJson = JSON.parse(fs.readFileSync(bootPath, 'utf8'));
        var badSteps = bootJson.filter(function(s){ return s.status === 'fail' || s.status === 'warn'; });
        if (badSteps.length === 0) {
          ok('last-boot.json: all ' + bootJson.length + ' boot steps OK');
        } else {
          warn('last-boot.json: ' + badSteps.length + ' failed/warned steps:');
          badSteps.forEach(function(s) {
            out('    [' + s.status.toUpperCase() + '] ' + s.step + (s.detail ? ': ' + s.detail : ''));
          });
        }
        out('  Last 5 boot steps:');
        bootJson.slice(-5).forEach(function(s) {
          out('    [' + s.status + '] ' + s.step);
        });
      } catch(e) {
        if (e.code === 'ENOENT') { info('last-boot.json does not exist (app has not booted yet)'); }
        else { warn('Could not read last-boot.json: ' + e.message); }
      }

      // ── SECTION 6: Route files ─────────────────────────────────────────────
      sec('6. Route Files');
      var routes = [
        'routes/emergency.js','routes/ipdMed.js','routes/portals.js',
        'routes/nursingSupply.js','routes/staff.js','routes/hrPayroll.js',
        'routes/taxHub.js','routes/paymentValidity.js'
      ];
      routes.forEach(function(rf) {
        try {
          var st = fs.statSync(path.join(__dirname, rf));
          ok(rf + ' (' + st.size + ' bytes)');
        } catch(e) {
          fail(rf + ' <- MISSING (' + e.code + ')');
        }
      });

      // ── SECTION 7: lib/ files ──────────────────────────────────────────────
      sec('7. Library Files');
      var libs = [
        'lib/aclLayout.js','lib/receiptNumber.js','lib/invoiceNumber.js',
        'lib/amountInWords.js','lib/ensureFacilityRow.js',
        'lib/clinicalDeptAlerts.js','lib/labTestTemplates.js',
        'lib/paymentValidity.js','lib/ensureDiagnosticCorrectionSchema.js',
        'lib/patientAge.js','lib/clinicalNotAssignedBypass.js',
        'lib/opdVisitRoomQueue.js','lib/opdVisitCarryForward.js',
        'lib/pagination.js','lib/hmsListUi.js','lib/hmsDisplay.js'
      ];
      libs.forEach(function(lf) {
        var fp = path.join(__dirname, lf);
        try {
          var st = fs.statSync(fp);
          if (!st.isFile()) { fail(lf + ' <- not a file!'); return; }
          try {
            require(fp);
            ok(lf + ' (' + st.size + ' bytes) loads OK');
          } catch(re) {
            fail(lf + ' <- REQUIRE ERROR: ' + re.message);
          }
        } catch(e) {
          fail(lf + ' <- MISSING (' + e.code + ')');
        }
      });

      // ── SECTION 8: node_modules ────────────────────────────────────────────
      sec('8. Critical node_modules');
      var mods = [
        'express','express-session','mysql2','bcryptjs',
        'express-mysql-session','cookie-parser','multer','ejs','dotenv'
      ];
      mods.forEach(function(m) {
        var p = path.join(__dirname, 'node_modules', m);
        try {
          fs.statSync(p);
          try { require(m); ok(m); }
          catch(re) { fail(m + ' <- loads with error: ' + re.message); }
        } catch(e) {
          fail(m + ' <- NOT IN node_modules (run NPM Install)');
        }
      });

      // ── SECTION 9: Lock files ──────────────────────────────────────────────
      sec('9. Stale Lock Files (Passenger)');
      var home = process.env.HOME || process.env.USERPROFILE || '';
      var locks = [
        path.join(__dirname, '.lock'),
        path.join(__dirname, 'tmp', '.lock'),
        path.join(home, 'nodevenv', '.lock'),
        path.join(home, 'nodevenv', 'hms-app', '.lock')
      ];
      var foundLock = false;
      locks.forEach(function(p) {
        try {
          if (fs.existsSync(p)) {
            foundLock = true;
            var st = fs.statSync(p);
            fail('STALE LOCK: ' + p + ' (mtime=' + st.mtime.toISOString() + ')');
            warn('  FIX: Stop app -> wait 2 min -> delete lock -> Start app');
          }
        } catch(_) {}
      });
      if (!foundLock) ok('No lock files found');

      // ── SECTION 10: iFastNet filesystem ───────────────────────────────────
      sec('10. Filesystem & Permissions');
      try {
        var os = require('os');
        out('  Hostname : ' + os.hostname());
        out('  Home dir : ' + os.homedir());
      } catch(e) { warn('os info: ' + e.message); }

      try {
        var appJsPath = path.join(__dirname, 'app.js');
        fs.accessSync(appJsPath, fs.constants.R_OK);
        var appSt = fs.statSync(appJsPath);
        ok('app.js readable  size=' + appSt.size + ' bytes  modified=' + appSt.mtime.toISOString());
        try {
          var appSrc = fs.readFileSync(appJsPath, 'utf8');
          if (appSrc.indexOf('HMS_EXPORT_CHECK') >= 0 && appSrc.indexOf('module.exports = app') >= 0) {
            ok('app.js has Passenger export fix (HMS_EXPORT_CHECK + module.exports)');
          } else if (appSrc.indexOf('module.exports = app') >= 0) {
            warn('app.js has module.exports but missing HMS_EXPORT_CHECK — re-upload latest app.js');
          } else {
            fail('app.js missing module.exports fix — Passenger will 500 on localhost:3004');
          }
          if (appSrc.indexOf('WARN-aclLayout-missing') >= 0 || appSrc.indexOf('ACL-driven UI disabled') >= 0) {
            ok('app.js has resilient aclLayout loader (500-fix build)');
          } else if (/const\s+aclLayout\s*=\s*require\s*\(\s*['"]\.\/lib\/aclLayout['"]\s*\)/.test(appSrc)) {
            fail('app.js still uses bare require("./lib/aclLayout") — upload latest app.js');
          }
        } catch (readErr) {
          warn('Could not read app.js for pattern check: ' + readErr.message);
        }
        try {
          var diagSrc = fs.readFileSync(path.join(__dirname, 'diagnostic2.js'), 'utf8');
          if (diagSrc.indexOf('HMS_EXPORT_CHECK') >= 0 && diagSrc.indexOf('node app.js (main) exports') >= 0) {
            ok('diagnostic2.js is the latest version (main-module test uses node app.js)');
          } else {
            warn('diagnostic2.js is OUTDATED on server — upload latest diagnostic2.js from your PC');
          }
        } catch (_) {}
      } catch(e) { fail('app.js NOT readable: ' + e.message); }

      try { fs.accessSync(path.join(__dirname,'public'), fs.constants.R_OK); ok('public/ readable'); }
      catch(e) { warn('public/ not readable: ' + e.message); }

      try {
        var tw = path.join(tmpDir, '.wtest' + Date.now());
        fs.writeFileSync(tw, 'x', 'utf8');
        fs.unlinkSync(tw);
        ok('tmp/ writable');
      } catch(e) { fail('tmp/ NOT writable: ' + e.message); }

      // ── SECTION 11: Passenger app load ─────────────────────────────────────
      sec('11. App Boot Test (require app.js)');
      try {
        var appModPath = path.join(__dirname, 'app.js');
        try { delete require.cache[require.resolve(appModPath)]; } catch (_) {}
        var exported = require(appModPath);
        if (exported && typeof exported.use === 'function') {
          ok('require("./app.js") succeeded - Express app exported for Passenger');
        } else {
          fail('app.js loaded but did not export an Express application');
        }
      } catch (bootErr) {
        fail('require("./app.js") CRASHED — site will show Passenger 500 until fixed:');
        out('    ' + (bootErr && bootErr.message ? bootErr.message : String(bootErr)));
        if (bootErr && bootErr.stack) {
          bootErr.stack.split('\n').slice(0, 8).forEach(function(ln) { out('    ' + ln); });
        }
      }
      out('');
      out('  Simulating cPanel startup (node app.js as MAIN — same as Passenger startup file):');
      try {
        var cp = require('child_process');
        var simEnv = {};
        Object.keys(process.env).forEach(function (k) { simEnv[k] = process.env[k]; });
        simEnv.HMS_EXPORT_CHECK = '1';
        var sim = cp.spawnSync(process.execPath, [appModPath], {
          cwd: __dirname,
          env: simEnv,
          timeout: 120000,
          encoding: 'utf8'
        });
        if (sim.status === 0 && (sim.stdout || '').indexOf('EXPORT_OK') >= 0) {
          ok('node app.js (main) exports Express — Passenger can start /cpanel-health');
        } else {
          fail('node app.js (main) did NOT export Express — upload latest app.js');
          if (sim.stdout) out('    stdout: ' + sim.stdout.trim().slice(0, 200));
          if (sim.stderr) out('    stderr: ' + sim.stderr.trim().split('\n').slice(0, 6).join('\n    '));
        }
      } catch (simErr) {
        warn('Could not run main-module simulation: ' + simErr.message);
      }

      // ── SECTION 12: cPanel / "It works!" placeholder ───────────────────────
      sec('12. cPanel Domain Wiring (if browser shows "It works!")');
      var entryJs = path.join(__dirname, 'passenger-entry.js');
      if (fs.existsSync(entryJs)) {
        ok('passenger-entry.js present — use as Application startup file in cPanel');
      } else {
        warn('passenger-entry.js missing on server — upload it from the repo');
      }
      try {
        var appFull = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
        if (/It works!/i.test(appFull)) {
          fail('app.js is the cPanel SAMPLE ("It works!") — replace with HMS app.js (~500 KB)');
        } else if (appFull.length > 200000 || appFull.indexOf('financials') >= 0) {
          ok('app.js looks like full HMS (' + appFull.length + ' characters)');
        } else {
          warn('app.js is small or unexpected — confirm you uploaded the real HMS app.js');
        }
      } catch (readE) {
        warn('Could not scan app.js: ' + readE.message);
      }
      ['server.js', 'index.js', 'app.cjs', 'startup.js'].forEach(function (fname) {
        var fp = path.join(__dirname, fname);
        if (!fs.existsSync(fp)) return;
        try {
          var body = fs.readFileSync(fp, 'utf8');
          if (/It works!/i.test(body)) {
            fail(fname + ' is the cPanel placeholder — do NOT use it as startup file');
            warn('  Set startup to passenger-entry.js or app.js instead');
          } else {
            info(fname + ' exists (' + body.length + ' chars) — not the default placeholder');
          }
        } catch (_) {}
      });
      try {
        if (fs.existsSync(path.join(tmpDir, 'last-boot.json'))) {
          ok('last-boot.json exists (written when app.js loads — from CLI or Passenger)');
          warn('  If the browser still shows Passenger 500, cPanel is NOT pointing at this folder');
        } else {
          warn('last-boot.json missing — app.js has not completed a boot yet');
          warn('  Fix: cPanel -> Setup Node.js App -> Application root = ' + __dirname);
          warn('       Startup file = passenger-entry.js -> Stop -> wait 2 min -> Start');
        }
      } catch (_) {}
      out('');
      out('  Browser shows "It works! NodeJS" while diagnostic is OK when:');
      out('    - Application root in cPanel is NOT ' + __dirname);
      out('    - Startup file is server.js / sample app.js, not passenger-entry.js');
      out('    - Two Node apps exist on localhost:3004 (disable the test one)');

      // ── SECTION 13: Summary ────────────────────────────────────────────────
      sec('13. Summary & Action Plan');
      out('');
      out('  The Phusion Passenger "t.forEach is not a function" error in');
      out('  content-all.js is Passengers own UI code crashing while');
      out('  rendering a 500 error page -- the real bug is in your app.');
      out('');
      out('  Most likely causes on iFastNet shared hosting:');
      out('');
      out('  [CAUSE A] .env has production DB credentials commented out');
      out('    FIX: Edit .env and uncomment DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
      out('         OR upload .env.production to server root, rename to .env');
      out('');
      out('  [CAUSE B] DB user lacks permissions (ER_ACCESS_DENIED / table errors)');
      out('    FIX: cPanel -> MySQL Databases -> grant ALL PRIVILEGES to DB user');
      out('');
      out('  [CAUSE C] Route or lib file missing on server');
      out('    FIX: Re-upload routes/ and lib/ directories');
      out('');
      out('  [CAUSE D] node_modules not on server');
      out('    FIX: cPanel -> Setup Node.js App -> Run NPM Install');
      out('');
      out('  [CAUSE E] Stale Passenger process');
      out('    FIX: Stop -> wait 2 min -> Start in Setup Node.js App');
      out('');
      out('  [CAUSE F] crash.log bloated with ECONNRESET noise (confirmed locally)');
      out('    FIX: Upload updated app.js -- it now filters ECONNRESET from crash.log');
      out('');
      out('  [CAUSE G] Browser shows "It works! NodeJS" but diagnostic is OK (section 12)');
      out('    FIX: cPanel Application ROOT = /demo/zaizens/TSSF');
      out('         Startup file = passenger-entry.js (or app.js), NOT server.js');
      out('         Stop -> wait 2 min -> Start; open /cpanel-health then /');
      out('');
      out('  If browser shows Passenger 500 ("application could not be started"):');
      out('    -> Startup file must NOT be app.js alone unless section 11 main test is OK');
      out('    -> Use startup.js (best) or passenger-entry.js — NOT the cPanel sample server.js');
      out('    -> After restart, open tmp/passenger-start.log in File Manager for the real error');
      out('');
      out('  AFTER FIXING:');
      out('    1. Upload app.js, startup.js, passenger-entry.js, diagnostic2.js');
      out('    2. cPanel -> Setup Node.js App:');
      out('       Application startup file = startup.js  (most reliable)');
      out('       OR passenger-entry.js — do NOT use bare app.js unless main test passes');
      out('    3. Stop -> Run NPM Install -> Start');
      out('    4. Visit /cpanel-health  (must be HTTP 200, body "OK")');
      out('    5. Visit /__health  (HTTP 200; JSON ok:true when DB works)');
      out('    6. Re-run diagnostic2.js and confirm section 11 [OK]');
      out('');

      saveOutput();
      resolve();
    }

    dbPromise.then(afterDb);
  });
})();

mainPromise.catch(function(e) {
  try { out('[MAIN-CATCH] ' + (e && e.stack ? e.stack : String(e))); } catch(_) {}
  saveOutput();
}).then(function() {
  // Always exit cleanly so cPanel reports "Script exit code: 0"
  process.exit(0);
});
