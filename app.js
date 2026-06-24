const path = require('path');
const fs = require('fs');
const { loadEnv } = require('./lib/loadEnv');
const _envLoad = loadEnv();
if (_envLoad.onRailway) {
 try {
  console.log('[HMS] Railway runtime — DB config from service variables (not .env.production).');
 } catch (_) {}
} else if (_envLoad.loadedFrom === '.env.production') {
 try {
  console.warn('[HMS] No .env found — loaded .env.production. Upload .env (copy from .env.production) for production.');
 } catch (_) {}
}

// ── Crash recorder (must run BEFORE other requires so a missing module
//     doesn't take the process down without leaving a trace) ───────────────
// Writes any uncaught error into ./tmp/crash.log and the latest boot status
// into ./tmp/last-boot.json so they can be inspected from the cPanel File
// Manager even when the Node app never reaches its first route.
const _crashDir = path.join(__dirname, 'tmp');
try { fs.mkdirSync(_crashDir, { recursive: true }); } catch (_) {}
function _writeCrash(kind, err) {
  try {
    const line = `[${new Date().toISOString()}] ${kind}: ${err && err.stack ? err.stack : (err && err.message ? err.message : String(err))}\n`;
    fs.appendFileSync(path.join(_crashDir, 'crash.log'), line);
  } catch (_) { /* ignore */ }
}
process.on('uncaughtException', (e) => {
  // EPIPE happens when Passenger/stdout closes before we finish writing — safe to ignore.
  if (e && e.code === 'EPIPE') return;
  try { console.error('!!! uncaughtException:', e && e.stack ? e.stack : e); } catch (_) {}
  _writeCrash('uncaughtException', e);
});
process.on('unhandledRejection', (r) => {
  // express-mysql-session fires ECONNRESET / PROTOCOL_CONNECTION_LOST when the
  // shared host drops idle MySQL connections. These are transient and harmless —
  // the pool will reconnect on the next request. Log at warn level, don't crash.
  const code = (r && r.code) || '';
  const ignorableCodes = ['ECONNRESET', 'EPIPE', 'PROTOCOL_CONNECTION_LOST', 'ER_CLIENT_INTERACTION_TIMEOUT'];
  if (ignorableCodes.includes(code)) {
    try { console.warn('[warn] unhandledRejection (ignorable on shared host):', code, r && r.message ? r.message : ''); } catch (_) {}
    return; // do NOT write to crash.log — this bloats it with thousands of entries
  }
  try { console.error('!!! unhandledRejection:', r && r.stack ? r.stack : r); } catch (_) {}
  _writeCrash('unhandledRejection', r);
});



const express = require('express');
const { flashT } = require('./lib/flashI18n');
const { pageTitle } = require('./lib/pageTitle');
const hmsI18n = require('./lib/hmsI18n');
const session = require('express-session');
const { createDbPool, resolveDbConfig: resolveDbEnv } = require('./lib/dbPool');
const DB_BOOT_CONFIG = resolveDbEnv();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
/** Optional — app still boots if npm install was not run after multer was added. */
const multer = (() => {
 try {
  return require('multer');
 } catch (e) {
  _writeCrash('WARN-multer-missing', e);
  console.warn('[HMS] multer not installed — external lab/radiology uploads disabled. Run npm install on the server.');
  return null;
 }
})();

// ── express-mysql-session guard ─────────────────────────────────────────────
// On iFastNet shared hosting the server node_modules may contain a broken
// nested mysql2 inside express-mysql-session/node_modules/mysql2/ with files
// missing (e.g. pool_cluster.js). Requiring express-mysql-session in that
// state throws ENOENT and crashes the process BEFORE Express even starts.
//
// Self-heal step 1: delete the broken nested mysql2 BEFORE requiring it.
// When it is gone, Node.js will resolve mysql2 from the top-level
// node_modules/mysql2 (confirmed working by diagnostic).
try {
  const _brokenMysql2 = path.join(
    __dirname, 'node_modules', 'express-mysql-session', 'node_modules', 'mysql2'
  );
  if (fs.existsSync(_brokenMysql2)) {
    if (typeof fs.rmSync === 'function') {
      fs.rmSync(_brokenMysql2, { recursive: true, force: true });
    } else {
      // fallback for Node < 14.14
      (function _rmrf(p) {
        if (!fs.existsSync(p)) return;
        fs.readdirSync(p).forEach(f => {
          const c = path.join(p, f);
          fs.lstatSync(c).isDirectory() ? _rmrf(c) : fs.unlinkSync(c);
        });
        fs.rmdirSync(p);
      })(_brokenMysql2);
    }
    _writeCrash('INFO', 'Self-healed: deleted broken nested mysql2 at startup.');
  }
} catch (_rmErr) {
  _writeCrash('WARN-self-heal', _rmErr);
}

// Self-heal step 2: load session store backends
const MySQLStore = (() => {
 if (DB_BOOT_CONFIG.driver === 'postgres') return null;
 try {
  return require('express-mysql-session')(session);
 } catch (e) {
  _writeCrash('WARN-MySQLStore-load', e);
  console.warn('[WARN] express-mysql-session failed to load:', e.message);
  console.warn('[WARN] Falling back to MemoryStore. Run npm install on server to fix.');
  return null;
 }
})();
const PgSessionStore = (() => {
 if (DB_BOOT_CONFIG.driver !== 'postgres') return null;
 try {
  return require('connect-pg-simple')(session);
 } catch (e) {
  _writeCrash('WARN-PgSessionStore-load', e);
  console.warn('[WARN] connect-pg-simple not installed — sessions will use MemoryStore.');
  return null;
 }
})();
/** ACL layout (sidebar / tiles). If lib/ is incomplete on the server, use a stub so the app still boots. */
const aclLayout = (() => {
 try {
  return require('./lib/aclLayout');
 } catch (e) {
  _writeCrash('WARN-aclLayout-missing', e);
  console.error('[HMS] ./lib/aclLayout could not be loaded — ACL-driven UI disabled until the file is deployed.', e.message);
  const emptyPortal = () => ({
   sidebar: [], tiles: [], cards: [], buttons: [], sections: [], actionMenus: []
  });
  const PORTAL_PATH = {
   front_desk: '/portal/front-desk',
   doctors: '/portal/doctor',
   nursing: '/portal/nurse',
   laboratory: '/portal/lab',
   cashier: '/portal/cashier',
   pharmacy: '/portal/pharmacy',
   radiology: '/portal/radiology',
   accountant: '/portal/accountant',
   patient_support: '/portal/login'
  };
  return {
   init: async () => {},
   refresh: async () => {},
   forPortal: () => emptyPortal(),
   forSidebar: () => [],
   buildTopNav: () => ({ primaryLinks: [], menus: [] }),
   buildAccountingModuleNav: () => ({ primaryLinks: [], menus: [], shellBrand: null }),
   buildSidebarNav: () => [],
   catalogueForStudio: () => ({ shell: '', sections: [], menus: [], flat: [] }),
   studioPackForRole: () => ({ shell: '', sections: [], menus: [], flat: [] }),
   allCodesForShell: () => [],
   getProductSlices: () => ['full'],
   getModuleOverrides: () => ({}),
   getDeploymentSummary: () => ({ slices: ['full'], profileName: 'full' }),
   visible: () => false,
   uiElementVisible: () => false,
   urlAliasedCodes: (code) => [String(code)],
   isRoleHidden: () => false,
   actionMenuVisible: () => false,
   portalsForRole: () => [],
   buildStaffPortalMenu: () => [],
   homePortal: () => null,
   portalUrl: (portalCode) => PORTAL_PATH[String(portalCode || '').trim()] || '/portal/front-desk',
   staffHomeUrl: (role) => {
    const r = String(role != null ? role : '');
    if (r === '99') return '/super-admin';
    if (r === '1') return '/hms';
    return null;
   }
  };
 }
})();
function buildAclUiVis(res, codes) {
 const out = {};
 const role = String(res.locals.user?.role || '0');
 const navRole = res.locals.navRole ? String(res.locals.navRole) : role;
 const perms = res.locals.userPerms || [];
 const permForNav = role === '99' ? ['*'] : perms;
 const navOpts = { viewerRole: role };
 if (typeof aclLayout.getProductSlices === 'function') navOpts.productSlices = aclLayout.getProductSlices();
 if (typeof aclLayout.getModuleOverrides === 'function') navOpts.moduleOverrides = aclLayout.getModuleOverrides();
 for (const code of codes) {
  if (typeof aclLayout.uiElementVisible === 'function') {
   out[code] = aclLayout.uiElementVisible(code, permForNav, navRole, navOpts);
  } else {
   out[code] = typeof aclLayout.isRoleHidden === 'function' ? !aclLayout.isRoleHidden(navRole, code) : true;
  }
 }
 return out;
}
const { nextReceiptNumber } = require('./lib/receiptNumber');
const { nextInvoiceNumber } = require('./lib/invoiceNumber');
const { amountPaidWords } = require('./lib/amountInWords');
const ensureFacilityRow = require('./lib/ensureFacilityRow');
const wardBoard = require('./lib/wardBoard');
const clinicalDeptAlerts = require('./lib/clinicalDeptAlerts');
const { suggestTemplateForOrderName } = require('./lib/labTestTemplates');
const { suggestTemplateForOrderName: suggestRadTemplateForOrderName } = require('./lib/radTestTemplates');
const paymentValidity = require('./lib/paymentValidity');
const { allocateUniquePaymentCode, assignServiceCodesForConsultation, assignServiceCodesForOrderItems, paymentCodeTypeLabel, resolvePaymentCodePrefix } = require('./lib/paymentTicketCode');
const betterPayQr = require('./lib/betterPayQr');
const betterPayPayment = require('./lib/betterPayPayment');
const betterPayConfig = require('./lib/betterPayConfig');
const cashierPrepayIssue = require('./lib/cashierPrepayIssue');
const clinicalBusinessRules = require('./lib/clinicalBusinessRules');
const { authorizeLabTest, authorizeServiceCodeValidate } = require('./lib/authorizeLabTest');
const { resolveTicketPrintPayload, resolveBillingDocPrintPayload } = require('./lib/billingPrintPayload');
const { isIpdOrErAlert } = require('./lib/diagnosticWorkbenchGate');
const {
 isConsultDoctorServiceName,
 catalogItemNeedsDoctor,
 doctorFilterDepartment,
 effectivePrepayServiceType,
 resolveCashierConsultTicketMeta,
 resolveOpdConsultBillingMeta,
 parsePaymentTicketConsultation,
 isConsultationTicketLine,
 listSpecialistSpecialisationsForCashier,
 generalConsultSpecPatternSources,
} = require('./lib/cashierConsultServices');
const { ensureDiagnosticCorrectionSchema, insertDiagnosticCorrectionAudit } = require('./lib/ensureDiagnosticCorrectionSchema');
const {
  resolvePatientDobAgeFromBody,
  patientDisplayAgeYears,
  ensurePatientAgeColumns,
  normalizePatientPhone,
  normalizePatientAddress,
} = require('./lib/patientAge');
const { findDuplicatePatient, duplicatePatientMessage } = require('./lib/patientDuplicate');
const ensureIpdHospitalizationSchema = require('./lib/ensureIpdHospitalizationSchema');
const ensureDeathRegistrySchema = require('./lib/ensureDeathRegistrySchema');
const { fetchPatientById } = require('./lib/fetchPatientById');
const clinicalNad = require('./lib/clinicalNotAssignedBypass');
const { enrichOpdVisitsRoomContext, enrichOpdVisitsDoctorFromPaymentTicket, paymentTicketDoctorSubquery } = require('./lib/opdVisitRoomQueue');
const { canManageConsultationRooms } = require('./lib/consultationRoomsAccess');
const hmsDoctorStaff = require('./lib/hmsDoctorStaff');
const opdVisitCarryForward = require('./lib/opdVisitCarryForward');
const pagination = require('./lib/pagination');
const hmsOnlineBooking = require('./lib/hmsOnlineBooking');

/** Derive referring doctor / requester label for lab registry + report view. */
function enrichLabRegistryRow(r) {
 if (!r) return r;
 let refDisplay = '';
 if (r.referred_by_id && (r.ref_fn || r.ref_ln)) {
  refDisplay = ('Dr. ' + [r.ref_fn, r.ref_ln].filter(Boolean).join(' ')).trim();
 }
 if (!refDisplay && (r.oi_ref_fn || r.oi_ref_ln)) {
  refDisplay = ('Dr. ' + [r.oi_ref_fn, r.oi_ref_ln].filter(Boolean).join(' ')).trim();
 }
 if (!refDisplay && r.structured_result) {
  try {
   const j = JSON.parse(r.structured_result);
   if (j.patientInfo && j.patientInfo.doctor) refDisplay = String(j.patientInfo.doctor).trim();
  } catch (_) {
   /* ignore */
  }
 }
 if (!refDisplay && r.notes) {
  const lines = String(r.notes).split('\n');
  for (const line of lines) {
   const idx = line.indexOf('Ref:');
   if (idx !== -1) {
    const tail = line.slice(idx + 4).trim();
    if (tail && tail !== '—' && tail !== '-') {
     refDisplay = tail;
     break;
    }
   }
  }
 }
 r.ref_display = refDisplay || null;
 return r;
}

function enrichRadRegistryRow(r) {
 if (!r) return r;
 let refDisplay = '';
 if (r.referred_by_id && (r.ref_fn || r.ref_ln)) {
  refDisplay = ('Dr. ' + [r.ref_fn, r.ref_ln].filter(Boolean).join(' ')).trim();
 }
 if (!refDisplay && (r.oi_ref_fn || r.oi_ref_ln)) {
  refDisplay = ('Dr. ' + [r.oi_ref_fn, r.oi_ref_ln].filter(Boolean).join(' ')).trim();
 }
 r.ref_display = refDisplay || null;
 return r;
}

// ── External-result upload storage (lab + radiology external scans) ─────
// Files land under /public/uploads/external-results/yyyy-mm/ so they're
// reachable via the static handler at /uploads/external-results/...
const EXTERNAL_UPLOAD_ROOT = path.join(__dirname, 'public', 'uploads', 'external-results');
try { fs.mkdirSync(EXTERNAL_UPLOAD_ROOT, { recursive: true }); } catch (_) {}
let uploadExternalResult = null;
if (multer) {
 const externalUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
   const ym = new Date().toISOString().slice(0, 7); // yyyy-mm
   const dir = path.join(EXTERNAL_UPLOAD_ROOT, ym);
   try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
   cb(null, dir);
  },
  filename: (req, file, cb) => {
   const safe = String(file.originalname || 'scan').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
   const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
   cb(null, `${stamp}-${safe}`);
  }
 });
 uploadExternalResult = multer({
  storage: externalUploadStorage,
  limits: { fileSize: 12 * 1024 * 1024 }, // 12 MB max
  fileFilter: (req, file, cb) => {
   const ok = /^(image\/(png|jpe?g|webp|heic|gif)|application\/pdf)$/i.test(String(file.mimetype || ''));
   cb(ok ? null : new Error('Only image or PDF uploads are allowed.'), ok);
  }
 });
}
/** No-op when multer is missing (partial deploy / npm install not run). */
function externalUploadMw(field) {
 if (uploadExternalResult) return uploadExternalResult.single(field);
 return (req, res, next) => {
  res.status(503).send('File uploads are unavailable on this server (multer not installed). Run npm install and restart the app.');
 };
}

const app = express();
// Railway / reverse proxies — required for secure cookies and correct req.ip behind HTTPS.
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1') {
 app.set('trust proxy', 1);
}
const port = process.env.PORT || 3000;

// ── Boot trace ───────────────────────────────────────────────────────────
// Every boot step pushes a line here so /__health can show exactly which
// step failed when Phusion Passenger refuses to start the app.
const BOOT_TRACE = [];
function bootErrorDetail(detail) {
 if (detail == null) return null;
 if (typeof detail === 'string') return detail;
 const nested = detail.errors && detail.errors.length ? detail.errors[0] : null;
 const code = (nested && nested.code) || detail.code || '';
 const msg = (nested && nested.message) || detail.message || String(detail);
 if (code === 'ECONNREFUSED') {
  return 'Database unreachable (ECONNREFUSED). Start MySQL/MariaDB (e.g. XAMPP) and check DB_HOST/DB_PORT in .env.';
 }
 if (code === 'ER_BAD_DB_ERROR') {
  return `Database "${process.env.DB_NAME || ''}" does not exist (${msg})`;
 }
 if (code === 'ER_ACCESS_DENIED_ERROR') {
  return `Database login failed (${msg}). Check DB_USER/DB_PASSWORD in .env.`;
 }
 return code ? `${code}: ${msg}` : msg;
}
const bootStep = (label, status, detail) => {
 const detailText = bootErrorDetail(detail);
 BOOT_TRACE.push({
  t: new Date().toISOString(),
  step: label,
  status: status || 'ok',
  detail: detailText,
 });
 try {
  if (status === 'fail') console.error(`[boot] FAIL ${label}: ${detailText || detail}`);
  else console.log(`[boot] ${status || 'ok'} ${label}${detailText ? ' :: ' + detailText : ''}`);
 } catch (_) {}
 // Persist trace so it can be read from the cPanel File Manager even if the
 // process never reaches its first HTTP route. Best-effort; never throws.
 try { fs.writeFileSync(path.join(_crashDir, 'last-boot.json'), JSON.stringify(BOOT_TRACE, null, 2)); } catch (_) {}
};
bootStep('app-construct', 'ok', `node=${process.version} port=${port}`);

// View Engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
const _hmsUiBundlePath = path.join(__dirname, 'public', 'dist', 'hms-ui.js');
let _hmsUiBundleVersion = '57';
try {
 _hmsUiBundleVersion = String(Math.floor(fs.statSync(_hmsUiBundlePath).mtimeMs));
} catch (_) { /* bundle not built yet */ }
app.use((req, res, next) => {
 res.locals.hmsUiMissing = !fs.existsSync(_hmsUiBundlePath);
 res.locals.hmsUiBundleVersion = _hmsUiBundleVersion;
 next();
});
// Browsers always request /favicon.ico; answer early so a boot failure does not look like "only favicon broke".
app.get('/favicon.ico', (req, res, next) => {
 const ico = path.join(__dirname, 'public', 'favicon.ico');
 fs.access(ico, fs.constants.R_OK, (err) => {
  if (err) return res.status(204).end();
  res.sendFile(ico, (sendErr) => (sendErr ? next(sendErr) : undefined));
 });
});
bootStep('middleware-base', 'ok');

// ── Public health-check ──────────────────────────────────────────────────
// Visit /__health on the deployed site to see exactly what's wrong (DB
// reachable? schema columns? environment variables? boot trace?). No
// session required; returns plain JSON. Safe to leave in place.
// IMPORTANT: this route does NOT rely on `pool` being defined — pool
// creation may itself fail at boot, in which case we still want this
// endpoint to respond.
app.get('/__health', async (req, res) => {
 const { HMS_BUILD } = require('./lib/resolveDbConfig');
 const out = {
  ok: true,
  build: HMS_BUILD,
  node: process.version,
  pid: process.pid,
  uptime_s: Math.round(process.uptime()),
  env: {
   DB_DRIVER: pool && pool.driver ? pool.driver : DB_BOOT_CONFIG.driver,
   DB_SOURCE: DB_BOOT_CONFIG.source || '(unknown)',
   DB_HOST: DB_BOOT_CONFIG.host || '(missing)',
   DB_PORT: String(DB_BOOT_CONFIG.port || ''),
   DB_USER: DB_BOOT_CONFIG.user ? '(set)' : '(missing)',
   DB_PASSWORD: DB_BOOT_CONFIG.password ? '(set)' : '(missing)',
   DB_NAME: DB_BOOT_CONFIG.database || '(missing)',
   DATABASE_URL_SET: process.env.DATABASE_URL ? '(set)' : '(missing)',
   PGHOST_SET: process.env.PGHOST ? '(set)' : '(missing)',
   PGHOST_VALUE: process.env.PGHOST ? process.env.PGHOST.replace(/[^a-zA-Z0-9._-]/g, '') : '(missing)',
   RAILWAY: _envLoad.onRailway ? 'yes' : 'no',
   CONFIG_VALID: DB_BOOT_CONFIG.valid !== false,
   CONFIG_ERROR: DB_BOOT_CONFIG.valid === false ? DB_BOOT_CONFIG.error : null,
   PG_SSL: DB_BOOT_CONFIG.ssl === false ? 'off' : DB_BOOT_CONFIG.ssl ? 'on' : 'off',
   PORT: process.env.PORT || '(default)',
   NODE_ENV: process.env.NODE_ENV || '(unset)',
  },
  boot: BOOT_TRACE.slice(-50),
  db: { reachable: false, error: null, version: null, appointment_columns: [] }
 };
 try {
  if (typeof pool === 'undefined' || !pool) throw new Error('Database pool was not initialized at boot.');
  const probe = pool.query('SELECT VERSION() AS v');
  const timeout = new Promise((_, reject) => {
   setTimeout(() => reject(new Error('Database probe timed out after 10s')), 10000);
  });
  const [[v]] = await Promise.race([probe, timeout]);
  out.db.reachable = true;
  out.db.version = v && v.v;
  const [cols] = await pool.query(
   `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_appointment'`
  ).catch(() => [[]]);
  out.db.appointment_columns = cols.map((c) => c.COLUMN_NAME || c.column_name);
  const [empTables] = await pool.query(
   `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_employee' LIMIT 1`
  ).catch(() => [[]]);
  out.db.tbl_employee = { exists: empTables.length > 0 };
  if (empTables.length) {
   const [[empCnt]] = await pool.query('SELECT COUNT(*) AS n FROM tbl_employee').catch(() => [[{ n: null }]]);
   out.db.tbl_employee.count = empCnt && empCnt.n;
   const [empCols] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_employee'`
   ).catch(() => [[]]);
   const names = empCols.map((c) => c.COLUMN_NAME || c.column_name);
   out.db.tbl_employee.has_specialisation = names.includes('specialisation');
   try {
    await pool.query(
     'SELECT id, specialisation FROM tbl_employee WHERE username = ? AND status = 1 LIMIT 1',
     ['__health_probe__']
    );
    out.db.tbl_employee.login_select_ok = true;
   } catch (probeErr) {
    out.db.tbl_employee.login_select_ok = false;
    out.db.tbl_employee.login_select_error = probeErr && probeErr.message ? probeErr.message : String(probeErr);
   }
  }
 } catch (e) {
  out.ok = false;
  out.db.error = e && e.message ? e.message : String(e);
  out.db.code = e && e.code ? e.code : null;
  if (DB_BOOT_CONFIG.valid === false && DB_BOOT_CONFIG.error) {
   out.db.config_error = DB_BOOT_CONFIG.error;
  }
  if (
    DB_BOOT_CONFIG.driver === 'postgres' &&
    (out.db.code === 'ECONNREFUSED' || /ECONNREFUSED/i.test(out.db.error)) &&
    /localhost|127\.0\.0\.1|::1/i.test(DB_BOOT_CONFIG.host || '')
  ) {
   out.db.hint =
    'Postgres is pointing at localhost. On Railway: link the Postgres service, set ' +
    'DATABASE_URL=${{Postgres.DATABASE_URL}}, and delete DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME from the web service.';
  } else if (DB_BOOT_CONFIG.driver === 'postgres' && !process.env.DATABASE_URL && !process.env.PGHOST) {
   out.db.hint =
    'No DATABASE_URL or PGHOST on this service. Reference Postgres variables from the linked database service.';
  }
 }
 res.set('Cache-Control', 'no-store');
 // Always HTTP 200 so hosting panels don't treat DB issues as "app failed to start".
 res.status(200).json(out);
});

// Tiny "is the process alive at all" probe — never touches DB or migrations.
app.get('/__alive', (req, res) => {
 res.set('Cache-Control', 'no-store').json({
  alive: true, pid: process.pid, node: process.version, uptime_s: Math.round(process.uptime())
 });
});

// cPanel "Run NPM Install" / availability probe — must return 200 text/html (no session/DB).
app.get('/cpanel-health', (req, res) => {
 res.status(200).type('text/html; charset=UTF-8').send('OK');
});

// Last boot trace + recent crashes (read from disk, written by bootStep /
// uncaughtException). This is invaluable on Passenger hosting where stderr
// is often invisible.  Both files are best-effort and may be empty.
app.get('/__boot', (req, res) => {
 const out = { boot: null, crash_log_tail: null };
 try { out.boot = JSON.parse(fs.readFileSync(path.join(_crashDir, 'last-boot.json'), 'utf8')); } catch (_) {}
 try {
  const log = fs.readFileSync(path.join(_crashDir, 'crash.log'), 'utf8');
  out.crash_log_tail = log.split('\n').slice(-80).join('\n');
 } catch (_) {}
 res.set('Cache-Control', 'no-store').json(out);
});

app.get('/__env-debug', (req, res) => {
 const keys = Object.keys(process.env)
  .filter((k) => /^(DB_|PG|POSTGRES|DATABASE|HMS_DB|RAILWAY|NODE_ENV|PORT)/i.test(k))
  .sort();
 const pgKeys = ['DATABASE_URL', 'DATABASE_PUBLIC_URL', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'POSTGRES_PASSWORD', 'PGDATABASE'];
 const keyStatus = {};
 for (const k of pgKeys) {
  const v = process.env[k];
  keyStatus[k] = v && String(v).trim() ? 'has_value' : (k in process.env ? 'empty' : 'absent');
 }
 res.set('Cache-Control', 'no-store').json({
  build: require('./lib/resolveDbConfig').HMS_BUILD,
  railway: _envLoad.onRailway,
  keys_present: keys,
  pg_key_status: keyStatus,
  keys_with_values: keys.filter((k) => String(process.env[k] || '').trim()),
  hints: {
   DATABASE_URL: process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim() ? 'set' : 'empty_or_missing',
   PGHOST: process.env.PGHOST && String(process.env.PGHOST).trim() ? 'set' : 'empty_or_missing',
   POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD && String(process.env.POSTGRES_PASSWORD).trim() ? 'set' : 'empty_or_missing',
   HMS_DB_DRIVER: process.env.HMS_DB_DRIVER || '(unset)',
   fix: 'Railway web service → Variables → delete empty DATABASE_URL/PGHOST → Add Reference → Postgres → DATABASE_URL',
  },
 });
});

// Database pool — MySQL (mysql2) or PostgreSQL (pg) via lib/dbPool.js
let pool = null;
try {
 pool = createDbPool();
 bootStep('db-pool', 'ok', `${pool.driver} → ${pool.config?.host}:${pool.config?.port} ssl=${pool.config?.ssl === false ? 'off' : 'on'} (${pool.config?.source || '?'})`);
 const _origPoolQuery = pool.query.bind(pool);
 pool.query = async function catalogAwareQuery(sql, ...args) {
  const result = await _origPoolQuery(sql, ...args);
  const s = typeof sql === 'string' ? sql : '';
  if (/tbl_service_catalog/i.test(s) && /\b(INSERT|UPDATE|DELETE)\b/i.test(s)) {
   try {
    require('./lib/catalogAccountCoreSync').scheduleServiceCatalogSync(pool);
    require('./lib/coreAccountProductSync').scheduleProductSync(pool);
   } catch (_) { /* non-fatal */ }
  }
  if (/tbl_inventory_item/i.test(s) && /\b(INSERT|UPDATE|DELETE)\b/i.test(s)) {
   try {
    require('./lib/coreAccountProductSync').scheduleProductSync(pool);
   } catch (_) { /* non-fatal */ }
  }
  return result;
 };
 pool.query('SELECT 1 AS ok').then(async () => {
  bootStep('db-pool-probe', 'ok');
  try {
   const ensureFinAccountingSchema = require('./lib/ensureFinAccountingSchema');
   await ensureFinAccountingSchema(pool);
   bootStep('fin-accounting-schema', 'ok');
  } catch (schemaErr) {
   bootStep('fin-accounting-schema', 'warn', schemaErr);
  }
  try {
   const { exportAndSyncServiceCatalog } = require('./lib/catalogAccountCoreSync');
   exportAndSyncServiceCatalog(pool).catch((e) => console.warn('[catalog-sync] startup:', e.message));
   const { syncProductsToAccountCore } = require('./lib/coreAccountProductSync');
   syncProductsToAccountCore(pool).catch((e) => console.warn('[product-sync] startup:', e.message));
   const { syncPendingJournalsOnStartup } = require('./lib/journalAccountCoreSync');
   syncPendingJournalsOnStartup(pool).catch((e) => console.warn('[journal-core-sync] startup:', e.message));
  } catch (_) { /* optional */ }
 }).catch((e) => bootStep('db-pool-probe', 'fail', e));
 betterPayConfig.init(pool).catch((e) => console.warn('[BetterPay] init:', e.message));
} catch (e) {
 bootStep('db-pool', 'fail', e);
 console.error('[HMS] Database pool not created:', e.message || e);
}

/** Ensures tbl_patient_insurance exists and columns match INSERTs (MySQL 5.7+ / MariaDB: no IF NOT EXISTS on ADD COLUMN). */
async function migratePatientInsuranceSchema(db) {
 if (db && db.driver === 'postgres') return;
 await db.query(`
  CREATE TABLE IF NOT EXISTS tbl_patient_insurance (
   id INT AUTO_INCREMENT PRIMARY KEY,
   patient_id INT NOT NULL,
   facility_id INT NULL,
   carrier_id INT NOT NULL,
   policy_number VARCHAR(120) DEFAULT NULL,
   insurer_covered_percent INT DEFAULT 0,
   is_primary TINYINT DEFAULT 0,
   insurance_id_external VARCHAR(120) DEFAULT NULL,
   api_source VARCHAR(40) DEFAULT NULL,
   api_last_fetched DATETIME DEFAULT NULL,
   effective_from DATE DEFAULT NULL,
   effective_to DATE DEFAULT NULL,
   created_by INT DEFAULT NULL,
   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
   KEY idx_patient (patient_id),
   KEY idx_carrier (carrier_id)
  )
 `).catch(() => {});
 const cols = [
  ['facility_id', 'INT NULL'],
  ['insurance_id_external', 'VARCHAR(120) NULL'],
  ['api_source', 'VARCHAR(40) NULL'],
  ['api_last_fetched', 'DATETIME NULL'],
  ['effective_from', 'DATE NULL'],
  ['effective_to', 'DATE NULL'],
  ['created_by', 'INT NULL']
 ];
 for (const [col, def] of cols) {
  try {
   await db.query(`ALTER TABLE tbl_patient_insurance ADD COLUMN ${col} ${def}`);
  } catch (e) {
   const msg = String(e.message || '');
   const ignore =
    e.code === 'ER_DUP_FIELDNAME' ||
    e.errno === 1060 ||
    /Duplicate column/i.test(msg) ||
    /already exists/i.test(msg);
   if (!ignore) console.warn(`migratePatientInsuranceSchema(${col}):`, msg);
  }
 }
}

async function ensureOpdOrderItemsSchema(db) {
 if (db && db.driver === 'postgres') return;
 // Core queue table: per-item billing state for consultation-prescribed lab/radiology
 await db.query(`
  CREATE TABLE IF NOT EXISTS tbl_opd_order_item (
   id INT AUTO_INCREMENT PRIMARY KEY,
   facility_id INT DEFAULT 1,
   patient_id INT NOT NULL,
   opd_visit_id INT NULL,
   consultation_id INT NULL,
   item_type VARCHAR(20) NOT NULL,
   catalog_id INT NULL,
   item_name VARCHAR(255) DEFAULT NULL,
   unit_price DECIMAL(12,2) DEFAULT 0,
   quantity DECIMAL(10,2) DEFAULT 1,
   status VARCHAR(20) DEFAULT 'pending',
   service_code VARCHAR(40) NULL,
   ticket_id INT NULL,
   paid_at DATETIME NULL,
   served_at DATETIME NULL,
   served_by INT NULL,
   served_notes TEXT NULL,
   created_by INT NULL,
   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
   KEY idx_status_patient (status, patient_id),
   KEY idx_consult (consultation_id),
   KEY idx_visit (opd_visit_id),
   KEY idx_service_code (service_code)
  )
 `).catch(() => {});

 // Link back from downstream request tables (if they exist) for idempotency
 const addCol = async (table, colDef) => {
  try { await db.query(`ALTER TABLE ${table} ADD COLUMN ${colDef}`); }
  catch (e) {
   const msg = String(e.message || '');
   const ignore = e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060 || /Duplicate column/i.test(msg) || /already exists/i.test(msg);
   if (!ignore) console.warn(`ensureOpdOrderItemsSchema(${table}):`, msg);
  }
 };
 await addCol('tbl_lab_result', 'opd_order_item_id INT NULL');
 await addCol('tbl_radiology_result', 'opd_order_item_id INT NULL');
 // Self-healing migrations for older schemas without the new workflow cols.
 await addCol('tbl_opd_order_item', 'service_code VARCHAR(40) NULL');
 await addCol('tbl_opd_order_item', 'served_at DATETIME NULL');
 await addCol('tbl_opd_order_item', 'served_by INT NULL');
 await addCol('tbl_opd_order_item', 'served_notes TEXT NULL');
 await addCol('tbl_opd_order_item', 'inventory_item_id INT NULL');
 await addCol('tbl_opd_order_item', 'stock_deducted_at DATETIME NULL');
 await addCol('tbl_opd_order_item', 'pharmacist_available TINYINT(1) NOT NULL DEFAULT 0');
 await addCol('tbl_opd_order_item', 'off_catalog_dispense TINYINT(1) NOT NULL DEFAULT 0');
 await addCol('tbl_opd_order_item', 'stock_dispense_note VARCHAR(255) NULL');
 // External-document classification flags so the patient profile can list
 // doctor/nurse-uploaded scans alongside the in-house results.
 await addCol('tbl_lab_result',       'source VARCHAR(20) DEFAULT NULL');
 await addCol('tbl_radiology_result', 'source VARCHAR(20) DEFAULT NULL');
 await addCol('tbl_lab_result',       'external_doc_id INT NULL');
 await addCol('tbl_radiology_result', 'external_doc_id INT NULL');
 // Structured template output from /laboratory/templates (JSON + flags)
 await addCol('tbl_lab_result', 'structured_result LONGTEXT NULL');
 await addCol('tbl_lab_result', 'template_test_id VARCHAR(80) NULL');
 await addCol('tbl_radiology_result', 'structured_result LONGTEXT NULL');
 await addCol('tbl_radiology_result', 'template_test_id VARCHAR(80) NULL');
}

// ─────────────────────────────────────────────────────────────────────────────
// Service codes (LAB/RAD/PHA per consultation) — lib/paymentTicketCode.js
// ─────────────────────────────────────────────────────────────────────────────

async function ensureServiceCatalogSchema(db) {
 if (db && db.driver === 'postgres') return;
 await db.query(`
  CREATE TABLE IF NOT EXISTS tbl_service_catalog (
   id INT AUTO_INCREMENT PRIMARY KEY,
   category VARCHAR(60) DEFAULT 'service',
   name VARCHAR(255) NOT NULL,
   department_name VARCHAR(120) DEFAULT NULL,
   price DECIMAL(12,2) DEFAULT 0,
   status TINYINT DEFAULT 1,
   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
   KEY idx_cat (category),
   KEY idx_status (status)
  )
 `).catch(() => {});
 try {
  const { repairServiceCatalogTextEncoding } = require('./lib/fixUtf8Mojibake');
  const repaired = await repairServiceCatalogTextEncoding(db);
  if (repaired > 0) console.log(`[catalog] repaired ${repaired} mojibake service label(s)`);
 } catch (e) {
  console.warn('[catalog] mojibake repair:', e.message);
 }
}

app.locals.db = pool;

// Session Store — tolerate failures (e.g. shared host without CREATE TABLE
// permission). Falls back to the default in-memory MemoryStore so the app
// still boots; sessions just won't survive a restart in that degraded mode.
//
// iFastNet / shared-host hardening: MySQL connections are aggressively closed
// after idle periods. express-mysql-session fires unhandledRejection:ECONNRESET
// when the connection pool resets while a session query is in-flight.
// We absorb those by: (1) passing expiration/cleanup options so it doesn't
// run background queries unnecessarily, and (2) catching all store 'error'
// events + absorbing the unhandledRejection from its internal Promise chain.
let sessionStore = null;
try {
 if (pool && pool.driver === 'postgres' && PgSessionStore && pool.nativePool) {
  sessionStore = new PgSessionStore({
   pool: pool.nativePool,
   createTableIfMissing: true,
   tableName: 'session',
  });
  bootStep('session-store', 'ok', 'postgres');
 } else if (pool && MySQLStore) {
  sessionStore = new MySQLStore({
   // Don't let the store create its own connection — use our pool
   createDatabaseTable: true,
   // Reduce idle cleanup frequency to avoid triggering ECONNRESET on shared hosts
   clearExpired: true,
   checkExpirationInterval: 15 * 60 * 1000, // check every 15 min (default 15min)
   expiration: 24 * 60 * 60 * 1000,         // match cookie maxAge
   // Schema
   schema: {
    tableName: 'sessions',
    columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' }
   }
  }, pool);
  // Absorb all error events so they don't propagate to uncaughtException.
  if (typeof sessionStore.on === 'function') {
   sessionStore.on('error', (err) => {
    // ECONNRESET / EPIPE from idle connection drops are expected on shared hosts.
    const code = (err && err.code) || '';
    const ignorable = ['ECONNRESET', 'EPIPE', 'PROTOCOL_CONNECTION_LOST', 'ER_CLIENT_INTERACTION_TIMEOUT'];
    if (ignorable.includes(code)) {
     bootStep('session-store-runtime', 'warn', `Ignorable DB disconnect (${code}) — pool will reconnect`);
    } else {
     bootStep('session-store-runtime', 'warn', err);
    }
   });
  }
  bootStep('session-store', 'ok');
 } else {
  bootStep('session-store', 'warn', 'No DB pool — using MemoryStore.');
 }
} catch (e) {
 bootStep('session-store', 'fail', e);
 sessionStore = null;
}

const sessionOptions = {
 secret: process.env.SESSION_SECRET || 'hms-secret',
 resave: false,
 saveUninitialized: false,
 cookie: { maxAge: 24 * 60 * 60 * 1000 }
};
if (sessionStore) sessionOptions.store = sessionStore;
app.use(session(sessionOptions));

const opdCallQueueLive = require('./lib/opdCallQueueLive');
opdCallQueueLive.configure({
 pool,
 sessionSecret: sessionOptions.secret,
 sessionStore,
});

function notifyOpdLobbyQueue() {
 try {
  opdCallQueueLive.notifyOpdQueueChanged();
 } catch (_) {
  /* optional */
 }
}

const { sessionIdleMiddleware, setLoginActivity, idleTimeoutMs } = require('./lib/hmsSessionIdle');
app.use(sessionIdleMiddleware());

app.post('/set-lang', hmsI18n.handleSetLang);
app.get('/set-lang', hmsI18n.handleSetLang);

const hmsBrand = require('./lib/hmsBrand');
const { attachFinReportOrgLocals } = require('./lib/hmsFinReportOrg');

// Global template variables
app.use((req, res, next) => {
 res.locals.user = req.session.user || null;
 res.locals.brand = hmsBrand;
 res.locals.title = hmsBrand.name;
 res.locals.hmsPath = req.path || '';
 res.locals.hmsQuery = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
 next();
});

// IPD hospitalization module columns (tbl_admission extensions, surgery tables, etc.)
app.use('/ipd', async (req, res, next) => {
 try {
  await ensureIpdHospitalizationSchema(pool);
  await ensureDeathRegistrySchema(pool);
 } catch (_) {}
 next();
});

// Death registry schema (OPD/ER/Maternity routes outside /ipd)
app.use('/death-registry', async (req, res, next) => {
 try {
  await ensureDeathRegistrySchema(pool);
 } catch (_) {}
 next();
});

// tbl_vital_sign: recorded_at NOT NULL on legacy databases
const { ensureVitalSignColumns } = require('./lib/ensureVitalSignSchema');
const { insertVitalSign } = require('./lib/insertVitalSign');
const {
 resolveOpdVisitIdForVitals,
 opdVisitHasVitalsRecorded,
 fetchVisitIdsWithVitals,
 afterOpdVitalsSaved,
 assertOpdVitalsSaveAllowed,
 staffMayRecordOpdVitals,
 requestOpdVitalsRetake,
} = require('./lib/opdVitalsWorkflow');
const { clinicalMsgT, opdVitalsRequiredMessage } = require('./lib/clinicalI18n');
const {
  SCANS_IMAGING_CATEGORY,
  SCANS_IMAGING_LABEL,
  imagingCategoryWhere,
  mergeScansImagingCatalog,
} = require('./lib/scansImagingCatalog');
ensureVitalSignColumns(pool).catch((e) => {
 console.warn('ensureVitalSignColumns:', e.message);
});

// Global display dates: DD/MM/YYYY (all pages + EJS)
const hmsFormatDate = require('./lib/hmsFormatDate');
app.use((req, res, next) => {
  res.locals.hmsFormatDate = hmsFormatDate.formatDisplayDate;
  res.locals.hmsFormatDateShort = hmsFormatDate.formatDisplayDateShort;
  res.locals.hmsFormatDateTime = hmsFormatDate.formatDisplayDateTime;
  res.locals.hmsFormatTime = hmsFormatDate.formatDisplayTime;
  res.locals.hmsFormatMonthYear = hmsFormatDate.formatMonthYear;
  res.locals.hmsFormatPeriod = hmsFormatDate.formatPeriodRange;
  res.locals.hmsFormatPeriodStr = hmsFormatDate.formatPeriodDisplayString;
  res.locals.hmsToIsoDatePart = hmsFormatDate.toIsoDatePart;
  const { displayPatientCode } = require('./lib/hmsPatientCode');
  res.locals.displayPatientCode = displayPatientCode;
  const { formatQtyWithUom } = require('./lib/procurementQty');
  res.locals.fmtPoQty = formatQtyWithUom;
  const _render = res.render.bind(res);
  res.render = function (view, options, callback) {
    let opts = options;
    let cb = callback;
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts = opts || {};
    if (typeof opts.fmtDate !== 'function') opts.fmtDate = hmsFormatDate.formatDisplayDate;
    if (typeof opts.fmtDateShort !== 'function') opts.fmtDateShort = hmsFormatDate.formatDisplayDateShort;
    if (typeof opts.fmtDateTime !== 'function') opts.fmtDateTime = hmsFormatDate.formatDisplayDateTime;
    if (typeof opts.hmsFormatDate !== 'function') opts.hmsFormatDate = hmsFormatDate.formatDisplayDate;
    if (typeof opts.hmsFormatDateShort !== 'function') {
      opts.hmsFormatDateShort = hmsFormatDate.formatDisplayDateShort;
    }
    if (typeof opts.hmsFormatDateTime !== 'function') {
      opts.hmsFormatDateTime = hmsFormatDate.formatDisplayDateTime;
    }
    if (cb) return _render(view, opts, cb);
    return _render(view, opts);
  };
  next();
});

app.use(hmsI18n.middleware());

// Accounting reports: company name from Financial settings → brand → facility
app.use('/financials', async (req, res, next) => {
 try {
  await attachFinReportOrgLocals(pool, req, res);
 } catch (_) {
  res.locals.finReportOrgName = hmsBrand.orgName || 'TSSF SOA';
  res.locals.finReportEntityLabel =
   'Facility #' + (parseInt(req.session?.facilityId, 10) || 1);
 }
 res.locals.hmsFormatDate = hmsFormatDate.formatDisplayDate;
 res.locals.hmsFormatPeriod = hmsFormatDate.formatPeriodRange;
 res.locals.hmsFormatPeriodStr = hmsFormatDate.formatPeriodDisplayString;
 next();
});

/** Whole FCFA amounts for EJS (no decimals), fr-FR grouping — used by wards, running bill, etc. */
app.locals.brand = hmsBrand;
app.locals.hmsFormatDate = hmsFormatDate.formatDisplayDate;
app.locals.hmsFormatDateShort = hmsFormatDate.formatDisplayDateShort;
app.locals.hmsFormatDateTime = hmsFormatDate.formatDisplayDateTime;
app.locals.fmtDate = hmsFormatDate.formatDisplayDate;
app.locals.fmtDateShort = hmsFormatDate.formatDisplayDateShort;
app.locals.fmtDateTime = hmsFormatDate.formatDisplayDateTime;
app.locals.hmsFormatPeriod = hmsFormatDate.formatPeriodRange;
app.locals.hmsFormatPeriodStr = hmsFormatDate.formatPeriodDisplayString;
app.locals.fcfaFmt = function (n) {
 const x = Math.round(parseFloat(n) || 0);
 const v = Number.isFinite(x) ? x : 0;
 return v.toLocaleString('fr-FR', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
};

// Auth Middleware
function apiWantsJson(req) {
 const accept = String(req.get('accept') || '');
 const xhr = String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
 const path = String(req.path || req.url || '').split('?')[0];
 return (
  req.is('application/json') ||
  accept.includes('application/json') ||
  xhr ||
  path.startsWith('/api/')
 );
}

function requireAuth(req, res, next) {
 if (!req.session.user) {
  // For AJAX/JSON requests, return a 401 JSON response so the client can
  // surface a real error instead of fetching a 302 → HTML login page and
  // failing on r.json() with a misleading "Network error".
  if (apiWantsJson(req)) {
   return res.status(401).json({ ok: false, error: 'Your session has expired. Please sign in again.' });
  }
 return res.redirect('/');
 }
 next();
}

//  -  Æ’ ============================== Æ’ === ¬ Admin-Only Middleware === Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ === ¬
// Blocks non-admin/non-super users from edit/write routes.
function requireAdminOrSuper(req, res, next) {
 const role = String((req.session.user || {}).role || '');
 if (role === '1' || role === '99') return next();
 // For API/POST requests return 403; for page requests redirect
 if (req.method === 'POST' || (req.headers.accept || '').includes('application/json')) {
 return res.status(403).json({ ok: false, error: 'Access denied. Admin only.' });
 }
 return res.redirect('/dashboard?err=' + encodeURIComponent(flashT(res, 'access.admin_or_super', { ns: 'errors', defaultValue: 'Access denied. Admin or Super Admin only.' })));
}

//  -  Æ’ ============================== Æ’ === ¬ Permission Middleware === Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ === ¬
// Loads the logged-in user's granted permissions from DB into res.locals.userPerms.
// Admin (1) and Super Admin (99) get wildcard ['*'] === Æ’ ===   always see everything.
// All other roles get their specific permission codes from tbl_acl_role_permission.
app.use(async (req, res, next) => {
 if (!req.session.user) return next();
 const role = String(req.session.user.role || '');
 const hmsStaffAccountGuard = require('./lib/hmsStaffAccountGuard');
 res.locals.hmsIsSuperAdmin = role === hmsStaffAccountGuard.SUPER_ADMIN_ROLE;
 res.locals.hmsIsSystemAdmin = role === hmsStaffAccountGuard.SYSTEM_ADMIN_ROLE;
 res.locals.canManageEmployeeAccount = (targetRole) =>
  hmsStaffAccountGuard.canManageEmployeeAccount(role, targetRole);
 if (role === hmsStaffAccountGuard.SUPER_ADMIN_ROLE || role === hmsStaffAccountGuard.SYSTEM_ADMIN_ROLE) {
 res.locals.userPerms = ['*'];
 return next();
 }
 // Return cached perms if already set (within same request chain)
 if (res.locals.userPerms) return next();
 if (Array.isArray(req.session.userPerms)) {
  res.locals.userPerms = req.session.userPerms;
  return next();
 }
 try {
 const [perms] = await pool.query(
 `SELECT p.code FROM tbl_acl_role_permission rp
 JOIN tbl_acl_permission p ON p.id = rp.permission_id
 WHERE rp.role = ?`,
 [role]
 );
 res.locals.userPerms = perms.map(p => p.code);
 req.session.userPerms = res.locals.userPerms;
 } catch(e) {
 // Non–core roles: no implicit grants if ACL query fails (manage via Access Control).
 res.locals.userPerms = [];
 }
 next();
});

// Injected layout engine (portal tiles / sidebar catalogue from DB).
app.use((req, res, next) => {
 res.locals.HMS_PAGE_SIZE = pagination.DEFAULT_PAGE_SIZE;
 res.locals.buildPageUrl = pagination.buildPageUrl;
 res.locals.hmsListUi = require('./lib/hmsListUi');
 const hmsDisplay = require('./lib/hmsDisplay');
 res.locals.hmsFormatTopbarTitle = hmsDisplay.formatTopbarTitle;
 res.locals.hmsFormatDisplayName = hmsDisplay.formatDisplayName;
 res.locals.hmsFormatNavDisplayName = hmsDisplay.formatNavDisplayName;
 if (req.session && req.session.user) {
  res.locals.userDisplayName = hmsDisplay.formatDisplayName(req.session.user.name);
  res.locals.userNavDisplayName = hmsDisplay.formatNavDisplayName(req.session.user.name);
 }
 next();
});

app.use(async (req, res, next) => {
 if (!req.session?.user) return next();
 const uid = req.session.userId || req.session.user.id;
if (uid && (req.session.user.profile_emoji === undefined || req.session.user.photo === undefined)) {
  try {
   const [[row]] = await pool.query(
    'SELECT profile_emoji, gender, photo_path FROM tbl_employee WHERE id=? LIMIT 1',
    [uid]
   );
   if (row) {
    req.session.user.profile_emoji = row.profile_emoji || null;
    req.session.user.gender = row.gender || null;
    req.session.user.photo = row.photo_path || null;
   }
  } catch (_) {
   /* optional column / table */
  }
 }
 const { resolveProfileEmoji } = require('./lib/hmsEmployeeProfile');
 res.locals.userProfileEmoji = resolveProfileEmoji(
  req.session.user.profile_emoji,
  req.session.user.gender
 );
res.locals.userProfilePhoto = req.session.user.photo || null;
 next();
});

const aclRouteRegistry = require('./lib/aclRouteRegistry');
const deploymentConfig = require('./lib/deploymentConfig');
const deploymentModuleEditor = require('./lib/deploymentModuleEditor');

/** Phase 4: enforce route registry (permissions + deployment slices). Super Admin (99) bypasses. */
app.use((req, res, next) => {
 if (!req.session?.user) return next();
 const denial = aclRouteRegistry.checkAccess(
  req,
  res.locals.userPerms || [],
  req.session.user.role
 );
 if (!denial) return next();
 const role = String(req.session.user.role || '');
 const home = aclLayout.staffHomeUrlFromSession(req.session) || '/profile';
 const msg = denial.error || 'Access denied.';
 if ((req.headers.accept || '').includes('application/json') || req.xhr) {
  return res.status(denial.status || 403).json({ ok: false, error: msg });
 }
 const dest = aclLayout.denialRedirectUrl(req, home, msg);
 if (req.method === 'POST') {
  return res.status(denial.status || 403).redirect(dest);
 }
 return res.redirect(dest);
});

app.use((req, res, next) => {
 if (!req.session?.user) return next();
 try {
  res.locals.hmsDeployment = typeof aclLayout.getDeploymentSummary === 'function'
   ? aclLayout.getDeploymentSummary()
   : null;
 } catch (_) {
  res.locals.hmsDeployment = null;
 }
 next();
});

app.use((req, res, next) => {
 res.locals.aclLayout = aclLayout;
 next();
});

/** DB-driven sidebar + top nav (respects preview_role, product slices, role UI hides). */
app.use(async (req, res, next) => {
 if (!req.session?.user) return next();
 try {
  const viewerRole = String(req.session.user.role || '');
  let navRole = viewerRole;
  let navPerms = res.locals.userPerms || [];
  const pr = req.query.preview_role;
  if ((viewerRole === '99' || viewerRole === '1') && pr) {
   navRole = String(pr);
   res.locals.previewRole = navRole;
   if (navRole === '1' || navRole === '99') navPerms = ['*'];
   else {
    const [rows] = await pool.query(
     `SELECT p.code FROM tbl_acl_role_permission rp
      INNER JOIN tbl_acl_permission p ON p.id = rp.permission_id
      WHERE rp.role = ?`,
     [navRole]
    );
    navPerms = (rows || []).map((r) => r.code);
   }
  }
  res.locals.navRole = navRole;
  res.locals.navPerms = navPerms;
  const navOpts = {
   viewerRole,
   productSlices: aclLayout.getProductSlices(),
   moduleOverrides: aclLayout.getModuleOverrides(),
  };
  const permForNav =
   viewerRole === '99' && !res.locals.previewRole ? ['*'] : navPerms;
  res.locals.navSidebar = aclLayout.buildSidebarNav(permForNav, navRole, navOpts);
  res.locals.navTopnav = aclLayout.buildTopNav(permForNav, navRole, navOpts);
  res.locals.accountingModuleNav = aclLayout.buildAccountingModuleNav(permForNav, navRole, navOpts);
  res.locals.staffPortals =
   typeof aclLayout.buildStaffPortalMenu === 'function'
    ? aclLayout.buildStaffPortalMenu(navRole)
    : [];
  const portalOverviewPolicy = require('./lib/portalOverviewPolicy');
  const homeOpts = aclLayout.homePortalOptsFromSession(req.session);
  const homePortalCode =
   typeof aclLayout.homePortal === 'function' ? aclLayout.homePortal(navRole, homeOpts) : null;
  res.locals.staffSpecialisation = homeOpts.specialisation ?? null;
  res.locals.staffHomeUrlResolved =
   typeof aclLayout.staffHomeUrl === 'function'
    ? aclLayout.staffHomeUrl(navRole, homeOpts)
    : null;
  res.locals.staffLandingUrlResolved =
   typeof aclLayout.staffLandingUrl === 'function'
    ? aclLayout.staffLandingUrl(navRole, homeOpts, navPerms)
    : res.locals.staffHomeUrlResolved;
  res.locals.homePortalCode = homePortalCode;
  res.locals.showZaizensBrand = portalOverviewPolicy.canShowHospitalDashboardBrand(
   permForNav,
   navRole
  );
 } catch (e) {
  console.warn('[nav] build failed:', e.message);
  res.locals.navSidebar = [];
  res.locals.navTopnav = { primaryLinks: [], menus: [] };
  res.locals.accountingModuleNav = { primaryLinks: [], menus: [], shellBrand: null };
 }
 next();
});

app.use((req, res, next) => {
 if (!req.session?.user) return next();
 const home = res.locals.staffLandingUrlResolved || res.locals.staffHomeUrlResolved || '/dashboard';
 const override = res.locals.pageNav || {};
 res.locals.pageNav = {
  homeHref: override.homeHref || home,
  backFallback: override.backFallback || home,
  backLabel: override.backLabel || 'Back',
  homeLabel: override.homeLabel || 'Home',
 };
 next();
});

const financeStaffUi = require('./lib/financeStaffUi');
const hmsOdooModule = require('./lib/hmsOdooModule');
app.use((req, res, next) => {
 const role = String((req.session && req.session.user && req.session.user.role) || '');
 res.locals.isFinanceStaff = financeStaffUi.isFinanceStaffUser(role, aclLayout);
 res.locals.hmsOdooModule = hmsOdooModule.moduleFromPath(req.path);
 if (res.locals.isFinanceStaff) {
  res.locals.finNav = financeStaffUi.finNavFromPath(req.path);
 }
 if (res.locals.hmsOdooModule === 'accounting' && !res.locals.finNav) {
  res.locals.finNav = financeStaffUi.finNavFromPath(req.path);
 }
 next();
});

/** Row action menus (⋯): required_perm + tbl_acl_role_ui_hidden, same as tiles. */
app.use((req, res, next) => {
 res.locals.aclActionMenuVisible = function aclActionMenuVisible(code) {
 if (!req.session || !req.session.user) return false;
 const r = String(req.session.user.role || '');
 if (r === '1' || r === '99') return true;
 const p = Array.isArray(res.locals.userPerms) ? res.locals.userPerms : [];
 if (p.includes('*')) return true;
 const acl = res.locals.aclLayout;
 if (!acl || typeof acl.actionMenuVisible !== 'function') return false;
 return acl.actionMenuVisible(code, p, r);
 };
 next();
});

/** Patient directory: only System Admin (1) or Super Admin (99) may delete patients. */
function requirePatientArchivePermission(req, res, next) {
 const hmsStaffAccountGuard = require('./lib/hmsStaffAccountGuard');
 const role = String(req.session.user?.role ?? '');
 if (hmsStaffAccountGuard.canDeletePatientAccount(role)) return next();
 if (req.method === 'POST') {
  return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'access.patient_delete')));
 }
 return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'access.denied')));
}

/** Payroll & HR hub: ACL payroll.read / payroll.write, or Admin/Super (wildcard set earlier). */
function requirePayrollAccess(req, res, next) {
 const perms = res.locals.userPerms || [];
 if (perms.includes('*') || perms.includes('payroll.read') || perms.includes('payroll.write')) return next();
 return res.redirect('/dashboard?err=' + encodeURIComponent(flashT(res, 'access.payroll')));
}

/** Employee self-service: leave requests, payslips, attendance (not the same as profile.self.write). */
function requireHrSelfService(req, res, next) {
 const perms = res.locals.userPerms || [];
 if (perms.includes('*') || perms.includes('hr.self.read') || perms.includes('payroll.read') || perms.includes('payroll.write')) {
  return next();
 }
 const role = String((req.session && req.session.user && req.session.user.role) || '');
 const home = aclLayout.staffHomeUrlFromSession(req.session) || '/profile';
 const msg = flashT(res, 'access.hr_self');
 if ((req.headers.accept || '').includes('application/json') || req.xhr) {
  return res.status(403).json({ ok: false, error: msg });
 }
 const dest = aclLayout.denialRedirectUrl(req, home, msg);
 return res.redirect(dest);
}

/**
 * Generic permission gate. Pass a list of permission keys; access is granted
 * if the user has '*' (Admin / Super Admin) or ANY of the listed keys.
 * On rejection it redirects to the role's home portal, or /profile if none is set,
 * with a friendly error; JSON callers get 403.
 */
function requirePerm(...keys) {
 return function (req, res, next) {
  const perms = res.locals.userPerms || [];
  if (perms.includes('*')) return next();
  for (const k of keys) if (perms.includes(k)) return next();
  const home = aclLayout.staffHomeUrlFromSession(req.session) || '/profile';
  const msg = flashT(res, 'access.section');
  if (apiWantsJson(req)) {
   return res.status(403).json({ ok: false, error: msg });
  }
  const dest = aclLayout.denialRedirectUrl(req, home, msg);
  if (req.method === 'POST') {
   return res.status(403).redirect(dest);
  }
  return res.redirect(dest);
 };
}

/** Remove every row referencing this patient so DELETE FROM tbl_patient succeeds.
 *  Covers ALL confirmed FK tables (from information_schema query) plus extras. */
async function purgePatientRelatedRows(conn, patientId) {
 const pid = patientId;
 const safe = (sql) => conn.query(sql, [pid]).catch(() => {});

 // --- wallet txns (child of tbl_patient_wallet) ---
 await conn.query(
  'DELETE wt FROM tbl_patient_wallet_txn wt INNER JOIN tbl_patient_wallet w ON w.id = wt.wallet_id WHERE w.patient_id = ?',
  [pid]
 ).catch(() => {});

 // --- tables with confirmed FK constraints (23 total from schema) ---
 await safe('DELETE FROM tbl_vital_sign WHERE patient_id = ?');
 await safe('DELETE FROM tbl_prescription WHERE patient_id = ?');
 await safe('DELETE FROM tbl_problem WHERE patient_id = ?');
 await safe('DELETE FROM tbl_patient_identifier WHERE patient_id = ?');
 await safe('DELETE FROM tbl_patient_external_document WHERE patient_id = ?');
 await safe('DELETE FROM tbl_patient_insurance WHERE patient_id = ?');
 await safe('DELETE FROM tbl_patient_medication WHERE patient_id = ?');
 await safe('DELETE FROM tbl_patient_allergy WHERE patient_id = ?');
 await safe('DELETE FROM tbl_medical_result WHERE patient_id = ?');
 await safe('DELETE FROM tbl_lab_result WHERE patient_id = ?');
 await safe('DELETE FROM tbl_consent WHERE patient_id = ?');
 await safe('DELETE FROM tbl_clinical_order WHERE patient_id = ?');
 await safe('DELETE FROM tbl_encounter WHERE patient_id = ?');

 // invoice lines/items before invoice
 await conn.query(
  'DELETE il FROM tbl_invoice_line il INNER JOIN tbl_invoice i ON i.id = il.invoice_id WHERE i.patient_id = ?',
  [pid]
 ).catch(() => {});
 await safe('DELETE FROM tbl_invoice WHERE patient_id = ?');

 // charge depends on admission order
 await safe('DELETE FROM tbl_charge WHERE patient_id = ?');

 // ipd charges (own patient_id + via admission)
 await safe('DELETE FROM tbl_ipd_charge WHERE patient_id = ?');
 await conn.query(
  'DELETE c FROM tbl_ipd_charge c INNER JOIN tbl_admission a ON a.id = c.admission_id WHERE a.patient_id = ?',
  [pid]
 ).catch(() => {});

 // clinical dept alerts (IPD/ER lab-rad notifications)
 await conn
  .query(
   'DELETE ack FROM tbl_clinical_dept_alert_ack ack INNER JOIN tbl_clinical_dept_alert ca ON ca.id = ack.alert_id WHERE ca.patient_id = ?',
   [pid]
  )
  .catch(() => {});
 await safe('DELETE FROM tbl_clinical_dept_alert WHERE patient_id = ?');

 // opd order items & consultations before visits
 await safe('DELETE FROM tbl_opd_order_item WHERE patient_id = ?');
 await safe('DELETE FROM tbl_consultation WHERE patient_id = ?');
 await safe('DELETE FROM tbl_opd_visit WHERE patient_id = ?');

 // admissions (facility + regular)
 await safe('DELETE FROM tbl_facility_admission WHERE patient_id = ?');
 await safe('DELETE FROM tbl_admission WHERE patient_id = ?');

 // payments / billing
 await safe('DELETE FROM tbl_payment_ticket WHERE patient_id = ?');
 await safe('DELETE FROM tbl_billing_document WHERE patient_id = ?');

 // credit
 await conn.query(
  'DELETE ct FROM tbl_credit_transaction ct INNER JOIN tbl_credit_account ca ON ca.id = ct.account_id WHERE ca.patient_id = ?',
  [pid]
 ).catch(() => {});
 await safe('DELETE FROM tbl_credit_account WHERE patient_id = ?');

 // wallet (after txns removed above)
 await safe('DELETE FROM tbl_patient_wallet WHERE patient_id = ?');

 // extra tables with patient_id (no strict FK but present)
 await safe('DELETE FROM tbl_appointment WHERE patient_id = ?');
 await safe('DELETE FROM tbl_radiology_result WHERE patient_id = ?');
 await safe('DELETE FROM tbl_patient_vitals WHERE patient_id = ?');
 await safe('DELETE FROM tbl_lab_order WHERE patient_id = ?');
 await safe('DELETE FROM tbl_radiology_order WHERE patient_id = ?');
 await safe('DELETE FROM tbl_ipd_ward_note WHERE patient_id = ?');
 await safe('DELETE FROM tbl_insurance_claim WHERE patient_id = ?');
 await safe('DELETE FROM tbl_notification_queue WHERE patient_id = ?');
 await safe('DELETE FROM tbl_result_shared_notice WHERE patient_id = ?');
 await safe('DELETE FROM tbl_transaction WHERE patient_id = ?');
 await safe('DELETE FROM tbl_patient_portal WHERE patient_id = ?');
 await safe('UPDATE tbl_bed SET patient_id = NULL WHERE patient_id = ?');
}

// Load modular route files — wrap each so a single bad file doesn't kill
// the whole process. Errors get recorded in BOOT_TRACE / cPanel error log.
function safeMount(label, fn) {
 try { fn(); bootStep(`route-mount:${label}`, 'ok'); }
 catch (e) { bootStep(`route-mount:${label}`, 'fail', e); }
}
/** Skip optional route modules missing on partial deploys (still logs a warning). */
function safeRequireRoute(relPath) {
 try {
  return require(relPath);
 } catch (e) {
  const msg = (e && e.message) || String(e);
  if (e && e.code === 'MODULE_NOT_FOUND' && msg.includes(relPath.replace(/^\.\//, ''))) {
   console.warn(`[HMS] Skipping route ${relPath} — file not on server. Upload it from the repo.`);
   return null;
  }
  throw e;
 }
}
function mountRouteModule(label, relPath, mountFn) {
 safeMount(label, () => {
  const mod = safeRequireRoute(relPath);
  if (mod) mountFn(mod);
 });
}
safeMount('visitingDoctor', () => require('./routes/visitingDoctor')(app, pool, requireAuth, requirePerm));
safeMount('emergency', () => require('./routes/emergency')(app, pool, requireAuth));
safeMount('ipdMed',    () => require('./routes/ipdMed')(app, pool, requireAuth, requirePerm));
safeMount('opdMed',    () => require('./routes/opdMed')(app, pool, requireAuth, requirePerm));
safeMount('deathRegistry', () => require('./routes/deathRegistry')(app, pool, requireAuth, requirePerm));
safeMount('ipdHospitalization', () => require('./routes/ipdHospitalization')(app, pool, requireAuth, requirePerm));
safeMount('labLims', () => require('./routes/labLims')(app, pool, requireAuth, requirePerm));
safeMount('hmsClinical', () => require('./routes/hmsClinical')(app, pool, requireAuth, requirePerm));
safeMount('portals',   () => require('./routes/portals')(app, pool, requireAuth));
safeMount('nursingSupply', () => require('./routes/nursingSupply')(app, pool, requireAuth, requirePerm));
safeMount('clinicalDeptRequisition', () => require('./routes/clinicalDeptRequisition')(app, pool, requireAuth, requirePerm));
safeMount('patientPassport', () => require('./routes/patientPassport')(app, pool, requireAuth, requirePerm));
safeMount('doctorErAlerts', () => require('./routes/doctorErAlerts')(app, pool, requireAuth));
safeMount('procurement', () => require('./routes/procurement')(app, pool, requireAuth, requirePerm));
safeMount('assetManagement', () => require('./routes/assetManagement')(app, pool, requireAuth, requirePerm));
safeMount('pharmacyModule', () => require('./routes/pharmacyModule')(app, pool, requireAuth, requirePerm));
safeMount('pharmacyReporting', () => require('./routes/pharmacyReporting')(app, pool, requireAuth, requirePerm));
safeMount('staff',     () => require('./routes/staff')(app, pool, requireAuth));
safeMount('hmsLicense', () => require('./routes/hmsLicense')(app, pool, requireAuth));
safeMount('integrations', () => require('./routes/integrations')(app, pool));
safeMount('integrationSettings', () => require('./routes/integrationSettings')(app, pool, requireAuth, requireSuperAdmin));
safeMount('hmsDirectorReports', () =>
 require('./routes/hmsDirectorReports')(app, pool, requireAuth)
);
// Payroll moved to standalone Zaizens_PayRoll (C:\Zaizens_PayRoll)
safeMount('internalBusinessRules', () => require('./routes/internalBusinessRules')(app, pool));
safeMount('financialsTrialBalance', () =>
 require('./routes/financialsTrialBalance')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsJournalLoader', () =>
 require('./routes/financialsJournalLoader')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsSyncGl', () =>
 require('./routes/financialsSyncGl')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsGeneralLedger', () =>
 require('./routes/financialsGeneralLedger')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsCashFlow', () =>
 require('./routes/financialsCashFlow')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsAccountsReceivable', () =>
 require('./routes/financialsAccountsReceivable')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsAccountsPayable', () =>
 require('./routes/financialsAccountsPayable')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsTreasury', () =>
 require('./routes/financialsTreasury')(app, pool, requireAuth, requirePerm)
);
mountRouteModule('financialsBankReconciliation', './routes/financialsBankReconciliation', (m) =>
 m(app, pool, requireAuth, requirePerm)
);
mountRouteModule('financialsStatementMonthly', './routes/financialsStatementMonthly', (m) =>
 m(app, pool, requireAuth, requirePerm)
);
safeMount('financialsYearEnd', () =>
 require('./routes/financialsYearEnd')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsChartOfAccounts', () =>
 require('./routes/financialsChartOfAccounts')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsJournalDiagnostics', () =>
 require('./routes/financialsJournalDiagnostics')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsJournal', () => require('./routes/financialsJournal')(app, pool, requireAuth));
safeMount('financialsLivreJournal', () => require('./routes/financialsLivreJournal')(app, pool, requireAuth));
safeMount('financialsBalanceSheet', () =>
 require('./routes/financialsBalanceSheet')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsAccountingAdmin', () =>
 require('./routes/financialsAccountingAdmin')(app, pool, requireAuth, requirePerm)
);
safeMount('financialsExpenses', () => require('./routes/financialsExpenses')(app, pool, requireAuth));
safeMount('financialsPlatformOverview', () =>
 require('./routes/financialsPlatformOverview')(app, pool, requireAuth)
);
safeMount('hmsDocs', () => require('./routes/hmsDocs')(app, requireAuth));
safeMount('financialsStubs', () => require('./routes/financialsStubs')(app, pool, requireAuth, requirePerm));
safeMount('paymentValidity', () => require('./routes/paymentValidity')(app, pool, requireAuth, requirePerm));
safeMount('financialsHub', () => require('./routes/financialsHub')(app, pool, requireAuth, requirePerm));
safeMount('financialsSettings', () =>
 require('./routes/financialsSettings')(app, pool, requireAuth, requirePerm)
);
safeMount('maternity', () => require('./routes/maternity')(app, pool, requireAuth, requirePerm));
safeMount('vaccination', () => require('./routes/vaccination')(app, pool, requireAuth, requirePerm));

//  -  Æ’ ============================== Æ’ ============================== Æ’ === ¬ ROUTES === Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ === ¬

// LOGIN PAGE
app.get('/', (req, res) => {
 try {
  if (req.session && req.session.user) {
   const _lr = String(req.session.user.role || '');
   if (_lr === '99') return res.redirect('/super-admin');
   if (_lr === '1') return res.redirect('/hms');
   const _ld = aclLayout.staffHomeUrlFromSession(req.session);
   return res.redirect(_ld || '/hms');
  }
  const msg = hmsI18n.translateQueryMsg(res, req.query.msg, req.query.msgKey);
  const err = hmsI18n.translateFlashErr(res, req.query.err, req.query.errKey, req.query);
  const lang = res.locals.lang || 'en';
  res.render('login', {
   title: pageTitle(res, 'document_titles.login', 'Login — ZAIZENS'),
   pageData: {
    error: err,
    msg,
    brand: res.locals.brand || {},
    loginLabels: hmsI18n.getResourceBundle(lang, 'login'),
   },
  });
 } catch (e) {
  console.error('[login GET]', e && e.stack ? e.stack : e);
  if (typeof _writeCrash === 'function') _writeCrash('login-get', e);
  res.status(200).type('text/html; charset=UTF-8').send(
   '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Login — ZAIZENS</title></head>' +
   '<body style="font-family:system-ui,sans-serif;padding:2rem"><h1>ZAIZENS</h1>' +
   '<p>Login page could not render. Check <code>views/login.ejs</code> and server logs.</p>' +
   '<p><small>' +
   String(e && e.message ? e.message : e).replace(/</g, '&lt;') +
   '</small></p></body></html>'
  );
 }
});

// LOGIN POST
app.post('/login', async (req, res) => {
 const { username, password } = req.body;
 const visitingDoctor = require('./lib/visitingDoctor');
 if (visitingDoctor.isVisitingDoctorUsername(username)) {
  return res.redirect('/visiting-doctor?err=' + encodeURIComponent('Visiting doctors must sign in from the Visiting Doctor page.'));
 }
 try {
 const loginSelectSql =
  'SELECT id, first_name, last_name, username, password, role, photo_path, specialisation, profile_emoji, gender FROM tbl_employee WHERE username = ? AND status = 1 LIMIT 1';
 let rows;
 try {
  [rows] = await pool.query(loginSelectSql, [username]);
 } catch (selectErr) {
  if (selectErr && selectErr.code === 'ER_BAD_FIELD_ERROR') {
   await require('./lib/ensureEmployeeHrSchema')(pool);
   [rows] = await pool.query(loginSelectSql, [username]);
  } else {
   throw selectErr;
  }
 }

 if (rows.length === 0) {
 return res.render('login', {
  title: pageTitle(res, 'document_titles.login', 'Login — ZAIZENS'),
  pageData: {
   error: res.locals.t('invalid_credentials', { ns: 'login', defaultValue: 'Invalid username or password.' }),
   msg: null,
   brand: res.locals.brand || {},
   loginLabels: hmsI18n.getResourceBundle(res.locals.lang || 'en', 'login'),
  },
 });
 }

 const user = rows[0];
 const storedHash = (user.password || '').toString();
 let isValid = false;

 // 2. Hybrid Verification Logic
 if (storedHash.startsWith('$2y$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
 // Modern Bcrypt Hash (PHP $2y$ → Node bcryptjs $2a$)
 const hashForCompare = storedHash.startsWith('$2y$')
  ? '$2a$' + storedHash.slice(4)
  : storedHash;
 isValid = await bcrypt.compare(password, hashForCompare);
 } else {
 // Legacy Plaintext Comparison
 isValid = (password === storedHash);
 }

 if (!isValid) {
 return res.render('login', {
  title: pageTitle(res, 'document_titles.login', 'Login — ZAIZENS'),
  pageData: {
   error: res.locals.t('invalid_credentials', { ns: 'login', defaultValue: 'Invalid username or password.' }),
   msg: null,
   brand: res.locals.brand || {},
   loginLabels: hmsI18n.getResourceBundle(res.locals.lang || 'en', 'login'),
  },
 });
 }

 // 3. Establish Session (staff — clear any patient portal session)
 delete req.session.portalPatientId;
 req.session.user = {
 id: user.id,
 name: user.first_name + ' ' + user.last_name,
 username: user.username,
 role: user.role,
 photo: user.photo_path || null,
 specialisation: user.specialisation || null,
 profile_emoji: user.profile_emoji || null,
 gender: user.gender || null,
 };
 req.session.userId = user.id;
 setLoginActivity(req);
 if (String(user.role) !== '1' && String(user.role) !== '99') {
  try {
   const [permRows] = await pool.query(
    `SELECT p.code FROM tbl_acl_role_permission rp
     JOIN tbl_acl_permission p ON p.id = rp.permission_id
     WHERE rp.role = ?`,
    [String(user.role)]
   );
   req.session.userPerms = (permRows || []).map((p) => p.code);
  } catch (_) {
   req.session.userPerms = [];
  }
 } else {
  delete req.session.userPerms;
 }

 try {
  const { attachCashierToSession } = require('./lib/cashierIdentity');
  await attachCashierToSession(pool, req, { forceAssign: true });
 } catch (_) {}

 // 4. Redirect based on role
 // Super Admin === Æ’ === Æ’ ============================== /super-admin console
 // Admin (1) === Æ’ === Æ’ ============================== /dashboard (full admin view)
 // All other roles === Æ’ === Æ’ ============================== their dedicated portal
 if (user.role == 99) return res.redirect('/super-admin');
 if (user.role == 1)  return res.redirect('/hms');
 // Primary: home portal from Access Control (tbl_acl_role_portal via aclLayout).
 const homeOpts = { specialisation: user.specialisation || null };
 let dest = aclLayout.staffHomeUrl(String(user.role), homeOpts);
 if (!dest && typeof aclLayout.ensurePortalCacheReady === 'function') {
  await aclLayout.ensurePortalCacheReady();
  dest = aclLayout.staffHomeUrl(String(user.role), homeOpts);
 }
 if (dest) return res.redirect(dest);
 return res.redirect('/profile?err=' + encodeURIComponent(flashT(res, 'flash.no_home_portal_is_assigned_for_your_role_an_administrator_must_set_role_')));
 } catch (err) {
 console.error('Login error:', err && err.stack ? err.stack : err);
 if (typeof _writeCrash === 'function') _writeCrash('login-post', err);
 res.render('login', {
  title: pageTitle(res, 'document_titles.login', 'Login — ZAIZENS'),
  pageData: {
   error: res.locals.t('server_error', { ns: 'login', defaultValue: 'A server error occurred. Please try again.' }),
   msg: null,
   brand: res.locals.brand || {},
   loginLabels: hmsI18n.getResourceBundle(res.locals.lang || 'en', 'login'),
  },
 });
 }
});

// SUPER ADMIN CONSOLE
// SUPER ADMIN CONSOLE === Æ’ ===   role 99 only (PHP parity: hms_require_super_admin)
const appProductMode = require('./lib/appProductMode');

function requireSuperAdmin(req, res, next) {
 if (String(req.session.user?.role) !== '99') return res.redirect('/hms');
 return next();
}

app.get('/super-admin', requireAuth, requireSuperAdmin, async (req, res) => {
 try {
 try {
  const { ensureDeploymentSchema } = require('./lib/ensureDeploymentSchema');
  await ensureDeploymentSchema(pool);
 } catch (e) {
  console.warn('super-admin ensureDeploymentSchema:', e.message);
 }
 await deploymentConfig.loadDeployment(pool);
 const appSettings = await appProductMode.loadAppSettings(pool);
 const deployment = deploymentConfig.getDeployment();
 const displayMode = deployment.productMode || appSettings.product_mode || 'full';
 const legacyCtx = await deploymentConfig.getLegacyEditorContext(pool).catch(() => null);
 const legacyOverrideCount = legacyCtx
  ? deploymentModuleEditor.countOverrides(legacyCtx.moduleOverrides)
  : 0;
 const deploymentProfilesRaw = await deploymentConfig.listProfiles(pool).catch(() => []);
 const deploymentCatalog = require('./lib/deploymentCatalog');
 const deploymentI18n = require('./lib/deploymentI18n');
 const deploymentProfiles = deploymentProfilesRaw.map((p) => ({
  ...p,
  tileMeta: deploymentCatalog.profileMeta(p.name),
 }));
 const tFn = res.locals.t;
 const activeProfileIds =
  deployment.profileIds && deployment.profileIds.length
   ? deployment.profileIds
   : deploymentConfig.parseProfileIdsJson(appSettings.active_deployment_profile_ids);
 const [facilities] = await pool.query('SELECT * FROM tbl_facility').catch(() => [[]]);
 const [logs] = await pool.query('SELECT * FROM tbl_audit_log ORDER BY id DESC LIMIT 50').catch(() => [[]]);
 const roleCatalog = require('./lib/roleCatalog');
 const [rolesRaw] = await pool.query('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)').catch(() => [[]]);
 const roles = (rolesRaw || []).map((r) => ({
  ...r,
  tileMeta: roleCatalog.roleMeta(r.role, r.title),
 }));
 const hmsStaffAccountGuard = require('./lib/hmsStaffAccountGuard');
 const totalStaff = await hmsStaffAccountGuard.countStaffHeadcount(pool, { activeOnly: false });
 const activeStaff = await hmsStaffAccountGuard.countStaffHeadcount(pool, { activeOnly: true });
 res.render('super-admin', {
 title: pageTitle(res, 'document_titles.super_admin', 'Super Admin — ZAIZENS'),
 facilities: facilities || [],
 logs: logs || [],
 roles: roles || [],
 totalStaff: totalStaff,
 activeStaff: activeStaff,
 productMode: displayMode,
 productModeLabel: deploymentI18n.deploymentModeLabel(displayMode, tFn),
 deployment,
 deploymentProfiles: deploymentI18n.localizeDeploymentProfiles(deploymentProfiles, tFn),
 deploymentModes: deploymentI18n.localizeDeploymentModes(
  deploymentCatalog.DEPLOYMENT_MODES,
  tFn
 ),
 activeProfileIds,
 activeProfileId: appSettings.active_deployment_profile_id || null,
 legacyOverrideCount,
 routeGuardCount: aclRouteRegistry.getRegistrySize(),
 flash: req.query.msg || null,
 error: req.query.err || null,
 });
 } catch (err) {
 console.error(err);
 renderAppError(res, 500, 'page.super_admin_failure', 'Super Admin console failure.')
 }
});

app.post('/super-admin/deployment/activate-profiles', requireAuth, requireSuperAdmin, async (req, res) => {
 let ids = req.body.profile_ids;
 if (!ids) ids = [];
 if (!Array.isArray(ids)) ids = [ids];
 try {
  const result = await deploymentConfig.activateProfiles(pool, ids);
  try { await aclLayout.refresh(); } catch (_) {}
  const names = result.profiles.map((p) => p.name).join(' + ');
  const uid = req.session.user?.id || 0;
  const facId = req.session.user?.facility_id || req.session.user?.facilityId || 1;
  await pool.query(
   `INSERT INTO tbl_audit_log (user_id, facility_id, action, entity, entity_id, ip, user_agent, payload_json)
    VALUES (?, ?, 'deployment.profiles.activate', 'deployment_profile', ?, ?, ?, ?)`,
   [
    uid,
    facId,
    result.ids[0] || 0,
    req.ip || null,
    String(req.headers['user-agent'] || '').slice(0, 512),
    JSON.stringify({ profile_ids: result.ids, names }),
   ]
  ).catch(() => {});
  return res.redirect(
   '/super-admin?msg=' + encodeURIComponent(flashT(res, 'flash.activated_deployment_profiles', { names }))
  );
 } catch (err) {
  console.error('deployment activate-profiles:', err);
  return res.redirect('/super-admin?err=' + encodeURIComponent(err.message || 'Could not activate profiles.'));
 }
});

app.post('/super-admin/deployment/activate', requireAuth, requireSuperAdmin, async (req, res) => {
 const profileId = parseInt(req.body.profile_id, 10);
 if (!profileId) {
  return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.select_a_deployment_profile')));
 }
 try {
  const result = await deploymentConfig.activateProfiles(pool, [profileId]);
  try { await aclLayout.refresh(); } catch (_) {}
  const names = result.profiles.map((p) => p.name).join(' + ');
  return res.redirect('/super-admin?msg=' + encodeURIComponent(flashT(res, 'flash.activated_deployment_profiles', { names })));
 } catch (err) {
  return res.redirect('/super-admin?err=' + encodeURIComponent(err.message || 'Could not activate profile.'));
 }
});

app.post('/super-admin/deployment/use-legacy', requireAuth, requireSuperAdmin, async (req, res) => {
 try {
  const settings = await appProductMode.loadAppSettings(pool);
  const slicesJson =
   settings.product_slices || JSON.stringify(appProductMode.productSlicesForMode('full'));
  const mode = appProductMode.legacyModeFromSlices(slicesJson);
  await deploymentConfig.activateLegacyMode(pool, mode, slicesJson);
  try { await aclLayout.refresh(); } catch (_) {}
  return res.redirect('/super-admin?msg=' + encodeURIComponent(flashT(res, 'flash.using_legacy_global_deployment_mode')));
 } catch (err) {
  return res.redirect('/super-admin?err=' + encodeURIComponent(err.message || 'Failed.'));
 }
});

app.get('/super-admin/deployment/legacy/modules', requireAuth, requireSuperAdmin, async (req, res) => {
 try {
  const legacy = await deploymentConfig.getLegacyEditorContext(pool);
  const catalogue = await deploymentModuleEditor.loadNavCatalogue(pool);
  const editor = deploymentModuleEditor.buildEditorModel(
   catalogue,
   legacy.slices,
   legacy.moduleOverrides
  );
  res.render('super-admin-deployment-modules', {
   title: pageTitle(res, 'document_titles.legacy_module_overrides', 'Legacy module overrides — {{mode}}', { mode: legacy.productMode }),
   isLegacy: true,
   formPostUrl: '/super-admin/deployment/legacy/modules',
   profile: {
    name: 'Legacy — ' + legacy.productMode,
    slices_json: legacy.slices_json,
   },
   editor,
   overrideCount: deploymentModuleEditor.countOverrides(legacy.moduleOverrides),
   activeProfileId: legacy.activeProfileId,
   legacyActive: legacy.legacyActive,
   productMode: legacy.productMode,
   deployment: deploymentConfig.getDeployment(),
   flash: req.query.msg || null,
   error: req.query.err || null,
  });
 } catch (err) {
  console.error('legacy deployment modules GET:', err);
  return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.could_not_load_legacy_module_editor')));
 }
});

app.post('/super-admin/deployment/legacy/modules', requireAuth, requireSuperAdmin, async (req, res) => {
 const back = '/super-admin/deployment/legacy/modules';
 try {
  const legacy = await deploymentConfig.getLegacyEditorContext(pool);
  let modulesObj = {};
  if (String(req.body.action || '') === 'clear_all') {
   modulesObj = {};
  } else {
   const raw = deploymentModuleEditor.parseOverridesFromBody(req.body);
   modulesObj = deploymentModuleEditor.pruneOverrides(legacy.slices, raw);
  }
  await deploymentConfig.saveLegacyModules(pool, modulesObj);
  if (req.body.use_legacy === '1' && legacy.activeProfileId) {
   await deploymentConfig.activateLegacyMode(
    pool,
    legacy.productMode,
    legacy.slices_json
   );
  }
  try { await aclLayout.refresh(); } catch (_) {}
  const uid = req.session.user?.id || 0;
  const facId = req.session.user?.facility_id || req.session.user?.facilityId || 1;
  const keyCount = Object.keys(modulesObj).length;
  await pool.query(
   `INSERT INTO tbl_audit_log (user_id, facility_id, action, entity, entity_id, ip, user_agent, payload_json)
    VALUES (?, ?, 'deployment.legacy.modules', 'app_settings', 1, ?, ?, ?)`,
   [
    uid,
    facId,
    req.ip || null,
    String(req.headers['user-agent'] || '').slice(0, 512),
    JSON.stringify({
     productMode: legacy.productMode,
     overrideCount: keyCount,
     cleared: req.body.action === 'clear_all',
     switchedToLegacy: req.body.use_legacy === '1',
    }),
   ]
  ).catch(() => {});
  let msg =
   String(req.body.action || '') === 'clear_all'
    ? 'Cleared all legacy module overrides.'
    : 'Saved ' + keyCount + ' legacy module override(s).';
  if (req.body.use_legacy === '1' && legacy.activeProfileId) {
   msg += ' Legacy global mode is now active.';
  }
  return res.redirect(back + '?msg=' + encodeURIComponent(msg));
 } catch (err) {
  console.error('legacy deployment modules POST:', err);
  return res.redirect(back + '?err=' + encodeURIComponent(err.message || 'Could not save legacy module overrides.'));
 }
});

app.get('/super-admin/deployment/:id/modules', requireAuth, requireSuperAdmin, async (req, res) => {
 const profileId = parseInt(req.params.id, 10);
 if (!profileId) {
  return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.invalid_deployment_profile')));
 }
 try {
  const profile = await deploymentConfig.getProfile(pool, profileId);
  if (!profile) {
   return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.deployment_profile_not_found')));
  }
  const catalogue = await deploymentModuleEditor.loadNavCatalogue(pool);
  const editor = deploymentModuleEditor.buildEditorModel(
   catalogue,
   profile.slices,
   profile.moduleOverrides
  );
  const appSettings = await appProductMode.loadAppSettings(pool);
  res.render('super-admin-deployment-modules', {
   title: pageTitle(res, 'document_titles.module_overrides', 'Module overrides — {{name}}', { name: profile.name }),
   isLegacy: false,
   formPostUrl: '/super-admin/deployment/' + profileId + '/modules',
   profile,
   editor,
   overrideCount: deploymentModuleEditor.countOverrides(profile.moduleOverrides),
   activeProfileId: appSettings.active_deployment_profile_id || null,
   legacyActive: false,
   deployment: deploymentConfig.getDeployment(),
   flash: req.query.msg || null,
   error: req.query.err || null,
  });
 } catch (err) {
  console.error('deployment modules GET:', err);
  return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.could_not_load_module_editor')));
 }
});

app.post('/super-admin/deployment/:id/modules', requireAuth, requireSuperAdmin, async (req, res) => {
 const profileId = parseInt(req.params.id, 10);
 const back = '/super-admin/deployment/' + profileId + '/modules';
 if (!profileId) {
  return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.invalid_deployment_profile')));
 }
 try {
  const profile = await deploymentConfig.getProfile(pool, profileId);
  if (!profile) {
   return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.deployment_profile_not_found')));
  }
  let modulesObj = {};
  if (String(req.body.action || '') === 'clear_all') {
   modulesObj = {};
  } else {
   const raw = deploymentModuleEditor.parseOverridesFromBody(req.body);
   modulesObj = deploymentModuleEditor.pruneOverrides(profile.slices, raw);
  }
  await deploymentConfig.saveProfileModules(pool, profileId, modulesObj);
  try { await aclLayout.refresh(); } catch (_) {}
  if (req.body.activate_after === '1') {
   await deploymentConfig.activateProfile(pool, profileId);
   try { await aclLayout.refresh(); } catch (_) {}
  }
  const uid = req.session.user?.id || 0;
  const facId = req.session.user?.facility_id || req.session.user?.facilityId || 1;
  const keyCount = Object.keys(modulesObj).length;
  await pool.query(
   `INSERT INTO tbl_audit_log (user_id, facility_id, action, entity, entity_id, ip, user_agent, payload_json)
    VALUES (?, ?, 'deployment.profile.modules', 'deployment_profile', ?, ?, ?, ?)`,
   [
    uid,
    facId,
    profileId,
    req.ip || null,
    String(req.headers['user-agent'] || '').slice(0, 512),
    JSON.stringify({ name: profile.name, overrideCount: keyCount, cleared: req.body.action === 'clear_all' }),
   ]
  ).catch(() => {});
  const msg =
   String(req.body.action || '') === 'clear_all'
    ? 'Cleared all module overrides for ' + profile.name + '.'
    : 'Saved ' + keyCount + ' module override(s) for ' + profile.name + '.';
  return res.redirect(back + '?msg=' + encodeURIComponent(msg));
 } catch (err) {
  console.error('deployment modules POST:', err);
  return res.redirect(back + '?err=' + encodeURIComponent(err.message || 'Could not save module overrides.'));
 }
});

app.post('/super-admin/set-mode', requireAuth, requireSuperAdmin, async (req, res) => {
 const mode = String(req.body.product_mode || '').trim();
 if (!appProductMode.isValidProductMode(mode)) {
  return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.invalid_product_deployment_mode')));
 }
 try {
  const prev = await appProductMode.loadAppSettings(pool);
  const prevMode = prev.product_mode || 'full';
  const prevProfileId = prev.active_deployment_profile_id || null;
  const { productMode: savedMode, slicesJson } = await deploymentConfig.applyLegacyDeploymentMode(pool, mode);
  try { await aclLayout.refresh(); } catch (_) {}
  const uid = req.session.user?.id || 0;
  const facId = req.session.user?.facility_id || req.session.user?.facilityId || 1;
  const payload = JSON.stringify({
   from: prevMode,
   to: savedMode,
   clearedProfileId: prevProfileId,
   product_slices: slicesJson,
  });
  await pool.query(
   `INSERT INTO tbl_audit_log (user_id, facility_id, action, entity, entity_id, ip, user_agent, payload_json)
    VALUES (?, ?, 'app_settings.product_mode', 'app_settings', 1, ?, ?, ?)`,
   [uid, facId, req.ip || null, String(req.headers['user-agent'] || '').slice(0, 512), payload]
  ).catch((e) => console.warn('super-admin set-mode audit:', e.message));
  const label = appProductMode.productModeLabel(savedMode);
  return res.redirect('/super-admin?msg=' + encodeURIComponent(flashT(res, 'flash.deployment_saved', { label })));
 } catch (err) {
  console.error('super-admin set-mode:', err);
  return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.could_not_save_deployment_mode', { message: err.message || '' })));
 }
});

function parseFacilityBody(body) {
 const code = String(body.code || '').trim().toUpperCase().slice(0, 32);
 const name = String(body.name || '').trim().slice(0, 250);
 const address = String(body.address || '').trim() || null;
 const timezone = String(body.timezone || 'UTC').trim().slice(0, 64) || 'UTC';
 const status = Number(body.status) === 0 ? 0 : 1;
 return { code, name, address, timezone, status };
}

async function auditFacilityAction(req, action, entityId, payload) {
 const uid = req.session.user?.id || 0;
 const facId = req.session.user?.facility_id || req.session.user?.facilityId || 1;
 await pool.query(
  `INSERT INTO tbl_audit_log (user_id, facility_id, action, entity, entity_id, ip, user_agent, payload_json)
   VALUES (?, ?, ?, 'facility', ?, ?, ?, ?)`,
  [uid, facId, action, entityId, req.ip || null, String(req.headers['user-agent'] || '').slice(0, 512), JSON.stringify(payload || {})]
 ).catch((e) => console.warn('facility audit:', e.message));
}

function renderFacilityForm(res, opts) {
 return res.render('facility-edit', {
  title: pageTitle(res, opts.isNew ? 'document_titles.add_facility' : 'document_titles.edit_facility', opts.isNew ? 'Add Facility — ZAIZENS' : 'Edit Facility — ZAIZENS'),
  isNew: !!opts.isNew,
  facility: opts.facility || { code: '', name: '', address: '', timezone: 'UTC', status: 1 },
  flash: opts.flash || null,
  error: opts.error || null,
 });
}

app.get('/facilities', requireAuth, requireSuperAdmin, (req, res) => {
 const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
 return res.redirect(301, '/super-admin' + q);
});

app.get('/facilities/add', requireAuth, requireSuperAdmin, (req, res) => {
 renderFacilityForm(res, { isNew: true, flash: req.query.msg, error: req.query.err });
});

app.post('/facilities/add', requireAuth, requireSuperAdmin, async (req, res) => {
 const data = parseFacilityBody(req.body);
 if (!data.code || !data.name) {
  return renderFacilityForm(res, { isNew: true, error: 'Site code and facility name are required.' });
 }
 try {
  const [r] = await pool.query(
   'INSERT INTO tbl_facility (code, name, address, timezone, status) VALUES (?, ?, ?, ?, ?)',
   [data.code, data.name, data.address, data.timezone, data.status]
  );
  const id = r.insertId;
  await auditFacilityAction(req, 'facility.create', id, data);
  return res.redirect('/super-admin?msg=' + encodeURIComponent(flashT(res, 'flash.facility_created', { name: data.name })));
 } catch (err) {
  const dup = err.code === 'ER_DUP_ENTRY' || err.errno === 1062;
  return renderFacilityForm(res, {
   isNew: true,
   facility: data,
   error: dup ? 'That site code is already in use.' : ('Could not create facility. ' + (err.message || '')),
  });
 }
});

app.get('/facilities/:id/edit', requireAuth, requireSuperAdmin, async (req, res) => {
 const id = parseInt(req.params.id, 10);
 if (!id) return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.invalid_facility_id')));
 try {
  const [rows] = await pool.query('SELECT * FROM tbl_facility WHERE id=? LIMIT 1', [id]);
  if (!rows || !rows[0]) {
   return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.facility_not_found')));
  }
  return renderFacilityForm(res, {
   isNew: false,
   facility: rows[0],
   flash: req.query.msg,
   error: req.query.err,
  });
 } catch (err) {
  console.error('facility edit GET:', err);
  return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.could_not_load_facility')));
 }
});

app.post('/facilities/:id/edit', requireAuth, requireSuperAdmin, async (req, res) => {
 const id = parseInt(req.params.id, 10);
 if (!id) return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.invalid_facility_id')));
 const data = parseFacilityBody(req.body);
 if (!data.name) {
  return renderFacilityForm(res, { isNew: false, facility: { ...data, id }, error: 'Facility name is required.' });
 }
 try {
  const [rows] = await pool.query('SELECT id, code FROM tbl_facility WHERE id=? LIMIT 1', [id]);
  if (!rows || !rows[0]) {
   return res.redirect('/super-admin?err=' + encodeURIComponent(flashT(res, 'flash.facility_not_found')));
  }
  data.code = rows[0].code;
  await pool.query(
   'UPDATE tbl_facility SET name=?, address=?, timezone=?, status=? WHERE id=?',
   [data.name, data.address, data.timezone, data.status, id]
  );
  await auditFacilityAction(req, 'facility.update', id, data);
  return res.redirect('/super-admin?msg=' + encodeURIComponent(flashT(res, 'flash.facility_saved', { name: data.name })));
 } catch (err) {
  console.error('facility edit POST:', err);
  return renderFacilityForm(res, {
   isNew: false,
   facility: { ...data, id, code: data.code },
   error: 'Could not save facility. ' + (err.message || ''),
  });
 }
});

// LOGOUT
app.get('/logout', (req, res) => {
 const reason = String(req.query.reason || '');
 req.session.destroy(() => {
  if (reason === 'idle') {
   const mins = Math.max(1, Math.round(idleTimeoutMs() / 60000));
   return res.redirect(
    '/?msg=' +
     encodeURIComponent(`Signed out after ${mins} minute${mins === 1 ? '' : 's'} of inactivity. Please sign in again.`)
   );
  }
  res.redirect('/');
 });
});

// MY PROFILE === Æ’ ===   GET (view own profile)
async function profileHandler(req, res) {
 const uid = req.session.user?.id;
 try {
 const [rows] = await pool.query('SELECT * FROM tbl_employee WHERE id=? LIMIT 1', [uid]);
 const emp = rows?.[0] || null;
 if (!emp) return res.redirect('/dashboard?err=' + encodeURIComponent(flashT(res, 'flash.profile_not_found')))
 const [roles] = await pool.query('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)').catch(()=>[[],[]]);
 res.render('my-profile', {
 title: pageTitle(res, 'document_titles.profile', 'My Profile — ZAIZENS'),
 emp,
 roles: roles || [],
 flash: req.query.msg || null,
 error: req.query.err || null
 });
 } catch(e) {
 console.error('Profile error:', e.message);
 res.redirect('/dashboard?err=' + encodeURIComponent(e.message));
 }
}
app.get('/profile', requireAuth, profileHandler);
app.get('/my-profile', requireAuth, profileHandler);

// MY PROFILE === Æ’ ===   POST (update own profile / change password)
async function profilePostHandler(req, res) {
 const uid = req.session.user?.id;
 const { first_name, last_name, emailid, phone, pwd, bio } = req.body;
 try {
 let passSQL = '', passParams = [];
 if (pwd && pwd.trim()) {
 const bcrypt = require('bcryptjs');
 const hash = await bcrypt.hash(pwd.trim(), 10);
 passSQL = 'password=?,';
 passParams = [hash];
 }
 await pool.query(
 `UPDATE tbl_employee SET first_name=?,last_name=?,emailid=?,phone=?,${passSQL}bio=? WHERE id=?`,
 [first_name, last_name, emailid, phone, ...passParams, bio||'', uid]
 );
 // Update session name
 req.session.user.name = first_name + ' ' + last_name;
 res.redirect('/profile?msg=' + encodeURIComponent(flashT(res, 'flash.profile_updated_successfully')))
 } catch(e) {
 res.redirect('/profile?err=' + encodeURIComponent(e.message));
 }
}
app.post('/profile', requireAuth, requirePerm('profile.self.write'), profilePostHandler);
app.post('/my-profile', requireAuth, requirePerm('profile.self.write'), profilePostHandler);


// DASHBOARD === Æ’ ===   Admin (role=1) and all other staff land here
// PHP parity: dashboard.php (clinical dashboard)
app.get('/dashboard', requireAuth, requirePerm('dashboard.read', '*'), async (req, res) => {
 try {
 const sq = async (sql, p=[]) => { try { const [r] = await pool.query(sql,p); return r||[]; } catch(e){ return []; }};

 // KPI stats
 const hmsClinicalHub = require('./lib/hmsClinicalHub');
 const hubLive = await hmsClinicalHub.getHubStats(pool).catch(() => ({}));
 const hmsDoctorStaff = require('./lib/hmsDoctorStaff');
 const doctorCount = await hmsDoctorStaff.countActiveDoctors(pool);
 const pats = await sq('SELECT COUNT(*) AS total FROM tbl_patient WHERE status=1');
 const appts = await sq('SELECT COUNT(*) AS total FROM tbl_appointment WHERE status=1');
 const inpats  = await sq("SELECT COUNT(*) AS total FROM tbl_patient WHERE patient_type='InPatient' AND status=1");

 // Chart: last 7 days patient registrations
 const chartLabels = [], chartValues = [];
 for (let i = 6; i >= 0; i--) {
 const d = new Date(); d.setDate(d.getDate() - i);
 const day = d.toISOString().split('T')[0];
 chartLabels.push(day);
 const cnt = await sq("SELECT COUNT(*) AS c FROM tbl_patient WHERE status=1 AND DATE(created_at)=?",[day]);
 chartValues.push(cnt[0]?.c || 0);
 }

 // Recent data
 const recentPatients = await sq('SELECT id,first_name,last_name,email,phone,patient_type FROM tbl_patient WHERE status=1 ORDER BY id DESC LIMIT 5');
 const recentAppts = await sq('SELECT patient_name,doctor,date,time,department FROM tbl_appointment WHERE status=1 ORDER BY id DESC LIMIT 6');
 const recentDoctors = await hmsDoctorStaff.fetchActiveDoctors(pool).catch(() => []);

 // Emergency patients (today's OPD visits in Emergency dept)
 const today = new Date().toISOString().split('T')[0];
 const erRows = await sq(
 "SELECT v.id, v.queue_status, p.first_name, p.last_name, v.queue_started_at FROM tbl_opd_visit v JOIN tbl_patient p ON p.id=v.patient_id WHERE v.visit_date=? AND v.department LIKE '%Emergency%' AND v.queue_status NOT IN ('completed','cancelled') ORDER BY v.queue_started_at DESC",
 [today]
 ).catch(()=>[]);
 const admitRows = await sq(
 "SELECT a.id, p.first_name, p.last_name, a.admitted_at FROM tbl_admission a JOIN tbl_patient p ON p.id=a.patient_id WHERE a.discharged_at IS NULL AND a.admitting_department LIKE '%Emergency%' ORDER BY a.admitted_at DESC"
 ).catch(()=>[]);
 const erPatients = [
 ...erRows,
 ...admitRows.map(r => ({...r, queue_status:'admitted', queue_started_at:r.admitted_at}))
 ];

 res.render('dashboard', {
 title: pageTitle(res, 'document_titles.dashboard', 'Dashboard — ZAIZENS'),
 pageData: {
  stats: {
   doctors: doctorCount,
   patients: pats[0]?.total || 0,
   appointments: appts[0]?.total || 0,
   inpatients: inpats[0]?.total || 0,
   outpatients: (pats[0]?.total || 0) - (inpats[0]?.total || 0),
   opd_open: hubLive.opd_open || 0,
   revenue_today: hubLive.revenue_today || 0,
   lab_open: hubLive.lab_open || 0,
   rad_open: hubLive.rad_open || 0,
  },
  chartLabels,
  chartValues,
  recentPatients,
  recentAppts,
  recentDoctors: recentDoctors.slice(0, 5),
  erPatients,
  flash: req.query.msg || null,
  uiVis: buildAclUiVis(res, [
   'dash.btn.new',
   'dash.link.lobby', 'dash.link.hms_hub', 'dash.link.reports', 'dash.link.front_desk', 'dash.link.wards',
   'dash.card.patients', 'dash.card.appointments', 'dash.card.inpatients', 'dash.card.doctors',
   'dash.card.emergencies', 'dash.card.opd_queue', 'dash.card.maternity', 'dash.card.laboratory',
   'dash.card.pharmacy', 'dash.card.cashier', 'dash.card.radiology',
   'dash.stat.opd_open', 'dash.stat.revenue_today', 'dash.stat.lab_open', 'dash.stat.rad_open',
   'dash.panel.er_list', 'dash.panel.chart', 'dash.panel.recent_appts', 'dash.panel.new_patients', 'dash.panel.doctors_duty',
  ]),
 },
 });
 } catch (err) {
 console.error('Dashboard error:', err.message);
 renderAppError(res, 500, 'page.load_dashboard', 'Could not load dashboard.', { detail: err.message })
 }
});



// PATIENTS LIST — staff with patient ACL only
app.get('/patients', requireAuth, requirePerm('patient.read','patient.write'), async (req, res) => {
 try {
  const ensurePatientCodeSchema = require('./lib/ensurePatientCodeSchema');
  await ensurePatientCodeSchema(pool).catch((e) => {
   console.warn('ensurePatientCodeSchema:', e.message);
  });
  const [[countRow]] = await pool.query(
   'SELECT COUNT(*) AS total FROM tbl_patient WHERE COALESCE(status, 1) = 1'
  ).catch(() => [[{ total: 0 }]]);
  const patientTotal = parseInt(String(countRow?.total ?? 0), 10) || 0;
  const PATIENT_LIST_CAP = 2500;
  const [patients] = await pool.query(
   `SELECT id, patient_code, first_name, last_name, email, phone, gender, patient_type, created_at
    FROM tbl_patient WHERE COALESCE(status, 1) = 1 ORDER BY id DESC LIMIT ?`,
   [PATIENT_LIST_CAP]
  ).catch(() => [[]]);
  const list = Array.isArray(patients) ? patients : [];
  const perms = res.locals.userPerms || [];
  const canWrite = perms.includes('*') || perms.includes('patient.write');
  const hmsStaffAccountGuard = require('./lib/hmsStaffAccountGuard');
  const userRole = String(req.session.user?.role ?? '');
  const canDeletePatient = hmsStaffAccountGuard.canDeletePatientAccount(userRole);
  res.render('patients', {
   title: pageTitle(res, 'document_titles.patients', 'Patients — ZAIZENS'),
   pageData: {
    patients: list,
    patientTotal,
    flash: req.query.msg || null,
    error: req.query.err || null,
    userPerms: perms,
    canWrite,
    canDeletePatient,
    fromMaternity: String(req.query.from || '').toLowerCase() === 'maternity',
   },
  });
 } catch (err) {
  console.error(err);
  renderAppError(res, 500, 'page.load_patients', 'Could not fetch patients.')
 }
});

// Admin: review duplicate patients (4-field composite — same as registration)
app.get('/admin/patient-duplicates', requireAuth, requirePerm('patient.write', 'facility.admin'), async (req, res) => {
 try {
  const { groupPatientsByIdentityKey } = require('./lib/patientDuplicate');
  const [rows] = await pool.query(
    `SELECT id, first_name, last_name, phone, dob, age_years, age_only_registration,
            patient_code, created_at
     FROM tbl_patient WHERE status = 1 ORDER BY id ASC`
  );
  const groups = groupPatientsByIdentityKey(rows);
  const duplicateGroups = [];
  for (const [, members] of groups) {
   if (members.length < 2) continue;
   const sorted = [...members].sort((a, b) => a.id - b.id);
   duplicateGroups.push({ keep: sorted[0], duplicates: sorted.slice(1) });
  }
  res.render('patient-duplicates', {
   title: pageTitle(res, 'document_titles.merge_patients', 'Merge patients — duplicate review'),
   duplicateGroups,
   flash: req.query.msg || null,
   error: req.query.err || null,
  });
 } catch (e) {
  console.error(e);
  renderAppError(res, 500, 'page.load_duplicates', 'Could not load duplicates.', { detail: e.message });
 }
});

app.get('/patients/print-list', requireAuth, requirePerm('patient.read', 'patient.write'), async (req, res) => {
 const q = (req.query.q || '').trim();
 try {
  let where = 'COALESCE(status, 1) = 1';
  const params = [];
  if (q) {
   where += ` AND (
    first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR CAST(id AS CHAR) LIKE ? OR patient_code LIKE ?
    OR CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')) LIKE ?
    OR CONCAT(COALESCE(last_name,''), ' ', COALESCE(first_name,'')) LIKE ?
   )`;
   const like = '%' + q + '%';
   params.push(like, like, like, like, like, like, like);
  }
  const [patients] = await pool.query(
   `SELECT id, patient_code, first_name, last_name, phone, gender, patient_type,
           dob, age_years, age_only_registration, address, created_at
    FROM tbl_patient WHERE ${where} ORDER BY id ASC LIMIT 10000`,
   params
  );
  for (const p of patients || []) {
   p.calculated_age_years = patientDisplayAgeYears(p);
  }
  const now = new Date();
  res.render('print-patients-list', {
   title: pageTitle(res, 'document_titles.patient_directory', 'Patient Directory — {{brand}}', { brand: hmsBrand.facilityName || hmsBrand.name }),
   layout: false,
   pageData: {
    patients: patients || [],
    searchQ: q,
    title: pageTitle(res, 'document_titles.patient_directory', 'Patient Directory — {{brand}}', { brand: hmsBrand.facilityName || hmsBrand.name }),
    facilityName: hmsBrand.facilityName || hmsBrand.name || 'ZAIZENS',
    generatedAt: now.toISOString(),
   },
  });
 } catch (err) {
  console.error('patients print-list:', err);
  renderAppError(res, 500, 'page.load_patient_print', 'Could not prepare patient list for print.')
 }
});

// PATIENT CHART (MEDICAL HISTORY)
// PATIENT CHART === Æ’ ===   supports both /patient-chart/:id AND /patient-chart?id=X
app.get('/patient-chart/:id?', requireAuth, requirePerm('patient.directory.chart','chart.read','patient.read','clinical.read','clinical.write','nursing.read','lab.read','radiology.read','pharmacy.read'), async (req, res) => {
 const pid = req.params.id || req.query.id;
 if (!pid) return res.redirect('/patients');
 try {
 const [patientRows] = await pool.query('SELECT * FROM tbl_patient WHERE id = ? LIMIT 1', [pid]);
 if (patientRows.length === 0) return res.redirect('/patients');
 const patient = patientRows[0];
 patient.calculated_age_years = patientDisplayAgeYears(patient);

 const chartPid = parseInt(pid, 10) || pid;
 await ensureDiagnosticCorrectionSchema(pool).catch(() => {});
 const [allergies] = await pool.query('SELECT * FROM tbl_patient_allergy WHERE patient_id = ? ORDER BY id DESC', [chartPid]);
 const [medications] = await pool.query('SELECT * FROM tbl_patient_medication WHERE patient_id = ? ORDER BY id DESC', [chartPid]);
 await require('./lib/ensureVitalSignSchema').ensureVitalSignColumns(pool).catch(() => {});
 const [vitalsRaw] = await pool.query(
  `SELECT vs.*,
          CONCAT(TRIM(rec.first_name), ' ', TRIM(rec.last_name)) AS recorded_by_name,
          CONCAT(TRIM(sig.first_name), ' ', TRIM(sig.last_name)) AS doctor_signed_by_name
     FROM tbl_vital_sign vs
     LEFT JOIN tbl_employee rec ON rec.id = COALESCE(vs.recorded_by, vs.created_by)
     LEFT JOIN tbl_employee sig ON sig.id = vs.doctor_signed_by
    WHERE vs.patient_id = ?
    ORDER BY COALESCE(vs.recorded_at, vs.created_at) DESC, vs.id DESC
    LIMIT 20`,
  [chartPid]
 ).catch(() => [[]]);
 const { mapVitalSignRowsForDisplay } = require('./lib/normalizeVitalSignRow');
 const vitals = mapVitalSignRowsForDisplay(vitalsRaw || []);
 const [[activeInsurance]] = await pool.query(`
    SELECT pi.*, ic.name AS carrier_name 
    FROM tbl_patient_insurance pi
    JOIN tbl_insurance_carrier ic ON ic.id = pi.carrier_id
    WHERE pi.patient_id = ? AND pi.is_primary = 1
    LIMIT 1
  `, [chartPid]).catch(() => [[]]);

 // Lab / radiology / pharmacy rows (chart tabs + badges)
 const [labResults] = await pool.query(
 `SELECT lr.*, lr.id AS lab_result_id,
         oi.catalog_id AS order_catalog_id,
         oi.item_name AS order_item_name
    FROM tbl_lab_result lr
    LEFT JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
   WHERE lr.patient_id = ?
   ORDER BY lr.id DESC LIMIT 25`,
  [chartPid]
 ).catch(() => [[]]);
 const [radResults] = await pool.query(
 `SELECT rr.*, rr.id AS radiology_result_id,
         oi.catalog_id AS order_catalog_id,
         oi.item_name AS order_item_name
    FROM tbl_radiology_result rr
    LEFT JOIN tbl_opd_order_item oi ON oi.id = rr.opd_order_item_id
   WHERE rr.patient_id = ?
   ORDER BY rr.id DESC LIMIT 25`,
  [chartPid]
 ).catch(() => [[]]);

 // Consultations: primary source is tbl_consultation (consultation-new); include OPD visits with no consult row
 const [consultations] = await pool.query(
  `SELECT * FROM (
    SELECT c.id,
           c.id AS consult_id,
           'consultation' AS row_kind,
           c.opd_visit_id AS visit_id,
           c.created_at,
           c.chief_complaint,
           c.diagnosis,
           COALESCE(v.queue_status, 'completed') AS queue_status,
           COALESCE(NULLIF(TRIM(v.department), ''), 'OPD') AS department_name,
           doc.first_name AS doc_fn,
           doc.last_name AS doc_ln,
           TRIM(CONCAT_WS(' · ',
             NULLIF(TRIM(c.chief_complaint), ''),
             NULLIF(TRIM(c.diagnosis), ''),
             NULLIF(TRIM(c.assessment), '')
           )) AS treatment_note
    FROM tbl_consultation c
    LEFT JOIN tbl_opd_visit v ON v.id = c.opd_visit_id AND v.patient_id = c.patient_id
    LEFT JOIN tbl_employee doc ON doc.id = COALESCE(v.assigned_doctor_id, c.created_by)
    WHERE c.patient_id = ?
    UNION ALL
    SELECT v.id,
           NULL AS consult_id,
           'visit_only' AS row_kind,
           v.id AS visit_id,
           COALESCE(v.completed_at, v.queue_started_at, TIMESTAMP(v.visit_date)) AS created_at,
           v.chief_complaint,
           NULL AS diagnosis,
           v.queue_status,
           COALESCE(NULLIF(TRIM(v.department), ''), 'OPD') AS department_name,
           doc.first_name AS doc_fn,
           doc.last_name AS doc_ln,
           NULLIF(TRIM(v.chief_complaint), '') AS treatment_note
    FROM tbl_opd_visit v
    LEFT JOIN tbl_employee doc ON doc.id = v.assigned_doctor_id
    WHERE v.patient_id = ?
      AND NOT EXISTS (SELECT 1 FROM tbl_consultation c2 WHERE c2.opd_visit_id = v.id)
   ) chart_consults
   ORDER BY chart_consults.created_at DESC, chart_consults.id DESC
   LIMIT 25`,
  [chartPid, chartPid]
 ).catch(() => [[]]);

 const [[latestVisitRow]] = await pool
  .query(
   `SELECT *
      FROM tbl_opd_visit
     WHERE patient_id=?
       AND LOWER(TRIM(COALESCE(queue_status,''))) <> 'cancelled'
     ORDER BY id DESC
     LIMIT 1`,
   [chartPid]
  )
  .catch(() => [[null]]);

 const [prescriptionRows] = await pool.query(
  'SELECT * FROM tbl_prescription WHERE patient_id = ? ORDER BY id DESC LIMIT 25',
  [chartPid]
 ).catch(() => [[]]);

 const [consultWithMeds] = await pool.query(
  `SELECT id, created_at, medications_json FROM tbl_consultation
   WHERE patient_id = ? AND medications_json IS NOT NULL AND CHAR_LENGTH(TRIM(medications_json)) > 4
   ORDER BY id DESC LIMIT 25`,
  [chartPid]
 ).catch(() => [[]]);

 // Lab/Radiology orders prescribed inside consultations (lab_orders_json / rad_orders_json)
 const [consultOrders] = await pool.query(
  `SELECT id, created_at, lab_orders_json, rad_orders_json
   FROM tbl_consultation
   WHERE patient_id = ?
     AND (
       (lab_orders_json IS NOT NULL AND CHAR_LENGTH(TRIM(lab_orders_json)) > 2)
       OR (rad_orders_json IS NOT NULL AND CHAR_LENGTH(TRIM(rad_orders_json)) > 2)
     )
   ORDER BY id DESC
   LIMIT 50`,
  [chartPid]
 ).catch(() => [[]]);

 const toStr = (v) => (v == null ? '' : String(v));
 const normName = (s) => toStr(s).trim().toLowerCase().replace(/\s+/g, ' ');
 const safeJsonArr = (raw) => {
  try {
   const a = JSON.parse(toStr(raw) || '[]');
   return Array.isArray(a) ? a : [];
  } catch (e) {
   return [];
  }
 };

 const labCatalogIds = new Set();
 const radCatalogIds = new Set();
 for (const row of consultOrders || []) {
  for (const id of safeJsonArr(row.lab_orders_json)) {
   const n = parseInt(id, 10);
   if (Number.isFinite(n) && n > 0) labCatalogIds.add(n);
  }
  for (const id of safeJsonArr(row.rad_orders_json)) {
   const n = parseInt(id, 10);
   if (Number.isFinite(n) && n > 0) radCatalogIds.add(n);
  }
 }

 const labCatalogMap = new Map();
 const radCatalogMap = new Map();
 if (labCatalogIds.size > 0) {
  const labIdList = [...labCatalogIds];
  const placeholders = labIdList.map(() => '?').join(',');
  const [rows] = await pool.query(
   `SELECT id, name FROM tbl_service_catalog WHERE id IN (${placeholders})`,
   labIdList
  ).catch(() => [[]]);
  for (const r of rows || []) labCatalogMap.set(parseInt(r.id, 10), r.name);
 }
 if (radCatalogIds.size > 0) {
  const radIdList = [...radCatalogIds];
  const placeholders = radIdList.map(() => '?').join(',');
  const [rows] = await pool.query(
   `SELECT id, name FROM tbl_service_catalog WHERE id IN (${placeholders})`,
   radIdList
  ).catch(() => [[]]);
  for (const r of rows || []) radCatalogMap.set(parseInt(r.id, 10), r.name);
 }

 // Merge "prescribed" orders with existing results (status upgrades automatically if result row exists)
 const labByName = new Map();
const labByCatalogId = new Map();
 for (const r of labResults || []) {
  const k = normName(r.test_name);
  if (k && !labByName.has(k)) labByName.set(k, r);
  const orderNameKey = normName(r.order_item_name);
  if (orderNameKey && !labByName.has(orderNameKey)) labByName.set(orderNameKey, r);
  const cid = parseInt(r.order_catalog_id || r.catalog_id || 0, 10) || 0;
  if (cid > 0 && !labByCatalogId.has(cid)) labByCatalogId.set(cid, r);
 }
 const radByName = new Map();
const radByCatalogId = new Map();
 for (const r of radResults || []) {
  const k = normName(r.exam_name || r.test_name || r.scan_type);
  if (k && !radByName.has(k)) radByName.set(k, r);
  const orderNameKey = normName(r.order_item_name);
  if (orderNameKey && !radByName.has(orderNameKey)) radByName.set(orderNameKey, r);
  const cid = parseInt(r.order_catalog_id || r.catalog_id || 0, 10) || 0;
  if (cid > 0 && !radByCatalogId.has(cid)) radByCatalogId.set(cid, r);
 }

 // Full rows for chart detail modal + attachment preview (doctors)
 const [labRowsDetailed = []] = await pool.query(
  `SELECT lr.*,
     TRIM(CONCAT(COALESCE(ref.first_name,''),' ',COALESCE(ref.last_name,''))) AS referrer_display,
     d.file_path AS attachment_path,
     d.original_name AS attachment_original_name,
     d.mime AS attachment_mime
   FROM tbl_lab_result lr
   LEFT JOIN tbl_employee ref ON ref.id = lr.referred_by_id
   LEFT JOIN tbl_patient_external_document d ON d.id = lr.external_doc_id
   WHERE lr.patient_id = ?
   ORDER BY lr.id DESC
   LIMIT 80`,
  [chartPid]
 ).catch(() => [[]]);
 const [radRowsDetailed = []] = await pool.query(
  `SELECT rr.*,
     TRIM(CONCAT(COALESCE(ref.first_name,''),' ',COALESCE(ref.last_name,''))) AS referrer_display,
     d.file_path AS attachment_path,
     d.original_name AS attachment_original_name,
     d.mime AS attachment_mime
   FROM tbl_radiology_result rr
   LEFT JOIN tbl_employee ref ON ref.id = rr.referred_by_id
   LEFT JOIN tbl_patient_external_document d ON d.id = rr.external_doc_id
   WHERE rr.patient_id = ?
   ORDER BY rr.id DESC
   LIMIT 80`,
  [chartPid]
 ).catch(() => [[]]);

 const labChartDetailMap = {};
 const radChartDetailMap = {};
 const oiCorrIds = [
  ...new Set(
   [...(labRowsDetailed || []), ...(radRowsDetailed || [])].map((r) => r.opd_order_item_id).filter((x) => x != null && x > 0)
  )
 ];
 const corrByOi = new Map();
 if (oiCorrIds.length) {
  const [cRows] = await pool
   .query(
    `SELECT a.opd_order_item_id, a.superseded_findings, a.superseded_conclusion, a.performed_at,
            TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,''))) AS performer_name
     FROM tbl_diagnostic_result_correction_audit a
     LEFT JOIN tbl_employee e ON e.id = a.performed_by
     WHERE a.event_type = 'correct' AND a.opd_order_item_id IN (${oiCorrIds.map(() => '?').join(',')})
     ORDER BY a.id ASC`,
    oiCorrIds
   )
   .catch(() => [[]]);
  for (const a of cRows || []) {
   if (!corrByOi.has(a.opd_order_item_id)) corrByOi.set(a.opd_order_item_id, []);
   corrByOi.get(a.opd_order_item_id).push({
    superseded_findings: a.superseded_findings,
    superseded_conclusion: a.superseded_conclusion,
    performed_at: a.performed_at,
    performer_name: a.performer_name || ''
   });
  }
 }
 const labDetailIds = (labRowsDetailed || []).map((r) => r && r.id).filter((x) => x > 0);
 const corrByLabId = new Map();
 if (labDetailIds.length) {
  const [cLab] = await pool
   .query(
    `SELECT a.lab_result_id, a.superseded_findings, a.superseded_conclusion, a.performed_at,
            TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,''))) AS performer_name
     FROM tbl_diagnostic_result_correction_audit a
     LEFT JOIN tbl_employee e ON e.id = a.performed_by
     WHERE a.event_type = 'correct' AND a.module = 'laboratory' AND a.lab_result_id IS NOT NULL
       AND a.lab_result_id IN (${labDetailIds.map(() => '?').join(',')})
     ORDER BY a.id ASC`,
    labDetailIds
   )
   .catch(() => [[]]);
  for (const a of cLab || []) {
   if (!corrByLabId.has(a.lab_result_id)) corrByLabId.set(a.lab_result_id, []);
   corrByLabId.get(a.lab_result_id).push({
    superseded_findings: a.superseded_findings,
    superseded_conclusion: a.superseded_conclusion,
    performed_at: a.performed_at,
    performer_name: a.performer_name || ''
   });
  }
 }
 for (const row of labRowsDetailed || []) {
  if (row && row.id) {
   row.correction_history = row.opd_order_item_id
    ? corrByOi.get(row.opd_order_item_id) || []
    : corrByLabId.get(row.id) || [];
   labChartDetailMap[row.id] = row;
  }
 }
 for (const row of radRowsDetailed || []) {
  if (row && row.id) {
   row.correction_history = corrByOi.get(row.opd_order_item_id) || [];
   radChartDetailMap[row.id] = row;
  }
 }

 const prescribedLab = [];
 const prescribedRad = [];
 const seenLabKey = new Set();
 const seenRadKey = new Set();
 for (const c of consultOrders || []) {
  const cAt = c.created_at || null;
  for (const rawId of safeJsonArr(c.lab_orders_json)) {
   const id = parseInt(rawId, 10);
   const name = labCatalogMap.get(id);
   if (!name) continue;
   const k = normName(name);
   if (!k || seenLabKey.has(k)) continue;
   seenLabKey.add(k);
   const match = labByCatalogId.get(id) || labByName.get(k);
   if (match) prescribedLab.push(match);
   else prescribedLab.push({ test_name: name, status: 'prescribed', created_at: cAt, notes: null, result_text: null, referred_by_id: null });
  }
  for (const rawId of safeJsonArr(c.rad_orders_json)) {
   const id = parseInt(rawId, 10);
   const name = radCatalogMap.get(id);
   if (!name) continue;
   const k = normName(name);
   if (!k || seenRadKey.has(k)) continue;
   seenRadKey.add(k);
   const match = radByCatalogId.get(id) || radByName.get(k);
   if (match) prescribedRad.push(match);
   else prescribedRad.push({ test_name: name, status: 'prescribed', created_at: cAt, findings: null, conclusion: null, notes: null });
  }
 }

 // If prescribed list is empty, fall back to actual results (existing behavior)
 const labResultsForChart = prescribedLab.length ? prescribedLab : (labResults || []);
 const radResultsForChart = prescribedRad.length ? prescribedRad : (radResults || []);

 function formatConsultMedsLine(json) {
  try {
   const arr = JSON.parse(json || '[]');
   if (!Array.isArray(arr) || arr.length === 0) return '';
   return arr
    .map((m) => {
     if (!m || typeof m !== 'object') return '';
     const name = String(m.name || '').trim();
     const bits = [m.dosage, m.frequency, m.duration, m.timing, m.instructions].filter((x) => x && String(x).trim());
     return name ? name + (bits.length ? ' (' + bits.map((b) => String(b).trim()).join(', ') + ')' : '') : '';
    })
    .filter(Boolean)
    .join('; ');
  } catch (e) {
   return '';
  }
 }

 const prescriptions = [];
 for (const rx of prescriptionRows || []) {
  prescriptions.push({ ...rx, chart_rx_source: 'pharmacy' });
 }
 for (const row of consultWithMeds || []) {
  const line = formatConsultMedsLine(row.medications_json);
  if (!line) continue;
  prescriptions.push({
   id: row.id,
   title: pageTitle(res, 'document_titles.medications_consultation', 'Medications (consultation)'),
   items: line,
   notes: null,
   status: 'recorded',
   created_at: row.created_at,
   chart_rx_source: 'consultation'
  });
 }
 prescriptions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
 const prescriptionsTrimmed = prescriptions.slice(0, 30);

 const staffRoleChart = String((req.session.user || {}).role || '');
 const staffDoctorIdChart = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
 const permsChart = res.locals.userPerms || [];
 const chartShowFollowUpOpd =
  staffDoctorIdChart > 0 &&
  (staffRoleChart === '2' || permsChart.includes('clinical.write') || permsChart.includes('prescription.write'));
 const chartCanSignVitals =
  permsChart.includes('*') ||
  permsChart.includes('clinical.write') ||
  staffRoleChart === '2';
 let chartCanRecordVitals = staffMayRecordOpdVitals({
  role: staffRoleChart,
  perms: permsChart,
  aclTriageVisible: false,
 });
 let chartVitalsBlockReason = '';
 if (chartCanRecordVitals && latestVisitRow) {
  const fidChart = req.session.facilityId || 1;
  const hasChartVitals = await opdVisitHasVitalsRecorded(pool, latestVisitRow.id, chartPid);
  const vitalsGate = await clinicalBusinessRules.assertOpdVisitVitalsAllowed(
   pool,
   latestVisitRow,
   fidChart,
   {
    userRole: staffRoleChart,
    blockIfVitalsExist: true,
    hasVitalsAlready: hasChartVitals,
   }
  );
  if (!vitalsGate.ok) {
   chartCanRecordVitals = false;
   chartVitalsBlockReason = clinicalMsgT(res, vitalsGate);
  }
 } else if (chartCanRecordVitals && !latestVisitRow) {
  chartCanRecordVitals = false;
  chartVitalsBlockReason = clinicalMsgT(res, 'no_payment');
 } else if (!chartCanRecordVitals && clinicalBusinessRules.isDoctorStaffRole(staffRoleChart)) {
  chartVitalsBlockReason = clinicalMsgT(res, 'doctor_forbidden');
 }

  const hmsClinicalHub = require('./lib/hmsClinicalHub');
  const patientSmart = await hmsClinicalHub.getPatientSmartCounts(pool, chartPid).catch(() => null);
  const maternityEpisode = await require('./lib/maternityBilling')
    .loadPatientMaternityEpisode(pool, chartPid)
    .catch(() => null);
  const vaccinationSummary = await require('./lib/hmsVaccination')
    .loadPatientChartSummary(pool, chartPid)
    .catch(() => null);

  res.render('patient-chart', {
  title: pageTitle(res, 'document_titles.patient_chart', 'Chart: {{name}}', { name: [patient.first_name, patient.last_name].filter(Boolean).join(' ') }),
  pageData: {
  patient,
  allergies,
  medications,
  vitals,
  activeInsurance,
  labResults: labResultsForChart,
  radResults: radResultsForChart,
  labChartDetailMap,
  radChartDetailMap,
  consultations: consultations || [],
  latestOpdVisitId: latestVisitRow?.id || null,
  prescriptions: prescriptionsTrimmed,
  chartShowFollowUpOpd,
  chartCanRecordVitals,
  chartCanSignVitals,
  chartVitalsBlockReason,
  patientSmart,
  maternityEpisode,
  vaccinationSummary,
  flash: req.query.msg || null,
  error: req.query.err || null,
  },
  });
 } catch (err) {
 console.error('Patient Chart Error:', err.message);
 renderAppError(res, 500, 'page.load_medical_record', 'Failed to load medical record.')
 }
});

app.post('/patient-chart/:id/vitals/sign', requireAuth, requirePerm('clinical.write', 'chart.read', 'patient.directory.chart'), async (req, res) => {
 const pid = parseInt(req.params.id, 10) || 0;
 if (pid < 1) return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_patient')));
 const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
 try {
  await require('./lib/ensureVitalSignSchema').ensureVitalSignColumns(pool);
  const signAll = String(req.body.sign_all || '') === '1';
  const vitalId = parseInt(req.body.vital_id, 10) || 0;
  if (signAll) {
   await pool.query(
    `UPDATE tbl_vital_sign
        SET doctor_signed_at = NOW(), doctor_signed_by = ?
      WHERE patient_id = ? AND doctor_signed_at IS NULL`,
    [uid, pid]
   );
  } else if (vitalId > 0) {
   await pool.query(
    `UPDATE tbl_vital_sign
        SET doctor_signed_at = NOW(), doctor_signed_by = ?
      WHERE id = ? AND patient_id = ? AND doctor_signed_at IS NULL`,
    [uid, vitalId, pid]
   );
  }
  return res.redirect('/patient-chart/' + pid + '?msg=' + encodeURIComponent(flashT(res, 'flash.vitals_signed')));
 } catch (err) {
  console.error('PATIENT CHART VITALS SIGN:', err.message);
  return res.redirect('/patient-chart/' + pid + '?err=' + encodeURIComponent(flashT(res, 'flash.update_failed', { message: err.message })));
 }
});

app.get('/api/clinical/diagnostic-new-test-gate', requireAuth, async (req, res) => {
 try {
  const pid = parseInt(req.query.patient_id, 10) || 0;
  const dept = String(req.query.dept || 'laboratory');
  const fid = req.session.facilityId || 1;
  const gate = await clinicalBusinessRules.assertDiagnosticNewTestAllowed(pool, pid, dept, fid);
  return res.json({
   ok: !!gate.ok,
   error: gate.error || null,
   code: gate.code || null,
   meta: gate.meta || null,
  });
 } catch (e) {
  return res.status(500).json({ ok: false, error: e.message || 'Server error' });
 }
});

app.get('/api/clinical/opd-prescription-gate', requireAuth, async (req, res) => {
 try {
  const pid = parseInt(req.query.patient_id, 10) || 0;
  const fid = req.session.facilityId || 1;
  const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const gate = await clinicalBusinessRules.assertOpdPrescriptionAllowed(pool, fid, pid, uid);
  return res.json({
   ok: !!gate.ok,
   error: gate.error || null,
   code: gate.code || null,
   meta: gate.meta || null,
  });
 } catch (e) {
  return res.status(500).json({ ok: false, error: e.message || 'Server error' });
 }
});

 /** Eligible follow-up patients for the logged-in doctor (prior request + payment validity). */
app.get(
 '/api/clinical/follow-up-eligible-patients',
 requireAuth,
 requirePerm('clinical.write', 'prescription.write'),
 async (req, res) => {
  const doctorEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  if (doctorEmpId < 1) {
   return res.json({ ok: false, patients: [], error: 'Staff profile not linked to your account.' });
  }
  try {
   const followUp = require('./lib/followUpConsultation');
   const patients = await followUp.listEligibleFollowUpPatients(
    pool,
    req.session.facilityId || 1,
    doctorEmpId,
    { limit: 100 }
   );
   res.json({ ok: true, patients });
  } catch (e) {
   console.error('follow-up-eligible-patients:', e);
   res.status(500).json({ ok: false, patients: [], error: e.message || 'Could not load eligible patients.' });
  }
 }
);

/** Doctor: register follow-up OPD visit when payment validity + prior follow-up request allow (see consultation form checkbox). */
app.get('/clinical/follow-up-opd', requireAuth, requirePerm('clinical.write', 'prescription.write'), async (req, res) => {
 const patientId = parseInt(String(req.query.patient_id || ''), 10) || 0;
 const fid = req.session.facilityId || 1;
 const doctorEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
 if (patientId < 1) return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_patient_2')));
 if (doctorEmpId < 1) {
  return res.redirect(
   '/patient-chart/' +
    patientId +
    '?err=' +
    encodeURIComponent(flashT(res, 'flash.your_user_account_is_not_linked_to_a_staff_record_follow_up_cannot_be_st'))
  );
 }
 try {
  const [[patient]] = await pool
   .query('SELECT id, first_name, last_name FROM tbl_patient WHERE id = ? LIMIT 1', [patientId])
   .catch(() => [[null]]);
  const followUp = require('./lib/followUpConsultation');
  const result = await followUp.assertFollowUpEligible(pool, fid, patientId, doctorEmpId);
  if (!result.ok) {
   return res.render('follow-up-opd-blocked', {
    title: pageTitle(res, 'document_titles.follow_up_consultation', 'Follow-up consultation'),
    patient: patient || { id: patientId, first_name: '', last_name: '' },
    patientId,
    errors: result.errors && result.errors.length ? result.errors : ['Cannot start a follow-up consultation.'],
    meta: result.meta || {},
   });
  }
  const meta = result.meta || {};
  const av = meta.anchorVisit || {};
  const dept = String(av.department || '').trim() || 'General';
  let warnParam = '';
  const vmeta = meta.vchk || {};
  const maxU = vmeta.max_uses != null ? Number(vmeta.max_uses) : null;
  const used = vmeta.uses_so_far != null ? Number(vmeta.uses_so_far) : null;
  if (maxU != null && used != null && maxU - used <= 1) {
   warnParam =
    '&warn=' +
    encodeURIComponent(flashT(res, 'flash.this_payment_code_is_on_its_last_valid_use_allowance_after_this_follow_u'));
  }
  const newVid = await followUp.createFollowUpOpdVisit(pool, {
   facilityId: fid,
   userId: doctorEmpId,
   patientId,
   paymentCode: meta.paymentCode,
   department: dept,
   assignedDoctorId: doctorEmpId,
   chiefComplaint: 'Follow-up consultation',
  });
  return res.redirect(
   '/consultation-new?patient_id=' +
    patientId +
    '&visit_id=' +
    newVid +
    warnParam +
    '&msg=' +
    encodeURIComponent(flashT(res, 'flash.follow_up_visit_registered_under_your_existing_payment_rules_complete_vi'))
  );
 } catch (e) {
  console.error('follow-up-opd:', e);
  const [[patient]] = await pool
   .query('SELECT id, first_name, last_name FROM tbl_patient WHERE id = ? LIMIT 1', [patientId])
   .catch(() => [[null]]);
  return res.render('follow-up-opd-blocked', {
   title: pageTitle(res, 'document_titles.follow_up_consultation', 'Follow-up consultation'),
   patient: patient || { id: patientId, first_name: '', last_name: '' },
   patientId,
   errors: [e.message || 'Could not register the follow-up visit. The patient may need a new consultation payment at the cashier.'],
   meta: {},
  });
 }
});

// APPOINTMENTS LIST
app.get('/appointments', requireAuth, requirePerm('scheduling.read','scheduling.write','opd.read','clinical.read','clinical.write'), async (req, res) => {
 try {
 const q = (req.query.q || '').trim();
 let where = '1=1';
 const params = [];
 if (q) {
  const like = '%' + q + '%';
  where += ` AND (
   CAST(a.id AS CHAR) LIKE ? OR CAST(a.appointment_id AS CHAR) LIKE ?
   OR a.patient_name LIKE ? OR a.doctor LIKE ? OR a.department LIKE ?
   OR CAST(a.patient_id AS CHAR) LIKE ?
   OR CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,'')) LIKE ?
  )`;
  params.push(like, like, like, like, like, like, like);
 }
 const { rows: appointments, pager } = await pagination.fetchPage(pool, {
  req,
  pageParam: 'p',
  basePath: '/appointments',
  query: q ? { q } : {},
  countSql: `SELECT COUNT(*) AS total FROM tbl_appointment a LEFT JOIN tbl_patient p ON p.id = a.patient_id WHERE ${where}`,
  countParams: params,
  dataSql: `
 SELECT a.*, p.first_name AS p_fn, p.last_name AS p_ln 
 FROM tbl_appointment a 
 LEFT JOIN tbl_patient p ON p.id = a.patient_id 
 WHERE ${where}
 ORDER BY a.id DESC`,
  dataParams: params,
 });

 const [patients] = await pool.query(
  'SELECT id, first_name, last_name, patient_code, phone FROM tbl_patient WHERE status = 1 ORDER BY last_name, first_name'
 );
 const hmsDoctorStaff = require('./lib/hmsDoctorStaff');
 const { listDoctorSpecialisations } = require('./lib/hmsDoctorSpecialisations');
 let doctors = [];
 try {
  doctors = await hmsDoctorStaff.fetchActiveDoctorsWithClinicalLinks(
   pool,
   'e.id, e.first_name, e.last_name, COALESCE(e.primary_department,"") AS primary_department, COALESCE(e.specialisation,"") AS specialisation'
  );
 } catch (docErr) {
  console.warn('APPOINTMENTS doctors clinical links:', docErr.message || docErr);
  doctors = await hmsDoctorStaff.fetchActiveDoctors(
   pool,
   'e.id, e.first_name, e.last_name, COALESCE(e.primary_department,"") AS primary_department, COALESCE(e.specialisation,"") AS specialisation'
  ).catch(() => []);
 }
 const specialisations = await listDoctorSpecialisations(pool).catch(() => []);
 const [departments] = await pool.query("SELECT id, department_name FROM tbl_department WHERE status = 1");

 res.render('appointments', { 
 title: pageTitle(res, 'document_titles.appointments', 'Appointments — ZAIZENS'),
 pageData: {
  appointments,
  patients,
  doctors,
  departments,
  specialisations,
  searchQ: q,
  pager,
  flash: req.query.msg || null,
  error: req.query.err || null,
  userPerms: res.locals.userPerms || [],
 },
 });
 } catch (err) {
 console.error('APPOINTMENTS LOAD ERROR:', err.message || err);
 console.error(err);
 renderAppError(res, 500, 'page.load_appointments', 'Could not fetch appointments.')
 }
});

app.get('/appointments/online-booking', requireAuth, requirePerm('scheduling.write', 'scheduling.read'), async (req, res) => {
 try {
  await hmsOnlineBooking.ensureOnlineBookingSchema(pool);
  const tab = req.query.tab === 'doctors' ? 'doctors' : 'settings';
  const settings = await hmsOnlineBooking.getSettings(pool);
  const doctors = await hmsOnlineBooking.listDoctors(pool, {});
  const selectedDoctorId = parseInt(req.query.doctor_id, 10) || 0;
  let scheduleDays = [];
  if (selectedDoctorId) {
   scheduleDays = await hmsOnlineBooking.getDoctorScheduleForm(pool, selectedDoctorId);
  }
  res.render('appointments-online-booking', {
   title: pageTitle(res, 'document_titles.online_booking_config', 'Online booking configuration'),
   tab,
   settings,
   doctors,
   selectedDoctorId,
   scheduleDays,
   flash: req.query.msg || null,
   error: req.query.err || null,
  });
 } catch (e) {
  console.error(e);
  renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });
 }
});

app.post('/appointments/online-booking/settings', requireAuth, requirePerm('scheduling.write'), async (req, res) => {
 try {
  await hmsOnlineBooking.ensureOnlineBookingSchema(pool);
  await hmsOnlineBooking.saveSettings(pool, req.body);
  res.redirect('/appointments/online-booking?tab=settings&msg=' + encodeURIComponent(flashT(res, 'flash.booking_settings_saved')));
 } catch (e) {
  res.redirect('/appointments/online-booking?tab=settings&err=' + encodeURIComponent(e.message));
 }
});

app.post('/appointments/online-booking/doctor/:doctorId/schedule', requireAuth, requirePerm('scheduling.write'), async (req, res) => {
 try {
  await hmsOnlineBooking.ensureOnlineBookingSchema(pool);
  await hmsOnlineBooking.saveDoctorAvailability(pool, req.params.doctorId, req.body);
  res.redirect(
   '/appointments/online-booking?tab=doctors&doctor_id=' +
    encodeURIComponent(req.params.doctorId) +
    '&msg=' +
    encodeURIComponent(flashT(res, 'flash.doctor_schedule_saved'))
  );
 } catch (e) {
  res.redirect(
   '/appointments/online-booking?tab=doctors&doctor_id=' +
    encodeURIComponent(req.params.doctorId) +
    '&err=' +
    encodeURIComponent(e.message)
  );
 }
});

app.post('/appointments/online-booking/doctor/:doctorId/schedule/clear', requireAuth, requirePerm('scheduling.write'), async (req, res) => {
 try {
  const did = parseInt(req.params.doctorId, 10) || 0;
  await pool.query('DELETE FROM tbl_doctor_availability WHERE doctor_id=?', [did]);
  res.redirect(
   '/appointments/online-booking?tab=doctors&doctor_id=' +
    did +
    '&msg=' +
    encodeURIComponent(flashT(res, 'flash.doctor_now_uses_clinic_default_hours'))
  );
 } catch (e) {
  res.redirect('/appointments/online-booking?tab=doctors&err=' + encodeURIComponent(e.message));
 }
});

// ADD PATIENT POST

app.post('/patients/add', requireAuth, requirePerm('patient.write'), async (req, res) => {
  const {
    first_name, last_name, gender, dob, phone, email, address, patient_type,
    cni_number, cni_issue_date,
    next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
    emergency_contact_name, emergency_contact_phone,
    portal_enabled, status,
    open_credit_line, emergency_credit_pending,
    ins_carrier_id, ins_policy_number, ins_insurer_covered_percent, ins_pct_radio, ins_auto_data
  } = req.body;

  const portalOn = portal_enabled ? 1 : 0;
  const statusVal = parseInt(status) === 0 ? 0 : 1;
  const uid = req.session.userId || req.session.user?.id || 1;

  const emailNorm = (email != null && String(email).trim()) ? String(email).trim() : '';

  let genderNorm = String(gender || '').trim();
  if (genderNorm !== 'Male' && genderNorm !== 'Female') genderNorm = 'Male';

  if (portalOn && !emailNorm) {
    return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.email_is_required_when_portal_access_is_enabled')))
  }

  if (emailNorm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_email_format')))
  }

  const cniDateNorm = cni_issue_date != null && String(cni_issue_date).trim()
    ? hmsFormatDate.toIsoDatePart(cni_issue_date)
    : null;
  if (cni_issue_date != null && String(cni_issue_date).trim() && !cniDateNorm) {
    return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_date_format')))
  }

  await ensurePatientInsuranceTables();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure schema columns exist (some deployments have older tbl_patient)
    await conn.query("ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS patient_type VARCHAR(30) NULL").catch(() => {});
    await conn.query("ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS cni_number VARCHAR(100) NULL").catch(() => {});
    await conn.query("ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS cni_issue_date DATE NULL").catch(() => {});
    await conn.query("ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS next_of_kin_name VARCHAR(255) NULL").catch(() => {});
    await conn.query("ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS next_of_kin_phone VARCHAR(50) NULL").catch(() => {});
    await conn.query("ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS next_of_kin_relationship VARCHAR(100) NULL").catch(() => {});
    await conn.query("ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255) NULL").catch(() => {});
    await conn.query("ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50) NULL").catch(() => {});
    await conn.query("ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS portal_enabled TINYINT DEFAULT 0").catch(() => {});
    await conn.query("ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS status TINYINT DEFAULT 1").catch(() => {});
    await conn.query("ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS created_at DATETIME NULL").catch(() => {});
    await ensurePatientAgeColumns(conn);

    const phoneNorm = normalizePatientPhone(phone);
    const nokPhoneNorm = normalizePatientPhone(next_of_kin_phone);
    const emergPhoneNorm = normalizePatientPhone(emergency_contact_phone);
    if (!phoneNorm) {
      await conn.rollback();
      conn.release();
      return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.a_valid_phone_number_is_required')));
    }

    const resolved = resolvePatientDobAgeFromBody(req.body, 'ap_dob_mode');
    const dobFinal = resolved.dob;
    const ageYearsFinal = resolved.age_years;
    const ageOnlyFinal = resolved.age_only_registration;

    const hasDob = dobFinal != null && String(dobFinal).trim() !== '';
    const hasAge = ageYearsFinal != null && Number.isFinite(ageYearsFinal);
    if (!hasDob && !hasAge) {
      await conn.rollback();
      conn.release();
      return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.date_of_birth_or_age_is_required')));
    }

    const duplicate = await findDuplicatePatient(conn, {
      first_name,
      last_name,
      phone: phoneNorm,
      dob: dobFinal,
      age_years: ageYearsFinal,
      age_only_registration: ageOnlyFinal,
    });
    if (duplicate) {
      await conn.rollback();
      conn.release();
      return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.duplicate_patient', { id: duplicate.id, name: ((duplicate.first_name||'')+' '+(duplicate.last_name||'')).trim() || flashT(res, 'flash.patient') })));
    }

    const ensurePatientCodeSchema = require('./lib/ensurePatientCodeSchema');
    await ensurePatientCodeSchema(conn).catch(() => {});
    const { allocateNextPatientCodeLocked } = require('./lib/hmsPatientCode');
    const patientCode = await allocateNextPatientCodeLocked(conn);

    // 1. Create Patient
    const [result] = await conn.query(
      `INSERT INTO tbl_patient
       (patient_code, first_name, last_name, gender, dob, age_years, age_only_registration, phone, email, address, patient_type,
        cni_number, cni_issue_date,
        next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
        emergency_contact_name, emergency_contact_phone,
        portal_enabled, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [patientCode, first_name, last_name||null, genderNorm, dobFinal, ageYearsFinal, ageOnlyFinal, phoneNorm, emailNorm, normalizePatientAddress(address),
       patient_type, cni_number||null, cniDateNorm,
       next_of_kin_name||null, nokPhoneNorm || null, next_of_kin_relationship||null,
       emergency_contact_name||null, emergPhoneNorm || null,
       portalOn, statusVal]
    );
    const newPid = result.insertId;
    const { refreshPatientIdentityKey } = require('./lib/ensurePatientIdentitySchema');
    await refreshPatientIdentityKey(conn, newPid).catch(() => {});

    if (newPid > 0) {
      // 2. Auto-wallet
      const qrToken = 'GBPAY-' + newPid + '-' + Date.now();
      await conn.query(
        "INSERT IGNORE INTO tbl_patient_wallet (patient_id, balance, status, qr_token, created_at, updated_at) VALUES (?,0,'active',?,NOW(),NOW())",
        [newPid, qrToken]
      ).catch(() => {});

      // 3. Open Credit Line
      if (open_credit_line) {
        const fid = req.session.facilityId || 1;
        const [cr] = await conn.query(
          "INSERT INTO tbl_credit_account (facility_id, patient_id, status, outstanding_balance, notes, created_by, created_at) VALUES (?, ?, 'active', 0, ?, ?, NOW())",
          [fid, newPid, emergency_credit_pending ? 'Emergency — payment pending' : null, uid]
        );
      }

      // 4. Insurance (Auto or Manual)
      let insCarrier = ins_carrier_id;
      let insPolicy = ins_policy_number;
      // Accept percentage from hidden sync field, radio fallback, or direct input
      let insPct = parseInt(ins_insurer_covered_percent) || parseInt(ins_pct_radio) || 0;
      let apiSrc = null;

      if (ins_auto_data) {
        try {
          const auto = JSON.parse(Buffer.from(ins_auto_data, 'base64').toString());
          insCarrier = auto.carrier_id || insCarrier;
          insPolicy = auto.policy_number || insPolicy;
          insPct = auto.insurer_covered_percent || insPct;
          apiSrc = auto.api_source || 'auto';
        } catch(e) {}
      }

      if (insCarrier && insPct > 0) {
        const insFid = await ensureFacilityRow(conn, req.session.facilityId);
        await conn.query(
          `INSERT INTO tbl_patient_insurance
           (facility_id, patient_id, carrier_id, policy_number, insurer_covered_percent, is_primary, api_source, api_last_fetched, created_by, created_at)
           VALUES (?,?,?,?,?,1,?, NOW(), ?, NOW())`,
          [insFid, newPid, insCarrier, insPolicy||null, insPct, apiSrc, uid]
        );
      }
    }

    await conn.commit();
    const fromMaternity = String(req.body.from || '').toLowerCase() === 'maternity';
    if (fromMaternity && newPid > 0) {
      return res.redirect(
        '/maternity/register?patient_id=' +
          newPid +
          '&msg=' +
          encodeURIComponent('Patient registered — continue ANC booking')
      );
    }
    res.redirect(
      '/patients?msg=' +
        encodeURIComponent(
          'Patient registered (' +
            patientCode +
            ') with wallet' +
            (open_credit_line ? ' and credit line' : '') +
            '.'
        )
    );
  } catch (err) {
    await conn.rollback();
    console.error('ADD PATIENT ERROR:', err.message);
    res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.registration_failed', { message: err.message })));
  } finally {
    conn.release();
  }
});

// Permanently delete patient row + related records (blocked if active IPD admission)
async function handlePatientDelete(req, res) {
 const id = parseInt(req.params.id, 10) || 0;
 if (id < 1) return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_patient_2')))
 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();
  const nd = "(discharged_at IS NULL OR discharged_at = '0000-00-00 00:00:00' OR discharged_at = '0000-00-00')";
  const [admRows] = await conn.query(
   `SELECT id FROM tbl_admission WHERE patient_id=? AND ${nd} LIMIT 1`,
   [id]
  ).catch(() => [[null]]);
  const adm = admRows && admRows[0];
  if (adm && adm.id) {
   await conn.rollback();
   conn.release();
   return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.cannot_delete_patient_active_inpatient_admission_is_open_discharge_first')));
  }
  const [pRows] = await conn.query(
   `SELECT id, patient_code, first_name, last_name, phone, email, gender, dob, age_years,
           patient_type, address, cni_number, created_at, facility_id
    FROM tbl_patient WHERE id=? LIMIT 1`,
   [id]
  );
  const row = pRows && pRows[0];
  if (!row || !row.id) {
   await conn.rollback();
   conn.release();
   return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.patient_not_found_or_already_deleted')));
  }
  await purgePatientRelatedRows(conn, id);

  let affected = 0;
  try {
   const [delResult] = await conn.query('DELETE FROM tbl_patient WHERE id = ? LIMIT 1', [id]);
   affected = delResult ? Number(delResult.affectedRows || 0) : 0;
  } catch (delErr) {
   const msg = String(delErr.message || '');
   const errno = delErr.errno || delErr.code;
   const fkBlock =
    errno === 1451 ||
    errno === 'ER_ROW_IS_REFERENCED_2' ||
    /foreign key constraint/i.test(msg) ||
    /Cannot delete or update a parent row/i.test(msg);
   if (!fkBlock) {
    await conn.rollback().catch(() => {});
    conn.release();
    console.error('DELETE PATIENT sql:', delErr.message);
    return res.redirect('/patients?err=' + encodeURIComponent(delErr.message));
   }
   console.warn('DELETE PATIENT: FK blocked row delete; retrying with FOREIGN_KEY_CHECKS=0 for id', id);
   await conn.query('SET FOREIGN_KEY_CHECKS=0').catch(() => {});
   try {
    const [del2] = await conn.query('DELETE FROM tbl_patient WHERE id = ? LIMIT 1', [id]);
    affected = del2 ? Number(del2.affectedRows || 0) : 0;
   } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS=1').catch(() => {});
   }
  }

  if (affected < 1) {
   await conn.rollback();
   conn.release();
   return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.delete_failed_could_not_remove_patient_row_constraints')));
  }
  const uid = req.session.user?.id || 0;
  const facId = req.session.user?.facility_id || req.session.user?.facilityId || row.facility_id || 1;
  const actorRole = String(req.session.user?.role ?? '');
  const actorName = String(req.session.user?.name || req.session.user?.username || '').trim();
  await conn.query(
   `INSERT INTO tbl_audit_log (user_id, facility_id, action, entity, entity_id, ip, user_agent, payload_json)
    VALUES (?, ?, 'patient.delete', 'patient', ?, ?, ?, ?)`,
   [
    uid,
    facId,
    id,
    req.ip || null,
    String(req.headers['user-agent'] || '').slice(0, 512),
    JSON.stringify({
     route: req.path,
     patient: {
      id: row.id,
      patient_code: row.patient_code,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      email: row.email,
      gender: row.gender,
      dob: row.dob,
      age_years: row.age_years,
      patient_type: row.patient_type,
      address: row.address,
      cni_number: row.cni_number,
      created_at: row.created_at,
     },
     deleted_by: { user_id: uid, role: actorRole, name: actorName || null },
    }),
   ]
  ).catch((e) => console.warn('patient.delete audit:', e.message));
  await conn.commit();
  conn.release();
  return res.redirect('/patients?msg=' + encodeURIComponent(flashT(res, 'flash.patient_deleted')));
 } catch (e) {
  await conn.rollback().catch(() => {});
  conn.release();
  console.error('DELETE PATIENT:', e.message);
  return res.redirect('/patients?err=' + encodeURIComponent(e.message));
 }
}

app.post('/patients/:id/delete', requireAuth, requirePatientArchivePermission, handlePatientDelete);
app.post('/patients/:id/archive', requireAuth, requirePatientArchivePermission, handlePatientDelete);

// GET: Load patient data for Edit modal (JSON)
app.get('/patients/edit/:id', requireAuth, requirePerm('patient.directory.edit','patient.write'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tbl_patient WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Save edited patient profile
app.post('/patients/edit/:id', requireAuth, requirePerm('patient.directory.edit','patient.write'), async (req, res) => {
  const pid = parseInt(req.params.id, 10);
  const { first_name, last_name, gender, dob, phone, email, address, patient_type,
          cni_number, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone,
          portal_enabled } = req.body;
  const emailNorm = (email != null && String(email).trim()) ? String(email).trim() : '';
  const portalOn = (portal_enabled === '1' || portal_enabled === 1 ||
                    portal_enabled === true || portal_enabled === 'on') ? 1 : 0;
  if (portalOn && !emailNorm) {
    return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.email_is_required_when_portal_access_is_enabled')));
  }
  if (emailNorm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_email_format')));
  }
  try {
    await ensurePortalTables(pool).catch(() => {});
    let genderNorm = String(gender || '').trim();
    if (genderNorm !== 'Male' && genderNorm !== 'Female') genderNorm = 'Male';
    await ensurePatientAgeColumns(pool);
    const phoneNorm = normalizePatientPhone(phone);
    const nokPhoneNorm = normalizePatientPhone(next_of_kin_phone);
    if (!phoneNorm) {
      return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.a_valid_phone_number_is_required')));
    }
    const resolved = resolvePatientDobAgeFromBody(req.body, 'ep_dob_mode');
    let dobFinal = resolved.dob;
    let ageYearsFinal = resolved.age_years;
    let ageOnlyFinal = resolved.age_only_registration;
    let hasDob = dobFinal != null && String(dobFinal).trim() !== '';
    let hasAge = ageYearsFinal != null && Number.isFinite(ageYearsFinal);
    if (!hasDob && !hasAge) {
      const [[existing]] = await pool.query(
        'SELECT dob, age_years, age_only_registration FROM tbl_patient WHERE id = ? LIMIT 1',
        [pid]
      );
      if (existing) {
        dobFinal = existing.dob != null && String(existing.dob).trim() !== '' ? String(existing.dob).trim().split('T')[0].split(' ')[0] : null;
        const ageRaw = existing.age_years;
        ageYearsFinal = ageRaw != null && String(ageRaw).trim() !== '' ? parseInt(String(ageRaw), 10) : null;
        if (!Number.isFinite(ageYearsFinal)) ageYearsFinal = null;
        ageOnlyFinal = existing.age_only_registration === 1 || existing.age_only_registration === true ? 1 : 0;
        hasDob = dobFinal != null && String(dobFinal).trim() !== '';
        hasAge = ageYearsFinal != null && Number.isFinite(ageYearsFinal);
      }
    }
    if (!hasDob && !hasAge) {
      return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.date_of_birth_or_age_is_required')));
    }
    const duplicate = await findDuplicatePatient(pool, {
      first_name,
      last_name,
      phone: phoneNorm,
      dob: dobFinal,
      age_years: ageYearsFinal,
      age_only_registration: ageOnlyFinal,
      excludeId: pid,
    });
    if (duplicate) {
      return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.duplicate_patient', { id: duplicate.id, name: ((duplicate.first_name||'')+' '+(duplicate.last_name||'')).trim() || flashT(res, 'flash.patient') })));
    }
    await pool.query(`
      UPDATE tbl_patient SET
        first_name=?, last_name=?, gender=?, dob=?, age_years=?, age_only_registration=?, phone=?, email=?,
        address=?, patient_type=?, cni_number=?,
        next_of_kin_name=?, next_of_kin_relationship=?, next_of_kin_phone=?,
        portal_enabled=?
      WHERE id=?
    `, [first_name, last_name, genderNorm, dobFinal, ageYearsFinal, ageOnlyFinal, phoneNorm, emailNorm,
        normalizePatientAddress(address), patient_type, cni_number||null,
        next_of_kin_name||null, next_of_kin_relationship||null, nokPhoneNorm || null,
        portalOn, pid]);
    if (!portalOn) {
      await pool.query(
        'UPDATE tbl_patient_portal SET set_token=NULL, token_expires_at=NULL, updated_at=NOW() WHERE patient_id=?',
        [pid]
      ).catch(() => {});
    }
    res.redirect('/patients?msg=' + encodeURIComponent(flashT(res, 'flash.patient_profile_updated')))
  } catch(err) {
    console.error('EDIT PATIENT ERROR:', err.message);
    res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.update_failed', { message: err.message })));
  }
});

/** Absolute origin for links emailed or copied by staff (optional env override). */
function buildPublicBaseUrl(req) {
 const envBase = String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || '').trim().replace(/\/$/, '');
 if (envBase) return envBase;
 const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
 const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
 if (!host) return '';
 return `${proto}://${host}`;
}

// GET: Portal setup dialog data (patient email, portal flags)
app.get('/patients/:id/portal-setup', requireAuth, requirePerm('patient.directory.portal','patient_portal.manage','patient.write'), async (req, res) => {
 const pid = parseInt(req.params.id, 10);
 if (!pid) return res.status(400).json({ ok: false, error: 'Invalid patient.' });
 try {
  await ensurePortalTables(pool);
  const [[pat]] = await pool.query(
   'SELECT id, first_name, last_name, email, portal_enabled, status FROM tbl_patient WHERE id=? LIMIT 1',
   [pid]
  ).catch(() => [[null]]);
  if (!pat) return res.status(404).json({ ok: false, error: 'Patient not found.' });
  const [[pp]] = await pool.query(
   'SELECT password_hash, set_token, token_expires_at, status FROM tbl_patient_portal WHERE patient_id=? LIMIT 1',
   [pid]
  ).catch(() => [[null]]);
  const hasPassword = !!(pp && pp.password_hash && String(pp.password_hash).trim());
  let hasPendingInvite = !!(pp && pp.set_token && String(pp.set_token).trim());
  if (hasPendingInvite && pp.token_expires_at && new Date(pp.token_expires_at).getTime() < Date.now()) {
   hasPendingInvite = false;
  }
  res.json({
   ok: true,
   patient: pat,
   hasPassword,
   hasPendingInvite,
   inviteExpiresAt: pp && pp.token_expires_at ? pp.token_expires_at : null,
   portalRowStatus: pp ? pp.status : null
  });
 } catch (err) {
  console.error('GET portal-setup:', err.message);
  res.status(500).json({ ok: false, error: err.message });
 }
});

// POST: Enable portal and generate setup link, set password for patient, or disable portal
app.post('/patients/:id/portal-setup', requireAuth, requirePerm('patient.directory.portal','patient_portal.manage','patient.write'), async (req, res) => {
 const pid = parseInt(req.params.id, 10);
 const wantsJson =
  req.is('application/json') ||
  String(req.get('accept') || '').includes('application/json') ||
  String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';

 const jsonErr = (status, msg) => {
  if (wantsJson) return res.status(status).json({ ok: false, error: msg });
  return res.redirect('/patients?err=' + encodeURIComponent(msg));
 };
 const jsonOk = (payload) => {
  if (wantsJson) return res.json({ ok: true, ...payload });
  const q =
   payload && payload.message
    ? encodeURIComponent(payload.message)
    : encodeURIComponent(flashT(res, 'flash.portal_settings_updated'));
  return res.redirect('/patients?msg=' + q);
 };

 if (!pid) return jsonErr(400, 'Invalid patient.');

 try {
  await ensurePortalTables(pool);
  const mode = String(req.body.mode || 'invite').toLowerCase();
  const enable =
   req.body.portal_enabled === true ||
   req.body.portal_enabled === '1' ||
   req.body.portal_enabled === 1 ||
   req.body.portal_enabled === 'on';

  const [[pat]] = await pool.query(
   'SELECT id, first_name, last_name, email, portal_enabled, status, portal_password_hash FROM tbl_patient WHERE id=? LIMIT 1',
   [pid]
  ).catch(() => [[null]]);
  if (!pat) return jsonErr(404, 'Patient not found.');
  if (parseInt(pat.status, 10) !== 1) return jsonErr(400, 'Patient record is inactive.');

  const emailRaw = req.body.email != null ? String(req.body.email).trim() : '';
  const emailNorm = emailRaw || (pat.email != null ? String(pat.email).trim() : '');

  if (!enable) {
   await pool.query('UPDATE tbl_patient SET portal_enabled=0 WHERE id=?', [pid]).catch(() => {});
   await pool
    .query(
     'UPDATE tbl_patient_portal SET set_token=NULL, token_expires_at=NULL, updated_at=NOW() WHERE patient_id=?',
     [pid]
    )
    .catch(() => {});
   return jsonOk({ message: 'Patient portal access has been turned off for this record.', disabled: true });
  }

  if (!emailNorm) return jsonErr(400, 'Email is required for patient portal login.');
  const emailLower = emailNorm.toLowerCase();
  const [[emailDup]] = await pool.query(
   'SELECT id FROM tbl_patient WHERE LOWER(TRIM(email))=? AND id<>? LIMIT 1',
   [emailLower, pid]
  ).catch(() => [[null]]);
  if (emailDup) return jsonErr(400, 'This email is already used by another patient.');

  if (mode === 'password') {
   const p1 = String(req.body.password || '');
   const p2 = String(req.body.password2 || '');
   if (p1.length < 6) return jsonErr(400, 'Password must be at least 6 characters.');
   if (p1 !== p2) return jsonErr(400, 'Passwords do not match.');
   const hash = await bcrypt.hash(p1, 10);
   await pool.query('UPDATE tbl_patient SET email=?, portal_enabled=1 WHERE id=?', [emailNorm, pid]);
   const [[exists]] = await pool.query('SELECT patient_id FROM tbl_patient_portal WHERE patient_id=? LIMIT 1', [pid]);
   if (exists) {
    await pool.query(
     `UPDATE tbl_patient_portal SET password_hash=?, set_token=NULL, token_expires_at=NULL, status='active', updated_at=NOW() WHERE patient_id=?`,
     [hash, pid]
    );
   } else {
    await pool.query(
     `INSERT INTO tbl_patient_portal (patient_id, password_hash, set_token, token_expires_at, status) VALUES (?, ?, NULL, NULL, 'active')`,
     [pid, hash]
    );
   }
   await pool.query('UPDATE tbl_patient SET portal_password_hash=? WHERE id=?', [hash, pid]).catch(() => {});
   return jsonOk({
    message: 'Portal enabled. The patient can sign in with this email and the password you set.',
    mode: 'password'
   });
  }

  // Default: invite link (token)
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.query('UPDATE tbl_patient SET email=?, portal_enabled=1 WHERE id=?', [emailNorm, pid]);

  const [[row]] = await pool.query('SELECT patient_id FROM tbl_patient_portal WHERE patient_id=? LIMIT 1', [pid]);
  if (row) {
   await pool.query(
    `UPDATE tbl_patient_portal SET set_token=?, token_expires_at=?, status='active', updated_at=NOW() WHERE patient_id=?`,
    [token, expiresAt, pid]
   );
  } else {
   await pool.query(
    `INSERT INTO tbl_patient_portal (patient_id, password_hash, set_token, token_expires_at, status) VALUES (?, NULL, ?, ?, 'active')`,
    [pid, token, expiresAt]
   );
  }

  const base = buildPublicBaseUrl(req);
  const setupPath = `/portal/set-password?token=${encodeURIComponent(token)}`;
  const setupUrl = base ? `${base}${setupPath}` : setupPath;

  return jsonOk({
   message: 'Portal enabled. Share the setup link with the patient so they can choose a password.',
   mode: 'invite',
   setupUrl,
   setupPath,
   expiresAt: expiresAt.toISOString()
  });
 } catch (err) {
  console.error('POST portal-setup:', err.message);
  return jsonErr(500, err.message || 'Portal setup failed.');
  }
});

// ADD STAFF POST
const {
 staffProfilePhotoMiddleware: hmsStaffProfilePhotoMiddleware,
 uploadedStaffPhotoPath: hmsUploadedStaffPhotoPath,
} = require('./lib/staffProfilePhotoUpload');
app.post('/staff/add', requireAuth, requirePerm('employee.write'), hmsStaffProfilePhotoMiddleware(), async (req, res) => {
 const hmsStaffAccountGuard = require('./lib/hmsStaffAccountGuard');
 const actorRole = String(req.session.user?.role ?? '');
 const userPerms = res.locals.userPerms || [];
 const { first_name, last_name, username, password, emailid, phone, role, gender, profile_emoji } = req.body;
 if (!hmsStaffAccountGuard.canAssignEmployeeRole(actorRole, role)) {
  return res.status(403).send(hmsStaffAccountGuard.assignDeniedMessage(actorRole, role));
 }
 if (!hmsStaffAccountGuard.canManageEmployeePassword(actorRole, role, userPerms)) {
  return res.status(403).send('You do not have permission to set employee passwords.');
 }
 try {
 const { resolveProfileEmoji } = require('./lib/hmsEmployeeProfile');
 const profileEmoji = resolveProfileEmoji(profile_emoji, gender || 'Male');
const photoPath = hmsUploadedStaffPhotoPath(req.file) || null;
 const hashedPassword = await bcrypt.hash(password, 10);
 const [insertResult] = await pool.query(
'INSERT INTO tbl_employee (first_name, last_name, username, password, emailid, phone, gender, profile_emoji, photo_path, role, status, joining_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())',
[first_name, last_name, username, hashedPassword, emailid, phone, gender || 'Male', profileEmoji, photoPath, role]
 );
 try {
  const { ensureCashierOnEmployeeSave } = require('./lib/cashierIdentity');
  await ensureCashierOnEmployeeSave(pool, insertResult.insertId, role, {
   status: 1,
   facilityId: parseInt(req.session.facilityId, 10) || 1,
  });
 } catch (_) { /* non-blocking */ }
 res.redirect('/staff');
 } catch (err) {
 console.error(err);
 res.status(500).send('Error creating employee.');
 }
});

// ADD APPOINTMENT POST
app.post('/appointments/add', requireAuth, async (req, res) => {
 const { patient_id, department, doctor, date, time, message, doctor_id, slot, visit_type, payment_code } = req.body;
 try {
  const hmsOnlineBooking = require('./lib/hmsOnlineBooking');
  const appointmentPayment = require('./lib/appointmentPayment');
  await hmsOnlineBooking.ensureOnlineBookingSchema(pool).catch(() => {});
  await ensureAppointmentTelemedColumns(pool);
  await appointmentPayment.ensureAppointmentPaymentSchema(pool);
  const bookTime = String(slot || time || '').trim();
  const docId = parseInt(doctor_id, 10) || 0;
  let visitType = String(visit_type || 'in_person').trim().toLowerCase();
  if (visitType !== 'telemedicine' && visitType !== 'in_person') visitType = 'in_person';
  if (visitType === 'telemedicine' && !docId) {
   return res.redirect('/appointments?err=' + encodeURIComponent(flashT(res, 'flash.telemedicine_requires_doctor')));
  }
  if (docId && date && bookTime) {
   const avail = await hmsOnlineBooking.getAvailableSlots(pool, { doctorId: docId, date });
   const ok = (avail.slots || []).some((s) => s.value === bookTime);
   if (!ok) {
    return res.redirect('/appointments?err=' + encodeURIComponent(flashT(res, 'flash.that_slot_is_no_longer_available')));
   }
  }

  let linkedPaymentCode = null;
  let linkedTicketId = null;
  if (appointmentPayment.requiresPaymentCode(visitType)) {
   const pay = await appointmentPayment.validatePaymentForTeleAppointment(pool, {
    patientId: parseInt(patient_id, 10),
    paymentCode: payment_code,
    facilityId: req.session.facilityId || 1,
   });
   if (!pay.ok) {
    return res.redirect('/appointments?err=' + encodeURIComponent(pay.error || 'Invalid payment code.'));
   }
   linkedPaymentCode = pay.code;
   linkedTicketId = pay.ticketId;
  }

  const [maxRow] = await pool.query('SELECT MAX(id) AS max_id FROM tbl_appointment');
  const nextId = (maxRow[0].max_id || 0) + 1;
  const appt_id = `APT-${nextId}`;

  const [pRows] = await pool.query('SELECT first_name, last_name FROM tbl_patient WHERE id = ?', [patient_id]);
  const patient_name = pRows.length > 0 ? `${pRows[0].first_name} ${pRows[0].last_name}` : 'Unknown';

  let doctorLabel = doctor;
  if (docId) {
   const [[d]] = await pool.query('SELECT first_name, last_name FROM tbl_employee WHERE id=?', [docId]);
   if (d) doctorLabel = `Dr. ${d.first_name} ${d.last_name}`;
  }

  const colSet = await getAppointmentColumns(pool);
  const isPortalFlow = visitType === 'telemedicine';
  const statusVal = isPortalFlow ? 3 : 1;
  const fields = ['appointment_id', 'patient_id', 'patient_name', 'department', 'doctor', 'date', 'time', 'message', 'status', 'created_at'];
  const vals = ['?', '?', '?', '?', '?', '?', '?', '?', '?', 'NOW()'];
  const params = [appt_id, patient_id, patient_name, department, doctorLabel, date, bookTime, message, statusVal];
  if (colSet.has('doctor_id')) { fields.splice(6, 0, 'doctor_id'); vals.splice(6, 0, '?'); params.splice(6, 0, docId || null); }
  if (colSet.has('slot_start')) { fields.push('slot_start'); vals.push('?'); params.push(bookTime); }
  if (colSet.has('visit_type')) { fields.push('visit_type'); vals.push('?'); params.push(visitType); }
  if (colSet.has('portal_state')) { fields.push('portal_state'); vals.push('?'); params.push(isPortalFlow ? 'pending' : null); }
  if (colSet.has('payment_code') && linkedPaymentCode) { fields.push('payment_code'); vals.push('?'); params.push(linkedPaymentCode); }
  if (colSet.has('payment_ticket_id') && linkedTicketId) { fields.push('payment_ticket_id'); vals.push('?'); params.push(linkedTicketId); }
  if (colSet.has('department_name')) { fields.push('department_name'); vals.push('?'); params.push(department); }

  await pool.query(`INSERT INTO tbl_appointment (${fields.join(',')}) VALUES (${vals.join(',')})`, params);

  if (isPortalFlow && visitType === 'telemedicine') {
   const crypto = require('crypto');
   const room = `tssf-hms-${appt_id.toLowerCase()}-${crypto.randomBytes(6).toString('hex')}`;
   if (colSet.has('meeting_room')) {
    await pool.query('UPDATE tbl_appointment SET meeting_room=? WHERE appointment_id=?', [room, appt_id]).catch(() => {});
   }
  }

  const msgKey = isPortalFlow ? 'flash.telemedicine_request_submitted' : 'flash.appointment_booked';
  res.redirect('/appointments?msg=' + encodeURIComponent(flashT(res, msgKey)))
 } catch (err) {
  console.error(err);
  renderAppError(res, 500, 'page.book_appointment', 'Failed to book appointment.', { detail: err.message })
 }
});

// FRONT DESK COMMAND CENTER
app.get('/front-desk', requireAuth, async (req, res) => {
 try {
 const today = new Date().toISOString().split('T')[0];
 
 // 1. Stats
 const [statAppts] = await pool.query('SELECT COUNT(*) AS c FROM tbl_appointment WHERE status=1 AND date=?', [today]);
 const [statNew] = await pool.query('SELECT COUNT(*) AS c FROM tbl_patient WHERE DATE(created_at)=?', [today]);
 const [statPats] = await pool.query('SELECT COUNT(*) AS c FROM tbl_patient WHERE status=1');
 
 // 2. Emergency Patients
 const [emergencyPatients] = await pool.query(`
 SELECT v.id, v.queue_status, p.first_name, p.last_name, v.queue_started_at 
 FROM tbl_opd_visit v 
 JOIN tbl_patient p ON p.id = v.patient_id 
 WHERE v.visit_date = ? AND v.department LIKE '%Emergency%' 
 AND v.queue_status NOT IN ('completed', 'cancelled')
 ORDER BY v.queue_started_at DESC
 `, [today]);

 // 3. Today's Appointments
 const [todayAppts] = await pool.query(`
 SELECT patient_name, doctor, time, department 
 FROM tbl_appointment 
 WHERE status=1 AND date=? 
 ORDER BY time ASC LIMIT 10
 `, [today]);

 res.render('front-desk', {
 title: pageTitle(res, 'document_titles.front_desk', 'Front Desk — ZAIZENS'),
 pageData: {
   stats: {
     appts: statAppts[0].c,
     newPats: statNew[0].c,
     totalPats: statPats[0].c
   },
   emergencies: emergencyPatients,
   appointments: todayAppts
 },
 });
 } catch (err) {
 console.error(err);
 renderAppError(res, 500, 'page.load_front_desk', 'Front Desk load failure.', { detail: err.message })
 }
});

// DOCTORS DIRECTORY
app.get('/doctors', requireAuth, async (req, res) => {
 try {
  const hmsDoctorStaff = require('./lib/hmsDoctorStaff');
  const { resolveDoctorRoleIds, listDoctorSpecialisations } = require('./lib/hmsDoctorSpecialisations');
  const hmsStaffAccountGuard = require('./lib/hmsStaffAccountGuard');
  const doctors = await hmsDoctorStaff.fetchActiveDoctors(
    pool,
    'e.id, e.first_name, e.last_name, e.emailid, e.phone, e.bio, e.photo_path, e.primary_department, e.status'
  );
  const actorRole = String(req.session.user?.role || '');
  const [rolesRaw] = await pool.query('SELECT role, title FROM tbl_role ORDER BY CAST(role AS UNSIGNED)').catch(() => [[]]);
  const roles = hmsStaffAccountGuard.filterAssignableRoles(actorRole, rolesRaw || []);
  const [departments] = await pool
   .query('SELECT department_name AS name FROM tbl_department WHERE status=1 ORDER BY department_name')
   .catch(() => [[]]);
  const doctorRoleIds = await resolveDoctorRoleIds(pool);
  const specialisations = await listDoctorSpecialisations(pool);
  const perms = res.locals.userPerms || [];
  const canAddDoctor =
   actorRole === '1' ||
   actorRole === '99' ||
   perms.includes('*') ||
   perms.includes('employee.write');
  res.render('doctors', {
   title: pageTitle(res, 'document_titles.doctors', 'Doctors — ZAIZENS'),
   doctors,
   pageData: {
    doctors,
    roles,
    departments: departments || [],
    specialisations,
    doctorRoleIds,
    canAddDoctor,
   },
  });
 } catch (err) {
 console.error(err);
 renderAppError(res, 500, 'page.load_doctors', 'Could not fetch doctors.')
 }
});

// LABORATORY HUB
app.get('/laboratory', requireAuth, requirePerm('lab.read','lab.write','clinical.read','clinical.write','nursing.read'), async (req, res) => {
 try {
  const [[countRow]] = await pool.query(
   'SELECT COUNT(*) AS total FROM tbl_lab_result lr JOIN tbl_patient p ON p.id = lr.patient_id'
  ).catch(() => [[{ total: 0 }]]);
  const labTotal = parseInt(String(countRow?.total ?? 0), 10) || 0;
  const LAB_LIST_CAP = 2500;
  const [results] = await pool.query(
   `SELECT lr.*, p.first_name AS p_fn, p.last_name AS p_ln,
           e.first_name AS ref_fn, e.last_name AS ref_ln,
           oi_ref.first_name AS oi_ref_fn, oi_ref.last_name AS oi_ref_ln
      FROM tbl_lab_result lr
      JOIN tbl_patient p ON p.id = lr.patient_id
      LEFT JOIN tbl_employee e ON e.id = lr.referred_by_id
      LEFT JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
      LEFT JOIN tbl_consultation cons ON cons.id = oi.consultation_id
      LEFT JOIN tbl_employee oi_ref ON oi_ref.id = cons.created_by
     ORDER BY lr.id DESC
     LIMIT ?`,
   [LAB_LIST_CAP]
  ).catch(() => [[]]);
  const list = Array.isArray(results) ? results : [];
  for (const r of list) enrichLabRegistryRow(r);
 res.render('laboratory', labOdooLocals({
 title: pageTitle(res, 'document_titles.laboratory', 'Laboratory — ZAIZENS'),
 pageData: {
  results: list,
  labTotal,
  flash: req.query.msg || null,
  error: req.query.err || null,
  canView: true,
  canRecall: (res.locals.userPerms || []).includes('*') || (res.locals.userPerms || []).some((p) => /lab\.write|clinical\.write/.test(p)),
 },
 }));
 } catch (err) {
 console.error(err);
 renderAppError(res, 500, 'page.load_lab_results', 'Could not fetch lab results.')
 }
});

app.get('/laboratory/report/:id', requireAuth, requirePerm('lab.read','lab.write','clinical.read','clinical.write','nursing.read'), async (req, res) => {
 try {
  const rawId = String(req.params.id || '').trim();
  const idMatch = rawId.match(/\d+/);
  const id = idMatch ? parseInt(idMatch[0], 10) || 0 : 0;
  if (id < 1) return res.redirect('/laboratory?err=' + encodeURIComponent(flashT(res, 'flash.invalid_report_id')));
  const [[row]] = await pool
   .query(
    `SELECT lr.*, p.first_name AS p_fn, p.last_name AS p_ln,
            e.first_name AS ref_fn, e.last_name AS ref_ln,
            oi_ref.first_name AS oi_ref_fn, oi_ref.last_name AS oi_ref_ln
       FROM tbl_lab_result lr
       JOIN tbl_patient p ON p.id = lr.patient_id
       LEFT JOIN tbl_employee e ON e.id = lr.referred_by_id
       LEFT JOIN tbl_opd_order_item oi ON oi.id = lr.opd_order_item_id
       LEFT JOIN tbl_consultation cons ON cons.id = oi.consultation_id
       LEFT JOIN tbl_employee oi_ref ON oi_ref.id = cons.created_by
      WHERE lr.id = ? LIMIT 1`,
    [id]
   )
   .catch(() => [[null]]);
  if (!row) return res.redirect('/laboratory?err=' + encodeURIComponent(flashT(res, 'flash.report_not_found')));
  enrichLabRegistryRow(row);
  let structured = null;
  if (row.structured_result) {
   try {
    structured = JSON.parse(row.structured_result);
   } catch (_) {
    structured = null;
   }
  }
  let correctionHistory = [];
  let validateCode = '';
  if (row.opd_order_item_id) {
   const [cRows] = await pool
    .query(
     `SELECT a.superseded_findings, a.superseded_conclusion, a.performed_at,
             TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,''))) AS performer_name
        FROM tbl_diagnostic_result_correction_audit a
        LEFT JOIN tbl_employee e ON e.id = a.performed_by
       WHERE a.event_type = 'correct' AND a.module = 'laboratory' AND a.opd_order_item_id = ?
       ORDER BY a.id ASC`,
     [row.opd_order_item_id]
    )
    .catch(() => [[]]);
   correctionHistory = cRows || [];
   const [[oi2]] = await pool
    .query('SELECT service_code FROM tbl_opd_order_item WHERE id=? LIMIT 1', [row.opd_order_item_id])
    .catch(() => [[null]]);
   if (oi2 && oi2.service_code) validateCode = String(oi2.service_code).trim();
  } else {
   const [cRows] = await pool
    .query(
     `SELECT a.superseded_findings, a.superseded_conclusion, a.performed_at,
             TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,''))) AS performer_name
        FROM tbl_diagnostic_result_correction_audit a
        LEFT JOIN tbl_employee e ON e.id = a.performed_by
       WHERE a.event_type = 'correct' AND a.module = 'laboratory' AND a.lab_result_id = ?
       ORDER BY a.id ASC`,
     [id]
    )
    .catch(() => [[]]);
   correctionHistory = cRows || [];
  }
  const { fetchAttachmentsForResult } = require('./lib/diagnosticResultAttachment');
  const attachments = await fetchAttachmentsForResult(pool, 'laboratory', id);
  const { loadLabPrintPayload, buildDiagnosticPrintPayload } = require('./lib/diagnosticReportPrintPayload');
  let printPayload = await loadLabPrintPayload(pool, id);
  if (!printPayload) {
   enrichLabRegistryRow(row);
   printPayload = buildDiagnosticPrintPayload('laboratory', row, structured, validateCode, null);
  }
  const templatesPath =
   row.opd_order_item_id && validateCode
    ? `/lab/templates?code=${encodeURIComponent(validateCode)}&oi=${row.opd_order_item_id}&lock=1&autoload=1`
    : `/lab/templates?lab_result_id=${id}&pid=${row.patient_id || ''}`;
  res.render('laboratory-report-view', {
   title: pageTitle(res, 'document_titles.lab_test_result', 'Lab test · {{name}} · ZAIZENS', { name: row.test_name || 'Result' }),
   row,
   structured,
   correctionHistory,
   validateCode,
   attachments,
   printPayload,
   handoverModule: 'laboratory',
   handoverTemplatesPath: templatesPath,
   flash: req.query.msg || null,
  });
 } catch (err) {
  console.error(err);
  res.redirect('/laboratory?err=' + encodeURIComponent(flashT(res, 'flash.could_not_open_report')));
 }
});

app.get('/laboratory/print-all/:patientId', requireAuth, requirePerm('lab.read','lab.write','clinical.read','clinical.write','nursing.read'), async (req, res) => {
 try {
  const patientId = parseInt(String(req.params.patientId || '').replace(/\D/g, ''), 10) || 0;
  if (patientId < 1) {
   return res.redirect('/laboratory?err=' + encodeURIComponent(flashT(res, 'flash.invalid_patient', { defaultValue: 'Invalid patient.' })));
  }
  const [[pat]] = await pool
   .query('SELECT id, first_name, last_name FROM tbl_patient WHERE id = ? LIMIT 1', [patientId])
   .catch(() => [[null]]);
  const { loadLabPrintPayloadsByPatient, buildBatchPrintResponse } = require('./lib/diagnosticReportPrintPayload');
  const reports = await loadLabPrintPayloadsByPatient(pool, patientId);
  const patientName = pat ? [pat.first_name, pat.last_name].filter(Boolean).join(' ').trim() : '';
  const batchData = buildBatchPrintResponse('laboratory', null, reports, {
   batchType: 'patient',
   patientNumericId: patientId,
   patientName,
   patientId: `#P-${patientId}`,
  });
  batchData.packageTitle = 'Laboratory results package';
  const { renderDiagBatchPrint } = require('./lib/diagnosticBatchPrintRoute');
  return renderDiagBatchPrint(req, res, {
   title: pageTitle(res, 'document_titles.lab_batch_print', 'Laboratory results — {{name}}', { name: patientName || `#P-${patientId}` }),
   batchData,
   backUrl: '/laboratory',
   emptyMessage: flashT(res, 'flash.no_printable_lab_batch', { defaultValue: 'No completed printable lab results for this patient yet.' }),
   noSelectionMessage: flashT(res, 'flash.no_printable_lab_selection', { defaultValue: 'None of the selected results are printable yet.' }),
   module: 'laboratory',
   pickerLabels: {
    title: flashT(res, 'diag_batch_picker.title_lab', { ns: 'common', defaultValue: 'Select lab results to print' }),
    subtitle: flashT(res, 'diag_batch_picker.subtitle', { ns: 'common', defaultValue: 'Choose one or more completed reports, then print a combined patient handover package.' }),
    selectAll: flashT(res, 'diag_batch_picker.select_all', { ns: 'common', defaultValue: 'Select all' }),
    clearAll: flashT(res, 'diag_batch_picker.clear_all', { ns: 'common', defaultValue: 'Clear all' }),
    printSelected: flashT(res, 'diag_batch_picker.print_selected', { ns: 'common', defaultValue: 'Print selected' }),
    printAll: flashT(res, 'diag_batch_picker.print_all', { ns: 'common', defaultValue: 'Print all' }),
    cancel: flashT(res, 'actions.cancel', { ns: 'common', defaultValue: 'Cancel' }),
   },
  });
 } catch (err) {
  console.error('laboratory print-all:', err.message);
  return res.redirect('/laboratory?err=' + encodeURIComponent(flashT(res, 'flash.print_batch_failed', { defaultValue: 'Could not prepare batch print.', message: err.message })));
 }
});

app.get('/laboratory/print-all-by-code/:code', requireAuth, requirePerm('lab.read','lab.write','clinical.read','clinical.write','nursing.read'), async (req, res) => {
 try {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) {
   return res.redirect('/laboratory/validate?err=' + encodeURIComponent(flashT(res, 'flash.invalid_code', { defaultValue: 'Invalid code.' })));
  }
  const { loadLabPrintPayloadsByCode, buildBatchPrintResponse } = require('./lib/diagnosticReportPrintPayload');
  const reports = await loadLabPrintPayloadsByCode(pool, code);
  const batchData = buildBatchPrintResponse('laboratory', code, reports);
  batchData.packageTitle = 'Laboratory results package';
  const { renderDiagBatchPrint } = require('./lib/diagnosticBatchPrintRoute');
  return renderDiagBatchPrint(req, res, {
   title: pageTitle(res, 'document_titles.lab_batch_print_code', 'Laboratory results — {{code}}', { code }),
   batchData,
   backUrl: '/laboratory/validate/' + encodeURIComponent(code),
   emptyMessage: flashT(res, 'flash.no_printable_lab_batch_code', { defaultValue: 'No completed printable results on this code yet.' }),
   noSelectionMessage: flashT(res, 'flash.no_printable_lab_selection', { defaultValue: 'None of the selected results are printable yet.' }),
   module: 'laboratory',
   pickerLabels: {
    title: flashT(res, 'diag_batch_picker.title_lab_code', { ns: 'common', defaultValue: 'Select lab results for this code' }),
    subtitle: flashT(res, 'diag_batch_picker.subtitle_code', { ns: 'common', defaultValue: 'Choose completed reports on this service code to include in the print package.' }),
    selectAll: flashT(res, 'diag_batch_picker.select_all', { ns: 'common', defaultValue: 'Select all' }),
    clearAll: flashT(res, 'diag_batch_picker.clear_all', { ns: 'common', defaultValue: 'Clear all' }),
    printSelected: flashT(res, 'diag_batch_picker.print_selected', { ns: 'common', defaultValue: 'Print selected' }),
    printAll: flashT(res, 'diag_batch_picker.print_all', { ns: 'common', defaultValue: 'Print all' }),
    cancel: flashT(res, 'actions.cancel', { ns: 'common', defaultValue: 'Cancel' }),
   },
  });
 } catch (err) {
  console.error('laboratory print-all-by-code:', err.message);
  const code = String(req.params.code || '').trim();
  return res.redirect('/laboratory/validate/' + encodeURIComponent(code) + '?err=' + encodeURIComponent(flashT(res, 'flash.print_batch_failed', { defaultValue: 'Could not prepare batch print.', message: err.message })));
 }
});

// Lab test templates (lib/labTestTemplates.js) — JSON API + technician workbench UI
let labApiRouter;
try {
 labApiRouter = require('./routes/labApi')(pool);
 bootStep('route-mount:labApi', 'ok');
} catch (e) {
 bootStep('route-mount:labApi', 'fail', e);
 labApiRouter = (req, res) =>
  res.status(503).json({ ok: false, error: 'Lab API module failed to load. Upload routes/labApi.js and restart.' });
}
app.use(
 '/api/lab',
 requireAuth,
 requirePerm('lab.read', 'lab.write', 'clinical.read', 'clinical.write', 'nursing.read'),
 labApiRouter
);

let radApiRouter;
try {
 radApiRouter = require('./routes/radApi')(pool);
 bootStep('route-mount:radApi', 'ok');
} catch (e) {
 bootStep('route-mount:radApi', 'fail', e);
 radApiRouter = (req, res) =>
  res.status(503).json({ ok: false, error: 'Radiology API module failed to load. Upload routes/radApi.js and restart.' });
}
app.use(
 '/api/rad',
 requireAuth,
 requirePerm('radiology.read', 'radiology.write', 'clinical.read', 'clinical.write', 'nursing.read'),
 radApiRouter
);

// LABORATORY === Æ’ ===   Add New Test Request (POST)
app.post('/laboratory/add', requireAuth, async (req, res) => {
 const { patient_id, test_name, referred_by_id, appointment_date, notes } = req.body;
 try {
 const fid = await ensureFacilityRow(pool, req.session.facilityId || 1);
 const pid = parseInt(patient_id, 10) || 0;
 const auth = await authorizeLabTest(pool, {
  patientId: pid,
  facilityId: fid,
  dept: 'laboratory',
  testName: (test_name || '').trim(),
 });
 if (!auth.ok) {
  return res.redirect(
   '/laboratory?err=' + encodeURIComponent(clinicalMsgT(res, auth, { fallbackKey: 'flash.lab_rad_payment_or_request' }))
  );
 }
 if (auth.meta && auth.meta.duplicateWarning) {
  console.warn('[lab] duplicate request warning patient=%s: %s', pid, auth.meta.duplicateWarning);
 }
 await pool.query(
 `INSERT INTO tbl_lab_result
 (facility_id, patient_id, test_name, referred_by_id, appointment_date, notes, status, created_at)
 VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
 [
 fid,
 parseInt(patient_id) || null,
 (test_name || '').trim(),
 parseInt(referred_by_id) || null,
 appointment_date || new Date().toISOString().split('T')[0],
 (notes || '').trim()
 ]
 );
 res.redirect('/laboratory?msg=' + encodeURIComponent(flashT(res, 'flash.test_request_submitted_successfully')))
 } catch (err) {
 console.error('Lab add error:', err.message);
 res.redirect('/laboratory?err=' + encodeURIComponent(flashT(res, 'flash.failed_to_submit_test_request', { message: err.message })));
 }
});

// IPD / ER lab & radiology order alerts — inbox + API for banner strip
app.get('/api/clinical-dept-alerts', requireAuth, async (req, res) => {
 try {
  const dept = String(req.query.dept || '').toLowerCase();
  if (!clinicalDeptAlerts.CLINICAL_ALERT_DEPTS.has(dept)) {
   return res.status(400).json({ ok: false, error: 'Invalid dept' });
  }
  const perms = res.locals.userPerms || [];
  if (!perms.includes('*')) {
   if (dept === 'laboratory' && !perms.includes('lab.write')) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
   }
   if (dept === 'radiology' && !perms.includes('radiology.write')) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
   }
   if (dept === 'pharmacy' && !perms.includes('pharmacy.write')) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
   }
  }
  const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const items = await clinicalDeptAlerts.listUnacked(pool, dept, uid, 35);
  return res.json({ ok: true, items });
 } catch (e) {
  return res.status(500).json({ ok: false, error: e.message || 'Server error' });
 }
});

app.post('/api/clinical-dept-alerts/:id/ack', requireAuth, async (req, res) => {
 try {
  const id = parseInt(req.params.id, 10) || 0;
  const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  if (id < 1 || uid < 1) return res.status(400).json({ ok: false });
  const wantsJson =
   (req.headers.accept || '').includes('application/json') ||
   String(req.body._format || '') === 'json';
  const htmlBackRaw = String(req.body._return || '').trim();
  const htmlBack = htmlBackRaw.startsWith('/') && !htmlBackRaw.startsWith('//') ? htmlBackRaw : '';
  const [arows] = await pool.query('SELECT * FROM tbl_clinical_dept_alert WHERE id=? LIMIT 1', [id]).catch(() => [[]]);
  const arow = arows && arows[0];
  if (!arow) {
   if (htmlBack) return res.redirect(htmlBack + '?err=' + encodeURIComponent(flashT(res, 'flash.alert_not_found')));
   return res.status(404).json({ ok: false, error: 'Not found' });
  }
  const perms = res.locals.userPerms || [];
  let forbidden = false;
  if (!perms.includes('*')) {
   if (arow.target_dept === 'laboratory' && !perms.includes('lab.write')) forbidden = true;
   if (arow.target_dept === 'radiology' && !perms.includes('radiology.write')) forbidden = true;
   if (arow.target_dept === 'pharmacy' && !perms.includes('pharmacy.write')) forbidden = true;
  }
  if (forbidden) {
   if (htmlBack) return res.redirect(htmlBack + '?err=' + encodeURIComponent(flashT(res, 'flash.you_cannot_acknowledge_this_alert')));
   return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  await clinicalDeptAlerts.acknowledge(pool, id, uid);

  const action = String(req.body.action || '').trim().toLowerCase();
  const openWorkbench = action === 'open_rad' || action === 'open_bench' || action === 'open';
  const oiId = parseInt(String(arow.opd_order_item_id || ''), 10) || 0;
  const fid = Math.max(1, parseInt(String(req.session.facilityId || 1), 10) || 1);
  const validatedCode = String(req.body.validated_code || '')
    .trim()
    .toUpperCase();

  async function redirectOpdToValidateEntry(dept, errMsg) {
   const base = dept === 'radiology' ? '/radiology/validate' : '/laboratory/validate';
   let url =
    base +
    '?from=inbox&alert_id=' +
    id +
    (oiId ? '&oi=' + oiId : '') +
    '&err=' +
    encodeURIComponent(errMsg || 'Validate the service code from the cashier ticket first.');
   return res.redirect(url);
  }

  async function redirectToTemplates(dept, code, extraQs) {
   const base = dept === 'radiology' ? '/radiology/templates' : '/laboratory/templates';
   let url = base + '?from=alert&autoload=1&alert_id=' + id;
   if (code) {
    url += '&code=' + encodeURIComponent(code) + '&lock=1';
   }
   if (oiId) url += '&oi=' + oiId;
   if (extraQs) url += extraQs;
   return res.redirect(url);
  }

  async function resolveValidatedOpdCode(expectedPrefix, orderServiceCode) {
   if (!validatedCode || !validatedCode.startsWith(expectedPrefix + '-')) {
    return { ok: false, error: 'Payment code validation is required for outpatient orders.' };
   }
   const { authorizeServiceCodeValidate } = require('./lib/authorizeLabTest');
   const auth = await authorizeServiceCodeValidate(pool, validatedCode, fid);
   if (!auth.ok) {
    return { ok: false, error: auth.error || 'Service code not valid.' };
   }
   const scOrder = String(orderServiceCode || '')
    .trim()
    .toUpperCase();
   if (scOrder && validatedCode !== scOrder) {
    return {
      ok: false,
      error: 'The validated code does not match this order line. Use the ticket for this test.',
    };
   }
   return { ok: true, code: validatedCode };
  }

  if (!wantsJson && openWorkbench && arow.target_dept === 'laboratory' && oiId > 0) {
   const [[oi]] = await pool
    .query('SELECT id, service_code, item_type FROM tbl_opd_order_item WHERE id=? LIMIT 1', [oiId])
    .catch(() => [[null]]);
   const sc2 = String((oi && oi.service_code) || '')
    .trim()
    .toUpperCase();
   if (oi && String(oi.item_type) === 'laboratory' && sc2.startsWith('LAB-')) {
    const ipdEr = await isIpdOrErAlert(pool, arow.id);
    if (ipdEr) {
     return redirectToTemplates('laboratory', sc2);
    }
    const v = await resolveValidatedOpdCode('LAB', sc2);
    if (!v.ok) {
     return redirectOpdToValidateEntry('laboratory', v.error);
    }
    return redirectToTemplates('laboratory', v.code);
   }
  }
  if (!wantsJson && openWorkbench && arow.target_dept === 'radiology' && oiId > 0) {
   const [[oi]] = await pool
    .query('SELECT id, service_code, item_type FROM tbl_opd_order_item WHERE id=? LIMIT 1', [oiId])
    .catch(() => [[null]]);
   const sc2 = String((oi && oi.service_code) || '')
    .trim()
    .toUpperCase();
   if (oi && String(oi.item_type) === 'radiology' && sc2.startsWith('RAD-')) {
    const ipdEr = await isIpdOrErAlert(pool, arow.id);
    if (ipdEr) {
     return redirectToTemplates('radiology', sc2);
    }
    const v = await resolveValidatedOpdCode('RAD', sc2);
    if (!v.ok) {
     return redirectOpdToValidateEntry('radiology', v.error);
    }
    return redirectToTemplates('radiology', v.code);
   }
  }

  if (!wantsJson && openWorkbench && arow.target_dept === 'radiology') {
   const ipdEr = await isIpdOrErAlert(pool, arow.id);
   if (!ipdEr) {
    return redirectOpdToValidateEntry(
     'radiology',
     'Validate the RAD service code from the cashier ticket before opening this order.'
    );
   }
   const suggestion = arow.test_display ? suggestRadTemplateForOrderName(arow.test_display) : null;
   let extra = '';
   if (suggestion) {
    extra +=
     '&cat=' +
     encodeURIComponent(suggestion.catKey) +
     '&test=' +
     encodeURIComponent(suggestion.testId) +
     '&tname=' +
     encodeURIComponent(suggestion.testName || suggestion.testId);
   }
   return redirectToTemplates('radiology', '', extra);
  }

  if (!wantsJson && openWorkbench && arow.target_dept === 'laboratory') {
   const ipdEr = await isIpdOrErAlert(pool, arow.id);
   if (!ipdEr) {
    return redirectOpdToValidateEntry(
     'laboratory',
     'Validate the LAB service code from the cashier ticket before opening this order.'
    );
   }
   const suggestion = arow.test_display ? suggestTemplateForOrderName(arow.test_display) : null;
   let extra = '';
   if (suggestion) {
    extra +=
     '&cat=' +
     encodeURIComponent(suggestion.catKey) +
     '&test=' +
     encodeURIComponent(suggestion.testId) +
     '&tname=' +
     encodeURIComponent(suggestion.testName || suggestion.testId);
   }
   return redirectToTemplates('laboratory', '', extra);
  }

  if (wantsJson) return res.json({ ok: true });
  const back = String(req.body._return || req.get('Referer') || '/dashboard').trim();
  if (!back.startsWith('/') || back.startsWith('//')) return res.redirect('/dashboard');
  return res.redirect(back + (back.includes('?') ? '&' : '?') + 'msg=' + encodeURIComponent(flashT(res, 'flash.marked_as_seen')));
 } catch (e) {
  const rb = String(req.body._return || '').trim();
  if (rb.startsWith('/') && !rb.startsWith('//')) {
   return res.redirect(rb + '?err=' + encodeURIComponent(e.message || 'Server error'));
  }
  return res.status(500).json({ ok: false, error: e.message || 'Server error' });
 }
});

async function enrichClinicalDeptAlertsWithOi(db, alerts) {
 const list = Array.isArray(alerts) ? alerts : [];
 const ids = [...new Set(list.map((a) => a && a.opd_order_item_id).filter((n) => n && Number(n) > 0))];
 if (!ids.length) return;
 const [rows] = await db
  .query(
   `SELECT id, service_code, item_type FROM tbl_opd_order_item WHERE id IN (${ids.map(() => '?').join(',')})`,
   ids
  )
  .catch(() => [[]]);
 const map = new Map((rows || []).map((r) => [r.id, r]));
 for (const a of list) {
  const o = map.get(a.opd_order_item_id);
  if (o) {
   a.oi_service_code = o.service_code;
   a.oi_item_type = o.item_type;
  }
 }
}

app.get('/laboratory/order-alerts', requireAuth, requirePerm('lab.write'), async (req, res) => {
 try {
  const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const unacked = await clinicalDeptAlerts.listUnacked(pool, 'laboratory', uid, 80);
  await enrichClinicalDeptAlertsWithOi(pool, unacked);
  const recent = await clinicalDeptAlerts.listAllRecent(pool, 'laboratory', 60);
  const { labPageData } = require('./lib/reactRouteHelpers');
  res.render('clinical-dept-inbox', {
   title: pageTitle(res, 'document_titles.lab_order_alerts', 'Laboratory · Order alerts'),
   ...labPageData('order-alerts', {
    dept: 'laboratory',
    deptLabel: 'Laboratory',
    unacked,
    recent,
    flash: req.query.msg || null,
    error: req.query.err || null,
   }),
  });
 } catch (e) {
  renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });
 }
});

app.get('/radiology/order-alerts', requireAuth, requirePerm('radiology.write'), async (req, res) => {
 try {
  const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const unacked = await clinicalDeptAlerts.listUnacked(pool, 'radiology', uid, 80);
  await enrichClinicalDeptAlertsWithOi(pool, unacked);
  const recent = await clinicalDeptAlerts.listAllRecent(pool, 'radiology', 60);
  res.render('clinical-dept-inbox', {
   title: pageTitle(res, 'document_titles.radiology_order_alerts', 'Radiology · Order alerts'),
   dept: 'radiology',
   deptLabel: 'Radiology',
   unacked,
   recent,
   flash: req.query.msg || null,
   error: req.query.err || null,
  });
 } catch (e) {
  renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });
 }
});

app.get('/pharmacy/order-alerts', requireAuth, requirePerm('pharmacy.write'), async (req, res) => {
 try {
  const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const unacked = await clinicalDeptAlerts.listUnacked(pool, 'pharmacy', uid, 80);
  const recent = await clinicalDeptAlerts.listAllRecent(pool, 'pharmacy', 60);
  res.render('clinical-dept-inbox', {
   title: pageTitle(res, 'document_titles.pharmacy_order_alerts', 'Pharmacy · Order alerts'),
   dept: 'pharmacy',
   deptLabel: 'Pharmacy',
   unacked,
   recent,
   flash: req.query.msg || null,
   error: req.query.err || null,
  });
 } catch (e) {
  renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });
 }
});

// ─────────────────────────────────────────────────────────────────────────────
// RADIOLOGY  ▸  schema-aware helpers
// ─────────────────────────────────────────────────────────────────────────────
let _radColsCache = null;
async function getRadiologyColumns() {
 if (_radColsCache) return _radColsCache;
 try {
  const [rows] = await pool.query(
   `SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tbl_radiology_result'`
  );
  _radColsCache = new Set(rows.map(r => r.COLUMN_NAME));
 } catch { _radColsCache = new Set(); }
 return _radColsCache;
}
// Build a SELECT list that always exposes `exam_name` to the view, regardless
// of whether the underlying column is named `exam_name` (current schema) or
// `test_name` (legacy schema some deployments still have).
function radSelectExpr(cols) {
 if (cols.has('exam_name') && cols.has('test_name')) {
  return 'COALESCE(rr.exam_name, rr.test_name) AS exam_name';
 }
 if (cols.has('exam_name')) return 'rr.exam_name AS exam_name';
 if (cols.has('test_name')) return 'rr.test_name AS exam_name';
 return "'' AS exam_name";
}

const hmsRad = require('./lib/hmsRadiology');

function radOdooLocals(extra) {
 return Object.assign(
  { radiologyOdooApp: true, radStatusLabel: hmsRad.statusLabel },
  extra || {}
 );
}

function labOdooLocals(extra) {
 return Object.assign({ laboratoryOdooApp: true }, extra || {});
}

async function radSharedLookups() {
 const [patients] = await pool
  .query('SELECT id, first_name, last_name FROM tbl_patient WHERE status=1 ORDER BY last_name, first_name')
  .catch(() => [[]]);
 const [doctors] = await pool
  .query("SELECT id, first_name, last_name FROM tbl_employee WHERE role=2 AND status=1 ORDER BY last_name")
  .catch(() => [[]]);
 const [radCatalog] = await pool
  .query(
   `SELECT id, name, price FROM tbl_service_catalog WHERE status=1 AND ${imagingCategoryWhere()} ORDER BY name`
  )
  .catch(() => [[]]);
 return { patients: patients || [], doctors: doctors || [], radCatalog: radCatalog || [] };
}

// RADIOLOGY HUB — Odoo-style request worklist
app.get('/radiology', requireAuth, requirePerm('radiology.read','radiology.write','clinical.read','clinical.write','nursing.read'), async (req, res) => {
 try {
  await hmsRad.ensureRadiologySchema(pool);
  const stats = await hmsRad.worklistStats(pool);
  const [[countRow]] = await pool
   .query('SELECT COUNT(*) AS total FROM tbl_radiology_result rr JOIN tbl_patient p ON p.id = rr.patient_id')
   .catch(() => [[{ total: 0 }]]);
  const radTotal = parseInt(String(countRow?.total ?? 0), 10) || 0;
  const results = await hmsRad.listRegistryResults(pool, { limit: 2500 });
  const list = Array.isArray(results) ? results : [];
  for (const r of list) enrichRadRegistryRow(r);
  res.render('radiology', {
   title: pageTitle(res, 'document_titles.radiology_results', 'Radiology — Results'),
   pageData: {
    results: list,
    radTotal,
    stats,
    flash: req.query.msg || null,
    error: req.query.err || null,
    canView: true,
   },
  });
 } catch (err) {
  console.error(err);
  renderAppError(res, 500, 'page.load_radiology_requests', 'Could not fetch radiology results.');
 }
});

app.get('/radiology/requests/new', requireAuth, requirePerm('radiology.write','radiology.read','clinical.write'), async (req, res) => {
 const err = String(req.query.err || '').trim();
 return res.redirect('/radiology/validate' + (err ? '?err=' + encodeURIComponent(err) : ''));
});

app.post('/radiology/requests', requireAuth, requirePerm('radiology.write','clinical.write'), async (req, res) => {
 if (!req.body || !String(req.body.service_code || req.body.code || '').trim()) {
  return res.redirect('/radiology/validate?err=' + encodeURIComponent(flashT(res, 'flash.validate_the_rad_service_code_before_creating_a_radiology_request')));
 }
 try {
  await hmsRad.ensureRadiologySchema(pool);
  const fid = await ensureFacilityRow(pool, req.session.facilityId || 1);
  const pid = parseInt(req.body.patient_id, 10) || 0;
  const auth = await authorizeLabTest(pool, {
   patientId: pid,
   facilityId: fid,
   dept: 'radiology',
   testName: String(req.body.exam_name || req.body.test_name || '').trim(),
  });
  if (!auth.ok) {
   return res.redirect(
    '/radiology/validate?err=' +
     encodeURIComponent(clinicalMsgT(res, auth, { fallbackKey: 'flash.lab_rad_payment_or_request' }))
   );
  }
  const uid = req.session.userId || req.session.user?.id || null;
  req.body.submit = req.body.submit || (req.body.action === 'submit' ? '1' : '');
  const created = await hmsRad.createRequest(pool, req.body, uid);
  res.redirect('/radiology/requests/' + created.id + '?msg=' + encodeURIComponent(flashT(res, 'flash.request_saved', { no: created.requestNo })));
 } catch (e) {
  console.error(e);
  res.redirect('/radiology/validate?err=' + encodeURIComponent(e.message || 'Save failed'));
 }
});

app.get('/radiology/requests/:id', requireAuth, requirePerm('radiology.read','radiology.write','clinical.read','clinical.write','nursing.read'), async (req, res) => {
 try {
  await hmsRad.ensureRadiologySchema(pool);
  const detail = await hmsRad.getRequest(pool, req.params.id);
  if (!detail) {
   return renderAppError(res, 404, 'page.radiology_not_found', 'Radiology request not found.');
  }
  res.render(
   'radiology-request',
   radOdooLocals({
    title: pageTitle(res, 'document_titles.radiology_request', 'Radiology request'),
    detail,
    flash: req.query.msg || null,
    error: req.query.err || null,
   })
  );
 } catch (e) {
  console.error(e);
  renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });
 }
});

app.post('/radiology/requests/:id/accept', requireAuth, requirePerm('radiology.write','clinical.write'), async (req, res) => {
 try {
  await hmsRad.acceptRequest(pool, req.params.id);
  res.redirect('/radiology/requests/' + req.params.id + '?msg=' + encodeURIComponent(flashT(res, 'flash.request_accepted_exams_in_progress')));
 } catch (e) {
  res.redirect('/radiology/requests/' + req.params.id + '?err=' + encodeURIComponent(e.message || 'Accept failed'));
 }
});

app.get('/radiology/results', requireAuth, requirePerm('radiology.read','radiology.write','clinical.read','clinical.write','nursing.read'), async (req, res) => {
 try {
  await hmsRad.ensureRadiologySchema(pool);
  const results = await hmsRad.listConsolidatedResults(pool, { q: req.query.q || '' });
  res.render(
   'radiology-results',
   radOdooLocals({
    title: pageTitle(res, 'document_titles.radiology_results', 'Radiology test results'),
    results,
    searchQ: req.query.q || '',
   })
  );
 } catch (e) {
  console.error(e);
  renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });
 }
});

app.get('/radiology/configuration', requireAuth, requirePerm('radiology.write','radiology.read'), async (req, res) => {
 try {
  await hmsRad.ensureRadiologySchema(pool);
  const rooms = await hmsRad.listRooms(pool, false);
  const testGroups = await hmsRad.listTestGroups(pool, true);
  res.render(
   'radiology-config',
   radOdooLocals({
    title: pageTitle(res, 'document_titles.radiology_config', 'Radiology configuration'),
    rooms,
    testGroups,
    flash: req.query.msg || null,
    error: req.query.err || null,
   })
  );
 } catch (e) {
  console.error(e);
  renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });
 }
});

app.post('/radiology/configuration/rooms', requireAuth, requirePerm('radiology.write'), async (req, res) => {
 try {
  await hmsRad.ensureRadiologySchema(pool);
  await hmsRad.saveRoom(pool, req.body);
  res.redirect('/radiology/configuration?msg=' + encodeURIComponent(flashT(res, 'flash.room_saved')));
 } catch (e) {
  res.redirect('/radiology/configuration?err=' + encodeURIComponent(e.message || 'Save failed'));
 }
});

app.post('/radiology/configuration/groups', requireAuth, requirePerm('radiology.write'), async (req, res) => {
 try {
  await hmsRad.ensureRadiologySchema(pool);
  await hmsRad.saveTestGroup(pool, req.body);
  res.redirect('/radiology/configuration?msg=' + encodeURIComponent(flashT(res, 'flash.test_group_saved')));
 } catch (e) {
  res.redirect('/radiology/configuration?err=' + encodeURIComponent(e.message || 'Save failed'));
 }
});

app.get('/radiology/api/test-group/:id', requireAuth, async (req, res) => {
 try {
  const lines = await hmsRad.getTestGroupLines(pool, req.params.id);
  res.json({ ok: true, lines });
 } catch (e) {
  res.status(500).json({ ok: false, message: e.message });
 }
});

// RADIOLOGY  ▸  Add New Imaging Request (POST) — schema-aware
app.post('/radiology/add', requireAuth, async (req, res) => {
 const { patient_id, test_name, exam_name, modality, body_part, referred_by_id, appointment_date, notes } = req.body;
 try {
 const cols = await getRadiologyColumns();
 const fields = [];
 const placeholders = [];
 const vals = [];
 const push = (col, val) => { fields.push(col); placeholders.push('?'); vals.push(val); };
 push('patient_id', parseInt(patient_id) || null);
 const examVal = (exam_name || test_name || '').trim();
 if (cols.has('exam_name')) push('exam_name', examVal);
 else if (cols.has('test_name')) push('test_name', examVal);
 if (cols.has('modality')) push('modality', (modality || 'X-Ray').trim());
 if (cols.has('body_part')) push('body_part', (body_part || '').trim());
 if (cols.has('referred_by_id')) push('referred_by_id', parseInt(referred_by_id) || null);
 if (cols.has('appointment_date')) push('appointment_date', appointment_date || new Date().toISOString().split('T')[0]);
 if (cols.has('notes')) push('notes', (notes || '').trim());
 if (cols.has('status')) push('status', 'pending');
 if (cols.has('created_by') && req.session.user) push('created_by', req.session.user.id);
 const sql = `INSERT INTO tbl_radiology_result (${fields.join(',')}) VALUES (${placeholders.join(',')})`;
 await pool.query(sql, vals);
 const back = req.body._return === 'workflow' ? '/radiology/workflow' : '/radiology';
 res.redirect(back + '?msg=' + encodeURIComponent(flashT(res, 'flash.imaging_request_submitted_successfully')))
 } catch (err) {
 console.error('Radiology add error:', err.message);
 const back = req.body._return === 'workflow' ? '/radiology/workflow' : '/radiology';
 res.redirect(back + '?err=' + encodeURIComponent(flashT(res, 'flash.failed_to_submit_imaging_request', { message: err.message })));
 }
});

// RADIOLOGY  ▸  Workflow board (Pending → In Progress → Completed)
app.get('/radiology/workflow', requireAuth, async (req, res) => {
 try {
  const cols = await getRadiologyColumns();
  const examCol = radSelectExpr(cols);
  // Some deployments use `dob`, others use `date_of_birth` for tbl_patient.
  const [pCols] = await pool.query(
   `SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tbl_patient'`
  ).catch(() => [[]]);
  const pColSet = new Set((pCols || []).map(r => r.COLUMN_NAME));
  const dobExpr = pColSet.has('date_of_birth') ? 'p.date_of_birth' : (pColSet.has('dob') ? 'p.dob' : 'NULL');
  const genderExpr = pColSet.has('gender') ? 'p.gender' : (pColSet.has('sex') ? 'p.sex' : 'NULL');
  const baseSelect = `
   SELECT rr.*, ${examCol},
          oi.service_code AS service_code,
          p.first_name AS p_fn, p.last_name AS p_ln, ${genderExpr} AS p_gender, ${dobExpr} AS p_dob,
          e.first_name AS ref_fn, e.last_name AS ref_ln
   FROM tbl_radiology_result rr
   LEFT JOIN tbl_opd_order_item oi ON oi.id = rr.opd_order_item_id
   JOIN tbl_patient p ON p.id = rr.patient_id
   LEFT JOIN tbl_employee e ON e.id = rr.referred_by_id`;
  const wfLimit = pagination.DEFAULT_PAGE_SIZE;
  const [pending]    = await pool.query(`${baseSelect} WHERE rr.status='pending'     ORDER BY rr.appointment_date ASC, rr.id ASC LIMIT ${wfLimit}`);
  const [inProgress] = await pool.query(`${baseSelect} WHERE rr.status='in_progress' ORDER BY rr.updated_at DESC LIMIT ${wfLimit}`);
  const [completed]  = await pool.query(`${baseSelect} WHERE rr.status='received'    ORDER BY rr.updated_at DESC LIMIT ${wfLimit}`);

  const [patients]  = await pool.query(
   'SELECT id, first_name, last_name FROM tbl_patient WHERE status=1 ORDER BY last_name, first_name'
  ).catch(() => [[]]);
  const [doctors]   = await pool.query(
   "SELECT id, first_name, last_name FROM tbl_employee WHERE role=2 AND status=1 ORDER BY last_name"
  ).catch(() => [[]]);
  const [radCatalog] = await pool.query(
   `SELECT id, name, price FROM tbl_service_catalog WHERE status=1 AND ${imagingCategoryWhere()} ORDER BY name`
  ).catch(() => [[]]);

  res.render(
   'radiology-workflow',
   radOdooLocals({
    title: pageTitle(res, 'document_titles.radiology_workflow', 'Radiology Workflow — ZAIZENS'),
    pageData: {
     pending,
     inProgress,
     completed,
     patients: patients || [],
     doctors: doctors || [],
     radCatalog: radCatalog || [],
     flash: req.query.msg || null,
     error: req.query.err || null,
    },
   })
  );
 } catch (err) {
  console.error('Radiology workflow error:', err);
  renderAppError(res, 500, 'page.load_radiology_workflow', 'Could not load radiology workflow.', { detail: err.message })
 }
});

// RADIOLOGY  ▸  Start an exam (move to In Progress)
app.post('/radiology/:id/start', requireAuth, async (req, res) => {
 try {
  const id = parseInt(req.params.id) || 0;
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const [r] = await pool.query(
   `UPDATE tbl_radiology_result SET status='in_progress', updated_at=NOW() WHERE id=? AND status='pending'`,
   [id]
  );
  if (!r.affectedRows) return res.status(409).json({ error: 'Exam is not in pending state.' });
  res.json({ ok: true, id, status: 'in_progress' });
 } catch (err) {
  console.error('Radiology start error:', err.message);
  res.status(500).json({ error: err.message });
 }
});

// RADIOLOGY  ▸  Complete an exam (write findings, move to Received)
app.post('/radiology/:id/complete', requireAuth, async (req, res) => {
 try {
  const id = parseInt(req.params.id) || 0;
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const { findings, conclusion_code } = req.body || {};
  const cols = await getRadiologyColumns();
  const sets = ["status='received'", 'updated_at=NOW()'];
  const vals = [];
  if (cols.has('findings')) { sets.push('findings=?'); vals.push((findings || '').trim()); }
  if (cols.has('conclusion_code')) { sets.push('conclusion_code=?'); vals.push((conclusion_code || '').trim() || null); }
  vals.push(id);
  const [r] = await pool.query(
   `UPDATE tbl_radiology_result SET ${sets.join(', ')} WHERE id=? AND status IN ('pending','in_progress')`,
   vals
  );
  if (!r.affectedRows) return res.status(409).json({ error: 'Exam already completed or not found.' });
  const [[row]] = await pool
   .query('SELECT request_id FROM tbl_radiology_result WHERE id=? LIMIT 1', [id])
   .catch(() => [[null]]);
  if (row?.request_id) {
   await hmsRad.syncRequestStatus(pool, row.request_id).catch(() => {});
  }
  res.json({ ok: true, id, status: 'received' });
 } catch (err) {
  console.error('Radiology complete error:', err.message);
  res.status(500).json({ error: err.message });
 }
});

// RADIOLOGY  ▸  Reset to pending (undo a mistaken start)
app.post('/radiology/:id/reset', requireAuth, async (req, res) => {
 try {
  const id = parseInt(req.params.id) || 0;
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const [r] = await pool.query(
   `UPDATE tbl_radiology_result SET status='pending', updated_at=NOW() WHERE id=? AND status='in_progress'`,
   [id]
  );
  if (!r.affectedRows) return res.status(409).json({ error: 'Only in-progress exams can be reset.' });
  res.json({ ok: true, id, status: 'pending' });
 } catch (err) {
  console.error('Radiology reset error:', err.message);
  res.status(500).json({ error: err.message });
 }
});

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE-CODE VALIDATION & FULFILLMENT
// One unified workflow for the three back-office stations:
//   • Lab tech     → /laboratory/validate    (LAB-####-XXXXXXXX)
//   • Radiologist  → /radiology/validate     (RAD-####-XXXXXXXX)
//   • Pharmacist   → /pharmacy/validate      (PHA-####-XXXXXXXX)
//
// Each station enters the code on a small form, the page then resolves the
// items, the patient and the requesting doctor, and offers a submission form
// to record findings (lab/rad) or mark drugs as served (pharmacy).
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_KIND_BY_PREFIX = { LAB: 'laboratory', RAD: 'radiology', PHA: 'pharmacy' };

/**
 * Unlock a lab result line for correction (same audit + revision_pending as
 * POST /laboratory/recall-for-edit/:code). Caller must validate service code / permissions.
 */
async function performLabRevisionRecallByOrderItem(pool, oid, reason, uid) {
 await ensureDiagnosticCorrectionSchema(pool);
 const [[lr]] = await pool
  .query('SELECT id, notes, conclusion_code FROM tbl_lab_result WHERE opd_order_item_id=? LIMIT 1', [oid])
  .catch(() => [[null]]);
 if (!lr) return { ok: false, error: 'No lab result to unlock.' };
 await insertDiagnosticCorrectionAudit(pool, {
  module: 'laboratory',
  lab_result_id: lr.id,
  radiology_result_id: null,
  opd_order_item_id: oid,
  event_type: 'recall',
  superseded_findings: lr.notes || '',
  superseded_conclusion: lr.conclusion_code || null,
  new_findings: null,
  new_conclusion: null,
  reason,
  performed_by: uid
 }).catch((e) => console.error('lab recall audit', e));
 await pool.query('UPDATE tbl_lab_result SET revision_pending=1 WHERE id=?', [lr.id]);
 return { ok: true };
}

/** Unlock a standalone lab result (no opd_order_item_id) for correction. */
async function performLabRevisionRecallStandalone(pool, lrId, reason, uid) {
 await ensureDiagnosticCorrectionSchema(pool);
 const [[lr]] = await pool
  .query(
   'SELECT id, notes, conclusion_code, opd_order_item_id FROM tbl_lab_result WHERE id=? LIMIT 1',
   [lrId]
  )
  .catch(() => [[null]]);
 if (!lr) return { ok: false, error: 'Report not found.' };
 if (lr.opd_order_item_id) return { ok: false, error: 'Use order-linked recall for this row.' };
 await insertDiagnosticCorrectionAudit(pool, {
  module: 'laboratory',
  lab_result_id: lr.id,
  radiology_result_id: null,
  opd_order_item_id: null,
  event_type: 'recall',
  superseded_findings: lr.notes || '',
  superseded_conclusion: lr.conclusion_code || null,
  new_findings: null,
  new_conclusion: null,
  reason,
  performed_by: uid
 }).catch((e) => console.error('lab recall audit standalone', e));
 await pool.query('UPDATE tbl_lab_result SET revision_pending=1 WHERE id=?', [lr.id]);
 return { ok: true };
}

/** Resolves a service code into paid items + patient + doctor + result rows. */
async function loadServiceCode(db, code, facilityId) {
 await ensureDiagnosticCorrectionSchema(db);
 const c = String(code || '').trim().toUpperCase();
 if (!c) return null;
 const prefix = c.split('-')[0];
 const kind = SERVICE_KIND_BY_PREFIX[prefix];
 if (!kind) return { error: 'Unknown code format. Expected LAB-…, RAD-… or PHA-…' };

 await ensureOpdOrderItemsSchema(db);

 const [allItems] = await db.query(
  `SELECT oi.*, p.first_name, p.last_name, p.phone, p.dob, p.gender,
          c.id AS consult_id, c.created_by AS doctor_id, c.created_at AS consult_at,
          e.first_name AS doctor_fn, e.last_name AS doctor_ln
     FROM tbl_opd_order_item oi
     JOIN tbl_patient p ON p.id = oi.patient_id
     LEFT JOIN tbl_consultation c ON c.id = oi.consultation_id
     LEFT JOIN tbl_employee e ON e.id = c.created_by
    WHERE oi.service_code = ? AND oi.item_type = ?
    ORDER BY oi.id ASC`,
  [c, kind]
 );
 if (!allItems || allItems.length === 0) {
  return { error: `Code "${c}" was not found or has no ${kind} items.` };
 }

 if (kind === 'pharmacy') {
  const consultIds = [...new Set((allItems || []).map((i) => parseInt(i.consultation_id, 10)).filter((n) => n > 0))];
  if (consultIds.length) {
   const [siblings] = await db
    .query(
     `SELECT oi.*, p.first_name, p.last_name, p.phone, p.dob, p.gender,
             c.id AS consult_id, c.created_by AS doctor_id, c.created_at AS consult_at,
             e.first_name AS doctor_fn, e.last_name AS doctor_ln
        FROM tbl_opd_order_item oi
        JOIN tbl_patient p ON p.id = oi.patient_id
        LEFT JOIN tbl_consultation c ON c.id = oi.consultation_id
        LEFT JOIN tbl_employee e ON e.id = c.created_by
       WHERE oi.consultation_id IN (${consultIds.map(() => '?').join(',')})
         AND oi.item_type = 'pharmacy'
         AND LOWER(TRIM(COALESCE(oi.status, ''))) = 'pending'
         AND (oi.catalog_id IS NULL OR COALESCE(oi.unit_price, 0) <= 0)`,
     consultIds
    )
    .catch(() => [[]]);
   const seen = new Set((allItems || []).map((i) => i.id));
   for (const s of siblings || []) {
    if (!seen.has(s.id)) {
     if (!s.service_code || !String(s.service_code).trim()) s.service_code = c;
     allItems.push(s);
     seen.add(s.id);
    }
   }
  }
 }

  const { filterOrderItemsPaidForFulfillment } = require('./lib/assertOrderLineAndTicketValid');
  const pharmFul = require('./lib/opdPharmacyFulfillment');
  const fid = parseInt(String(facilityId || ''), 10) || 1;

  let items;
  let unpaidPendingCustom = [];
  let visibleItems = allItems || [];

  if (kind === 'pharmacy') {
   visibleItems = (allItems || []).filter((oi) => {
    const st = String(oi.status || '').toLowerCase();
    return !['external', 'cancelled', 'refunded'].includes(st);
   });
   if (!visibleItems.length) {
    return { error: `Code "${c}" was not found or has no pharmacy items.` };
   }
   items = visibleItems.map(pharmFul.enrichPharmacyLine);
   unpaidPendingCustom = items.filter((oi) => oi.is_pending_custom && !oi.is_paid);
   const paidOnCode = await filterOrderItemsPaidForFulfillment(db, visibleItems, fid);
   if (!paidOnCode.length && !unpaidPendingCustom.length) {
    return {
     error:
      'No paid items on this service code. Collect payment at Cashier for the selected prescriptions first.',
    };
   }
  } else {
   items = await filterOrderItemsPaidForFulfillment(db, allItems, fid);
   if (!items.length) {
    return {
     error:
      'No paid items on this service code. Collect payment at Cashier for the selected prescriptions first.',
    };
   }
  }
 const patient = {
  id: items[0].patient_id,
  first_name: items[0].first_name,
  last_name: items[0].last_name,
  phone: items[0].phone,
  dob: items[0].dob,
  gender: items[0].gender
 };
 const doctor = items[0].doctor_id ? {
  id: items[0].doctor_id,
  name: `Dr. ${items[0].doctor_fn || ''} ${items[0].doctor_ln || ''}`.trim()
 } : null;
 // Companion result rows (lab / radiology) keyed by opd_order_item_id
 let resultMap = new Map();
 if (kind === 'laboratory') {
  const ids = items.map(i => i.id);
  const [rs] = await db.query(
   `SELECT id, opd_order_item_id, status, notes, conclusion_code, updated_at, source, external_doc_id,
          COALESCE(revision_pending,0) AS revision_pending
      FROM tbl_lab_result WHERE opd_order_item_id IN (${ids.map(() => '?').join(',')})`,
   ids
  ).catch(() => [[]]);
  for (const r of rs || []) resultMap.set(r.opd_order_item_id, r);
 } else if (kind === 'radiology') {
  const ids = items.map(i => i.id);
  const [rs] = await db.query(
   `SELECT id, opd_order_item_id, status, findings, conclusion_code, updated_at, source, external_doc_id,
          COALESCE(revision_pending,0) AS revision_pending
      FROM tbl_radiology_result WHERE opd_order_item_id IN (${ids.map(() => '?').join(',')})`,
   ids
  ).catch(() => [[]]);
  for (const r of rs || []) resultMap.set(r.opd_order_item_id, r);
 }
 // Stamp each item with `external_doc_path` (URL) when we have one — used
 // by the validate-detail view to render a "View uploaded result" link.
 const docIds = [];
 for (const r of resultMap.values()) {
  if (r && r.external_doc_id) docIds.push(parseInt(r.external_doc_id, 10));
 }
 const docMap = new Map();
 if (docIds.length) {
  const [docs] = await db.query(
   `SELECT id, file_path, original_name FROM tbl_patient_external_document
    WHERE id IN (${docIds.map(() => '?').join(',')})`,
   docIds
  ).catch(() => [[]]);
  for (const d of docs || []) docMap.set(d.id, d);
 }
 for (const it of items) {
  const r = resultMap.get(it.id);
  if (r && r.external_doc_id && docMap.has(r.external_doc_id)) {
   it.external_doc_path = docMap.get(r.external_doc_id).file_path;
  }
 }
 if (kind === 'pharmacy') {
  const consultIds = [...new Set(items.map((i) => parseInt(i.consult_id, 10)).filter((n) => n > 0))];
  const medByName = new Map();
  for (const cid of consultIds) {
   const [[cRow]] = await db
    .query('SELECT medications_json FROM tbl_consultation WHERE id = ? LIMIT 1', [cid])
    .catch(() => [[null]]);
   if (!cRow || !cRow.medications_json) continue;
   try {
    const meds = JSON.parse(cRow.medications_json);
    for (const m of Array.isArray(meds) ? meds : []) {
     const key = String(m && m.name ? m.name : '').trim().toLowerCase();
     if (key) medByName.set(key, m);
    }
   } catch (_) {}
  }
  for (const it of items) {
   const key = String(it.item_name || '').trim().toLowerCase();
   const rx = key ? medByName.get(key) : null;
   if (rx) {
    it.rx_dosage = rx.dosage || '';
    it.rx_frequency = rx.frequency || '';
    it.rx_duration = rx.duration || '';
    it.rx_timing = rx.timing || '';
    it.rx_instructions = rx.instructions || '';
   }
  }
 }
 return { ok: true, kind, code: c, items, patient, doctor, resultMap,
  unpaidPendingCustom: kind === 'pharmacy' ? unpaidPendingCustom : [],
  unpaidCount: kind === 'pharmacy'
   ? unpaidPendingCustom.length
   : Math.max(0, allItems.length - items.length) };
}

/** Render entry form for a station. */
function renderValidateEntry(res, kind, opts = {}) {
 const { labPageData } = require('./lib/reactRouteHelpers');
 const validateTitleKey =
  kind === 'laboratory'
   ? 'document_titles.validate_code_lab'
   : kind === 'radiology'
    ? 'document_titles.validate_code_radiology'
    : 'document_titles.validate_code_pharmacy';
 const validateTitleFallback =
  kind === 'laboratory'
   ? 'Lab · Validate code'
   : kind === 'radiology'
    ? 'Radiology · Validate code'
    : 'Pharmacy · Validate code';
 res.render('service-validate', {
  title: pageTitle(res, validateTitleKey, validateTitleFallback),
  ...labPageData('validate', {
   kind,
   code: opts.code || '',
   error: opts.error || null,
   flash: opts.flash || null,
   fromInbox: !!opts.fromInbox,
   inboxAlertId: opts.inboxAlertId || null,
   inboxOi: opts.inboxOi || null,
  }),
 });
}

function validateEntryOptsFromQuery(req) {
 const fromInbox = String(req.query.from || '') === 'inbox';
 return {
  flash: req.query.msg,
  error: req.query.err,
  fromInbox,
  inboxAlertId: parseInt(String(req.query.alert_id || ''), 10) || null,
  inboxOi: parseInt(String(req.query.oi || ''), 10) || null,
 };
}

/** Render the per-station detail page. */
function serializeResultMapForView(resultMap) {
 const out = {};
 if (resultMap instanceof Map) {
  for (const [k, v] of resultMap.entries()) out[String(k)] = v;
 } else if (resultMap && typeof resultMap === 'object') {
  for (const [k, v] of Object.entries(resultMap)) out[String(k)] = v;
 }
 return out;
}

function validateHubMeta(kind) {
 if (kind === 'radiology') {
  return {
   label: 'Radiology',
   icon: 'fa-film',
   grad: 'linear-gradient(135deg,#0891b2,#0e7490)',
   templatesPath: '/radiology/templates',
   registryPath: '/radiology',
   recallPath: '/radiology/recall-for-edit',
   reportPath: '/radiology/report',
  };
 }
 return {
  label: 'Laboratory',
  icon: 'fa-flask',
  grad: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
  templatesPath: '/lab/templates',
  registryPath: '/laboratory',
  recallPath: '/laboratory/recall-for-edit',
  reportPath: '/laboratory/report',
 };
}

/** Render the per-station detail page. */
function renderValidateDetail(res, ctx, opts = {}) {
 const { labPageData, serializeValidateCtx } = require('./lib/reactRouteHelpers');
 if (!ctx || !ctx.ok) {
  return renderValidateEntry(res, ctx?.kind || 'laboratory', { code: ctx?.code || '', error: ctx?.error || opts.error });
 }
 if (ctx.kind === 'pharmacy') {
  res.render('service-validate-detail', {
   title: pageTitle(res, 'document_titles.pharmacy_validate_detail', 'Pharmacy · {{code}}', { code: ctx.code }),
   ...labPageData('validate-detail', {
    ...serializeValidateCtx(ctx),
    flash: opts.flash || null,
    error: opts.error || null,
    expiryByOi: opts.expiryByOi || {},
    stockByOi: opts.stockByOi || {},
   }),
  });
  return;
 }
 const meta = validateHubMeta(ctx.kind);
 const detailTitleKey =
  ctx.kind === 'radiology' ? 'document_titles.radiology_validate_detail' : 'document_titles.lab_validate_detail';
 const detailTitleFallback = (ctx.kind === 'radiology' ? 'Radiology' : 'Laboratory') + ' · {{code}}';
 res.render('service-validate-detail', {
  title: pageTitle(res, detailTitleKey, detailTitleFallback, { code: ctx.code }),
  validateHub: true,
  validateKind: ctx.kind,
  validateCode: ctx.code,
  validateMeta: meta,
  items: ctx.items || [],
  patient: ctx.patient || {},
  doctor: ctx.doctor || null,
  resultMap: serializeResultMapForView(ctx.resultMap),
  flash: opts.flash || null,
  error: opts.error || null,
  authSource: opts.authSource || null,
 });
}

// ── Lab ──────────────────────────────────────────────────────────────────────
app.get('/laboratory/validate', requireAuth, (req, res) => {
 const code = (req.query.code || '').toString().trim();
 const entryOpts = validateEntryOptsFromQuery(req);
 if (!code) return renderValidateEntry(res, 'laboratory', entryOpts);
 return res.redirect('/laboratory/validate/' + encodeURIComponent(code));
});

app.get('/laboratory/validate/:code', requireAuth, async (req, res) => {
 try {
  const code = String(req.params.code || '').trim();
  const fid = req.session.facilityId || 1;
  const auth = await authorizeServiceCodeValidate(pool, code, fid);
  if (!auth.ok) {
   return renderValidateEntry(res, 'laboratory', {
    code,
    error: auth.error || 'Code not valid for laboratory work.',
   });
  }
  const ctx = await loadServiceCode(pool, code, fid);
  if (!ctx || !ctx.ok) return renderValidateEntry(res, 'laboratory', { code, error: ctx?.error || 'Code not found' });
  if (ctx.kind !== 'laboratory') return renderValidateEntry(res, 'laboratory', { code, error: `Code belongs to ${ctx.kind}, not laboratory.` });
  return renderValidateDetail(res, ctx, {
   flash: req.query.msg,
   error: req.query.err,
   authSource: auth.source || null,
  });
 } catch (e) {
  console.error('lab validate:', e);
  return renderValidateEntry(res, 'laboratory', { code: req.params.code, error: e.message });
 }
});

app.post('/laboratory/submit/:code', requireAuth, async (req, res) => {
 try {
  await ensureDiagnosticCorrectionSchema(pool);
  const fid = req.session.facilityId || 1;
  const auth = await authorizeServiceCodeValidate(pool, req.params.code, fid);
  if (!auth.ok) {
   return res.redirect('/laboratory/validate?err=' + encodeURIComponent(auth.error || 'Payment required.'));
  }
  const ctx = await loadServiceCode(pool, req.params.code, fid);
  if (!ctx || !ctx.ok || ctx.kind !== 'laboratory') {
   return res.redirect('/laboratory/validate?err=' + encodeURIComponent(ctx?.error || 'Invalid code.'));
  }
  const findingsArr = Array.isArray(req.body['findings[]']) ? req.body['findings[]'] : [req.body['findings[]']].filter(Boolean);
  const conclusionArr = Array.isArray(req.body['conclusion[]']) ? req.body['conclusion[]'] : [req.body['conclusion[]']].filter(Boolean);
  const reasonArr = Array.isArray(req.body['correction_reason[]'])
   ? req.body['correction_reason[]']
   : [req.body['correction_reason[]']].filter(Boolean);
  const idsArr = Array.isArray(req.body['oi_id[]']) ? req.body['oi_id[]'] : [req.body['oi_id[]']].filter(Boolean);
  const uid = req.session.userId || req.session.user?.id || 1;

  let touched = 0;
  for (let i = 0; i < idsArr.length; i++) {
   const oid = parseInt(idsArr[i], 10) || 0;
   if (!oid) continue;
   const findings = (findingsArr[i] || '').toString().trim();
   const conclusion = (conclusionArr[i] || '').toString().trim();
   if (!findings) continue;
   const [[lrRow]] = await pool
    .query(
     'SELECT id, notes, conclusion_code, COALESCE(revision_pending,0) AS revision_pending FROM tbl_lab_result WHERE opd_order_item_id=? LIMIT 1',
     [oid]
    )
    .catch(() => [[null]]);
   if (!lrRow) {
    const oiRow = ctx.items.find((x) => x.id === oid);
    if (!oiRow) continue;
    const fid = oiRow.facility_id || req.session.facilityId || 1;
    await pool.query(
     `INSERT INTO tbl_lab_result
       (facility_id, patient_id, test_name, referred_by_id, appointment_date, notes,
        status, created_at, opd_order_item_id, conclusion_code, source, revision_pending)
      VALUES (?, ?, ?, ?, ?, ?, 'received', NOW(), ?, ?, 'in_house', 0)`,
     [
      fid,
      oiRow.patient_id,
      oiRow.item_name || 'Lab test',
      ctx.doctor?.id || null,
      new Date().toISOString().slice(0, 10),
      findings,
      oid,
      conclusion || null
     ]
    );
   } else {
    const oldNotes = (lrRow.notes || '').toString();
    const oldConc = (lrRow.conclusion_code || '').toString();
    const newNotes = findings;
    const newConc = (conclusion || '').toString();
    const changed = oldNotes !== newNotes || oldConc !== newConc;
    if (changed && lrRow.id) {
     const reason = (reasonArr[i] || '').toString().trim() || null;
     try {
      await insertDiagnosticCorrectionAudit(pool, {
       module: 'laboratory',
       lab_result_id: lrRow.id,
       radiology_result_id: null,
       opd_order_item_id: oid,
       event_type: 'correct',
       superseded_findings: oldNotes,
       superseded_conclusion: oldConc || null,
       new_findings: newNotes,
       new_conclusion: newConc || null,
       reason,
       performed_by: uid
      });
     } catch (aerr) {
      console.error('lab correction audit', aerr);
     }
    }
    await pool.query(
     `UPDATE tbl_lab_result SET notes=?, conclusion_code=?, status='received', updated_at=NOW(), source='in_house', revision_pending=0 WHERE id=?`,
     [findings, conclusion || null, lrRow.id]
    );
   }
   await pool
    .query(`UPDATE tbl_opd_order_item SET served_at=NOW(), served_by=?, served_notes=? WHERE id=?`, [uid, findings, oid])
    .catch(() => {});
   touched++;
  }
  return res.redirect('/laboratory/validate/' + encodeURIComponent(ctx.code) + '?msg=' + encodeURIComponent(`${touched} lab result(s) saved.`));
 } catch (e) {
  console.error('lab submit:', e);
  return res.redirect('/laboratory/validate/' + encodeURIComponent(req.params.code) + '?err=' + encodeURIComponent(e.message));
 }
});

// ── Radiology ────────────────────────────────────────────────────────────────
app.get('/radiology/validate', requireAuth, (req, res) => {
 const code = (req.query.code || '').toString().trim();
 const entryOpts = validateEntryOptsFromQuery(req);
 if (!code) return renderValidateEntry(res, 'radiology', entryOpts);
 return res.redirect('/radiology/validate/' + encodeURIComponent(code));
});

app.get('/radiology/validate/:code', requireAuth, async (req, res) => {
 try {
  const code = String(req.params.code || '').trim();
  const fid = req.session.facilityId || 1;
  const auth = await authorizeServiceCodeValidate(pool, code, fid);
  if (!auth.ok) {
   return renderValidateEntry(res, 'radiology', {
    code,
    error: auth.error || 'Code not valid for radiology work.',
   });
  }
  const ctx = await loadServiceCode(pool, code, fid);
  if (!ctx || !ctx.ok) return renderValidateEntry(res, 'radiology', { code, error: ctx?.error || 'Code not found' });
  if (ctx.kind !== 'radiology') return renderValidateEntry(res, 'radiology', { code, error: `Code belongs to ${ctx.kind}, not radiology.` });
  return renderValidateDetail(res, ctx, { flash: req.query.msg, error: req.query.err, authSource: auth.source || null });
 } catch (e) {
  console.error('rad validate:', e);
  return renderValidateEntry(res, 'radiology', { code: req.params.code, error: e.message });
 }
});

app.post('/radiology/submit/:code', requireAuth, async (req, res) => {
 try {
  await ensureDiagnosticCorrectionSchema(pool);
  const fid = req.session.facilityId || 1;
  const auth = await authorizeServiceCodeValidate(pool, req.params.code, fid);
  if (!auth.ok) {
   return res.redirect('/radiology/validate?err=' + encodeURIComponent(auth.error || 'Payment required.'));
  }
  const ctx = await loadServiceCode(pool, req.params.code, fid);
  if (!ctx || !ctx.ok || ctx.kind !== 'radiology') {
   return res.redirect('/radiology/validate?err=' + encodeURIComponent(ctx?.error || 'Invalid code.'));
  }
  const findingsArr = Array.isArray(req.body['findings[]']) ? req.body['findings[]'] : [req.body['findings[]']].filter(Boolean);
  const conclusionArr = Array.isArray(req.body['conclusion[]']) ? req.body['conclusion[]'] : [req.body['conclusion[]']].filter(Boolean);
  const reasonArr = Array.isArray(req.body['correction_reason[]'])
   ? req.body['correction_reason[]']
   : [req.body['correction_reason[]']].filter(Boolean);
  const idsArr = Array.isArray(req.body['oi_id[]']) ? req.body['oi_id[]'] : [req.body['oi_id[]']].filter(Boolean);
  const uid = req.session.userId || req.session.user?.id || 1;
  let touched = 0;
  for (let i = 0; i < idsArr.length; i++) {
   const oid = parseInt(idsArr[i], 10) || 0;
   if (!oid) continue;
   const findings = (findingsArr[i] || '').toString().trim();
   const conclusion = (conclusionArr[i] || '').toString().trim();
   if (!findings) continue;
   const [[rrRow]] = await pool
    .query(
     'SELECT id, findings, conclusion_code, COALESCE(revision_pending,0) AS revision_pending FROM tbl_radiology_result WHERE opd_order_item_id=? LIMIT 1',
     [oid]
    )
    .catch(() => [[null]]);
   if (!rrRow) {
    const oiRow = ctx.items.find((x) => x.id === oid);
    if (!oiRow) continue;
    const fid = oiRow.facility_id || req.session.facilityId || 1;
    await pool.query(
     `INSERT INTO tbl_radiology_result
        (facility_id, patient_id, exam_name, modality, body_part, referred_by_id, appointment_date,
         findings, notes, status, created_at, opd_order_item_id, conclusion_code, source, revision_pending)
      VALUES (?, ?, ?, 'X-Ray', '', ?, ?, ?, NULL, 'received', NOW(), ?, ?, 'in_house', 0)`,
     [
      fid,
      oiRow.patient_id,
      oiRow.item_name || 'Imaging',
      ctx.doctor?.id || null,
      new Date().toISOString().slice(0, 10),
      findings,
      oid,
      conclusion || null
     ]
    );
   } else {
    const oldFind = (rrRow.findings || '').toString();
    const oldConc = (rrRow.conclusion_code || '').toString();
    const newFind = findings;
    const newConc = (conclusion || '').toString();
    const changed = oldFind !== newFind || oldConc !== newConc;
    if (changed && rrRow.id) {
     const reason = (reasonArr[i] || '').toString().trim() || null;
     try {
      await insertDiagnosticCorrectionAudit(pool, {
       module: 'radiology',
       lab_result_id: null,
       radiology_result_id: rrRow.id,
       opd_order_item_id: oid,
       event_type: 'correct',
       superseded_findings: oldFind,
       superseded_conclusion: oldConc || null,
       new_findings: newFind,
       new_conclusion: newConc || null,
       reason,
       performed_by: uid
      });
     } catch (aerr) {
      console.error('rad correction audit', aerr);
     }
    }
    await pool.query(
     `UPDATE tbl_radiology_result SET findings=?, conclusion_code=?, status='received', updated_at=NOW(), source='in_house', revision_pending=0 WHERE id=?`,
     [findings, conclusion || null, rrRow.id]
    );
   }
   await pool
    .query(`UPDATE tbl_opd_order_item SET served_at=NOW(), served_by=?, served_notes=? WHERE id=?`, [uid, findings, oid])
    .catch(() => {});
   touched++;
  }
  return res.redirect('/radiology/validate/' + encodeURIComponent(ctx.code) + '?msg=' + encodeURIComponent(`${touched} imaging result(s) saved.`));
 } catch (e) {
  console.error('rad submit:', e);
  return res.redirect('/radiology/validate/' + encodeURIComponent(req.params.code) + '?err=' + encodeURIComponent(e.message));
 }
});

app.post('/laboratory/recall-for-edit/:code', requireAuth, requirePerm('lab.write'), async (req, res) => {
 try {
  const fid = req.session.facilityId || 1;
  const ctx = await loadServiceCode(pool, req.params.code, fid);
  if (!ctx || !ctx.ok || ctx.kind !== 'laboratory') {
   return res.redirect('/laboratory/validate?err=' + encodeURIComponent(ctx?.error || 'Invalid code.'));
  }
  const oid = parseInt(String(req.body.oi_id || ''), 10) || 0;
  const reason = String(req.body.reason || '').trim().slice(0, 2000) || null;
  if (!oid) {
   return res.redirect('/laboratory/validate/' + encodeURIComponent(ctx.code) + '?err=' + encodeURIComponent(flashT(res, 'flash.missing_item')));
  }
  const uid = req.session.userId || req.session.user?.id || 1;
  const r = await performLabRevisionRecallByOrderItem(pool, oid, reason, uid);
  if (!r.ok) {
   return res.redirect('/laboratory/validate/' + encodeURIComponent(ctx.code) + '?err=' + encodeURIComponent(r.error));
  }
  return res.redirect(
   '/lab/templates?code=' +
    encodeURIComponent(ctx.code) +
    '&oi=' +
    oid +
    '&lock=1&from=correction&msg=' +
    encodeURIComponent(flashT(res, 'flash.line_unlocked_for_correction_re_enter_results_in_the_template_workbench_'))
  );
 } catch (e) {
  console.error('lab recall:', e);
  return res.redirect('/laboratory/validate/' + encodeURIComponent(req.params.code) + '?err=' + encodeURIComponent(e.message));
 }
});

/** Same unlock logic as recall-for-edit, from registry / report view (by tbl_lab_result id). */
app.post('/laboratory/registry-recall/:id', requireAuth, requirePerm('lab.write'), async (req, res) => {
 try {
  const lrId = parseInt(req.params.id, 10) || 0;
  const reason = String(req.body.reason || '').trim().slice(0, 2000) || null;
  if (lrId < 1) return res.redirect('/laboratory?err=' + encodeURIComponent(flashT(res, 'flash.invalid_report')));
  const [[lr]] = await pool
   .query('SELECT id, opd_order_item_id, patient_id FROM tbl_lab_result WHERE id=? LIMIT 1', [lrId])
   .catch(() => [[null]]);
  if (!lr) return res.redirect('/laboratory?err=' + encodeURIComponent(flashT(res, 'flash.report_not_found_2')));
  const uid = req.session.userId || req.session.user?.id || 1;

  if (!lr.opd_order_item_id) {
   const r = await performLabRevisionRecallStandalone(pool, lrId, reason, uid);
   if (!r.ok) {
    return res.redirect('/laboratory?err=' + encodeURIComponent(r.error));
   }
   const pid = parseInt(String(lr.patient_id || ''), 10) || 0;
   const qs =
    'from=correction&lab_result_id=' +
    lrId +
    (pid > 0 ? '&pid=' + pid : '') +
    '&msg=' +
    encodeURIComponent(flashT(res, 'flash.returned_for_correction_open_lab_templates_re_enter_results_for_this_pat'));
   return res.redirect('/laboratory/templates?' + qs);
  }

  const [[oi]] = await pool
   .query('SELECT id, service_code FROM tbl_opd_order_item WHERE id=? LIMIT 1', [lr.opd_order_item_id])
   .catch(() => [[null]]);
  if (!oi || !oi.service_code) {
   return res.redirect('/laboratory?err=' + encodeURIComponent(flashT(res, 'flash.order_line_not_found')));
  }
  const code = String(oi.service_code).trim().toUpperCase();
  const ctx = await loadServiceCode(pool, code, fid);
  if (!ctx || !ctx.ok || ctx.kind !== 'laboratory') {
   return res.redirect('/laboratory?err=' + encodeURIComponent(ctx?.error || 'Not a laboratory order for this line.'));
  }
  const oid = parseInt(String(lr.opd_order_item_id), 10) || 0;
  const r = await performLabRevisionRecallByOrderItem(pool, oid, reason, uid);
  if (!r.ok) {
   return res.redirect('/laboratory/validate/' + encodeURIComponent(code) + '?err=' + encodeURIComponent(r.error));
  }
  return res.redirect(
   '/lab/templates?code=' +
    encodeURIComponent(code) +
    '&oi=' +
    oid +
    '&lock=1&from=correction&msg=' +
    encodeURIComponent(flashT(res, 'flash.line_unlocked_for_correction_re_enter_results_in_the_template_workbench_'))
  );
 } catch (e) {
  console.error('lab registry-recall:', e);
  return res.redirect('/laboratory?err=' + encodeURIComponent(e.message || 'Recall failed'));
 }
});

app.post('/radiology/recall-for-edit/:code', requireAuth, requirePerm('radiology.write'), async (req, res) => {
 try {
  await ensureDiagnosticCorrectionSchema(pool);
  const fid = req.session.facilityId || 1;
  const ctx = await loadServiceCode(pool, req.params.code, fid);
  if (!ctx || !ctx.ok || ctx.kind !== 'radiology') {
   return res.redirect('/radiology/validate?err=' + encodeURIComponent(ctx?.error || 'Invalid code.'));
  }
  const oid = parseInt(String(req.body.oi_id || ''), 10) || 0;
  const reason = String(req.body.reason || '').trim().slice(0, 2000) || null;
  if (!oid) {
   return res.redirect('/radiology/validate/' + encodeURIComponent(ctx.code) + '?err=' + encodeURIComponent(flashT(res, 'flash.missing_item')));
  }
  const [[rr]] = await pool
   .query('SELECT id, findings, conclusion_code FROM tbl_radiology_result WHERE opd_order_item_id=? LIMIT 1', [oid])
   .catch(() => [[null]]);
  if (!rr) {
   return res.redirect('/radiology/validate/' + encodeURIComponent(ctx.code) + '?err=' + encodeURIComponent(flashT(res, 'flash.no_imaging_result_to_unlock')));
  }
  const uid = req.session.userId || req.session.user?.id || 1;
  await insertDiagnosticCorrectionAudit(pool, {
   module: 'radiology',
   lab_result_id: null,
   radiology_result_id: rr.id,
   opd_order_item_id: oid,
   event_type: 'recall',
   superseded_findings: rr.findings || '',
   superseded_conclusion: rr.conclusion_code || null,
   new_findings: null,
   new_conclusion: null,
   reason,
   performed_by: uid
  }).catch((e) => console.error('rad recall audit', e));
  await pool.query('UPDATE tbl_radiology_result SET revision_pending=1 WHERE id=?', [rr.id]);
  return res.redirect(
   '/radiology/templates?code=' +
    encodeURIComponent(ctx.code) +
    '&oi=' +
    oid +
    '&lock=1&msg=' +
    encodeURIComponent(flashT(res, 'flash.line_unlocked_for_correction_re_enter_findings_in_the_template_workbench'))
  );
 } catch (e) {
  console.error('rad recall:', e);
  return res.redirect('/radiology/validate/' + encodeURIComponent(req.params.code) + '?err=' + encodeURIComponent(e.message));
 }
});

app.post('/radiology/registry-recall/:id', requireAuth, requirePerm('radiology.write'), async (req, res) => {
 try {
  const rrId = parseInt(req.params.id, 10) || 0;
  const reason = String(req.body.reason || '').trim().slice(0, 2000) || null;
  if (rrId < 1) return res.redirect('/radiology?err=' + encodeURIComponent(flashT(res, 'flash.invalid_report')));
  const [[rr]] = await pool
   .query('SELECT id, opd_order_item_id, patient_id FROM tbl_radiology_result WHERE id=? LIMIT 1', [rrId])
   .catch(() => [[null]]);
  if (!rr) return res.redirect('/radiology?err=' + encodeURIComponent(flashT(res, 'flash.report_not_found_2')));
  const uid = req.session.userId || req.session.user?.id || 1;
  await ensureDiagnosticCorrectionSchema(pool);

  if (!rr.opd_order_item_id) {
   const [[ex]] = await pool
    .query('SELECT id, findings, conclusion_code FROM tbl_radiology_result WHERE id=? LIMIT 1', [rrId])
    .catch(() => [[null]]);
   if (!ex) return res.redirect('/radiology?err=' + encodeURIComponent(flashT(res, 'flash.report_not_found_2')));
   await insertDiagnosticCorrectionAudit(pool, {
    module: 'radiology',
    lab_result_id: null,
    radiology_result_id: ex.id,
    opd_order_item_id: null,
    event_type: 'recall',
    superseded_findings: ex.findings || '',
    superseded_conclusion: ex.conclusion_code || null,
    new_findings: null,
    new_conclusion: null,
    reason,
    performed_by: uid
   }).catch((e) => console.error('rad registry recall audit', e));
   await pool.query('UPDATE tbl_radiology_result SET revision_pending=1 WHERE id=?', [rrId]);
   const pid = parseInt(String(rr.patient_id || ''), 10) || 0;
   const qs =
    'from=correction&radiology_result_id=' +
    rrId +
    (pid > 0 ? '&pid=' + pid : '') +
    '&msg=' +
    encodeURIComponent(flashT(res, 'flash.returned_for_correction_open_radiology_templates_re_enter_the_exam_repor'));
   return res.redirect('/radiology/templates?' + qs);
  }

  const [[oi]] = await pool
   .query('SELECT id, service_code FROM tbl_opd_order_item WHERE id=? LIMIT 1', [rr.opd_order_item_id])
   .catch(() => [[null]]);
  if (!oi || !oi.service_code) {
   return res.redirect('/radiology?err=' + encodeURIComponent(flashT(res, 'flash.order_line_not_found')));
  }
  const code = String(oi.service_code).trim().toUpperCase();
  const ctx = await loadServiceCode(pool, code, fid);
  if (!ctx || !ctx.ok || ctx.kind !== 'radiology') {
   return res.redirect('/radiology?err=' + encodeURIComponent(ctx?.error || 'Not a radiology order for this line.'));
  }
  const oid = parseInt(String(rr.opd_order_item_id), 10) || 0;
  const [[ex]] = await pool
   .query('SELECT id, findings, conclusion_code FROM tbl_radiology_result WHERE opd_order_item_id=? LIMIT 1', [oid])
   .catch(() => [[null]]);
  if (!ex) {
   return res.redirect('/radiology/validate/' + encodeURIComponent(code) + '?err=' + encodeURIComponent(flashT(res, 'flash.no_imaging_result_to_unlock')));
  }
  await insertDiagnosticCorrectionAudit(pool, {
   module: 'radiology',
   lab_result_id: null,
   radiology_result_id: ex.id,
   opd_order_item_id: oid,
   event_type: 'recall',
   superseded_findings: ex.findings || '',
   superseded_conclusion: ex.conclusion_code || null,
   new_findings: null,
   new_conclusion: null,
   reason,
   performed_by: uid
  }).catch((e) => console.error('rad registry recall audit', e));
  await pool.query('UPDATE tbl_radiology_result SET revision_pending=1 WHERE id=?', [ex.id]);
  return res.redirect(
   '/radiology/templates?code=' +
    encodeURIComponent(code) +
    '&oi=' +
    oid +
    '&lock=1&msg=' +
    encodeURIComponent(flashT(res, 'flash.line_unlocked_for_correction_re_enter_findings_in_the_template_workbench'))
  );
 } catch (e) {
  console.error('radiology registry-recall:', e);
  return res.redirect('/radiology?err=' + encodeURIComponent(e.message || 'Recall failed'));
 }
});

// ─────────────────────────────────────────────────────────────────────────
// External-result uploads — only for items the cashier marked as external.
// The doctor or nurse scans the patient's outside-hospital result and posts
// it here; we save the file, record a tbl_patient_external_document row,
// then attach a tbl_lab_result / tbl_radiology_result row marked
// source='external' so it shows up on the patient chart and portal next to
// in-house results.
// ─────────────────────────────────────────────────────────────────────────
async function handleExternalUpload(req, res, kind) {
 try {
  const fid = req.session.facilityId || 1;
  const ctx = await loadServiceCode(pool, req.params.code, fid);
  if (!ctx || !ctx.ok || ctx.kind !== kind) {
   return res.redirect(`/${kind}/validate?err=` + encodeURIComponent(ctx?.error || 'Invalid code.'));
  }
  const oid = parseInt(req.body.oi_id, 10) || 0;
  if (!oid) return res.redirect(`/${kind}/validate/${encodeURIComponent(ctx.code)}?err=Missing+item.`);
  const oiRow = ctx.items.find(x => x.id === oid);
  if (!oiRow) return res.redirect(`/${kind}/validate/${encodeURIComponent(ctx.code)}?err=Item+not+in+this+code.`);
  if (String(oiRow.status) !== 'external') {
   return res.redirect(`/${kind}/validate/${encodeURIComponent(ctx.code)}?err=Only+external+items+accept+uploads.`);
  }
  if (!req.file) return res.redirect(`/${kind}/validate/${encodeURIComponent(ctx.code)}?err=No+file+received.`);

  const uid = req.session.userId || req.session.user?.id || 1;
  const docFid = oiRow.facility_id || fid;
  // Public URL relative to /public (the static handler is mounted at /).
  const relPath = '/' + path.relative(path.join(__dirname, 'public'), req.file.path).split(path.sep).join('/');

  // 1) tbl_patient_external_document row
  const [docIns] = await pool.query(
   `INSERT INTO tbl_patient_external_document
    (facility_id, patient_id, consultation_id, doc_kind, title, notes, file_path, mime, file_size, original_name, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
   [
    docFid, oiRow.patient_id, oiRow.consultation_id || null,
    kind === 'laboratory' ? 'lab_result_external' : 'imaging_result_external',
    `External ${kind === 'laboratory' ? 'lab' : 'imaging'} result · ${oiRow.item_name || ''}`.slice(0, 255),
    `Uploaded against ${ctx.code} (item #${oiRow.id})`,
    relPath, req.file.mimetype || null, req.file.size || 0, req.file.originalname || null, uid
   ]
  );
  const docId = docIns.insertId;

  // 2) Companion result row (insert or update) marked as external
  if (kind === 'laboratory') {
   const [[ex]] = await pool.query(
    'SELECT id FROM tbl_lab_result WHERE opd_order_item_id=? LIMIT 1', [oid]
   ).catch(() => [[null]]);
   if (!ex) {
    await pool.query(
     `INSERT INTO tbl_lab_result
       (facility_id, patient_id, test_name, referred_by_id, appointment_date, notes,
        status, created_at, opd_order_item_id, source, external_doc_id)
      VALUES (?, ?, ?, ?, ?, ?, 'received', NOW(), ?, 'external', ?)`,
     [docFid, oiRow.patient_id, oiRow.item_name || 'Lab test', ctx.doctor?.id || null,
      new Date().toISOString().slice(0,10), 'External result uploaded.', oid, docId]
    );
   } else {
    await pool.query(
     `UPDATE tbl_lab_result SET status='received', source='external',
      external_doc_id=?, notes=COALESCE(NULLIF(notes,''),'External result uploaded.'),
      updated_at=NOW() WHERE id=?`,
     [docId, ex.id]
    );
   }
  } else { // radiology
   const [[ex]] = await pool.query(
    'SELECT id FROM tbl_radiology_result WHERE opd_order_item_id=? LIMIT 1', [oid]
   ).catch(() => [[null]]);
   if (!ex) {
    await pool.query(
     `INSERT INTO tbl_radiology_result
       (facility_id, patient_id, exam_name, modality, body_part, referred_by_id, appointment_date,
        findings, notes, status, created_at, opd_order_item_id, source, external_doc_id)
      VALUES (?, ?, ?, 'External', '', ?, ?, ?, NULL, 'received', NOW(), ?, 'external', ?)`,
     [docFid, oiRow.patient_id, oiRow.item_name || 'Imaging', ctx.doctor?.id || null,
      new Date().toISOString().slice(0,10), 'External imaging result uploaded.', oid, docId]
    );
   } else {
    await pool.query(
     `UPDATE tbl_radiology_result SET status='received', source='external',
      external_doc_id=?, findings=COALESCE(NULLIF(findings,''),'External imaging result uploaded.'),
      updated_at=NOW() WHERE id=?`,
     [docId, ex.id]
    );
   }
  }

  // 3) Mark the order item as served (external)
  await pool.query(
   `UPDATE tbl_opd_order_item
    SET served_at=NOW(), served_by=?, served_notes=?
    WHERE id=?`,
   [uid, 'External result uploaded.', oid]
  ).catch(() => {});

  return res.redirect(`/${kind}/validate/${encodeURIComponent(ctx.code)}?msg=` +
   encodeURIComponent(flashT(res, 'flash.external_result_uploaded_and_attached_to_patient_chart')));
 } catch (e) {
  console.error(`${kind} external-upload:`, e);
  return res.redirect(`/${kind}/validate/${encodeURIComponent(req.params.code)}?err=` +
   encodeURIComponent(e.message || 'Upload failed.'));
 }
}
app.post('/laboratory/external-upload/:code', requireAuth, externalUploadMw('result_file'),
 (req, res) => handleExternalUpload(req, res, 'laboratory'));
app.post('/radiology/external-upload/:code',  requireAuth, externalUploadMw('result_file'),
 (req, res) => handleExternalUpload(req, res, 'radiology'));

// In-house attachments (X-rays, scanned lab reports, PDFs) — lab / radiology
// staff upload files against a validated service code; linked to the same
// tbl_lab_result / tbl_radiology_result row as typed findings (external_doc_id).
async function handleInHouseAttachment(req, res, kind) {
 try {
  const fid = req.session.facilityId || 1;
  const ctx = await loadServiceCode(pool, req.params.code, fid);
  if (!ctx || !ctx.ok || ctx.kind !== kind) {
   return res.redirect(`/${kind}/validate?err=` + encodeURIComponent(ctx?.error || 'Invalid code.'));
  }
  const oid = parseInt(req.body.oi_id, 10) || 0;
  if (!oid) return res.redirect(`/${kind}/validate/${encodeURIComponent(ctx.code)}?err=Missing+item.`);
  const oiRow = ctx.items.find(x => x.id === oid);
  if (!oiRow) return res.redirect(`/${kind}/validate/${encodeURIComponent(ctx.code)}?err=Item+not+in+this+code.`);
  if (String(oiRow.status) === 'external') {
   return res.redirect(`/${kind}/validate/${encodeURIComponent(ctx.code)}?err=Use+the+external+upload+section+for+external+items.`);
  }
  if (!req.file) return res.redirect(`/${kind}/validate/${encodeURIComponent(ctx.code)}?err=No+file+received.`);

  const uid = req.session.userId || req.session.user?.id || 1;
  const docFid = oiRow.facility_id || fid;
  const relPath = '/' + path.relative(path.join(__dirname, 'public'), req.file.path).split(path.sep).join('/');

  const [docIns] = await pool.query(
   `INSERT INTO tbl_patient_external_document
    (facility_id, patient_id, consultation_id, doc_kind, title, notes, file_path, mime, file_size, original_name, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
   [
    docFid, oiRow.patient_id, oiRow.consultation_id || null,
    kind === 'laboratory' ? 'lab_attachment_inhouse' : 'radiology_image_inhouse',
    `${kind === 'laboratory' ? 'Lab' : 'Imaging'} attachment · ${oiRow.item_name || ''}`.slice(0, 255),
    `In-house upload · ${ctx.code} · item #${oiRow.id}`,
    relPath, req.file.mimetype || null, req.file.size || 0, req.file.originalname || null, uid
   ]
  );
  const docId = docIns.insertId;

  if (kind === 'laboratory') {
   const [[ex]] = await pool.query(
    'SELECT id FROM tbl_lab_result WHERE opd_order_item_id=? LIMIT 1', [oid]
   ).catch(() => [[null]]);
   if (!ex) {
    await pool.query(
     `INSERT INTO tbl_lab_result
       (facility_id, patient_id, test_name, referred_by_id, appointment_date, notes,
        status, created_at, opd_order_item_id, source, external_doc_id)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), ?, 'in_house', ?)`,
     [docFid, oiRow.patient_id, oiRow.item_name || 'Lab test', ctx.doctor?.id || null,
      new Date().toISOString().slice(0,10),
      'Image / scan attached — add typed findings when ready.', oid, docId]
    );
   } else {
    await pool.query(
     `UPDATE tbl_lab_result SET external_doc_id=?, updated_at=NOW(), source='in_house' WHERE id=?`,
     [docId, ex.id]
    );
   }
  } else {
   const [[ex]] = await pool.query(
    'SELECT id FROM tbl_radiology_result WHERE opd_order_item_id=? LIMIT 1', [oid]
   ).catch(() => [[null]]);
   if (!ex) {
    await pool.query(
     `INSERT INTO tbl_radiology_result
       (facility_id, patient_id, exam_name, modality, body_part, referred_by_id, appointment_date,
        findings, notes, status, created_at, opd_order_item_id, source, external_doc_id)
      VALUES (?, ?, ?, 'X-Ray', '', ?, ?, ?, NULL, 'pending', NOW(), ?, 'in_house', ?)`,
     [fid, oiRow.patient_id, oiRow.item_name || 'Imaging', ctx.doctor?.id || null,
      new Date().toISOString().slice(0,10),
      'Image attached — add findings report below.', oid, docId]
    );
   } else {
    await pool.query(
     `UPDATE tbl_radiology_result SET external_doc_id=?, updated_at=NOW(), source='in_house' WHERE id=?`,
     [docId, ex.id]
    );
   }
  }

  return res.redirect(`/${kind}/validate/${encodeURIComponent(ctx.code)}?msg=` +
   encodeURIComponent(flashT(res, 'flash.file_attached_to_this_result')));
 } catch (e) {
  console.error(`${kind} attach-document:`, e);
  return res.redirect(`/${kind}/validate/${encodeURIComponent(req.params.code)}?err=` +
   encodeURIComponent(e.message || 'Upload failed.'));
 }
}
app.post('/laboratory/attach-document/:code', requireAuth, externalUploadMw('result_file'),
 (req, res) => handleInHouseAttachment(req, res, 'laboratory'));
app.post('/radiology/attach-document/:code', requireAuth, externalUploadMw('result_file'),
 (req, res) => handleInHouseAttachment(req, res, 'radiology'));

// ── Pharmacy ─────────────────────────────────────────────────────────────────
app.get('/pharmacy/validate', requireAuth, (req, res) => {
 const code = (req.query.code || '').toString().trim();
 if (!code) return renderValidateEntry(res, 'pharmacy', { flash: req.query.msg, error: req.query.err });
 return res.redirect('/pharmacy/validate/' + encodeURIComponent(code));
});

app.get('/pharmacy/validate/:code', requireAuth, async (req, res) => {
 try {
  const code = String(req.params.code || '').trim();
  const fid = req.session.facilityId || 1;
  const auth = await authorizeServiceCodeValidate(pool, code, fid);
  if (!auth.ok) {
   return renderValidateEntry(res, 'pharmacy', {
    code,
    error: auth.error || 'Code not valid for pharmacy dispensing.',
   });
  }
  const ctx = await loadServiceCode(pool, code, fid);
  if (!ctx || !ctx.ok) return renderValidateEntry(res, 'pharmacy', { code: req.params.code, error: ctx?.error || 'Code not found' });
  if (ctx.kind !== 'pharmacy') return renderValidateEntry(res, 'pharmacy', { code: req.params.code, error: `Code belongs to ${ctx.kind}, not pharmacy.` });
  const ensurePharmacySchema = require('./lib/ensurePharmacySchema');
  await ensurePharmacySchema(pool).catch(() => {});
  await ensureOpdOrderItemsSchema(pool);
  const ensureOpdPharmacySchema = require('./lib/ensureOpdPharmacySchema');
  await ensureOpdPharmacySchema(pool).catch(() => {});
  const { checkOpdOrderItemExpiry } = require('./lib/pharmacyExpiry');
  const { stockHintForOrderItem } = require('./lib/pharmacyDispenseStock');
  const expiryByOi = {};
  const stockByOi = {};
  for (const it of ctx.items) {
   if (String(it.status) === 'external' || it.served_at) continue;
   expiryByOi[it.id] = await checkOpdOrderItemExpiry(pool, it.id);
   stockByOi[it.id] = await stockHintForOrderItem(pool, it);
  }
  return renderValidateDetail(res, ctx, { flash: req.query.msg, error: req.query.err, expiryByOi, stockByOi });
 } catch (e) {
  console.error('pharma validate:', e);
  return renderValidateEntry(res, 'pharmacy', { code: req.params.code, error: e.message });
 }
});

// Pharmacist marks a custom/zero-price line as available off-catalog and sets the price.
app.post('/pharmacy/mark-off-catalog/:code', requireAuth, async (req, res) => {
 try {
  const code = String(req.params.code || '').trim().toUpperCase();
  const oid = parseInt(req.body.oi_id, 10) || 0;
  const available = String(req.body.available ?? '1') === '1';
  const unitPriceRaw = req.body.unit_price;
  const unitPrice = unitPriceRaw != null && String(unitPriceRaw).trim() !== '' ? parseFloat(unitPriceRaw) : null;
  const fid = req.session.facilityId || 1;
  const ctx = await loadServiceCode(pool, code, fid);
  if (!ctx || !ctx.ok || ctx.kind !== 'pharmacy') {
   return res.redirect('/pharmacy/validate?err=' + encodeURIComponent(ctx?.error || 'Invalid code.'));
  }
  const oiRow = ctx.items.find((x) => x.id === oid);
  const pharmFul = require('./lib/opdPharmacyFulfillment');
  if (!oiRow || !pharmFul.isPendingCustomZero(oiRow)) {
   return res.redirect('/pharmacy/validate/' + encodeURIComponent(code) + '?err=' + encodeURIComponent('Only pending custom prescriptions can be marked.'));
  }
  await ensureOpdOrderItemsSchema(pool);
  await require('./lib/ensureOpdPharmacySchema')(pool).catch(() => {});

  if (available) {
   if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return res.redirect('/pharmacy/validate/' + encodeURIComponent(code) + '?err=' + encodeURIComponent('Enter a unit price greater than zero.'));
   }
   await pool.query(
    `UPDATE tbl_opd_order_item
     SET pharmacist_available = 1, unit_price = ?, service_code = ?
     WHERE id = ? AND item_type = 'pharmacy' AND status = 'pending'`,
    [unitPrice, code, oid]
   );
   if (oiRow.consultation_id) {
    await pharmFul.syncPharmacyServiceCodeForConsultation(pool, oiRow.consultation_id, [oid], code);
   }
   const msg = 'Off-catalog item priced — send patient to Cashier for payment on the same PHA code.';
   return res.redirect('/pharmacy/validate/' + encodeURIComponent(code) + '?msg=' + encodeURIComponent(msg));
  }

  await pool.query(
    'UPDATE tbl_opd_order_item SET pharmacist_available = 0 WHERE id = ? AND item_type = \'pharmacy\' AND status = \'pending\'',
    [oid]
  );
  return res.redirect('/pharmacy/validate/' + encodeURIComponent(code) + '?msg=' + encodeURIComponent('Off-catalog availability cleared.'));
 } catch (e) {
  console.error('pharmacy mark-off-catalog:', e);
  return res.redirect('/pharmacy/validate/' + encodeURIComponent(req.params.code) + '?err=' + encodeURIComponent(e.message));
 }
});

// Pharmacy externals just need to be acknowledged (no upload required) —
// patient bought the drug outside, this stamps served_at so the chart shows
// the line as resolved with a "served outside hospital" note.
app.post('/pharmacy/external-ack/:code', requireAuth, async (req, res) => {
 try {
  const fid = req.session.facilityId || 1;
  const ctx = await loadServiceCode(pool, req.params.code, fid);
  if (!ctx || !ctx.ok || ctx.kind !== 'pharmacy') {
   return res.redirect('/pharmacy/validate?err=' + encodeURIComponent(ctx?.error || 'Invalid code.'));
  }
  const oid = parseInt(req.body.oi_id, 10) || 0;
  const oiRow = ctx.items.find(x => x.id === oid);
  if (!oiRow || String(oiRow.status) !== 'external') {
   return res.redirect('/pharmacy/validate/' + encodeURIComponent(ctx.code) + '?err=Only+external+items.');
  }
  const uid = req.session.userId || req.session.user?.id || 1;
  await pool.query(
   `UPDATE tbl_opd_order_item SET served_at=NOW(), served_by=?,
    served_notes='Prescription served outside the hospital.' WHERE id=?`,
   [uid, oid]
  ).catch(() => {});
  return res.redirect('/pharmacy/validate/' + encodeURIComponent(ctx.code) +
   '?msg=' + encodeURIComponent(flashT(res, 'flash.acknowledged_served_outside_hospital')));
 } catch (e) {
  console.error('pharmacy external-ack:', e);
  return res.redirect('/pharmacy/validate/' + encodeURIComponent(req.params.code) +
   '?err=' + encodeURIComponent(e.message));
 }
});

app.post('/pharmacy/serve/:code', requireAuth, async (req, res) => {
 try {
  const fid = req.session.facilityId || 1;
  const auth = await authorizeServiceCodeValidate(pool, req.params.code, fid);
  if (!auth.ok) {
   return res.redirect('/pharmacy/validate?err=' + encodeURIComponent(auth.error || 'Payment required.'));
  }
  const ctx = await loadServiceCode(pool, req.params.code, fid);
  if (!ctx || !ctx.ok || ctx.kind !== 'pharmacy') {
   return res.redirect('/pharmacy/validate?err=' + encodeURIComponent(ctx?.error || 'Invalid code.'));
  }
  const ensurePharmacySchema = require('./lib/ensurePharmacySchema');
  await ensurePharmacySchema(pool).catch(() => {});
  await ensureOpdOrderItemsSchema(pool);
  const { checkOpdOrderItemExpiry } = require('./lib/pharmacyExpiry');
  const { deductStockForOpdOrderItem } = require('./lib/pharmacyDispenseStock');
  const force = req.body.force === '1' || req.body.force_stock === '1';
  const pickServeIds = (body) => {
   const raw = body['serve_ids[]'];
   const arr = Array.isArray(raw) ? raw : raw != null && raw !== '' ? [raw] : [];
   return [...new Set(arr.map((x) => parseInt(x, 10)).filter((n) => n > 0))];
  };
  const serveIds = pickServeIds(req.body);
  const uid = req.session.userId || req.session.user?.id || 1;
  const pendingServe = [];
  const expiredChecks = [];
  for (const oid of serveIds) {
   const oiRow = ctx.items.find((x) => x.id === oid);
   if (!oiRow || String(oiRow.status) === 'external') continue;
   if (oiRow.served_at) continue;
   const pharmFul = require('./lib/opdPharmacyFulfillment');
   if (!pharmFul.isPaidForDispense(oiRow)) {
    continue;
   }
   const noteRaw = req.body[`note_${oid}`] ?? req.body[`notes_${oid}`];
   const note = noteRaw != null ? String(noteRaw).trim() : '';
   pendingServe.push({ oid, note });
   const check = await checkOpdOrderItemExpiry(pool, oid);
   if (check.expired) expiredChecks.push({ oid, note, check });
  }
  if (!pendingServe.length) {
   return res.redirect('/pharmacy/validate/' + encodeURIComponent(ctx.code) + '?err=' + encodeURIComponent(flashT(res, 'flash.select_medication_to_dispense')));
  }
  if (expiredChecks.length && !force) {
   return res.render('pharmacy-serve-warn', {
    title: pageTitle(res, 'document_titles.expiry_warning', 'Expiry warning · {{code}}', { code: ctx.code }),
    kind: 'pharmacy',
    code: ctx.code,
    patient: ctx.patient,
    expiredChecks,
    pendingServe
   });
  }
  let touched = 0;
  const stockErrors = [];
  for (const row of pendingServe) {
   const oiRow = ctx.items.find((x) => x.id === row.oid);
   const offCatalog = oiRow && (Number(oiRow.pharmacist_available) === 1 || Number(oiRow.off_catalog_dispense) === 1);
   const stock = await deductStockForOpdOrderItem(pool, row.oid, uid, {
    force: force || offCatalog,
    allowNegative: offCatalog,
    stockNote: offCatalog ? require('./lib/opdPharmacyFulfillment').OFF_CATALOG_STOCK_NOTE : null,
   });
   if (!stock.ok) {
    stockErrors.push(stock.error || `Stock check failed for line #${row.oid}`);
    continue;
   }
   const dispenseNote = [row.note, offCatalog ? require('./lib/opdPharmacyFulfillment').OFF_CATALOG_STOCK_NOTE : null]
    .filter(Boolean)
    .join(' · ') || null;
   await pool.query(
    `UPDATE tbl_opd_order_item SET served_at=NOW(), served_by=?, served_notes=?, status='dispensed'
     WHERE id=? AND item_type='pharmacy' AND served_at IS NULL`,
    [uid, dispenseNote, row.oid]
   ).catch(() => {});
   touched++;
  }
  if (stockErrors.length && !touched) {
   return res.redirect(
    '/pharmacy/validate/' +
     encodeURIComponent(ctx.code) +
     '?err=' +
     encodeURIComponent(stockErrors.join(' '))
   );
  }
  let msg = `${touched} medication(s) dispensed`;
  if (stockErrors.length) msg += ` (${stockErrors.length} skipped — insufficient stock)`;
  const today = new Date().toISOString().slice(0, 10);
  if (touched > 0 && stockErrors.length === 0) {
   return res.redirect(
    '/pharmacy?view=dispensing&day=' +
     encodeURIComponent(today) +
     '&dispense=log&msg=' +
     encodeURIComponent(msg + '.')
   );
  }
  return res.redirect('/pharmacy/validate/' + encodeURIComponent(ctx.code) + '?msg=' + encodeURIComponent(msg + '.'));
 } catch (e) {
  console.error('pharma serve:', e);
  return res.redirect('/pharmacy/validate/' + encodeURIComponent(req.params.code) + '?err=' + encodeURIComponent(e.message));
 }
});

// PHARMACY HUB
app.get('/pharmacy', requireAuth, requirePerm('pharmacy.read','pharmacy.write'), async (req, res) => {
 try {
  const ensurePharmacySchema = require('./lib/ensurePharmacySchema');
  await ensurePharmacySchema(pool).catch(() => {});
  const ensureNursingSupplyRequestSchema = require('./lib/ensureNursingSupplyRequestSchema');
  await ensureNursingSupplyRequestSchema(pool).catch(() => {});
  const ensureInventorySchema = require('./lib/ensureInventorySchema');
  await ensureInventorySchema(pool).catch(() => {});
  let nursingSupplyPending = 0;
  try {
   const [[r]] = await pool.query(
    "SELECT COUNT(*) AS c FROM tbl_nursing_supply_request WHERE status IN ('pending','preparing')"
   );
   nursingSupplyPending = parseInt(r && r.c, 10) || 0;
  } catch (e) { nursingSupplyPending = 0; }

 // 1. Stock Stats (pharmacy products = active service-catalog pharmacy items)
 const { countPharmacyProducts, pharmacyCatalogJoin, pruneOrphanPharmacyInventory } = require('./lib/pharmacyProductScope');
 await pruneOrphanPharmacyInventory(pool).catch(() => {});
 const statsRow = await countPharmacyProducts(pool);

 // 2. Stock List (with medicine type / category) — only pharmacy catalog products
 const [inventory] = await pool.query(`
 SELECT i.*, sc.price AS catalog_price, sc.department_name AS catalog_used_for,
        sc.id AS catalog_id, mt.name AS medicine_type_name, mc.name AS medicine_category_name,
        mc.requires_prescription AS category_requires_rx
 FROM tbl_inventory_item i
 ${pharmacyCatalogJoin('i', 'sc')}
 LEFT JOIN tbl_pharmacy_medicine_type mt ON mt.id = i.medicine_type_id
 LEFT JOIN tbl_pharmacy_medicine_category mc ON mc.id = i.medicine_category_id
 ORDER BY i.name LIMIT 500`);
 const [medicineTypes] = await pool.query(
  'SELECT id, name FROM tbl_pharmacy_medicine_type WHERE is_active = 1 ORDER BY sort_order, name'
 ).catch(() => [[]]);
 const [medicineCategories] = await pool.query(
  'SELECT id, name, requires_prescription FROM tbl_pharmacy_medicine_category WHERE is_active = 1 ORDER BY sort_order, name'
 ).catch(() => [[]]);

 // 3. Dispensing registry (OPD pharmacy lines — PHA- validate/serve flow)
 const {
  loadDispensedPharmacyLines,
  loadPendingPharmacyDispense,
  countDispensedPharmacyLines,
  normalizeDay: normalizeDispenseDay,
 } = require('./lib/pharmacyDispenseRegistry');
 const dispenseDay = normalizeDispenseDay(req.query.day);
 const dispenseMode = String(req.query.dispense || 'log').toLowerCase() === 'pending' ? 'pending' : 'log';
 const dispensed = await loadDispensedPharmacyLines(pool, { day: dispenseDay });
 const pendingDispense = await loadPendingPharmacyDispense(pool);
 const dispensedToday = await countDispensedPharmacyLines(pool, new Date().toISOString().slice(0, 10));
 // Legacy prescription_line queue (kept for old IPD path; usually empty in OPD)
 const [queue] = await pool.query(`
 SELECT pl.*, r.patient_id, r.title AS prescription_title, r.status AS prescription_status,
        p.first_name, p.last_name
 FROM tbl_prescription_line pl
 INNER JOIN tbl_prescription r ON r.id = pl.prescription_id
 INNER JOIN tbl_patient p ON p.id = r.patient_id
 WHERE pl.line_type = 'medication' AND pl.dispense_status <> 'dispensed'
 ORDER BY pl.id DESC LIMIT 200
 `).catch(() => [[]]);

 const [prescriptions] = await pool.query(`
 SELECT r.id, r.patient_id, r.title, r.status, r.created_at, p.first_name, p.last_name
 FROM tbl_prescription r
 JOIN tbl_patient p ON p.id = r.patient_id
 ORDER BY r.id DESC LIMIT 80
 `);

 const today = new Date().toISOString().split('T')[0];
 const [[rxToday]] = await pool.query(
  'SELECT COUNT(*) AS c FROM tbl_prescription WHERE DATE(created_at) = ?',
  [today]
 ).catch(() => [[{ c: 0 }]]);
 const [[rxActive]] = await pool.query(
  "SELECT COUNT(*) AS c FROM tbl_prescription WHERE status = 'active'"
 ).catch(() => [[{ c: 0 }]]);

 const activeView = String(req.query.view || 'products').toLowerCase();
 const allowedViews = ['overview', 'dispensing', 'products', 'prescriptions'];
 const phaView = allowedViews.includes(activeView) ? activeView : 'dispensing';

 res.render('pharmacy', {
  title: pageTitle(res, 'document_titles.pharmacy', 'Pharmacy'),
  pharmacyOdooApp: true,
  phaView,
  nursingSupplyPending,
  pageData: {
   phaView,
   stats: statsRow,
   inventory,
   queue,
   dispensed,
   pendingDispense,
   dispenseDay,
   dispenseMode,
   dispensedToday,
   prescriptions,
   rxStats: { today: parseInt(rxToday && rxToday.c, 10) || 0, active: parseInt(rxActive && rxActive.c, 10) || 0 },
   userDisplayName: res.locals.userDisplayName || req.session.user?.name || 'Pharmacist',
   userPerms: res.locals.userPerms || [],
   flash: req.query.msg || null,
   error: req.query.err || null,
  },
  flash: req.query.msg || null,
  error: req.query.err || null
 });
 } catch (err) {
 console.error(err);
 renderAppError(res, 500, 'page.load_pharmacy', 'Pharmacy load failure.', { detail: err.message })
 }
});

app.post('/pharmacy/dispense/:lineId', requireAuth, requirePerm('pharmacy.write'), async (req, res) => {
 const lineId = parseInt(String(req.params.lineId || ''), 10) || 0;
 if (lineId < 1) {
  return res.redirect('/pharmacy?view=dispensing&err=' + encodeURIComponent(flashT(res, 'flash.invalid_prescription_line')));
 }
 const force = req.body.force === '1' || req.query.force === '1';
 try {
  const ensurePharmacySchema = require('./lib/ensurePharmacySchema');
  await ensurePharmacySchema(pool).catch(() => {});
  const { checkPrescriptionLineExpiry } = require('./lib/pharmacyExpiry');
  const check = await checkPrescriptionLineExpiry(pool, lineId);
  if (!check.line) {
   return res.redirect('/pharmacy?view=dispensing&err=' + encodeURIComponent(flashT(res, 'flash.line_not_found')));
  }
  if (check.expired && !force) {
   return res.redirect('/pharmacy/dispense-warn/' + lineId);
  }
  const [result] = await pool.query(
   "UPDATE tbl_prescription_line SET dispense_status = 'dispensed', dispensed_at = NOW(), dispensed_qty = COALESCE(dispensed_qty,0) + 1 WHERE id = ? AND line_type = 'medication'",
   [lineId]
  );
  const n = result && (result.affectedRows !== undefined ? result.affectedRows : 0);
  if (!n) {
   return res.redirect('/pharmacy?view=dispensing&err=' + encodeURIComponent(flashT(res, 'flash.line_not_found_or_already_dispensed')));
  }
  return res.redirect('/pharmacy?view=dispensing&msg=' + encodeURIComponent(flashT(res, 'flash.medication_marked_as_dispensed')));
 } catch (e) {
  console.error('pharmacy dispense:', e);
  return res.redirect('/pharmacy?view=dispensing&err=' + encodeURIComponent(e.message || 'Dispense failed.'));
 }
});

app.post('/pharmacy/stock-receive', requireAuth, requirePerm('pharmacy.write'), async (req, res) => {
 const itemId = parseInt(String(req.body.inventory_item_id || ''), 10) || 0;
 const qtyAdd = parseInt(String(req.body.quantity_add || ''), 10) || 0;
 const { receivePharmacyStock, safePharmacyReturnUrl } = require('./lib/pharmacyStockManage');
 const ret = safePharmacyReturnUrl(req.body._return);
 const sep = ret.includes('?') ? '&' : '?';
 if (itemId < 1 || qtyAdd < 1) {
  return res.redirect(ret + sep + 'err=' + encodeURIComponent(flashT(res, 'flash.choose_an_item_and_enter_how_many_units_to_add_at_least_1')));
 }
 if (qtyAdd > 1000000) {
  return res.redirect(ret + sep + 'err=' + encodeURIComponent(flashT(res, 'flash.quantity_is_too_large')));
 }
 try {
  const ensureInventorySchema = require('./lib/ensureInventorySchema');
  await ensureInventorySchema(pool).catch(() => {});
  const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || null;
  const r = await receivePharmacyStock(pool, { itemId, qtyAdd, userId: uid });
  if (!r.ok) {
   return res.redirect(ret + sep + 'err=' + encodeURIComponent(r.error || 'Could not update stock.'));
  }
  return res.redirect(ret + sep + 'msg=' + encodeURIComponent(`Added ${qtyAdd} unit(s) to stock.`));
 } catch (e) {
  console.error('pharmacy stock-receive:', e);
  return res.redirect(ret + sep + 'err=' + encodeURIComponent(e.message || 'Could not update stock.'));
 }
});

app.post('/pharmacy/stock-adjust', requireAuth, requirePerm('pharmacy.write'), async (req, res) => {
 const itemId = parseInt(String(req.body.inventory_item_id || ''), 10) || 0;
 const delta = parseInt(String(req.body.quantity_delta || ''), 10);
 const note = String(req.body.note || '').trim().slice(0, 500) || null;
 const { adjustPharmacyStock, safePharmacyReturnUrl } = require('./lib/pharmacyStockManage');
 const ret = safePharmacyReturnUrl(req.body._return);
 const sep = ret.includes('?') ? '&' : '?';
 if (itemId < 1 || !Number.isFinite(delta) || delta === 0) {
  return res.redirect(ret + sep + 'err=' + encodeURIComponent(flashT(res, 'flash.select_an_item_and_enter_a_non_zero_quantity_change_or')));
 }
 try {
  const ensureInventorySchema = require('./lib/ensureInventorySchema');
  await ensureInventorySchema(pool).catch(() => {});
  const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || null;
  const r = await adjustPharmacyStock(pool, { itemId, delta, note, userId: uid });
  if (!r.ok) {
   return res.redirect(ret + sep + 'err=' + encodeURIComponent(r.error || 'Adjustment failed.'));
  }
  return res.redirect(ret + sep + 'msg=' + encodeURIComponent(flashT(res, 'flash.stock_adjusted')));
 } catch (e) {
  console.error('pharmacy stock-adjust:', e);
  return res.redirect(ret + sep + 'err=' + encodeURIComponent(e.message || 'Adjustment failed.'));
 }
});

app.post('/pharmacy/reorder-level', requireAuth, requirePerm('pharmacy.write'), async (req, res) => {
 const itemId = parseInt(String(req.body.inventory_item_id || ''), 10) || 0;
 const reorder = parseInt(String(req.body.reorder_level || ''), 10);
 const { setPharmacyReorderLevel, safePharmacyReturnUrl } = require('./lib/pharmacyStockManage');
 const ret = safePharmacyReturnUrl(req.body._return);
 const sep = ret.includes('?') ? '&' : '?';
 if (itemId < 1 || !Number.isFinite(reorder) || reorder < 0) {
  return res.redirect(ret + sep + 'err=' + encodeURIComponent('Invalid reorder level.'));
 }
 try {
  const r = await setPharmacyReorderLevel(pool, { itemId, reorderLevel: reorder });
  if (!r.ok) {
   return res.redirect(ret + sep + 'err=' + encodeURIComponent(r.error || 'Update failed.'));
  }
  return res.redirect(ret + sep + 'msg=' + encodeURIComponent('Reorder level updated.'));
 } catch (e) {
  console.error('pharmacy reorder-level:', e);
  return res.redirect(ret + sep + 'err=' + encodeURIComponent(e.message || 'Update failed.'));
 }
});

app.post('/pharmacy/sync-inventory', requireAuth, requirePerm('pharmacy.write'), async (req, res) => {
 const ret = '/pharmacy?view=products';
 const sep = '?';
 try {
  const { syncPharmacyCatalogInventory } = require('./lib/importPharmacyCatalogToInventory');
  const r = await syncPharmacyCatalogInventory(pool);
  const msg =
    `Stock registry synced from Service Catalog: ${r.inserted} added, ${r.updated} updated` +
    (r.pruned && r.pruned.removed ? `, ${r.pruned.removed} orphan SKU(s) removed` : '') +
    ` (${r.catalogTotal} catalog items).`;
  return res.redirect(ret + sep + 'msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('pharmacy sync-inventory:', e);
  return res.redirect(ret + sep + 'err=' + encodeURIComponent(e.message || 'Sync failed.'));
 }
});

app.get('/pharmacy/products/:id/movements', requireAuth, requirePerm('pharmacy.read', 'pharmacy.write'), async (req, res) => {
 const id = parseInt(req.params.id, 10) || 0;
 const { loadPharmacyInventoryItem } = require('./lib/pharmacyStockManage');
 if (id < 1) return res.redirect('/pharmacy?view=products&err=' + encodeURIComponent('Invalid product.'));
 try {
  const ensureInventorySchema = require('./lib/ensureInventorySchema');
  await ensureInventorySchema(pool).catch(() => {});
  const item = await loadPharmacyInventoryItem(pool, id);
  if (!item) {
   return res.redirect('/pharmacy?view=products&err=' + encodeURIComponent('Product not found.'));
  }
  const reasonFilter = String(req.query.reason || '').trim().slice(0, 40);
  let moveWhere = 'm.inventory_item_id = ?';
  const moveParams = [id];
  if (reasonFilter) {
   moveWhere += ' AND m.reason = ?';
   moveParams.push(reasonFilter);
  }
  const [movements] = await pool
   .query(
    `SELECT m.*, e.first_name AS emp_fn, e.last_name AS emp_ln
       FROM tbl_inventory_movement m
       LEFT JOIN tbl_employee e ON e.id = m.user_id
      WHERE ${moveWhere}
      ORDER BY m.id DESC
      LIMIT 200`,
    moveParams
   )
   .catch(() => [[]]);
  res.render('inventory-movements', {
   title: pageTitle(res, 'document_titles.stock_movements', 'Stock movements — ZAIZENS'),
   item: { ...item, quantity: item.quantity },
   movements: Array.isArray(movements) ? movements : [],
   reasonFilter: reasonFilter || '',
   backUrl: '/pharmacy?view=products',
   backLabel:
    typeof res.locals.t === 'function'
     ? res.locals.t('pharmacy.back_products', { ns: 'ops', defaultValue: '← Back to pharmacy products' })
     : '← Back to pharmacy products',
   movementsBase: '/pharmacy/products',
   flash: req.query.msg || null,
   error: req.query.err || null,
  });
 } catch (e) {
  console.error('pharmacy movements:', e);
  renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });
 }
});

// PRESCRIPTIONS REGISTRY
app.get('/prescriptions', requireAuth, requirePerm('prescription.read','prescription.write','pharmacy.read','pharmacy.write','clinical.read','clinical.write','nursing.read'), async (req, res) => {
 try {
 const q = (req.query.q || '').trim();
 let where = '1=1';
 const params = [];
 if (q) {
  const like = '%' + q + '%';
  where += ` AND (
   CAST(r.id AS CHAR) LIKE ? OR r.title LIKE ? OR r.status LIKE ?
   OR p.first_name LIKE ? OR p.last_name LIKE ? OR CAST(r.patient_id AS CHAR) LIKE ?
  )`;
  params.push(like, like, like, like, like, like);
 }
 const { rows: prescriptions, pager } = await pagination.fetchPage(pool, {
  req,
  pageParam: 'p',
  basePath: '/prescriptions',
  query: q ? { q } : {},
  countSql: `SELECT COUNT(*) AS total FROM tbl_prescription r JOIN tbl_patient p ON p.id = r.patient_id WHERE ${where}`,
  countParams: params,
  dataSql: `
 SELECT r.*, p.first_name, p.last_name 
 FROM tbl_prescription r
 JOIN tbl_patient p ON p.id = r.patient_id
 WHERE ${where}
 ORDER BY r.id DESC`,
  dataParams: params,
 });
 const [patients] = await pool.query(
   'SELECT id, first_name, last_name, patient_code, phone FROM tbl_patient WHERE status=1 ORDER BY last_name, first_name'
 ).catch(() => [[]]);
 res.render('prescriptions', {
   title: pageTitle(res, 'document_titles.prescriptions', 'Prescriptions — ZAIZENS'),
   pageData: {
     prescriptions,
     pager,
     searchQ: q,
     patients: patients || [],
     flash: req.query.msg || null,
     error: req.query.err || null,
     userPerms: res.locals.userPerms || [],
   },
 });
 } catch (err) {
 console.error(err);
 renderAppError(res, 500, 'page.load_prescriptions', 'Could not fetch prescriptions.')
 }
});


// POST: New Prescription
app.post('/prescriptions/add', requireAuth, async (req, res) => {
  const { patient_id, title, notes, items } = req.body;
  const uid = req.session.userId || req.session.user?.id || 1;
  try {
    const fid = req.session.facilityId || 1;
    const pid = parseInt(patient_id, 10) || 0;
    const gate = await clinicalBusinessRules.assertOpdPrescriptionAllowed(pool, fid, pid, uid);
    if (!gate.ok) {
      return res.redirect(
        '/prescriptions?err=' + encodeURIComponent(clinicalMsgT(res, gate))
      );
    }
    await pool.query(
      "INSERT INTO tbl_prescription (patient_id, title, notes, items, status, created_by, created_at) VALUES (?,?,?,?,'active',?,NOW())",
      [parseInt(patient_id)||0, (title||'Prescription').trim(), notes||null, items||null, uid]
    );
    res.redirect('/prescriptions?msg=' + encodeURIComponent(flashT(res, 'flash.prescription_created_successfully')))
  } catch(err) {
    console.error('PRESCRIPTION ADD ERROR:', err.message);
    res.redirect('/prescriptions?err=' + encodeURIComponent(flashT(res, 'flash.failed_to_create_prescription', { message: err.message })));
  }
});

// GET: View prescription detail
app.get('/prescriptions/:id', requireAuth, async (req, res) => {
  const rxId = parseInt(req.params.id) || 0;
  try {
    const [rows] = await pool.query(`
      SELECT r.*, p.first_name, p.last_name, p.phone, p.gender,
             e.first_name AS doc_fn, e.last_name AS doc_ln
      FROM tbl_prescription r
      JOIN tbl_patient p ON p.id = r.patient_id
      LEFT JOIN tbl_employee e ON e.id = r.created_by
      WHERE r.id = ? LIMIT 1
    `, [rxId]);
    if (!rows.length) return res.redirect('/prescriptions?err=' + encodeURIComponent(flashT(res, 'flash.prescription_not_found')))
    res.render('prescription-detail', {
      title: pageTitle(res, 'document_titles.prescription_rx', 'Prescription #RX-{{id}}', { id: rxId }),
      rx: rows[0],
      printMode: false
    });
  } catch(err) {
    console.error('PRESCRIPTION DETAIL ERROR:', err.message);
    renderAppError(res, 500, 'page.load_prescription', 'Cannot load prescription.')
  }
});

// GET: Print prescription
app.get('/prescriptions/:id/print', requireAuth, async (req, res) => {
  const rxId = parseInt(req.params.id) || 0;
  try {
    const ensureHmsExtendedSchema = require('./lib/ensureHmsExtendedSchema');
    const prescriptionVerify = require('./lib/prescriptionVerify');
    await ensureHmsExtendedSchema(pool).catch(() => {});
    const [rows] = await pool.query(`
      SELECT r.*, p.first_name, p.last_name, p.phone, p.gender, p.dob,
             e.first_name AS doc_fn, e.last_name AS doc_ln
      FROM tbl_prescription r
      JOIN tbl_patient p ON p.id = r.patient_id
      LEFT JOIN tbl_employee e ON e.id = r.created_by
      WHERE r.id = ? LIMIT 1
    `, [rxId]);
    if (!rows.length) return res.redirect('/prescriptions');
    const token = await prescriptionVerify.ensureRxToken(pool, rxId);
    const verifyUrl = prescriptionVerify.verifyUrl(req, token);
    res.render('prescription-detail', {
      title: pageTitle(res, 'document_titles.print_rx_id', 'Print Rx #RX-{{id}}', { id: rxId }),
      rx: rows[0],
      printMode: true,
      verifyUrl,
      verifyToken: token,
    });
  } catch(err) {
    res.status(500).send('Error loading prescription for print.');
  }
});

// BILLING & TRANSACTIONS
app.get('/billing', requireAuth, async (req, res) => {
 try {
 const today = new Date().toISOString().split('T')[0];
 const q = (req.query.q || '').trim();
 let where = '1=1';
 const params = [];
 if (q) {
  const like = '%' + q + '%';
  where += ` AND (
   CAST(t.id AS CHAR) LIKE ? OR t.description LIKE ? OR t.payment_method LIKE ?
   OR t.status LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?
   OR CAST(t.patient_id AS CHAR) LIKE ?
  )`;
  params.push(like, like, like, like, like, like, like);
 }
 
 // 1. Financial Stats
 const [statTotal] = await pool.query('SELECT SUM(amount) AS s FROM tbl_transaction WHERE status="completed"');
 const [statToday] = await pool.query('SELECT SUM(amount) AS s FROM tbl_transaction WHERE status="completed" AND transaction_date=?', [today]);
 
 // 2. Recent Transactions (paginated)
 const { rows: transactions, pager } = await pagination.fetchPage(pool, {
  req,
  pageParam: 'p',
  basePath: '/billing',
  query: q ? { q } : {},
  countSql: `SELECT COUNT(*) AS total FROM tbl_transaction t LEFT JOIN tbl_patient p ON p.id = t.patient_id WHERE ${where}`,
  countParams: params,
  dataSql: `
 SELECT t.*, p.first_name, p.last_name 
 FROM tbl_transaction t 
 LEFT JOIN tbl_patient p ON p.id = t.patient_id 
 WHERE ${where}
 ORDER BY t.id DESC`,
  dataParams: params,
 });

 res.render('billing', { 
 title: pageTitle(res, 'document_titles.billing', 'Billing — ZAIZENS'), 
 pageData: {
   stats: {
     total: statTotal[0].s || 0,
     today: statToday[0].s || 0
   },
   transactions,
   pager,
   searchQ: q,
   flash: req.query.msg || null,
   error: req.query.err || null,
 },
 });
 } catch (err) {
 console.error(err);
 renderAppError(res, 500, 'page.load_billing', 'Billing load failure.', { detail: err.message })
 }
});

// Same transaction list as /billing (PHP: transactions.php) — deep link for accountant tiles.
app.get(
 '/billing/transactions',
 requireAuth,
 requirePerm('billing.read', 'billing.write', 'accounting.read', 'accounting.write'),
 (req, res) => {
  res.redirect(302, '/billing');
 }
);

// Fiscal receipts & company invoices (PHP: receipts-invoices.php).
app.get(
 '/billing/receipts',
 requireAuth,
 requirePerm('billing.read', 'billing.write', 'accounting.read', 'accounting.write'),
 async (req, res) => {
  const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
  let fType = String(req.query.t || 'all');
  if (!['all', 'receipt', 'invoice'].includes(fType)) fType = 'all';
  const qRaw = String(req.query.q || '').trim();

  let tableOk = false;
  let rows = [];
  let errMsg = null;
  try {
   await pool.query('SELECT 1 FROM tbl_billing_document LIMIT 1');
   tableOk = true;
  } catch (_) {
   tableOk = false;
  }

  let pager = null;
  const pagerQuery = {};
  if (fType !== 'all') pagerQuery.t = fType;
  if (qRaw !== '') pagerQuery.q = qRaw;

  if (tableOk) {
   const params = [fid];
   let where = 'd.facility_id = ?';
   if (fType !== 'all') {
    where += ' AND d.doc_type = ?';
    params.push(fType);
   }
   if (qRaw !== '') {
    const safe = qRaw.replace(/[%_\\]/g, ' ').trim();
    if (safe !== '') {
     const like = `%${safe}%`;
     where +=
      ' AND (d.doc_number LIKE ? OR COALESCE(d.payer_snapshot,\'\') LIKE ? OR COALESCE(d.company_snapshot,\'\') LIKE ?)';
     params.push(like, like, like);
    }
   }
   try {
    const pageResult = await pagination.fetchPage(pool, {
     req,
     pageParam: 'p',
     basePath: '/billing/receipts',
     query: pagerQuery,
     countSql: `SELECT COUNT(*) AS total FROM tbl_billing_document d WHERE ${where}`,
     countParams: params,
     dataSql: `SELECT d.*, p.first_name AS p_first_name, p.last_name AS p_last_name
       FROM tbl_billing_document d
       LEFT JOIN tbl_patient p ON p.id = d.patient_id
       WHERE ${where}
       ORDER BY d.id DESC`,
     dataParams: params,
    });
    rows = pageResult.rows;
    pager = pageResult.pager;
   } catch (e) {
    tableOk = false;
    errMsg = e && e.message ? e.message : 'Query failed';
   }
  }

  res.render('billing-receipts', {
   title: pageTitle(res, 'document_titles.receipts_invoices', 'Receipts & Invoices — ZAIZENS'),
   tableOk,
   rows,
   pager,
   pagerQuery,
   fType,
   qRaw,
   flash: req.query.msg || null,
   error: req.query.err || errMsg || null,
  });
 }
);

async function ensureFinancialSettingsTable(db) {
 await db.query(`
  CREATE TABLE IF NOT EXISTS tbl_hms_fin_setting (
   k VARCHAR(96) PRIMARY KEY,
   v VARCHAR(1024) NULL,
   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
 `).catch(() => {});
}

async function getFinSetting(db, key, def = '') {
 try {
  const [[r]] = await db.query('SELECT v FROM tbl_hms_fin_setting WHERE k=? LIMIT 1', [key]);
  if (r && r.v != null && String(r.v).trim() !== '') return String(r.v);
 } catch (e) {}
 return def;
}

// FINANCIALS (OHADA hub + reports) — accountant / billing roles only
app.get('/financials', requireAuth, requirePerm('accounting.read','accounting.write','billing.write','financials.read','financials.write'), async (req, res) => {
 try {
  const { buildFinancialDashboard } = require('./lib/hmsFinDashboard');
  const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
  const dash = await buildFinancialDashboard(pool, fid);
  const { finPageData } = require('./lib/reactRouteHelpers');
  res.render('financials', {
   title: pageTitle(res, 'document_titles.accounting', 'Accounting — ZAIZENS'),
   ...finPageData('dashboard', 'dashboard', {
    title: pageTitle(res, 'document_titles.accounting_short', 'Accounting'),
    metrics: dash.metrics,
    recentJournals: dash.recentJournals,
    topAccounts: dash.topAccounts,
    flash: req.query.msg || null,
    error: req.query.err || null,
   }),
  });
 } catch (err) {
  console.error('FINANCIALS:', err.message);
  renderAppError(res, 500, 'page.load_financials', 'Financials load failure.', { detail: err.message })
 }
});

// PAYROLL & HR — moved to standalone Zaizens_PayRoll (http://127.0.0.1:3010)

// Balance sheet -> routes/financialsBalanceSheet.js (GL-based, Phase 5)

// /financials/tax → /financials/settings (see routes/financialsSettings.js)

// INVENTORY MANAGEMENT
app.get('/inventory', requireAuth, requirePerm('inventory.read','inventory.write','pharmacy.read','pharmacy.write'), async (req, res) => {
 try {
 const ensureInventorySchema = require('./lib/ensureInventorySchema');
 await ensureInventorySchema(pool).catch(() => {});

 // 1. Inventory Stats
 const [stats] = await pool.query(`
 SELECT 
 COUNT(*) AS total_skus,
 SUM(quantity) AS total_units,
 SUM(CASE WHEN quantity <= reorder_level AND quantity > 0 THEN 1 ELSE 0 END) AS low_stock,
 SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) AS out_stock
 FROM tbl_inventory_item
 `);

 const q = String(req.query.q || '').trim();
 let where = '1=1';
 const listParams = [];
 if (q) {
  where += ' AND (i.sku LIKE ? OR i.name LIKE ? OR c.name LIKE ? OR i.category LIKE ?)';
  const like = '%' + q + '%';
  listParams.push(like, like, like, like);
 }

 const { rows: items, pager } = await pagination.fetchPage(pool, {
  req,
  pageParam: 'p',
  basePath: '/inventory',
  query: q ? { q } : {},
  countSql: `SELECT COUNT(*) AS total FROM tbl_inventory_item i LEFT JOIN tbl_inventory_category c ON c.id = i.category_id WHERE ${where}`,
  countParams: listParams,
  dataSql: `SELECT i.*, c.name AS cat_name FROM tbl_inventory_item i LEFT JOIN tbl_inventory_category c ON c.id = i.category_id WHERE ${where} ORDER BY i.name ASC`,
  dataParams: listParams,
 });

 // 3. Low Stock Alerts
 const [alerts] = await pool.query('SELECT * FROM tbl_inventory_item WHERE quantity <= reorder_level ORDER BY quantity ASC LIMIT 10');

 const [invCategories] = await pool
  .query('SELECT id, name FROM tbl_inventory_category ORDER BY name ASC')
  .catch(() => [[]]);

 res.locals.pager = pager;
 res.render('inventory', { 
 title: pageTitle(res, 'document_titles.inventory', 'Inventory — ZAIZENS'), 
 pageData: {
   stats: stats[0],
   items,
   searchQ: q,
   pager,
   alerts,
   invCategories: Array.isArray(invCategories) ? invCategories : [],
   flash: req.query.msg || null,
   error: req.query.err || null,
   userPerms: res.locals.userPerms || [],
 },
 });
 } catch (err) {
 console.error(err);
 renderAppError(res, 500, 'page.load_inventory', 'Inventory load failure.', { detail: err.message })
 }
});

app.get('/inventory/next-sku', requireAuth, requirePerm('inventory.read','inventory.write','pharmacy.read','pharmacy.write'), async (req, res) => {
 try {
  const ensureInventorySchema = require('./lib/ensureInventorySchema');
  await ensureInventorySchema(pool).catch(() => {});
  const ensureFacilityRow = require('./lib/ensureFacilityRow');
  const { allocateNextInventorySku } = require('./lib/inventorySku');
  const facilityId = await ensureFacilityRow(
   pool,
   req.session.facilityId || req.session.user?.facility_id || req.session.user?.facilityId || 1
  );
  const catId = parseInt(String(req.query.category_id || '0'), 10) || 0;
  const sku = await allocateNextInventorySku(pool, facilityId, catId);
  return res.json({ ok: true, sku });
 } catch (e) {
  console.error('inventory next-sku:', e);
  return res.status(500).json({ ok: false, error: e.message || 'Could not generate SKU.' });
 }
});

app.post('/inventory/add-sku', requireAuth, requirePerm('inventory.write','pharmacy.write'), async (req, res) => {
 const ensureInventorySchema = require('./lib/ensureInventorySchema');
 await ensureInventorySchema(pool).catch(() => {});
 let sku = String(req.body.sku || '')
  .trim()
  .replace(/\s+/g, '-')
  .slice(0, 64);
 const name = String(req.body.name || '').trim().slice(0, 255);
 const qty = Math.max(0, parseInt(String(req.body.quantity || '0'), 10) || 0);
 const reorder = Math.max(0, parseInt(String(req.body.reorder_level || '5'), 10) || 5);
 const catId = parseInt(String(req.body.category_id || '0'), 10) || 0;
 const unitPriceRaw = parseFloat(String(req.body.unit_price || '0'));
 const unitPrice = Number.isFinite(unitPriceRaw) ? Math.max(0, unitPriceRaw) : 0;
 try {
  const ensureFacilityRow = require('./lib/ensureFacilityRow');
  const { allocateNextInventorySku } = require('./lib/inventorySku');
  const facilityId = await ensureFacilityRow(
   pool,
   req.session.facilityId || req.session.user?.facility_id || req.session.user?.facilityId || 1
  );
  if (!sku) {
   sku = await allocateNextInventorySku(pool, facilityId, catId);
  }
  if (!name) {
   return res.redirect('/inventory?err=' + encodeURIComponent(flashT(res, 'flash.sku_and_product_name_are_required')));
  }
  const [[dup]] = await pool.query(
   'SELECT id FROM tbl_inventory_item WHERE LOWER(TRIM(sku)) = LOWER(?) LIMIT 1',
   [sku]
  );
  if (dup && dup.id) {
   return res.redirect('/inventory?err=' + encodeURIComponent(flashT(res, 'flash.that_sku_code_is_already_in_use')));
  }
  let catName = null;
  if (catId > 0) {
   const [[c]] = await pool.query('SELECT name FROM tbl_inventory_category WHERE id = ? LIMIT 1', [catId]);
   if (c && c.name) catName = String(c.name).trim().slice(0, 120);
  }
  try {
   await pool.query(
    `INSERT INTO tbl_inventory_item (facility_id, sku, name, quantity, reorder_level, category_id, category, unit_price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [facilityId, sku, name, qty, reorder, catId > 0 ? catId : null, catName || 'supply', unitPrice]
   );
  } catch (e1) {
   const badCol = e1.code === 'ER_BAD_FIELD_ERROR' || e1.errno === 1054;
   if (!badCol) throw e1;
   try {
    await pool.query(
     `INSERT INTO tbl_inventory_item (sku, name, quantity, reorder_level, category_id, category, unit_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
     [sku, name, qty, reorder, catId > 0 ? catId : null, catName, unitPrice]
    );
   } catch (e2) {
    const badCol2 = e2.code === 'ER_BAD_FIELD_ERROR' || e2.errno === 1054;
    if (!badCol2) throw e2;
    try {
     await pool.query(
      `INSERT INTO tbl_inventory_item (sku, name, quantity, reorder_level, category_id)
       VALUES (?, ?, ?, ?, ?)`,
      [sku, name, qty, reorder, catId > 0 ? catId : null]
     );
    } catch (e3) {
     const badCol3 = e3.code === 'ER_BAD_FIELD_ERROR' || e3.errno === 1054;
     if (!badCol3) throw e3;
     await pool.query(
      `INSERT INTO tbl_inventory_item (sku, name, quantity, reorder_level)
       VALUES (?, ?, ?, ?)`,
      [sku, name, qty, reorder]
     );
    }
   }
  }
  const recordInventoryMovement = require('./lib/recordInventoryMovement');
  const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || null;
  const [[newRow]] = await pool.query(
   'SELECT id, COALESCE(quantity,0) AS quantity FROM tbl_inventory_item WHERE LOWER(TRIM(sku)) = LOWER(?) ORDER BY id DESC LIMIT 1',
   [sku]
  );
  if (newRow && newRow.id) {
   await recordInventoryMovement(pool, {
    inventory_item_id: newRow.id,
    change_qty: qty,
    qty_before: 0,
    qty_after: parseInt(newRow.quantity, 10) || qty,
    reason: 'create',
    note: 'New SKU',
    user_id: uid,
   });
  }
  return res.redirect('/inventory?msg=' + encodeURIComponent(flashT(res, 'flash.new_sku_added_to_stock_registry')));
 } catch (e) {
  console.error('inventory add-sku:', e);
  return res.redirect('/inventory?err=' + encodeURIComponent(e.message || 'Could not add SKU.'));
 }
});

app.post('/inventory/import-pharmacy-catalog', requireAuth, requirePerm('inventory.write','pharmacy.write'), async (req, res) => {
 try {
  const ensureInventorySchema = require('./lib/ensureInventorySchema');
  await ensureInventorySchema(pool).catch(() => {});
  const { importPharmacyCatalogToInventory } = require('./lib/importPharmacyCatalogToInventory');
  const facilityId = req.session.facilityId || req.session.user?.facility_id || req.session.user?.facilityId || 1;
  const r = await importPharmacyCatalogToInventory(pool, { facilityId });
  if (!r.catalogTotal) {
   return res.redirect(
    '/inventory?err=' +
     encodeURIComponent(flashT(res, 'flash.no_active_pharmacy_items_in_service_catalog_open_catalog_pharmacy_and_im'))
   );
  }
  const msg =
   `Pharmacy catalog imported: ${r.inserted} new SKU(s)` +
   (r.updated ? `, ${r.updated} updated` : '') +
   (r.linked ? `, ${r.linked} linked to catalog` : '') +
   (r.skipped ? `, ${r.skipped} skipped (duplicate)` : '') +
   ` (${r.catalogTotal} medications). Quantity and reorder level are 0 — set them when stock is received.`;
  return res.redirect('/inventory?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('inventory import-pharmacy-catalog:', e);
  return res.redirect('/inventory?err=' + encodeURIComponent(e.message || 'Import failed.'));
 }
});

async function handleApplyPharmacyStockSheet(req, res) {
 try {
  const { applyPharmacyInventoryStockLevels } = require('./lib/pharmacyInventoryStockLevels');
  const facilityId = req.session.facilityId || req.session.user?.facility_id || req.session.user?.facilityId || 1;
  const userId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || null;
  const r = await applyPharmacyInventoryStockLevels(pool, { facilityId, userId });
  if (r.missingInventory.length && !r.updated) {
   return res.redirect(
    '/inventory?err=' +
     encodeURIComponent(flashT(res, 'flash.no_pharmacy_inventory_rows_found_import_the_pharmacy_catalog_into_invent'))
   );
  }
  let msg = `Stock sheet applied: ${r.updated} item(s) updated`;
  if (r.unchanged) msg += `, ${r.unchanged} already correct`;
  if (r.missingInventory.length) {
   msg += `; ${r.missingInventory.length} line(s) missing inventory (import catalog first)`;
  }
  if (r.missingCatalog.length) msg += `; ${r.missingCatalog.length} line(s) missing catalog match`;
  return res.redirect('/inventory?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('inventory apply-pharmacy-stock-sheet:', e);
  return res.redirect('/inventory?err=' + encodeURIComponent(e.message || 'Could not apply stock sheet.'));
 }
}

app.get('/inventory/apply-pharmacy-stock-sheet', requireAuth, requirePerm('inventory.write','pharmacy.write'), (req, res) => {
 return res.redirect(
  '/inventory?err=' +
   encodeURIComponent(flashT(res, 'flash.use_the_apply_stock_sheet_button_on_inventory_post_action_opening_this_u'))
 );
});

app.post('/inventory/apply-pharmacy-stock-sheet', requireAuth, requirePerm('inventory.write','pharmacy.write'), handleApplyPharmacyStockSheet);

app.get('/inventory/item/:id/movements', requireAuth, requirePerm('inventory.read','inventory.write','pharmacy.read','pharmacy.write'), async (req, res) => {
 const id = parseInt(req.params.id, 10) || 0;
 if (id < 1) return res.redirect('/inventory?err=' + encodeURIComponent(flashT(res, 'flash.invalid_item')));
 try {
  const ensureInventorySchema = require('./lib/ensureInventorySchema');
  await ensureInventorySchema(pool).catch(() => {});
  const [[item]] = await pool.query(
   `SELECT i.*, c.name AS cat_name
      FROM tbl_inventory_item i
      LEFT JOIN tbl_inventory_category c ON c.id = i.category_id
     WHERE i.id = ?
     LIMIT 1`,
   [id]
  );
  if (!item) return res.redirect('/inventory?err=' + encodeURIComponent(flashT(res, 'flash.item_not_found')));
  const reasonFilter = String(req.query.reason || '').trim().toLowerCase();
  const moveParams = [id];
  let moveWhere = 'm.inventory_item_id = ?';
  if (reasonFilter && /^[a-z_]{2,40}$/.test(reasonFilter)) {
   moveWhere += ' AND m.reason = ?';
   moveParams.push(reasonFilter);
  }
  const [movements] = await pool
   .query(
    `SELECT m.*, e.first_name AS emp_fn, e.last_name AS emp_ln
       FROM tbl_inventory_movement m
       LEFT JOIN tbl_employee e ON e.id = m.user_id
      WHERE ${moveWhere}
      ORDER BY m.id DESC
      LIMIT 200`,
    moveParams
   )
   .catch(() => [[]]);
  res.render('inventory-movements', {
   title: pageTitle(res, 'document_titles.stock_movements', 'Stock movements — ZAIZENS'),
   item,
   movements: Array.isArray(movements) ? movements : [],
   reasonFilter: reasonFilter || '',
   flash: req.query.msg || null,
   error: req.query.err || null,
  });
 } catch (e) {
  console.error('inventory movements:', e);
  renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });
 }
});

app.post('/inventory/adjust-stock', requireAuth, requirePerm('inventory.write','pharmacy.write'), async (req, res) => {
 const itemId = parseInt(String(req.body.inventory_item_id || ''), 10) || 0;
 const delta = parseInt(String(req.body.quantity_delta || ''), 10);
 const note = String(req.body.note || '').trim().slice(0, 500) || null;
 if (itemId < 1 || !Number.isFinite(delta) || delta === 0) {
  return res.redirect('/inventory?err=' + encodeURIComponent(flashT(res, 'flash.select_an_item_and_enter_a_non_zero_quantity_change_or')));
 }
 if (Math.abs(delta) > 10000000) {
  return res.redirect('/inventory?err=' + encodeURIComponent(flashT(res, 'flash.adjustment_is_too_large')));
 }
 try {
  const ensureInventorySchema = require('./lib/ensureInventorySchema');
  await ensureInventorySchema(pool).catch(() => {});
  const recordInventoryMovement = require('./lib/recordInventoryMovement');
  const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || null;
  const [[row]] = await pool.query(
   'SELECT id, COALESCE(quantity,0) AS quantity FROM tbl_inventory_item WHERE id = ? LIMIT 1',
   [itemId]
  );
  if (!row) return res.redirect('/inventory?err=' + encodeURIComponent(flashT(res, 'flash.item_not_found')));
  const before = parseInt(row.quantity, 10) || 0;
  const after = before + delta;
  if (after < 0) {
   return res.redirect('/inventory?err=' + encodeURIComponent(flashT(res, 'flash.resulting_quantity_cannot_be_negative')));
  }
  const [upd] = await pool.query('UPDATE tbl_inventory_item SET quantity = ? WHERE id = ?', [after, itemId]);
  const n = upd && (upd.affectedRows !== undefined ? upd.affectedRows : 0);
  if (!n) return res.redirect('/inventory?err=' + encodeURIComponent(flashT(res, 'flash.could_not_update_item')));
  await recordInventoryMovement(pool, {
   inventory_item_id: itemId,
   change_qty: delta,
   qty_before: before,
   qty_after: after,
   reason: 'adjust',
   note: note || 'Manual adjustment',
   user_id: uid,
  });
  const retRaw = String(req.body._return || '').trim();
  const ret =
   (retRaw.startsWith('/inventory') || retRaw.startsWith('/pharmacy')) && !retRaw.startsWith('//')
    ? retRaw
    : '/inventory';
  const sep = ret.includes('?') ? '&' : '?';
  return res.redirect(ret + sep + 'msg=' + encodeURIComponent(flashT(res, 'flash.stock_adjusted')));
 } catch (e) {
  console.error('inventory adjust-stock:', e);
  const retRaw = String(req.body._return || '').trim();
  const ret =
   (retRaw.startsWith('/inventory') || retRaw.startsWith('/pharmacy')) && !retRaw.startsWith('//')
    ? retRaw
    : '/inventory';
  const sep = ret.includes('?') ? '&' : '?';
  return res.redirect(ret + sep + 'err=' + encodeURIComponent(e.message || 'Adjustment failed.'));
 }
});

// STAFF MANAGEMENT
app.get('/staff', requireAuth, async (req, res) => {
 try {
 const hmsStaffAccountGuard = require('./lib/hmsStaffAccountGuard');
 const [staff] = await pool.query(
  `SELECT * FROM tbl_employee e WHERE ${hmsStaffAccountGuard.STAFF_HEADCOUNT_SQL} ORDER BY e.id`
 );
 const roles = {
 '1': 'Admin', '2': 'Doctor', '3': 'Front Desk', '4': 'Lab Technician',
 '5': 'Pharmacist', '6': 'Radiology Tech', '7': 'Nurse', '8': 'Nursing Aid'
 };
 const actorRole = String(req.session.user?.role ?? '');
 const perms = res.locals.userPerms || [];
 res.render('staff', {
 title: pageTitle(res, 'document_titles.staff', 'Staff — ZAIZENS'),
 pageData: {
  staff: Array.isArray(staff) ? staff : [],
  roleMap: roles,
  flash: req.query.msg || null,
  error: req.query.err || null,
  canAddStaff: perms.includes('*') || perms.includes('employee.write'),
 },
 });
 } catch (err) {
 console.error(err);
 renderAppError(res, 500, 'page.load_staff', 'Staff load failure.')
 }
});

// ADVANCED REPORTS & ANALYTICS
app.get('/reports', requireAuth, async (req, res) => {
 try {
 // 1. Clinical Volume (Last 30 Days)
 const [patients] = await pool.query('SELECT COUNT(*) AS total FROM tbl_patient');
 const [appointments] = await pool.query('SELECT COUNT(*) AS total FROM tbl_appointment');
 
 // 2. Financial Snapshot
 const [revenue] = await pool.query('SELECT SUM(amount) AS total FROM tbl_transaction WHERE status="completed"');

 // 3. Departmental Distribution
 const [deptDist] = await pool.query(`
 SELECT primary_department as name, COUNT(*) as value 
 FROM tbl_employee 
 WHERE primary_department IS NOT NULL 
 GROUP BY primary_department
 `);

 res.render('reports', { 
 title: pageTitle(res, 'document_titles.reports', 'Reports — ZAIZENS'), 
 stats: {
 totalPatients: patients[0].total,
 totalAppointments: appointments[0].total,
 totalRevenue: revenue[0].total || 0
 },
 deptDist
 });
 } catch (err) {
 console.error(err);
 renderAppError(res, 500, 'page.load_reports', 'Reports load failure.')
 }
});

// CASHIER MODULE — cashier ACL or admin
app.get('/cashier', requireAuth, requirePerm('cashier.read','cashier.write'), async (req, res) => {
 try {
 try {
  const { attachCashierToSession } = require('./lib/cashierIdentity');
  await attachCashierToSession(pool, req, { forceAssign: true });
 } catch (_) {}
 const syncEmergencyCashierTickets = require('./lib/syncEmergencyCashierTickets');
 await syncEmergencyCashierTickets(pool);
 const histQ = String(req.query.hist_q || '').trim();
 const {
  page: histPage,
  pageSize: histLimit,
  offset: histOffset,
  pageParam: histPageParam,
 } = pagination.parsePage(req, { pageParam: 'page' });

 const histParams = [];
 let histWhere = '';
 if (histQ) {
  histWhere =
   ' AND (LOWER(t.ticket_code) LIKE LOWER(?) OR LOWER(CONCAT(COALESCE(p.first_name,\'\'),\' \',COALESCE(p.last_name,\'\'))) LIKE LOWER(?))';
  const like = `%${histQ}%`;
  histParams.push(like, like);
 }

 await betterPayPayment.purgeExpired(pool).catch((e) => console.warn('[BetterPay] purge:', e.message));

 const [pending] = await pool.query(`
 SELECT t.*, p.first_name, p.last_name,
   bp.status AS betterpay_status
 FROM tbl_payment_ticket t
 JOIN tbl_patient p ON p.id = t.patient_id
 LEFT JOIN tbl_betterpay_payment bp ON bp.ref = t.ticket_code
 WHERE t.status = 'pending' ORDER BY t.id DESC LIMIT ${pagination.DEFAULT_PAGE_SIZE}
 `);

 const [history] = await pool.query(
  `
 SELECT t.*, p.first_name, p.last_name 
 FROM tbl_payment_ticket t 
 JOIN tbl_patient p ON p.id = t.patient_id 
 WHERE 1=1 ${histWhere}
 ORDER BY t.id DESC LIMIT ? OFFSET ?
 `,
  [...histParams, histLimit, histOffset]
 );

 const [[histCountRow]] = await pool.query(
  `SELECT COUNT(*) AS c FROM tbl_payment_ticket t JOIN tbl_patient p ON p.id = t.patient_id WHERE 1=1 ${histWhere}`,
  histParams
 ).catch(() => [[{ c: 0 }]]);
 const historyTotal = parseInt(histCountRow && histCountRow.c, 10) || 0;
 const historyPager = pagination.metaFromTotal(historyTotal, histPage, histLimit);
 historyPager.basePath = '/cashier';
 historyPager.query = histQ ? { hist_q: histQ } : {};
 historyPager.pageParam = histPageParam;
 const historyTotalPages = historyPager.totalPages;
 const historyHasNext = historyPager.hasNext;
 const historyHasPrev = historyPager.hasPrev;

 // Today's revenue KPIs
 const [[kpi]] = await pool.query(`
 SELECT
 COALESCE(SUM(CASE WHEN DATE(t.paid_at)=CURDATE() THEN t.total_amount END),0) AS today_revenue,
 SUM(CASE WHEN t.status='pending' THEN 1 ELSE 0 END) AS pending_count,
 SUM(CASE WHEN DATE(t.paid_at)=CURDATE() AND t.status='paid' THEN 1 ELSE 0 END) AS today_count,
 COALESCE(SUM(CASE WHEN DATE(t.paid_at)=CURDATE() AND t.payment_method='Wallet' THEN t.total_amount END),0) AS today_wallet
 FROM tbl_payment_ticket t
 `).catch(() => [[{ today_revenue:0, pending_count:0, today_count:0, today_wallet:0 }]]);

 // Catalog
 const [consultCatalog = []] = await pool.query(
 "SELECT id, name, price, COALESCE(department_name,'') as department_name FROM tbl_service_catalog WHERE status = 1 AND LOWER(TRIM(category)) = 'consultation' ORDER BY name"
 ).catch(() => [[]]);
 const [labCatalog = []] = await pool.query(
 "SELECT id, name, price, COALESCE(department_name,'') as department_name FROM tbl_service_catalog WHERE status = 1 AND LOWER(TRIM(category)) = 'laboratory' ORDER BY name"
 ).catch(() => [[]]);
 const [imagingCatalog = []] = await pool.query(
 `SELECT id, name, price, COALESCE(department_name,'') as department_name FROM tbl_service_catalog WHERE status = 1 AND ${imagingCategoryWhere()} ORDER BY sort_order, name`
 ).catch(() => [[]]);
 const [svcCatalog = []] = await pool.query(
 "SELECT id, name, price, COALESCE(department_name,'') as department_name FROM tbl_service_catalog WHERE status = 1 AND LOWER(TRIM(COALESCE(category, 'service'))) = 'service' ORDER BY name"
 ).catch(() => [[]]);
 const [maternityCatalog = []] = await pool.query(
 "SELECT id, name, price, COALESCE(department_name,'') as department_name FROM tbl_service_catalog WHERE status = 1 AND LOWER(TRIM(category)) = 'maternity' ORDER BY name"
 ).catch(() => [[]]);
 const [surgeryCatalog = []] = await pool.query(
 "SELECT id, name, price, COALESCE(department_name,'') as department_name FROM tbl_service_catalog WHERE status = 1 AND LOWER(TRIM(category)) IN ('surgery', 'procedure') ORDER BY name"
 ).catch(() => [[]]);
 const [allCatalog = []] = await pool.query(
 "SELECT id, name, price, COALESCE(category,'service') as category, COALESCE(department_name,'') as department_name FROM tbl_service_catalog WHERE status = 1 ORDER BY category, name"
 ).catch(() => [[]]);

 const [pharmacyCatalog = []] = await pool.query(
 "SELECT id, name, price, COALESCE(department_name,'') as department_name FROM tbl_service_catalog WHERE status = 1 AND LOWER(TRIM(category)) = 'pharmacy' ORDER BY name"
 ).catch(() => [[]]);

 const serviceCatalogForInvoice = [
  ...consultCatalog,
  ...labCatalog,
  ...imagingCatalog,
  ...svcCatalog,
  ...maternityCatalog,
  ...surgeryCatalog,
 ].map((r) => ({ id: r.id, name: r.name, price: r.price, department_name: r.department_name }));

 // Patients with insurance coverage (badge in Issue Payment modal).
 // Prefer primary policy; else any in-date policy with highest insurer_covered_percent.
 const today = new Date().toISOString().split('T')[0];
 let patients = [];
 try {
 const [pRows] = await pool.query(`
 SELECT p.id, p.first_name, p.last_name, COALESCE(p.phone,'') AS phone,
 COALESCE((
  SELECT COALESCE(pi.insurer_covered_percent, 0)
  FROM tbl_patient_insurance pi
  WHERE pi.patient_id = p.id
   AND COALESCE(pi.insurer_covered_percent, 0) > 0
   AND (pi.effective_from IS NULL OR pi.effective_from <= ?)
   AND (pi.effective_to IS NULL OR pi.effective_to >= ?)
  ORDER BY pi.is_primary DESC, pi.insurer_covered_percent DESC, pi.id DESC
  LIMIT 1
 ), 0) AS coverage
 FROM tbl_patient p
 WHERE p.status = 1
 ORDER BY p.last_name, p.first_name
 LIMIT 2500
 `, [today, today]);
 patients = Array.isArray(pRows) ? pRows : [];
 } catch (e) {
 const [pRows] = await pool.query(
 'SELECT id, first_name, last_name, COALESCE(phone,"") AS phone, 0 AS coverage FROM tbl_patient WHERE status = 1 ORDER BY last_name, first_name LIMIT 2500'
 ).catch(() => [[]]);
 patients = Array.isArray(pRows) ? pRows : [];
 }

 const hmsDoctorStaff = require('./lib/hmsDoctorStaff');
 const { listSpecialisationCatalog } = require('./lib/hmsOrgClinicalCatalog');
 const doctors = await hmsDoctorStaff.fetchActiveDoctorsWithClinicalLinks(
  pool,
  'e.id, e.first_name, e.last_name, COALESCE(e.specialisation,"") AS specialisation, COALESCE(e.primary_department,"") AS primary_department'
 ).catch(() => []);
 const [deptRows] = await pool.query(
  'SELECT department_name FROM tbl_department WHERE status = 1'
 ).catch(() => [[]]);
 const departmentNames = new Set(
  (deptRows || []).map((r) => String(r.department_name || '').trim().toLowerCase()).filter(Boolean)
 );
 const catalogRows = await listSpecialisationCatalog(pool).catch(() => []);
 const doctorCatalogSpecs = (catalogRows || [])
  .filter((r) => parseInt(r.status, 10) === 1)
  .map((r) => String(r.name || '').trim())
  .filter(Boolean);
 const specialistSpecialisations = listSpecialistSpecialisationsForCashier(
  doctors,
  doctorCatalogSpecs,
  { departmentNames }
 );

 const paymentMethods = betterPayQr.CASHIER_PAYMENT_METHODS;

 // Auto-add ipd_payment_code + ipd_paid_at columns if not yet migrated
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_payment_code VARCHAR(40) DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_paid_at DATETIME DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_payment_code_generated_at DATETIME DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_code_consumed_at DATETIME DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_code_service_label VARCHAR(120) DEFAULT NULL").catch(() => {});
 await pool.query(`
  UPDATE tbl_admission
  SET ipd_payment_code_generated_at = COALESCE(ipd_payment_code_generated_at, ipd_paid_at)
  WHERE ipd_payment_code IS NOT NULL AND TRIM(ipd_payment_code) <> ''
    AND ipd_payment_code_generated_at IS NULL AND ipd_paid_at IS NOT NULL
 `).catch(() => {});
 await pool.query(`
  UPDATE tbl_admission
  SET ipd_code_consumed_at = discharged_at
  WHERE ipd_payment_code IS NOT NULL AND TRIM(ipd_payment_code) <> ''
    AND discharged_at IS NOT NULL AND ipd_code_consumed_at IS NULL
 `).catch(() => {});

 /** Every issued code: IPD discharge codes + cashier PAY/other tickets (IPD-* rows come only from admissions to avoid duplicates). */
 let codesStatus = [];
 try {
  const cashierFacilityId = Number(req.session.facilityId) || 1;

  const slipValidityColumns = async (ticketLike, listCodeStatus) => {
   try {
    const disp = await paymentValidity.getSlipValidityDisplay(pool, ticketLike, cashierFacilityId);
    const kind = String(disp.payment_kind || '').toLowerCase();
    const validitySys =
     disp.validity_days_system != null ? Number(disp.validity_days_system) : Number(disp.validity_days);
    const v = Number.isFinite(validitySys) ? validitySys : null;

    const todayYmd = paymentValidity.toLocalDateISO(new Date());
    let dateExpired = false;
    const usesTimeValidity =
      disp.uses_time_validity != null
        ? Boolean(disp.uses_time_validity)
        : paymentValidity.kindUsesConsultationValidity(kind);
    if (!disp.pending_payment && usesTimeValidity && disp.expires_on) {
     const expYmd = String(disp.expires_on).slice(0, 10);
     dateExpired = Boolean(expYmd && todayYmd > expYmd);
    }

    const rem = disp.remaining_uses != null ? Number(disp.remaining_uses) : null;

    let callStatus = 'Active';
    if (!disp.pending_payment) {
     if (dateExpired || (rem !== null && rem <= 0)) callStatus = 'Expired';
    }

    let activeYesNo = String(listCodeStatus || '') === 'Active' ? 'Yes' : 'No';
    if (usesTimeValidity) {
     if (disp.pending_payment) activeYesNo = 'Yes';
     else activeYesNo = !dateExpired && rem != null && rem > 0 ? 'Yes' : 'No';
    }

    return {
     validity_days: v,
     expiration_dd_mm_yy: disp.expires_dd_mm_yy || null,
     active_yes_no: activeYesNo,
     call_status: callStatus,
     remaining_uses: rem
    };
   } catch (_) {
    return {
     validity_days: null,
     expiration_dd_mm_yy: null,
     active_yes_no: String(listCodeStatus || '') === 'Active' ? 'Yes' : 'No',
     call_status: String(listCodeStatus || '') === 'Active' ? 'Active' : 'Expired',
     remaining_uses: null
    };
   }
  };

  const [ipdCodeRows] = await pool.query(`
   SELECT
    TRIM(a.ipd_payment_code) AS code_value,
    a.patient_id,
    a.ipd_payment_code_generated_at,
    a.ipd_paid_at,
    COALESCE(NULLIF(TRIM(a.ipd_code_service_label), ''), 'IPD Final Settlement') AS service_label,
    p.first_name,
    p.last_name,
    CASE
     WHEN a.ipd_code_consumed_at IS NOT NULL THEN 'Consumed'
     ELSE 'Active'
    END AS code_status
   FROM tbl_admission a
   JOIN tbl_patient p ON p.id = a.patient_id
   WHERE a.ipd_payment_code IS NOT NULL AND TRIM(a.ipd_payment_code) <> ''
   ORDER BY COALESCE(a.ipd_payment_code_generated_at, a.ipd_paid_at) DESC, a.id DESC
  `).catch(() => [[]]);

  const [ticketRows] = await pool.query(`
   SELECT t.*, p.first_name, p.last_name
   FROM tbl_payment_ticket t
   JOIN tbl_patient p ON p.id = t.patient_id
   WHERE TRIM(COALESCE(t.ticket_code, '')) <> ''
     AND UPPER(TRIM(t.ticket_code)) NOT LIKE 'IPD-%'
     AND UPPER(TRIM(t.ticket_code)) NOT LIKE 'HOS-%'
  `).catch(() => [[]]);

  const ticketCodeType = (linesJson, ticketCode) => {
   let prefix = '';
   const code = String(ticketCode || '').trim();
   const m = code.match(/^([A-Z]{2,4})-/);
   if (m) prefix = m[1];
   if (!prefix) {
    try {
     const j = typeof linesJson === 'string' ? JSON.parse(linesJson) : linesJson;
     prefix = resolvePaymentCodePrefix(Array.isArray(j) ? j : []);
    } catch (e) {
     prefix = 'OTH';
    }
   }
   return paymentCodeTypeLabel(prefix, SCANS_IMAGING_LABEL);
  };
  const ticketServiceLabel = (linesJson) => {
   try {
    const j = typeof linesJson === 'string' ? JSON.parse(linesJson) : linesJson;
    if (Array.isArray(j) && j[0] && j[0].description) return String(j[0].description);
   } catch (e) {}
   return 'Cashier service';
  };

  const fromIpd = await Promise.all(
   (Array.isArray(ipdCodeRows) ? ipdCodeRows : []).map(async (r) => {
    const base = {
     code_type: 'IPD Payment',
     code_value: r.code_value,
     date_generated: r.ipd_payment_code_generated_at || r.ipd_paid_at,
     service_label: r.service_label,
     first_name: r.first_name,
     last_name: r.last_name,
     code_status: r.code_status
    };
    const anchor = r.ipd_paid_at || r.ipd_payment_code_generated_at;
    const pid = parseInt(String(r.patient_id || ''), 10) || 0;
    let extras = {
     validity_days: null,
     expiration_dd_mm_yy: null,
     active_yes_no: String(r.code_status || '') === 'Active' ? 'Yes' : 'No',
     call_status: String(r.code_status || '') === 'Active' ? 'Active' : 'Expired',
     remaining_uses: null
    };
    if (anchor && pid > 0 && r.code_value) {
     extras = await slipValidityColumns(
      {
       ticket_code: r.code_value,
       code: r.code_value,
       status: 'paid',
       lines_json: JSON.stringify([
        { kind: 'ipd_settlement', description: String(r.service_label || 'IPD Final Settlement') }
       ]),
       facility_id: cashierFacilityId,
       patient_id: pid,
       paid_at: anchor,
       created_at: anchor
      },
      r.code_status
     );
    }
    return { ...base, ...extras };
   })
  );

  const fromTickets = await Promise.all(
   (Array.isArray(ticketRows) ? ticketRows : []).map(async (t) => {
    const base = {
     code_type: ticketCodeType(t.lines_json, t.ticket_code),
     code_value: String(t.ticket_code || '').trim(),
     date_generated: t.created_at,
     service_label: ticketServiceLabel(t.lines_json),
     first_name: t.first_name,
     last_name: t.last_name,
     code_status: String(t.status || '').toLowerCase() === 'paid' ? 'Consumed' : 'Active'
    };
    const pid = parseInt(String(t.patient_id || ''), 10) || 0;
    const extras = await slipValidityColumns(
     {
      ticket_code: t.ticket_code,
      code: t.ticket_code,
      status: t.status,
      lines_json: t.lines_json,
      facility_id: t.facility_id || cashierFacilityId,
      patient_id: pid,
      paid_at: t.paid_at,
      created_at: t.created_at
     },
     base.code_status
    );
    return { ...base, ...extras };
   })
  );

  codesStatus = [...fromIpd, ...fromTickets].sort((a, b) => {
   const da = new Date(a.date_generated || 0).getTime();
   const db = new Date(b.date_generated || 0).getTime();
   return db - da;
  });
 } catch (e) {
  console.error('CODES STATUS LIST:', e.message);
  codesStatus = [];
 }

 // IPD: (1) Clinically discharged, no payment code yet — final settlement
 //      (2) Still admitted, no payment code yet, charges ≠ deposit — ward / running-bill add-charges
 let ipdPending = [];
 try {
 const [ipdDischargedRows] = await pool.query(`
 SELECT a.id AS admission_id, a.patient_id, a.deposit_amount,
 a.clinical_discharged_at, a.ipd_payment_code, a.ipd_status,
 a.admitting_department,
 p.first_name, p.last_name,
 b.ward_name, b.bed_label,
 COALESCE((SELECT SUM(c.amount) FROM tbl_ipd_charge c WHERE c.admission_id=a.id), 0) AS total_charges
 FROM tbl_admission a
 JOIN tbl_patient p ON p.id = a.patient_id
 LEFT JOIN tbl_bed b ON b.id = a.bed_id
 WHERE a.ipd_status = 'clinical_discharged'
 AND (a.ipd_payment_code IS NULL OR TRIM(a.ipd_payment_code) = '')
 AND a.discharged_at IS NULL
 ORDER BY a.clinical_discharged_at DESC
 `);
 const [ipdAdmittedRows] = await pool.query(`
 SELECT a.id AS admission_id, a.patient_id, a.deposit_amount,
 a.clinical_discharged_at, a.ipd_payment_code, a.ipd_status,
 a.admitting_department,
 p.first_name, p.last_name,
 b.ward_name, b.bed_label,
 COALESCE((SELECT SUM(c.amount) FROM tbl_ipd_charge c WHERE c.admission_id=a.id), 0) AS total_charges
 FROM tbl_admission a
 JOIN tbl_patient p ON p.id = a.patient_id
 LEFT JOIN tbl_bed b ON b.id = a.bed_id
 WHERE a.discharged_at IS NULL
 AND a.ipd_status = 'admitted'
 AND (a.ipd_payment_code IS NULL OR TRIM(a.ipd_payment_code) = '')
 AND COALESCE((SELECT SUM(c.amount) FROM tbl_ipd_charge c WHERE c.admission_id=a.id), 0) <> COALESCE(a.deposit_amount, 0)
 ORDER BY a.admitted_at DESC
 `);
 const mapIpdPending = (r) => ({
 ...r,
 balance: Math.max(0, parseFloat(r.total_charges || 0) - parseFloat(r.deposit_amount || 0)),
 refund: Math.max(0, parseFloat(r.deposit_amount || 0) - parseFloat(r.total_charges || 0)),
 });
 const arrDis = Array.isArray(ipdDischargedRows) ? ipdDischargedRows.map(mapIpdPending) : [];
 const arrAdm = Array.isArray(ipdAdmittedRows) ? ipdAdmittedRows.map(mapIpdPending) : [];
 ipdPending = arrDis.concat(arrAdm);
 } catch (ipdErr) {
 console.error('IPD PENDING QUERY ERROR:', ipdErr.message);
 ipdPending = [];
 }

 // ER: clinically discharged, awaiting final settlement code (IPD-style workflow)
 let erPending = [];
 try {
  const [erRows] = await pool.query(`
   SELECT v.id AS visit_id, v.patient_id, v.ticket_number, v.clinical_discharged_at,
          v.er_payment_code, v.er_status,
          p.first_name, p.last_name,
          COALESCE((SELECT SUM(c.amount) FROM tbl_emergency_charge c WHERE c.visit_id=v.id AND c.settled=0), 0) AS balance_due,
          COALESCE((SELECT SUM(c.amount) FROM tbl_emergency_charge c WHERE c.visit_id=v.id), 0) AS total_charges
     FROM tbl_opd_visit v
     JOIN tbl_patient p ON p.id = v.patient_id
    WHERE v.is_emergency = 1
      AND v.er_status = 'clinical_discharged'
      AND v.queue_status = 'clinical_discharged'
      AND (v.er_payment_code IS NULL OR TRIM(v.er_payment_code) = '')
    ORDER BY v.clinical_discharged_at DESC
  `);
  erPending = Array.isArray(erRows) ? erRows : [];
 } catch (erErr) {
  console.error('ER PENDING QUERY ERROR:', erErr.message);
  erPending = [];
 }

 // OPD Orders: consultation-prescribed lab/radiology awaiting billing
 let opdPendingGroups = [];
 try {
  await ensureOpdOrderItemsSchema(pool);
  const [rows] = await pool.query(
   `
    SELECT
      oi.patient_id,
      oi.consultation_id,
      p.first_name,
      p.last_name,
      COUNT(*) AS pending_count,
      COALESCE(SUM(COALESCE(oi.unit_price,0) * COALESCE(oi.quantity,1)),0) AS pending_total,
      MAX(oi.created_at) AS last_created_at
    FROM tbl_opd_order_item oi
    JOIN tbl_patient p ON p.id = oi.patient_id
    WHERE oi.status = 'pending'
    GROUP BY oi.patient_id, oi.consultation_id
    ORDER BY last_created_at DESC
   `
  ).catch(() => [[]]);
  opdPendingGroups = Array.isArray(rows) ? rows : [];
 } catch (e) {
  console.error('OPD PENDING GROUPS:', e.message);
  opdPendingGroups = [];
 }

 // Doctors prescriptions: every consultation that has at least one
 // LAB-/RAD-/PHA- code, aggregated for the cashier prescriptions tab.
 let doctorPrescriptions = [];
 try {
  const [rxRows] = await pool.query(`
   SELECT
    oi.consultation_id,
    oi.patient_id,
    p.first_name AS p_first, p.last_name AS p_last,
    c.created_at AS consult_at,
    c.created_by AS doctor_id,
    e.first_name AS d_first, e.last_name AS d_last,
    COALESCE(NULLIF(TRIM(e.primary_department), ''), 'General') AS d_dept,
    LEFT(COALESCE(c.chief_complaint, ''), 240) AS chief_complaint,
    GROUP_CONCAT(DISTINCT
     CONCAT(oi.item_type, '||', COALESCE(oi.service_code, ''), '||', COALESCE(oi.item_name, ''))
     SEPARATOR '~~'
    ) AS item_blob,
    SUM(CASE WHEN oi.item_type='laboratory' THEN 1 ELSE 0 END) AS lab_n,
    SUM(CASE WHEN oi.item_type='radiology'  THEN 1 ELSE 0 END) AS rad_n,
    SUM(CASE WHEN oi.item_type='pharmacy'   THEN 1 ELSE 0 END) AS pha_n,
    COALESCE(SUM(COALESCE(oi.unit_price,0) * COALESCE(oi.quantity,1)), 0) AS total_amount,
    MAX(CASE WHEN oi.item_type='laboratory' AND oi.service_code IS NOT NULL THEN oi.service_code END) AS lab_code,
    MAX(CASE WHEN oi.item_type='radiology'  AND oi.service_code IS NOT NULL THEN oi.service_code END) AS rad_code,
    MAX(CASE WHEN oi.item_type='pharmacy'   AND oi.service_code IS NOT NULL THEN oi.service_code END) AS pha_code
   FROM tbl_opd_order_item oi
   JOIN tbl_patient p ON p.id = oi.patient_id
   LEFT JOIN tbl_consultation c ON c.id = oi.consultation_id
   LEFT JOIN tbl_employee e ON e.id = c.created_by
   WHERE oi.consultation_id IS NOT NULL
     AND (oi.service_code IS NOT NULL AND oi.service_code <> '')
   GROUP BY oi.consultation_id, oi.patient_id
   ORDER BY consult_at DESC, oi.consultation_id DESC
   LIMIT 500
  `).catch(() => [[]]);
  doctorPrescriptions = (rxRows || []).map(r => ({
   consultation_id: r.consultation_id,
   patient_id: r.patient_id,
   patient_name: `${r.p_first || ''} ${r.p_last || ''}`.trim(),
   doctor_name: r.d_first ? `Dr. ${r.d_first} ${r.d_last || ''}`.trim() : '—',
   doctor_department: r.d_dept,
   consult_at: r.consult_at,
   chief_complaint: r.chief_complaint || '',
   counts: { laboratory: parseInt(r.lab_n||0,10), radiology: parseInt(r.rad_n||0,10), pharmacy: parseInt(r.pha_n||0,10) },
   codes: { laboratory: r.lab_code || null, radiology: r.rad_code || null, pharmacy: r.pha_code || null },
   total_amount: parseFloat(r.total_amount || 0) || 0
  }));
 } catch (e) {
  console.error('DOCTOR PRESCRIPTIONS LIST:', e.message);
  doctorPrescriptions = [];
 }

 const { fetchCashierBillingInvoices } = require('./lib/cashierBillingInvoices');
 const { ensureCashierInvoiceSchema } = require('./lib/ensureCashierInvoiceSchema');
 await ensureCashierInvoiceSchema(pool).catch(() => {});
 let billingInvoices = [];
 let billingSummary = { pending_count: 0, pending_total: 0, paid_today_count: 0, paid_today_total: 0 };
 let billingTotal = 0;
 try {
  const billingData = await fetchCashierBillingInvoices(pool, {
   limit: 200,
   scansLabel: SCANS_IMAGING_LABEL,
  });
  billingInvoices = billingData.invoices || [];
  billingSummary = billingData.summary || billingSummary;
  billingTotal = billingData.total || 0;
 } catch (billingErr) {
  console.error('CASHIER BILLING INVOICES:', billingErr.message);
 }

 const { fixUtf8MojibakeRows } = require('./lib/fixUtf8Mojibake');
 const catalogTextFields = ['name', 'department_name', 'category'];
 const fixCatalogLabels = (rows) => fixUtf8MojibakeRows(rows, catalogTextFields);

 res.render('cashier', {
 title: pageTitle(res, 'document_titles.cashier', 'Payment and Billing — ZAIZENS'),
 pageData: {
  pending: Array.isArray(pending) ? pending : [],
  history: Array.isArray(history) ? history : [],
  hist_q: histQ,
  historyPager,
  consultCatalog: fixCatalogLabels(consultCatalog),
  labCatalog: fixCatalogLabels(labCatalog),
  imagingCatalog: fixCatalogLabels(imagingCatalog),
  svcCatalog: fixCatalogLabels(svcCatalog),
  maternityCatalog: fixCatalogLabels(maternityCatalog),
  surgeryCatalog: fixCatalogLabels(surgeryCatalog),
  doctors,
  specialistSpecialisations,
  paymentMethods,
  ipdPending,
  erPending,
  codesStatus,
  opdPendingGroups,
  doctorPrescriptions,
  billingInvoices,
  billingSummary,
  billingTotal,
  serviceCatalogForInvoice: fixCatalogLabels(serviceCatalogForInvoice),
  pharmacyCatalogForInvoice: fixCatalogLabels(pharmacyCatalog),
  kpi: kpi || { today_revenue: 0, pending_count: 0, today_count: 0, today_wallet: 0 },
  flash: req.query.msg || null,
  error: req.query.err || null,
  userPerms: res.locals.userPerms || [],
 },
 });
 } catch (err) {
 console.error('CASHIER LOAD ERROR:', err.message);
 renderAppError(res, 500, 'page.load_cashier', 'Cashier load failure.', { detail: err.message })
 }
});

// ─────────────────────────────────────────────────────────────────────────
// Cashier · Doctor's Prescription details
//   - GET /cashier/prescriptions/:cid       → JSON for the modal
//   - GET /cashier/prescriptions/:cid/print → printable HTML page
// Both routes resolve the consultation, patient, ordering doctor, and the
// full set of LAB/RAD/PHA items grouped by section with their service codes.
// ─────────────────────────────────────────────────────────────────────────
async function _loadDoctorPrescription(cid) {
 const id = parseInt(cid, 10) || 0;
 if (id < 1) return null;
 await ensureDiagnosticCorrectionSchema(pool).catch(() => {});
 // Schema-tolerant column probe: not every deployment has the same set
 // of consultation / employee columns, so we probe each one and only
 // include those that actually exist.
 const _has = async (table, col) => {
  const [r] = await pool.query(
   `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
   [table, col]
  ).catch(() => [[{ c: 0 }]]);
  return parseInt((r && r[0] && r[0].c) || 0, 10) > 0;
 };
 const colNotes      = await _has('tbl_consultation', 'notes')       ? 'c.notes'              : 'NULL';
 const colDiagCode   = await _has('tbl_consultation', 'diagnosis_code') ? 'c.diagnosis_code'  :
                       await _has('tbl_consultation', 'diagnosis')       ? 'c.diagnosis'        : 'NULL';
 const colQual       = await _has('tbl_employee', 'qualification')   ? 'e.qualification'    : 'NULL';
 const colDept       = await _has('tbl_employee', 'primary_department') ? 'e.primary_department'
                     : await _has('tbl_employee', 'department')           ? 'e.department' : 'NULL';

 const [rows] = await pool.query(`
  SELECT
   c.id AS consultation_id,
   c.created_at AS consult_at,
   c.chief_complaint,
   ${colNotes}    AS notes,
   ${colDiagCode} AS diagnosis_code,
   p.id AS patient_id,
   p.first_name AS p_first, p.last_name AS p_last,
   p.dob, p.age_years, p.gender, p.phone,
   e.id AS doctor_id,
   e.first_name AS d_first, e.last_name AS d_last,
   COALESCE(NULLIF(TRIM(${colDept}), ''), 'General') AS d_dept,
   COALESCE(NULLIF(TRIM(${colQual}), ''), '')        AS d_qual
  FROM tbl_consultation c
  JOIN tbl_patient p ON p.id = c.patient_id
  LEFT JOIN tbl_employee e ON e.id = c.created_by
  WHERE c.id = ? LIMIT 1
 `, [id]).catch((e) => { console.warn('rx head query:', e.message); return [[]]; });
 const head = (rows && rows[0]) || null;
 if (!head) return null;

 const { isRefundableOrderItem, ensureOpdRefundSchema } = require('./lib/opdOrderRefund');
 await ensureOpdRefundSchema(pool).catch(() => {});

 // 2) All OPD items for this consultation (lab/rad/pharmacy)
  const [items] = await pool.query(`
  SELECT id, item_type, item_name, unit_price, quantity, status, service_code,
         served_at, served_notes, created_at, stock_deducted_at, refunded_at,
         refund_amount, refund_method, refund_reason
  FROM tbl_opd_order_item
  WHERE consultation_id = ?
  ORDER BY item_type ASC, id ASC
 `, [id]);

 const auditOiIds = (items || [])
  .filter((it) => it.item_type === 'laboratory' || it.item_type === 'radiology')
  .map((it) => it.id)
  .filter((oid) => oid > 0);
 const auditByOi = new Map();
 if (auditOiIds.length) {
  const [aRows] = await pool
   .query(
    `SELECT a.opd_order_item_id, a.superseded_findings, a.superseded_conclusion, a.performed_at,
            TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,''))) AS performer_name
     FROM tbl_diagnostic_result_correction_audit a
     LEFT JOIN tbl_employee e ON e.id = a.performed_by
     WHERE a.event_type = 'correct' AND a.opd_order_item_id IN (${auditOiIds.map(() => '?').join(',')})
     ORDER BY a.id ASC`,
    auditOiIds
   )
   .catch(() => [[]]);
  for (const a of aRows || []) {
   const k = a.opd_order_item_id;
   if (!auditByOi.has(k)) auditByOi.set(k, []);
   auditByOi.get(k).push({
    superseded_findings: a.superseded_findings,
    superseded_conclusion: a.superseded_conclusion,
    performed_at: a.performed_at,
    performer_name: a.performer_name || ''
   });
  }
 }

 const sections = {
  laboratory: { code: null, label: 'Laboratory', items: [] },
  radiology:  { code: null, label: 'Radiology', items: [] },
  pharmacy:   { code: null, label: 'Pharmacy', items: [] }
 };
 let totalAmount = 0;
 let refundableCount = 0;
 for (const it of items || []) {
  const s = sections[it.item_type];
  if (!s) continue;
  const linePaid = ['paid', 'served', 'external', 'dispensed', 'refunded'].includes(String(it.status || '').toLowerCase());
  if (it.service_code && !s.code && linePaid) s.code = it.service_code;
  const refundableCheck = isRefundableOrderItem(it);
  if (refundableCheck.ok) refundableCount += 1;
  const lineTotal = (parseFloat(it.unit_price || 0) || 0) * (parseFloat(it.quantity || 1) || 1);
  s.items.push({
   id: it.id,
   item_type: it.item_type,
   name: it.item_name || '',
   unit_price: parseFloat(it.unit_price || 0) || 0,
   quantity: parseFloat(it.quantity || 1) || 1,
   line_total: lineTotal,
   status: it.status || 'pending',
   service_code: linePaid ? it.service_code || null : null,
   served_at: it.served_at || null,
   served_notes: it.served_notes || null,
   refunded_at: it.refunded_at || null,
   refund_amount: parseFloat(it.refund_amount || 0) || 0,
   refund_method: it.refund_method || null,
   refund_reason: it.refund_reason || null,
   refundable: refundableCheck.ok,
   refund_block_reason: refundableCheck.reason,
   correction_history: auditByOi.get(it.id) || []
  });
  totalAmount += lineTotal;
 }

 return {
  consultation_id: head.consultation_id,
  consult_at: head.consult_at,
  chief_complaint: head.chief_complaint || '',
  notes: head.notes || '',
  diagnosis_code: head.diagnosis_code || '',
  patient: {
   id: head.patient_id,
   name: `${head.p_first || ''} ${head.p_last || ''}`.trim(),
   first_name: head.p_first || '',
   last_name: head.p_last || '',
   dob: head.dob, age_years: head.age_years, gender: head.gender, phone: head.phone || ''
  },
  doctor: head.d_first ? {
   id: head.doctor_id,
   name: `Dr. ${head.d_first} ${head.d_last || ''}`.trim(),
   department: head.d_dept || 'General',
   qualification: head.d_qual || ''
  } : null,
  doctor_name: head.d_first ? `Dr. ${head.d_first} ${head.d_last || ''}`.trim() : null,
  doctor_department: head.d_dept || 'General',
  sections,
  laboratory: sections.laboratory.items,
  radiology: sections.radiology.items,
  pharmacy: sections.pharmacy.items,
  codes: {
   laboratory: sections.laboratory.code,
   radiology: sections.radiology.code,
   pharmacy: sections.pharmacy.code
  },
  total_amount: totalAmount,
  refundable_count: refundableCount
 };
}

app.get('/cashier/prescriptions/:cid', requireAuth, async (req, res) => {
 try {
  const data = await _loadDoctorPrescription(req.params.cid);
  if (!data) return res.status(404).json({ ok: false, error: 'Consultation not found.' });
  res.json({ ok: true, data });
 } catch (e) {
  console.error('CASHIER PRESCRIPTION JSON:', e);
  res.status(500).json({ ok: false, error: e.message });
 }
});

app.get('/cashier/prescriptions/:cid/print', requireAuth, async (req, res) => {
 try {
  const data = await _loadDoctorPrescription(req.params.cid);
  if (!data) {
   const tFn = res.locals.t || ((k, o) => (o && o.defaultValue != null ? o.defaultValue : k));
   return _sendErrorView(res, 404, _errorPageLocals(res, 404, {
    title: tFn('page.prescription_not_found_title', { ns: 'errors', defaultValue: 'Prescription not found' }),
    message: tFn('page.prescription_not_found', { ns: 'errors', defaultValue: 'No consultation matched that id.' }),
   }));
  }
  const consultationVerify = require('./lib/consultationVerify');
  const ensureHmsExtendedSchema = require('./lib/ensureHmsExtendedSchema');
  await ensureHmsExtendedSchema(pool).catch(() => {});
  const verifyToken = await consultationVerify.ensureConsultToken(pool, data.consultation_id);
  const verifyUrl = verifyToken ? consultationVerify.verifyUrl(req, verifyToken) : null;
  const rxTitle = pageTitle(res, 'document_titles.prescription_consultation', 'Prescription · #{{id}}', { id: data.consultation_id });
  res.render('print-doctor-prescription', {
   title: rxTitle,
   layout: false,
   pageData: { data, verifyUrl, title: rxTitle },
  });
 } catch (e) {
  console.error('CASHIER PRESCRIPTION PRINT:', e);
  renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });
 }
});

// SERVICE CATALOG (Master pricing)
const catalogAccess = require('./lib/catalogAccess');
app.get('/catalog', requireAuth, requirePerm(...catalogAccess.ALL_CATALOG_READ_PERMS, 'inventory.read','inventory.write','billing.read','billing.write','accounting.read'), async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  const [services] = await pool.query(
   'SELECT * FROM tbl_service_catalog WHERE status = 1 ORDER BY LOWER(TRIM(category)), LOWER(TRIM(name))'
  ).catch(() => [[]]);
  const perms = res.locals.userPerms || [];
  const filtered = catalogAccess.filterServicesForPerms(Array.isArray(services) ? services : [], perms);
  const access = catalogAccess.buildCatalogPageAccess(perms);
  res.render('catalog', {
   title: pageTitle(res, 'document_titles.service_catalog', 'Service Catalog — ZAIZENS'),
   pageData: {
    services: filtered,
    flash: req.query.msg || null,
    error: req.query.err || null,
    catalogAccess: {
      readSections: access.readSections,
      writeSections: access.writeSections,
    },
   },
  });
 } catch (e) {
  console.error('CATALOG LOAD:', e.message);
  renderAppError(res, 500, 'page.load_service_catalog', 'Could not load service catalog.', { detail: e.message })
 }
});

app.post('/catalog/create', requireAuth, catalogAccess.requireCatalogWrite, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  const category = String(req.body.category || 'service').trim() || 'service';
  const name = String(req.body.name || '').trim();
  const department_name = String(req.body.department_name || '').trim() || null;
  const price = Math.max(0, parseFloat(req.body.price || 0) || 0);
  const status = (String(req.body.status || '1') === '0') ? 0 : 1;
  if (!name) return res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.service_name_is_required')))
  await pool.query(
   'INSERT INTO tbl_service_catalog (category, name, department_name, price, status) VALUES (?,?,?,?,?)',
   [category, name, department_name, price, status]
  );
  res.redirect('/catalog?msg=' + encodeURIComponent(flashT(res, 'flash.service_added')))
 } catch (e) {
  console.error('CATALOG CREATE:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.create_failed', { message: e.message })));
 }
});

app.post('/catalog/:id/update', requireAuth, catalogAccess.requireCatalogWrite, async (req, res) => {
 const id = parseInt(req.params.id, 10) || 0;
 if (id < 1) return res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.invalid_service_id')))
 try {
  await ensureServiceCatalogSchema(pool);
  const category = String(req.body.category || 'service').trim() || 'service';
  const name = String(req.body.name || '').trim();
  const department_name = String(req.body.department_name || '').trim() || null;
  const price = Math.max(0, parseFloat(req.body.price || 0) || 0);
  const status = (String(req.body.status || '1') === '0') ? 0 : 1;
  if (!name) return res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.service_name_is_required')))
  await pool.query(
   'UPDATE tbl_service_catalog SET category=?, name=?, department_name=?, price=?, status=? WHERE id=? LIMIT 1',
   [category, name, department_name, price, status, id]
  );
  res.redirect('/catalog?msg=' + encodeURIComponent(flashT(res, 'flash.service_updated')))
 } catch (e) {
  console.error('CATALOG UPDATE:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.update_failed', { message: e.message })));
 }
});

// Pharmacy: import medications & materials price list (139 items, XAF)
app.post('/catalog/pharmacy/import-price-list', requireAuth, catalogAccess.requireCatalogWrite, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  const { seedPharmacyServiceCatalog } = require('./lib/pharmacyCatalogSeedData');
  const deactivateMissing = String(req.body.deactivate_missing || '') === '1';
  const r = await seedPharmacyServiceCatalog(pool, { deactivateMissing });
  const msg =
    `Pharmacy price list imported: ${r.inserted} added, ${r.updated} updated` +
    (deactivateMissing && r.deactivated ? `, ${r.deactivated} deactivated` : '') +
    ` (${r.total} items). Open the Pharmacy tab to review.`;
  res.redirect('/catalog?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('PHARMACY CATALOG IMPORT:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message })));
 }
});

// Pharmacy: import medications & tariffs from Excel, PDF, or Word (.docx)
app.post('/catalog/pharmacy/import-file', requireAuth, catalogAccess.requireCatalogWrite, (req, res, next) => {
 const { pharmacyCatalogUploadMw } = require('./lib/pharmacyCatalogUploadMulter');
 pharmacyCatalogUploadMw('file')(req, res, (err) => {
  if (err) {
   console.error('PHARMACY FILE UPLOAD:', err.message);
   return res.redirect('/catalog?err=' + encodeURIComponent(err.message || 'Upload failed.'));
  }
  next();
 });
}, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  if (!req.file || !req.file.buffer) {
   return res.redirect('/catalog?err=' + encodeURIComponent('No file received. Choose an Excel, PDF, or Word file.'));
  }
  const { parsePharmacyCatalogFile, upsertPharmacyCatalogRows } = require('./lib/pharmacyCatalogFileImport');
  const { rows, warnings, mergedInFile } = await parsePharmacyCatalogFile(
   req.file.buffer,
   req.file.originalname,
   req.file.mimetype
  );
  if (!rows.length) {
   const hint = (warnings && warnings[0]) || 'No medications with prices were found in the file.';
   return res.redirect('/catalog?err=' + encodeURIComponent(hint));
  }
  const deactivateMissing = String(req.body.deactivate_missing || '') === '1';
  const r = await upsertPharmacyCatalogRows(pool, rows, {
    deactivateMissing,
    mergedInFile: mergedInFile || 0,
  });
  const { importPharmacyCatalogToInventory } = require('./lib/importPharmacyCatalogToInventory');
  const { pruneOrphanPharmacyInventory } = require('./lib/pharmacyProductScope');
  await importPharmacyCatalogToInventory(pool).catch(() => {});
  await pruneOrphanPharmacyInventory(pool).catch(() => {});
  const warnNote = warnings && warnings.length ? ` Note: ${warnings.join(' ')}` : '';
  const dupeNote =
    (r.mergedInFile || 0) + (r.duplicatesRemoved || 0) > 0
      ? ` Duplicates: ${r.mergedInFile || 0} merged in file, ${r.duplicatesRemoved || 0} removed in catalog.`
      : '';
  const msg =
    `Pharmacy file import: ${r.inserted} added, ${r.updated} updated` +
    (deactivateMissing && r.deactivated ? `, ${r.deactivated} deactivated` : '') +
    ` (${r.imported} unique items). Open the Pharmacy tab to review.${dupeNote}${warnNote}`;
  res.redirect('/catalog?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('PHARMACY FILE IMPORT:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message })));
 }
});

// Laboratory: import official price list (68 tests, XAF) into Service Catalog + LIMS catalog
app.post('/catalog/laboratory/import-price-list', requireAuth, catalogAccess.requireCatalogWrite, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  const { seedLaboratoryServiceCatalog } = require('./lib/laboratoryCatalogSeedData');
  const deactivateMissing = String(req.body.deactivate_missing || '') === '1';
  const r = await seedLaboratoryServiceCatalog(pool, { deactivateMissing });
  const msg =
    `Laboratory price list imported: ${r.inserted} added, ${r.updated} updated` +
    (deactivateMissing && r.deactivated ? `, ${r.deactivated} deactivated` : '') +
    ` (${r.total} tests). Open the Laboratory tab to review.`;
  res.redirect('/catalog?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('LAB CATALOG IMPORT:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message })));
 }
});

// Laboratory: import tests & tariffs from Excel, CSV, PDF, or Word (.docx)
app.post('/catalog/laboratory/import-file', requireAuth, catalogAccess.requireCatalogWrite, (req, res, next) => {
 const { catalogUploadMw } = require('./lib/pharmacyCatalogUploadMulter');
 catalogUploadMw('file')(req, res, (err) => {
  if (err) {
   console.error('LAB FILE UPLOAD:', err.message);
   return res.redirect('/catalog?err=' + encodeURIComponent(err.message || 'Upload failed.'));
  }
  next();
 });
}, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  if (!req.file || !req.file.buffer) {
   return res.redirect('/catalog?err=' + encodeURIComponent('No file received. Choose an Excel, CSV, PDF, or Word file.'));
  }
  const { parseDepartmentCatalogFile, upsertLaboratoryCatalogRows } = require('./lib/departmentCatalogFileImport');
  const { rows, warnings, mergedInFile } = await parseDepartmentCatalogFile(
   req.file.buffer,
   req.file.originalname,
   req.file.mimetype
  );
  if (!rows.length) {
   const hint = (warnings && warnings[0]) || 'No laboratory tests with prices were found in the file.';
   return res.redirect('/catalog?err=' + encodeURIComponent(hint));
  }
  const deactivateMissing = String(req.body.deactivate_missing || '') === '1';
  const r = await upsertLaboratoryCatalogRows(pool, rows, { deactivateMissing, mergedInFile: mergedInFile || 0 });
  const warnNote = warnings && warnings.length ? ` Note: ${warnings.join(' ')}` : '';
  const dupeNote = r.mergedInFile ? ` Merged ${r.mergedInFile} duplicate row(s) in file.` : '';
  const msg =
    `Laboratory file import: ${r.inserted} added, ${r.updated} updated` +
    (deactivateMissing && r.deactivated ? `, ${r.deactivated} deactivated` : '') +
    ` (${r.imported} tests). Open the Laboratory tab to review.${dupeNote}${warnNote}`;
  res.redirect('/catalog?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('LAB FILE IMPORT:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message })));
 }
});

// Radiology: import imaging tariffs (68 exams, XAF) into Service Catalog
app.post('/catalog/radiology/import-price-list', requireAuth, catalogAccess.requireCatalogWrite, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  const { seedRadiologyServiceCatalog } = require('./lib/radiologyCatalogSeedData');
  const deactivateMissing = String(req.body.deactivate_missing || '') === '1';
  const r = await seedRadiologyServiceCatalog(pool, { deactivateMissing });
  const m = r.merge || {};
  const msg =
    `${SCANS_IMAGING_LABEL} tariff (radiology list) imported: ${r.inserted} added, ${r.updated} updated` +
    (deactivateMissing && r.deactivated ? `, ${r.deactivated} deactivated` : '') +
    ` (${r.total} exams). Merged catalog: ${m.uniqueServices || r.total} unique` +
    (m.duplicatesRemoved ? `, ${m.duplicatesRemoved} duplicate rows deactivated` : '') +
    `. Open the Scans & Imaging tab to review.`;
  res.redirect('/catalog?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('RAD CATALOG IMPORT:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message })));
 }
});

// Radiology / Scans & Imaging: import exams & tariffs from Excel, CSV, PDF, or Word (.docx)
app.post('/catalog/radiology/import-file', requireAuth, catalogAccess.requireCatalogWrite, (req, res, next) => {
 const { catalogUploadMw } = require('./lib/pharmacyCatalogUploadMulter');
 catalogUploadMw('file')(req, res, (err) => {
  if (err) {
   console.error('RAD FILE UPLOAD:', err.message);
   return res.redirect('/catalog?err=' + encodeURIComponent(err.message || 'Upload failed.'));
  }
  next();
 });
}, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  if (!req.file || !req.file.buffer) {
   return res.redirect('/catalog?err=' + encodeURIComponent('No file received. Choose an Excel, CSV, PDF, or Word file.'));
  }
  const { parseDepartmentCatalogFile, upsertRadiologyCatalogRows } = require('./lib/departmentCatalogFileImport');
  const { rows, warnings, mergedInFile } = await parseDepartmentCatalogFile(
   req.file.buffer,
   req.file.originalname,
   req.file.mimetype
  );
  if (!rows.length) {
   const hint = (warnings && warnings[0]) || 'No imaging exams with prices were found in the file.';
   return res.redirect('/catalog?err=' + encodeURIComponent(hint));
  }
  const deactivateMissing = String(req.body.deactivate_missing || '') === '1';
  const r = await upsertRadiologyCatalogRows(pool, rows, { deactivateMissing, mergedInFile: mergedInFile || 0 });
  const m = r.merge || {};
  const warnNote = warnings && warnings.length ? ` Note: ${warnings.join(' ')}` : '';
  const dupeNote = r.mergedInFile ? ` Merged ${r.mergedInFile} duplicate row(s) in file.` : '';
  const msg =
    `${SCANS_IMAGING_LABEL} file import: ${r.inserted} added, ${r.updated} updated` +
    (deactivateMissing && r.deactivated ? `, ${r.deactivated} deactivated` : '') +
    ` (${r.imported} exams). Merged catalog: ${m.uniqueServices || r.imported} unique` +
    (m.duplicatesRemoved ? `, ${m.duplicatesRemoved} duplicate rows deactivated` : '') +
    `. Open the Scans & Imaging tab to review.${dupeNote}${warnNote}`;
  res.redirect('/catalog?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('RAD FILE IMPORT:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message })));
 }
});

// Scans & Imaging: merge radiology + scan rows, dedupe (radiology price wins)
app.post('/catalog/scans-imaging/merge', requireAuth, catalogAccess.requireCatalogWrite, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  const r = await mergeScansImagingCatalog(pool);
  const msg =
    `${SCANS_IMAGING_LABEL} merged: ${r.uniqueServices} unique services` +
    ` (${r.duplicatesRemoved} duplicate rows removed — radiology kept, ${r.winnersUpdated} updated).`;
  res.redirect('/catalog?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('SCANS IMAGING MERGE:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.merge_failed', { message: e.message })));
 }
});

// Scan (CT/MRI/nuclear/fluoroscopy): import imaging tariff (68 studies, XAF)
app.post('/catalog/scan/import-price-list', requireAuth, catalogAccess.requireCatalogWrite, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  const { seedScanServiceCatalog } = require('./lib/scanCatalogSeedData');
  const deactivateMissing = String(req.body.deactivate_missing || '') === '1';
  const r = await seedScanServiceCatalog(pool, { deactivateMissing });
  const m = r.merge || {};
  const msg =
    `${SCANS_IMAGING_LABEL} tariff (CT/MRI list) imported: ${r.inserted} added, ${r.updated} updated` +
    (r.skippedRadiologyDup ? `, ${r.skippedRadiologyDup} skipped (radiology price kept)` : '') +
    (deactivateMissing && r.deactivated ? `, ${r.deactivated} deactivated` : '') +
    ` (${r.total} studies). Merged catalog: ${m.uniqueServices || ''} unique` +
    (m.duplicatesRemoved ? `, ${m.duplicatesRemoved} duplicate rows deactivated` : '') +
    `. Open the Scans & Imaging tab to review.`;
  res.redirect('/catalog?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('SCAN CATALOG IMPORT:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message })));
 }
});

// Maternity: import tariff schedule (98 services, XAF) under Maternity category
app.post('/catalog/maternity/import-price-list', requireAuth, catalogAccess.requireCatalogWrite, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  const { seedMaternityServiceCatalog } = require('./lib/maternityCatalogSeedData');
  const deactivateMissing = String(req.body.deactivate_missing || '') === '1';
  const r = await seedMaternityServiceCatalog(pool, { deactivateMissing });
  const msg =
    `Maternity price list imported: ${r.inserted} added, ${r.updated} updated` +
    (deactivateMissing && r.deactivated ? `, ${r.deactivated} deactivated` : '') +
    ` (${r.total} services). Open the Maternity tab to review.`;
  res.redirect('/catalog?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('MATERNITY CATALOG IMPORT:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message })));
 }
});

// Surgery: import surgical procedures tariff (127 procedures, XAF) into Service Catalog
app.post('/catalog/surgery/import-price-list', requireAuth, catalogAccess.requireCatalogWrite, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  const { seedSurgeryServiceCatalog } = require('./lib/surgeryCatalogSeedData');
  const deactivateMissing = String(req.body.deactivate_missing || '') === '1';
  const r = await seedSurgeryServiceCatalog(pool, { deactivateMissing });
  const msg =
    `Surgery tariff imported: ${r.inserted} added, ${r.updated} updated` +
    (deactivateMissing && r.deactivated ? `, ${r.deactivated} deactivated` : '') +
    ` (${r.total} procedures). Open the Surgery tab to review.`;
  res.redirect('/catalog?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('SURGERY CATALOG IMPORT:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message })));
 }
});

// Nursing & ward: import standard tariff (25 services, XAF) under Service category
app.post('/catalog/nursing-ward/import-price-list', requireAuth, catalogAccess.requireCatalogWrite, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);
  const { seedNursingWardServiceCatalog } = require('./lib/nursingWardCatalogSeedData');
  const { ensureBasicConsultationCatalog } = require('./lib/cashierConsultServices');
  const deactivateMissing = String(req.body.deactivate_missing || '') === '1';
  const r = await seedNursingWardServiceCatalog(pool, { deactivateMissing });
  const consultFix = await ensureBasicConsultationCatalog(pool);
  const msg =
    `Nursing & ward price list imported: ${r.inserted} added, ${r.updated} updated` +
    (deactivateMissing && r.deactivated ? `, ${r.deactivated} deactivated` : '') +
    (r.retiredConsults ? `, ${r.retiredConsults} misplaced consult(s) retired` : '') +
    (consultFix.inserted || consultFix.updated ? `; consultation catalog synced` : '') +
    ` (${r.total} services). Open the Service tab to review.`;
  res.redirect('/catalog?msg=' + encodeURIComponent(msg));
 } catch (e) {
  console.error('NURSING WARD CATALOG IMPORT:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message })));
 }
});

// Pharmacy: bulk auto-classify "Used for" (writes to department_name for pharmacy rows)
app.post('/catalog/pharmacy/autofill-used-for', requireAuth, catalogAccess.requireCatalogWrite, async (req, res) => {
 try {
  await ensureServiceCatalogSchema(pool);

  // Update only rows that are blank/General/Uncategorized to avoid overwriting manual work
  const whereBlank = `
    LOWER(TRIM(category))='pharmacy'
    AND (
      department_name IS NULL
      OR TRIM(department_name)=''
      OR LOWER(TRIM(department_name)) IN ('general','uncategorized','n/a','na','none')
    )
  `;

  // Best-effort keyword classifier (generic + common brands). Unknowns remain Uncategorized.
  await pool.query(`
   UPDATE tbl_service_catalog
   SET department_name = CASE
     WHEN LOWER(name) REGEXP 'paracetamol|acetaminophen|panadol|doliprane' THEN 'Pain/Fever'
     WHEN LOWER(name) REGEXP 'ibuprofen|diclofenac|naproxen|ketoprofen|piroxicam' THEN 'Pain/Inflammation'
     WHEN LOWER(name) REGEXP 'tramadol|codeine|morphine' THEN 'Pain (Strong)'
     WHEN LOWER(name) REGEXP 'artem|artesunate|artemether|lumefantrine|coartem|malacur|quinine|fansidar|sulfadoxine|pyrimethamine' THEN 'Malaria'
     WHEN LOWER(name) REGEXP 'amoxicillin|ampicillin|cloxacillin|azithromycin|erythromycin|ciprofloxacin|levofloxacin|ofloxacin|metronidazole|gentamicin|cef|cefixime|ceftriaxone|cephalexin|doxycycline|tetracycline|clindamycin' THEN 'Antibiotics'
     WHEN LOWER(name) REGEXP 'fluconazole|ketoconazole|clotrimazole|nystatin' THEN 'Antifungal'
     WHEN LOWER(name) REGEXP 'albendazole|mebendazole|praziquantel|ivermectin' THEN 'Deworming/Antiparasitic'
     WHEN LOWER(name) REGEXP 'omeprazole|pantoprazole|esomeprazole|lansoprazole|antacid|ranitidine|famotidine' THEN 'Ulcer/Gastric'
     WHEN LOWER(name) REGEXP 'ors|oral rehydration|rehydration|zinc' THEN 'Dehydration/Diarrhea'
     WHEN LOWER(name) REGEXP 'loperamide' THEN 'Diarrhea'
     WHEN LOWER(name) REGEXP 'amLODIPine|amlodipine|atenolol|propranolol|losartan|valsartan|captopril|enalapril|lisinopril|furosemide|hydrochlorothiazide|spironolactone' THEN 'Blood Pressure/Heart'
     WHEN LOWER(name) REGEXP 'metformin|insulin|glibenclamide|gliclazide' THEN 'Diabetes'
     WHEN LOWER(name) REGEXP 'salbutamol|ventolin|beclomethasone|budesonide' THEN 'Asthma/Respiratory'
     WHEN LOWER(name) REGEXP 'cetirizine|loratadine|chlorpheniramine|promethazine' THEN 'Allergy'
     WHEN LOWER(name) REGEXP 'iron|ferrous|folic|vitamin b9|b12|multivitamin' THEN 'Vitamins/Anemia'
     WHEN LOWER(name) REGEXP 'contraceptive|levonorgestrel|ethinyl|depo|medroxyprogesterone' THEN 'Family Planning'
     WHEN LOWER(name) REGEXP 'glove|syringe|needle|cotton|gauze|bandage|plaster|tape|mask|swab|catheter|cannula|suture' THEN 'Supplies/Consumables'
     ELSE 'Uncategorized'
   END
   WHERE ${whereBlank}
  `);

  res.redirect('/catalog?msg=' + encodeURIComponent(flashT(res, 'flash.pharmacy_autofill_completed')));
 } catch (e) {
  console.error('PHARM USED_FOR AUTOFILL:', e.message);
  res.redirect('/catalog?err=' + encodeURIComponent(flashT(res, 'flash.autofill_failed', { message: e.message })));
 }
});

// CASHIER: OPD Orders (Lab/Radiology) pending list (AJAX)
app.get('/cashier/opd-orders/pending', requireAuth, async (req, res) => {
 const pid = parseInt(req.query.patient_id) || 0;
 const consultId = parseInt(req.query.consultation_id) || 0;
 if (pid < 1) return res.json({ ok: false, error: 'Missing patient_id' });
 try {
  await ensureOpdOrderItemsSchema(pool);
  let where = 'oi.status = \'pending\' AND oi.patient_id = ?';
  const params = [pid];
  if (consultId > 0) { where += ' AND oi.consultation_id = ?'; params.push(consultId); }
  const [rows] = await pool.query(
   `SELECT oi.id, oi.item_type, oi.item_name, oi.unit_price, oi.quantity,
           oi.catalog_id, oi.consultation_id, oi.service_code, oi.created_at,
           oi.pharmacist_available
    FROM tbl_opd_order_item oi
    WHERE ${where}
    ORDER BY oi.item_type ASC, oi.created_at ASC, oi.id ASC
    LIMIT 200`,
   params
  ).catch(() => [[]]);
  return res.json({
   ok: true,
   items: (Array.isArray(rows) ? rows : []).map((r) => {
    const catalogId = r.catalog_id != null ? parseInt(r.catalog_id, 10) : null;
    const unitPrice = parseFloat(r.unit_price || 0) || 0;
    const pharmacistAvailable = Number(r.pharmacist_available) === 1;
    const isCustomZero = !catalogId || unitPrice <= 0;
    const awaitingPharmacistPrice = isCustomZero && pharmacistAvailable && unitPrice <= 0;
    const readyForCashier = isCustomZero && pharmacistAvailable && unitPrice > 0;
    const awaitingPharmacy = isCustomZero && !pharmacistAvailable;
    return {
     ...r,
     catalog_id: catalogId,
     unit_price: unitPrice,
     needs_price: false,
     awaiting_pharmacist_price: awaitingPharmacistPrice,
     ready_for_cashier: readyForCashier,
     awaiting_pharmacy: awaitingPharmacy,
     pharmacist_available: pharmacistAvailable,
     service_code: r.service_code || null,
    };
   }),
  });
 } catch (e) {
  return res.json({ ok: false, error: e.message });
 }
});

// CASHIER: OPD Orders → Create a pending ticket from selected items
//
// Accepts two id lists in one submit so the cashier can do everything in a
// single click from the modal:
//   • order_item_ids    → in-house items, become a pending payment ticket
//   • external_item_ids → items the patient buys outside the hospital, get
//                         set to status='external' and excluded from the bill
app.post('/cashier/opd-orders/create-ticket', requireAuth, async (req, res) => {
 const parseIds = (raw) => String(raw || '').trim()
   .split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
 const parsePriceOverrides = (raw) => {
  const out = new Map();
  if (!raw) return out;
  let parsed = raw;
  if (typeof raw === 'string') {
   try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  }
  if (!parsed || typeof parsed !== 'object') return out;
  for (const [k, v] of Object.entries(parsed)) {
   const id = parseInt(k, 10);
   const price = parseFloat(v);
   if (Number.isFinite(id) && id > 0 && Number.isFinite(price) && price >= 0) out.set(id, price);
  }
  return out;
 };
 const ids = parseIds(req.body.order_item_ids);
 const extIds = parseIds(req.body.external_item_ids).filter(id => !ids.includes(id));
 const priceOverrides = parsePriceOverrides(req.body.price_overrides);
 if (!ids.length && !extIds.length) return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.select_at_least_one_item')))
 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();
  await ensureOpdOrderItemsSchema(conn);

  // 1) Mark "external" rows first — these are excluded from the bill but
  //    still tracked so they don't reappear in the pending modal.
  if (extIds.length) {
   const phx = extIds.map(() => '?').join(',');
   await conn.query(
    `UPDATE tbl_opd_order_item SET status='external', service_code=NULL WHERE status='pending' AND id IN (${phx})`,
    extIds
   );
  }

  // 2) If only external items were selected (no in-house bill needed), bail
  //    out with a friendly message instead of creating an empty ticket.
  if (!ids.length) {
   await conn.commit();
   conn.release();
   return res.redirect('/cashier?msg=' + encodeURIComponent(`Marked ${extIds.length} item(s) as external. No bill created.`));
  }

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await conn.query(
   `SELECT * FROM tbl_opd_order_item WHERE id IN (${placeholders}) FOR UPDATE`,
   ids
  );
  const items = Array.isArray(rows) ? rows : [];
  if (items.length !== ids.length) throw new Error('Some items were not found.');
  const pendingOnly = items.every(it => String(it.status) === 'pending');
  if (!pendingOnly) throw new Error('Some items are not pending.');
  const patientId = parseInt(items[0].patient_id) || 0;
  const facilityId = req.session.facilityId || 1;
  if (!items.every(it => parseInt(it.patient_id) === patientId)) throw new Error('Items must belong to the same patient.');

  for (const it of items) {
   const oid = parseInt(it.id, 10) || 0;
   if (!oid) continue;
   const catalogId = it.catalog_id != null ? parseInt(it.catalog_id, 10) : null;
   const currentPrice = parseFloat(it.unit_price || 0) || 0;
   const override = priceOverrides.has(oid) ? priceOverrides.get(oid) : null;
   const pharmacistAvailable = Number(it.pharmacist_available) === 1;
   const isCustomZero = !catalogId || currentPrice <= 0;
   if (isCustomZero && !pharmacistAvailable) {
    throw new Error(`Awaiting pharmacy confirmation for: ${it.item_name || 'item'}. Pharmacist must mark it as available off-catalog first.`);
   }
   if (pharmacistAvailable && isCustomZero && currentPrice <= 0) {
    throw new Error(`Awaiting pharmacist price for: ${it.item_name || 'item'}. Pharmacist must enter the price before billing.`);
   }
   if (override != null && pharmacistAvailable) {
    throw new Error(`Cashier cannot change the price for off-catalog item: ${it.item_name || 'item'}. Ask pharmacy to update the price.`);
   }
   if (override != null) {
    if (override <= 0) throw new Error(`Enter a price greater than zero for: ${it.item_name || 'item'}`);
    await conn.query('UPDATE tbl_opd_order_item SET unit_price=? WHERE id=? AND status=\'pending\'', [override, oid]);
    it.unit_price = override;
   }
  }

  const pharmFul = require('./lib/opdPharmacyFulfillment');
  const consultId = parseInt(items[0].consultation_id, 10) || 0;
  const phaServiceCode = await pharmFul.syncPharmacyServiceCodeForConsultation(conn, consultId, ids, null);

  const total = items.reduce((s, it) => s + ((parseFloat(it.unit_price || 0) || 0) * (parseFloat(it.quantity || 1) || 1)), 0);
  const lines = items.map(it => ({
   kind: String(it.item_type || 'service'),
   description: it.item_name || 'Service',
   unit_price: parseFloat(it.unit_price || 0) || 0,
   quantity: parseFloat(it.quantity || 1) || 1,
   catalog_id: it.catalog_id || null,
   source_module: 'opd_order_item',
   source_pk: it.id
  }));

  const consultIds = [...new Set(items.map((it) => it.consultation_id).filter(Boolean))];
  await assignServiceCodesForOrderItems(conn, ids).catch(() => {});
  await pharmFul.syncPharmacyServiceCodeForConsultation(conn, consultId, ids, phaServiceCode).catch(() => {});

  const ticket_code = await pharmFul.resolvePharmacyTicketCode(conn, facilityId, items, lines, phaServiceCode);

  const uid = req.session.userId || req.session.user?.id || 1;
  const [ins] = await conn.query(
   `INSERT INTO tbl_payment_ticket
      (facility_id, ticket_code, patient_id, total_amount, status, lines_json, created_by, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, NOW())`,
   [facilityId, ticket_code, patientId, total, JSON.stringify(lines), uid]
  );

  await conn.commit();
  conn.release();
  return res.redirect('/cashier/settle/' + ins.insertId);
 } catch (e) {
  await conn.rollback().catch(() => {});
  conn.release();
  return res.redirect('/cashier?err=' + encodeURIComponent(e.message));
 }
});

// CASHIER: OPD Orders → Mark selected pending items as external (paid outside hospital)
app.post('/cashier/opd-orders/mark-external', requireAuth, async (req, res) => {
 const raw = String(req.body.order_item_ids || '').trim();
 const ids = raw.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
 if (!ids.length) return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.select_at_least_one_item')))
 try {
  await ensureOpdOrderItemsSchema(pool);
  const placeholders = ids.map(() => '?').join(',');
  await pool.query(
   `UPDATE tbl_opd_order_item SET status='external', service_code=NULL WHERE status='pending' AND id IN (${placeholders})`,
   ids
  );
  return res.redirect('/cashier?msg=' + encodeURIComponent(flashT(res, 'flash.marked_selected_items_as_external')));
 } catch (e) {
  return res.redirect('/cashier?err=' + encodeURIComponent(e.message));
 }
});

// CASHIER: Refund paid OPD prescription items that cannot be fulfilled (not in stock / not available)
app.post('/cashier/opd-orders/refund', requireAuth, async (req, res) => {
 const parseIds = (raw) => String(raw || '').trim()
   .split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n > 0);
 const ids = parseIds(req.body.order_item_ids);
 const refundMethod = String(req.body.refund_method || '').trim();
 const refundReason = String(req.body.refund_reason || req.body.refund_reason_code || '').trim();
 const consultId = parseInt(req.body.consultation_id, 10) || 0;
 if (!ids.length) return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.select_at_least_one_item')));
 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();
  const { refundOpdOrderItems } = require('./lib/opdOrderRefund');
  const uid = req.session.userId || req.session.user?.id || 1;
  const facilityId = req.session.facilityId || 1;
  const result = await refundOpdOrderItems(conn, {
   orderItemIds: ids,
   refundMethod,
   refundReason,
   userId: uid,
   facilityId,
   nextReceiptNumber,
   nextInvoiceNumber,
  });
  if (!result.ok) throw new Error(result.error || 'Refund failed.');

  let cashierTxnResult = null;
  if (result.receiptId && result.refundTotal > 0) {
   try {
    const { recordRefundInTransaction } = require('./lib/cashierTxnWire');
    cashierTxnResult = await recordRefundInTransaction(conn, {
     facilityId,
     userId: uid,
     sourceModule: 'opd_refund',
     sourcePk: result.receiptId,
     amount: result.refundTotal,
     paymentMethod: refundMethod,
     billingDocumentId: result.receiptId,
     patientId: result.patientId,
     lines: result.refundLines,
     narration: refundReason,
    });
   } catch (txnErr) {
    console.error('cashier txn (opd refund):', txnErr.message);
   }
  }

  await conn.commit();
  conn.release();

  try {
   const { runCashierPostCommit } = require('./lib/cashierTxnWire');
   await runCashierPostCommit(pool, {
    txnId: cashierTxnResult?.txnId || null,
    journalKind: 'refund',
    facilityId,
    amount: result.refundTotal,
    paymentMethod: refundMethod,
    createdBy: uid,
    reference: `OPD-REF-${result.receiptId}`,
    narration: refundReason,
    cashierCode: cashierTxnResult?.cashierCode,
    cashierIdentity: cashierTxnResult?.cashierIdentity,
    serviceKey: 'default',
   });
  } catch (pipeErr) {
   console.error('cashier journal pipeline (opd refund):', pipeErr.message);
  }
  const tab = consultId > 0 ? '&tab=rx' : '';
  const msg = `Refunded ${result.refundedIds.length} item(s) — ${result.refundTotal} FCFA via ${refundMethod}.`;
  if (result.receiptId) {
   return res.redirect(`/cashier/print-receipt/${result.receiptId}?msg=${encodeURIComponent(msg)}`);
  }
  return res.redirect(`/cashier?msg=${encodeURIComponent(msg)}${tab}`);
 } catch (e) {
  await conn.rollback().catch(() => {});
  conn.release();
  return res.redirect('/cashier?err=' + encodeURIComponent(e.message));
 }
});

// ADMIN: Backfill missing OPD order items from existing consultations
app.get('/cashier/opd-orders/backfill', requireAuth, requireAdminOrSuper, async (req, res) => {
 try {
  await ensureOpdOrderItemsSchema(pool);
  const fid = req.session.facilityId || 1;
  const uid = req.session.userId || req.session.user?.id || 1;
  const limit = Math.min(2000, Math.max(50, parseInt(req.query.limit) || 500));

  const [rows] = await pool.query(
   `SELECT id, patient_id, opd_visit_id, facility_id, lab_orders_json, rad_orders_json, medications_json, created_by, created_at
    FROM tbl_consultation
    WHERE (lab_orders_json IS NOT NULL AND CHAR_LENGTH(TRIM(lab_orders_json)) > 2)
       OR (rad_orders_json IS NOT NULL AND CHAR_LENGTH(TRIM(rad_orders_json)) > 2)
       OR (medications_json IS NOT NULL AND CHAR_LENGTH(TRIM(medications_json)) > 2)
    ORDER BY id DESC
    LIMIT ?`,
   [limit]
  ).catch(() => [[]]);

  const safeArr = (raw) => { try { const a = JSON.parse(String(raw || '[]')); return Array.isArray(a) ? a : []; } catch(e){ return []; } };
  const toIds = (arr) => (arr || []).map(x => parseInt(x, 10)).filter(n => Number.isFinite(n) && n > 0);

  let created = 0, skipped = 0;
  for (const c of (rows || [])) {
   const consultId = parseInt(c.id) || 0;
   const pid = parseInt(c.patient_id) || 0;
   if (!consultId || !pid) { skipped++; continue; }
   const labIds = toIds(safeArr(c.lab_orders_json));
   const radIds = toIds(safeArr(c.rad_orders_json));
   const medsArr = safeArr(c.medications_json).filter(m => m && m.name);
   if (!labIds.length && !radIds.length && !medsArr.length) { skipped++; continue; }

   // Skip if already has any order items
   const [[exists]] = await pool.query(
    'SELECT id FROM tbl_opd_order_item WHERE consultation_id=? LIMIT 1',
    [consultId]
   ).catch(() => [[null]]);
   if (exists) { skipped++; continue; }

   const loadCatalog = async (ids) => {
    if (!ids.length) return new Map();
    const placeholders = ids.map(() => '?').join(',');
    const [rws] = await pool.query(
     `SELECT id, name, price FROM tbl_service_catalog WHERE id IN (${placeholders}) AND status=1`,
     ids
    ).catch(() => [[]]);
    const m = new Map();
    for (const r of rws || []) m.set(parseInt(r.id, 10), { name: r.name, price: parseFloat(r.price || 0) || 0 });
    return m;
   };
   const labMap = await loadCatalog(labIds);
   const radMap = await loadCatalog(radIds);
   const facilityId = parseInt(c.facility_id) || fid;
   const visitId = parseInt(c.opd_visit_id) || null;
   const createdBy = parseInt(c.created_by) || uid;

   const insertItem = async (type, catId, info) => {
    if (!info || !info.name) return;
    await pool.query(
     `INSERT INTO tbl_opd_order_item
      (facility_id, patient_id, opd_visit_id, consultation_id, item_type, catalog_id, item_name, unit_price, quantity, status, created_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?)`,
     [facilityId, pid, visitId, consultId, type, catId, info.name, info.price, 1, createdBy, c.created_at || new Date()]
    ).catch(() => {});
    created++;
   };

   for (const id of labIds) await insertItem('laboratory', id, labMap.get(id));
   for (const id of radIds) await insertItem('radiology', id, radMap.get(id));

   // Resolve and insert pharmacy items
   const resolveMed = async (name) => {
    const n = String(name || '').trim(); if (!n) return null;
    const tryQ = async (where, params) => {
     const [rs] = await pool.query(
      `SELECT id, name, price FROM tbl_service_catalog
       WHERE LOWER(TRIM(category))='pharmacy' AND status=1 AND ${where}
       ORDER BY CHAR_LENGTH(name) ASC LIMIT 1`,
      params
     ).catch(() => [[]]);
     return rs && rs[0];
    };
    let hit = await tryQ('LOWER(name)=LOWER(?)', [n])
           || await tryQ('LOWER(name) LIKE LOWER(?)', [n + '%'])
           || await tryQ('LOWER(name) LIKE LOWER(?)', ['%' + n + '%']);
    if (hit) return { catId: parseInt(hit.id) || null, name: hit.name, price: parseFloat(hit.price || 0) || 0 };
    return { catId: null, name: n, price: 0 };
   };
   for (const med of medsArr) {
    const info = await resolveMed(med && med.name);
    if (info && info.name) await insertItem('pharmacy', info.catId, info);
   }

   // Assign service codes (one per category) for this consultation.
   await assignServiceCodesForConsultation(pool, consultId);
  }

  return res.redirect('/cashier?msg=' + encodeURIComponent(`OPD orders backfill complete. Created: ${created}, Skipped: ${skipped}`));
 } catch (e) {
  return res.redirect('/cashier?err=' + encodeURIComponent(e.message));
 }
});

// CASHIER: AJAX === Æ’ ===   Doctors filtered by department

app.get('/api/cashier/doctors-for-dept', requireAuth, async (req, res) => {
 const dept = (req.query.dept || '').trim();
 const spec = (req.query.specialisation || req.query.spec || '').trim();
 try {
  const hmsDoctorStaff = require('./lib/hmsDoctorStaff');
  const { filterDoctorsByClinicalCriteria } = require('./lib/hmsDoctorClinicalFilter');
  const doctors = await hmsDoctorStaff.fetchActiveDoctorsWithClinicalLinks(
   pool,
   'e.id, e.first_name, e.last_name, COALESCE(e.primary_department,"") AS primary_department, COALESCE(e.specialisation,"") AS specialisation'
  );
  const rows = filterDoctorsByClinicalCriteria(doctors, { department: dept, specialisation: spec });
  res.json(rows);
 } catch (err) {
  res.status(500).json([]);
 }
});

// ────────────────────────────────────────────────────────────
// GEO: Cameroon address cascading data (patients modal)
// Used by public/js/hms-cameroon-address.js + views/patients.ejs
// ────────────────────────────────────────────────────────────
app.get('/api/cameroon-geo', requireAuth, (req, res) => {
 // Minimal structured dataset (regions -> divisions -> communes).
 // Villages are hints (optional) and can be overridden with "Other".
 const regions = [
  'Adamawa','Centre','East','Far North','Littoral',
  'North','North-West','South','South-West','West'
 ];

 const departments = {
  'Adamawa': ['Djérem','Faro-et-Déo','Mayo-Banyo','Mbéré','Vina'],
  'Centre': ['Haute-Sanaga','Lekié','Mbam-et-Inoubou','Mbam-et-Kim','Méfou-et-Afamba','Méfou-et-Akono','Mfoundi','Nyong-et-Kéllé','Nyong-et-Mfoumou','Nyong-et-So’o'],
  'East': ['Boumba-et-Ngoko','Haut-Nyong','Kadey','Lom-et-Djérem'],
  'Far North': ['Diamaré','Logone-et-Chari','Mayo-Danay','Mayo-Kani','Mayo-Sava','Mayo-Tsanaga'],
  'Littoral': ['Moungo','Nkam','Sanaga-Maritime','Wouri'],
  'North': ['Bénoué','Faro','Mayo-Louti','Mayo-Rey'],
  'North-West': ['Boyo','Bui','Donga-Mantung','Menchum','Mezam','Momo','Ngo-Ketunjia'],
  'South': ['Dja-et-Lobo','Mvila','Océan','Vallée-du-Ntem'],
  'South-West': ['Fako','Koupé-Manengouba','Lebialem','Manyu','Meme','Ndian'],
  'West': ['Bamboutos','Haut-Nkam','Hauts-Plateaux','Koung-Khi','Menoua','Mifi','Ndé','Noun']
 };

 /** Hand-picked councils for common departments; gaps filled below for every region/division pair. */
 const communesDetailed = {
  'Centre': {
   'Mfoundi': ['Yaoundé I','Yaoundé II','Yaoundé III','Yaoundé IV','Yaoundé V','Yaoundé VI','Yaoundé VII','Other council…'],
   'Haute-Sanaga': ['Nanga-Eboko','Minta','Nsem','Other council…'],
   'Lekié': ['Monatélé','Obala','Okola','Sa’a','Other council…'],
   'Mbam-et-Inoubou': ['Bafia','Makénéné','Nitoukou','Other council…'],
   'Mbam-et-Kim': ['Ntui','Ngambé-Tikar','Other council…'],
   'Méfou-et-Afamba': ['Mfou','Awae','Edzendouan','Soa','Other council…'],
   'Méfou-et-Akono': ['Ngoumou','Akono','Mbankomo','Other council…'],
   'Nyong-et-Kéllé': ['Bot Makak','Éséka','Makak','Other council…'],
   'Nyong-et-Mfoumou': ['Akonolinga','Ayos','Other council…'],
   'Nyong-et-So’o': ['Mbalmayo','Ngomedzap','Other council…']
  },
  'Littoral': {
   'Wouri': ['Douala I','Douala II','Douala III','Douala IV','Douala V','Douala VI','Manjo?','Other council…'],
   'Moungo': ['Nkongsamba I','Nkongsamba II','Nkongsamba III','Loum','Penja','Mbanga','Other council…'],
   'Sanaga-Maritime': ['Édéa I','Édéa II','Dizangué','Pouma','Other council…'],
   'Nkam': ['Nkondjock','Yabassi','Other council…']
  },
  'West': {
   'Mifi': ['Bafoussam I','Bafoussam II','Bafoussam III','Other council…'],
   'Menoua': ['Dschang','Fokoué','Santchou','Penka-Michel','Other council…'],
   'Noun': ['Foumban','Koutaba','Magba','Massangam','Other council…'],
   'Bamboutos': ['Batcham','Galim','Other council…'],
   'Haut-Nkam': ['Baham','Batikam','Other council…'],
   'Hauts-Plateaux': ['Bahouan','Other council…'],
   'Koung-Khi': ['Kouoptamo','Other council…'],
   'Ndé': ['Bangangté','Other council…']
  },
  'South-West': {
   'Fako': ['Buea','Limbe I','Limbe II','Limbe III','Tiko','Muyuka','Other council…'],
   'Meme': ['Kumba I','Kumba II','Kumba III','Other council…'],
   'Koupé-Manengouba': ['Bangem','Tombel','Other council…'],
   'Lebialem': ['Menji','Other council…'],
   'Manyu': ['Mamfe','Other council…'],
   'Ndian': ['Mundemba','Other council…']
  },
  'North': {
   'Bénoué': ['Garoua I','Garoua II','Garoua III','Other council…'],
   'Faro': ['Poli','Other council…'],
   'Mayo-Louti': ['Guider','Other council…'],
   'Mayo-Rey': ['Tcholliré','Other council…']
  },
  'Far North': {
   'Diamaré': ['Maroua I','Maroua II','Maroua III','Other council…'],
   'Logone-et-Chari': ['Kousséri','Other council…'],
   'Mayo-Danay': ['Yagoua','Other council…'],
   'Mayo-Kani': ['Kaélé','Other council…'],
   'Mayo-Sava': ['Mora','Other council…'],
   'Mayo-Tsanaga': ['Mokolo','Other council…']
  },
  'Adamawa': {
   'Djérem': ['Tibati','Other council…'],
   'Faro-et-Déo': ['Tignère','Other council…'],
   'Mayo-Banyo': ['Banyo','Other council…'],
   'Mbéré': ['Meiganga','Other council…'],
   'Vina': ['Ngaoundéré','Other council…']
  },
  'East': {
   'Boumba-et-Ngoko': ['Yokadouma','Other council…'],
   'Haut-Nyong': ['Abong-Mbang','Other council…'],
   'Kadey': ['Batouri','Other council…'],
   'Lom-et-Djérem': ['Bertoua','Other council…']
  },
  'North-West': {
   'Boyo': ['Fundong','Other council…'],
   'Bui': ['Kumbo','Other council…'],
   'Donga-Mantung': ['Nkambé','Other council…'],
   'Menchum': ['Wum','Other council…'],
   'Mezam': ['Bamenda I','Bamenda II','Bamenda III','Other council…'],
   'Momo': ['Mbengwi','Other council…'],
   'Ngo-Ketunjia': ['Ndop','Other council…']
  },
  'South': {
   'Dja-et-Lobo': ['Sangmélima','Other council…'],
   'Mvila': ['Ebolowa','Other council…'],
   'Océan': ['Kribi I','Kribi II','Other council…'],
   'Vallée-du-Ntem': ['Ambam','Other council…']
  }
 };

 const communes = {};
 regions.forEach(reg => {
  communes[reg] = {};
  (departments[reg] || []).forEach(div => {
   const pick = communesDetailed[reg] && communesDetailed[reg][div];
   communes[reg][div] =
    pick && pick.length
     ? pick.slice()
     : [`${div} — Main centre`, `${div} — Other locality`, 'Other council…'];
  });
 });

 const villageDefaults = ['Other (specify)…'];
 const villageHints = {
  'Centre|Mfoundi|Yaoundé I': ['Bastos','Tsinga','Nlongkak','Mokolo','Other (specify)…'],
  'Centre|Mfoundi|Yaoundé III': ['Efoulan','Nsimeyong','Mendong','Other (specify)…'],
  'Littoral|Wouri|Douala I': ['Akwa','Bonanjo','Deido','Bali','Other (specify)…'],
  'Littoral|Wouri|Douala V': ['Bonaberi','Makepe','Logpom','Other (specify)…'],
  'West|Mifi|Bafoussam I': ['Banengo','Tamdja','Houngang','Other (specify)…']
 };

 res.json({ regions, departments, communes, villageDefaults, villageHints });
});

// INSURANCE carriers for registration dropdowns
app.get('/api/insurance/carriers', requireAuth, async (req, res) => {
 try {
  const [rows] = await pool.query('SELECT id, name FROM tbl_insurance_carrier WHERE status=1 ORDER BY name').catch(() => [[]]);
  res.json(Array.isArray(rows) ? rows : []);
 } catch (err) {
  res.json([]);
 }
});

// CASHIER: IPD SETTLEMENT (Station 9)
app.get('/cashier/ipd-settle', requireAuth, (req, res) => {
 // This endpoint is intended as a POST from the Cashier modal.
 // If visited directly, send user back to Cashier dashboard.
 res.redirect('/cashier');
});

// CASHIER: Backfill past IPD settlements into Payment History
// Creates missing tbl_payment_ticket + tbl_billing_document rows for admissions that already have ipd_payment_code.
app.get('/cashier/ipd-settle/backfill', requireAuth, requireAdminOrSuper, async (req, res) => {
 try {
  const fid = req.session.facilityId || 1;
  const uid = req.session.userId || req.session.user?.id || 1;

  // Ensure required tables/columns exist
  await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_payment_code VARCHAR(40) DEFAULT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_paid_at DATETIME DEFAULT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40) DEFAULT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS paid_by INT DEFAULT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS paid_at DATETIME DEFAULT NULL").catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_billing_document (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT DEFAULT 1,
      patient_id INT NOT NULL,
      doc_type VARCHAR(40) NOT NULL,
      doc_number VARCHAR(60) NOT NULL,
      invoice_doc_number VARCHAR(60) NULL,
      total_amount DECIMAL(12,2) DEFAULT 0,
      payment_method VARCHAR(40) DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'paid',
      source_module VARCHAR(40) DEFAULT NULL,
      source_pk INT DEFAULT NULL,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_patient (patient_id),
      KEY idx_source (source_module, source_pk)
    )
  `).catch(() => {});

  const [rows] = await pool.query(`
    SELECT
      a.id AS admission_id,
      a.patient_id,
      a.deposit_amount,
      a.ipd_payment_code,
      a.ipd_paid_at,
      COALESCE((SELECT SUM(c.amount) FROM tbl_ipd_charge c WHERE c.admission_id=a.id), 0) AS total_charges
    FROM tbl_admission a
    WHERE a.ipd_payment_code IS NOT NULL
      AND TRIM(a.ipd_payment_code) <> ''
    ORDER BY a.id DESC
    LIMIT 1000
  `).catch(() => [[]]);

  let createdTickets = 0;
  let createdReceipts = 0;
  let skipped = 0;

  for (const r of (Array.isArray(rows) ? rows : [])) {
   const code = String(r.ipd_payment_code || '').trim();
   if (!code) { skipped++; continue; }

   // Skip if ticket already exists
   const [[tExists]] = await pool.query(
    'SELECT id FROM tbl_payment_ticket WHERE ticket_code = ? LIMIT 1',
    [code]
   ).catch(() => [[null]]);
   if (!tExists) {
    const total = parseFloat(r.total_charges || 0) || 0;
    const deposit = parseFloat(r.deposit_amount || 0) || 0;
    const balance = Math.max(0, total - deposit);
    const paidAt = r.ipd_paid_at ? new Date(r.ipd_paid_at) : new Date();

    const lines = [{
     kind: 'ipd_settlement',
     description: 'IPD Financial Discharge (Final Settlement)',
     unit_price: balance,
     quantity: 1.0,
     admission_id: r.admission_id,
     total_charges: total,
     deposit_amount: deposit,
     paid: true
    }];

    await pool.query(
     `INSERT INTO tbl_payment_ticket
      (facility_id, ticket_code, patient_id, total_amount, status, payment_method, lines_json, created_by, paid_at, paid_by, created_at)
      VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?)`,
     [fid, code, r.patient_id, balance, 'Unknown', JSON.stringify(lines), uid, paidAt, uid, paidAt]
    ).catch(() => {});
    createdTickets++;
   }

   // Skip if receipt already exists for this admission settlement
   const [[rExists]] = await pool.query(
    "SELECT id FROM tbl_billing_document WHERE source_module='ipd_settlement' AND source_pk=? LIMIT 1",
    [r.admission_id]
   ).catch(() => [[null]]);
   if (!rExists) {
    const total = parseFloat(r.total_charges || 0) || 0;
    const deposit = parseFloat(r.deposit_amount || 0) || 0;
    const balance = Math.max(0, total - deposit);
    const receiptNo = await nextReceiptNumber(pool, fid);
    const invoiceNo = await nextInvoiceNumber(pool, fid);
    const paidAt = r.ipd_paid_at ? new Date(r.ipd_paid_at) : new Date();
    await pool.query(
     `INSERT INTO tbl_billing_document
      (facility_id, patient_id, doc_type, doc_number, invoice_doc_number, total_amount, payment_method, status, source_module, source_pk, created_by, created_at)
      VALUES (?, ?, 'receipt', ?, ?, ?, ?, 'paid', 'ipd_settlement', ?, ?, ?)`,
     [fid, r.patient_id, receiptNo, invoiceNo, balance, 'Unknown', r.admission_id, uid, paidAt]
    ).catch(() => {});
    createdReceipts++;
   }
  }

  res.redirect('/cashier?msg=' + encodeURIComponent(`Backfill complete. Tickets: ${createdTickets}, Receipts: ${createdReceipts}, Skipped: ${skipped}`));
 } catch (err) {
  console.error('IPD BACKFILL ERROR:', err.message);
  res.redirect('/cashier?err=' + encodeURIComponent(err.message));
 }
});

app.post('/cashier/ipd-settle', requireAuth, async (req, res) => {
 const aid = parseInt(req.body.admission_id) || 0;
 const payMethod = String(req.body.payment_method || 'Cash');
 const refundMethod = String(req.body.refund_method || '').trim();
 if (aid < 1) return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.invalid_admission')));

 // Ensure columns exist
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_payment_code VARCHAR(40) DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_paid_at DATETIME DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_payment_code_generated_at DATETIME DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_code_consumed_at DATETIME DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_code_service_label VARCHAR(120) DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_refund_amount DECIMAL(12,2) DEFAULT 0").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_refund_method VARCHAR(20) DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_refunded_at DATETIME DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40) DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS paid_by INT DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS paid_at DATETIME DEFAULT NULL").catch(() => {});

 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();

  const uid = req.session.userId || req.session.user?.id || 1;
  const fid = req.session.facilityId || 1;

  const [[adm]] = await conn.query(
   `SELECT id, patient_id, deposit_amount, ipd_payment_code, ipd_status, discharged_at,
           COALESCE(ipd_refund_amount,0) AS ipd_refund_amount,
           ipd_refund_method, ipd_refunded_at
    FROM tbl_admission
    WHERE id=? FOR UPDATE`,
   [aid]
  );
  if (!adm || adm.discharged_at) {
   await conn.rollback();
   conn.release();
   return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.admission_not_found_or_discharged')))
  }

  const [[sum]] = await conn.query(
   'SELECT COALESCE(SUM(amount),0) AS total_charges FROM tbl_ipd_charge WHERE admission_id=?',
   [aid]
  ).catch(() => [[{ total_charges: 0 }]]);
  const total = parseFloat(sum?.total_charges || 0) || 0;
  const deposit = parseFloat(adm.deposit_amount || 0) || 0;
  const balance = Math.max(0, total - deposit);
 const refund = Math.max(0, deposit - total);

  if (refund > 0 && !refundMethod) {
   await conn.rollback();
   conn.release();
   return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.refund_required_select_a_refund_method')));
  }
  if (refund > 0 && (parseFloat(adm.ipd_refund_amount || 0) || 0) > 0) {
   await conn.rollback();
   conn.release();
   return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.refund_already_processed_for_this_admission')));
  }

  // Generate code if needed (balance may be 0; still generate for audit/ward release)
  let code = String(adm.ipd_payment_code || '').trim();
  if (!code) {
   code = await allocateUniquePaymentCode(conn, 'hospitalisation');
  }

  await conn.query(
   `UPDATE tbl_admission
    SET ipd_payment_code=?,
        ipd_paid_at=NOW(),
        ipd_payment_code_generated_at=COALESCE(ipd_payment_code_generated_at, NOW()),
        ipd_code_service_label=COALESCE(NULLIF(TRIM(ipd_code_service_label),''), 'IPD Final Settlement'),
        ipd_refund_amount=?,
        ipd_refund_method=?,
        ipd_refunded_at=CASE WHEN ? > 0 THEN NOW() ELSE ipd_refunded_at END
    WHERE id=?`,
   [code, refund, (refund > 0 ? refundMethod : null), refund, aid]
  );

  // Write to payment history as a paid ticket (so it shows up in Cashier history + print slip)
  // Always include a breakdown so receipts/slips can show reimbursements when deposit > charges.
  const lines = [
   { kind: 'ipd_total', description: 'IPD Total Charges', unit_price: total, quantity: 1.0, admission_id: aid },
   { kind: 'ipd_deposit', description: 'Caution / Deposit Paid', unit_price: -deposit, quantity: 1.0, admission_id: aid },
  ];
  if (balance > 0) {
   lines.push({ kind: 'ipd_balance', description: 'Balance Due (Collected)', unit_price: balance, quantity: 1.0, admission_id: aid, paid: true });
  } else {
   lines.push({ kind: 'ipd_balance', description: 'Balance Due', unit_price: 0, quantity: 1.0, admission_id: aid, paid: true });
  }
  if (refund > 0) {
   lines.push({ kind: 'ipd_refund', description: `Deposit Refund (Reimbursed) — ${refundMethod}`, unit_price: -refund, quantity: 1.0, admission_id: aid, paid: true, refund_method: refundMethod });
  }

  // If refund paid into Wallet, credit patient wallet and add wallet transaction
  if (refund > 0 && refundMethod === 'Wallet') {
   await conn.query(`
    CREATE TABLE IF NOT EXISTS tbl_patient_wallet (
     id INT AUTO_INCREMENT PRIMARY KEY,
     patient_id INT NOT NULL,
     balance DECIMAL(12,2) DEFAULT 0,
     status VARCHAR(20) DEFAULT 'active',
     qr_token VARCHAR(255),
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     UNIQUE KEY uniq_wallet_patient (patient_id)
    )
   `).catch(() => {});
   await conn.query(`
    CREATE TABLE IF NOT EXISTS tbl_patient_wallet_txn (
     id INT AUTO_INCREMENT PRIMARY KEY,
     wallet_id INT NOT NULL,
     txn_type VARCHAR(40) DEFAULT NULL,
     direction ENUM('cr','dr') NOT NULL,
     amount DECIMAL(12,2) NOT NULL,
     balance_after DECIMAL(12,2) DEFAULT 0,
     reference_id VARCHAR(80) DEFAULT NULL,
     notes TEXT,
     created_by INT DEFAULT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY idx_wallet (wallet_id)
    )
   `).catch(() => {});

   await conn.query(
    "INSERT IGNORE INTO tbl_patient_wallet (patient_id, balance, status, qr_token, created_at, updated_at) VALUES (?,0,'active',?,NOW(),NOW())",
    [adm.patient_id, 'GBPAY-' + adm.patient_id + '-' + Date.now()]
   ).catch(() => {});

   const [[wallet]] = await conn.query(
    "SELECT id, balance FROM tbl_patient_wallet WHERE patient_id=? AND status='active' LIMIT 1 FOR UPDATE",
    [adm.patient_id]
   ).catch(() => [[null]]);
   if (wallet && wallet.id) {
    const cur = parseFloat(wallet.balance || 0) || 0;
    const next = cur + refund;
    await conn.query('UPDATE tbl_patient_wallet SET balance=?, updated_at=NOW() WHERE id=?', [next, wallet.id]);
    await conn.query(
     `INSERT INTO tbl_patient_wallet_txn (wallet_id, txn_type, direction, amount, balance_after, reference_id, notes, created_by)
      VALUES (?, 'refund_ipd', 'cr', ?, ?, ?, ?, ?)`,
     [wallet.id, refund, next, 'IPD-REFUND-' + aid, `IPD refund for admission ${aid}`, uid]
    );
   }
  }

  // If ticket already exists, update; else insert
  const [[tExists]] = await conn.query(
   'SELECT id FROM tbl_payment_ticket WHERE ticket_code = ? LIMIT 1',
   [code]
  ).catch(() => [[null]]);

  if (tExists && tExists.id) {
   await conn.query(
    `UPDATE tbl_payment_ticket
     SET patient_id=?,
         total_amount=?,
         status='paid',
         payment_method=?,
         lines_json=?,
         paid_at=NOW(),
         paid_by=?,
         created_by=COALESCE(created_by, ?)
     WHERE id=?`,
    [adm.patient_id, balance, payMethod, JSON.stringify(lines), uid, uid, tExists.id]
   );
  } else {
   await conn.query(
    `INSERT INTO tbl_payment_ticket
     (facility_id, ticket_code, patient_id, total_amount, status, payment_method, lines_json, created_by, paid_at, paid_by, created_at)
     VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, NOW(), ?, NOW())`,
    [fid, code, adm.patient_id, balance, payMethod, JSON.stringify(lines), uid, uid]
   );
  }

  // Create a receipt (tbl_billing_document) for printing
  await conn.query(`
    CREATE TABLE IF NOT EXISTS tbl_billing_document (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT DEFAULT 1,
      patient_id INT NOT NULL,
      doc_type VARCHAR(40) NOT NULL,
      doc_number VARCHAR(60) NOT NULL,
      invoice_doc_number VARCHAR(60) NULL,
      total_amount DECIMAL(12,2) DEFAULT 0,
      payment_method VARCHAR(40) DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'paid',
      source_module VARCHAR(40) DEFAULT NULL,
      source_pk INT DEFAULT NULL,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_patient (patient_id),
      KEY idx_source (source_module, source_pk)
    )
  `);

  const receiptNo = await nextReceiptNumber(conn, fid);
  const invoiceNo = await nextInvoiceNumber(conn, fid);
  const [docIns] = await conn.query(
   `INSERT INTO tbl_billing_document
    (facility_id, patient_id, doc_type, doc_number, invoice_doc_number, total_amount, payment_method, status, source_module, source_pk, created_by, created_at)
    VALUES (?, ?, 'receipt', ?, ?, ?, ?, 'paid', 'ipd_settlement', ?, ?, NOW())`,
   [fid, adm.patient_id, receiptNo, invoiceNo, balance, payMethod, aid, uid]
  );
  const billingDocId = parseInt(String(docIns?.insertId || 0), 10) || 0;

  let receiptTxn = null;
  let refundTxn = null;
  try {
   const { recordReceiptInTransaction, recordRefundInTransaction } = require('./lib/cashierTxnWire');
   if (balance > 0) {
    receiptTxn = await recordReceiptInTransaction(conn, {
     facilityId: fid,
     userId: uid,
     sourceModule: 'ipd_settlement',
     sourcePk: aid,
     amount: balance,
     paymentMethod: payMethod,
     billingDocumentId: billingDocId || null,
     patientId: adm.patient_id,
     lines,
     reference: receiptNo,
     narration: `IPD settlement admission #${aid}`,
    });
   }
   if (refund > 0) {
    refundTxn = await recordRefundInTransaction(conn, {
     facilityId: fid,
     userId: uid,
     sourceModule: 'ipd_refund',
     sourcePk: aid,
     amount: refund,
     paymentMethod: refundMethod,
     patientId: adm.patient_id,
     lines,
     serviceKey: 'hospitalisation',
     reference: `IPD-REF-${aid}`,
     narration: `IPD deposit refund admission #${aid}`,
    });
   }
  } catch (txnErr) {
   console.error('cashier txn (ipd-settle):', txnErr.message);
  }

  await conn.commit();
  conn.release();

  const { runCashierPostCommit } = require('./lib/cashierTxnWire');
  if (balance > 0) {
   await runCashierPostCommit(pool, {
    txnId: receiptTxn?.txnId || null,
    journalKind: 'receipt',
    facilityId: fid,
    billingDocumentId: billingDocId,
    grandTotal: balance,
    paymentMethod: payMethod,
    createdBy: uid,
    docNumber: receiptNo,
    firstLineDescription: 'IPD Final Settlement',
    sourceModule: 'ipd_settlement',
   });
  }
  if (refund > 0) {
   await runCashierPostCommit(pool, {
    txnId: refundTxn?.txnId || null,
    journalKind: 'refund',
    facilityId: fid,
    amount: refund,
    paymentMethod: refundMethod,
    createdBy: uid,
    reference: `IPD-REF-${aid}`,
    narration: `IPD deposit refund admission #${aid}`,
    cashierCode: refundTxn?.cashierCode,
    cashierIdentity: refundTxn?.cashierIdentity,
    serviceKey: 'hospitalisation',
   });
  }

  const msg = refund > 0
   ? `IPD settlement complete. Refunded: ${refund} via ${refundMethod}. Code: ${code}. Receipt: ${receiptNo} · Invoice: ${invoiceNo}`
   : (balance > 0
    ? `IPD settlement recorded (${payMethod}). Code: ${code}. Receipt: ${receiptNo} · Invoice: ${invoiceNo}`
    : `IPD settlement confirmed (zero balance). Code: ${code}. Receipt: ${receiptNo} · Invoice: ${invoiceNo}`);
  res.redirect('/cashier?msg=' + encodeURIComponent(msg));
 } catch (err) {
  await conn.rollback().catch(() => {});
  conn.release();
  console.error('IPD SETTLE ERROR:', err.message);
  res.redirect('/cashier?err=' + encodeURIComponent(err.message));
 }
});

// ER final settlement after clinical discharge (mirrors IPD /cashier/ipd-settle)
app.post('/cashier/er-settle', requireAuth, async (req, res) => {
 const vid = parseInt(req.body.visit_id, 10) || 0;
 const payMethod = String(req.body.payment_method || 'Cash');
 if (vid < 1) return res.redirect('/cashier?err=' + encodeURIComponent('Invalid ER visit'));

 const ensureEmergencySchema = require('./lib/ensureEmergencySchema');
 await ensureEmergencySchema(pool).catch(() => {});

 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();
  const uid = req.session.userId || req.session.user?.id || 1;
  const fid = req.session.facilityId || 1;

  const [[v]] = await conn.query(
   `SELECT id, patient_id, er_payment_code, er_status, queue_status, ticket_number
      FROM tbl_opd_visit
     WHERE id = ? AND is_emergency = 1
     LIMIT 1 FOR UPDATE`,
   [vid]
  );
  if (!v || String(v.queue_status) !== 'clinical_discharged') {
   await conn.rollback();
   conn.release();
   return res.redirect('/cashier?err=' + encodeURIComponent('Visit not found or not clinically discharged'));
  }

  const [[sum]] = await conn.query(
   'SELECT COALESCE(SUM(amount),0) AS balance FROM tbl_emergency_charge WHERE visit_id=? AND settled=0',
   [vid]
  ).catch(() => [[{ balance: 0 }]]);
  const balance = parseFloat(sum?.balance || 0) || 0;

  let code = String(v.er_payment_code || '').trim();
  if (!code) {
   code = await allocateUniquePaymentCode(conn, 'emergency_settlement');
  }

  if (balance > 0) {
   const lines = [
    { kind: 'emergency_settlement', description: 'ER Final Settlement', unit_price: balance, quantity: 1, visit_id: vid },
   ];
   const [[tExists]] = await conn.query(
    'SELECT id FROM tbl_payment_ticket WHERE ticket_code = ? LIMIT 1',
    [code]
   ).catch(() => [[null]]);
   if (tExists && tExists.id) {
    await conn.query(
     `UPDATE tbl_payment_ticket
         SET total_amount=?, status='paid', payment_method=?, lines_json=?, paid_at=NOW(), paid_by=?, emergency_visit_id=?
       WHERE id=?`,
     [balance, payMethod, JSON.stringify(lines), uid, vid, tExists.id]
    );
   } else {
    await conn.query(
     `INSERT INTO tbl_payment_ticket
        (facility_id, ticket_code, patient_id, total_amount, status, payment_method, lines_json,
         created_by, paid_at, paid_by, created_at, emergency_visit_id, ticket_category)
      VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, NOW(), ?, NOW(), ?, 'emergency_settlement')`,
     [fid, code, v.patient_id, balance, payMethod, JSON.stringify(lines), uid, uid, vid]
    );
   }
   await conn.query('UPDATE tbl_emergency_charge SET settled=1 WHERE visit_id=? AND settled=0', [vid]).catch(() => {});
  } else {
   await conn.query('UPDATE tbl_emergency_charge SET settled=1 WHERE visit_id=? AND settled=0', [vid]).catch(() => {});
  }

  await conn.query(
   `UPDATE tbl_opd_visit
       SET er_payment_code=?,
           er_paid_at=NOW(),
           er_payment_code_generated_at=COALESCE(er_payment_code_generated_at, NOW())
     WHERE id=?`,
   [code, vid]
  );

  const { cancelPendingEmgTickets } = require('./lib/erCashierSettlement');
  await cancelPendingEmgTickets(conn, vid);

  let billingDocId = 0;
  let receiptNo = '';
  let receiptTxn = null;
  if (balance > 0) {
   receiptNo = await nextReceiptNumber(conn, fid);
   const invoiceNo = await nextInvoiceNumber(conn, fid);
   const [docIns] = await conn.query(
    `INSERT INTO tbl_billing_document
     (facility_id, patient_id, doc_type, doc_number, invoice_doc_number, total_amount, payment_method, status, source_module, source_pk, created_by, created_at)
     VALUES (?, ?, 'receipt', ?, ?, ?, ?, 'paid', 'er_settlement', ?, ?, NOW())`,
    [fid, v.patient_id, receiptNo, invoiceNo, balance, payMethod, vid, uid]
   );
   billingDocId = parseInt(String(docIns?.insertId || 0), 10) || 0;
   try {
    const { recordReceiptInTransaction } = require('./lib/cashierTxnWire');
    receiptTxn = await recordReceiptInTransaction(conn, {
     facilityId: fid,
     userId: uid,
     sourceModule: 'er_settlement',
     sourcePk: vid,
     amount: balance,
     paymentMethod: payMethod,
     billingDocumentId: billingDocId || null,
     patientId: v.patient_id,
     lines: [{ kind: 'emergency_settlement', description: 'ER Final Settlement' }],
     reference: receiptNo,
     narration: `ER settlement visit #${vid}`,
    });
   } catch (txnErr) {
    console.error('cashier txn (er-settle):', txnErr.message);
   }
  }

  await conn.commit();
  conn.release();

  if (balance > 0) {
   try {
    const { runCashierPostCommit } = require('./lib/cashierTxnWire');
    await runCashierPostCommit(pool, {
     txnId: receiptTxn?.txnId || null,
     journalKind: 'receipt',
     facilityId: fid,
     billingDocumentId: billingDocId,
     grandTotal: balance,
     paymentMethod: payMethod,
     createdBy: uid,
     docNumber: receiptNo,
     firstLineDescription: 'ER Final Settlement',
     sourceModule: 'er_settlement',
    });
   } catch (pipeErr) {
    console.error('cashier journal pipeline (er-settle):', pipeErr.message);
   }
  }

  const syncEmergencyCashierTickets = require('./lib/syncEmergencyCashierTickets');
  await syncEmergencyCashierTickets(pool).catch(() => {});

  const msg = balance > 0
   ? `ER settlement recorded (${payMethod}). Give patient code: ${code}`
   : `ER settlement confirmed (zero balance). Discharge code: ${code}`;
  res.redirect('/cashier?msg=' + encodeURIComponent(msg));
 } catch (err) {
  await conn.rollback().catch(() => {});
  conn.release();
  console.error('ER SETTLE ERROR:', err.message);
  res.redirect('/cashier?err=' + encodeURIComponent(err.message));
 }
});

// BetterPay IPN / webhook (configure BETTERPAY_WEBHOOK_SECRET)
app.post('/webhooks/betterpay', async (req, res) => {
 try {
  const cfg = await betterPayConfig.resolve(pool);
  const secret = String(cfg.webhookSecret || process.env.BETTERPAY_WEBHOOK_SECRET || '').trim();
  if (secret) {
   const hdr = String(req.headers['x-betterpay-secret'] || req.headers['x-webhook-secret'] || '').trim();
   if (hdr !== secret) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const body = req.body || {};
  const ref = String(body.ref || body.reference || body.ticket_code || body.bill_reference || '').trim();
  if (!ref) return res.status(400).json({ ok: false, error: 'Missing ref' });
  if (betterPayPayment.responseIndicatesPaid(body)) {
   await betterPayPayment.markPaid(pool, ref, body.transaction_id || body.id || null);
  }
  return res.json({ ok: true });
 } catch (e) {
  console.error('BETTERPAY WEBHOOK:', e.message);
  return res.status(500).json({ ok: false });
 }
});

app.post('/api/cashier/prepay/betterpay/start', requireAuth, async (req, res) => {
 try {
  const out = await cashierPrepayIssue.startBetterPayPayment(pool, req.body, req.session);
  if (!out.ok) return res.status(out.status || 400).json(out);
  return res.json(out);
 } catch (e) {
  console.error('PREPAY BETTERPAY START:', e.message);
  return res.status(500).json({ ok: false, error: e.message });
 }
});

app.get('/api/cashier/prepay/betterpay/status', requireAuth, async (req, res) => {
 try {
  const ref = String(req.query.ref || '').trim();
  if (!ref) return res.status(400).json({ ok: false, error: 'Missing ref' });
  const { paid, status, row, expired } = await betterPayPayment.getPaymentStatus(pool, ref);
  return res.json({
   ok: true,
   paid,
   status: status || (paid ? 'paid' : 'pending'),
   expired: !!expired,
   amount: row ? parseFloat(row.amount) : null,
  });
 } catch (e) {
  console.error('PREPAY BETTERPAY STATUS:', e.message);
  return res.status(500).json({ ok: false, error: e.message });
 }
});

app.post('/api/cashier/prepay/betterpay/timeout', requireAuth, async (req, res) => {
 try {
  const ref = String(req.body?.ref || req.query?.ref || '').trim();
  const out = await cashierPrepayIssue.markBetterPayTimeout(pool, ref);
  if (!out.ok) return res.status(out.status || 400).json(out);
  return res.json(out);
 } catch (e) {
  console.error('PREPAY BETTERPAY TIMEOUT:', e.message);
  return res.status(500).json({ ok: false, error: e.message });
 }
});

app.post('/api/cashier/prepay/betterpay/retry', requireAuth, async (req, res) => {
 try {
  const ref = String(req.body?.ref || '').trim();
  const out = await cashierPrepayIssue.retryBetterPayPayment(pool, ref);
  if (!out.ok) return res.status(out.status || 400).json(out);
  return res.json(out);
 } catch (e) {
  console.error('PREPAY BETTERPAY RETRY:', e.message);
  return res.status(500).json({ ok: false, error: e.message });
 }
});

app.get('/api/cashier/pending-payments', requireAuth, requirePerm('cashier.read', 'cashier.write'), async (req, res) => {
 try {
  const pagination = require('./lib/pagination');
  const [rows] = await pool.query(`
   SELECT t.*, p.first_name, p.last_name, bp.status AS betterpay_status
   FROM tbl_payment_ticket t
   JOIN tbl_patient p ON p.id = t.patient_id
   LEFT JOIN tbl_betterpay_payment bp ON bp.ref = t.ticket_code
   WHERE t.status = 'pending' ORDER BY t.id DESC LIMIT ${pagination.DEFAULT_PAGE_SIZE}
  `);
  return res.json({ ok: true, pending: rows || [] });
 } catch (e) {
  return res.status(500).json({ ok: false, error: e.message });
 }
});

app.get('/api/cashier/billing-invoices', requireAuth, requirePerm('cashier.read', 'cashier.write'), async (req, res) => {
 try {
  const { fetchCashierBillingInvoices } = require('./lib/cashierBillingInvoices');
  const statusFilter = String(req.query.status || 'all').toLowerCase();
  const claimFilter = String(req.query.claim || 'all').toLowerCase();
  const categoryFilter = String(req.query.category || 'all').toLowerCase();
  const search = String(req.query.q || '').trim();
  const dateFrom = String(req.query.from || '').trim();
  const dateTo = String(req.query.to || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const data = await fetchCashierBillingInvoices(pool, {
   statusFilter,
   claimFilter,
   categoryFilter,
   search,
   dateFrom,
   dateTo,
   limit,
   offset,
   scansLabel: SCANS_IMAGING_LABEL,
  });
  return res.json({ ok: true, ...data });
 } catch (e) {
  console.error('CASHIER BILLING API:', e.message);
  return res.status(500).json({ ok: false, error: e.message });
 }
});

app.post('/api/cashier/invoices', requireAuth, requirePerm('cashier.write'), async (req, res) => {
 try {
  const { createCashierInvoice } = require('./lib/cashierCreateInvoice');
  const out = await createCashierInvoice(pool, req.body || {}, req.session);
  if (!out.ok) return res.status(out.status || 400).json(out);
  return res.json(out);
 } catch (e) {
  console.error('CASHIER CREATE INVOICE:', e.message);
  return res.status(500).json({ ok: false, error: e.message });
 }
});

app.get('/api/cashier/prepay/betterpay/retry-info', requireAuth, async (req, res) => {
 try {
  const ref = String(req.query.ref || '').trim();
  const out = await cashierPrepayIssue.getBetterPayRetryInfo(pool, ref);
  if (!out.ok) return res.status(out.status || 404).json(out);
  return res.json(out);
 } catch (e) {
  console.error('PREPAY BETTERPAY RETRY INFO:', e.message);
  return res.status(500).json({ ok: false, error: e.message });
 }
});

app.get('/cashier/betterpay/print-qr/:ref', requireAuth, requirePerm('cashier.read', 'cashier.write'), async (req, res) => {
 try {
  const ref = String(req.params.ref || '').trim();
  const row = await betterPayPayment.getRow(pool, ref);
  if (!row) return res.redirect('/cashier?err=' + encodeURIComponent('BetterPay payment not found'));
  const meta = betterPayPayment.parseMeta(row);
  const paymentUrl = meta.payment_url || (await betterPayQr.buildBetterPayPaymentUrl(pool, {
   ref,
   amount: row.amount,
   description: meta.service,
  }));
  const [[patient]] = await pool.query(
    'SELECT first_name, last_name, phone, patient_code FROM tbl_patient WHERE id = ? LIMIT 1',
    [row.patient_id]
  ).catch(() => [[]]);
  const [[ticket]] = await pool.query(
    'SELECT lines_json FROM tbl_payment_ticket WHERE ticket_code = ? LIMIT 1',
    [ref]
  ).catch(() => [[]]);
  let serviceLabel = meta.service || 'Hospital payment';
  if (ticket?.lines_json) {
   try {
    const lines = JSON.parse(ticket.lines_json);
    if (lines[0]?.description) serviceLabel = lines[0].description;
   } catch (_) {}
  }
  const hmsBrand = require('./lib/hmsBrand');
  const lang = String(res.locals.lang || req.cookies?.lang || 'en').slice(0, 2);
  const isFr = lang === 'fr';
  res.render('cashier-betterpay-qr-print', {
   title: 'BetterPay QR',
   lang,
   ref,
   amount: parseFloat(row.amount) || 0,
   paymentUrl,
   patientName: meta.patient_name || (patient ? `${patient.first_name || ''} ${patient.last_name || ''}`.trim() : ''),
   patientPhone: patient?.phone || '',
   patientCode: patient?.patient_code || '',
   serviceLabel,
   facilityName: hmsBrand.facilityName || 'TSSF (Shisong Annex) SOA',
   labels: {
    amount: isFr ? 'Montant à payer' : 'Amount due',
    service: isFr ? 'Service' : 'Service',
    patient: isFr ? 'Patient' : 'Patient',
    reference: isFr ? 'Référence' : 'Reference',
    hint: isFr
     ? 'Scannez avec Orange Money, MTN MoMo ou un autre portefeuille mobile. Le paiement est confirmé automatiquement au guichet.'
     : 'Scan with Orange Money, MTN MoMo, or another mobile wallet. Payment is confirmed automatically at the cashier desk.',
   },
  });
 } catch (e) {
  console.error('BETTERPAY PRINT QR:', e.message);
  return res.redirect('/cashier?err=' + encodeURIComponent(e.message));
 }
});

app.post('/api/cashier/prepay/issue', requireAuth, async (req, res) => {
 try {
  const ctx = await cashierPrepayIssue.resolvePrepayContext(pool, req.body);
  if (!ctx.ok) return res.status(ctx.status || 400).json({ ok: false, error: ctx.error });
  const result = await cashierPrepayIssue.issuePrepayTicket(pool, ctx, req.session);
  if (!result.ok) return res.status(result.status || 400).json({ ok: false, error: result.error });
  return res.json({ ok: true, ticketCode: result.ticket_code, ticketId: result.ticket_id });
 } catch (e) {
  console.error('PREPAY ISSUE API:', e.message);
  return res.status(500).json({ ok: false, error: e.message });
 }
});

app.get('/api/cashier/prepay/wallet-status', requireAuth, async (req, res) => {
 try {
  const pid = parseInt(String(req.query.patient_id || ''), 10) || 0;
  if (pid < 1) return res.json({ ok: true, hasWallet: false, balance: 0 });
  const walletHub = require('./lib/walletHub');
  const wallet = await walletHub.findWalletForPatient(pool, pid, req.session.facilityId || 1);
  const active = !!(wallet && String(wallet.status || '').toLowerCase() === 'active');
  return res.json({
    ok: true,
    hasWallet: active,
    balance: active ? parseFloat(wallet.balance) || 0 : 0,
  });
 } catch (e) {
  console.error('PREPAY WALLET STATUS:', e.message);
  return res.status(500).json({ ok: false, error: e.message });
 }
});

// CASHIER: ISSUE PREPAYMENT (Wallet / BetterPay verify payment before issuing)
app.post('/cashier/issue-prepay', requireAuth, async (req, res) => {
 try {
  const ctx = await cashierPrepayIssue.resolvePrepayContext(pool, req.body);
  if (!ctx.ok) {
   return res.redirect('/cashier?err=' + encodeURIComponent(ctx.error));
  }
  const result = await cashierPrepayIssue.issuePrepayTicket(pool, ctx, req.session);
  if (!result.ok) {
   return res.redirect('/cashier?err=' + encodeURIComponent(result.error));
  }
  return res.redirect('/cashier/print-slip/' + encodeURIComponent(result.ticket_code));
 } catch (err) {
  console.error('PREPAY ERROR:', err.message);
  return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.payment_failed', { message: err.message })));
 }
});

// CASHIER: PRINT SLIP (Payment Code Slip === Æ’ ===   mirrors cashier-prepay-print.php)
app.get('/cashier/print-batch', requireAuth, async (req, res) => {
 try {
  const access = cashierBatchPrintAccess(req, res);
  if (!access.ok) {
   return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.access_denied', { defaultValue: 'Access denied' })));
  }
  const { buildCashierBatchPrintPayload } = require('./lib/cashierBatchPrint');
  const data = await buildCashierBatchPrintPayload(pool, {
   period: req.query.period || 'day',
   date: req.query.date || '',
   format: req.query.format || 'slip',
   allCashiers: access.allCashiers,
   paidBy: access.paidBy,
   facilityName: hmsBrand.facilityName,
  });
  res.render('print-slip-batch', {
   title: pageTitle(res, 'document_titles.cashier_batch_slips', 'Cashier batch slips — {{label}}', {
    label: data.bounds && data.bounds.label ? data.bounds.label : '',
   }),
   pageData: data,
  });
 } catch (err) {
  console.error('cashier print-batch:', err.message);
  res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.print_slip_error', { message: err.message })));
 }
});

app.get('/cashier/print-receipt-batch', requireAuth, async (req, res) => {
 try {
  const access = cashierBatchPrintAccess(req, res);
  if (!access.ok) {
   return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.access_denied', { defaultValue: 'Access denied' })));
  }
  const { buildCashierReceiptBatchPayload } = require('./lib/cashierBatchReceiptPrint');
  const codesRaw = String(req.query.codes || '').trim();
  const ticketCodes = codesRaw ? codesRaw.split(',').map((c) => c.trim()).filter(Boolean) : [];
  const uid = req.session.userId || req.session.user?.id || null;
  const data = await buildCashierReceiptBatchPayload(pool, {
   ticketCodes,
   period: ticketCodes.length ? null : req.query.period || 'day',
   date: req.query.date || '',
   patientId: req.query.patient_id || 0,
   allCashiers: access.allCashiers,
   paidBy: access.paidBy,
   userId: uid,
  });
  res.render('print-receipt-batch', {
   title: pageTitle(res, 'document_titles.cashier_batch_receipts', 'Batch receipts — {{label}}', {
    label: data.patientLabel || (data.bounds && data.bounds.label) || data.count,
   }),
   layout: false,
   pageData: data,
  });
 } catch (err) {
  console.error('cashier print-receipt-batch:', err.message);
  res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.print_slip_error', { message: err.message })));
 }
});

app.get('/cashier/print-slip/:code', requireAuth, async (req, res) => {
 try {
 const { normalizePrintCode, resolvePaymentTicketForPrint } = require('./lib/resolvePaymentTicketForPrint');
 const code = normalizePrintCode(req.params.code);
 const resolved = await resolvePaymentTicketForPrint(pool, code);
 // #region agent log
 fetch('http://127.0.0.1:7824/ingest/7799ec2f-1013-4dae-a65a-dcfd2e3f62ad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'968473'},body:JSON.stringify({sessionId:'968473',location:'app.js:print-slip',message:'print slip lookup',data:{code,found:!!resolved,source:resolved?.source||null},timestamp:Date.now(),hypothesisId:'C',runId:'post-fix'})}).catch(()=>{});
 // #endregion
 if (!resolved) return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.slip_not_found')))

 const ticket = resolved.ticket;
 ticket.lines = JSON.parse(ticket.lines_json || '[]');

 let validityInfo = null;
 try {
  validityInfo = await paymentValidity.getSlipValidityDisplay(
   pool,
   ticket,
   req.session.facilityId || ticket.facility_id || 1
  );
 } catch (ve) {
  console.error('print-slip validity:', ve.message);
 }

 const printPayload = await resolveTicketPrintPayload(pool, ticket).catch(() => ({
  paymentSettled: false,
  paymentCode: null,
  lineItems: [],
  sectionCodes: { laboratory: null, radiology: null, pharmacy: null },
  prescriptionItems: [],
 }));

 res.render('print-slip', {
 title: pageTitle(res, 'document_titles.payment_code', 'Payment Code — {{code}}', { code: code }),
 pageData: {
  ticket,
  facilityName: hmsBrand.facilityName,
  validityInfo,
  title: pageTitle(res, 'document_titles.payment_code', 'Payment Code — {{code}}', { code: code }),
  ...printPayload,
 },
 });
 } catch (err) {
 console.error(err);
 res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.print_slip_error', { message: err.message })));
 }
});

// CASHIER: desk expense / emergency payout (utilities, admin cash advance, etc.)
app.post('/cashier/disbursement', requireAuth, requirePerm('cashier.write'), async (req, res) => {
 const {
  normalizeDisbursementType,
  normalizeDisbursementCategory,
  disbursementTypeLabel,
 } = require('./lib/cashierDisbursementOptions');
 const { txnType, glKind } = normalizeDisbursementType(req.body.txn_type);
 const amount = parseFloat(req.body.amount) || 0;
 const category = normalizeDisbursementCategory(req.body.category);
 const paymentMethod = betterPayQr.normalizePaymentMethod(req.body.payment_method) || 'Cash';
 const narration = String(req.body.narration || '').trim();
 const uid = parseInt(String(req.session.userId || req.session.user?.id || 0), 10) || 0;
 const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;

 if (amount < 1) {
  return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.invalid_amount', { defaultValue: 'Enter a valid amount.' })));
 }
 if (!narration) {
  return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.description_required', { defaultValue: 'Description is required.' })));
 }
 if (uid < 1) {
  return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.access_denied', { defaultValue: 'Access denied' })));
 }

 const conn = await pool.getConnection();
 let committed = false;
 try {
  const { ensureCashierDisbursementSchema } = require('./lib/ensureCashierDisbursementSchema');
  const { ensureCashierTxnSchema } = require('./lib/ensureCashierTxnSchema');
  await ensureCashierDisbursementSchema(pool);
  await ensureCashierTxnSchema(pool);

  await conn.beginTransaction();

  const [ins] = await conn.query(
   `INSERT INTO tbl_cashier_disbursement
    (facility_id, txn_type, category, amount, payment_method, narration, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
   [fid, txnType, category, amount, paymentMethod, narration.slice(0, 500), uid]
  );
  const disbursementId = parseInt(String(ins?.insertId || 0), 10) || 0;
  if (disbursementId < 1) throw new Error('Could not save disbursement.');

  await conn.commit();
  committed = true;
  conn.release();

  // #region agent log
  fetch('http://127.0.0.1:7824/ingest/7799ec2f-1013-4dae-a65a-dcfd2e3f62ad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'968473'},body:JSON.stringify({sessionId:'968473',location:'app.js:disbursement-post-commit',message:'disbursement committed',data:{disbursementId,amount,txnType,uid},timestamp:Date.now(),hypothesisId:'F',runId:'post-fix'})}).catch(()=>{});
  // #endregion

  let cashierTxnResult = null;
  const conn2 = await pool.getConnection();
  try {
   await conn2.beginTransaction();
   const { recordDisbursementInTransaction } = require('./lib/cashierTxnWire');
   cashierTxnResult = await recordDisbursementInTransaction(conn2, {
    facilityId: fid,
    userId: uid,
    disbursementId,
    glKind,
    amount,
    paymentMethod,
    expenseCategory: category,
    narration,
   });
   await conn2.commit();
   // #region agent log
   fetch('http://127.0.0.1:7824/ingest/7799ec2f-1013-4dae-a65a-dcfd2e3f62ad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'968473'},body:JSON.stringify({sessionId:'968473',location:'app.js:disbursement-cashier-txn',message:'cashier txn committed',data:{disbursementId,txnId:cashierTxnResult?.txnId||null,cashierCode:cashierTxnResult?.cashierCode||null},timestamp:Date.now(),hypothesisId:'F',runId:'post-fix'})}).catch(()=>{});
   // #endregion
  } catch (txnErr) {
   await conn2.rollback().catch(() => {});
   console.error('cashier txn (disbursement):', txnErr.message);
   // #region agent log
   fetch('http://127.0.0.1:7824/ingest/7799ec2f-1013-4dae-a65a-dcfd2e3f62ad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'968473'},body:JSON.stringify({sessionId:'968473',location:'app.js:disbursement-cashier-txn',message:'cashier txn failed',data:{disbursementId,error:txnErr.message},timestamp:Date.now(),hypothesisId:'F',runId:'post-fix'})}).catch(()=>{});
   // #endregion
  } finally {
   conn2.release();
  }

  try {
   const { runCashierPostCommit } = require('./lib/cashierTxnWire');
   await runCashierPostCommit(pool, {
    txnId: cashierTxnResult?.txnId || null,
    journalKind: glKind === 'payout' ? 'payout' : 'expense',
    expenseId: disbursementId,
    disbursementId,
    amount,
    paymentMethod,
    expenseCategory: category,
    narration,
    createdBy: uid,
    facilityId: fid,
    cashierCode: cashierTxnResult?.cashierCode,
    cashierIdentity: cashierTxnResult?.cashierIdentity,
    reference: `CD-${disbursementId}`,
   });
  } catch (pipeErr) {
   console.error('cashier journal pipeline (disbursement):', pipeErr.message);
  }

  const typeLabel = disbursementTypeLabel(txnType);
  const journalNote = cashierTxnResult?.txnId ? ' Till ledger and journal updated.' : ' Journal posted.';
  const msg = `${typeLabel} recorded: ${amount} FCFA (${paymentMethod}). Cashier ${cashierTxnResult?.cashierCode || ''}.${journalNote}`;
  return res.redirect('/cashier/ledger?msg=' + encodeURIComponent(msg));
 } catch (err) {
  if (!committed) {
   await conn.rollback().catch(() => {});
   conn.release();
  }
  console.error('CASHIER DISBURSEMENT:', err.message);
  return res.redirect('/cashier?err=' + encodeURIComponent(err.message || 'Disbursement failed.'));
 }
});

function cashierBatchPrintAccess(req, res) {
 const perms = res.locals.userPerms || req.session?.perms || [];
 if (perms.includes('*')) return { ok: true, allCashiers: true };
 if (perms.some((p) => /billing\.read/.test(String(p)))) return { ok: true, allCashiers: true };
 if (perms.some((p) => /cashier\.read/.test(String(p)))) {
  return { ok: true, allCashiers: false, paidBy: parseInt(String(req.session.userId || 0), 10) || 0 };
 }
 return { ok: false };
}

// CASHIER: till ledger (opening · debit · credit · closing per transaction)
app.get('/cashier/ledger', requireAuth, requirePerm('cashier.read', 'cashier.write', 'billing.read', 'financials.read'), async (req, res) => {
 try {
  const access = cashierBatchPrintAccess(req, res);
  if (!access.ok) {
   return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.access_denied', { defaultValue: 'Access denied' })));
  }
  const { ensureCashierTxnSchema } = require('./lib/ensureCashierTxnSchema');
  await ensureCashierTxnSchema(pool).catch(() => {});
  const { buildCashierLedgerReport } = require('./lib/cashierLedgerReport');
  const { todayIso } = require('./lib/cashierEodReconciliation');
  const date = String(req.query.date || '').trim() || todayIso();
  const facilityId = parseInt(req.session?.facilityId, 10) || 1;
  const report = await buildCashierLedgerReport(pool, {
   date,
   facilityId,
   cashierCode: req.query.cashier_code,
   paymentMethod: req.query.payment_method,
  });
  res.render('cashier-ledger', {
   title: pageTitle(res, 'cashier.ledger.title', 'Cashier till ledger', { ns: 'clinical' }),
   report,
   filters: {
    date,
    cashier_code: String(req.query.cashier_code || '').trim(),
    payment_method: String(req.query.payment_method || '').trim(),
   },
   flash: req.query.msg || null,
  });
 } catch (err) {
  console.error('cashier ledger:', err.message);
  res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.page_load_error', { defaultValue: 'Could not load ledger.' })));
 }
});

// CASHIER: end-of-day reconciliation
app.get('/cashier/eod-reconciliation', requireAuth, requirePerm('cashier.read', 'cashier.write', 'billing.read', 'financials.read'), async (req, res) => {
 try {
  const access = cashierBatchPrintAccess(req, res);
  if (!access.ok) {
   return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.access_denied', { defaultValue: 'Access denied' })));
  }
  const { ensureCashierEodSchema } = require('./lib/ensureCashierEodSchema');
  await ensureCashierEodSchema(pool).catch(() => {});
  const { buildCashierEodReport, todayIso } = require('./lib/cashierEodReconciliation');
  const date = String(req.query.date || '').trim() || todayIso();
  const facilityId = parseInt(req.session?.facilityId, 10) || 1;
  const report = await buildCashierEodReport(pool, {
   date,
   facilityId,
   allCashiers: access.allCashiers,
   paidBy: access.paidBy,
  });
  res.render('cashier-eod-reconciliation', {
   title: pageTitle(res, 'cashier.eod.title', 'End of day reconciliation', { ns: 'clinical' }),
   report,
   flash: req.query.msg || null,
   error: req.query.err || null,
  });
 } catch (err) {
  console.error('cashier eod-reconciliation:', err.message);
  res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.page_load_error', { defaultValue: 'Could not load reconciliation.' })));
 }
});

app.post('/cashier/eod-reconciliation', requireAuth, requirePerm('cashier.read', 'cashier.write'), async (req, res) => {
 try {
  const access = cashierBatchPrintAccess(req, res);
  if (!access.ok) {
   return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.access_denied', { defaultValue: 'Access denied' })));
  }
  const { ensureCashierEodSchema } = require('./lib/ensureCashierEodSchema');
  await ensureCashierEodSchema(pool).catch(() => {});
  const { saveCashierEodReconciliation } = require('./lib/cashierEodReconciliation');
  const date = String(req.body.date || req.query.date || '').trim();
  const facilityId = parseInt(req.session?.facilityId, 10) || 1;
  await saveCashierEodReconciliation(pool, {
   date,
   facilityId,
   allCashiers: access.allCashiers,
   paidBy: access.paidBy,
   userId: req.session.userId || req.session.user?.id,
   body: req.body,
  });
  const msg = flashT(res, 'cashier.eod.saved', { ns: 'clinical', defaultValue: 'Reconciliation saved.' });
  const dest = date
   ? `/cashier/eod-reconciliation?date=${encodeURIComponent(date)}&msg=${encodeURIComponent(msg)}`
   : `/cashier/eod-reconciliation?msg=${encodeURIComponent(msg)}`;
  return res.redirect(dest);
 } catch (err) {
  console.error('cashier eod-reconciliation POST:', err.message);
  const date = String(req.body.date || '').trim();
  const qs = date ? `?date=${encodeURIComponent(date)}&err=` : '?err=';
  return res.redirect('/cashier/eod-reconciliation' + qs + encodeURIComponent(err.message || 'Save failed'));
 }
});

app.get('/cashier/eod-reconciliation/print', requireAuth, requirePerm('cashier.read', 'cashier.write', 'billing.read', 'financials.read'), async (req, res) => {
 try {
  const access = cashierBatchPrintAccess(req, res);
  if (!access.ok) {
   return res.status(403).send('Access denied');
  }
  const { ensureCashierEodSchema } = require('./lib/ensureCashierEodSchema');
  await ensureCashierEodSchema(pool).catch(() => {});
  const { buildCashierEodReport, todayIso } = require('./lib/cashierEodReconciliation');
  const date = String(req.query.date || '').trim() || todayIso();
  const facilityId = parseInt(req.session?.facilityId, 10) || 1;
  const report = await buildCashierEodReport(pool, {
   date,
   facilityId,
   allCashiers: access.allCashiers,
   paidBy: access.paidBy,
  });
  res.render('cashier-eod-reconciliation-print', {
   title: pageTitle(res, 'cashier.eod.title', 'End of day reconciliation', { ns: 'clinical' }),
   report,
   facilityName: hmsBrand.facilityName,
  });
 } catch (err) {
  console.error('cashier eod-reconciliation print:', err.message);
  res.status(500).send(err.message || 'Print failed');
 }
});

app.get('/api/cashier/batch-print', requireAuth, async (req, res) => {
 try {
  const access = cashierBatchPrintAccess(req, res);
  if (!access.ok) {
   return res.status(403).json({ success: false, message: 'Cashier or billing read permission required.' });
  }
  const { buildCashierBatchPrintPayload } = require('./lib/cashierBatchPrint');
  const data = await buildCashierBatchPrintPayload(pool, {
   period: req.query.period || 'day',
   date: req.query.date || '',
   format: req.query.format || 'slip',
   allCashiers: access.allCashiers,
   paidBy: access.paidBy,
   facilityName: hmsBrand.facilityName,
  });
  return res.json({ success: true, data });
 } catch (err) {
  console.error('cashier batch-print api:', err.message);
  return res.status(500).json({ success: false, message: err.message || 'Batch print failed' });
 }
});

// CASHIER: daily cumulative transactions summary (by service category)
app.get('/cashier/daily-summary', requireAuth, requirePerm('cashier.read', 'cashier.write', 'billing.read', 'financials.read'), async (req, res) => {
 try {
  const access = cashierBatchPrintAccess(req, res);
  if (!access.ok) {
   return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.access_denied', { defaultValue: 'Access denied' })));
  }
  const { buildCashierDailySummary } = require('./lib/cashierDailySummary');
  const report = await buildCashierDailySummary(pool, {
   period: req.query.period || 'day',
   date: req.query.date || '',
   allCashiers: access.allCashiers,
   paidBy: access.paidBy,
  });
  res.render('cashier-daily-summary', {
   title: pageTitle(res, 'cashier.daily_summary.title', 'Daily transactions summary', { ns: 'clinical' }),
   report,
   facilityName: hmsBrand.facilityName,
  });
 } catch (err) {
  console.error('cashier daily-summary:', err.message);
  res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.page_load_error', { defaultValue: 'Could not load report.' })));
 }
});

app.get('/cashier/daily-summary/print', requireAuth, requirePerm('cashier.read', 'cashier.write', 'billing.read', 'financials.read'), async (req, res) => {
 try {
  const access = cashierBatchPrintAccess(req, res);
  if (!access.ok) {
   return res.status(403).send('Access denied');
  }
  const { buildCashierDailySummary } = require('./lib/cashierDailySummary');
  const report = await buildCashierDailySummary(pool, {
   period: req.query.period || 'day',
   date: req.query.date || '',
   allCashiers: access.allCashiers,
   paidBy: access.paidBy,
  });
  res.render('cashier-daily-summary-print', {
   title: pageTitle(res, 'cashier.daily_summary.title', 'Daily transactions summary', { ns: 'clinical' }),
   report,
   facilityName: hmsBrand.facilityName,
  });
 } catch (err) {
  console.error('cashier daily-summary print:', err.message);
  res.status(500).send(err.message || 'Print failed');
 }
});

app.get('/api/cashier/daily-summary', requireAuth, requirePerm('cashier.read', 'cashier.write', 'billing.read', 'financials.read'), async (req, res) => {
 try {
  const access = cashierBatchPrintAccess(req, res);
  if (!access.ok) {
   return res.status(403).json({ ok: false, error: 'Access denied' });
  }
  const { buildCashierDailySummary } = require('./lib/cashierDailySummary');
  const report = await buildCashierDailySummary(pool, {
   period: req.query.period || 'day',
   date: req.query.date || '',
   allCashiers: access.allCashiers,
   paidBy: access.paidBy,
  });
  return res.json({ ok: true, report });
 } catch (err) {
  console.error('cashier daily-summary api:', err.message);
  return res.status(500).json({ ok: false, error: err.message || 'Report failed' });
 }
});

// CASHIER: ISSUE TICKET (legacy simple flow === Æ’ ===   kept for backwards compat)
app.post('/cashier/issue-ticket', requireAuth, async (req, res) => {
 let { patient_id, service_id, amount } = req.body;
 if (!patient_id || !service_id) {
 return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.missing_patient_or_service')))
 }
 try {
 const [services] = await pool.query('SELECT * FROM tbl_service_catalog WHERE id = ? LIMIT 1', [service_id]);
 const cat = services.length > 0 ? services[0] : { name: 'Medical Service' };
 const serviceName = cat.name || 'Medical Service';
 const lineKind = effectivePrepayServiceType(cat, 'service');
 const ticket_code = await allocateUniquePaymentCode(pool, lineKind);
 const lines = [{ kind: lineKind, description: serviceName, unit_price: parseFloat(amount || 0), quantity: 1, catalog_id: service_id }];
 const fid = req.session.facilityId || 1;
 const uid = req.session.userId || 1;
 await pool.query(
 "INSERT INTO tbl_payment_ticket (facility_id, ticket_code, patient_id, total_amount, status, lines_json, created_by, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, NOW())",
 [fid, ticket_code, patient_id, amount || 0, JSON.stringify(lines), uid]
 );
 res.redirect('/cashier?msg=' + encodeURIComponent(flashT(res, 'flash.ticket_generated', { code: ticket_code })) + '&print=' + ticket_code);
 } catch (err) {
 console.error('TICKET GENERATION ERROR:', err.message);
 res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.system_error', { message: err.message })));
 }
});

// DETAILED ACCESS CONTROL (PERMISSION MANAGER)
/** Legacy permission UI — redirect to unified Access Control (single grant table). */
app.get('/access-control/manage/:roleId', requireAuth, requireAdminOrSuper, (req, res) => {
 const roleId = String(req.params.roleId || '');
 const q = roleId ? `?role=${encodeURIComponent(roleId)}#section-modules` : '';
 return res.redirect(301, '/hms-admin/access' + q);
});

// API: PATIENT SEARCH (FOR MODALS)
app.get('/api/patients/search', requireAuth, async (req, res) => {
 const q = String(req.query.q || req.query.term || '').trim();
 try {
 if (!q) return res.json([]);
 const like = `%${q}%`;
 const [rows] = await pool.query(
  `SELECT id, first_name, last_name, phone, patient_code
     FROM tbl_patient
    WHERE status = 1
      AND (
        first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?
        OR patient_code LIKE ? OR CAST(id AS CHAR) LIKE ?
        OR CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')) LIKE ?
      )
    ORDER BY last_name, first_name
    LIMIT 25`,
  [like, like, like, like, like, like]
 );
 res.json(rows);
 } catch (err) {
 console.error('Search error:', err.message);
 res.status(500).json({ error: err.message });
 }
});

// CASHIER: ISSUE TICKET
app.post('/cashier/issue-ticket', requireAuth, async (req, res) => {
 let { patient_id, service_id, amount } = req.body;
 
 // Safety: Ensure we have data
 if (!patient_id || !service_id) {
 return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.missing_patient_or_service')))
 }

 try {
 // Get Service Info for lines_json
 const [services] = await pool.query('SELECT * FROM tbl_service_catalog WHERE id = ? LIMIT 1', [service_id]);
 const cat = services.length > 0 ? services[0] : { name: 'Medical Service' };
 const serviceName = cat.name || 'Medical Service';
 const lineKind = effectivePrepayServiceType(cat, 'service');
 const ticket_code = await allocateUniquePaymentCode(pool, lineKind);

 const lines = [{
 kind: lineKind,
 description: serviceName,
 unit_price: parseFloat(amount || 0),
 quantity: 1.0,
 catalog_id: service_id,
 paid: false
 }];

 const fid = req.session.facilityId || 1;
 const uid = req.session.userId || 1;

 await pool.query(
 'INSERT INTO tbl_payment_ticket (facility_id, ticket_code, patient_id, total_amount, status, lines_json, created_by, created_at) VALUES (?, ?, ?, ?, "pending", ?, ?, NOW())',
 [fid, ticket_code, patient_id, amount || 0, JSON.stringify(lines), uid]
 );
 
 res.redirect('/cashier?msg=' + encodeURIComponent(flashT(res, 'flash.ticket_generated', { code: ticket_code })) + '&print=' + ticket_code);
 } catch (err) {
 console.error('TICKET GENERATION ERROR:', err.message);
 res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.system_error', { message: err.message })));
 }
});

// CASHIER: SETTLE TICKET (CONFIRMATION VIEW)
app.get('/cashier/settle/:id', requireAuth, async (req, res) => {
 try {
 // Defensive query: some deployments don't have `insurance_company` on
 // tbl_patient (newer schema uses tbl_patient_insurance). Try the rich
 // query first, fall back to a portable one without that column.
 let rows;
 try {
  const [r] = await pool.query(
 `SELECT t.*, p.first_name, p.last_name, p.phone, p.patient_code, p.insurance_company,
 COALESCE(w.balance,0) AS wallet_balance, w.id AS wallet_id, w.status AS wallet_status
 FROM tbl_payment_ticket t
 JOIN tbl_patient p ON p.id = t.patient_id
 LEFT JOIN tbl_patient_wallet w ON w.patient_id = p.id AND w.status = 'active'
 WHERE t.id = ?`,
 [req.params.id]
 );
  rows = r;
 } catch (e1) {
  console.warn('SETTLE LOAD (rich query failed, falling back):', e1.message);
  const [r] = await pool.query(
   `SELECT t.*, p.first_name, p.last_name, p.phone, p.patient_code,
           NULL AS insurance_company,
           COALESCE(w.balance,0) AS wallet_balance, w.id AS wallet_id, w.status AS wallet_status
    FROM tbl_payment_ticket t
    JOIN tbl_patient p ON p.id = t.patient_id
    LEFT JOIN tbl_patient_wallet w ON w.patient_id = p.id AND w.status = 'active'
    WHERE t.id = ?`,
   [req.params.id]
  );
  rows = r;
 }
 if (rows.length === 0) return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.ticket_not_found')))
 const ticket = rows[0];
  ticket.lines = JSON.parse(ticket.lines_json || '[]');
  // Compute insurance breakdown (display-only; collect route will enforce)
  const today = new Date().toISOString().split('T')[0];
  let coveragePct = 0;
  const [insRows] = await pool.query(
   `SELECT insurer_covered_percent
    FROM tbl_patient_insurance
    WHERE patient_id = ? AND is_primary = 1
    AND (effective_from IS NULL OR effective_from <= ?)
    AND (effective_to IS NULL OR effective_to >= ?)
    LIMIT 1`,
   [ticket.patient_id, today, today]
  ).catch(() => [[]]);
  if (insRows && insRows.length > 0) coveragePct = parseInt(insRows[0].insurer_covered_percent || 0) || 0;

  // Determine if ticket already has patient_due values
  const hasDue = Array.isArray(ticket.lines) && ticket.lines.some(ln => ln && ln.patient_due != null);
  let insurerTotal = 0;
  let patientTotal = parseFloat(ticket.total_amount || 0) || 0;
  if (coveragePct > 0) {
   if (hasDue) {
    insurerTotal = ticket.lines.reduce((s, ln) => s + (parseFloat(ln.insurer_amount || 0) || 0), 0);
    patientTotal = ticket.lines.reduce((s, ln) => s + (parseFloat(ln.patient_due || 0) || 0), 0);
   } else {
    // Approximate based on unit_price/quantity when not present
    const baseTotal = ticket.lines.reduce((s, ln) => {
     const qty = parseFloat(ln.quantity || 1) || 1;
     const price = parseFloat(ln.unit_price || ln.amount || 0) || 0;
     return s + (price * qty);
    }, 0);
    insurerTotal = Math.round(baseTotal * coveragePct / 100);
    patientTotal = Math.max(0, baseTotal - insurerTotal);
   }
  }
 const walletBalance = parseFloat(ticket.wallet_balance || 0);

 // Resolve LAB-/RAD-/PHA- codes for any opd_order_item rows referenced by
 // this ticket. We start from item ids on the ticket, walk back to their
 // consultation_id(s), then collect every section code for that
 // consultation — that way external (Ext.) rows excluded from the bill
 // still show up so the patient sees all three codes on the settle page.
 const sectionCodes = { laboratory: null, radiology: null, pharmacy: null };
 try {
  const oiIds = (ticket.lines || [])
   .filter(l => l && l.source_module === 'opd_order_item' && l.source_pk)
   .map(l => parseInt(l.source_pk, 10)).filter(n => Number.isFinite(n) && n > 0);
  let consultIds = [];
  if (oiIds.length) {
   const [oiRows] = await pool.query(
    `SELECT DISTINCT consultation_id FROM tbl_opd_order_item
     WHERE id IN (${oiIds.map(() => '?').join(',')}) AND consultation_id IS NOT NULL`,
    oiIds
   ).catch(() => [[]]);
   consultIds = (oiRows || []).map(r => r.consultation_id).filter(Boolean);
  }
  if (consultIds.length === 0 && ticket.consultation_id) {
   consultIds.push(ticket.consultation_id);
  }
  for (const cid of consultIds) {
   await assignServiceCodesForConsultation(pool, cid).catch(() => {});
  }
  if (consultIds.length) {
   const [codeRows] = await pool.query(
    `SELECT DISTINCT item_type, service_code FROM tbl_opd_order_item
     WHERE consultation_id IN (${consultIds.map(() => '?').join(',')}) AND service_code IS NOT NULL`,
    consultIds
   ).catch(() => [[]]);
   for (const r of codeRows || []) {
    if (sectionCodes.hasOwnProperty(r.item_type)) sectionCodes[r.item_type] = r.service_code;
   }
  }
  if (!sectionCodes.laboratory && !sectionCodes.radiology && !sectionCodes.pharmacy && oiIds.length) {
   // last-resort direct lookup by item id
   const [codeRows] = await pool.query(
    `SELECT DISTINCT item_type, service_code FROM tbl_opd_order_item
     WHERE id IN (${oiIds.map(() => '?').join(',')}) AND service_code IS NOT NULL`,
    oiIds
   ).catch(() => [[]]);
   for (const r of codeRows || []) {
    if (sectionCodes.hasOwnProperty(r.item_type)) sectionCodes[r.item_type] = r.service_code;
   }
  }
 } catch (e) { /* don't fail settle just because codes lookup failed */ }

 const betterPayUrl = await betterPayQr.buildFromTicket(pool, ticket);
 const betterPayConfigured = await betterPayQr.isBetterPayConfigured(pool);
 res.render('cashier-settle', {
 title: pageTitle(res, 'document_titles.settle_payment', 'Settle Payment — {{code}}', { code: ticket.ticket_code }),
 ticket,
 walletBalance,
   walletId: ticket.wallet_id || null,
   insurance: {
    coveragePct,
    insurerTotal,
    patientTotal,
    hasDue
   },
   sectionCodes,
   betterPayUrl,
   betterPayConfigured,
 });
 } catch (err) {
 console.error('SETTLE LOAD:', err && err.stack ? err.stack : err);
 const msg = (err && err.message) ? err.message : String(err);
 renderAppError(res, 500, 'page.cashier_ticket_load', 'Could not load ticket.', { id: req.params.id, detail: msg });
 }
});

// CASHIER: COLLECT PAYMENT (with Wallet deduction support)
app.post('/cashier/collect', requireAuth, async (req, res) => {
 const { ticket_id } = req.body;
 const payment_method = betterPayQr.normalizePaymentMethod(req.body.payment_method);
 const conn = await pool.getConnection();
 let committed = false;
 try {
 // Load ticket
 const [[ticket]] = await conn.query(
 'SELECT * FROM tbl_payment_ticket WHERE id = ? AND status = \'pending\' LIMIT 1',
 [ticket_id]
 );
 if (!ticket) {
 conn.release();
 return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.ticket_not_found_or_paid')))
 }
  // Apply insurance coverage at collection time (patient pays balance)
  let totalAmount = parseFloat(ticket.total_amount || 0);
  let lines = [];
  try { lines = JSON.parse(ticket.lines_json || '[]'); } catch (e) { lines = []; }

  const today = new Date().toISOString().split('T')[0];
  let coveragePct = 0;
  const [insRows] = await conn.query(
   `SELECT insurer_covered_percent
    FROM tbl_patient_insurance
    WHERE patient_id = ? AND is_primary = 1
    AND (effective_from IS NULL OR effective_from <= ?)
    AND (effective_to IS NULL OR effective_to >= ?)
    LIMIT 1`,
   [ticket.patient_id, today, today]
  ).catch(() => [[]]);
  if (insRows && insRows.length > 0) coveragePct = parseInt(insRows[0].insurer_covered_percent || 0) || 0;

  if (coveragePct > 0 && Array.isArray(lines) && lines.length > 0) {
   const alreadyComputed = lines.some(ln => ln && ln.patient_due != null);
   if (!alreadyComputed) {
    lines = lines.map(ln => {
     const qty = parseFloat(ln.quantity || 1) || 1;
     const price = parseFloat(ln.unit_price || ln.amount || 0) || 0;
     const base = price * qty;
     const insurer = Math.round(base * coveragePct / 100);
     const patient = Math.max(0, base - insurer);
     return {
      ...ln,
      coverage_pct: coveragePct,
      insurer_amount: insurer,
      patient_due: patient
     };
    });
   }
   totalAmount = lines.reduce((s, ln) => s + (parseFloat(ln.patient_due || 0) || 0), 0);

   // Persist the recalculated patient balance onto the ticket
   await conn.query(
    'UPDATE tbl_payment_ticket SET total_amount=?, lines_json=? WHERE id=?',
    [totalAmount, JSON.stringify(lines), ticket_id]
   ).catch(() => {});
  }

 const userId = req.session.userId || req.session.user?.id || null;
 const facilityId = req.session.facilityId || 1;

 if (pool.driver === 'postgres') {
  const { ensurePostgresReceiptInvoiceSeq } = require('./lib/receiptNumber');
  await ensurePostgresReceiptInvoiceSeq(pool);
 }

 await conn.beginTransaction();
 const receipt_no = await nextReceiptNumber(conn, facilityId);
 const invoice_no = await nextInvoiceNumber(conn, facilityId);

 //  -  Æ’ ============================== Æ’ === ¬ WALLET PAYMENT === Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ === ¬
 if (payment_method === 'Wallet') {
 const [[wallet]] = await conn.query(
 `SELECT id, balance FROM tbl_patient_wallet
 WHERE patient_id = ? AND status = 'active'
 FOR UPDATE`,
 [ticket.patient_id]
 );
 if (!wallet) {
 await conn.rollback(); conn.release();
 return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.no_wallet_account')))
 }
 const walletBal = parseFloat(wallet.balance);
 if (walletBal < totalAmount) {
 await conn.rollback(); conn.release();
 return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.not_enough_funds_please_topup')))
 }
 const newBal = walletBal - totalAmount;
 await conn.query('UPDATE tbl_patient_wallet SET balance = ? WHERE id = ?', [newBal, wallet.id]);
 await conn.query(
 `INSERT INTO tbl_patient_wallet_txn
 (wallet_id, txn_type, direction, amount, balance_after, reference_id, notes, created_by)
 VALUES (?, 'deduct_cashier', 'dr', ?, ?, ?, ?, ?)`,
 [wallet.id, totalAmount, newBal, String(ticket_id),
 'Payment ticket ' + (ticket.ticket_code || ticket_id), userId]
 );
 }

 //  -  Æ’ ============================== Æ’ === ¬ MARK TICKET PAID === Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ === ¬
 await conn.query(
 'UPDATE tbl_payment_ticket SET status = \'paid\', paid_at = NOW(), paid_by = ? WHERE id = ?',
 [userId, ticket_id]
 );

 //  -  Æ’ ============================== Æ’ === ¬ BILLING DOCUMENT === Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ === ¬
 const [result] = await conn.query(
 `INSERT INTO tbl_billing_document
 (facility_id, patient_id, doc_type, doc_number, invoice_doc_number, total_amount, payment_method,
 status, source_module, source_pk, created_by, created_at)
 SELECT ?, patient_id, 'receipt', ?, ?, total_amount, ?, 'paid',
 'payment_ticket', id, ?, NOW()
 FROM tbl_payment_ticket WHERE id = ?`,
 [facilityId, receipt_no, invoice_no, payment_method, userId, ticket_id]
 );

 const billingDocId = result.insertId;
 await conn.commit();
 committed = true;
 conn.release();

 // #region agent log
 fetch('http://127.0.0.1:7824/ingest/7799ec2f-1013-4dae-a65a-dcfd2e3f62ad',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'968473'},body:JSON.stringify({sessionId:'968473',location:'app.js:collect-post-commit',message:'payment committed',data:{ticketId:ticket_id,driver:pool.driver||null,billingDocId},timestamp:Date.now(),hypothesisId:'D',runId:'post-fix'})}).catch(()=>{});
 // #endregion

 const { runCashierCollectSideEffects } = require('./lib/cashierCollectSideEffects');
 await runCashierCollectSideEffects(pool, {
  ticket,
  ticketId: ticket_id,
  userId,
  facilityId,
  totalAmount,
  paymentMethod: payment_method,
  receiptNo: receipt_no,
  billingDocId,
  lines,
 });

 if (payment_method === 'Wallet') {
  res.redirect('/cashier/print-ticket/' + encodeURIComponent(ticket.ticket_code));
 } else {
  res.redirect('/cashier?msg=' + encodeURIComponent(flashT(res, 'flash.payment_collected', { receipt: receipt_no, invoice: invoice_no })) + '&print_receipt=' + billingDocId);
 }
 } catch (err) {
 if (!committed) {
  await conn.rollback().catch(() => {});
  conn.release();
 }
 console.error('COLLECT ERR:', err);
 res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.collection_failed', { message: err.message })));
 }
});

// CASHIER: PRINT RECEIPT
app.get('/cashier/print-receipt/:id', requireAuth, async (req, res) => {
 try {
 const [rows] = await pool.query(
 'SELECT d.*, p.first_name, p.last_name FROM tbl_billing_document d JOIN tbl_patient p ON p.id = d.patient_id WHERE d.id = ?',
 [req.params.id]
 );
 if (rows.length === 0) return res.status(404).send('Receipt not found.');
 const { enrichBillingReceiptForPrint, amountWordsForPrint } = require('./lib/billingReceiptPrint');
 const receipt = await enrichBillingReceiptForPrint(pool, rows[0]);

 let ipdDetails = null;
 if (String(receipt.source_module || '') === 'ipd_settlement' && receipt.source_pk) {
  const aid = parseInt(receipt.source_pk) || 0;
  if (aid > 0) {
   const [[adm]] = await pool.query(
    'SELECT id, deposit_amount, ipd_payment_code, ipd_refund_method FROM tbl_admission WHERE id=? LIMIT 1',
    [aid]
   ).catch(() => [[null]]);
   const [[sum]] = await pool.query(
    'SELECT COALESCE(SUM(amount),0) AS total_charges FROM tbl_ipd_charge WHERE admission_id=?',
    [aid]
   ).catch(() => [[{ total_charges: 0 }]]);
   const total = parseFloat(sum?.total_charges || 0) || 0;
   const deposit = parseFloat(adm?.deposit_amount || 0) || 0;
   const balance = Math.max(0, total - deposit);
   const refund = Math.max(0, deposit - total);
   ipdDetails = { admission_id: aid, total, deposit, balance, refund, refund_method: adm?.ipd_refund_method || null, ipd_payment_code: adm?.ipd_payment_code || null };
  }
 }

 // Resolve LAB-/RAD-/PHA- codes and prescription lines for print.
 let printPayload = {
  paymentCode: null,
  lineItems: [],
  sectionCodes: { laboratory: null, radiology: null, pharmacy: null },
  prescriptionItems: [],
 };
 try {
  printPayload = await resolveBillingDocPrintPayload(pool, receipt);
 } catch (_) { /* ignore */ }

 // For IPD receipts, surface the discharge code as payment code after settlement.
 if (
  ipdDetails &&
  ipdDetails.ipd_payment_code &&
  String(receipt.status || '').trim().toLowerCase() === 'paid'
 ) {
  printPayload.paymentCode = ipdDetails.ipd_payment_code;
  printPayload.paymentSettled = true;
 }

 const { paymentCode, lineItems, sectionCodes, prescriptionItems } = printPayload;

 const grandPaid = ipdDetails
  ? Number(ipdDetails.balance || 0)
  : Number(receipt.total_amount || 0);
 const amountWords = amountWordsForPrint(grandPaid);

 res.render('print-receipt', { 
 title: pageTitle(res, 'document_titles.fiscal_receipt', 'Fiscal Receipt — {{num}}', { num: receipt.doc_number }),
 layout: false,
 pageData: {
  receipt,
  ipdDetails,
  sectionCodes,
  prescriptionItems,
  paymentCode: printPayload.paymentSettled ? paymentCode : null,
  paymentSettled: !!printPayload.paymentSettled,
  lineItems,
  amountWords,
  grandPaid,
 },
 });
 } catch (err) {
 console.error(err);
 res.status(500).send('Print error.');
 }
});

// CASHIER: PRINT RECEIPT (classic format, no VAT)
app.get('/cashier/print-receipt-classic/:id', requireAuth, async (req, res) => {
 try {
  const [rows] = await pool.query(
   'SELECT d.*, p.first_name, p.last_name FROM tbl_billing_document d JOIN tbl_patient p ON p.id = d.patient_id WHERE d.id = ?',
   [req.params.id]
  );
  if (!rows.length) return res.status(404).send('Receipt not found.');
  const { enrichBillingReceiptForPrint, amountWordsForPrint } = require('./lib/billingReceiptPrint');
  const receipt = await enrichBillingReceiptForPrint(pool, rows[0]);

  let printPayload = {
   paymentCode: null,
   lineItems: [],
   sectionCodes: { laboratory: null, radiology: null, pharmacy: null },
   prescriptionItems: [],
  };
  try {
   printPayload = await resolveBillingDocPrintPayload(pool, receipt);
  } catch (_) {}

  const grandPaid = Number(receipt.total_amount || 0) || 0;
  res.render('print-receipt-classic', {
   title: pageTitle(res, 'document_titles.receipt', 'Receipt — {{num}}', { num: receipt.doc_number }),
   layout: false,
   pageData: {
    receipt,
    paymentCode: printPayload.paymentSettled ? printPayload.paymentCode : null,
    paymentSettled: !!printPayload.paymentSettled,
    lineItems: printPayload.lineItems,
    sectionCodes: printPayload.sectionCodes,
    prescriptionItems: printPayload.prescriptionItems,
    grandPaid,
    amountWords: amountWordsForPrint(grandPaid),
   },
  });
 } catch (e) {
  console.error(e);
  return res.status(500).send('Print error.');
 }
});

// CASHIER: PRINT RECEIPT (premium layout, no VAT)
app.get('/cashier/print-receipt-premium/:id', requireAuth, async (req, res) => {
 try {
  const [rows] = await pool.query(
   'SELECT d.*, p.first_name, p.last_name FROM tbl_billing_document d JOIN tbl_patient p ON p.id = d.patient_id WHERE d.id = ?',
   [req.params.id]
  );
  if (!rows.length) return res.status(404).send('Receipt not found.');
  const { enrichBillingReceiptForPrint, amountWordsForPrint } = require('./lib/billingReceiptPrint');
  const receipt = await enrichBillingReceiptForPrint(pool, rows[0]);

  let printPayload = {
   paymentCode: null,
   lineItems: [],
   sectionCodes: { laboratory: null, radiology: null, pharmacy: null },
   prescriptionItems: [],
  };
  try {
   printPayload = await resolveBillingDocPrintPayload(pool, receipt);
  } catch (_) {}

  const subtotal = (printPayload.lineItems || []).reduce((s, it) => s + (Number(it.amount || 0) || 0), 0);
  const grandTotal = subtotal || (Number(receipt.total_amount || 0) || 0);

  return res.render('print-receipt-premium', {
   title: pageTitle(res, 'document_titles.receipt', 'Receipt — {{num}}', { num: receipt.doc_number }),
   layout: false,
   pageData: {
    receipt,
    paymentCode: printPayload.paymentSettled ? printPayload.paymentCode : null,
    paymentSettled: !!printPayload.paymentSettled,
    lineItems: printPayload.lineItems,
    sectionCodes: printPayload.sectionCodes,
    prescriptionItems: printPayload.prescriptionItems,
    subtotal,
    grandTotal,
    amountWords: amountWordsForPrint(grandTotal),
   },
  });
 } catch (e) {
  console.error(e);
  return res.status(500).send('Print error.');
 }
});

// CASHIER: PRINT INVOICE (VAT optional)
app.get('/cashier/print-invoice/:id', requireAuth, async (req, res) => {
 try {
  const [rows] = await pool.query(
   'SELECT d.*, p.first_name, p.last_name FROM tbl_billing_document d JOIN tbl_patient p ON p.id = d.patient_id WHERE d.id = ?',
   [req.params.id]
  );
  if (!rows.length) return res.status(404).send('Invoice not found.');
  let doc = rows[0];

  if (!doc.invoice_doc_number || !String(doc.invoice_doc_number).trim()) {
   const inv = await nextInvoiceNumber(pool, doc.facility_id || 1);
   await pool.query(
    'UPDATE tbl_billing_document SET invoice_doc_number=? WHERE id=? AND (invoice_doc_number IS NULL OR TRIM(COALESCE(invoice_doc_number,""))="")',
    [inv, doc.id]
   ).catch(() => {});
   const [[d2]] = await pool.query(
    'SELECT d.*, p.first_name, p.last_name FROM tbl_billing_document d JOIN tbl_patient p ON p.id = d.patient_id WHERE d.id = ?',
    [req.params.id]
   ).catch(() => [[null]]);
   if (d2) doc = d2;
  }

  // Lines + prescription codes from linked payment ticket
  let printPayload = {
   paymentCode: null,
   lineItems: [],
   sectionCodes: { laboratory: null, radiology: null, pharmacy: null },
   prescriptionItems: [],
  };
  try {
   printPayload = await resolveBillingDocPrintPayload(pool, doc);
  } catch (_) {}

  const { paymentCode, lineItems, sectionCodes, prescriptionItems } = printPayload;
  const subtotal = lineItems.reduce((s, it) => s + (Number(it.amount || 0) || 0), 0);
  const vatEnabled = String(req.query.vat || '').trim() === '1' || String(req.query.vat || '').trim().toLowerCase() === 'true';
  const rate = req.query.vat_rate ? parseFloat(req.query.vat_rate) : 19.25;
  const vatRate = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 19.25;
  const vatAmount = vatEnabled ? Math.round(subtotal * (vatRate / 100)) : 0;
  const grandTotal = subtotal + vatAmount;
  const vatRateLabel = `${vatRate}%`;

  res.render('print-invoice', {
   title: pageTitle(res, 'document_titles.invoice', 'Invoice — {{num}}', { num: doc.invoice_doc_number || doc.doc_number }),
   layout: false,
   pageData: {
    doc,
    paymentCode: printPayload.paymentSettled ? paymentCode : null,
    paymentSettled: !!printPayload.paymentSettled,
    lineItems,
    sectionCodes,
    prescriptionItems,
    subtotal,
    vatEnabled,
    vatRateLabel,
    vatAmount,
    grandTotal,
   },
  });
 } catch (e) {
  console.error(e);
  return res.status(500).send('Print error.');
 }
});

// Resolve billing document id by ticket code (paid tickets only)
async function _billingDocIdForTicketCode(code) {
 const c = String(code || '').trim();
 if (!c) return null;
 const [[tk]] = await pool.query('SELECT id FROM tbl_payment_ticket WHERE ticket_code=? LIMIT 1', [c]).catch(() => [[null]]);
 const tid = tk && tk.id ? parseInt(tk.id, 10) || 0 : 0;
 if (tid < 1) return null;
 const [[doc]] = await pool.query(
  `SELECT id FROM tbl_billing_document
    WHERE source_module='payment_ticket' AND source_pk=?
    ORDER BY id DESC LIMIT 1`,
  [tid]
 ).catch(() => [[null]]);
 return doc && doc.id ? parseInt(doc.id, 10) || null : null;
}

/**
 * Paid cashier ticket without tbl_billing_document: allocate RCT + INV and insert.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} ticketCode
 * @param {number|null} userId
 * @returns {Promise<number|null>}
 */
async function _ensureBillingDocumentForPaidTicket(conn, ticketCode, userId) {
 const c = String(ticketCode || '').trim();
 if (!c) return null;
 const [[t]] = await conn.query(
  `SELECT id, facility_id, patient_id, total_amount, payment_method, status
   FROM tbl_payment_ticket WHERE ticket_code=? LIMIT 1`,
  [c]
 ).catch(() => [[null]]);
 if (!t || !t.id || String(t.status || '').toLowerCase() !== 'paid') return null;
 const tid = parseInt(t.id, 10) || 0;
 const [[existing]] = await conn.query(
  `SELECT id FROM tbl_billing_document WHERE source_module='payment_ticket' AND source_pk=? LIMIT 1`,
  [tid]
 ).catch(() => [[null]]);
 if (existing && existing.id) return parseInt(existing.id, 10) || null;
 const fid = parseInt(String(t.facility_id || 1), 10) || 1;
 const receiptNo = await nextReceiptNumber(conn, fid);
 const invoiceNo = await nextInvoiceNumber(conn, fid);
 const [ins] = await conn.query(
  `INSERT INTO tbl_billing_document
   (facility_id, patient_id, doc_type, doc_number, invoice_doc_number, total_amount, payment_method,
    status, source_module, source_pk, created_by, created_at)
   VALUES (?, ?, 'receipt', ?, ?, ?, ?, 'paid', 'payment_ticket', ?, ?, NOW())`,
  [fid, t.patient_id, receiptNo, invoiceNo, t.total_amount, t.payment_method || 'Cash', tid, userId]
 );
 const nid = ins && ins.insertId ? parseInt(String(ins.insertId), 10) : 0;
 return nid > 0 ? nid : null;
}

app.get('/cashier/print-receipt-classic-by-code/:code', requireAuth, async (req, res) => {
 let id = await _billingDocIdForTicketCode(req.params.code);
 if (id) return res.redirect('/cashier/print-receipt-premium/' + id);

 const uid = req.session.userId || req.session.user?.id || null;
 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();
  id = await _ensureBillingDocumentForPaidTicket(conn, req.params.code, uid);
  await conn.commit();
  conn.release();
  if (id) return res.redirect('/cashier/print-receipt-premium/' + id);
  return res.status(404).send('Receipt not found for this ticket.');
 } catch (e) {
  await conn.rollback().catch(() => {});
  conn.release();
  console.error(e);
  return res.status(500).send('Print error.');
 }
});

app.get('/cashier/print-invoice-by-code/:code', requireAuth, async (req, res) => {
 const qs = new URLSearchParams(req.query).toString();
 let id = await _billingDocIdForTicketCode(req.params.code);
 if (id) {
  return res.redirect('/cashier/print-invoice/' + id + (qs ? '?' + qs : ''));
 }

 const uid = req.session.userId || req.session.user?.id || null;
 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();
  id = await _ensureBillingDocumentForPaidTicket(conn, req.params.code, uid);
  await conn.commit();
  conn.release();
  if (id) {
   return res.redirect('/cashier/print-invoice/' + id + (qs ? '?' + qs : ''));
  }
  return res.status(404).send('Invoice not found for this ticket.');
 } catch (e) {
  await conn.rollback().catch(() => {});
  conn.release();
  console.error(e);
  return res.status(500).send('Print error.');
 }
});

// CASHIER: PRINT TICKET VIEW
app.get('/cashier/print-ticket/:code', requireAuth, async (req, res) => {
 try {
 const [rows] = await pool.query(
 'SELECT t.*, p.first_name, p.last_name, p.phone FROM tbl_payment_ticket t JOIN tbl_patient p ON p.id = t.patient_id WHERE t.ticket_code = ?',
 [req.params.code]
 );
 if (rows.length === 0) return res.status(404).send('Ticket not found.');
 
 const ticket = rows[0];
 ticket.lines = JSON.parse(ticket.lines_json || '[]');

 // Backward-compatible: old IPD settlement tickets only had a single ipd_settlement line.
 // For printing, enrich with refund/deposit breakdown from admission so historical slips show reimbursements.
 try {
  const hasIpdBreakdown = (ticket.lines || []).some(l => l && String(l.kind || '').startsWith('ipd_') && l.kind !== 'ipd_settlement');
  const settleLine = (ticket.lines || []).find(l => l && l.kind === 'ipd_settlement');
  const aid = parseInt(settleLine?.admission_id || 0) || 0;
  if (!hasIpdBreakdown && aid > 0) {
   const [[adm]] = await pool.query(
    'SELECT id, deposit_amount FROM tbl_admission WHERE id=? LIMIT 1',
    [aid]
   ).catch(() => [[null]]);
   const [[sum]] = await pool.query(
    'SELECT COALESCE(SUM(amount),0) AS total_charges FROM tbl_ipd_charge WHERE admission_id=?',
    [aid]
   ).catch(() => [[{ total_charges: 0 }]]);
   const total = parseFloat(sum?.total_charges || 0) || 0;
   const deposit = parseFloat(adm?.deposit_amount || 0) || 0;
   const balance = Math.max(0, total - deposit);
   const refund = Math.max(0, deposit - total);
   ticket.lines = [
    { kind: 'ipd_total', description: 'IPD Total Charges', unit_price: total, quantity: 1.0, admission_id: aid },
    { kind: 'ipd_deposit', description: 'Caution / Deposit Paid', unit_price: -deposit, quantity: 1.0, admission_id: aid },
    { kind: 'ipd_balance', description: 'Balance Due (Collected)', unit_price: balance, quantity: 1.0, admission_id: aid, paid: true },
    ...(refund > 0 ? [{ kind: 'ipd_refund', description: 'Deposit Refund (Reimbursed)', unit_price: -refund, quantity: 1.0, admission_id: aid, paid: true }] : [])
   ];
   // Keep total_amount as "collected" (already stored); printing will show refund separately.
  }
 } catch(e) {}

 const printPayload = await resolveTicketPrintPayload(pool, ticket).catch(() => ({
  paymentSettled: false,
  paymentCode: null,
  lineItems: [],
  sectionCodes: { laboratory: null, radiology: null, pharmacy: null },
  prescriptionItems: [],
 }));

 res.render('print-ticket', { 
 title: pageTitle(res, 'document_titles.print_ticket', 'Print Ticket — {{code}}', { code: ticket.ticket_code }),
 layout: false,
 pageData: {
  ticket,
  facilityName: hmsBrand.facilityName,
  title: pageTitle(res, 'document_titles.print_ticket', 'Print Ticket — {{code}}', { code: ticket.ticket_code }),
  ...printPayload,
 },
 });
 } catch (err) {
 console.error(err);
 res.status(500).send('Print error.');
 }
});

// CASHIER: LOOKUP TICKET
app.post('/cashier/lookup', requireAuth, async (req, res) => {
 const { code } = req.body;
 const emptyKpi = { today_revenue: 0, pending_count: 0, today_count: 0, today_wallet: 0 };
 const defaultPaymentMethods = betterPayQr.CASHIER_PAYMENT_METHODS;
 try {
 const [rows] = await pool.query(
  'SELECT t.*, p.first_name, p.last_name FROM tbl_payment_ticket t JOIN tbl_patient p ON p.id = t.patient_id WHERE t.ticket_code = ? LIMIT 1',
 [code]
 );

 // Always load history even during lookup to prevent crash
 const [history] = await pool.query(`
 SELECT t.*, p.first_name, p.last_name
 FROM tbl_payment_ticket t
 JOIN tbl_patient p ON p.id = t.patient_id
 ORDER BY t.id DESC LIMIT 50
 `);

 const histArr = Array.isArray(history) ? history : [];
 const histLen = histArr.length;

 const basePageData = {
  history: histArr,
  hist_q: '',
  historyPager: pagination.metaFromTotal(histLen, 1, pagination.DEFAULT_PAGE_SIZE),
  consultCatalog: [],
  labCatalog: [],
  imagingCatalog: [],
  svcCatalog: [],
  maternityCatalog: [],
  surgeryCatalog: [],
  doctors: [],
  paymentMethods: defaultPaymentMethods,
  ipdPending: [],
  codesStatus: [],
  opdPendingGroups: [],
  doctorPrescriptions: [],
  kpi: emptyKpi,
  flash: null,
  error: null,
  userPerms: res.locals.userPerms || [],
 };

 if (rows.length === 0) {
 return res.render('cashier', {
  title: pageTitle(res, 'document_titles.cashier', 'Payment and Billing — ZAIZENS'),
  pageData: Object.assign({}, basePageData, { pending: [], error: 'Ticket not found.' }),
 });
 }

 res.render('cashier', {
  title: pageTitle(res, 'document_titles.cashier', 'Payment and Billing — ZAIZENS'),
  pageData: Object.assign({}, basePageData, { pending: rows, flash: 'Result for ' + code }),
 });
 } catch (err) {
 console.error(err);
 res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.lookup_failed')));
 }
});

/** Visit Registry: mark paid codes that are past validity or have no uses left (blood-red column). */
async function enrichOpdVisitsPaymentCodeValidity(pool, visitRows, facilityId) {
 const fid = Number(facilityId) || 1;
 const list = (visitRows || []).filter(Boolean);
 const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
 };
 const byNorm = new Map();
 for (const v of list) {
  v.payment_code_blood_red = false;
  v.payment_code_alert_title = '';
  v.payment_code_remaining_uses = null;
  v.payment_code_stale_reason = null;
  v.payment_code_max_uses = null;
  v.payment_code_uses_so_far = null;
  v.payment_code_valid_until_display = null;
  v.payment_code_validity_tooltip = '';
  const norm = paymentValidity.normalizePaymentCodeInput(v.payment_code);
  if (!norm) continue;
  if (!byNorm.has(norm)) byNorm.set(norm, []);
  byNorm.get(norm).push(v);
 }
 for (const [norm, visits] of byNorm) {
  let ticket = null;
  try {
   ticket = await paymentValidity.findPaidTicketByNormalizedCode(pool, norm);
  } catch (_) {
   ticket = null;
  }
  const st = String((ticket && ticket.status) || '').trim().toLowerCase();
  if (!ticket || st !== 'paid') continue;

  for (const v of visits) {
   let bloodRed = false;
   let title = '';
   let remainingUses = null;
   let staleReason = null;
   let maxUses = null;
   let usesSoFar = null;
   let validUntilDisplay = null;
   let validityTooltip = '';
   try {
    const qs = String(v.queue_status || '').toLowerCase();
    const excludeVisitId =
     qs !== 'completed' && qs !== 'cancelled' ? parseInt(String(v.id || ''), 10) || 0 : 0;
    const win = await paymentValidity.computePaidTicketValidityWindow(pool, ticket, norm, fid, {
     excludeVisitId,
    });
    const usesTimeValidity = paymentValidity.kindUsesConsultationValidity(win.kind);
    remainingUses = Math.max(0, win.maxUses - win.uses);
    maxUses = win.maxUses;
    usesSoFar = win.uses;
    if (usesTimeValidity) {
     try {
      validUntilDisplay = hmsFormatDate.formatDisplayDate(win.expires);
     } catch (_) {
      validUntilDisplay = paymentValidity.toLocalDateISO(win.expires) || '—';
     }
     const polLabel = paymentValidity.intervalPolicyLabel(win.policy);
     validityTooltip =
      'Payment validity · Days (system ' +
      win.systemDays +
      ', effective ' +
      win.effectiveDays +
      ') + Policy: ' +
      polLabel +
      '. Calendar end.';
     const today = startOfDay(new Date());
     if (today > win.expires) {
      bloodRed = true;
      staleReason = 'expired';
      title = 'Payment code expired on ' + hmsFormatDate.formatDisplayDate(win.expires) + '.';
     }
    }
    if (win.uses >= win.maxUses) {
     bloodRed = true;
     staleReason = 'depleted';
     title = 'No remaining uses (' + win.uses + ' of ' + win.maxUses + ' visit(s)).';
    }
   } catch (_) {
    /* ignore */
   }
   v.payment_code_blood_red = bloodRed;
   v.payment_code_alert_title = title;
   v.payment_code_remaining_uses = remainingUses;
   v.payment_code_stale_reason = staleReason;
   v.payment_code_max_uses = maxUses;
   v.payment_code_uses_so_far = usesSoFar;
   v.payment_code_valid_until_display = validUntilDisplay;
   v.payment_code_validity_tooltip = validityTooltip;
  }
 }
}

/** Only same-origin relative paths (prevents open redirects). */
function safeInternalRedirectPath(s) {
 const t = String(s || '').trim();
 if (!t.startsWith('/') || t.startsWith('//')) return '';
 return t;
}

/** Doctor acknowledges consulting a patient not assigned to them (OPD visit or IPD admission). */
app.post('/clinical/accept-not-assigned', requireAuth, (req, res) => {
 const kind = String(req.body.kind || '').trim().toLowerCase();
 const next = safeInternalRedirectPath(req.body.next) || '/opd-queue';
 if (kind === 'opd') {
  const visitId = parseInt(req.body.visit_id, 10) || 0;
  if (visitId < 1) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_visit')))
  clinicalNad.setBypass(req, 'opd', visitId);
  return res.redirect(next);
 }
 if (kind === 'ipd') {
  const admissionId = parseInt(req.body.admission_id, 10) || 0;
  if (admissionId < 1) return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_admission')))
  clinicalNad.setBypass(req, 'ipd', admissionId);
  return res.redirect(next);
 }
 res.redirect('/dashboard');
});

// OPD QUEUE & VISITS REGISTRY
// VISITS & OPD QUEUE === Æ’ ===   Full legacy-parity
app.get('/opd-queue', requireAuth, requirePerm('opd.read','clinical.read','clinical.write','scheduling.read','nursing.read','lab.read','radiology.read','pharmacy.read'), async (req, res) => {
 const q = (req.query.q || '').trim();
 const today = new Date().toISOString().split('T')[0];
 const d90ago = new Date(Date.now() - 90*24*60*60*1000).toISOString().split('T')[0];
 const dateFrom = req.query.date_from || d90ago;
 const dateTo = req.query.date_to || today;
 const status = req.query.status || 'all';
 const sort = req.query.sort || 'newest';
 const dept = req.query.dept || '';
 const fid = req.session.facilityId || 1;

 try {
 let carryFlash = null;
 try {
  const carryResult = await opdVisitCarryForward.carryForwardYesterdayUnconsulted(pool, fid, today);
  if (carryResult.carried > 0) {
   carryFlash =
    carryResult.carried === 1
     ? '1 patient from yesterday was not consulted and has been returned to today’s queue (queue number renewed — first in line).'
     : `${carryResult.carried} patients from yesterday were not consulted and have been returned to today’s queue (queue numbers renewed — first in line).`;
  }
 } catch (carryErr) {
  console.error('OPD carry-forward:', carryErr.message);
 }

 // 1. Today's active queue (separate query, urgent first)
 const [todayVisits] = await pool.query(`
 SELECT v.*, p.first_name, p.last_name, COALESCE(p.patient_type,'OutPatient') AS patient_type,
 COALESCE(doc.first_name, ${paymentTicketDoctorSubquery.fn}) AS doc_fn,
 COALESCE(doc.last_name, ${paymentTicketDoctorSubquery.ln}) AS doc_ln,
 ${paymentTicketDoctorSubquery.id} AS ticket_doctor_id,
 cr.code AS consultation_room_code, cr.name AS consultation_room_name,
 (SELECT MAX(v3.visit_date) FROM tbl_opd_visit v3
 WHERE v3.patient_id = v.patient_id AND v3.id <> v.id) AS prev_visit_date,
 (SELECT MIN(COALESCE(vs.recorded_at, vs.created_at)) FROM tbl_vital_sign vs WHERE vs.opd_visit_id = v.id) AS vitals_first_at,
 (SELECT MAX(COALESCE(vs.recorded_at, vs.created_at)) FROM tbl_vital_sign vs WHERE vs.opd_visit_id = v.id) AS vitals_last_at
 FROM tbl_opd_visit v
 JOIN tbl_patient p ON p.id = v.patient_id
 LEFT JOIN tbl_employee doc ON doc.id = v.assigned_doctor_id
 LEFT JOIN tbl_consultation_room cr ON cr.id = v.consultation_room_id
 WHERE v.visit_date = ?
   AND COALESCE(v.is_emergency, 0) = 0
   AND v.queue_status NOT IN ('completed','cancelled','clinical_discharged','ipd_pending_admit')
 ORDER BY v.priority = 'urgent' DESC, v.queue_started_at ASC
 LIMIT 24
 `, [today]);

 // Daily arrival sequence (No 1, No 2, …) + anchor time for "waiting for doctor" duration
 if (todayVisits && todayVisits.length) {
  const rankSorted = [...todayVisits].sort((a, b) => {
   const ta = new Date(a.queue_started_at || 0).getTime();
   const tb = new Date(b.queue_started_at || 0).getTime();
   if (ta !== tb) return ta - tb;
   return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  const arrivalNo = {};
  rankSorted.forEach((row, i) => {
   arrivalNo[row.id] = i + 1;
  });
  todayVisits.forEach((v) => {
   v.arrival_no = arrivalNo[v.id] || 0;
   const qs = v.queue_status || '';
   v.wait_start_iso = null;
   if (qs === 'waiting_doctor') {
    const anchor = v.triage_done_at || v.vitals_first_at || v.vitals_last_at || v.queue_started_at;
    if (anchor) {
     const d = anchor instanceof Date ? anchor : new Date(anchor);
     if (!Number.isNaN(d.getTime())) v.wait_start_iso = d.toISOString();
    }
   }
  });
 }

 await enrichOpdVisitsDoctorFromPaymentTicket(pool, todayVisits || []);
 await enrichOpdVisitsRoomContext(pool, todayVisits || []);

 // 2. Build WHERE for registry
 let where  = 'v.facility_id = ? AND COALESCE(v.is_emergency, 0) = 0';
 const params = [fid];

 where += ' AND v.visit_date BETWEEN ? AND ?';
 params.push(dateFrom, dateTo);

 if (q) {
 where += ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR CONCAT(p.first_name," ",p.last_name) LIKE ? OR v.ticket_number LIKE ? OR COALESCE(v.department,"") LIKE ? OR COALESCE(v.chief_complaint,"") LIKE ?)';
 const like = `%${q}%`;
 params.push(like,like,like,like,like,like);
 }
 if (dept) {
 where += ' AND v.department = ?';
 params.push(dept);
 }
 if (status === 'active') {
 where += " AND v.queue_status NOT IN ('completed','cancelled')";
 } else if (status !== 'all') {
 where += ' AND v.queue_status = ?';
 params.push(status);
 }

 const orderSql = sort === 'oldest'
 ? 'v.visit_date ASC,  v.queue_started_at ASC,  v.id ASC'
 : 'v.visit_date DESC, v.queue_started_at DESC, v.id DESC';

 const registryPagerQuery = { q, date_from: dateFrom, date_to: dateTo, status, sort, dept };
 const { page: registryPage, pageSize: registryPageSize, offset: registryOffset } = pagination.parsePage(req);
 const [[registryCountRow]] = await pool.query(
  `SELECT COUNT(DISTINCT v.id) AS total FROM tbl_opd_visit v JOIN tbl_patient p ON p.id = v.patient_id WHERE ${where}`,
  params
 );
 const registryPager = pagination.metaFromTotal(registryCountRow?.total || 0, registryPage, registryPageSize);
 registryPager.basePath = '/opd-queue';
 registryPager.query = registryPagerQuery;
 registryPager.pageParam = 'p';

 // Paginated registry with doctor join + prev_visit_date
 const [allVisits] = await pool.query(`
 SELECT v.*, p.first_name, p.last_name, p.patient_type,
 doc.id AS doc_id,
 COALESCE(
  doc.first_name,
  (SELECT ept.first_name
     FROM tbl_payment_ticket pt
     LEFT JOIN tbl_employee ept ON ept.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(pt.lines_json, '$[0].assigned_doctor_id')) AS UNSIGNED)
    WHERE pt.ticket_code = v.payment_code AND pt.patient_id = v.patient_id
    ORDER BY pt.id DESC
    LIMIT 1)
 ) AS ref_fn,
 COALESCE(
  doc.last_name,
  (SELECT ept.last_name
     FROM tbl_payment_ticket pt
     LEFT JOIN tbl_employee ept ON ept.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(pt.lines_json, '$[0].assigned_doctor_id')) AS UNSIGNED)
    WHERE pt.ticket_code = v.payment_code AND pt.patient_id = v.patient_id
    ORDER BY pt.id DESC
    LIMIT 1)
 ) AS ref_ln,
 (SELECT es.first_name
    FROM tbl_consultation c2
    JOIN tbl_employee es ON es.id = c2.created_by
   WHERE c2.opd_visit_id = v.id
   ORDER BY c2.id DESC
   LIMIT 1) AS seen_fn,
 (SELECT es.last_name
    FROM tbl_consultation c2
    JOIN tbl_employee es ON es.id = c2.created_by
   WHERE c2.opd_visit_id = v.id
   ORDER BY c2.id DESC
   LIMIT 1) AS seen_ln,
 cr.code AS consultation_room_code,
 cr.name AS consultation_room_name,
 (SELECT MAX(v3.visit_date) FROM tbl_opd_visit v3
 WHERE v3.patient_id = v.patient_id AND v3.id <> v.id) AS prev_visit_date,
 (SELECT COUNT(*) FROM tbl_consultation cx WHERE cx.opd_visit_id = v.id) AS consult_count
 FROM tbl_opd_visit v
 JOIN tbl_patient p ON p.id = v.patient_id
 LEFT JOIN tbl_employee doc ON doc.id = v.assigned_doctor_id
 LEFT JOIN tbl_consultation_room cr ON cr.id = v.consultation_room_id
 WHERE ${where}
 ORDER BY ${orderSql}
 LIMIT ? OFFSET ?
 `, [...params, registryPager.pageSize, registryPager.offset]);

 // 5. Modal data (active doctors incl. custom role catalogues, e.g. role 100)
 const hmsDoctorStaff = require('./lib/hmsDoctorStaff');
 const doctors = await hmsDoctorStaff.fetchActiveDoctorsWithClinicalLinks(
  pool,
  'e.id, e.first_name, e.last_name, COALESCE(e.primary_department,"") AS primary_department, COALESCE(e.specialisation,"") AS specialisation'
 ).catch(() => []);
 const [departments] = await pool.query(
 'SELECT department_name FROM tbl_department WHERE status = 1 ORDER BY department_name'
 ).catch(() => [[]]);

 const visitIdsForVitals = []
  .concat((todayVisits || []).map(v => v.id), (allVisits || []).map(v => v.id))
  .filter((id, i, a) => id && a.indexOf(id) === i);
 const visitIdsWithVitals = await fetchVisitIdsWithVitals(pool, visitIdsForVitals);

 await enrichOpdVisitsPaymentCodeValidity(pool, [...(todayVisits || []), ...(allVisits || [])], fid);
 await enrichOpdVisitsDoctorFromPaymentTicket(pool, allVisits || []);
 await enrichOpdVisitsRoomContext(pool, allVisits || []);

 const [consultationRoomsRaw] = await pool.query(
  `SELECT r.id, r.code, r.name, r.department, r.assigned_doctor_id,
          e.first_name AS room_doc_fn, e.last_name AS room_doc_ln
     FROM tbl_consultation_room r
     LEFT JOIN tbl_employee e ON e.id = r.assigned_doctor_id AND e.status = 1
    WHERE r.facility_id = ? AND r.status = 1
    ORDER BY r.sort_order ASC, r.name ASC`,
  [fid]
 ).catch(() => [[]]);
 let consultationRooms = Array.isArray(consultationRoomsRaw) ? consultationRoomsRaw : [];
 const crIds = consultationRooms.map((r) => r.id).filter((id) => id > 0);
 if (crIds.length) {
  const [staffRows] = await pool
   .query(
    `SELECT crd.room_id, e.last_name, e.first_name
       FROM tbl_consultation_room_doctor crd
       JOIN tbl_employee e ON e.id = crd.doctor_id AND e.status = 1
      WHERE crd.room_id IN (?)
      ORDER BY e.last_name, e.first_name`,
    [crIds]
   )
   .catch(() => [[]]);
  const labelMap = new Map();
  for (const row of staffRows || []) {
   const rid = row.room_id;
   const bit = `${String(row.last_name || '').trim()}, ${String(row.first_name || '').trim()}`.trim();
   if (!bit) continue;
   if (!labelMap.has(rid)) labelMap.set(rid, []);
   labelMap.get(rid).push(bit);
  }
  consultationRooms = consultationRooms.map((r) => {
   const extra = (labelMap.get(r.id) || []).join(' · ');
   let lab = extra;
   if (!lab && r.room_doc_fn) {
    lab = `${String(r.room_doc_ln || '').trim()}, ${String(r.room_doc_fn || '').trim()}`.trim();
   }
   r.room_staff_label = lab;
   return r;
  });
 }

 const staffId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
 const staffRole = String(req.session.user?.role || '');
 const isStaffDoctor = staffRole === '2' || staffRole === '100';
 const todayVisitsMine = [];
 const todayVisitsOthers = [];
 if (isStaffDoctor && staffId && Array.isArray(todayVisits)) {
  for (const v of todayVisits) {
   const ad = parseInt(v.assigned_doctor_id || 0, 10) || 0;
   if (ad === staffId) todayVisitsMine.push(v);
   else todayVisitsOthers.push(v);
  }
 } else if (Array.isArray(todayVisits)) {
  todayVisitsOthers.push(...todayVisits);
 }

 const aclKeys = [
  'am.opd_queue.chart',
  'am.opd_queue.triage',
  'am.opd_queue.consultation',
  'am.opd_queue.carry_forward',
  'am.opd_queue.assign_room',
  'am.opd_queue.complete',
  'am.opd_queue.cancel',
 ];
 const aclMenu = {};
 for (const k of aclKeys) aclMenu[k] = res.locals.aclActionMenuVisible(k);

 const canRecordVitals = staffMayRecordOpdVitals({
  role: staffRole,
  perms: res.locals.userPerms || [],
  aclTriageVisible: !!aclMenu['am.opd_queue.triage'],
 });

 res.render('opd-queue', {
 title: pageTitle(res, 'document_titles.visits_opd_registry', 'Visits & OPD Registry — ZAIZENS'),
 pageData: {
  todayVisits,
  todayVisitsMine,
  todayVisitsOthers,
  queueShowDoctorSplit: isStaffDoctor && staffId > 0,
  consultationRooms: Array.isArray(consultationRooms) ? consultationRooms : [],
  staffDoctorId: isStaffDoctor ? staffId : 0,
  canManageConsultationRooms: canManageConsultationRooms(staffRole, res.locals.userPerms),
  allVisits,
  visitIdsWithVitals,
  doctors,
  filters: {
   q,
   dateFrom,
   dateTo,
   status,
   sort,
   dept,
   page: registryPager.page,
   totalPages: registryPager.totalPages,
   total: registryPager.total,
  },
  pager: registryPager,
  registryToday: today,
  flash: req.query.msg || carryFlash || null,
  error: req.query.err || null,
  userPerms: res.locals.userPerms || [],
  aclMenu,
  staffRole,
  canRecordVitals,
 },
 });
 } catch (err) {
 console.error('OPD QUEUE ERROR:', err.message);
 renderAppError(res, 500, 'page.load_visits', 'Visits load failure.', { detail: err.message })
 }
});

// CONSULTATION (New UI)
async function ensureOpdVisitForPatient(pool, opts) {
 const patientId = parseInt(opts.patientId, 10) || 0;
 if (patientId < 1) return 0;

 const preferVisitId = parseInt(opts.preferVisitId, 10) || 0;
 if (preferVisitId > 0) {
  const [[preferred]] = await pool
   .query('SELECT id FROM tbl_opd_visit WHERE id=? AND patient_id=? LIMIT 1', [preferVisitId, patientId])
   .catch(() => [[null]]);
  if (preferred?.id) return parseInt(preferred.id, 10) || 0;
 }

 const [[latestVisit]] = await pool
  .query(
   `SELECT id
      FROM tbl_opd_visit
     WHERE patient_id=?
       AND LOWER(TRIM(COALESCE(queue_status,''))) <> 'cancelled'
     ORDER BY CASE WHEN payment_code IS NOT NULL AND TRIM(payment_code) <> '' THEN 0 ELSE 1 END,
              FIELD(LOWER(TRIM(COALESCE(queue_status,''))), 'in_consultation', 'waiting_doctor', 'triage', 'registered', 'orders_pending', 'billing', 'completed') ASC,
              id DESC
     LIMIT 1`,
   [patientId]
  )
  .catch(() => [[null]]);
 if (latestVisit?.id) return parseInt(latestVisit.id, 10) || 0;

 if (opts.consultCreatedAt) {
  const [[dayVisit]] = await pool
   .query(
    `SELECT id
       FROM tbl_opd_visit
      WHERE patient_id=?
        AND visit_date = DATE(?)
      ORDER BY id DESC
      LIMIT 1`,
    [patientId, opts.consultCreatedAt]
   )
   .catch(() => [[null]]);
  if (dayVisit?.id) return parseInt(dayVisit.id, 10) || 0;
 }

 const [[anyVisit]] = await pool
  .query('SELECT id FROM tbl_opd_visit WHERE patient_id=? ORDER BY id DESC LIMIT 1', [patientId])
  .catch(() => [[null]]);
 if (anyVisit?.id) return parseInt(anyVisit.id, 10) || 0;

 const facilityId = parseInt(opts.facilityId, 10) || 1;
 const userId = parseInt(opts.userId, 10) || 1;
 const year = new Date().getFullYear();
 const prefix = `OPD-${year}-`;
 const [maxRow] = await pool
  .query('SELECT ticket_number FROM tbl_opd_visit WHERE ticket_number LIKE ? ORDER BY id DESC LIMIT 1', [`${prefix}%`])
  .catch(() => [[]]);
 let nextSeq = 1;
 if (maxRow.length > 0) {
  const parts = String(maxRow[0].ticket_number || '').split('-');
  nextSeq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
 }
 const ticketNumber = prefix + String(nextSeq).padStart(4, '0');
 const now = new Date();
 const visitDate = now.toISOString().slice(0, 10);
 const chiefComplaint = String(opts.chiefComplaint || '').trim();

 try {
  const [insertResult] = await pool.query(
   `INSERT INTO tbl_opd_visit
     (facility_id, patient_id, ticket_number, queue_status, chief_complaint,
      department, priority, visit_date, queue_started_at, created_by)
    VALUES (?, ?, ?, 'waiting_doctor', ?, 'OPD', '', ?, ?, ?)`,
   [facilityId, patientId, ticketNumber, chiefComplaint, visitDate, now, userId]
  );
  return parseInt(insertResult?.insertId || 0, 10) || 0;
 } catch (e) {
  console.error('[ensureOpdVisitForPatient] insert failed for patient', patientId, ':', e.message);
  return 0;
 }
}

// Backwards-compatible aliases used by older buttons/menus.
app.get('/consultation/visit/:id', requireAuth, requirePerm('clinical.write','prescription.write'), async (req, res) => {
 const id = parseInt(req.params.id, 10) || 0;
 if (id < 1) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_consultation_link')));

 try {
  // Prefer interpreting :id as OPD visit id (ER/OPD buttons commonly pass visit.id).
  const [[v]] = await pool.query('SELECT id, patient_id FROM tbl_opd_visit WHERE id=? LIMIT 1', [id]).catch(() => [[null]]);
  if (v && v.patient_id) {
   return res.redirect('/consultation-new?patient_id=' + v.patient_id + '&visit_id=' + v.id);
  }

  // Fallback: treat :id as patient id, and open or create a visit.
  const patientId = id;
  const ensuredVisitId = await ensureOpdVisitForPatient(pool, {
   patientId,
   facilityId: req.session.facilityId || 1,
   userId: parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 1,
  });
  if (ensuredVisitId > 0) {
   return res.redirect('/consultation-new?patient_id=' + patientId + '&visit_id=' + ensuredVisitId);
  }
  return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.no_visit_for_patient')))
 } catch (e) {
  return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.consultation_link_failed', { message: e.message })));
 }
});

app.get('/consultation', requireAuth, requirePerm('clinical.write','prescription.write'), (req, res) => {
 // Old menu link — redirect to OPD queue where consultations are initiated.
 res.redirect('/opd-queue');
});

app.get('/consultation-new', requireAuth, requirePerm('clinical.write','prescription.write'), async (req, res) => {
 const patientIdParam = parseInt(req.query.patient_id, 10) || 0;
 let visitId = parseInt(req.query.visit_id, 10) || 0;
 const editIdParam = parseInt(req.query.edit_id, 10) || 0;
 const fid = req.session.facilityId || 1;
 const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 1;
 let resolvedPatientId = patientIdParam;
 let editConsultRow = null;

 if (editIdParam > 0) {
  const [[existingConsult]] = await pool
   .query('SELECT * FROM tbl_consultation WHERE id=? LIMIT 1', [editIdParam])
   .catch(() => [[null]]);
  editConsultRow = existingConsult || null;
  if (editConsultRow) {
   const consultVisitId = parseInt(existingConsult.opd_visit_id || 0, 10) || 0;
   const consultPatientId = parseInt(existingConsult.patient_id || 0, 10) || 0;
   if (consultPatientId > 0) resolvedPatientId = consultPatientId;
   if (consultVisitId > 0) {
    const [[linkedVisit]] = await pool
     .query('SELECT id, patient_id FROM tbl_opd_visit WHERE id=? LIMIT 1', [consultVisitId])
     .catch(() => [[null]]);
    if (
     linkedVisit &&
     parseInt(linkedVisit.patient_id || 0, 10) === (resolvedPatientId || consultPatientId)
    ) {
     visitId = consultVisitId;
    } else {
     visitId = 0;
    }
   }
  }
 }

 if (visitId > 0) {
  const [[visitRow]] = await pool
   .query('SELECT id, patient_id FROM tbl_opd_visit WHERE id=? LIMIT 1', [visitId])
   .catch(() => [[null]]);
  if (!visitRow) {
   visitId = 0;
  } else {
   const visitPatientId = parseInt(visitRow.patient_id || 0, 10) || 0;
   if (resolvedPatientId < 1) resolvedPatientId = visitPatientId;
   else if (visitPatientId !== resolvedPatientId) visitId = 0;
  }
 } else if (resolvedPatientId < 1 && parseInt(req.query.visit_id, 10) > 0) {
  const staleVisitId = parseInt(req.query.visit_id, 10) || 0;
  const [[visitRow]] = await pool
   .query('SELECT id, patient_id FROM tbl_opd_visit WHERE id=? LIMIT 1', [staleVisitId])
   .catch(() => [[null]]);
  if (visitRow) {
   visitId = parseInt(visitRow.id || 0, 10) || 0;
   resolvedPatientId = parseInt(visitRow.patient_id || 0, 10) || 0;
  }
 }

 if (visitId < 1 && resolvedPatientId > 0) {
  visitId = await ensureOpdVisitForPatient(pool, {
   patientId: resolvedPatientId,
   facilityId: fid,
   userId: uid,
   consultCreatedAt: editConsultRow?.created_at || null,
   chiefComplaint: editConsultRow?.chief_complaint || '',
  });
  if (visitId > 0) {
   if (
    editIdParam > 0 &&
    editConsultRow &&
    !(parseInt(editConsultRow.opd_visit_id || 0, 10) > 0)
   ) {
    await pool
     .query('UPDATE tbl_consultation SET opd_visit_id=? WHERE id=?', [visitId, editIdParam])
     .catch(() => {});
   }
   if (!(parseInt(req.query.visit_id, 10) > 0)) {
    const q = new URLSearchParams();
    q.set('patient_id', String(resolvedPatientId));
    q.set('visit_id', String(visitId));
    if (editIdParam > 0) q.set('edit_id', String(editIdParam));
    return res.redirect('/consultation-new?' + q.toString());
   }
  }
 }

 if (visitId < 1) {
  if (resolvedPatientId < 1) {
   const today = new Date().toISOString().slice(0, 10);
   const [consultVisits] = await pool
    .query(
     `SELECT v.id, v.patient_id, v.ticket_number, v.queue_status, v.department, v.visit_date,
             v.chief_complaint, v.payment_code,
             p.first_name, p.last_name, p.patient_code, p.phone
        FROM tbl_opd_visit v
        JOIN tbl_patient p ON p.id = v.patient_id
       WHERE v.facility_id = ?
         AND LOWER(TRIM(COALESCE(v.queue_status,''))) NOT IN ('completed', 'cancelled')
         AND (
           LOWER(TRIM(COALESCE(v.queue_status,''))) IN ('registered', 'triage', 'waiting_doctor', 'in_consultation', 'orders_pending', 'billing')
           OR v.visit_date >= DATE_SUB(?, INTERVAL 7 DAY)
         )
       ORDER BY FIELD(LOWER(TRIM(COALESCE(v.queue_status,''))), 'in_consultation', 'waiting_doctor', 'triage', 'registered', 'orders_pending', 'billing', 'completed') ASC,
                v.id DESC
       LIMIT 50`,
     [fid, today]
    )
    .catch(() => [[]]);
   return res.render('consultation-start', {
    title: pageTitle(res, 'document_titles.new_consultation', 'New Consultation — ZAIZENS'),
    pageData: {
     visits: Array.isArray(consultVisits) ? consultVisits : [],
     flash: req.query.msg || null,
     error: req.query.err || null,
    },
   });
  }
  console.error('[consultation-new] missing visit for patient', resolvedPatientId, 'query=', req.query);
  return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_consultation_link_missing_visit')))
 }

 try {
  const [[opdVisit]] = await pool.query(
   'SELECT * FROM tbl_opd_visit WHERE id=? LIMIT 1',
   [visitId]
  );
  if (!opdVisit) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.visit_not_found')))

  const patientId = parseInt(opdVisit.patient_id, 10) || 0;
  if (patientId < 1) {
   return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.this_visit_has_no_patient_linked_re_register_the_visit_at_front_desk')))
  }
  if (patientIdParam > 0 && patientIdParam !== patientId) {
   return res.redirect(
    '/consultation-new?patient_id=' + patientId + '&visit_id=' + visitId
   );
  }

  let patient;
  try {
   patient = await fetchPatientById(pool, patientId);
  } catch (dbErr) {
   console.error('CONSULTATION-NEW patient load:', dbErr.message);
   return res.redirect(
    '/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.could_not_load_patient_record', { message: dbErr.message }))
   );
  }
  if (!patient) {
   return res.redirect(
    '/opd-queue?err=' +
     encodeURIComponent(flashT(res, 'flash.patient_record_missing_for_this_visit_check_the_patient_directory_or_fro'))
   );
  }
  if (patient.status != null && parseInt(patient.status, 10) === 0) {
   return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.patient_record_is_inactive_restore_the_patient_or_register_again')))
  }

  const staffRole = String(req.session.user?.role || '');
  const staffEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const assignedDocId = parseInt(opdVisit.assigned_doctor_id || 0, 10) || 0;
  if (staffRole === '2' && assignedDocId > 0 && assignedDocId !== staffEmpId && !clinicalNad.hasBypass(req, 'opd', visitId)) {
   let assignLabel = 'another physician';
   const [[adoc]] = await pool.query(
    'SELECT first_name, last_name FROM tbl_employee WHERE id=? AND role=2 LIMIT 1',
    [assignedDocId]
   ).catch(() => [[null]]);
   if (adoc) {
    assignLabel = ('Dr. ' + String(adoc.first_name || '').trim() + ' ' + String(adoc.last_name || '').trim()).trim();
   }
   const nextUrl = '/consultation-new?patient_id=' + patientId + '&visit_id=' + visitId;
   return res.render('consultation-ack-not-assigned', {
    title: pageTitle(res, 'document_titles.patient_not_assigned', 'Patient not assigned to you'),
    mode: 'opd',
    patientName: [patient.first_name, patient.last_name].filter(Boolean).join(' '),
    assignedDoctorLabel: assignLabel,
    nextUrl,
    visitId,
    patientId,
    admissionId: 0,
    ticketNumber: opdVisit.ticket_number || null,
   });
  }

  const qsVisit = opdVisit.queue_status || '';
  const skipVitalsGate = ['in_consultation', 'orders_pending', 'billing', 'completed', 'cancelled'].includes(qsVisit);
  if (!skipVitalsGate) {
   const hasV = await opdVisitHasVitalsRecorded(pool, visitId, patientId);
   if (!hasV) {
    const emgBack = Number(opdVisit.is_emergency) ? `/emergency/visit/${visitId}` : '/opd-queue';
    return res.redirect(emgBack + '?err=' + encodeURIComponent(opdVitalsRequiredMessage(res, patient.first_name, patient.last_name)));
   }
  }

  try {
   const opdQueueConsult = require('./lib/opdQueueConsult');
   await opdQueueConsult.markVisitInConsultation(pool, { visitId, doctorId: staffEmpId });
   const [[refreshed]] = await pool.query('SELECT * FROM tbl_opd_visit WHERE id=? LIMIT 1', [visitId]).catch(() => [[null]]);
   if (refreshed) Object.assign(opdVisit, refreshed);
  } catch (markErr) {
   console.warn('consultation-new mark in_consultation:', markErr.message);
  }

  // Latest vitals (prefer visit-specific, then patient)
  const [[vs]] = await pool.query(
   `SELECT * FROM tbl_vital_sign
    WHERE (opd_visit_id = ? OR opd_visit_id IS NULL) AND patient_id = ?
      AND (superseded_at IS NULL OR superseded_at = '0000-00-00 00:00:00')
    ORDER BY id DESC LIMIT 1`,
   [visitId, patientId]
  ).catch(() => [[null]]);

  const vitals = {
   temperature: vs?.temp_c ?? '',
   pulse: vs?.heart_rate ?? '',
   blood_pressure_systolic: vs?.bp_sys ?? '',
   blood_pressure_diastolic: vs?.bp_dia ?? '',
   spo2: vs?.spo2 ?? '',
   weight: vs?.weight_kg ?? '',
   height: vs?.height_cm ?? ''
  };

  // Cashier ticket → consultation type / assigned physician / list price
  let billingMeta = await resolveOpdConsultBillingMeta(pool, {
   paymentCode: opdVisit.payment_code,
   assignedDoctorId: opdVisit.assigned_doctor_id,
   patientId,
   excludeVisitId: visitId,
  });

  // Link paid consultation ticket to visit when front desk omitted payment_code
  const visitPayCode = String(opdVisit.payment_code || '').trim();
  if (!visitPayCode && billingMeta.paymentCode) {
   await pool
    .query(
     `UPDATE tbl_opd_visit
         SET payment_code = ?,
             assigned_doctor_id = COALESCE(NULLIF(assigned_doctor_id, 0), ?)
       WHERE id = ? AND patient_id = ?`,
     [
      billingMeta.paymentCode,
      billingMeta.doctorId > 0 ? billingMeta.doctorId : null,
      visitId,
      patientId,
     ]
    )
    .catch(() => {});
   opdVisit.payment_code = billingMeta.paymentCode;
   if (!(parseInt(opdVisit.assigned_doctor_id || 0, 10) > 0) && billingMeta.doctorId > 0) {
    opdVisit.assigned_doctor_id = billingMeta.doctorId;
   }
   billingMeta = await resolveOpdConsultBillingMeta(pool, {
    paymentCode: opdVisit.payment_code,
    assignedDoctorId: opdVisit.assigned_doctor_id,
    patientId,
    excludeVisitId: visitId,
   });
  }

  const payGate = await clinicalBusinessRules.assertOpdVisitConsultationPayment(pool, opdVisit, fid);
  /** @type {boolean} True when payment ticket is invalid/expired. Blocks consultation save. */
  const consultPaymentBlocked = !payGate.ok;
  const consultPaymentError = payGate.ok ? '' : clinicalMsgT(res, payGate);

  /** @type {boolean} True when patient is already admitted as inpatient. Blocks new IPD admit order — unrelated to payment. */
  let admitOrderBlocked = false;
  const [[pendingAdmit]] = await pool
   .query(
    `SELECT id FROM tbl_admission a
     WHERE a.patient_id = ?
       AND (a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')
     LIMIT 1`,
    [patientId]
   )
   .catch(() => [[null]]);
  if (pendingAdmit) admitOrderBlocked = true;

  const [labCatalog] = await pool.query(
   "SELECT id, name, price FROM tbl_service_catalog WHERE status=1 AND LOWER(TRIM(category))='laboratory' ORDER BY name"
  ).catch(() => [[]]);
  const [radCatalog] = await pool.query(
   `SELECT id, name, price FROM tbl_service_catalog WHERE status=1 AND ${imagingCategoryWhere()} ORDER BY sort_order, name`
  ).catch(() => [[]]);

  const [pharmacyCatalog] = await pool.query(
   "SELECT id, name, price, COALESCE(department_name,'') AS used_for FROM tbl_service_catalog WHERE status=1 AND LOWER(TRIM(category))='pharmacy' ORDER BY name"
  ).catch(() => [[]]);
  const [usedForRows] = await pool.query(
   `SELECT DISTINCT TRIM(department_name) AS used_for
    FROM tbl_service_catalog
    WHERE status=1 AND LOWER(TRIM(category))='pharmacy'
     AND department_name IS NOT NULL AND TRIM(department_name) <> ''
     AND LOWER(TRIM(department_name)) <> 'uncategorized'
    ORDER BY TRIM(department_name)`
  ).catch(() => [[]]);
  const usedForOptions = (Array.isArray(usedForRows) ? usedForRows : [])
   .map(r => String(r.used_for || '').trim())
   .filter(Boolean);

  // If editing existing consultation for same visit
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_consultation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facility_id INT DEFAULT 1,
    patient_id INT NOT NULL,
    opd_visit_id INT NULL,
    chief_complaint TEXT NULL,
    diagnosis TEXT NULL,
    assessment TEXT NULL,
    investigations TEXT NULL,
    advice TEXT NULL,
    referral_to VARCHAR(255) NULL,
    consult_fee_xaf DECIMAL(10,2) NULL,
    medications_json LONGTEXT NULL,
    lab_orders_json LONGTEXT NULL,
    rad_orders_json LONGTEXT NULL,
    observations_json LONGTEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY (patient_id),
    KEY (opd_visit_id)
   )
  `).catch(() => {});

  const [[editRow]] = editIdParam > 0
   ? await pool
      .query('SELECT * FROM tbl_consultation WHERE id=? AND patient_id=? LIMIT 1', [editIdParam, patientId])
      .catch(() => [[null]])
   : await pool
      .query(
       'SELECT * FROM tbl_consultation WHERE opd_visit_id=? AND patient_id=? ORDER BY id DESC LIMIT 1',
       [visitId, patientId]
      )
      .catch(() => [[null]]);
  const editId = editRow?.id || null;

  let editObservations = {};
  try { editObservations = JSON.parse(editRow?.observations_json || '{}'); } catch (e) { editObservations = {}; }

  const existingLabIds = (() => { try { return (JSON.parse(editRow?.lab_orders_json || '[]') || []).map(String); } catch(e){ return []; } })();
  const existingRadIds = (() => { try { return (JSON.parse(editRow?.rad_orders_json || '[]') || []).map(String); } catch(e){ return []; } })();
  const existingLabCustom = Array.isArray(editObservations.lab_custom_names)
   ? editObservations.lab_custom_names.map((n) => String(n || '').trim()).filter(Boolean)
   : [];
  const existingRadCustom = Array.isArray(editObservations.rad_custom_names)
   ? editObservations.rad_custom_names.map((n) => String(n || '').trim()).filter(Boolean)
   : [];

  const patientGender = patient.gender || '';
  const patientAgeNum = patientDisplayAgeYears(patient);
  const patientAge = patientAgeNum != null ? String(patientAgeNum) : '';

  let autoDoctorName = billingMeta.doctorName || '';
  let autoDoctorId = billingMeta.doctorId || 0;
  let autoConsultType = billingMeta.serviceName || 'General Consultation';
  let autoConsultFee = billingMeta.servicePrice > 0 ? billingMeta.servicePrice : null;

  // Saved consultation overrides cashier ticket when reopening
  if (editRow && String(editRow.referral_to || '').trim())
   autoDoctorName = String(editRow.referral_to).trim();
  else if (editObservations && editObservations.referral_to && String(editObservations.referral_to).trim())
   autoDoctorName = String(editObservations.referral_to).trim();

  if (editRow && editRow.consult_fee_xaf != null && parseFloat(editRow.consult_fee_xaf) > 0) {
   autoConsultFee = parseFloat(editRow.consult_fee_xaf);
  }

  if (billingMeta.doctorId > 0 && !(parseInt(opdVisit.assigned_doctor_id || 0, 10) > 0)) {
   await pool
    .query('UPDATE tbl_opd_visit SET assigned_doctor_id = ? WHERE id = ? AND patient_id = ?', [
     billingMeta.doctorId,
     visitId,
     patientId,
    ])
    .catch(() => {});
  }

  res.render('consultation-new', {
   title: pageTitle(res, 'document_titles.new_consultation', 'New Consultation — ZAIZENS'),
   pageData: {
   patient,
   opdVisit,
   visitId,
   patientGender,
   patientAge,
   vitals,
   labCatalog: Array.isArray(labCatalog) ? labCatalog : [],
   radCatalog: Array.isArray(radCatalog) ? radCatalog : [],
   pharmacyCatalog: Array.isArray(pharmacyCatalog) ? pharmacyCatalog : [],
   usedForOptions,
   editId,
   editRow,
   editObservations,
   existingLabIds,
   existingRadIds,
   existingLabCustom,
   existingRadCustom,
   consultPaymentBlocked,
   consultPaymentError,
   admitOrderBlocked,
   autoDoctorName,
   autoDoctorId,
   autoConsultType,
   autoConsultFee,
   flash: req.query.msg || null,
   error: req.query.err || null,
   },
  });
 } catch (err) {
  console.error('CONSULTATION-NEW GET ERROR:', err.message);
  return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.consultation_load_failed', { message: err.message })));
 }
});

app.post('/consultation-new/retake-vitals', requireAuth, requirePerm('clinical.write', 'prescription.write'), async (req, res) => {
 const patientId = parseInt(req.body.patient_id, 10) || 0;
 const visitId = parseInt(req.body.opd_visit_id, 10) || 0;
 const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 1;
 if (patientId < 1 || visitId < 1) {
  return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_consultation_data')));
 }
 try {
  const result = await requestOpdVitalsRetake(pool, { visitId, patientId, userId: uid });
  if (!result.ok) {
   return res.redirect(
    '/consultation-new?patient_id=' +
     patientId +
     '&visit_id=' +
     visitId +
     '&err=' +
     encodeURIComponent(clinicalMsgT(res, result))
   );
  }
  return res.redirect('/opd-queue?msg=' + encodeURIComponent(flashT(res, 'flash.vitals_retake_requested')));
 } catch (e) {
  console.error('RETAKE VITALS:', e.message);
  return res.redirect(
   '/consultation-new?patient_id=' +
    patientId +
    '&visit_id=' +
    visitId +
    '&err=' +
    encodeURIComponent(flashT(res, 'flash.save_failed', { message: e.message }))
  );
 }
});

app.post('/consultation-new', requireAuth, async (req, res) => {
 const uid = req.session.userId || req.session.user?.id || 1;
 const fid = req.session.facilityId || 1;

 const patientId = parseInt(req.body.patient_id) || 0;
 const visitId = parseInt(req.body.opd_visit_id) || 0;
 if (patientId < 1 || visitId < 1) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_consultation_data')))

 const pickArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
 try {
  const [[ov]] = await pool.query(
   'SELECT * FROM tbl_opd_visit WHERE id=? AND patient_id=? LIMIT 1',
   [visitId, patientId]
  ).catch(() => [[null]]);
  if (!ov) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.visit_not_found')))

  let billingMetaPost = await resolveOpdConsultBillingMeta(pool, {
   paymentCode: ov.payment_code,
   assignedDoctorId: ov.assigned_doctor_id,
   patientId,
   excludeVisitId: visitId,
  });
  if (!String(ov.payment_code || '').trim() && billingMetaPost.paymentCode) {
   await pool
    .query(
     `UPDATE tbl_opd_visit
         SET payment_code = ?,
             assigned_doctor_id = COALESCE(NULLIF(assigned_doctor_id, 0), ?)
       WHERE id = ? AND patient_id = ?`,
     [
      billingMetaPost.paymentCode,
      billingMetaPost.doctorId > 0 ? billingMetaPost.doctorId : null,
      visitId,
      patientId,
     ]
    )
    .catch(() => {});
   ov.payment_code = billingMetaPost.paymentCode;
   if (!(parseInt(ov.assigned_doctor_id || 0, 10) > 0) && billingMetaPost.doctorId > 0) {
    ov.assigned_doctor_id = billingMetaPost.doctorId;
   }
  }

  const payGatePost = await clinicalBusinessRules.assertOpdVisitConsultationPayment(pool, ov, fid);
  if (!payGatePost.ok) {
   return res.redirect(
    '/consultation-new?patient_id=' +
     patientId +
     '&visit_id=' +
     visitId +
     '&err=' +
     encodeURIComponent(clinicalMsgT(res, payGatePost))
   );
  }
  const staffRolePost = String(req.session.user?.role || '');
  const staffEmpIdPost = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const assignedDocPost = parseInt(ov.assigned_doctor_id || 0, 10) || 0;
  if (staffRolePost === '2' && assignedDocPost > 0 && assignedDocPost !== staffEmpIdPost && !clinicalNad.hasBypass(req, 'opd', visitId)) {
   return res.redirect('/consultation-new?patient_id=' + patientId + '&visit_id=' + visitId);
  }
  const qsVisit = ov.queue_status || '';
  const skipVitalsGate = ['in_consultation', 'orders_pending', 'billing', 'completed', 'cancelled'].includes(qsVisit);
  if (!skipVitalsGate) {
   const [[pRow]] = await pool.query(
    'SELECT first_name, last_name FROM tbl_patient WHERE id=? LIMIT 1',
    [patientId]
   ).catch(() => [[null]]);
   const hasV = await opdVisitHasVitalsRecorded(pool, visitId, patientId);
   if (!hasV) {
    const emgBack = Number(ov.is_emergency) ? `/emergency/visit/${visitId}` : '/opd-queue';
    return res.redirect(emgBack + '?err=' + encodeURIComponent(opdVitalsRequiredMessage(res, pRow?.first_name, pRow?.last_name)));
   }
  }

  // ensure table exists (same as GET)
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_consultation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facility_id INT DEFAULT 1,
    patient_id INT NOT NULL,
    opd_visit_id INT NULL,
    chief_complaint TEXT NULL,
    diagnosis TEXT NULL,
    assessment TEXT NULL,
    investigations TEXT NULL,
    advice TEXT NULL,
    referral_to VARCHAR(255) NULL,
    consult_fee_xaf DECIMAL(10,2) NULL,
    medications_json LONGTEXT NULL,
    lab_orders_json LONGTEXT NULL,
    rad_orders_json LONGTEXT NULL,
    observations_json LONGTEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY (patient_id),
    KEY (opd_visit_id)
   )
  `).catch(() => {});

  // If table existed from older schema, add missing columns used by this UI
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS facility_id INT DEFAULT 1").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS patient_id INT NOT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS opd_visit_id INT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS chief_complaint TEXT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS diagnosis TEXT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS assessment TEXT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS investigations TEXT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS advice TEXT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS referral_to VARCHAR(255) NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS consult_fee_xaf DECIMAL(10,2) NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS medications_json LONGTEXT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS lab_orders_json LONGTEXT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS rad_orders_json LONGTEXT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS observations_json LONGTEXT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS created_by INT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_consultation ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP").catch(() => {});

  const meds = [];
  const catalogNames = pickArr(req.body['med_catalog_name[]']);
  const customNames = pickArr(req.body['med_custom_name[]']);
  const names = pickArr(req.body['med_name[]']);
  const dosages = pickArr(req.body['med_dosage[]']);
  const freqs = pickArr(req.body['med_frequency[]']);
  const durations = pickArr(req.body['med_duration[]']);
  const timings = pickArr(req.body['med_timing[]']);
  const insts = pickArr(req.body['med_instructions[]']);
  const quantities = pickArr(req.body['med_quantity[]']);
  const treatmentStarts = pickArr(req.body['med_treatment_start[]']);
  const { resolveOpdDrugUnitPrice } = require('./lib/prescriptionPricing');
  const maxLen = Math.max(
   catalogNames.length,
   customNames.length,
   names.length,
   dosages.length,
   freqs.length,
   durations.length,
   timings.length,
   insts.length,
   quantities.length,
   treatmentStarts.length,
   0
  );
  for (let i = 0; i < maxLen; i++) {
   const customName = (customNames[i] || '').toString().trim();
   const catalogName = (catalogNames[i] || '').toString().trim();
   const legacyName = (names[i] || '').toString().trim();
   const name = customName || catalogName || legacyName;
   const dosage = (dosages[i] || '').toString().trim();
   const frequency = (freqs[i] || '').toString().trim();
   const duration = (durations[i] || '').toString().trim();
   const timing = (timings[i] || '').toString().trim();
   const instructions = (insts[i] || '').toString().trim();
   const treatmentStart = (treatmentStarts[i] || '').toString().trim().slice(0, 10) || null;
   let quantity = parseFloat(String(quantities[i] || '').replace(',', '.'));
   if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;
   quantity = Math.min(9999, Math.round(quantity));
   if (!name && !dosage && !frequency && !duration && !timing && !instructions) continue;
   if (name) {
    const daysNum = parseInt(duration, 10);
    if (!dosage || !frequency || !duration || !Number.isFinite(daysNum) || daysNum < 1) {
     return res.redirect(
      '/consultation-new?patient_id=' +
       patientId +
       '&visit_id=' +
       visitId +
       '&err=' +
       encodeURIComponent(flashT(res, 'flash.med_prescription_fields_required', { drug: name }))
     );
    }
   }
   const pricing = await resolveOpdDrugUnitPrice(pool, { catalogName, customName, legacyName });
   meds.push({
    name: pricing.name || name,
    catalog_name: catalogName,
    custom_name: customName,
    dosage,
    frequency,
    duration,
    timing,
    instructions,
    quantity,
    treatment_start: treatmentStart,
    unit_price: pricing.isCustom ? 0 : pricing.unitPrice,
    is_custom: pricing.isCustom,
   });
  }

  const labIds = pickArr(req.body['lab_catalog_id[]']).map(String);
  const radIds = pickArr(req.body['rad_catalog_id[]']).map(String);
  const labCustomNames = pickArr(req.body['lab_custom_name[]'])
   .map((n) => String(n || '').trim())
   .filter(Boolean);
  const radCustomNames = pickArr(req.body['rad_custom_name[]'])
   .map((n) => String(n || '').trim())
   .filter(Boolean);

  const chief = (req.body.chief_complaint || '').toString().trim();
  const history = (req.body.history || '').toString().trim();
  const examination = (req.body.examination || '').toString().trim();
  const diagnosis = (req.body.diagnosis || '').toString().trim();
  const plan = (req.body.treatment_plan || '').toString().trim();
  const investigations = (req.body.investigations || history || '').toString().trim();
  const advice = (req.body.advice || examination || '').toString().trim();
  const referralToRaw = (req.body.referral_to || req.body.referred_to_name || '').toString().trim();
  const referralTo = referralToRaw || billingMetaPost.doctorName || '';
  const feeRaw = req.body.consult_fee_xaf ? parseFloat(req.body.consult_fee_xaf) : null;
  const fee =
    Number.isFinite(feeRaw) && feeRaw > 0
      ? feeRaw
      : billingMetaPost.servicePrice > 0
        ? billingMetaPost.servicePrice
        : null;

  const observations_json = JSON.stringify({
   chief_complaint: chief,
   history,
   examination,
   diagnosis,
   treatment_plan: plan,
   investigations,
   advice,
   referral_to: referralTo,
   medications_json: JSON.stringify(meds),
   next_consultation: req.body.next_consultation || '',
   empty_stomach: req.body.empty_stomach || '',
   follow_up_date: req.body.follow_up_date || '',
   followup_visit_requested:
    req.body.followup_visit_requested === '1' ||
    req.body.followup_visit_requested === 'on' ||
    req.body.followup_visit_requested === true,
   admit_recommendation: req.body.admit_recommendation ? 'Yes' : 'No',
   admit_indication: req.body.admit_indication || '',
   lab_custom_names: labCustomNames,
   rad_custom_names: radCustomNames
  });

  const [insRes] = await pool.query(
   `INSERT INTO tbl_consultation
    (facility_id, patient_id, opd_visit_id, chief_complaint, diagnosis, assessment, investigations, advice, referral_to,
     consult_fee_xaf, medications_json, lab_orders_json, rad_orders_json, observations_json, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
   [
    fid,
    patientId,
    visitId,
    chief || null,
    diagnosis || null,
    plan || null,
    investigations || null,
    advice || null,
    referralTo || null,
    Number.isFinite(fee) ? fee : null,
    JSON.stringify(meds),
    JSON.stringify(labIds),
    JSON.stringify(radIds),
    observations_json,
    uid
   ]
  );
  const consultId = insRes && insRes.insertId ? insRes.insertId : null;
  let orderItemsCreated = 0;

  // Enqueue lab/radiology items to cashier queue (pending) — de-dup on re-save
  if (consultId) {
   try {
    await ensureOpdOrderItemsSchema(pool);
    const normIds = (arr) => (Array.isArray(arr) ? arr : []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0);
    const labIdNums = normIds(labIds);
    const radIdNums = normIds(radIds);

    // Remove old pending items for this visit to avoid duplicates when editing/re-saving
    await pool.query(
     "DELETE FROM tbl_opd_order_item WHERE opd_visit_id=? AND patient_id=? AND status='pending'",
     [visitId, patientId]
    ).catch(() => {});

    const loadCatalog = async (ids) => {
     if (!ids.length) return new Map();
     const placeholders = ids.map(() => '?').join(',');
     const [rows] = await pool.query(
      `SELECT id, name, price FROM tbl_service_catalog WHERE id IN (${placeholders}) AND status=1`,
      ids
     ).catch(() => [[]]);
     const m = new Map();
     for (const r of rows || []) m.set(parseInt(r.id, 10), { name: r.name, price: parseFloat(r.price || 0) || 0 });
     return m;
    };

    const labMap = await loadCatalog(labIdNums);
    const radMap = await loadCatalog(radIdNums);

    let alertDoctor = 'Doctor';
    let alertPatient = `Patient #${patientId}`;
    const [docRows] = await pool.query('SELECT first_name, last_name FROM tbl_employee WHERE id=? LIMIT 1', [uid]).catch(() => [[]]);
    const docNm = docRows && docRows[0];
    if (docNm) {
     alertDoctor = `Dr. ${String(docNm.first_name || '').trim()} ${String(docNm.last_name || '').trim()}`.trim();
    }
    const [patRows2] = await pool.query('SELECT first_name, last_name FROM tbl_patient WHERE id=? LIMIT 1', [patientId]).catch(() => [[]]);
    const patNm = patRows2 && patRows2[0];
    if (patNm) {
     alertPatient = `${String(patNm.first_name || '').trim()} ${String(patNm.last_name || '').trim()}`.trim();
    }

    const deptLc = String(ov.department || '').toLowerCase();
    const isEr =
     ov.is_emergency == 1 ||
     ov.is_emergency === true ||
     deptLc.includes('emergency') ||
     deptLc.includes('a&e') ||
     deptLc.includes('a and e');
    const [ipdRows] = await pool
     .query(
      `SELECT a.id AS admission_id, b.ward_name, b.bed_label
         FROM tbl_admission a
         LEFT JOIN tbl_bed b ON b.id = a.bed_id
        WHERE a.patient_id = ?
          AND (a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')
        ORDER BY a.id DESC
        LIMIT 1`,
      [patientId]
     )
     .catch(() => [[]]);
    const ipdAdm = ipdRows && ipdRows[0];
    const isIpd = !!(ipdAdm && ipdAdm.admission_id);

    let wardDisplay = '—';
    let bedDisplay = '—';
    let admissionId = null;
    let alertContext = '';
    if (isEr) {
     alertContext = 'er';
     wardDisplay = 'Emergency / A&E';
     const [bedRows] = await pool
      .query(
       `SELECT b.label AS bed_label, b.bed_code
          FROM tbl_opd_visit v
          LEFT JOIN tbl_er_bed b ON b.id = v.er_bed_id
         WHERE v.id = ?
         LIMIT 1`,
       [visitId]
      )
      .catch(() => [[]]);
     const erBed = bedRows && bedRows[0];
     if (erBed && (erBed.bed_label || erBed.bed_code)) {
      bedDisplay = String(erBed.bed_label || erBed.bed_code || '').trim() || '—';
     } else {
      bedDisplay = 'No bed assigned';
     }
    } else if (isIpd) {
     alertContext = 'ipd';
     admissionId = ipdAdm.admission_id;
     wardDisplay = String(ipdAdm.ward_name || '').trim() || 'Inpatient';
     bedDisplay = String(ipdAdm.bed_label || '').trim() || '—';
    } else {
     // Routine OPD (non–Emergency, not currently admitted) — still notify lab/rad/pharmacy
     alertContext = 'opd';
     wardDisplay = String(ov.department || '').trim() || 'Outpatient';
     bedDisplay = '—';
    }
    const shouldDeptAlert =
     !!alertContext &&
     (labIdNums.length > 0 || radIdNums.length > 0 || labCustomNames.length > 0 || radCustomNames.length > 0 || meds.length > 0);

    const insertItem = async (type, catId, info, qty) => {
     if (!info || !info.name) return null;
     const q = (qty == null || isNaN(parseFloat(qty)) || parseFloat(qty) <= 0) ? 1 : parseFloat(qty);
     const invId = info.inventoryItemId ? parseInt(info.inventoryItemId, 10) || null : null;
     const [insR] = await pool
      .query(
       `INSERT INTO tbl_opd_order_item
        (facility_id, patient_id, opd_visit_id, consultation_id, item_type, catalog_id, inventory_item_id, item_name, unit_price, quantity, status, created_by, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?,NOW())`,
       [fid, patientId, visitId, consultId, type, catId, invId, info.name, info.price, q, uid]
      )
      .catch(() => [null]);
     if (insR && insR.insertId) orderItemsCreated += 1;
     return insR && insR.insertId ? insR.insertId : null;
    };

    const pushDeptAlert = async (targetDept, oiId, testName) => {
     if (!shouldDeptAlert || !oiId) return;
     const td = String(targetDept || 'laboratory').toLowerCase();
     if (!clinicalDeptAlerts.CLINICAL_ALERT_DEPTS.has(td)) return;
     await clinicalDeptAlerts.enqueueAlert(pool, {
      facility_id: fid,
      target_dept: td,
      context: alertContext,
      doctor_display: alertDoctor,
      patient_display: alertPatient,
      ward_display: wardDisplay,
      bed_display: bedDisplay,
      test_display: testName,
      patient_id: patientId,
      opd_visit_id: visitId,
      admission_id: admissionId,
      consultation_id: consultId,
      opd_order_item_id: oiId,
      created_by: uid,
     });
    };

    for (const id of labIdNums) {
     const info = labMap.get(id);
     const oiId = await insertItem('laboratory', id, info);
     if (info && info.name) await pushDeptAlert('laboratory', oiId, info.name);
    }
    for (const id of radIdNums) {
     const info = radMap.get(id);
     const oiId = await insertItem('radiology', id, info);
     if (info && info.name) await pushDeptAlert('radiology', oiId, info.name);
    }

    for (const customName of labCustomNames) {
     const info = { name: customName, price: 0 };
     const oiId = await insertItem('laboratory', null, info);
     if (oiId) await pushDeptAlert('laboratory', oiId, customName);
    }
    for (const customName of radCustomNames) {
     const info = { name: customName, price: 0 };
     const oiId = await insertItem('radiology', null, info);
     if (oiId) await pushDeptAlert('radiology', oiId, customName);
    }

    // ── Enqueue prescribed medications as pharmacy items ────────────────
    const { resolveMedToCatalog } = require('./lib/pharmacyCatalogResolve');

    for (const med of meds) {
     if (!med || !med.name) continue;
     const info = med.is_custom
      ? { name: med.name, price: 0, catId: null, inventoryItemId: null }
      : await resolveMedToCatalog(pool, med.catalog_name || med.name);
     if (!info.name) info.name = med.name;
     if (!med.is_custom) info.price = med.unit_price != null ? med.unit_price : info.price;
     const medQty = med.quantity != null ? med.quantity : 1;
     const oiId = await insertItem('pharmacy', info.catId || null, info, medQty);
     if (oiId) await pushDeptAlert('pharmacy', oiId, info.name);
    }

    // Assign LAB-/RAD-/PHA- codes for this consultation (one per category).
    await assignServiceCodesForConsultation(pool, consultId);
   } catch (e) {
    console.error('CONSULTATION enqueue opd_order_item:', e.message);
   }
  }

  // Optional: create a pending IPD admission request (bed to be assigned in Wards)
  const wantsAdmit = String(req.body.admit_recommendation || '').toLowerCase() === 'on'
   || String(req.body.admit_recommendation || '').toLowerCase() === 'yes'
   || String(req.body.admit_recommendation || '') === '1';
  const admitIndication = (req.body.admit_indication || '').toString().trim();
  if (wantsAdmit) {
   await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS facility_id INT DEFAULT 1").catch(() => {});
   await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS bed_id INT NULL").catch(() => {});
   await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_status VARCHAR(30) DEFAULT 'pending'").catch(() => {});
   await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_department VARCHAR(120) DEFAULT NULL").catch(() => {});
   await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_diagnosis VARCHAR(255) DEFAULT NULL").catch(() => {});
   await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_doctor_id INT DEFAULT NULL").catch(() => {});
   await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(12,2) DEFAULT 0").catch(() => {});
   await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS created_by INT DEFAULT NULL").catch(() => {});
   await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitted_at DATETIME DEFAULT CURRENT_TIMESTAMP").catch(() => {});
   await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS discharged_at DATETIME NULL").catch(() => {});

   const [[existingAdm]] = await pool.query(
    "SELECT id FROM tbl_admission WHERE patient_id=? AND (discharged_at IS NULL OR discharged_at='0000-00-00 00:00:00' OR discharged_at='0000-00-00') ORDER BY id DESC LIMIT 1",
    [patientId]
   ).catch(() => [[null]]);
   if (!existingAdm) {
    await pool.query(
     `INSERT INTO tbl_admission
      (facility_id, patient_id, bed_id, ipd_status, admitting_department, admitting_diagnosis, admitting_doctor_id, deposit_amount, created_by, admitted_at, running_bill)
      VALUES (?,?,?,?,?,?,?,?,?,NOW(),0)`,
     [
      fid,
      patientId,
      null,
      'pending',
      ov.department || null,
      admitIndication || null,
      null,
      0,
      uid
     ]
    ).catch(() => {});
   }
  }

  try {
   if (req.session && req.session.clinicalNadBypass) {
    delete req.session.clinicalNadBypass['ov:' + visitId];
   }
  } catch (_) {}

  await pool.query("ALTER TABLE tbl_opd_visit ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL").catch(() => {});
  const finalQueueStatus = orderItemsCreated > 0 || wantsAdmit ? 'orders_pending' : 'completed';
  await pool.query(
   `UPDATE tbl_opd_visit SET queue_status=?, completed_at=${finalQueueStatus === 'completed' ? 'NOW()' : 'completed_at'} WHERE id=? AND patient_id=?`,
   [finalQueueStatus, visitId, patientId]
  ).catch(() => {});
  notifyOpdLobbyQueue();

  return res.redirect('/opd-queue?msg=' + encodeURIComponent(flashT(res, 'flash.consultation_saved')))
 } catch (err) {
  console.error('CONSULTATION-NEW POST ERROR:', err.message);
  return res.redirect('/consultation-new?patient_id=' + patientId + '&visit_id=' + visitId + '&err=' + encodeURIComponent(flashT(res, 'flash.save_failed', { message: err.message })));
 }
});

// OPD: assign patient to a physical consultation room (front desk / nursing)
app.post('/opd-queue/carry-forward', requireAuth, requirePerm('opd.write', 'clinical.write', 'nursing.write'), async (req, res) => {
 const vid = parseInt(String(req.body.visit_id || ''), 10) || 0;
 const fid = req.session.facilityId || 1;
 const today = new Date().toISOString().split('T')[0];
 if (vid < 1) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_visit_2')));
 try {
  const result = await opdVisitCarryForward.carryForwardSingleVisit(pool, vid, fid, today);
  if (!result.ok) {
   return res.redirect('/opd-queue?err=' + encodeURIComponent(result.error || 'Could not return visit to today’s queue.'));
  }
  const tk = result.ticketNumber ? ` (${result.ticketNumber})` : '';
  return res.redirect(
   '/opd-queue?msg=' +
    encodeURIComponent(`Visit${tk} returned to today’s queue with a renewed queue position (first in line for today).`)
  );
 } catch (e) {
  console.error('OPD carry-forward manual:', e.message);
  return res.redirect('/opd-queue?err=' + encodeURIComponent(e.message || 'Carry-forward failed.'));
 }
});

app.post('/opd-queue/assign-consultation-room', requireAuth, requirePerm('opd.write', 'nursing.write', 'clinical.write', 'scheduling.read'), async (req, res) => {
 const vid = parseInt(req.body.visit_id, 10) || 0;
 const roomId = parseInt(req.body.consultation_room_id, 10) || 0;
 const fid = req.session.facilityId || 1;
 if (vid < 1) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_visit')))
 try {
  if (roomId < 1) {
   await pool.query(
    'UPDATE tbl_opd_visit SET consultation_room_id = NULL, transferred_to_room_at = NULL WHERE id = ? AND facility_id = ?',
    [vid, fid]
   ).catch(() => {});
   notifyOpdLobbyQueue();
   return res.redirect('/opd-queue?msg=' + encodeURIComponent(flashT(res, 'flash.consultation_room_cleared_for_this_visit')));
  }
  const [[rm]] = await pool.query(
   'SELECT id FROM tbl_consultation_room WHERE id = ? AND facility_id = ? AND status = 1 LIMIT 1',
   [roomId, fid]
  ).catch(() => [[null]]);
  if (!rm) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_consultation_room')));
  await pool.query(
   'UPDATE tbl_opd_visit SET consultation_room_id = ?, transferred_to_room_at = NOW() WHERE id = ? AND facility_id = ?',
   [roomId, vid, fid]
  );
  notifyOpdLobbyQueue();
  res.redirect('/opd-queue?msg=' + encodeURIComponent(flashT(res, 'flash.patient_assigned_to_consultation_room')));
 } catch (e) {
  res.redirect('/opd-queue?err=' + encodeURIComponent(e.message));
 }
});

// Administration: consultation rooms (configure + link doctors to rooms — shared / shifts)
function parseConsultationRoomDoctorIds(body) {
 const raw = body && body.assigned_doctor_ids;
 const arr = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
 const out = [];
 const seen = new Set();
 for (const x of arr) {
  const n = parseInt(String(x), 10) || 0;
  if (n > 0 && !seen.has(n)) {
   seen.add(n);
   out.push(n);
  }
 }
 return out;
}

async function syncConsultationRoomDoctorLinks(pool, roomId, doctorIds) {
 const rid = parseInt(String(roomId), 10) || 0;
 if (rid < 1) return;
 await pool.query('DELETE FROM tbl_consultation_room_doctor WHERE room_id = ?', [rid]).catch(() => {});
 for (const did of doctorIds) {
  await pool
   .query('INSERT IGNORE INTO tbl_consultation_room_doctor (room_id, doctor_id) VALUES (?, ?)', [rid, did])
   .catch(() => {});
 }
}

app.get('/admin/ui-kit', requireAuth, (req, res) => {
 const role = String((req.session.user || {}).role || '');
 if (role !== '1' && role !== '99') {
  return res.redirect('/dashboard?err=' + encodeURIComponent(flashT(res, 'flash.access_denied')));
 }
 res.render('admin-ui-kit', {
  title: pageTitle(res, 'document_titles.ui_kit', 'UI design system — ZAIZENS'),
  pageData: {},
 });
});

app.get('/admin/consultation-rooms', requireAuth, async (req, res) => {
 const role = String((req.session.user || {}).role || '');
 const perms = res.locals.userPerms || [];
 if (!canManageConsultationRooms(role, perms)) {
  return res.redirect('/dashboard?err=' + encodeURIComponent(flashT(res, 'flash.access_denied')));
 }
 const fid = req.session.facilityId || 1;
 try {
  const [rooms] = await pool.query(
   `SELECT r.*, e.first_name AS doc_fn, e.last_name AS doc_ln
      FROM tbl_consultation_room r
      LEFT JOIN tbl_employee e ON e.id = r.assigned_doctor_id AND e.status = 1
     WHERE r.facility_id = ?
     ORDER BY r.status DESC, r.sort_order ASC, r.name ASC`,
   [fid]
  ).catch(() => [[]]);
  const roomList = Array.isArray(rooms) ? rooms : [];
  const roomIds = roomList.map((r) => r.id).filter((id) => id > 0);
  let linkRows = [];
  if (roomIds.length) {
   const [lr] = await pool
    .query(
     `SELECT crd.room_id, crd.doctor_id, e.first_name, e.last_name
        FROM tbl_consultation_room_doctor crd
        JOIN tbl_employee e ON e.id = crd.doctor_id AND e.status = 1
       WHERE crd.room_id IN (?)
       ORDER BY e.last_name, e.first_name`,
     [roomIds]
    )
    .catch(() => [[]]);
   linkRows = Array.isArray(lr) ? lr : [];
  }
  const byRoom = new Map();
  for (const row of linkRows) {
   const rid = row.room_id;
   if (!byRoom.has(rid)) byRoom.set(rid, []);
   byRoom.get(rid).push({
    id: row.doctor_id,
    first_name: row.first_name,
    last_name: row.last_name,
   });
  }
  for (const r of roomList) {
   const docs = [...(byRoom.get(r.id) || [])];
   const leg = parseInt(r.assigned_doctor_id, 10) || 0;
   if (leg && !docs.some((d) => parseInt(d.id, 10) === leg)) {
    docs.unshift({
     id: leg,
     first_name: r.doc_fn,
     last_name: r.doc_ln,
    });
   }
   r.room_doctors = docs;
   r.attached_doctor_ids = docs.map((d) => parseInt(d.id, 10)).filter((n) => n > 0);
  }
  const doctors = await hmsDoctorStaff.fetchActiveDoctors(
   pool,
   'e.id, e.first_name, e.last_name, COALESCE(e.primary_department,"") AS primary_department'
  ).catch(() => []);
  res.render('admin-consultation-rooms', {
   title: pageTitle(res, 'document_titles.consultation_rooms', 'Consultation Rooms — ZAIZENS'),
   rooms: roomList,
   doctors: Array.isArray(doctors) ? doctors : [],
   flash: req.query.msg || null,
   error: req.query.err || null,
  });
 } catch (e) {
  renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });
 }
});

app.post('/admin/consultation-rooms/add', requireAuth, async (req, res) => {
 const role = String((req.session.user || {}).role || '');
 const perms = res.locals.userPerms || [];
 if (!canManageConsultationRooms(role, perms)) {
  return res.status(403).redirect('/dashboard?err=' + encodeURIComponent(flashT(res, 'flash.access_denied')));
 }
 const fid = req.session.facilityId || 1;
 const code = String(req.body.code || '').trim().replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40);
 const name = String(req.body.name || '').trim().slice(0, 160);
 const department = String(req.body.department || '').trim().slice(0, 120) || null;
 const sort_order = parseInt(req.body.sort_order, 10) || 0;
 const docIds = parseConsultationRoomDoctorIds(req.body);
 const assigned_doctor_id = docIds.length ? docIds[0] : 0;
 if (!code || !name) return res.redirect('/admin/consultation-rooms?err=' + encodeURIComponent(flashT(res, 'flash.code_and_name_are_required')));
 try {
  const [ins] = await pool.query(
   `INSERT INTO tbl_consultation_room (facility_id, code, name, department, assigned_doctor_id, sort_order, status)
    VALUES (?,?,?,?,?,?,1)`,
   [fid, code, name, department, assigned_doctor_id > 0 ? assigned_doctor_id : null, sort_order]
  );
  const newId = ins && ins.insertId ? parseInt(String(ins.insertId), 10) : 0;
  if (newId > 0 && docIds.length) await syncConsultationRoomDoctorLinks(pool, newId, docIds);
  res.redirect('/admin/consultation-rooms?msg=' + encodeURIComponent(flashT(res, 'flash.room_created')));
 } catch (e) {
  res.redirect('/admin/consultation-rooms?err=' + encodeURIComponent(e.message));
 }
});

app.post('/admin/consultation-rooms/:id/update', requireAuth, async (req, res) => {
 const role = String((req.session.user || {}).role || '');
 const perms = res.locals.userPerms || [];
 if (!canManageConsultationRooms(role, perms)) {
  return res.status(403).redirect('/dashboard?err=' + encodeURIComponent(flashT(res, 'flash.access_denied')));
 }
 const id = parseInt(req.params.id, 10) || 0;
 const fid = req.session.facilityId || 1;
 const name = String(req.body.name || '').trim().slice(0, 160);
 const department = String(req.body.department || '').trim().slice(0, 120) || null;
 const sort_order = parseInt(req.body.sort_order, 10) || 0;
 const docIds = parseConsultationRoomDoctorIds(req.body);
 const assigned_doctor_id = docIds.length ? docIds[0] : 0;
 const status = parseInt(req.body.status, 10) ? 1 : 0;
 if (id < 1 || !name) return res.redirect('/admin/consultation-rooms?err=' + encodeURIComponent(flashT(res, 'flash.invalid_update')));
 try {
  await pool.query(
   `UPDATE tbl_consultation_room SET name=?, department=?, sort_order=?, assigned_doctor_id=?, status=?
     WHERE id=? AND facility_id=?`,
   [name, department, sort_order, assigned_doctor_id > 0 ? assigned_doctor_id : null, status, id, fid]
  );
  await syncConsultationRoomDoctorLinks(pool, id, docIds);
  res.redirect('/admin/consultation-rooms?msg=' + encodeURIComponent(flashT(res, 'flash.room_updated')));
 } catch (e) {
  res.redirect('/admin/consultation-rooms?err=' + encodeURIComponent(e.message));
 }
});

// NURSING: VITALS REGISTRY
app.get('/nursing/vitals', requireAuth, async (req, res) => {
 try {
  const prePid = parseInt(req.query.patient_id, 10) || 0;
  const preVid = parseInt(req.query.opd_visit_id, 10) || 0;
  const redirectTo = safeInternalRedirectPath(req.query.redirect_to);

  const [patients] = await pool.query(
   "SELECT id, first_name, last_name FROM tbl_patient WHERE status=1 ORDER BY id DESC LIMIT 300"
  ).catch(() => [[]]);
  let list = Array.isArray(patients) ? patients : [];
  const inList = prePid > 0 && list.some((p) => Number(p.id) === prePid);
  if (prePid > 0 && !inList) {
   const [[oneP]] = await pool
    .query('SELECT id, first_name, last_name FROM tbl_patient WHERE id=? LIMIT 1', [prePid])
    .catch(() => [[null]]);
   if (oneP && oneP.id) list = [oneP, ...list];
  }

  res.render('nursing-vitals', {
   title: pageTitle(res, 'document_titles.nursing_vitals', 'Nursing Vitals — ZAIZENS'),
   patients: list,
   prefillPatientId: prePid > 0 ? prePid : null,
   prefillVisitId: preVid > 0 ? preVid : null,
   redirectTo: redirectTo || null,
   flash: req.query.msg || null,
   error: req.query.err || null
  });
 } catch (err) {
  console.error('NURSING VITALS GET ERROR:', err.message);
  renderAppError(res, 500, 'page.load_vitals', 'Vitals page load failure.', { detail: err.message })
 }
});

app.post('/nursing/vitals/save', requireAuth, async (req, res) => {
 const pid = parseInt(req.body.patient_id) || 0;
 const aid = parseInt(req.body.admission_id) || 0;
 const vid = parseInt(req.body.opd_visit_id) || 0;
 const uid = req.session.userId || req.session.user?.id || 1;
 const fid = req.session.facilityId || 1;

 if (pid < 1) {
  const rt0 = safeInternalRedirectPath(req.body.redirect_to);
  const vid0 = parseInt(req.body.opd_visit_id, 10) || 0;
  let u = '/nursing/vitals?err=' + encodeURIComponent(flashT(res, 'flash.select_patient_first'));
  if (vid0 > 0) u += '&opd_visit_id=' + vid0;
  if (rt0) u += '&redirect_to=' + encodeURIComponent(rt0);
  return res.redirect(u);
 }

 const staffRoleVitals = String((req.session.user || {}).role || '');
 if (String(req.body.source_station || '').trim().toLowerCase() === 'doctor') {
  const backDoc = safeInternalRedirectPath(req.body.redirect_to) || '/nursing/vitals';
  return res.redirect(
   backDoc +
    (backDoc.includes('?') ? '&' : '?') +
    'err=' +
    encodeURIComponent(clinicalMsgT(res, 'doctor_forbidden'))
  );
 }

 const vitalsGate = await assertOpdVitalsSaveAllowed(pool, {
  patientId: pid,
  opdVisitId: vid,
  facilityId: fid,
  userRole: staffRoleVitals,
  admissionId: aid,
 });
 if (!vitalsGate.ok) {
  const rtGate = safeInternalRedirectPath(req.body.redirect_to);
  const vidGate = parseInt(req.body.opd_visit_id, 10) || 0;
  let uGate =
   (rtGate || '/nursing/vitals') +
   ((rtGate || '/nursing/vitals').includes('?') ? '&' : '?') +
   'err=' +
   encodeURIComponent(clinicalMsgT(res, vitalsGate));
  if (pid > 0) uGate += '&patient_id=' + pid;
  if (vidGate > 0) uGate += '&opd_visit_id=' + vidGate;
  if (rtGate) uGate += '&redirect_to=' + encodeURIComponent(rtGate);
  return res.redirect(uGate);
 }

 const bp_sys = req.body.bp_sys ? parseInt(req.body.bp_sys) : null;
 const bp_dia = req.body.bp_dia ? parseInt(req.body.bp_dia) : null;
 const heart_rate = req.body.heart_rate ? parseInt(req.body.heart_rate) : null;
 const temp_c = req.body.temp_c ? parseFloat(req.body.temp_c) : null;
 const spo2 = req.body.spo2 ? parseInt(req.body.spo2) : null;
 const rr = req.body.rr ? parseInt(req.body.rr) : null;
 const weight_kg = req.body.weight_kg ? parseFloat(req.body.weight_kg) : null;
 const height_cm = req.body.height_cm ? parseInt(req.body.height_cm) : null;
 const waist_cm = req.body.waist_cm ? parseFloat(req.body.waist_cm) : null;

 try {
  // Ensure facility FK target exists
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_facility (
     id INT PRIMARY KEY,
     name VARCHAR(255) NULL,
     status TINYINT DEFAULT 1,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )
  `).catch(() => {});
  await pool.query(
   "INSERT IGNORE INTO tbl_facility (id, name, status, created_at) VALUES (?, ?, 1, NOW())",
   [fid, `Facility ${fid}`]
  ).catch(() => {});

  // Ensure vitals table exists + columns needed by older schemas
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_vital_sign (
     id INT AUTO_INCREMENT PRIMARY KEY,
     facility_id INT DEFAULT 1,
     patient_id INT NOT NULL,
     opd_visit_id INT NULL,
     admission_id INT NULL,
     bp_sys INT NULL,
     bp_dia INT NULL,
     heart_rate INT NULL,
     temp_c DECIMAL(5,2) NULL,
     spo2 INT NULL,
     rr INT NULL,
     weight_kg DECIMAL(6,2) NULL,
     height_cm INT NULL,
     waist_cm DECIMAL(6,2) NULL,
     notes TEXT NULL,
     created_by INT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY (patient_id),
     KEY (opd_visit_id),
     KEY (admission_id)
   )
  `).catch(() => {});

  await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS facility_id INT DEFAULT 1").catch(() => {});
  await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS opd_visit_id INT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS admission_id INT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS waist_cm DECIMAL(6,2) NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS created_by INT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP").catch(() => {});

  const resolvedVid = await resolveOpdVisitIdForVitals(pool, {
    patientId: pid,
    opdVisitId: vid,
    facilityId: fid,
  });
  const sourceStation = aid > 0 ? 'nursing' : resolvedVid > 0 ? 'opd' : 'nursing';
  const vitalId = await insertVitalSign(pool, {
    facility_id: fid,
    patient_id: pid,
    opd_visit_id: resolvedVid || null,
    admission_id: aid || null,
    bp_sys,
    bp_dia,
    heart_rate,
    temp_c,
    spo2,
    rr,
    weight_kg,
    height_cm,
    waist_cm,
    recorded_by: uid,
    created_by: uid,
    source_station: sourceStation,
  });

  if (resolvedVid > 0 && !aid) {
    await afterOpdVitalsSaved(pool, {
      vitalSignId: vitalId,
      visitId: resolvedVid,
      patientId: pid,
      userId: uid,
      triageNotes: req.body.triage_notes || req.body.notes || null,
    });
  }

  // Redirect back to origin if provided
  const back = (req.body.redirect_to || '').toString().trim();
  if (back && back.startsWith('/')) return res.redirect(back + (back.includes('?') ? '&' : '?') + 'msg=' + encodeURIComponent(flashT(res, 'flash.vitals_saved')));
  return res.redirect('/nursing/vitals?msg=' + encodeURIComponent(flashT(res, 'flash.vitals_saved')))
 } catch (err) {
  console.error('NURSING VITALS SAVE ERROR:', err.message);
  const rtE = safeInternalRedirectPath(req.body.redirect_to);
  const vidE = parseInt(req.body.opd_visit_id, 10) || 0;
  let u = '/nursing/vitals?err=' + encodeURIComponent(flashT(res, 'flash.save_failed', { message: err.message }));
  if (pid > 0) u += '&patient_id=' + pid;
  if (vidE > 0) u += '&opd_visit_id=' + vidE;
  if (rtE) u += '&redirect_to=' + encodeURIComponent(rtE);
  return res.redirect(u);
 }
});

// OPD TRIAGE SHORTCUT + SUBMIT (Station 3)
app.get('/opd-queue/triage', requireAuth, (req, res) => {
 // Some menus/links use this path; keep it working.
 return res.redirect('/opd-queue?status=triage');
});

app.post('/opd-queue/triage', requireAuth, async (req, res) => {
 const {
  visit_id, patient_id,
  bp_sys, bp_dia, heart_rate, temp_c, spo2, rr, weight_kg, height_cm,
  triage_notes
 } = req.body;

 const vid = parseInt(visit_id) || 0;
 const pid = parseInt(patient_id) || 0;
 const uid = req.session.userId || req.session.user?.id || 1;
 const fid = req.session.facilityId || 1;

 if (vid < 1 || pid < 1) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_triage_request')))

 try {
  const staffRoleTriage = String((req.session.user || {}).role || '');
  const fidTriage = req.session.facilityId || 1;
  const [[visitRow]] = await pool
   .query('SELECT * FROM tbl_opd_visit WHERE id = ? AND patient_id = ? LIMIT 1', [vid, pid])
   .catch(() => [[null]]);
  if (!visitRow) {
   return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.visit_not_found')));
  }
  const hasVitalsAlready = await opdVisitHasVitalsRecorded(pool, vid, pid);
  const triageGate = await clinicalBusinessRules.assertOpdVisitVitalsAllowed(pool, visitRow, fidTriage, {
   userRole: staffRoleTriage,
   blockIfVitalsExist: true,
   hasVitalsAlready,
  });
  if (!triageGate.ok) {
   return res.redirect(
    '/opd-queue?err=' + encodeURIComponent(clinicalMsgT(res, triageGate))
   );
  }

  // Ensure triage fields exist on visit table
  await pool.query("ALTER TABLE tbl_opd_visit ADD COLUMN IF NOT EXISTS triage_notes TEXT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_opd_visit ADD COLUMN IF NOT EXISTS triage_done_by INT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_opd_visit ADD COLUMN IF NOT EXISTS triage_done_at DATETIME NULL").catch(() => {});

  // Ensure vitals table exists (lightweight)
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_vital_sign (
     id INT AUTO_INCREMENT PRIMARY KEY,
     patient_id INT NOT NULL,
     opd_visit_id INT NULL,
     bp_sys INT NULL,
     bp_dia INT NULL,
     heart_rate INT NULL,
     temp_c DECIMAL(5,2) NULL,
     spo2 INT NULL,
     rr INT NULL,
     weight_kg DECIMAL(6,2) NULL,
     height_cm INT NULL,
     notes TEXT NULL,
     created_by INT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY (patient_id),
     KEY (opd_visit_id)
   )
  `).catch(() => {});

  // If tbl_vital_sign existed from older schema, add missing columns
  await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS facility_id INT DEFAULT 1").catch(() => {});
  await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS opd_visit_id INT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS notes TEXT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS created_by INT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP").catch(() => {});

  // Ensure facility row exists for FK constraints
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_facility (
     id INT PRIMARY KEY,
     name VARCHAR(255) NULL,
     status TINYINT DEFAULT 1,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )
  `).catch(() => {});
  await pool.query(
   "INSERT IGNORE INTO tbl_facility (id, name, status, created_at) VALUES (?, ?, 1, NOW())",
   [fid, `Facility ${fid}`]
  ).catch(() => {});

  // Save vitals (optional values allowed)
  const vitalId = await insertVitalSign(pool, {
    facility_id: fid,
    patient_id: pid,
    opd_visit_id: vid,
    bp_sys: bp_sys ? parseInt(bp_sys, 10) : null,
    bp_dia: bp_dia ? parseInt(bp_dia, 10) : null,
    heart_rate: heart_rate ? parseInt(heart_rate, 10) : null,
    temp_c: temp_c ? parseFloat(temp_c) : null,
    spo2: spo2 ? parseInt(spo2, 10) : null,
    rr: rr ? parseInt(rr, 10) : null,
    weight_kg: weight_kg ? parseFloat(weight_kg) : null,
    height_cm: height_cm ? parseInt(height_cm, 10) : null,
    notes: (triage_notes || '').trim() || null,
    recorded_by: uid,
    created_by: uid,
    source_station: 'opd',
  });

  await afterOpdVitalsSaved(pool, {
    vitalSignId: vitalId,
    visitId: vid,
    patientId: pid,
    userId: uid,
    triageNotes: triage_notes,
  });

  return res.redirect('/opd-queue?msg=' + encodeURIComponent(flashT(res, 'flash.triage_saved_and_patient_advanced_to_waiting_doctor')))
 } catch (err) {
  console.error('TRIAGE ERROR:', err.message);
  return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.save_failed', { message: err.message })));
 }
});


// TEMPORARY ROUTE TO RUN DB MIGRATIONS ON PRODUCTION
app.get('/migrate-rosters', async (req, res) => {
 try {
 await pool.query(`
 CREATE TABLE IF NOT EXISTS tbl_nurse_roster (
 id INT AUTO_INCREMENT PRIMARY KEY,
 facility_id INT DEFAULT 1,
 employee_id INT NOT NULL,
 work_date DATE NOT NULL,
 shift_type ENUM('day', 'night', 'off') DEFAULT 'off',
 status TINYINT DEFAULT 1,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY (employee_id, work_date)
 )
 `);
 
 await pool.query(`
 CREATE TABLE IF NOT EXISTS tbl_doctor_roster (
 id INT AUTO_INCREMENT PRIMARY KEY,
 facility_id INT DEFAULT 1,
 employee_id INT NOT NULL,
 duty_date DATE NOT NULL,
 duty_type ENUM('on_duty', 'night', 'off') DEFAULT 'off',
 status TINYINT DEFAULT 1,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY (employee_id, duty_date)
 )
 `);
 
 res.send("<h1>Migration note</h1><p>Rosters use <code>tbl_nurse_shift_schedule</code> and <code>tbl_doctor_duty_schedule</code> (same as the PHP app). Legacy <code>tbl_*_roster</code> tables are not used.</p><a href='/nurse-roster'>Nurse roster</a> · <a href='/doctor-roster'>Doctor roster</a>");
 } catch (err) {
 res.status(500).send("<h1>Migration Failed</h1><p>" + err.message + "</p>");
 }
});

// NURSE ROSTER
const hmsRoster = require('./lib/hmsRoster');

app.get('/nurse-roster', requireAuth, requirePerm('nurse_duty.read', 'nurse_duty.write'), async (req, res) => {
 const view = hmsRoster.parseView(req.query.view);
 let date = String(req.query.date || hmsRoster.isoToday()).slice(0, 10);
 if (req.query.month) date = hmsRoster.firstDayOfMonth(String(req.query.month) + '-01');
 const facilityId = hmsRoster.resolveFacilityId(req);
 const cfg = hmsRoster.rosterKindConfig('nurse');

 try {
 await hmsRoster.ensureNurseRosterSchema(pool);
 const nurses = await hmsRoster.fetchRosterStaff(pool, 'nurse');
 const rosterRows = await hmsRoster.fetchRosterRows(pool, 'nurse', facilityId, view, date);

 const rd = hmsRoster.buildRosterRenderData({
  kind: 'nurse',
  view,
  date,
  dateField: cfg.dateField,
  typeField: cfg.typeField,
  staff: nurses,
  rosterRows,
 });

 const nr = String((req.session.user || {}).role || '');
 res.render('nurse-roster', {
  title: pageTitle(res, 'document_titles.nurse_roster', 'Nurse Shift Roster — ZAIZENS'),
  nurses,
  roster: rd.roster,
  view: rd.view,
  date: rd.date,
  weekStart: rd.weekStart,
  weekDays: rd.weekDays,
  monthMeta: rd.monthMeta,
  monthWeeks: rd.monthWeeks,
  staffWithWeek: rd.staffWithWeek,
  staffDayShift: rd.staffDayShift,
  staffDayDetails: rd.staffDayDetails,
  shiftDefaults: hmsRoster.NURSE_SHIFT_DEFAULTS,
  period: rd.period,
  prevNavDate: rd.prevNavDate,
  nextNavDate: rd.nextNavDate,
  isAdminOrSuper: nr === '1' || nr === '99',
  flash: req.query.msg || null,
  error: req.query.err || null,
 });
 } catch (err) {
 console.error('ROSTER LOAD ERROR:', err);
 renderAppError(res, 500, 'page.load_roster', 'Roster load failure.', { detail: err.message })
 }
});

app.post('/nurse-roster/save', requireAuth, requireAdminOrSuper, async (req, res) => {
 const { date, view } = req.body;
 const shifts = hmsRoster.parseNurseShiftsFromBody(req.body);
 const facilityId = hmsRoster.resolveFacilityId(req);
 if (!Object.keys(shifts).length) {
  return res.redirect(
   hmsRoster.rosterRedirectUrl('/nurse-roster', view || 'day', date, { err: 'No shifts received — save again' })
  );
 }
 try {
 await hmsRoster.ensureNurseRosterSchema(pool);
 await pool.query('START TRANSACTION');
 await hmsRoster.saveRosterShifts(pool, 'nurse', facilityId, date, shifts);
 await pool.query('COMMIT');
 res.redirect(hmsRoster.rosterRedirectUrl('/nurse-roster', view || 'day', date, { msg: 'Roster saved successfully' }));
 } catch (err) {
 await pool.query('ROLLBACK').catch(() => {});
 console.error('NURSE ROSTER SAVE:', err);
 res.redirect(hmsRoster.rosterRedirectUrl('/nurse-roster', req.body.view || 'day', req.body.date, { err: 'Save failure' }));
 }
});

app.post('/nurse-roster/copy', requireAuth, requireAdminOrSuper, async (req, res) => {
 const { from_date, to_date, view } = req.body;
 const facilityId = hmsRoster.resolveFacilityId(req);
 try {
 await hmsRoster.ensureNurseRosterSchema(pool);
 await hmsRoster.copyRosterDay(pool, 'nurse', facilityId, from_date, to_date);
 res.redirect(
  hmsRoster.rosterRedirectUrl('/nurse-roster', view || 'day', to_date, { msg: 'Roster copied successfully' })
 );
 } catch (err) {
 console.error('NURSE ROSTER COPY:', err);
 res.redirect(hmsRoster.rosterRedirectUrl('/nurse-roster', view || 'day', to_date, { err: 'Copy failure' }));
 }
});

// WALLET MANAGEMENT (Admin)
app.get('/wallet-management', requireAuth, async (req, res) => {
 const q = String(req.query.q || '').trim();
 try {
  // Ensure wallet tables exist (dev convenience)
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_patient_wallet (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    balance DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    qr_token VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_wallet_patient (patient_id)
   )
  `).catch(() => {});
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_patient_wallet_txn (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_id INT NOT NULL,
    txn_type VARCHAR(40) DEFAULT NULL,
    direction ENUM('cr','dr') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) DEFAULT 0,
    reference_id VARCHAR(80) DEFAULT NULL,
    notes TEXT,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_wallet (wallet_id)
   )
  `).catch(() => {});

  const params = [];
  let where = '';
  if (q) {
   where = 'WHERE (p.first_name LIKE ? OR p.last_name LIKE ? OR p.phone LIKE ? OR CAST(p.id AS CHAR) LIKE ?)';
   params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const [wallets] = await pool.query(
   `
    SELECT
      w.id AS wallet_id,
      w.patient_id,
      w.balance,
      w.status,
      w.qr_token,
      w.updated_at,
      p.first_name,
      p.last_name,
      p.phone
    FROM tbl_patient_wallet w
    JOIN tbl_patient p ON p.id = w.patient_id
    ${where}
    ORDER BY w.updated_at DESC
    LIMIT 200
   `,
   params
  ).catch(() => [[]]);

  res.render('wallet-management', {
   title: pageTitle(res, 'document_titles.wallet_management', 'Wallet Management — ZAIZENS'),
   wallets: Array.isArray(wallets) ? wallets : [],
   searchQ: q,
   flash: req.query.msg || null,
   error: req.query.err || null
  });
 } catch (err) {
  console.error('WALLET MANAGEMENT ERROR:', err.message);
  renderAppError(res, 500, 'page.load_wallet', 'Wallet load failure.', { detail: err.message })
 }
});

app.post('/wallet-management/topup', requireAuth, async (req, res) => {
 const wid = parseInt(req.body.wallet_id) || 0;
 const amount = parseFloat(req.body.amount) || 0;
 const notes = String(req.body.notes || '').trim();
 const uid = req.session.userId || req.session.user?.id || null;
 const facilityId = Math.max(1, parseInt(req.session.facilityId || req.session.user?.facility_id || req.session.user?.facilityId || 1, 10) || 1);
 if (wid < 1 || amount <= 0) return res.redirect('/wallet-management?err=' + encodeURIComponent(flashT(res, 'flash.invalid_topup_data')))
 const conn = await pool.getConnection();
 let txnId = 0;
 let topupRef = '';
 let patientLabel = '';
 try {
  await conn.beginTransaction();
  const [[wallet]] = await conn.query(
   `SELECT w.id, w.balance, w.patient_id, p.first_name, p.last_name
    FROM tbl_patient_wallet w
    LEFT JOIN tbl_patient p ON p.id = w.patient_id
    WHERE w.id = ? FOR UPDATE`,
   [wid]
  );
  if (!wallet) {
   await conn.rollback();
   conn.release();
   return res.redirect('/wallet-management?err=' + encodeURIComponent(flashT(res, 'flash.wallet_not_found')))
  }
  patientLabel = [wallet.first_name, wallet.last_name].filter(Boolean).join(' ').trim();
  const cur = parseFloat(wallet.balance || 0);
  const next = cur + amount;
  topupRef = 'TOPUP-' + Date.now();
  await conn.query('UPDATE tbl_patient_wallet SET balance = ?, updated_at = NOW() WHERE id = ?', [next, wid]);
  const [ins] = await conn.query(
   `INSERT INTO tbl_patient_wallet_txn (wallet_id, txn_type, direction, amount, balance_after, reference_id, notes, created_by)
    VALUES (?, 'topup_cash', 'cr', ?, ?, ?, ?, ?)`,
   [wid, amount, next, topupRef, notes || null, uid]
  );
  txnId = parseInt(ins?.insertId || 0, 10) || 0;
  await conn.commit();
  conn.release();
  if (txnId > 0) {
   const { postWalletTopupJournal } = require('./lib/walletTopupJournal');
   await postWalletTopupJournal(pool, {
    facilityId,
    walletTxnId: txnId,
    amount,
    createdBy: uid,
    patientLabel,
    reference: topupRef,
    notes,
    paymentMethod: 'Cash',
   }).catch((e) => console.warn('[wallet-topup-journal]', txnId, e.message || e));
  }
  res.redirect('/wallet-management?msg=' + encodeURIComponent(flashT(res, 'flash.top_up_processed_successfully')))
 } catch (err) {
  await conn.rollback().catch(() => {});
  conn.release();
  console.error('WALLET TOPUP ERROR:', err.message);
  res.redirect('/wallet-management?err=' + encodeURIComponent(err.message));
 }
});

// WALLET HUB (Patient Wallets)
const walletHub = require('./lib/walletHub');

app.get('/wallet', requireAuth, requirePerm('cashier.read','cashier.write','billing.read','billing.write','accounting.read'), async (req, res) => {
 const q = String(req.query.q || '').trim();
 const facilityId = Math.max(1, parseInt(req.session.facilityId || req.session.user?.facility_id || req.session.user?.facilityId || 1, 10) || 1);
 try {
  await walletHub.ensureWalletTables(pool);

  let wallets = [];
  let pendingCreate = [];
  if (q) {
   const found = await walletHub.searchPatients(pool, q, 250, facilityId);
   wallets = found.withWallet;
   pendingCreate = found.withoutWallet;
  } else {
   const [rows] = await pool.query(
    `
    SELECT
      w.id,
      w.patient_id,
      w.balance,
      w.status,
      w.qr_token,
      w.updated_at,
      p.first_name,
      p.last_name,
      p.phone,
      CONCAT('#PT', LPAD(p.id,4,'0')) AS pt_label
    FROM tbl_patient_wallet w
    JOIN tbl_patient p ON p.id = w.patient_id AND COALESCE(p.status, 1) = 1
    WHERE w.status='active'
    ORDER BY w.updated_at DESC
    LIMIT 250
   `
   ).catch(() => [[]]);
   wallets = Array.isArray(rows) ? rows : [];
  }

  const [[s1]] = await pool.query(
   "SELECT COUNT(*) AS c, COALESCE(SUM(balance),0) AS s FROM tbl_patient_wallet WHERE status='active'"
  ).catch(() => [[{ c: 0, s: 0 }]]);
  const [[s2]] = await pool.query(
   "SELECT COUNT(*) AS c FROM tbl_patient_wallet WHERE status='active' AND balance > 0"
  ).catch(() => [[{ c: 0 }]]);
  const [[s3]] = await pool.query(
   "SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS v FROM tbl_patient_wallet_txn WHERE DATE(created_at)=CURDATE()"
  ).catch(() => [[{ c: 0, v: 0 }]]);

  res.render('wallet', {
   title: pageTitle(res, 'document_titles.patient_wallets', 'Patient Wallets — ZAIZENS'),
   wallets: Array.isArray(wallets) ? wallets : [],
   pendingCreate: Array.isArray(pendingCreate) ? pendingCreate : [],
   q,
   stats: {
    total_trust: parseFloat(s1?.s || 0) || 0,
    total_wallets: parseInt(s1?.c || 0) || 0,
    funded_wallets: parseInt(s2?.c || 0) || 0,
    txn_today: parseInt(s3?.c || 0) || 0,
    vol_today: parseFloat(s3?.v || 0) || 0
   },
   flash: req.query.msg || null,
   err: req.query.err || null,
   pageNav: {
    homeHref: aclLayout.staffHomeUrlFromSession(req.session) || '/dashboard',
    backFallback: '/cashier',
    backLabel: 'Back',
    homeLabel: 'Home',
   },
  });
 } catch (err) {
  console.error('WALLET HUB ERROR:', err.message);
  renderAppError(res, 500, 'page.load_wallet_page', 'Wallet page load failure.', { detail: err.message })
 }
});

app.post('/wallet/topup', requireAuth, async (req, res) => {
 const wid = parseInt(req.body.wallet_id) || 0;
 const amount = parseFloat(req.body.amount) || 0;
 const notes = String(req.body.notes || '').trim();
 const uid = req.session.userId || req.session.user?.id || null;
 const facilityId = Math.max(1, parseInt(req.session.facilityId || req.session.user?.facility_id || req.session.user?.facilityId || 1, 10) || 1);
 if (wid < 1 || amount <= 0) return res.redirect('/wallet?err=' + encodeURIComponent(flashT(res, 'flash.invalid_topup_data')))
 const conn = await pool.getConnection();
 let txnId = 0;
 let topupRef = '';
 let patientLabel = '';
 try {
  await conn.beginTransaction();
  const [[wallet]] = await conn.query(
   `SELECT w.id, w.balance, w.patient_id, p.first_name, p.last_name
    FROM tbl_patient_wallet w
    LEFT JOIN tbl_patient p ON p.id = w.patient_id
    WHERE w.id=? AND w.status='active' FOR UPDATE`,
   [wid]
  );
  if (!wallet) {
   await conn.rollback();
   conn.release();
   return res.redirect('/wallet?err=' + encodeURIComponent(flashT(res, 'flash.wallet_not_found')))
  }
  patientLabel = [wallet.first_name, wallet.last_name].filter(Boolean).join(' ').trim();
  const cur = parseFloat(wallet.balance || 0);
  const next = cur + amount;
  topupRef = 'TOPUP-' + Date.now();
  await conn.query('UPDATE tbl_patient_wallet SET balance=?, updated_at=NOW() WHERE id=?', [next, wid]);
  const [ins] = await conn.query(
   `INSERT INTO tbl_patient_wallet_txn
    (wallet_id, txn_type, direction, amount, balance_after, reference_id, notes, created_by)
    VALUES (?, 'deposit_cash', 'cr', ?, ?, ?, ?, ?)`,
   [wid, amount, next, topupRef, notes || null, uid]
  );
  txnId = parseInt(ins?.insertId || 0, 10) || 0;
  await conn.commit();
  conn.release();
  if (txnId > 0) {
   const { postWalletTopupJournal } = require('./lib/walletTopupJournal');
   await postWalletTopupJournal(pool, {
    facilityId,
    walletTxnId: txnId,
    amount,
    createdBy: uid,
    patientLabel,
    reference: topupRef,
    notes,
    paymentMethod: 'Cash',
   }).catch((e) => console.warn('[wallet-topup-journal]', txnId, e.message || e));
  }
  res.redirect('/wallet?msg=' + encodeURIComponent(flashT(res, 'flash.top_up_processed')))
 } catch (err) {
  await conn.rollback().catch(() => {});
  conn.release();
  console.error('WALLET TOPUP ERROR:', err.message);
  res.redirect('/wallet?err=' + encodeURIComponent(err.message));
 }
});

app.post('/wallet/create', requireAuth, requirePerm('cashier.read', 'cashier.write', 'billing.read', 'billing.write', 'accounting.read'), async (req, res) => {
 const patientId = parseInt(req.body.patient_id, 10) || 0;
 const q = String(req.body.q || '').trim();
 const facilityId = Math.max(1, parseInt(req.session.facilityId || req.session.user?.facility_id || req.session.user?.facilityId || 1, 10) || 1);
 if (patientId < 1) {
  return res.redirect('/wallet' + (q ? '?q=' + encodeURIComponent(q) + '&err=' + encodeURIComponent(flashT(res, 'flash.invalid_patient_2')) : '?err=Invalid+patient'));
 }
 try {
  await walletHub.ensureWalletTables(pool);
  const wallet = await walletHub.ensureWalletForPatient(pool, patientId, facilityId);
  if (!wallet) {
   return res.redirect('/wallet?q=' + encodeURIComponent(q) + '&err=' + encodeURIComponent(flashT(res, 'flash.could_not_create_wallet')));
  }
  const msg = encodeURIComponent(flashT(res, 'flash.wallet_created_successfully_you_can_top_up_now'));
  res.redirect('/wallet?q=' + encodeURIComponent(q) + '&msg=' + msg);
 } catch (err) {
  console.error('WALLET CREATE:', err.message);
  res.redirect('/wallet?q=' + encodeURIComponent(q) + '&err=' + encodeURIComponent(err.message));
 }
});

app.post('/api/wallet/create', requireAuth, requirePerm('cashier.read', 'cashier.write', 'billing.read', 'billing.write', 'accounting.read'), async (req, res) => {
 const patientId = parseInt(req.body.patient_id, 10) || 0;
 const facilityId = Math.max(1, parseInt(req.session.facilityId || req.session.user?.facility_id || req.session.user?.facilityId || 1, 10) || 1);
 if (patientId < 1) return res.status(400).json({ ok: false, error: 'Invalid patient_id' });
 try {
  await walletHub.ensureWalletTables(pool);
  const wallet = await walletHub.ensureWalletForPatient(pool, patientId, facilityId);
  if (!wallet) return res.status(500).json({ ok: false, error: 'Could not create wallet' });
  const row = await walletHub.fetchWalletDisplayRow(pool, wallet.id);
  res.json({ ok: true, result: walletHub.mapSearchResult(row) });
 } catch (err) {
  console.error('API WALLET CREATE:', err.message);
  res.status(500).json({ ok: false, error: err.message });
 }
});

/** Patient search for wallet cash top-up modal (does not auto-create wallets). */
app.get('/api/wallet/patients-search', requireAuth, requirePerm('cashier.read', 'cashier.write', 'billing.read', 'billing.write', 'accounting.read'), async (req, res) => {
 const q = String(req.query.q || '').trim();
 const facilityId = Math.max(1, parseInt(req.session.facilityId || req.session.user?.facility_id || req.session.user?.facilityId || 1, 10) || 1);
 if (q.length < 1) return res.json({ ok: true, results: [] });
 try {
  await walletHub.ensureWalletTables(pool);
  const { withWallet, withoutWallet } = await walletHub.searchPatients(pool, q, 25, facilityId);
  const results = []
   .concat(withWallet.map(walletHub.mapSearchResult))
   .concat(withoutWallet.map(walletHub.mapSearchResult))
   .filter(Boolean);
  res.json({ ok: true, results });
 } catch (err) {
  console.error('wallet patients-search:', err.message);
  res.status(500).json({ ok: false, results: [], error: err.message });
 }
});

app.get('/api/wallet/:id/transactions', requireAuth, async (req, res) => {
 const wid = parseInt(req.params.id) || 0;
 if (wid < 1) return res.json({ ok: false, txns: [] });
 try {
  const [txns] = await pool.query(
   `SELECT
     t.*,
     CONCAT(e.first_name,' ',e.last_name) AS staff_name
    FROM tbl_patient_wallet_txn t
    LEFT JOIN tbl_employee e ON e.id = t.created_by
    WHERE t.wallet_id=?
    ORDER BY t.id DESC
    LIMIT 60`,
   [wid]
  ).catch(() => [[]]);
  res.json({ ok: true, txns: Array.isArray(txns) ? txns : [] });
 } catch (err) {
  res.json({ ok: false, txns: [], error: err.message });
 }
});

// INSURANCE CARRIERS + CLAIMS
app.get('/insurance', requireAuth, requirePerm('insurance.read','insurance.write','accounting.read','accounting.write'), async (req, res) => {
 try {
  // Carriers table (dev convenience)
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_insurance_carrier (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(40) DEFAULT NULL,
    email VARCHAR(120) DEFAULT NULL,
    status TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )
  `).catch(() => {});

  // Small Cameroon catalog (used by insurance.ejs dropdown)
  const catalog = [
   { code: 'CNPS', name: 'CNPS' },
   { code: 'ACTIVA', name: 'Activa Assurance' },
   { code: 'SAHAM', name: 'SAHAM Assurance' },
   { code: 'AXA', name: 'AXA' },
   { code: 'ALLIANZ', name: 'Allianz' },
   { code: 'OTHER', name: 'Other / Unlisted' }
  ];

  const [carriers] = await pool.query('SELECT * FROM tbl_insurance_carrier ORDER BY name').catch(() => [[]]);
  res.render('insurance', {
   title: pageTitle(res, 'document_titles.insurance_carriers', 'Insurance Carriers — ZAIZENS'),
   catalog,
   carriers: Array.isArray(carriers) ? carriers : [],
   flash: req.query.msg || null,
   error: req.query.err || null
  });
 } catch (err) {
  console.error('INSURANCE ERROR:', err.message);
  renderAppError(res, 500, 'page.load_insurance', 'Insurance load failure.', { detail: err.message })
 }
});

app.post('/insurance/add', requireAuth, requirePerm('insurance.write','accounting.write'), async (req, res) => {
 const choice = String(req.body.carrier_choice || '').trim();
 const other = String(req.body.other_name || '').trim();
 if (!choice) return res.redirect('/insurance?err=' + encodeURIComponent(flashT(res, 'flash.select_a_carrier')))
 const code = choice === 'OTHER' ? ('OTHER-' + Date.now()) : choice;
 const name = choice === 'OTHER' ? other : choice;
 if (!name) return res.redirect('/insurance?err=' + encodeURIComponent(flashT(res, 'flash.carrier_name_is_required')))
 try {
  await pool.query(
   'INSERT IGNORE INTO tbl_insurance_carrier (code,name,status,created_at) VALUES (?,?,1,NOW())',
   [code, name]
  );
  res.redirect('/insurance?msg=' + encodeURIComponent(flashT(res, 'flash.carrier_saved')))
 } catch (err) {
  res.redirect('/insurance?err=' + encodeURIComponent(err.message));
 }
});

app.post('/insurance/toggle/:id', requireAuth, requirePerm('insurance.write','accounting.write'), async (req, res) => {
 const id = parseInt(req.params.id) || 0;
 if (id < 1) return res.redirect('/insurance?err=' + encodeURIComponent(flashT(res, 'flash.invalid_carrier')))
 try {
  await pool.query('UPDATE tbl_insurance_carrier SET status = IF(status=1,0,1) WHERE id=?', [id]);
  res.redirect('/insurance?msg=' + encodeURIComponent(flashT(res, 'flash.carrier_updated')))
 } catch (err) {
  res.redirect('/insurance?err=' + encodeURIComponent(err.message));
 }
});

app.get('/insurance-claims', requireAuth, requirePerm('insurance.read','insurance.write','accounting.read','accounting.write'), async (req, res) => {
 try {
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_insurance_claim (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facility_id INT DEFAULT 1,
    patient_id INT NOT NULL,
    carrier_id INT NOT NULL,
    diagnosis VARCHAR(120) DEFAULT NULL,
    billed_amount DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_patient (patient_id),
    KEY idx_carrier (carrier_id),
    KEY idx_status (status)
   )
  `).catch(() => {});

  const [patients] = await pool.query('SELECT id, first_name, last_name FROM tbl_patient WHERE status=1 ORDER BY last_name, first_name LIMIT 500').catch(() => [[]]);
  const [carriers] = await pool.query('SELECT id, name FROM tbl_insurance_carrier WHERE status=1 ORDER BY name').catch(() => [[]]);
  const [claims] = await pool.query(`
    SELECT c.*,
      p.first_name, p.last_name,
      ic.name AS insurer_name
    FROM tbl_insurance_claim c
    LEFT JOIN tbl_patient p ON p.id = c.patient_id
    LEFT JOIN tbl_insurance_carrier ic ON ic.id = c.carrier_id
    ORDER BY c.id DESC
    LIMIT 200
  `).catch(() => [[]]);

  const list = Array.isArray(claims) ? claims : [];
  const stats = {
   clean: list.filter(x => String(x.status) === 'clean').length,
   warning: list.filter(x => String(x.status) === 'warning').length,
   rejected: list.filter(x => String(x.status) === 'rejected').length,
   pending: list.filter(x => !x.status || String(x.status) === 'pending').length
  };

  res.render('insurance-claims', {
   title: pageTitle(res, 'document_titles.insurance_claims', 'Insurance Claims — ZAIZENS'),
   patients: Array.isArray(patients) ? patients : [],
   carriers: Array.isArray(carriers) ? carriers : [],
   claims: list,
   stats,
   flash: req.query.msg || null,
   error: req.query.err || null
  });
 } catch (err) {
  console.error('INSURANCE CLAIMS ERROR:', err.message);
  renderAppError(res, 500, 'page.load_insurance_claims', 'Insurance claims load failure.', { detail: err.message })
 }
});

app.post('/insurance-claims/add', requireAuth, requirePerm('insurance.write','accounting.write'), async (req, res) => {
 const patient_id = parseInt(req.body.patient_id) || 0;
 const carrier_id = parseInt(req.body.carrier_id) || 0;
 const diagnosis = String(req.body.diagnosis || '').trim();
 const billed_amount = parseFloat(req.body.billed_amount) || 0;
 const fid = req.session.facilityId || 1;
 if (patient_id < 1 || carrier_id < 1) return res.redirect('/insurance-claims?err=' + encodeURIComponent(flashT(res, 'flash.missing_patient_or_carrier')))
 try {
  await pool.query(
   `INSERT INTO tbl_insurance_claim (facility_id, patient_id, carrier_id, diagnosis, billed_amount, status, created_at)
    VALUES (?,?,?,?,?,'pending',NOW())`,
   [fid, patient_id, carrier_id, diagnosis || null, billed_amount]
  );
  res.redirect('/insurance-claims?msg=' + encodeURIComponent(flashT(res, 'flash.claim_submitted')))
 } catch (err) {
  res.redirect('/insurance-claims?err=' + encodeURIComponent(err.message));
 }
});

// Placeholder export endpoint (returns simple X12-like text)
app.get('/insurance-claims/export.x12', requireAuth, requirePerm('insurance.read','insurance.write','accounting.read','accounting.write'), async (req, res) => {
 try {
  const [rows] = await pool.query(
   `SELECT c.id, c.patient_id, c.diagnosis, c.billed_amount, c.status, ic.name AS insurer_name
    FROM tbl_insurance_claim c
    LEFT JOIN tbl_insurance_carrier ic ON ic.id=c.carrier_id
    ORDER BY c.id DESC LIMIT 200`
  ).catch(() => [[]]);
  const lines = ['ISA*00*          *00*          *ZZ*TSSFHMS       *ZZ*CLEARINGHOUSE *' + new Date().toISOString().slice(2,10).replace(/-/g,'') + '*0000*U*00401*000000001*0*T*:~'];
  (Array.isArray(rows) ? rows : []).forEach(r => {
   lines.push(`CLM*${r.id}*${Number(r.billed_amount||0).toFixed(2)}***${r.diagnosis||''}*${r.insurer_name||''}~`);
  });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(lines.join('\n'));
 } catch (err) {
  res.status(500).send('Export failed: ' + err.message);
 }
});

// WORKFLOW GUIDES (all staff; role-scoped for non-admin)
const workflowGuides = (() => {
 try {
  return require('./lib/workflowGuides');
 } catch (e) {
  _writeCrash('WARN-workflowGuides-missing', e);
  console.warn('[HMS] workflowGuides unavailable:', e.message);
  return { buildGuideContext: () => ({ workflows: [], sections: [] }) };
 }
})();
app.get('/workflow-guides', requireAuth, async (req, res) => {
 try {
  const role = String((req.session.user || {}).role || '');
  const prefer = ['opd', 'ipd', 'emg'].includes(String(req.query.w || '')) ? String(req.query.w) : null;
  let dbWorkflow = null;
  try {
   const workflowMap = require('./lib/workflowMap');
   dbWorkflow = await workflowMap.loadWorkflowForGuides(pool);
  } catch (_) { /* optional */ }
  const guideCtx = workflowGuides.buildGuideContext(role, { preferWorkflow: prefer, dbWorkflow });
  res.render('workflow-guides', {
   title: pageTitle(res, 'document_titles.workflow_guides', 'Workflow Guides — ZAIZENS'),
   flash: req.query.msg || null,
   error: req.query.err || null,
   ...guideCtx,
  });
 } catch (err) {
  renderAppError(res, 500, 'page.load_workflow_guides', 'Workflow guides load failure.', { detail: err.message })
 }
});

// USER MANUAL (all staff)
app.get('/user-manual', requireAuth, async (req, res) => {
 try {
  res.render('user-manual', {
   title: pageTitle(res, 'document_titles.user_manual', 'User Manual — ZAIZENS'),
   flash: req.query.msg || null,
   error: req.query.err || null
  });
 } catch (err) {
  renderAppError(res, 500, 'page.load_user_manual', 'User manual load failure.', { detail: err.message })
 }
});

// PATIENT INSURANCE MANAGEMENT
async function ensurePatientInsuranceTables() {
 await migratePatientInsuranceSchema(pool);
}

app.get('/patient-insurance', requireAuth, requirePerm('patient.directory.insurance','insurance.read','insurance.write'), (req, res) => {
 const pid = parseInt(String(req.query.patient_id || req.query.patientId || ''), 10) || 0;
 if (pid < 1) return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_patient')));
 return res.redirect(301, `/patients/${pid}/insurance`);
});

app.get('/patients/:id/insurance', requireAuth, requirePerm('patient.directory.insurance','insurance.read','insurance.write'), async (req, res) => {
 const pid = parseInt(req.params.id) || 0;
 if (pid < 1) return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_patient')))
 try {
  await ensurePatientInsuranceTables();
  const [[patient]] = await pool.query('SELECT id, first_name, last_name FROM tbl_patient WHERE id=? LIMIT 1', [pid]).catch(() => [[null]]);
  if (!patient) return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.patient_not_found')))
  const [carriers] = await pool.query('SELECT id, name FROM tbl_insurance_carrier WHERE status=1 ORDER BY name').catch(() => [[]]);
  const [policies] = await pool.query(
   `SELECT pi.*, ic.name AS carrier_name
    FROM tbl_patient_insurance pi
    JOIN tbl_insurance_carrier ic ON ic.id = pi.carrier_id
    WHERE pi.patient_id=?
    ORDER BY pi.is_primary DESC, pi.id DESC`,
   [pid]
  ).catch(() => [[]]);

  res.render('patient-insurance', {
   title: pageTitle(res, 'document_titles.patient_insurance', 'Patient Insurance — ZAIZENS'),
   patient,
   carriers: Array.isArray(carriers) ? carriers : [],
   policies: Array.isArray(policies) ? policies : [],
   flash: req.query.msg || null,
   error: req.query.err || null
  });
 } catch (err) {
  renderAppError(res, 500, 'page.load_insurance', 'Insurance load failure.', { detail: err.message })
 }
});

app.post('/patients/:id/insurance/add', requireAuth, requirePerm('patient.directory.insurance','insurance.read','insurance.write'), async (req, res) => {
 const pid = parseInt(req.params.id) || 0;
 const carrier_id = parseInt(req.body.carrier_id) || 0;
 const policy_number = String(req.body.policy_number || '').trim();
 const pct = parseInt(req.body.insurer_covered_percent || req.body.ins_pct_radio || 0) || 0;
 const is_primary = req.body.is_primary ? 1 : 0;
 const uid = req.session.userId || req.session.user?.id || null;
 if (pid < 1 || carrier_id < 1) return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_insurance_data')))
 try {
  await ensurePatientInsuranceTables();
  const pinsFid = await ensureFacilityRow(pool, req.session.facilityId);
  if (is_primary) {
   await pool.query('UPDATE tbl_patient_insurance SET is_primary=0 WHERE patient_id=?', [pid]).catch(() => {});
  }
  await pool.query(
   `INSERT INTO tbl_patient_insurance
    (facility_id, patient_id, carrier_id, policy_number, insurer_covered_percent, is_primary, api_source, api_last_fetched, created_by, created_at)
    VALUES (?,?,?,?,?, ?, 'manual', NOW(), ?, NOW())`,
   [pinsFid, pid, carrier_id, policy_number || null, Math.max(0, Math.min(100, pct)), is_primary, uid]
  );
  res.redirect(`/patients/${pid}/insurance?msg=` + encodeURIComponent(flashT(res, 'flash.policy_saved')));
 } catch (err) {
  res.redirect(`/patients/${pid}/insurance?err=` + encodeURIComponent(err.message));
 }
});

app.post('/patients/:pid/insurance/:policyId/remove', requireAuth, requirePerm('patient.directory.insurance','insurance.read','insurance.write'), async (req, res) => {
 const pid = parseInt(req.params.pid) || 0;
 const polId = parseInt(req.params.policyId) || 0;
 if (pid < 1 || polId < 1) return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_policy')))
 try {
  await ensurePatientInsuranceTables();
  await pool.query('DELETE FROM tbl_patient_insurance WHERE id=? AND patient_id=?', [polId, pid]);
  res.redirect(`/patients/${pid}/insurance?msg=` + encodeURIComponent(flashT(res, 'flash.policy_removed')));
 } catch (err) {
  res.redirect(`/patients/${pid}/insurance?err=` + encodeURIComponent(err.message));
 }
});

// Lookup stub (replace with real insurer API integration)
app.post('/patients/:id/insurance/lookup', requireAuth, requirePerm('patient.directory.insurance','insurance.read','insurance.write'), async (req, res) => {
 const pid = parseInt(req.params.id) || 0;
 const carrier_id = parseInt(req.body.carrier_id) || 0;
 const extId = String(req.body.insurance_id_external || '').trim();
 if (pid < 1 || carrier_id < 1 || !extId) return res.json({ ok: false, error: 'Carrier and ID required' });
 try {
  const [[carrier]] = await pool.query('SELECT id, code, name FROM tbl_insurance_carrier WHERE id=? LIMIT 1', [carrier_id]).catch(() => [[null]]);
  if (!carrier) return res.json({ ok: false, error: 'Carrier not found' });
  // Dummy verification result (assume 80% coverage)
  return res.json({
   ok: true,
   carrier,
   result: {
    carrier_id: carrier_id,
    carrier_name: carrier.name,
    carrier_code: carrier.code,
    insurance_id: extId,
    policy_number: extId,
    insurer_covered_percent: 80,
    effective_from: new Date().toISOString().split('T')[0],
    message: 'Verified (demo stub).'
   }
  });
 } catch (err) {
  return res.json({ ok: false, error: err.message });
 }
});

app.post('/patients/:id/insurance/save-lookup', requireAuth, requirePerm('patient.directory.insurance','insurance.read','insurance.write'), async (req, res) => {
 const pid = parseInt(req.params.id) || 0;
 const carrier_id = parseInt(req.body.carrier_id) || 0;
 const insurance_id_external = String(req.body.insurance_id_external || '').trim();
 const policy_number = String(req.body.policy_number || '').trim();
 const pct = parseInt(req.body.insurer_covered_percent || 0) || 0;
 const is_primary = req.body.is_primary ? 1 : 0;
 const effective_from = String(req.body.effective_from || '').trim();
 const api_source = String(req.body.api_source || 'api').trim();
 const uid = req.session.userId || req.session.user?.id || null;
 if (pid < 1 || carrier_id < 1) return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_policy')))
 try {
  await ensurePatientInsuranceTables();
  const pinsFid = await ensureFacilityRow(pool, req.session.facilityId);
  if (is_primary) {
   await pool.query('UPDATE tbl_patient_insurance SET is_primary=0 WHERE patient_id=?', [pid]).catch(() => {});
  }
  await pool.query(
   `INSERT INTO tbl_patient_insurance
    (facility_id, patient_id, carrier_id, policy_number, insurer_covered_percent, is_primary, insurance_id_external, api_source, api_last_fetched, effective_from, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,
   [
    pinsFid,
    pid,
    carrier_id,
    policy_number || null,
    Math.max(0, Math.min(100, pct)),
    is_primary,
    insurance_id_external || null,
    api_source || 'api',
    new Date(),
    effective_from || null,
    uid
   ]
  );
  res.redirect(`/patients/${pid}/insurance?msg=` + encodeURIComponent(flashT(res, 'flash.policy_saved')));
 } catch (err) {
  res.redirect(`/patients/${pid}/insurance?err=` + encodeURIComponent(err.message));
 }
});

// Open credit line for an existing patient (Patient Directory ⋯ menu)
app.post('/patients/:id/open-credit', requireAuth, requirePerm('patient.directory.credit','credit.read','credit.write','billing.read','billing.write','cashier.write'), async (req, res) => {
  const pid = parseInt(req.params.id, 10) || 0;
  const uid = req.session.userId || req.session.user?.id || 1;
  const emergencyPending = String(req.body.emergency_pending || '') === '1';
  if (pid < 1) return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_patient')))
  try {
    const [[pt]] = await pool.query('SELECT id, first_name, last_name FROM tbl_patient WHERE id = ? LIMIT 1', [pid]).catch(() => [[null]]);
    if (!pt) return res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.patient_not_found')))
    const [[existing]] = await pool.query(
      "SELECT id FROM tbl_credit_account WHERE patient_id = ? AND status = 'active' LIMIT 1",
      [pid]
    ).catch(() => [[null]]);
    if (existing && existing.id) {
      return res.redirect('/credit-account/' + existing.id + '?msg=' + encodeURIComponent(flashT(res, 'flash.account_already_open')))
    }
    const fid = await ensureFacilityRow(pool, req.session.facilityId);
    const notes = emergencyPending ? 'Emergency — payment pending' : null;
    const [r] = await pool.query(
      'INSERT INTO tbl_credit_account (facility_id, patient_id, status, outstanding_balance, notes, created_by, created_at) VALUES (?, ?, ?, 0, ?, ?, NOW())',
      [fid, pid, 'active', notes, uid]
    );
    const newId = r.insertId;
    const label = encodeURIComponent(((pt.first_name || '') + ' ' + (pt.last_name || '')).trim() || 'Patient');
    res.redirect('/credit-account/' + newId + '?msg=' + encodeURIComponent(flashT(res, 'flash.credit_account_opened_for', { label })));
  } catch (err) {
    console.error('OPEN CREDIT ERROR:', err.message);
    res.redirect('/patients?err=' + encodeURIComponent(flashT(res, 'flash.could_not_open_credit', { message: err.message })));
  }
});

// ────────────────────────────────────────────────────────────
// PATIENT PORTAL (public)
// Separate from staff portals under routes/portals.js
// ────────────────────────────────────────────────────────────
function requirePortalAuth(req, res, next) {
 const pid = parseInt(req.session.portalPatientId) || 0;
 if (!pid) return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.please_sign_in')))
 next();
}

/**
 * Ensure tbl_appointment has the columns we need for telemedicine, doctor
 * confirmation status, and Jitsi room references. Safe to call repeatedly.
 *
 * Status convention (must stay in sync with views/appointments.ejs):
 *   0 → Cancelled / Declined
 *   1 → Confirmed
 *   2 → Completed
 *   3 → Portal request (Pending) — awaiting doctor confirmation
 */
/** Lightweight cache so we don't re-query information_schema on every hit. */
let __apptColsCache = null;
async function getAppointmentColumns(db) {
 if (__apptColsCache) return __apptColsCache;
 try {
  const [c] = await db.query(
   `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_appointment'`
  );
  __apptColsCache = new Set((c || []).map(r => String(r.COLUMN_NAME).toLowerCase()));
 } catch (e) {
  __apptColsCache = new Set([
   'id','appointment_id','patient_id','patient_name','department','doctor',
   'date','time','message','status','created_at'
  ]);
 }
 return __apptColsCache;
}
function invalidateAppointmentColumnsCache() { __apptColsCache = null; }

async function ensureAppointmentTelemedColumns(db) {
 const stmts = [
  "ALTER TABLE tbl_appointment ADD COLUMN visit_type VARCHAR(20) NOT NULL DEFAULT 'in_person'",
  "ALTER TABLE tbl_appointment ADD COLUMN meeting_room VARCHAR(120) DEFAULT NULL",
  "ALTER TABLE tbl_appointment ADD COLUMN doctor_id INT DEFAULT NULL",
  "ALTER TABLE tbl_appointment ADD COLUMN department_name VARCHAR(120) DEFAULT NULL",
  "ALTER TABLE tbl_appointment ADD COLUMN confirmed_at DATETIME DEFAULT NULL",
  "ALTER TABLE tbl_appointment ADD COLUMN declined_at DATETIME DEFAULT NULL",
  "ALTER TABLE tbl_appointment ADD COLUMN cancel_reason VARCHAR(255) DEFAULT NULL",
  // Dedicated portal lifecycle column — owned by the portal flow and never
  // re-used by legacy code paths. This is the SOURCE OF TRUTH for the
  // patient/doctor portal views.
  // Values: 'pending' | 'confirmed' | 'declined' | NULL (not portal-booked)
  "ALTER TABLE tbl_appointment ADD COLUMN portal_state VARCHAR(20) DEFAULT NULL"
 ];
 for (const s of stmts) {
  await db.query(s).catch(() => {});
 }
 const { ensureAppointmentPaymentSchema } = require('./lib/appointmentPayment');
 await ensureAppointmentPaymentSchema(db);
 invalidateAppointmentColumnsCache();

 // Targeted, safe back-fill of portal_state for rows whose source we can
 // identify confidently. We match on multiple "portal-booked" signals so
 // any of: telemedicine, status=3 (our portal-pending sentinel), or rows
 // whose appointment_id starts with APT- AND have no confirm/decline
 // timestamps end up tagged as 'pending'.
 await db.query(
  `UPDATE tbl_appointment
      SET portal_state = 'pending'
    WHERE portal_state IS NULL
      AND confirmed_at IS NULL
      AND declined_at IS NULL
      AND (
            visit_type = 'telemedicine'
         OR status = 3
         OR (appointment_id IS NOT NULL AND appointment_id LIKE 'APT-%')
      )`
 ).catch(() => {});

 // Sync portal_state with confirmed/declined timestamps for older rows
 await db.query(
  `UPDATE tbl_appointment SET portal_state = 'confirmed'
    WHERE portal_state IS NULL AND confirmed_at IS NOT NULL`
 ).catch(() => {});
 await db.query(
  `UPDATE tbl_appointment SET portal_state = 'declined'
    WHERE portal_state IS NULL AND declined_at IS NOT NULL`
 ).catch(() => {});
}

async function ensurePortalTables(pool) {
 await pool.query(`
  CREATE TABLE IF NOT EXISTS tbl_patient_portal (
   id INT AUTO_INCREMENT PRIMARY KEY,
   patient_id INT NOT NULL,
   password_hash VARCHAR(255) DEFAULT NULL,
   set_token VARCHAR(120) DEFAULT NULL,
   token_expires_at DATETIME DEFAULT NULL,
   status VARCHAR(20) DEFAULT 'active',
   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   UNIQUE KEY uniq_patient (patient_id),
   KEY idx_token (set_token)
  )
 `).catch(() => {});
 // PHP migration 002_patient_portal.sql parity: flag + legacy hash on tbl_patient
 await pool.query(`ALTER TABLE tbl_patient ADD COLUMN portal_enabled TINYINT DEFAULT 0`).catch(() => {});
 await pool.query(
  `ALTER TABLE tbl_patient ADD COLUMN portal_password_hash VARCHAR(255) NULL DEFAULT NULL COMMENT 'bcrypt hash for patient portal (legacy / PHP)'`
 ).catch(() => {});
}

/** PHP-compatible: password may live in tbl_patient_portal.password_hash or tbl_patient.portal_password_hash */
function resolvePatientPortalHash(pat, ppRow) {
 const fromPortal = ppRow && ppRow.password_hash ? String(ppRow.password_hash).trim() : '';
 if (fromPortal) return fromPortal;
 const legacy = pat && pat.portal_password_hash ? String(pat.portal_password_hash).trim() : '';
 return legacy || '';
}

// Friendly URL matching PHP patient-portal-login.php
app.get('/patient-portal-login', (req, res) => {
 const q = req.url.indexOf('?');
 res.redirect(302, q >= 0 ? '/portal/login' + req.url.slice(q) : '/portal/login');
});

// PHP patient-portal.php entry: dashboard if signed in, else login
app.get('/patient-portal', (req, res) => {
 if (parseInt(req.session.portalPatientId, 10) > 0) return res.redirect('/portal/dashboard');
 res.redirect('/portal/login');
});

app.get('/portal/login', async (req, res) => {
 try {
  if (parseInt(req.session.portalPatientId, 10) > 0) {
   return res.redirect('/portal/dashboard');
  }
  await ensurePortalTables(pool);
 } catch (e) {
  console.warn('ensurePortalTables (portal login GET):', e.message);
 }
 res.render('portal/login', {
  title: pageTitle(res, 'document_titles.portal_login', 'Patient Portal Login'),
  flash: req.query.msg || null,
  error: req.query.err || null
 });
});

app.post('/portal/login', async (req, res) => {
 const email = String(req.body.email || '').trim().toLowerCase();
 const pass = String(req.body.password || '');
 if (!email || !pass) {
  return res.redirect(
   '/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.please_enter_the_email_and_password_you_were_given_at_registration'))
  );
 }
 try {
  await ensurePortalTables(pool);
  const [[pat]] = await pool.query(
   'SELECT id, first_name, last_name, email, portal_enabled, status, portal_password_hash FROM tbl_patient WHERE LOWER(TRIM(email))=? LIMIT 1',
   [email]
  ).catch(() => [[null]]);
  if (!pat) {
   return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.invalid_email_or_password')));
  }
  if (parseInt(pat.status, 10) !== 1) {
   return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.this_account_is_inactive_please_contact_the_clinic')));
  }
  if (parseInt(pat.portal_enabled, 10) !== 1) {
   return res.redirect(
    '/portal/login?err=' +
     encodeURIComponent(flashT(res, 'flash.online_access_is_not_enabled_for_this_email_please_ask_reception_to_turn'))
   );
  }

  const [[pp]] = await pool.query(
   'SELECT password_hash, status FROM tbl_patient_portal WHERE patient_id=? LIMIT 1',
   [pat.id]
  ).catch(() => [[null]]);
  if (pp && String(pp.status || '') === 'disabled') {
   return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.portal_account_disabled_contact_the_clinic')));
  }

  const hash = resolvePatientPortalHash(pat, pp);
  if (!hash) {
   return res.redirect(
    '/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.portal_password_not_set_contact_the_clinic_to_set_your_access'))
   );
  }

  const ok = await bcrypt.compare(pass, hash);
  if (!ok) {
   return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.invalid_email_or_password')));
  }

  // Drop staff session; new session id (parity with PHP session_regenerate_id)
  delete req.session.user;
  delete req.session.userId;
  delete req.session.facilityId;
  req.session.regenerate((regErr) => {
   if (regErr) {
    console.error('PORTAL SESSION REGENERATE:', regErr.message);
    req.session.portalPatientId = pat.id;
    setLoginActivity(req);
    return res.redirect('/portal/dashboard');
   }
   req.session.portalPatientId = pat.id;
   setLoginActivity(req);
   return res.redirect('/portal/dashboard');
  });
 } catch (err) {
  console.error('PORTAL LOGIN ERROR:', err.message);
  return res.redirect('/portal/login?err=' + encodeURIComponent(err.message));
 }
});

app.get('/portal/set-password', async (req, res) => {
 const token = String(req.query.token || '').trim();
 if (!token) return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.invalid_link')))
 try {
  await ensurePortalTables(pool);
  const [[row]] = await pool.query(
   `SELECT pp.patient_id, pp.set_token, pp.token_expires_at, p.first_name, p.last_name
    FROM tbl_patient_portal pp JOIN tbl_patient p ON p.id=pp.patient_id
    WHERE pp.set_token=? LIMIT 1`,
   [token]
  ).catch(() => [[null]]);
  if (!row) return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.invalid_or_expired_token')))
  if (row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now()) {
   return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.token_expired')))
  }
  res.render('portal/set-password', {
   title: pageTitle(res, 'document_titles.set_portal_password', 'Set Portal Password'),
   patient: { first_name: row.first_name, last_name: row.last_name, id: row.patient_id },
   token,
   error: req.query.err || null
  });
 } catch (err) {
  res.redirect('/portal/login?err=' + encodeURIComponent(err.message));
 }
});

app.post('/portal/set-password', async (req, res) => {
 const token = String(req.body.token || '').trim();
 const p1 = String(req.body.password || '');
 const p2 = String(req.body.password2 || '');
 if (!token) return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.invalid_token')))
 if (!p1 || p1.length < 6) {
  return res.redirect('/portal/set-password?token=' + encodeURIComponent(token) + '&err=' + encodeURIComponent(flashT(res, 'flash.password_too_short')));
 }
 if (p1 !== p2) {
  return res.redirect('/portal/set-password?token=' + encodeURIComponent(token) + '&err=' + encodeURIComponent(flashT(res, 'flash.passwords_do_not_match')));
 }
 try {
  await ensurePortalTables(pool);
  const [[row]] = await pool.query(
   'SELECT patient_id, token_expires_at FROM tbl_patient_portal WHERE set_token=? LIMIT 1',
   [token]
  ).catch(() => [[null]]);
  if (!row) return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.invalid_or_expired_token')))
  if (row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now()) {
   return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.token_expired')))
  }
  const hash = await bcrypt.hash(p1, 10);
  await pool.query(
   'UPDATE tbl_patient_portal SET password_hash=?, set_token=NULL, token_expires_at=NULL, updated_at=NOW() WHERE patient_id=?',
   [hash, row.patient_id]
  );
  await pool
   .query('UPDATE tbl_patient SET portal_password_hash=? WHERE id=?', [hash, row.patient_id])
   .catch(() => {});
  req.session.portalPatientId = row.patient_id;
  setLoginActivity(req);
  return res.redirect('/portal/dashboard?msg=' + encodeURIComponent(flashT(res, 'flash.password_set_successfully')))
 } catch (err) {
  return res.redirect('/portal/login?err=' + encodeURIComponent(err.message));
 }
});

app.get('/portal/logout', (req, res) => {
 const reason = String(req.query.reason || '');
 req.session.destroy(() => {
  const base = '/portal/login?msg=' + encodeURIComponent(flashT(res, 'flash.signed_out'));
  if (reason === 'idle') {
   const mins = Math.max(1, Math.round(idleTimeoutMs() / 60000));
   return res.redirect(
    '/portal/login?msg=' +
     encodeURIComponent(flashT(res, 'flash.signed_out_after_inactivity', { minutes: mins, suffix: mins === 1 ? '' : 's' }))
   );
  }
  res.redirect(base);
 });
});

app.get('/portal/dashboard', requirePortalAuth, async (req, res) => {
 try {
 await ensurePortalTables(pool);
 await ensureAppointmentTelemedColumns(pool);
 await ensurePatientAgeColumns(pool);
 const pid = parseInt(req.session.portalPatientId) || 0;
  const sq = async (sql, params = []) => {
   try { const [rows] = await pool.query(sql, params); return rows; }
   catch (e) { return []; }
  };
  const sqOne = async (sql, params = []) => {
   const rows = await sq(sql, params);
   return Array.isArray(rows) && rows.length ? rows[0] : null;
  };

  const patient = await sqOne(
   `SELECT id, first_name, last_name, gender, dob, age_years, age_only_registration, phone, email, address, patient_type,
           cni_number, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
           emergency_contact_name, emergency_contact_phone, created_at
    FROM tbl_patient WHERE id=? LIMIT 1`,
   [pid]
  );
  if (!patient) {
   delete req.session.portalPatientId;
   return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.account_not_found')))
  }
  patient.calculated_age_years = patientDisplayAgeYears(patient);

  const wallet = await sqOne(
   "SELECT id, balance, qr_token, status FROM tbl_patient_wallet WHERE patient_id=? ORDER BY (status='active') DESC, id DESC LIMIT 1",
   [pid]
  );

  const walletTxns = wallet && wallet.id
   ? await sq(
      `SELECT id, txn_type, direction, amount, balance_after, reference_id, notes, created_at
       FROM tbl_patient_wallet_txn WHERE wallet_id=? ORDER BY id DESC LIMIT 15`,
      [wallet.id]
     )
   : [];

  // Latest vitals (try modern table first, fall back to tbl_vital_sign)
  let vitals = await sqOne(
   'SELECT * FROM tbl_patient_vitals WHERE patient_id=? ORDER BY id DESC LIMIT 1',
   [pid]
  );
  if (!vitals) {
   vitals = await sqOne(
    'SELECT * FROM tbl_vital_sign WHERE patient_id=? ORDER BY id DESC LIMIT 1',
    [pid]
   );
  }
  const vitalsHistory = await sq(
   'SELECT * FROM tbl_vital_sign WHERE patient_id=? ORDER BY id DESC LIMIT 10',
   [pid]
  );

  const allergies = await sq(
   'SELECT * FROM tbl_patient_allergy WHERE patient_id=? ORDER BY id DESC',
   [pid]
  );
  const medications = await sq(
   'SELECT * FROM tbl_patient_medication WHERE patient_id=? ORDER BY id DESC',
   [pid]
  );
  const problems = await sq(
   'SELECT * FROM tbl_problem WHERE patient_id=? ORDER BY id DESC',
   [pid]
  );

  const departments = await sq(
   'SELECT id, department_name FROM tbl_department WHERE status=1 ORDER BY department_name'
  );
  const hmsDoctorStaff = require('./lib/hmsDoctorStaff');
  const { listDoctorSpecialisations } = require('./lib/hmsDoctorSpecialisations');
  const doctors = await hmsDoctorStaff.fetchActiveDoctorsWithClinicalLinks(
   pool,
   "e.id, e.first_name, e.last_name, COALESCE(e.primary_department,'') AS primary_department, COALESCE(e.specialisation,'') AS specialisation"
  );
  const specialisations = await listDoctorSpecialisations(pool).catch(() => []);

  // Appointments — SELECT * avoids schema drift (doctor_id / department_name columns)
  const appointments = await sq(
   'SELECT * FROM tbl_appointment WHERE patient_id=? ORDER BY id DESC LIMIT 30',
   [pid]
  );

  const consultations = await sq(
   `SELECT c.*, d.department_name, doc.first_name AS doc_fn, doc.last_name AS doc_ln
    FROM tbl_consultation c
    LEFT JOIN tbl_department d ON d.id = c.department_id
    LEFT JOIN tbl_employee doc ON doc.id = c.doctor_id
    WHERE c.patient_id=? ORDER BY c.id DESC LIMIT 25`,
   [pid]
  );

  const labResults = await sq(
   `SELECT lr.*, e.first_name AS ref_fn, e.last_name AS ref_ln
    FROM tbl_lab_result lr
    LEFT JOIN tbl_employee e ON e.id = lr.referred_by_id
    WHERE lr.patient_id=? ORDER BY lr.id DESC LIMIT 25`,
   [pid]
  );
  const radResults = await sq(
   'SELECT * FROM tbl_radiology_result WHERE patient_id=? ORDER BY id DESC LIMIT 25',
   [pid]
  );
  const prescriptions = await sq(
   'SELECT * FROM tbl_prescription WHERE patient_id=? ORDER BY id DESC LIMIT 25',
   [pid]
  );

  const activeInsurance = await sqOne(
   `SELECT pi.*, ic.name AS carrier_name
    FROM tbl_patient_insurance pi
    JOIN tbl_insurance_carrier ic ON ic.id = pi.carrier_id
    WHERE pi.patient_id=? AND pi.is_primary=1 LIMIT 1`,
   [pid]
  );

  await hmsOnlineBooking.ensureOnlineBookingSchema(pool).catch(() => {});

  let rescheduleAppt = null;
  const rescheduleId = parseInt(req.query.reschedule, 10) || 0;
  if (rescheduleId) {
   rescheduleAppt = await hmsOnlineBooking.getPatientAppointment(pool, rescheduleId, pid);
   if (rescheduleAppt) {
    const check = hmsOnlineBooking.patientCanModify(rescheduleAppt);
    if (!check.ok) rescheduleAppt = null;
   }
  }

  res.render('portal/dashboard', {
   title: pageTitle(res, 'document_titles.portal_dashboard', 'My Care Portal'),
   patient,
   wallet: wallet || null,
   walletTxns,
   vitals: vitals || null,
   vitalsHistory,
   allergies,
   medications,
   problems,
   departments,
   doctors,
   specialisations,
   bookingTypes: hmsOnlineBooking.APPOINTMENT_TYPES,
   appointments,
   consultations,
   labResults,
   radResults,
   prescriptions,
   activeInsurance,
   rescheduleAppt,
   flash: req.query.msg || null,
   error: req.query.err || null,
   tab: req.query.tab || 'overview'
  });
 } catch (err) {
  console.error('PORTAL DASHBOARD ERROR:', err.message);
  renderAppError(res, 500, 'page.load_portal', 'Portal load failure.', { detail: err.message })
 }
});

app.get('/portal/api/booking/doctors', requirePortalAuth, async (req, res) => {
 try {
  const doctors = await hmsOnlineBooking.listDoctors(pool, {
   department: req.query.department || '',
   specialisation: req.query.specialisation || req.query.spec || '',
  });
  res.json({ ok: true, doctors });
 } catch (e) {
  res.status(500).json({ ok: false, message: e.message });
 }
});

app.get('/portal/api/booking/slots', requirePortalAuth, async (req, res) => {
 try {
  const result = await hmsOnlineBooking.getAvailableSlots(pool, {
   doctorId: req.query.doctor_id || '',
   date: req.query.date || '',
  });
  res.json({ ok: true, slots: result.slots, message: result.message });
 } catch (e) {
  res.status(500).json({ ok: false, message: e.message });
 }
});

app.get('/portal/api/booking/validate-payment', requirePortalAuth, async (req, res) => {
 try {
  const pid = parseInt(req.session.portalPatientId, 10) || 0;
  const appointmentPayment = require('./lib/appointmentPayment');
  const excludeAppointmentId = parseInt(req.query.exclude_appointment_id, 10) || 0;
  const result = await appointmentPayment.validatePaymentForTeleAppointment(pool, {
   patientId: pid,
   paymentCode: req.query.code || req.query.payment_code || '',
   facilityId: req.session.facilityId || 1,
   excludeAppointmentId,
   lang: res.locals.lang || 'en',
  });
  if (!result.ok) return res.json({ ok: false, error: result.error });
  return res.json({
   ok: true,
   code: result.code,
   validity_message: result.validity_message,
   meta: result.meta,
  });
 } catch (e) {
  res.status(500).json({ ok: false, error: e.message });
 }
});

app.get('/portal/book', requirePortalAuth, (req, res) => {
 res.redirect('/portal/dashboard?tab=appointments&open_booking=1');
});

app.post('/portal/appointments/:id/cancel', requirePortalAuth, async (req, res) => {
 try {
  const pid = parseInt(req.session.portalPatientId) || 0;
  const colSet = await getAppointmentColumns(pool);
  const hasCol = (c) => colSet.has(String(c).toLowerCase());
  await hmsOnlineBooking.cancelByPatient(pool, req.params.id, pid, req.body.reason, { hasCol });
  res.redirect(
   '/portal/dashboard?tab=appointments&msg=' + encodeURIComponent(flashT(res, 'flash.appointment_cancelled'))
  );
 } catch (e) {
  res.redirect('/portal/dashboard?tab=appointments&err=' + encodeURIComponent(e.message));
 }
});

app.post('/portal/appointments/:id/reschedule', requirePortalAuth, async (req, res) => {
 try {
  const pid = parseInt(req.session.portalPatientId) || 0;
  const colSet = await getAppointmentColumns(pool);
  const hasCol = (c) => colSet.has(String(c).toLowerCase());
  const result = await hmsOnlineBooking.rescheduleByPatient(pool, req.params.id, pid, req.body, {
   hasCol,
  });
  res.redirect(
   '/portal/dashboard?tab=appointments&msg=' +
    encodeURIComponent(flashT(res, 'flash.appointment_rescheduled', { date: req.body.date, time: req.body.time }))
  );
 } catch (e) {
  res.redirect(
   '/portal/dashboard?tab=appointments&reschedule=' +
    encodeURIComponent(req.params.id) +
    '&err=' +
    encodeURIComponent(e.message)
  );
 }
});

app.post('/portal/book-appointment', requirePortalAuth, async (req, res) => {
 try {
  const pid = parseInt(req.session.portalPatientId) || 0;
  const colSet = await getAppointmentColumns(pool);
  const hasCol = (c) => colSet.has(String(c).toLowerCase());
  const result = await hmsOnlineBooking.createPortalBooking(pool, req.body, pid, {
   hasCol,
   ensureAppointmentTelemedColumns,
  });
  const okMsg =
   result.visitType === 'telemedicine'
    ? 'Telemedicine request submitted with your payment code. The doctor will confirm your slot — the Jitsi video link activates after confirmation.'
    : 'Appointment request submitted. The clinic will confirm your slot shortly.';
  res.redirect(
   '/portal/dashboard?tab=appointments&booked=' +
    encodeURIComponent(result.appointmentId) +
    '&msg=' +
    encodeURIComponent(okMsg)
  );
 } catch (err) {
  console.error('PORTAL BOOK APPT:', err.message);
  res.redirect(
   '/portal/dashboard?tab=appointments&open_booking=1&err=' + encodeURIComponent(err.message)
  );
 }
});

// ────────────────────────────────────────────────────────────
// APPOINTMENT CONFIRMATION & TELEMEDICINE
// ────────────────────────────────────────────────────────────

/** Doctor / staff: confirm a portal appointment (Pending → Confirmed). */
app.post('/appointments/:id/confirm', requireAuth, async (req, res) => {
 const aid = parseInt(req.params.id, 10);
 if (!aid) return res.redirect('/portal/doctor?err=' + encodeURIComponent(flashT(res, 'flash.invalid_appointment')));
 const wantsJson = (req.headers.accept || '').includes('application/json') ||
  String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
 try {
  await ensureAppointmentTelemedColumns(pool);
  const uid = req.session.userId || (req.session.user && req.session.user.id) || 0;
  const role = String((req.session.user || {}).role || '');

  const [[appt]] = await pool.query('SELECT * FROM tbl_appointment WHERE id=? LIMIT 1', [aid]).catch(() => [[null]]);
  if (!appt) {
   if (wantsJson) return res.status(404).json({ ok: false, error: 'Appointment not found.' });
   return res.redirect('/portal/doctor?err=' + encodeURIComponent(flashT(res, 'flash.appointment_not_found')));
  }

  // Authorization: assigned doctor (matched by doctor_id OR by textual `doctor`
  // column for legacy/free-text rows), admin, or any role-2 doctor when the
  // appointment has no doctor at all (so unclaimed requests can still be
  // accepted by the appropriate clinician).
  const isAdmin = role === '1' || role === '99';
  const [[meRow]] = await pool.query(
   'SELECT first_name, last_name, role FROM tbl_employee WHERE id=? LIMIT 1', [uid]
  ).catch(() => [[null]]);
  const myFullName = meRow ? `${meRow.first_name || ''} ${meRow.last_name || ''}`.trim() : '';
  const myRole = String((meRow && meRow.role) != null ? meRow.role : role || '');
  const isDoctorRole = myRole === '2';

  const apptDocText = String(appt.doctor || '').toLowerCase();
  const matchesById = appt.doctor_id != null && parseInt(appt.doctor_id, 10) === parseInt(uid, 10);
  const matchesByName = !!myFullName && apptDocText.includes(myFullName.toLowerCase());
  const apptHasNoDoctor = (appt.doctor_id == null) && !apptDocText;
  const isAssignedDoctor = matchesById || matchesByName || (isDoctorRole && apptHasNoDoctor);

  if (!isAdmin && !isAssignedDoctor) {
   if (wantsJson) return res.status(403).json({ ok: false, error: 'Only the assigned doctor can confirm this appointment.' });
   return res.redirect('/portal/doctor?err=' + encodeURIComponent(flashT(res, 'flash.you_can_only_confirm_appointments_assigned_to_you')));
  }

  // If telemedicine and no room yet, create one now
  let room = appt.meeting_room || null;
  if (String(appt.visit_type || '').toLowerCase() === 'telemedicine' && !room) {
   room = `tssf-hms-${(appt.appointment_id || ('apt-' + aid)).toLowerCase()}-${crypto.randomBytes(6).toString('hex')}`;
  }

  // Stamp doctor_id / doctor name when the row was unclaimed so future
  // queries (and the patient view) can accurately identify the clinician.
  const stampDoctorId = (appt.doctor_id == null && (matchesByName || (isDoctorRole && apptHasNoDoctor)))
   ? uid : null;
  const stampDoctorName = (apptHasNoDoctor && myFullName) ? `Dr. ${myFullName}` : null;

  // Schema-aware UPDATE: only touch columns that actually exist.
  const apptCols = await getAppointmentColumns(pool);
  const sets = ['status = 1'];
  const args = [];
  if (apptCols.has('portal_state'))  sets.push("portal_state = 'confirmed'");
  if (apptCols.has('confirmed_at'))  sets.push('confirmed_at = NOW()');
  if (apptCols.has('declined_at'))   sets.push('declined_at = NULL');
  if (apptCols.has('cancel_reason')) sets.push('cancel_reason = NULL');
  if (apptCols.has('meeting_room'))  { sets.push('meeting_room = COALESCE(?, meeting_room)'); args.push(room); }
  if (apptCols.has('doctor_id'))     { sets.push('doctor_id = COALESCE(?, doctor_id)'); args.push(stampDoctorId); }
  if (apptCols.has('doctor'))        { sets.push("doctor = COALESCE(NULLIF(doctor,''), ?, doctor)"); args.push(stampDoctorName); }
  args.push(aid);
  await pool.query(`UPDATE tbl_appointment SET ${sets.join(', ')} WHERE id = ?`, args);

  if (wantsJson) return res.json({ ok: true, status: 1, portal_state: 'confirmed', meeting_room: room || null });
  const referer = String(req.get('referer') || '');
  if (referer.includes('/appointments') && !referer.includes('/portal/')) {
   return res.redirect('/appointments?msg=' + encodeURIComponent(flashT(res, 'flash.appointment_confirmed')));
  }
  return res.redirect('/portal/doctor?tab=appointments&msg=' + encodeURIComponent(flashT(res, 'flash.appointment_confirmed')));
 } catch (err) {
  console.error('CONFIRM APPT:', err.message);
  if (wantsJson) return res.status(500).json({ ok: false, error: err.message });
  return res.redirect('/portal/doctor?err=' + encodeURIComponent(err.message));
 }
});

/** Doctor / staff: decline a portal appointment (status=2). */
app.post('/appointments/:id/decline', requireAuth, async (req, res) => {
 const aid = parseInt(req.params.id, 10);
 const wantsJson = (req.headers.accept || '').includes('application/json') ||
  String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
 if (!aid) {
  if (wantsJson) return res.status(400).json({ ok: false, error: 'Invalid appointment.' });
  return res.redirect('/portal/doctor?err=' + encodeURIComponent(flashT(res, 'flash.invalid_appointment')));
 }
 const reason = String(req.body.reason || '').trim().slice(0, 240) || null;
 try {
  await ensureAppointmentTelemedColumns(pool);
  const uid = req.session.userId || (req.session.user && req.session.user.id) || 0;
  const role = String((req.session.user || {}).role || '');
  const [[appt]] = await pool.query('SELECT * FROM tbl_appointment WHERE id=? LIMIT 1', [aid]).catch(() => [[null]]);
  if (!appt) {
   if (wantsJson) return res.status(404).json({ ok: false, error: 'Appointment not found.' });
   return res.redirect('/portal/doctor?err=' + encodeURIComponent(flashT(res, 'flash.appointment_not_found')));
  }

  const isAdmin = role === '1' || role === '99';
  const [[meRow]] = await pool.query(
   'SELECT first_name, last_name, role FROM tbl_employee WHERE id=? LIMIT 1', [uid]
  ).catch(() => [[null]]);
  const myFullName = meRow ? `${meRow.first_name || ''} ${meRow.last_name || ''}`.trim() : '';
  const myRole = String((meRow && meRow.role) != null ? meRow.role : role || '');
  const isDoctorRole = myRole === '2';
  const apptDocText = String(appt.doctor || '').toLowerCase();
  const matchesById = appt.doctor_id != null && parseInt(appt.doctor_id, 10) === parseInt(uid, 10);
  const matchesByName = !!myFullName && apptDocText.includes(myFullName.toLowerCase());
  const apptHasNoDoctor = (appt.doctor_id == null) && !apptDocText;
  const isAssignedDoctor = matchesById || matchesByName || (isDoctorRole && apptHasNoDoctor);

  if (!isAdmin && !isAssignedDoctor) {
   if (wantsJson) return res.status(403).json({ ok: false, error: 'Only the assigned doctor can decline this appointment.' });
   return res.redirect('/portal/doctor?err=' + encodeURIComponent(flashT(res, 'flash.you_can_only_decline_appointments_assigned_to_you')));
  }
  // Decline → status=0 (Cancelled, matches existing /appointments view)
  // and portal_state='declined' (source of truth for portal views).
  // Schema-aware UPDATE in case of legacy table without the new columns.
  const apptCols = await getAppointmentColumns(pool);
  const sets = ['status = 0'];
  const args = [];
  if (apptCols.has('portal_state'))  sets.push("portal_state = 'declined'");
  if (apptCols.has('declined_at'))   sets.push('declined_at = NOW()');
  if (apptCols.has('confirmed_at'))  sets.push('confirmed_at = NULL');
  if (apptCols.has('cancel_reason')) { sets.push('cancel_reason = ?'); args.push(reason); }
  args.push(aid);
  await pool.query(`UPDATE tbl_appointment SET ${sets.join(', ')} WHERE id = ?`, args);
  if (wantsJson) return res.json({ ok: true, status: 2 });
  return res.redirect('/portal/doctor?tab=appointments&msg=' + encodeURIComponent(flashT(res, 'flash.appointment_declined')));
 } catch (err) {
  console.error('DECLINE APPT:', err.message);
  if (wantsJson) return res.status(500).json({ ok: false, error: err.message });
  return res.redirect('/portal/doctor?err=' + encodeURIComponent(err.message));
 }
});

/**
 * Telemedicine room (Jitsi Meet via meet.jit.si External API).
 * Accessible to the assigned doctor (staff session) or to the patient
 * (portal session) for that specific appointment id.
 */
app.get('/telemedicine/:id', async (req, res) => {
 const aid = parseInt(req.params.id, 10);
 if (!aid) return res.status(400).send('Invalid appointment.');
 try {
  await ensureAppointmentTelemedColumns(pool);
  const [[appt]] = await pool.query(
   `SELECT a.*,
           p.first_name AS p_fn, p.last_name AS p_ln,
           e.first_name AS d_fn, e.last_name AS d_ln
    FROM tbl_appointment a
    LEFT JOIN tbl_patient p ON p.id = a.patient_id
    LEFT JOIN tbl_employee e ON e.id = a.doctor_id
    WHERE a.id=? LIMIT 1`,
   [aid]
  ).catch(() => [[null]]);
  if (!appt) return res.status(404).send('Appointment not found.');
  if (String(appt.visit_type || '').toLowerCase() !== 'telemedicine') {
   return res.status(400).send('This appointment is in-person, not telemedicine.');
  }
  if (parseInt(appt.status, 10) !== 1) {
   return res
    .status(403)
    .send('Telemedicine link is only active after the doctor confirms the appointment.');
  }
  if (!appt.meeting_room) {
   return res.status(500).send('No meeting room set for this appointment.');
  }

  // Authorization: either staff doctor logged in, or patient portal logged in.
  // Must mirror /appointments/:id/confirm logic: many rows match the clinician
  // via textual `doctor` (Dr. First Last) even when doctor_id was not persisted
  // yet, or legacy DBs omitted doctor_id on INSERT.
  const portalPid = parseInt(String(req.session.portalPatientId || ''), 10) || 0;
  const staffUid = parseInt(String(
   req.session.userId || (req.session.user && req.session.user.id) || 0
  ), 10) || 0;
  const staffRole = String((req.session.user || {}).role || '');
  const isPatient = portalPid > 0 && portalPid === parseInt(String(appt.patient_id || ''), 10);
  const isAdmin = staffRole === '1' || staffRole === '99';

  let matchesById = false;
  let matchesByName = false;
  let staffFirst = '';
  let staffLast = '';
  if (staffUid > 0) {
   const [[meRow]] = await pool.query(
    'SELECT first_name, last_name, role FROM tbl_employee WHERE id = ? LIMIT 1',
    [staffUid]
   ).catch(() => [[null]]);
   staffFirst = (meRow && meRow.first_name) || '';
   staffLast = (meRow && meRow.last_name) || '';
   const myFullName = `${staffFirst} ${staffLast}`.trim();
   const apptDocText = String(appt.doctor || '').toLowerCase();
   const apptDocId = appt.doctor_id != null && appt.doctor_id !== ''
    ? parseInt(String(appt.doctor_id), 10)
    : NaN;
   matchesById = Number.isFinite(apptDocId) && apptDocId === staffUid;
   matchesByName = !!myFullName && apptDocText.includes(myFullName.toLowerCase());
  }

  const isAssignedDoctor = staffUid > 0 && (matchesById || matchesByName);

  if (!isPatient && !isAssignedDoctor && !isAdmin) {
   if (portalPid || staffUid) {
    return res.status(403).send('You are not a participant in this telemedicine consultation.');
   }
   return res.redirect('/portal/login?err=' + encodeURIComponent(flashT(res, 'flash.please_sign_in_to_join_the_consultation')));
  }

  const role = isPatient ? 'patient' : 'doctor';
  const displayName = isPatient
   ? `${appt.p_fn || ''} ${appt.p_ln || ''}`.trim() || 'Patient'
   : (isAssignedDoctor
       ? (`Dr. ${appt.d_fn || staffFirst} ${appt.d_ln || staffLast}`.trim() || 'Doctor')
       : 'Clinician');
  const peerName = isPatient
   ? (appt.d_fn || staffFirst
       ? `Dr. ${appt.d_fn || staffFirst} ${appt.d_ln || staffLast}`.trim()
       : 'Your doctor')
   : `${appt.p_fn || ''} ${appt.p_ln || ''}`.trim() || 'Patient';

  res.render('telemedicine-room', {
   title: pageTitle(res, 'document_titles.telemedicine_consultation', 'Telemedicine consultation'),
   appointment: appt,
   room: appt.meeting_room,
   role,
   displayName,
   peerName,
   isPatient
  });
 } catch (err) {
  console.error('TELEMEDICINE ROOM:', err.message);
  res.status(500).send('Could not open consultation room: ' + err.message);
 }
});

/**
 * Diagnostic: shows the latest tbl_appointment rows along with
 * portal_state / status / doctor info, and the columns currently present
 * in the table. Visit /appointments-diagnostic while signed in as staff.
 *
 * Use this to understand why a portal booking isn't surfacing in the
 * doctor portal — typically because of doctor_id / portal_state mismatch.
 */
app.get('/appointments-diagnostic', requireAuth, async (req, res) => {
 try {
  await ensureAppointmentTelemedColumns(pool);

  const [cols] = await pool.query(
   `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_appointment'
     ORDER BY ORDINAL_POSITION`
  ).catch(() => [[]]);

  const [latest] = await pool.query(
   `SELECT id, appointment_id, patient_id, patient_name, department,
           doctor, doctor_id, date, time, status, portal_state, visit_type,
           meeting_room, confirmed_at, declined_at, cancel_reason, created_at
      FROM tbl_appointment
     ORDER BY id DESC LIMIT 25`
  ).catch(() => [[]]);

  const [counts] = await pool.query(
   `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN portal_state='pending'   THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN portal_state='confirmed' THEN 1 ELSE 0 END) AS confirmed,
      SUM(CASE WHEN portal_state='declined'  THEN 1 ELSE 0 END) AS declined,
      SUM(CASE WHEN portal_state IS NULL     THEN 1 ELSE 0 END) AS no_state,
      SUM(CASE WHEN visit_type='telemedicine' THEN 1 ELSE 0 END) AS telemedicine
    FROM tbl_appointment`
  ).catch(() => [[{}]]);

  const [doctors] = await pool.query(
   `SELECT id, first_name, last_name, primary_department
    FROM tbl_employee WHERE role=2 AND status=1 ORDER BY id`
  ).catch(() => [[]]);

  const me = req.session.user || {};
  const html = `<!doctype html><html><head><meta charset="utf-8">
   <title>Appointments diagnostic</title>
   <style>
     body{font:14px/1.45 system-ui,Segoe UI,Arial;margin:24px;background:#f8fafc;color:#0f172a;}
     h1{font-size:20px;margin:0 0 8px;}
     h2{font-size:15px;margin:24px 0 8px;color:#334155;}
     table{border-collapse:collapse;background:#fff;width:100%;font-size:12.5px;}
     th,td{border:1px solid #e2e8f0;padding:6px 9px;text-align:left;vertical-align:top;}
     th{background:#f1f5f9;color:#475569;font-weight:600;}
     code{background:#f1f5f9;padding:2px 5px;border-radius:4px;}
     .ok{color:#047857;font-weight:600;}
     .warn{color:#b45309;font-weight:600;}
     .bad{color:#b91c1c;font-weight:600;}
     .pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;}
     .pill.pending{background:#fef3c7;color:#92400e;}
     .pill.confirmed{background:#d1fae5;color:#047857;}
     .pill.declined{background:#fee2e2;color:#b91c1c;}
     .pill.none{background:#e2e8f0;color:#475569;}
   </style></head><body>
   <h1>📋 Appointments diagnostic</h1>
   <p style="color:#475569">Signed in as <strong>${(me.name || me.username || '?')}</strong> &middot;
      employee id <code>${me.id || '?'}</code> &middot; role <code>${me.role || '?'}</code></p>

   <h2>Counts</h2>
   <table><thead><tr>
     <th>total</th><th>pending</th><th>confirmed</th><th>declined</th>
     <th>no portal_state</th><th>telemedicine</th></tr></thead>
   <tbody><tr>
     <td>${counts[0].total||0}</td>
     <td class="pill pending">${counts[0].pending||0}</td>
     <td class="pill confirmed">${counts[0].confirmed||0}</td>
     <td class="pill declined">${counts[0].declined||0}</td>
     <td class="pill none">${counts[0].no_state||0}</td>
     <td>${counts[0].telemedicine||0}</td></tr></tbody></table>

   <h2>Doctors in tbl_employee (role=2)</h2>
   <table><thead><tr><th>id</th><th>first name</th><th>last name</th><th>primary department</th></tr></thead>
   <tbody>${doctors.map(d=>`<tr><td>${d.id}</td><td>${d.first_name||''}</td><td>${d.last_name||''}</td><td>${d.primary_department||''}</td></tr>`).join('')}</tbody></table>

   <h2>Most recent 25 appointments</h2>
   <table><thead><tr>
     <th>id</th><th>appointment_id</th><th>patient</th><th>visit_type</th>
     <th>status</th><th>portal_state</th><th>doctor_id</th><th>doctor (text)</th>
     <th>department</th><th>date</th><th>time</th><th>meeting_room</th><th>created_at</th>
   </tr></thead><tbody>
   ${latest.map(r=>{
     const ps = (r.portal_state||'').toLowerCase();
     const cls = ps==='pending'?'pending':ps==='confirmed'?'confirmed':ps==='declined'?'declined':'none';
     return `<tr>
       <td>${r.id}</td>
       <td><code>${r.appointment_id||''}</code></td>
       <td>${r.patient_name||''} <span style="color:#94a3b8">(#${r.patient_id||'-'})</span></td>
       <td>${r.visit_type||''}</td>
       <td>${r.status===null?'<em>NULL</em>':r.status}</td>
       <td><span class="pill ${cls}">${r.portal_state||'NULL'}</span></td>
       <td>${r.doctor_id===null?'<em>NULL</em>':r.doctor_id}</td>
       <td>${r.doctor||'<em>—</em>'}</td>
       <td>${r.department||''}</td>
       <td>${r.date?new Date(r.date).toISOString().slice(0,10):''}</td>
       <td>${r.time||''}</td>
       <td style="font-size:11px;word-break:break-all">${r.meeting_room||''}</td>
       <td style="font-size:11px">${r.created_at? new Date(r.created_at).toISOString():''}</td>
     </tr>`;
   }).join('')}
   </tbody></table>

   <h2>tbl_appointment columns</h2>
   <table><thead><tr><th>name</th><th>type</th><th>nullable</th><th>default</th></tr></thead>
   <tbody>${cols.map(c=>`<tr><td><code>${c.COLUMN_NAME}</code></td><td>${c.COLUMN_TYPE}</td><td>${c.IS_NULLABLE}</td><td>${c.COLUMN_DEFAULT===null?'<em>NULL</em>':c.COLUMN_DEFAULT}</td></tr>`).join('')}</tbody></table>

   <p style="margin-top:24px;color:#64748b;font-size:12px">Tip: if any pending row has <code>portal_state = NULL</code>, refresh <code>/portal/doctor</code> once — the self-heal migration will tag it as <code>pending</code>.</p>
   </body></html>`;

  res.set('Content-Type', 'text/html').send(html);
 } catch (err) {
  res.status(500).send('Diagnostic error: ' + err.message);
 }
});

// CREDIT & RECEIVABLES (Admin)
app.get('/credit-receivables', requireAuth, requirePerm('credit.read','credit.write'), async (req, res) => {
 try {
  // Tables (dev convenience)
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_credit_account (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facility_id INT DEFAULT 1,
    patient_id INT NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    outstanding_balance DECIMAL(12,2) DEFAULT 0,
    guarantor_name VARCHAR(120) DEFAULT NULL,
    guarantor_phone VARCHAR(40) DEFAULT NULL,
    notes TEXT,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_patient (patient_id),
    KEY idx_status (status)
   )
  `).catch(() => {});

  const [accounts] = await pool.query(`
   SELECT
    ca.*,
    p.first_name,
    p.last_name,
    p.phone,
    DATEDIFF(CURDATE(), DATE(ca.created_at)) AS aging_days
   FROM tbl_credit_account ca
   JOIN tbl_patient p ON p.id = ca.patient_id
   ORDER BY ca.outstanding_balance DESC, ca.updated_at DESC
   LIMIT 200
  `).catch(() => [[]]);

  const list = Array.isArray(accounts) ? accounts : [];
  const totals = {
   active: list.filter(a => String(a.status) === 'active').length,
   collections: list.filter(a => String(a.status) === 'collections').length,
   total_outstanding: list.reduce((s, a) => s + (parseFloat(a.outstanding_balance || 0) || 0), 0)
  };

  res.render('credit-receivables', {
   title: pageTitle(res, 'document_titles.credit_receivables', 'Credit & Receivables — ZAIZENS'),
   accounts: list,
   totals,
   flash: req.query.msg || null,
   error: req.query.err || null
  });
 } catch (err) {
  console.error('CREDIT RECEIVABLES ERROR:', err.message);
  renderAppError(res, 500, 'page.load_credit_receivables', 'Credit receivables load failure.', { detail: err.message })
 }
});

app.get('/credit-account/:id', requireAuth, requirePerm('credit.read','credit.write'), async (req, res) => {
 const id = parseInt(req.params.id) || 0;
 if (id < 1) return res.redirect('/credit-receivables?err=' + encodeURIComponent(flashT(res, 'flash.invalid_account')))
 try {
  // Optional tables (dev convenience)
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_credit_payment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    credit_account_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(40) DEFAULT 'Cash',
    notes VARCHAR(600) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ca (credit_account_id)
   )
  `).catch(() => {});
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_credit_followup (
    id INT AUTO_INCREMENT PRIMARY KEY,
    credit_account_id INT NOT NULL,
    channel VARCHAR(20) DEFAULT 'note',
    summary VARCHAR(600) NOT NULL,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ca (credit_account_id)
   )
  `).catch(() => {});
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_credit_installment_plan (
    id INT AUTO_INCREMENT PRIMARY KEY,
    credit_account_id INT NOT NULL,
    title VARCHAR(120) DEFAULT NULL,
    installment_count INT DEFAULT 0,
    amount_each DECIMAL(12,2) DEFAULT 0,
    first_due_date DATE DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ca (credit_account_id)
   )
  `).catch(() => {});
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_credit_charge (
    id INT AUTO_INCREMENT PRIMARY KEY,
    credit_account_id INT NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    amount DECIMAL(12,2) DEFAULT 0,
    on_credit TINYINT DEFAULT 1,
    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ca (credit_account_id)
   )
  `).catch(() => {});

  const [[acct]] = await pool.query(`
   SELECT
    ca.*,
    p.first_name,
    p.last_name,
    p.phone,
    DATEDIFF(CURDATE(), DATE(ca.created_at)) AS aging_days
   FROM tbl_credit_account ca
   JOIN tbl_patient p ON p.id = ca.patient_id
   WHERE ca.id = ?
   LIMIT 1
  `, [id]);
  if (!acct) return res.redirect('/credit-receivables?err=' + encodeURIComponent(flashT(res, 'flash.account_not_found')))

  const [payments] = await pool.query('SELECT * FROM tbl_credit_payment WHERE credit_account_id = ? ORDER BY created_at DESC', [id]).catch(() => [[]]);
  const [followups] = await pool.query('SELECT * FROM tbl_credit_followup WHERE credit_account_id = ? ORDER BY created_at DESC', [id]).catch(() => [[]]);
  const [plans] = await pool.query('SELECT * FROM tbl_credit_installment_plan WHERE credit_account_id = ? ORDER BY created_at DESC', [id]).catch(() => [[]]);
  const [charges] = await pool.query('SELECT * FROM tbl_credit_charge WHERE credit_account_id = ? ORDER BY posted_at DESC', [id]).catch(() => [[]]);

  res.render('credit-account', {
   title: pageTitle(res, 'document_titles.credit_account', 'Credit Account — ZAIZENS'),
   acct,
   payments: Array.isArray(payments) ? payments : [],
   followups: Array.isArray(followups) ? followups : [],
   plans: Array.isArray(plans) ? plans : [],
   charges: Array.isArray(charges) ? charges : []
  });
 } catch (err) {
  console.error('CREDIT ACCOUNT ERROR:', err.message);
  renderAppError(res, 500, 'page.load_credit_account', 'Credit account load failure.', { detail: err.message })
 }
});

// DOCTOR DUTY ROSTER
function isRosterAdminUser(req) {
 const dr = String((req.session && req.session.user && req.session.user.role) || '');
 return dr === '1' || dr === '99';
}

app.get('/doctor-roster', requireAuth, requirePerm('doctor_duty.read', 'doctor_duty.write'), async (req, res) => {
 const view = hmsRoster.parseView(req.query.view);
 let date = String(req.query.date || hmsRoster.isoToday()).slice(0, 10);
 if (req.query.month) date = hmsRoster.firstDayOfMonth(String(req.query.month) + '-01');
 const facilityId = hmsRoster.resolveFacilityId(req);
 const cfg = hmsRoster.rosterKindConfig('doctor');
 const staffEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
 const userPerms = res.locals.userPerms || [];
 const canEditAll = isRosterAdminUser(req);
 const canEditRoster = canEditAll || (userPerms || []).includes('doctor_duty.write');

 try {
 const doctors = await hmsRoster.fetchRosterStaff(pool, 'doctor');
 const rosterRows = await hmsRoster.fetchRosterRows(pool, 'doctor', facilityId, view, date);

 const rd = hmsRoster.buildRosterRenderData({
  kind: 'doctor',
  view,
  date,
  dateField: cfg.dateField,
  typeField: cfg.typeField,
  staff: doctors,
  rosterRows,
 });

 const [consultationRooms] = await pool
  .query(
   'SELECT id, code, name FROM tbl_consultation_room WHERE facility_id = ? AND status = 1 ORDER BY sort_order ASC, id ASC',
   [facilityId]
  )
  .catch(() => [[]]);

 res.render('doctor-roster', {
  title: pageTitle(res, 'document_titles.doctor_duty_roster', 'Doctor Duty Roster — ZAIZENS'),
  doctors,
  roster: rd.roster,
  view: rd.view,
  date: rd.date,
  weekStart: rd.weekStart,
  weekDays: rd.weekDays,
  monthMeta: rd.monthMeta,
  monthWeeks: rd.monthWeeks,
  staffWithWeek: rd.staffWithWeek,
  staffDayShift: rd.staffDayShift,
  staffDayDetails: rd.staffDayDetails || {},
  shiftDefaults: hmsRoster.DOCTOR_SHIFT_DEFAULTS,
  consultationRooms: consultationRooms || [],
  period: rd.period,
  prevNavDate: rd.prevNavDate,
  nextNavDate: rd.nextNavDate,
  isAdminOrSuper: isRosterAdminUser(req),
  canEditRoster,
  canEditAll,
  staffEmpId,
  flash: req.query.msg || null,
  error: req.query.err || null,
 });
 } catch (err) {
 console.error('DOCTOR ROSTER ERROR:', err);
 renderAppError(res, 500, 'page.load_doctor_roster', 'Doctor roster failure.', { detail: err.message })
 }
});

app.post('/doctor-roster/save', requireAuth, requirePerm('doctor_duty.write'), async (req, res) => {
 const { date, view } = req.body;
 const rawShifts = hmsRoster.parseDoctorShiftsFromBody(req.body);
 const facilityId = hmsRoster.resolveFacilityId(req);
 const staffEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
 const shifts = hmsRoster.filterRosterShiftsForEditor(rawShifts, staffEmpId, isRosterAdminUser(req));
 if (!Object.keys(shifts).length) {
  return res.redirect(
   hmsRoster.rosterRedirectUrl('/doctor-roster', view || 'day', date, { err: 'No duty rows received — save again' })
  );
 }
 try {
 await pool.query('START TRANSACTION');
 await hmsRoster.saveRosterShifts(pool, 'doctor', facilityId, date, shifts);
 await pool.query('COMMIT');
 res.redirect(
  hmsRoster.rosterRedirectUrl('/doctor-roster', view || 'day', date, { msg: 'Duty roster saved successfully' })
 );
 } catch (err) {
 await pool.query('ROLLBACK').catch(() => {});
 console.error('DOCTOR ROSTER SAVE:', err);
 res.redirect(
  hmsRoster.rosterRedirectUrl('/doctor-roster', req.body.view || 'day', req.body.date, { err: 'Save failure' })
 );
 }
});

app.post('/doctor-roster/copy', requireAuth, requirePerm('doctor_duty.write'), async (req, res) => {
 const { from_date, to_date, view } = req.body;
 if (!isRosterAdminUser(req)) {
  return res.redirect(
   hmsRoster.rosterRedirectUrl('/doctor-roster', view || 'day', to_date, { err: 'Copy day is limited to administrators' })
  );
 }
 const facilityId = hmsRoster.resolveFacilityId(req);
 try {
 await hmsRoster.copyRosterDay(pool, 'doctor', facilityId, from_date, to_date);
 res.redirect(
  hmsRoster.rosterRedirectUrl('/doctor-roster', view || 'day', to_date, {
   msg: 'Duty roster copied successfully',
  })
 );
 } catch (err) {
 console.error('DOCTOR ROSTER COPY:', err);
 res.redirect(
  hmsRoster.rosterRedirectUrl('/doctor-roster', view || 'day', to_date, { err: 'Copy failure' })
 );
 }
});

// DOCTOR SCHEDULE HUB (duty + clinic hours + appointments + OPD queue)
const doctorScheduleHub = require('./lib/doctorScheduleHub');
const opdQueueConsult = require('./lib/opdQueueConsult');

app.get('/doctor/schedule', requireAuth, requirePerm('doctor_duty.read', 'clinical.read', 'clinical.write', 'scheduling.read'), async (req, res) => {
 const staffEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
 const facilityId = hmsRoster.resolveFacilityId(req);
 const date = String(req.query.date || hmsRoster.isoToday()).slice(0, 10);
 try {
  const hub = await doctorScheduleHub.loadDoctorScheduleHub(pool, {
   doctorId: staffEmpId,
   facilityId,
   date,
  });
  res.render('doctor-schedule', {
   title: pageTitle(res, 'document_titles.doctor_schedule_hub', 'My Schedule — ZAIZENS'),
   pageData: {
    hub,
    staffEmpId,
    userPerms: res.locals.userPerms || [],
    flash: req.query.msg || null,
    error: req.query.err || null,
   },
  });
 } catch (err) {
  console.error('DOCTOR SCHEDULE HUB:', err);
  renderAppError(res, 500, 'page.load_doctor_schedule', 'Doctor schedule failure.', { detail: err.message });
 }
});

app.get('/api/doctor/schedule', requireAuth, requirePerm('doctor_duty.read', 'clinical.read', 'scheduling.read'), async (req, res) => {
 try {
  const staffEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const facilityId = hmsRoster.resolveFacilityId(req);
  const date = String(req.query.date || hmsRoster.isoToday()).slice(0, 10);
  const hub = await doctorScheduleHub.loadDoctorScheduleHub(pool, {
   doctorId: staffEmpId,
   facilityId,
   date,
  });
  res.json({ ok: true, hub });
 } catch (e) {
  res.status(500).json({ ok: false, error: e.message });
 }
});

app.post('/api/doctor/call-next', requireAuth, requirePerm('clinical.write', 'prescription.write'), async (req, res) => {
 try {
  const staffEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const facilityId = hmsRoster.resolveFacilityId(req);
  const out = await opdQueueConsult.callNextPatientForDoctor(pool, {
   doctorId: staffEmpId,
   facilityId,
  });
  if (!out.ok) return res.status(out.error === 'no_patients_waiting' ? 404 : 400).json(out);
  res.json(out);
 } catch (e) {
  res.status(500).json({ ok: false, error: e.message });
 }
});

// ── Doctor duty swap (Phase 5) ────────────────────────────────
const doctorDutySwap = require('./lib/doctorDutySwap');

app.get('/api/doctor/duty-swap', requireAuth, requirePerm('doctor_duty.read', 'doctor_duty.write', 'clinical.read'), async (req, res) => {
 try {
  const staffEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const status = String(req.query.status || 'pending');
  const rows = await doctorDutySwap.listSwapRequestsForDoctor(pool, staffEmpId, { status });
  res.json({ ok: true, swaps: rows });
 } catch (e) {
  res.status(500).json({ ok: false, error: e.message });
 }
});

app.post('/api/doctor/duty-swap', requireAuth, requirePerm('doctor_duty.write', 'clinical.write'), async (req, res) => {
 try {
  const staffEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const facilityId = hmsRoster.resolveFacilityId(req);
  const out = await doctorDutySwap.createSwapRequest(pool, {
   facilityId,
   requesterId: staffEmpId,
   partnerId: req.body.partner_id,
   fromDate: req.body.from_date,
   toDate: req.body.to_date,
   note: req.body.note,
  });
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
 } catch (e) {
  res.status(500).json({ ok: false, error: e.message });
 }
});

app.post('/api/doctor/duty-swap/:id/cancel', requireAuth, requirePerm('doctor_duty.write', 'clinical.write'), async (req, res) => {
 try {
  const staffEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const out = await doctorDutySwap.cancelSwapRequest(pool, req.params.id, staffEmpId);
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
 } catch (e) {
  res.status(500).json({ ok: false, error: e.message });
 }
});

app.get('/api/admin/duty-swap/pending', requireAuth, requirePerm('doctor_duty.write', 'scheduling.write'), async (req, res) => {
 try {
  const facilityId = hmsRoster.resolveFacilityId(req);
  const rows = await doctorDutySwap.listPendingSwapRequests(pool, facilityId);
  res.json({ ok: true, swaps: rows });
 } catch (e) {
  res.status(500).json({ ok: false, error: e.message });
 }
});

app.post('/api/admin/duty-swap/:id/review', requireAuth, requirePerm('doctor_duty.write', 'scheduling.write'), async (req, res) => {
 try {
  const reviewerId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
  const action = String(req.body.action || '').toLowerCase();
  const out = await doctorDutySwap.reviewSwapRequest(pool, req.params.id, reviewerId, action);
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
 } catch (e) {
  res.status(500).json({ ok: false, error: e.message });
 }
});

// ── Appointment → OPD check-in (Phase 6) ────────────────────
const appointmentOpdCheckIn = require('./lib/appointmentOpdCheckIn');

app.post('/api/appointments/:id/check-in-opd', requireAuth, requirePerm('opd.write', 'clinical.write', 'scheduling.write'), async (req, res) => {
 try {
  const apptId = parseInt(req.params.id, 10) || 0;
  const uid = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 1;
  const facilityId = hmsRoster.resolveFacilityId(req);
  const out = await appointmentOpdCheckIn.checkInAppointmentToOpd(pool, {
   appointmentId: apptId,
   userId: uid,
   facilityId,
  });
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
 } catch (e) {
  res.status(500).json({ ok: false, error: e.message });
 }
});

app.post('/opd-queue/call-patient', requireAuth, requirePerm('clinical.write', 'prescription.write'), async (req, res) => {
 const wantsJson = apiWantsJson(req) || req.body.json === '1';
 const staffEmpId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
 const facilityId = hmsRoster.resolveFacilityId(req);
 const visitId = parseInt(req.body.visit_id, 10) || 0;
 try {
  let out;
  if (visitId > 0) {
   out = await opdQueueConsult.markVisitInConsultation(pool, { visitId, doctorId: staffEmpId });
  } else {
   out = await opdQueueConsult.callNextPatientForDoctor(pool, { doctorId: staffEmpId, facilityId });
  }
  if (!out.ok) {
   const msg = out.error || 'call_failed';
   if (wantsJson) return res.status(400).json(out);
   return res.redirect('/opd-queue?err=' + encodeURIComponent(msg));
  }
  if (wantsJson) return res.json(out.ok && out.consultUrl ? out : { ok: true, ...out });
  const target =
   out.consultUrl ||
   (out.visitId && out.visit && out.visit.patient_id
    ? `/consultation-new?patient_id=${out.visit.patient_id}&visit_id=${out.visitId}`
    : out.visitId
      ? `/consultation-new?visit_id=${out.visitId}`
      : '/opd-queue');
  return res.redirect(target + (out.patientName ? '?msg=' + encodeURIComponent('Calling ' + out.patientName) : ''));
 } catch (e) {
  if (wantsJson) return res.status(500).json({ ok: false, error: e.message });
  return res.redirect('/opd-queue?err=' + encodeURIComponent(e.message));
 }
});

/** Legacy POST — permissions are granted only via /access-control/api (tbl_acl_role_permission). */
app.post('/access-control/save', requireAuth, requireAdminOrSuper, (req, res) => {
 const roleId = String(req.body.role_id || '');
 const q = roleId ? `?role=${encodeURIComponent(roleId)}&msg=` + encodeURIComponent(flashT(res, 'flash.use_modules_permissions_on_the_access_control_page')) : '';
 return res.redirect('/hms-admin/access' + q + '&view=permissions');
});

// PAYMENT CODE VALIDATION API
// Supports both 'ticket_code' and legacy 'code' column names.
// Normalizes code (trim / spaces / case) so DB formatting differences do not false-fail.
app.get('/api/payment/validate', requireAuth, async (req, res) => {
 const codeRaw = req.query.code || '';
 // Normalize: strip whitespace, coerce Unicode dash variants to ASCII '-', uppercase.
 // Common copy-paste sources insert en-dash (\u2013), em-dash (\u2014), minus (\u2212), etc.
 const code = String(codeRaw)
  .replace(/[\u2010-\u2015\u2212\u00AD\uFE58\uFE63\uFF0D]/g, '-')
  .replace(/\s+/g, '')
  .toUpperCase();
 
 if (!code) {
 return res.json({ ok: false, error: 'No code provided' });
 }

 // SQL-side normalizer mirrors the JS normalizer so DB-stored codes with
 // stray spaces or unicode dashes still match. Uses nested REPLACE to keep
 // the syntax portable across MySQL versions.
 const normSqlExpr = (col) => `
  UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
   TRIM(IFNULL(${col},'')),
   ' ', ''),
   '\u2010', '-'),
   '\u2011', '-'),
   '\u2012', '-'),
   '\u2013', '-'),
   '\u2014', '-'),
   '\u2015', '-'),
   '\u2212', '-'),
   '\u00AD', ''))
 `;

 try {
 let ticketRows = [];
 try {
 [ticketRows] = await pool.query(
  `SELECT t.* FROM tbl_payment_ticket t WHERE ${normSqlExpr('t.ticket_code')} = ? LIMIT 1`,
  [code]
 );
 } catch (colErr) {
 [ticketRows] = await pool.query(
  `SELECT t.* FROM tbl_payment_ticket t WHERE ${normSqlExpr('t.code')} = ? LIMIT 1`,
  [code]
 );
 }
 // Legacy rows may only populate alternate column — try second shape if empty
 if (!ticketRows.length) {
  try {
   [ticketRows] = await pool.query(
    `SELECT t.* FROM tbl_payment_ticket t WHERE ${normSqlExpr('t.code')} = ? LIMIT 1`,
    [code]
   );
  } catch (_) { /* no code column */ }
 }

 if (!ticketRows.length) {
 return res.json({
  ok: false,
  error:
   'No payment ticket matches this code. Use the full code from the cashier receipt (for example CON-4829-K7HM3R9Q), not a shortened prefix.'
 });
 }

 const ticket = ticketRows[0];
 const st = String(ticket.status || '').trim().toLowerCase();
 if (st !== 'paid') {
  const pendingHint =
   st === 'pending'
    ? 'This payment code exists but settlement is still pending. Complete payment at the cashier, then validate again.'
    : `This ticket exists but its status is "${ticket.status}". Only paid tickets can be used for registration.`;
  return res.json({ ok: false, error: pendingHint });
 }

 const [patRows] = await pool.query(
  'SELECT first_name, last_name, patient_type FROM tbl_patient WHERE id = ? LIMIT 1',
  [ticket.patient_id]
 );
 if (!patRows.length) {
  return res.json({
   ok: false,
   error:
    'This ticket is paid but the linked patient record is missing. Contact administration before registering the visit.'
  });
 }
 ticket.first_name = patRows[0].first_name;
 ticket.last_name = patRows[0].last_name;
 ticket.patient_type = patRows[0].patient_type;

 const vchk = await paymentValidity.assertPaidTicketValidityForVisit(
  pool,
  ticket,
  code,
  ticket.facility_id || req.session.facilityId || 1
 );
 if (!vchk.ok) {
  return res.json({
   ok: false,
   consumed: !!vchk.consumed,
   error: vchk.error
  });
 }

 const activeVisit = await opdVisitCarryForward.findActiveOpdVisitForPatient(pool, ticket.patient_id, {
  excludeEmergency: true,
 });
 if (activeVisit) {
  return res.json({
   ok: false,
   error: flashT(res, 'flash.patient_already_registered_for_visit'),
  });
 }

 // Parse lines_json to extract service and doctor info
 let serviceName = '';
 let servicePrice = 0;
 let doctorId = 0;
 let doctorNameFromLine = '';
 let departmentName = (ticket.department || '').trim() || 'General';

 try {
  const parsed = parsePaymentTicketConsultation(ticket.lines_json);
  serviceName = parsed.serviceName || '';
  servicePrice = parsed.servicePrice || 0;
  doctorId = parsed.doctorId || 0;
  doctorNameFromLine = parsed.doctorNameFromLine || '';
  const lines = JSON.parse(ticket.lines_json || '[]');
  for (const ln of lines) {
   if (isConsultationTicketLine(ln) && ln.department) {
    departmentName = String(ln.department).trim();
    break;
   }
  }
  if (departmentName === 'General' && lines[0] && lines[0].department) {
   departmentName = String(lines[0].department).trim() || departmentName;
  }
 } catch (e) { /* Ignore JSON parse errors */ }

 // Fetch doctor name
 let doctorName = doctorNameFromLine;
 if (!doctorName && doctorId > 0) {
  const [docRows] = await pool.query(
   'SELECT first_name, last_name FROM tbl_employee WHERE id = ? LIMIT 1', [doctorId]
  );
  if (docRows.length > 0) {
   doctorName = `Dr. ${docRows[0].first_name} ${docRows[0].last_name}`;
  }
 } else if (doctorName && !/^dr\.?\s/i.test(doctorName)) {
  doctorName = `Dr. ${doctorName}`;
 }

 return res.json({
 ok: true,
 patient_id: ticket.patient_id,
 patient_name: `${ticket.first_name} ${ticket.last_name}`,
 patient_type: ticket.patient_type || 'Standard',
 department: departmentName,
 service: serviceName,
 service_name: serviceName,
 price: servicePrice,
 assigned_doctor_id: doctorId,
 assigned_doctor_name: doctorName,
 validity: vchk.meta || null,
 patient_notice: vchk.patient_notice || null
 });

 } catch (err) {
 console.error('Payment Code Validation Error:', err.message);
 if (err.code === 'ER_NO_SUCH_TABLE') {
 return res.json({ ok: false, error: 'Payment tables not yet migrated on this server.' });
 }
 return res.status(500).json({ ok: false, error: 'Server error: ' + err.message });
 }
});

// VISITS: REGISTER NEW VISIT === Æ’ ===   with dept-doc validation, reuse check & EMERGENCY bypass
app.post('/opd-queue/add', requireAuth, requirePerm('opd.write'), async (req, res) => {
 const {
 patient_id, department_name, assigned_doctor_id,
 reason, priority, payment_code, visit_date, visit_time,
 is_emergency, waiver_reason
 } = req.body;
 const fid = req.session.facilityId || 1;
 const uid = req.session.userId || 1;
 const today = new Date().toISOString().split('T')[0];
 const isEmerg = (is_emergency === '1' || is_emergency === 'on' || is_emergency === true);

 const pid = parseInt(patient_id) || 0;
 let docId = parseInt(assigned_doctor_id) || 0;
 let vdate = today;
 const vdateRaw = String(visit_date || '').trim();
 if (/^\d{4}-\d{2}-\d{2}$/.test(vdateRaw)) vdate = vdateRaw;
 else {
  const dmy = vdateRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) vdate = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
 }
 const vtime = /^\d{1,2}:\d{2}/.test(visit_time) ? visit_time : new Date().toTimeString().slice(0,5);
 const startedAt = new Date(`${vdate}T${vtime}:00`);

 // Emergency overrides
 const finalDept = isEmerg ? 'Emergency / A&E' : (department_name || 'General');
 const initStatus  = isEmerg ? 'waiting_doctor'  : 'registered';

 try {
 // 1. Validate patient
 const [patRows] = await pool.query('SELECT id FROM tbl_patient WHERE id = ? AND status = 1 LIMIT 1', [pid]);
 if (pid < 1 || patRows.length === 0) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.select_a_valid_patient')))

 // 2+3. Doctor + dept-doc mismatch === Æ’ ===   SKIPPED for emergency
 if (!isEmerg && docId > 0) {
 const hmsDoctorStaff = require('./lib/hmsDoctorStaff');
 const docWhere = hmsDoctorStaff.doctorEmployeeWhereSql();
 const [docRows] = await pool.query(
  `SELECT e.id, e.first_name, e.last_name, COALESCE(e.primary_department,'') AS primary_department
     FROM tbl_employee e
     LEFT JOIN tbl_role r ON CAST(r.role AS UNSIGNED) = CAST(e.role AS UNSIGNED)
    WHERE e.id = ? AND ${docWhere}
    LIMIT 1`,
  [docId, ...hmsDoctorStaff.doctorEmployeeWhereParams()]
 );
 if (docRows.length === 0) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.selected_physician_not_valid')))
 const { employeeMatchesDepartment } = require('./lib/hmsDoctorClinicalFilter');
 const selDept = (department_name || '').trim();
 if (selDept) {
  const deptOk = await employeeMatchesDepartment(pool, docId, selDept);
  if (!deptOk) {
 let overrideOk = false;
 if (payment_code) {
 const tOv = await paymentValidity.findPaidTicketByNormalizedCode(pool, payment_code);
 if (tOv && tOv.lines_json) {
 try {
 const lines = JSON.parse(tOv.lines_json || '[]');
 if (lines.some(l => parseInt(l.assigned_doctor_id) === docId)) overrideOk = true;
 } catch(e) {}
 }
 }
 if (!overrideOk) {
 return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.physician_not_assigned_dept', { name: `Dr. ${docRows[0].first_name||''} ${docRows[0].last_name||''}`.trim(), dept: department_name })));
 }
 }
 }
 }

 // 4. Payment code validity (usage limit + expiry) === SKIPPED for emergency
 const code = payment_code ? paymentValidity.normalizePaymentCodeInput(payment_code) : null;
 if (!isEmerg && code) {
  const tktRow = await paymentValidity.findPaidTicketByNormalizedCode(pool, code);
  if (!tktRow) {
   return res.redirect(
    '/opd-queue?err=' +
     encodeURIComponent(flashT(res, 'payment.no_paid_ticket'))
   );
  }
  const vchk = await paymentValidity.assertPaidTicketValidityForVisit(
   pool,
   tktRow,
   code,
   req.session.facilityId || fid || 1
  );
  if (!vchk.ok) {
   return res.redirect('/opd-queue?err=' + encodeURIComponent(vchk.error || 'This payment code cannot be used for registration.'));
  }
  if (docId < 1 && tktRow && tktRow.lines_json) {
   const ticketDoc = parsePaymentTicketConsultation(tktRow.lines_json);
   if (ticketDoc.doctorId > 0) docId = ticketDoc.doctorId;
  }
 }

 if (!isEmerg) {
  const existingVisit = await opdVisitCarryForward.findActiveOpdVisitForPatient(pool, pid, {
   excludeEmergency: true,
  });
  if (existingVisit) {
   return res.redirect(
    '/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.patient_already_registered_for_visit'))
   );
  }
 }

 // 5. Generate sequential ticket === Æ’ ===   EMG- prefix for emergencies
 const year = new Date().getFullYear();
 const prefix = isEmerg ? `EMG-${year}-` : `OPD-${year}-`;
 const [maxRow] = await pool.query(
 'SELECT ticket_number FROM tbl_opd_visit WHERE ticket_number LIKE ? ORDER BY id DESC LIMIT 1',
 [`${prefix}%`]
 );
 let nextSeq = 1;
 if (maxRow.length > 0) {
 const parts = maxRow[0].ticket_number.split('-');
 nextSeq = (parseInt(parts[parts.length - 1]) || 0) + 1;
 }
 const ticketNumber = prefix + nextSeq.toString().padStart(4, '0');

 // 6. Insert (transaction + row lock prevents duplicate rapid clicks)
 await pool.query("ALTER TABLE tbl_opd_visit ADD COLUMN IF NOT EXISTS is_emergency TINYINT DEFAULT 0").catch(() => {});
 await pool.query("ALTER TABLE tbl_opd_visit ADD COLUMN IF NOT EXISTS waiver_reason VARCHAR(255) NULL").catch(() => {});

 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();
  if (!isEmerg) {
   const [[dupVisit]] = await conn.query(
    `SELECT id FROM tbl_opd_visit
      WHERE patient_id = ?
        AND LOWER(TRIM(COALESCE(queue_status,''))) NOT IN ('completed','cancelled')
        AND COALESCE(is_emergency,0) = 0
      LIMIT 1 FOR UPDATE`,
    [pid]
   );
   if (dupVisit && dupVisit.id) {
    await conn.rollback();
    conn.release();
    return res.redirect(
     '/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.patient_already_registered_for_visit'))
    );
   }
  }

  await conn.query(
   `INSERT INTO tbl_opd_visit
   (facility_id, patient_id, ticket_number, queue_status, chief_complaint,
   department, priority, visit_date, queue_started_at, created_by,
   assigned_doctor_id, payment_code, is_emergency, waiver_reason)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
   [
    fid,
    pid,
    ticketNumber,
    initStatus,
    reason || '',
    finalDept,
    priority || '',
    vdate,
    startedAt,
    uid,
    docId || null,
    isEmerg ? null : code,
    isEmerg ? 1 : 0,
    isEmerg ? (waiver_reason || '') : null,
   ]
  );

  await conn.commit();
  conn.release();
  notifyOpdLobbyQueue();
  res.redirect('/opd-queue?msg=' + encodeURIComponent(flashT(res, 'flash.visit_registered')));
 } catch (insertErr) {
  await conn.rollback().catch(() => {});
  conn.release();
  throw insertErr;
 }
 } catch(err) {
 console.error('OPD VISIT ADD ERROR:', err.message);
 res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.save_failed', { message: err.message })));
 }
});

// OPD: Advance visit to next status in sequence
const OPD_STATUS_SEQUENCE = [
 'registered', 'triage', 'waiting_doctor', 'in_consultation',
 'orders_pending', 'billing', 'completed'
];
app.post('/opd-queue/advance', requireAuth, async (req, res) => {
 const vid = parseInt(req.body.visit_id, 10) || 0;
 if (vid < 1) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_visit_2')))
 try {
  const [[visit]] = await pool.query(
   `SELECT v.id, v.queue_status, v.patient_id, p.first_name, p.last_name
    FROM tbl_opd_visit v
    JOIN tbl_patient p ON p.id = v.patient_id
    WHERE v.id = ? LIMIT 1`, [vid]
  ).catch(() => [[null]]);
  if (!visit) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.visit_not_found')))
  const cur = visit.queue_status || 'registered';
  const idx = OPD_STATUS_SEQUENCE.indexOf(cur);
  const next = idx >= 0 && idx < OPD_STATUS_SEQUENCE.length - 1
   ? OPD_STATUS_SEQUENCE[idx + 1] : cur;

  // Block advance to waiting_doctor (i.e. sending to consultation) if vitals not recorded
  if (next === 'waiting_doctor') {
   const hasV = await opdVisitHasVitalsRecorded(pool, vid, visit.patient_id);
   if (!hasV) {
    return res.redirect('/opd-queue?err=' + encodeURIComponent(opdVitalsRequiredMessage(res, visit.first_name, visit.last_name)));
   }
  }

  if (next !== cur) {
   await pool.query(
    'UPDATE tbl_opd_visit SET queue_status = ? WHERE id = ?', [next, vid]
   );
   notifyOpdLobbyQueue();
  }
  res.redirect('/opd-queue?msg=' + encodeURIComponent(flashT(res, 'flash.visit_advanced', { status: next.replace(/_/g, ' ') })));
 } catch (e) {
  console.error('OPD ADVANCE:', e.message);
  res.redirect('/opd-queue?err=' + encodeURIComponent(e.message));
 }
});

// OPD: Set visit to an explicit status (used by Complete / Cancel buttons)
app.post('/opd-queue/status', requireAuth, async (req, res) => {
 const vid = parseInt(req.body.visit_id, 10) || 0;
 const newStatus = String(req.body.new_status || '').trim();
 const allowed = ['registered','triage','waiting_doctor','in_consultation',
                  'orders_pending','billing','completed','cancelled'];
 if (vid < 1 || !allowed.includes(newStatus)) {
  return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_status_update')))
 }
 try {
  if (newStatus === 'waiting_doctor' || newStatus === 'in_consultation') {
   const [[visit]] = await pool.query(
    'SELECT patient_id, first_name, last_name FROM tbl_opd_visit v JOIN tbl_patient p ON p.id=v.patient_id WHERE v.id=? LIMIT 1',
    [vid]
   ).catch(() => [[null]]);
   if (!visit) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.visit_not_found')))
   const hasV = await opdVisitHasVitalsRecorded(pool, vid, visit.patient_id);
   if (!hasV) {
    return res.redirect('/opd-queue?err=' + encodeURIComponent(opdVitalsRequiredMessage(res, visit.first_name, visit.last_name)));
   }
  }
  await pool.query(
   'UPDATE tbl_opd_visit SET queue_status = ? WHERE id = ?', [newStatus, vid]
  );
  notifyOpdLobbyQueue();
  res.redirect('/opd-queue?msg=' + encodeURIComponent(flashT(res, 'flash.visit_status_set', { status: newStatus.replace(/_/g, ' ') })));
 } catch (e) {
  console.error('OPD STATUS:', e.message);
  res.redirect('/opd-queue?err=' + encodeURIComponent(e.message));
 }
});

app.get('/opd-queue/cancel', requireAuth, (req, res) => {
 res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.use_cancel_visit_from_the_opd_queue_actions_menu')));
});

app.post('/opd-queue/cancel', requireAuth, requirePerm('opd.write'), async (req, res) => {
 const vid = parseInt(req.body.visit_id, 10) || 0;
 if (vid < 1) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_visit_2')))
 try {
  const [[visit]] = await pool
   .query('SELECT id, queue_status, ticket_number FROM tbl_opd_visit WHERE id = ? LIMIT 1', [vid])
   .catch(() => [[null]]);
  if (!visit) return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.visit_not_found')))
  const qs = String(visit.queue_status || '').toLowerCase();
  if (qs === 'completed' || qs === 'cancelled') {
   return res.redirect(
    '/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.visit_already_status', { status: qs.replace(/_/g, ' ') }))
   );
  }
  await pool.query('UPDATE tbl_opd_visit SET queue_status = ? WHERE id = ?', ['cancelled', vid]);
  notifyOpdLobbyQueue();
  const label = visit.ticket_number || `Visit #${vid}`;
  res.redirect('/opd-queue?msg=' + encodeURIComponent(`${label} cancelled.`));
 } catch (e) {
  console.error('OPD CANCEL:', e.message);
  res.redirect('/opd-queue?err=' + encodeURIComponent(e.message));
 }
});

// API: Service catalog by category (for IPD Add Charge modal)
app.get('/api/service-catalog', requireAuth, async (req, res) => {
 const cat = (req.query.category || '').trim().toLowerCase();
 if (!cat) return res.json([]);
 try {
  const { fetchCatalogForChargeSection } = require('./lib/serviceCatalogForCharge');
  const rows = await fetchCatalogForChargeSection(pool, cat);
  res.json(rows);
 } catch (err) {
  console.error('SERVICE CATALOG API ERROR:', err.message);
  res.json([]);
 }
});

// API: Pharmacy inventory items for IPD Add Charge (medication search + list).
// Uses simple inventory queries first (broad DB compatibility), then enriches prices from service catalog in JS.
app.get('/api/pharmacy/inventory-for-charge', requireAuth, async (req, res) => {
 try {
  let rows = [];
  const pickRows = (r) => (Array.isArray(r) ? r : []).map((x) => ({
   id: x.id,
   name: x.name,
   price: parseFloat(x.price != null ? x.price : 0) || 0
  }));

  for (const sql of [
   'SELECT id, name, CAST(COALESCE(unit_price, 0) AS DECIMAL(12,2)) AS price FROM tbl_inventory_item ORDER BY name ASC LIMIT 8000',
   'SELECT id, name, 0 AS price FROM tbl_inventory_item ORDER BY name ASC LIMIT 8000'
  ]) {
   try {
    const [r] = await pool.query(sql);
    rows = pickRows(r);
    break;
   } catch (e) {
    rows = [];
   }
  }

  let catalog = [];
  try {
   const [crows] = await pool.query(
    'SELECT id, name, price, category FROM tbl_service_catalog WHERE status = 1'
   );
   catalog = Array.isArray(crows) ? crows : [];
  } catch (e) {
   catalog = [];
  }

  const catById = new Map();
  const catPharmMinByName = new Map();
  const catAnyMinByName = new Map();
  for (const c of catalog) {
   const id = parseInt(c.id, 10);
   if (Number.isFinite(id)) catById.set(id, c);
   const nk = String(c.name || '').trim().toLowerCase();
   if (!nk) continue;
   const p = parseFloat(c.price) || 0;
   if (p <= 0) continue;
   const catLow = String(c.category || '').trim().toLowerCase();
   const pharmish = ['pharmacy', 'pharmaceutical', 'medication', 'drug'].some((k) => catLow.includes(k));
   if (pharmish) {
    const prev = catPharmMinByName.get(nk);
    if (prev == null || p < prev) catPharmMinByName.set(nk, p);
   }
   const prev2 = catAnyMinByName.get(nk);
   if (prev2 == null || p < prev2) catAnyMinByName.set(nk, p);
  }

  let invSc = new Map();
  try {
   const [meta] = await pool.query(
    'SELECT id, service_catalog_id FROM tbl_inventory_item WHERE service_catalog_id IS NOT NULL'
   );
   for (const m of Array.isArray(meta) ? meta : []) {
    const iid = parseInt(m.id, 10);
    const sid = parseInt(m.service_catalog_id, 10);
    if (Number.isFinite(iid) && Number.isFinite(sid)) invSc.set(iid, sid);
   }
  } catch (e) {
   invSc = new Map();
  }

  for (const row of rows) {
   let p = row.price || 0;
   if (p > 0) continue;
   const sid = invSc.get(parseInt(row.id, 10));
   if (sid != null && catById.has(sid)) {
    const c = catById.get(sid);
    p = parseFloat(c.price) || 0;
   }
   const nk = String(row.name || '').trim().toLowerCase();
   if (p <= 0 && nk) {
    p = catPharmMinByName.get(nk) || catAnyMinByName.get(nk) || 0;
   }
   row.price = p;
  }

  return res.json(rows);
 } catch (err) {
  console.error('PHARMACY INVENTORY API:', err.message);
  return res.json([]);
 }
});

//  -  Æ’ ============================== Æ’ === ¬ STATION 6/7: AUTO-CHARGE === Æ’ ===  Lab/Pharmacy add to running bill === Æ’ === ¬
// POST: Add a charge line to running IPD bill
app.post('/ipd/add-charge', requireAuth, async (req, res) => {
 const { buildClinicalDetailFromBody } = require('./lib/ipdChargeClinical');
 const { admission_id, description, amount, charge_type, source_module, source_pk } = req.body;
 const uid = req.session.userId || req.session.user?.id || 1;
 const fid = req.session.facilityId || 1;
 const aid = parseInt(admission_id) || 0;
 const amt = parseFloat(amount) || 0;
 if (aid < 1 || amt <= 0) return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_charge_data')))

 try {
 const { admissionAcceptsNewCharges } = require('./lib/ipdSettlementGuard');
 const guard = await admissionAcceptsNewCharges(pool, aid);
 if (!guard.ok) {
  const msg =
   guard.reason === 'financially_settled'
    ? 'Cannot add charge: IPD bill already settled at Cashier. Contact finance to reopen the account.'
    : 'Admission not found or already discharged.';
  return res.redirect('/wards?err=' + encodeURIComponent(msg));
 }
 const [adm] = await pool.query(
  `SELECT a.patient_id, b.ward_name, b.bed_label
     FROM tbl_admission a
     LEFT JOIN tbl_bed b ON b.id = a.bed_id
    WHERE a.id = ? AND a.discharged_at IS NULL LIMIT 1`,
  [aid]
 );
 if (!adm.length) return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.admission_not_found_or_discharged')))
 const pid = adm[0].patient_id;
 const clinicalDetail = buildClinicalDetailFromBody(req.body);

 // 1. Insert charge line
 await pool.query(`
 INSERT INTO tbl_ipd_charge
 (facility_id, admission_id, patient_id, charge_type, description, amount, added_by, source_module, source_pk, clinical_detail)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
 `, [fid, aid, pid, charge_type || 'misc', description || 'Charge', amt, uid,
 source_module || null, parseInt(source_pk) || null, clinicalDetail]);

 // 2. Update running_bill aggregate
 await pool.query(
 'UPDATE tbl_admission SET running_bill = running_bill + ? WHERE id = ?',
 [amt, aid]
 );

 try {
  const { enqueueClinicalAlertFromCharge } = require('./lib/enqueueClinicalAlertFromCharge');
  const [[doc]] = await pool.query('SELECT first_name, last_name FROM tbl_employee WHERE id=? LIMIT 1', [uid]).catch(() => [[null]]);
  const doctorDisplay = doc
   ? `Dr. ${String(doc.first_name || '').trim()} ${String(doc.last_name || '').trim()}`.trim()
   : 'Doctor';
  const [[pn]] = await pool.query(
   `SELECT TRIM(CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,''))) AS fulln FROM tbl_patient WHERE id=? LIMIT 1`,
   [pid]
  ).catch(() => [[null]]);
  const patientDisplay =
   pn && String(pn.fulln || '').trim() ? String(pn.fulln).trim() : `Patient #${pid}`;
  const wardDisplay = String(adm[0].ward_name || '').trim() || 'Inpatient';
  const bedDisplay = String(adm[0].bed_label || '').trim() || '—';
  await enqueueClinicalAlertFromCharge(pool, {
   charge_type,
   description,
   facility_id: fid,
   context: 'ipd',
   doctor_display: doctorDisplay,
   patient_display: patientDisplay,
   ward_display: wardDisplay,
   bed_display: bedDisplay.slice(0, 160),
   patient_id: pid,
   opd_visit_id: null,
   admission_id: aid,
   created_by: uid,
  });
 } catch (e) {
  console.warn('[ipd/add-charge] dept alert:', e.message);
 }

 const ref = req.get('referer') || '/wards';
 res.redirect(ref + (ref.includes('?') ? '&' : '?') + 'msg=Charge+of+' + amt + '+FCFA+added+to+running+bill.');
 } catch(err) {
 console.error('IPD CHARGE ERROR:', err.message);
 res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.charge_failed', { message: err.message })));
 }
});

// GET: Running bill breakdown for one admission
app.get('/ipd/running-bill/:admission_id', requireAuth, async (req, res) => {
 const aid = parseInt(req.params.admission_id) || 0;
 if (aid < 1) return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_admission')));
 try {
 const [adm] = await pool.query(`
 SELECT a.*,
 p.first_name, p.last_name,
 b.ward_name, b.bed_label,
 doc.first_name AS doc_fn, doc.last_name AS doc_ln,
 DATEDIFF(CURDATE(), DATE(a.admitted_at)) AS los_days
 FROM tbl_admission a
 JOIN tbl_patient p ON p.id = a.patient_id
 JOIN tbl_bed b ON b.id = a.bed_id
 LEFT JOIN tbl_employee doc ON doc.id = a.admitting_doctor_id
 WHERE a.id = ? LIMIT 1
 `, [aid]);
 if (!adm.length) return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.admission_not_found')))

 const [charges] = await pool.query(
 'SELECT * FROM tbl_ipd_charge WHERE admission_id = ? ORDER BY created_at ASC',
 [aid]
 ).catch(() => [[]]);

 const [notes] = await pool.query(
 'SELECT * FROM tbl_ipd_ward_note WHERE admission_id = ? ORDER BY written_at DESC LIMIT 10',
 [aid]
 ).catch(() => [[]]);

 const { summarizeChargeClinical } = require('./lib/ipdChargeClinical');
 const chargeRows = Array.isArray(charges) ? charges : [];
 const chargesView = chargeRows.map((c) =>
  Object.assign({}, c, { clinical_summary: summarizeChargeClinical(c.clinical_detail) })
 );

 let forecast = null;
 try {
  const ipdHosp = require('./lib/ipdHospitalization');
  forecast = await ipdHosp.getInvoiceForecast(pool, aid);
 } catch (_) { /* ignore */ }
 if (!forecast) {
  const dep = parseFloat(adm[0].deposit_amount) || 0;
  const run = parseFloat(adm[0].running_bill) || 0;
  forecast = {
    los_days: adm[0].los_days || 0,
    lines: [],
    deposit: dep,
    running_bill: run,
    forecast_total: run,
    balance_due: Math.max(0, run - dep),
  };
 }

 const { ipdPageData } = require('./lib/reactRouteHelpers');
 res.render('ipd-running-bill', {
 title: pageTitle(res, 'document_titles.running_bill', 'Running Bill — ZAIZENS'),
 admission: adm[0],
 includeIpdChargeModal: true,
 ...ipdPageData('running-bill', {
  admission: adm[0],
  charges: chargesView,
  notes: Array.isArray(notes) ? notes : [],
  forecast,
  flash: req.query.msg || null,
  error: req.query.err || null,
 }),
 });
 } catch(err) {
 console.error('RUNNING BILL ERROR:', err.message);
 renderAppError(res, 500, 'page.load_running_bill', 'Running bill load failure.', { detail: err.message })
 }
});

// GET: IPD Census === Æ’ ===  all current inpatients (tabular view like PHP census tab)
app.get('/ipd/census', requireAuth, async (req, res) => {
 try {
 const [admissions] = await pool.query(`
 SELECT a.*,
 CONCAT(p.first_name,' ',p.last_name) AS patient_name,
 p.first_name, p.last_name, p.gender, p.dob, p.phone,
 b.ward_name, b.bed_label,
 CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name,
 doc.first_name AS doc_fn, doc.last_name AS doc_ln,
 DATEDIFF(CURDATE(), DATE(a.admitted_at)) AS los_days,
 (
 SELECT SUM(c.amount) FROM tbl_ipd_charge c WHERE c.admission_id = a.id
 ) AS charge_subtotal
 FROM tbl_admission a
 JOIN tbl_patient p ON p.id = a.patient_id
 LEFT JOIN tbl_bed b  ON b.id = a.bed_id
 LEFT JOIN tbl_employee doc ON doc.id = a.admitting_doctor_id
 WHERE a.discharged_at IS NULL
 ORDER BY (a.bed_id IS NULL) DESC, b.ward_name, b.bed_label
 `);

 const stats = {
 total: admissions.length,
 admitted: admissions.filter(a => a.ipd_status === 'admitted').length,
 clinical_discharged: admissions.filter(a => a.ipd_status === 'clinical_discharged').length,
 avgLos:  admissions.length > 0
 ? (admissions.reduce((s, a) => s + (parseInt(a.los_days) || 0), 0) / admissions.length).toFixed(1)
 : 0
 };

 res.render('ipd-census', {
 title: pageTitle(res, 'document_titles.ipd_census', 'IPD Census — ZAIZENS'),
 pageData: {
  admissions,
  stats,
  flash: req.query.msg || null,
  error: req.query.err || null,
 },
 });
 } catch(err) {
 console.error('IPD CENSUS ERROR:', err.message);
 renderAppError(res, 500, 'page.load_census', 'Census load failure.', { detail: err.message })
 }
});

// ────────────────────────────────────────────────────────────
// WARDS / IPD BED BOARD
// Restored route: many pages redirect to /wards
// ────────────────────────────────────────────────────────────
app.get('/wards', requireAuth, requirePerm('adt.read','adt.write','nursing.read','nursing.write','clinical.read','clinical.write'), async (req, res) => {
 try {
  const wardFid = await ensureFacilityRow(pool, wardBoard.resolveWardFacilityId(req));
  const board = await wardBoard.loadWardBoard(pool, wardFid);
  const notDischarged = wardBoard.NOT_DISCHARGED;

  // Active admissions list (right panel)
  const [activeAdmissions] = await pool.query(`
    SELECT
      a.id,
      a.patient_id,
      a.ipd_status,
      a.admitting_department,
      a.running_bill,
      a.deposit_amount,
      DATEDIFF(CURDATE(), DATE(a.admitted_at)) AS los_days,
      p.first_name,
      p.last_name,
      b.ward_name,
      b.bed_label
    FROM tbl_admission a
    JOIN tbl_patient p ON p.id = a.patient_id
    LEFT JOIN tbl_bed b ON b.id = a.bed_id
    WHERE ${notDischarged} AND a.bed_id IS NOT NULL AND a.bed_id <> 0
      AND (a.facility_id = ? OR a.facility_id IS NULL)
    ORDER BY a.admitted_at DESC
    LIMIT 60
  `, [wardFid]).catch(() => [[]]);

  // Pending bed assignment (optional)
  const [pendingBed] = await pool.query(`
    SELECT
      a.id,
      a.patient_id,
      a.admitted_at,
      a.admitting_diagnosis,
      a.admitting_doctor_id AS doctor_id,
      a.deposit_amount AS hosp_deposit_paid,
      CONCAT(p.first_name,' ',p.last_name) AS patient_name,
      doc.first_name AS seen_fn,
      doc.last_name AS seen_ln,
      CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name,
      a.admitting_doctor_id AS seen_doctor_id
    FROM tbl_admission a
    JOIN tbl_patient p ON p.id = a.patient_id
    LEFT JOIN tbl_employee doc ON doc.id = a.admitting_doctor_id
    WHERE ${notDischarged} AND (a.bed_id IS NULL OR a.bed_id = 0)
      AND (a.facility_id = ? OR a.facility_id IS NULL)
    ORDER BY a.admitted_at DESC
    LIMIT 30
  `, [wardFid]).catch((e) => {
   console.error('WARDS activeAdmissions:', e.message);
   return [[]];
  });

  res.render('wards', {
    title: pageTitle(res, 'document_titles.ward_board', 'Ward Board / IPD — ZAIZENS'),
    pageData: {
      grouped: board.grouped,
      wardNames: board.wardNames,
      bedCount: board.beds.length,
      pendingBed: Array.isArray(pendingBed) ? pendingBed : [],
      activeAdmissions: Array.isArray(activeAdmissions) ? activeAdmissions : [],
      flash: req.query.msg || null,
      error: req.query.err || null,
      userRole: String(req.session.user?.role || ''),
    },
  });
 } catch (err) {
  console.error('WARDS ERROR:', err.message);
  renderAppError(res, 500, 'page.load_ward_board', 'Ward board load failure.', { detail: err.message })
 }
});

// Minimal ward actions used by wards.ejs (avoid 404s)
app.post('/wards/bed-add', requireAuth, async (req, res) => {
 const ward_name = (req.body.ward_name || '').trim();
 const bed_label = (req.body.bed_label || '').trim();
 if (!ward_name || !bed_label) return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.ward_and_bed_label_are_required')))
 try {
  const fid = await ensureFacilityRow(pool, wardBoard.resolveWardFacilityId(req));
  await pool.query(
    'INSERT INTO tbl_bed (facility_id, ward_name, bed_label, status) VALUES (?,?,?,?)',
    [fid, ward_name, bed_label, 'available']
  );
  res.redirect(
   '/wards?msg=' +
    encodeURIComponent(flashT(res, 'flash.bed_added', { ward: ward_name, bed: bed_label })) +
    '&scroll=1#ward-board-anchor'
  );
 } catch (e) {
  res.redirect('/wards?err=' + encodeURIComponent(e.message));
 }
});

app.post('/wards/bed-delete', requireAuth, async (req, res) => {
 const bed_id = parseInt(req.body.bed_id, 10) || 0;
 if (bed_id < 1) return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_bed')))
 try {
  const fid = await ensureFacilityRow(pool, wardBoard.resolveWardFacilityId(req));
  const [[bed]] = await pool
   .query(
    'SELECT id, ward_name, bed_label, status, facility_id FROM tbl_bed WHERE id = ? LIMIT 1',
    [bed_id]
   )
   .catch(() => [[null]]);
  if (!bed) return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.bed_not_found_2')));
  if (parseInt(bed.facility_id, 10) !== fid) {
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.bed_not_found_for_this_facility')));
  }
  const notDischarged = wardBoard.NOT_DISCHARGED;
  const [[active]] = await pool
   .query(
    `SELECT a.id FROM tbl_admission a
     WHERE a.bed_id = ? AND ${notDischarged} LIMIT 1`,
    [bed_id]
   )
   .catch(() => [[null]]);
  if (active?.id) {
   return res.redirect(
    '/wards?err=' +
     encodeURIComponent(flashT(res, 'flash.cannot_remove_this_bed_a_patient_is_still_admitted'))
   );
  }
  if (String(bed.status || '').toLowerCase() === 'occupied') {
   return res.redirect(
    '/wards?err=' + encodeURIComponent(flashT(res, 'flash.cannot_remove_an_occupied_bed_discharge_the_patient_first'))
   );
  }
  await pool.query('DELETE FROM tbl_bed WHERE id = ? AND facility_id = ?', [bed_id, fid]);
  const label = String(bed.ward_name || '') + ' / ' + String(bed.bed_label || '');
  res.redirect(
   '/wards?msg=' +
    encodeURIComponent(flashT(res, 'flash.bed_removed', { label })) +
    '&scroll=1#ward-board-anchor'
  );
 } catch (e) {
  res.redirect('/wards?err=' + encodeURIComponent(e.message));
 }
});

app.post('/wards/bed-ready', requireAuth, async (req, res) => {
 const bed_id = parseInt(req.body.bed_id) || 0;
 if (bed_id < 1) return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_bed')))
 try {
  const [[active]] = await pool.query(
   `SELECT a.id FROM tbl_admission a
    WHERE a.bed_id = ? AND (a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')
    LIMIT 1`,
   [bed_id]
  ).catch(() => [[null]]);
  if (active?.id) {
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.cannot_mark_ready_this_bed_still_has_an_active_admission')));
  }
  const [r] = await pool.query("UPDATE tbl_bed SET status = 'available' WHERE id = ? AND status = 'housekeeping'", [bed_id]);
  if (!(r?.affectedRows > 0)) {
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.bed_is_not_in_housekeeping_or_could_not_be_updated')));
  }
  res.redirect('/wards?msg=' + encodeURIComponent(flashT(res, 'flash.bed_marked_available_clean')));
 } catch (e) {
  res.redirect('/wards?err=' + encodeURIComponent(e.message));
 }
});

// STATION 3: Validate Hospitalisation payment code for ward admission
app.get('/wards/validate-payment-code', requireAuth, async (req, res) => {
 const code = String(req.query.code || '').trim().toUpperCase();
 if (!code) return res.json({ ok: false, error: 'Payment code is required.' });
 try {
  // Ticket must exist and be paid
  const [tRows] = await pool.query(
   "SELECT * FROM tbl_payment_ticket WHERE ticket_code = ? AND status = 'paid' LIMIT 1",
   [code]
  ).catch(() => [[]]);
  if (!tRows.length) return res.json({ ok: false, error: 'Payment code not found or not paid.' });
  const t = tRows[0];

  const wv = await paymentValidity.assertPaidTicketValidityForVisit(
   pool,
   t,
   code,
   t.facility_id || req.session.facilityId || 1
  );
  if (!wv.ok) {
   return res.json({ ok: false, error: wv.error || 'This payment code is not valid for admission.' });
  }

  // Patient
  const pid = parseInt(t.patient_id) || 0;
  const [[pat]] = await pool.query(
   'SELECT id, first_name, last_name, patient_code, phone, gender, dob FROM tbl_patient WHERE id = ? LIMIT 1',
   [pid]
  ).catch(() => [[null]]);
  const patient_name = pat ? `${pat.first_name || ''} ${pat.last_name || ''}`.trim() : ('#P-' + pid);

  // Try to infer doctor from ticket lines_json (if present)
  let doctor_id = null;
  let doctor_name = null;
  try {
   const lines = JSON.parse(t.lines_json || '[]');
   const docId = parseInt(lines?.[0]?.assigned_doctor_id) || parseInt(lines?.[0]?.doctor_id) || 0;
   if (docId > 0) doctor_id = docId;
  } catch (e) {}
  if (doctor_id) {
   const [[doc]] = await pool.query(
    'SELECT first_name, last_name FROM tbl_employee WHERE id = ? LIMIT 1',
    [doctor_id]
   ).catch(() => [[null]]);
   if (doc) doctor_name = `Dr. ${(doc.first_name || '').trim()} ${(doc.last_name || '').trim()}`.trim();
  }

  // Fallback: infer doctor from latest consultation (doctor who consulted the patient)
  if (!doctor_id) {
   const [[cDoc]] = await pool.query(
    `SELECT c.created_by, e.first_name, e.last_name
     FROM tbl_consultation c
     LEFT JOIN tbl_employee e ON e.id = c.created_by
     WHERE c.patient_id = ?
     ORDER BY c.id DESC
     LIMIT 1`,
    [pid]
   ).catch(() => [[null]]);
   const cdid = parseInt(cDoc?.created_by || 0) || 0;
   if (cdid > 0) {
    doctor_id = cdid;
    if (cDoc?.first_name || cDoc?.last_name) {
     doctor_name = `Dr. ${(cDoc.first_name || '').trim()} ${(cDoc.last_name || '').trim()}`.trim();
    }
   }
  }

  // Diagnosis: best-effort from latest consultation
  let diagnosis = '';
  try {
   const [[c]] = await pool.query(
    'SELECT admitting_diagnosis, diagnosis, assessment FROM tbl_consultation WHERE patient_id = ? ORDER BY id DESC LIMIT 1',
    [pid]
   ).catch(() => [[null]]);
   diagnosis = String(c?.admitting_diagnosis || c?.diagnosis || c?.assessment || '').trim();
  } catch (e) {}

  const deposit = parseFloat(t.total_amount || 0) || 0;
  const paymentKind = wv.meta?.payment_kind || paymentValidity.inferPaymentKind(t.lines_json);
  const isHospitalisation = paymentKind === 'hospitalisation';
  if (!isHospitalisation) {
   return res.json({
    ok: false,
    error: 'This payment code is not a hospitalisation (HOS) fee ticket. Collect hospitalisation prepayment at Cashier first.',
   });
  }
  const expectedPid = parseInt(req.query.patient_id, 10) || 0;
  if (expectedPid > 0 && pid !== expectedPid) {
   return res.json({ ok: false, error: 'This payment code belongs to a different patient.' });
  }
  return res.json({
   ok: true,
   patient_id: pid,
   patient_name,
   patient_code: pat?.patient_code || '',
   patient_phone: pat?.phone || '',
   patient_gender: pat?.gender || '',
   patient_dob: pat?.dob || '',
   doctor_id,
   doctor_name,
   diagnosis,
   deposit,
   deposit_amount: deposit,
   payment_kind: paymentKind,
   validity: isHospitalisation ? null : (wv.meta || null),
   validity_message: isHospitalisation ? null : (wv.validity_message || null),
   patient_notice: isHospitalisation ? null : (wv.patient_notice || null),
  });
 } catch (err) {
  return res.json({ ok: false, error: err.message });
 }
});

// STATION 3: Admit patient to bed
app.post('/wards/admit', requireAuth, async (req, res) => {
 const bed_id = parseInt(req.body.bed_id) || 0;
 const patient_id = parseInt(req.body.patient_id) || 0;
 const admission_id = parseInt(req.body.admission_id) || 0;
 const admitting_doctor_id = parseInt(req.body.admitting_doctor_id) || 0;
 const admitting_department = String(req.body.admitting_department || '').trim() || 'General';
 let deposit_amount = parseFloat(req.body.deposit_amount) || 0;
 const admitting_diagnosis = String(req.body.admitting_diagnosis || '').trim();
 const payment_code_raw = String(req.body.payment_code || '').trim();
 const payment_code = payment_code_raw ? paymentValidity.normalizePaymentCodeInput(payment_code_raw) : '';
 const pay_later =
  req.body.pay_later === '1' || req.body.pay_later === 'on' || req.body.pay_later === true || req.body.pay_later === 'true';
 const uid = req.session.userId || req.session.user?.id || null;
 const fid = req.session.facilityId || 1;

 if (bed_id < 1 || patient_id < 1) return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.missing_bed_or_patient')))

 if (admission_id > 0 && !pay_later && !payment_code) {
  return res.redirect(
   '/wards?err=' + encodeURIComponent(flashT(res, 'flash.hospitalisation_payment_required'))
  );
 }
 if (admission_id < 1 && !pay_later && !payment_code) {
  return res.redirect(
   '/wards?err=' + encodeURIComponent(flashT(res, 'flash.hospitalisation_payment_required'))
  );
 }

 let hos_payment_code = null;
 if (payment_code) {
  const tktRow = await paymentValidity.findPaidTicketByNormalizedCode(pool, payment_code);
  if (!tktRow) {
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'payment.no_paid_ticket')));
  }
  const vchk = await paymentValidity.assertPaidTicketValidityForVisit(pool, tktRow, payment_code, fid);
  if (!vchk.ok) {
   return res.redirect('/wards?err=' + encodeURIComponent(vchk.error || 'This payment code cannot be used for admission.'));
  }
  const ticketKind = vchk.meta?.payment_kind || paymentValidity.inferPaymentKind(tktRow.lines_json);
  if (ticketKind !== 'hospitalisation') {
   return res.redirect(
    '/wards?err=' + encodeURIComponent(flashT(res, 'flash.hospitalisation_code_required'))
   );
  }
  const ticketPid = parseInt(tktRow.patient_id) || 0;
  if (ticketPid !== patient_id) {
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.payment_code_patient_mismatch')));
  }
  if (!deposit_amount) deposit_amount = parseFloat(tktRow.total_amount || 0) || 0;
  hos_payment_code = payment_code;
 }

 // Ensure minimal admission columns exist (dev convenience)
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS facility_id INT DEFAULT 1").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_status VARCHAR(30) DEFAULT 'admitted'").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(12,2) DEFAULT 0").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_department VARCHAR(120) DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_diagnosis VARCHAR(255) DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_doctor_id INT DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS created_by INT DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitted_at DATETIME DEFAULT CURRENT_TIMESTAMP").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS running_bill DECIMAL(12,2) DEFAULT 0").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS hos_payment_code VARCHAR(40) DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS hos_payment_deferred TINYINT(1) NOT NULL DEFAULT 0").catch(() => {});

 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();
  const [[bed]] = await conn.query('SELECT id, status FROM tbl_bed WHERE id=? FOR UPDATE', [bed_id]).catch(() => [[null]]);
  if (!bed) {
   await conn.rollback(); conn.release();
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.bed_not_found')))
  }
  const bst = String(bed.status || '').toLowerCase();
  if (bst === 'occupied') {
   await conn.rollback(); conn.release();
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.bed_is_already_occupied')))
  }
  if (bst !== 'available') {
   await conn.rollback(); conn.release();
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.bed_must_be_marked_available_before_admitting_use_mark_ready_after_house')));
  }

  if (admission_id > 0) {
   const notDischarged = wardBoard.NOT_DISCHARGED;
   const [[existing]] = await conn
    .query(
     `SELECT a.id, a.patient_id, a.bed_id, a.ipd_status
      FROM tbl_admission a
      WHERE a.id = ? AND ${notDischarged}
      FOR UPDATE`,
     [admission_id]
    )
    .catch(() => [[null]]);
   if (!existing) {
    await conn.rollback();
    conn.release();
    return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_admission')));
   }
   if (parseInt(existing.patient_id, 10) !== patient_id) {
    await conn.rollback();
    conn.release();
    return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.payment_code_patient_mismatch')));
   }
   const existingBedId = parseInt(existing.bed_id, 10) || 0;
   if (existingBedId > 0) {
    await conn.rollback();
    conn.release();
    return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.bed_is_already_occupied')));
   }

   await conn.query(
    `UPDATE tbl_admission
     SET bed_id = ?,
         ipd_status = 'admitted',
         admitting_department = COALESCE(NULLIF(?, ''), admitting_department),
         admitting_diagnosis = COALESCE(NULLIF(?, ''), admitting_diagnosis),
         admitting_doctor_id = COALESCE(NULLIF(?, 0), admitting_doctor_id),
         deposit_amount = CASE WHEN ? > 0 THEN ? ELSE deposit_amount END,
         hos_payment_code = COALESCE(NULLIF(?, ''), hos_payment_code),
         hos_payment_deferred = ?
     WHERE id = ?`,
    [
     bed_id,
     admitting_department,
     admitting_diagnosis || null,
     admitting_doctor_id || null,
     deposit_amount,
     deposit_amount,
     hos_payment_code,
     pay_later ? 1 : 0,
     admission_id,
    ]
   );
   await conn.query("UPDATE tbl_bed SET status='occupied' WHERE id=?", [bed_id]).catch(() => {});
   await conn.commit();
   conn.release();
   return res.redirect('/wards?msg=' + encodeURIComponent(flashT(res, 'flash.patient_admitted', { id: admission_id })));
  }

  const [ins] = await conn.query(
   `INSERT INTO tbl_admission
    (facility_id, patient_id, bed_id, ipd_status, admitting_department, admitting_diagnosis, admitting_doctor_id, deposit_amount, hos_payment_code, hos_payment_deferred, created_by, admitted_at, running_bill)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),0)`,
   [fid, patient_id, bed_id, 'admitted', admitting_department, admitting_diagnosis || null, admitting_doctor_id || null, deposit_amount, hos_payment_code, pay_later ? 1 : 0, uid]
  );

  await conn.query("UPDATE tbl_bed SET status='occupied' WHERE id=?", [bed_id]).catch(() => {});
  await conn.commit();
  conn.release();

  res.redirect('/wards?msg=' + encodeURIComponent(flashT(res, 'flash.patient_admitted', { id: ins.insertId })));
 } catch (err) {
  await conn.rollback().catch(() => {});
  conn.release();
  res.redirect('/wards?err=' + encodeURIComponent(err.message));
 }
});

// STATION 8: Clinical discharge (doctor)
app.post('/wards/clinical-discharge', requireAuth, async (req, res) => {
 const aid = parseInt(req.body.admission_id) || 0;
 const discharge_summary = String(req.body.discharge_summary || req.body.notes || '').trim();
 const follow_up = String(req.body.follow_up || '').trim();
 const uid = req.session.userId || req.session.user?.id || null;
 const isJson = String(req.get('Accept') || '').includes('application/json');

 if (aid < 1) {
  if (isJson) return res.status(400).json({ ok: false, error: 'Invalid admission' });
  return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_admission')));
 }
 if (!discharge_summary) {
  if (isJson) return res.status(400).json({ ok: false, error: 'Discharge summary is required' });
  return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.discharge_summary_required')));
 }

 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS clinical_discharged_at DATETIME DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS clinical_discharged_by INT DEFAULT NULL").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS discharge_summary TEXT").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS follow_up TEXT").catch(() => {});
 await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_status VARCHAR(30) DEFAULT 'admitted'").catch(() => {});

 try {
  await pool.query(
   `UPDATE tbl_admission
    SET clinical_discharged_at=NOW(),
        clinical_discharged_by=?,
        discharge_summary=?,
        follow_up=?,
        ipd_status='clinical_discharged'
    WHERE id=? AND discharged_at IS NULL`,
   [uid, discharge_summary, follow_up || null, aid]
  );
  if (isJson) return res.json({ ok: true, msg: 'Clinical discharge saved' });
  const returnTo = req.body.return_to || '/wards';
  res.redirect(returnTo + '?msg=' + encodeURIComponent(flashT(res, 'flash.clinical_discharge_saved')));
 } catch (err) {
  if (isJson) return res.status(500).json({ ok: false, error: err.message });
  const returnTo = req.body.return_to || '/wards';
  res.redirect(returnTo + '?err=' + encodeURIComponent(err.message));
 }
});

// IPD WARD ROUNDS (Stations 4 & 5)
app.get('/ipd/ward-rounds', requireAuth, async (req, res) => {
 try {
  // Ensure vitals source table exists (some deployments use tbl_vital_sign)
  const [admissions] = await pool.query(`
   SELECT
    a.*,
    p.first_name, p.last_name,
    b.ward_name, b.bed_label,
    DATEDIFF(CURDATE(), DATE(a.admitted_at)) AS los_days
   FROM tbl_admission a
   JOIN tbl_patient p ON p.id=a.patient_id
   LEFT JOIN tbl_bed b ON b.id=a.bed_id
   WHERE a.discharged_at IS NULL AND a.bed_id IS NOT NULL
   ORDER BY a.admitted_at DESC
   LIMIT 120
  `).catch(() => [[]]);

  // Attach latest vitals (best effort: tbl_patient_vitals OR tbl_vital_sign)
  const list = Array.isArray(admissions) ? admissions : [];
  for (const adm of list) {
   let vit = null;
   const pid = parseInt(adm.patient_id) || 0;
   if (pid) {
    const [[v1]] = await pool.query(
     'SELECT * FROM tbl_patient_vitals WHERE patient_id=? ORDER BY id DESC LIMIT 1',
     [pid]
    ).catch(() => [[null]]);
    if (v1) vit = v1;
    if (!vit) {
     const [[v2]] = await pool.query(
      'SELECT * FROM tbl_vital_sign WHERE patient_id=? ORDER BY id DESC LIMIT 1',
      [pid]
     ).catch(() => [[null]]);
     vit = v2 || null;
    }
   }
   adm.latest_vitals = vit;

   // 1. Load active treatment/diagnosis
   const [[activeTx]] = await pool.query(
     'SELECT * FROM tbl_ipd_treatment WHERE admission_id=? AND status="active" LIMIT 1',
     [adm.id]
   ).catch(() => [[null]]);
   adm.active_treatment = activeTx || null;

   // 2. Load active prescriptions
   if (activeTx) {
     const [rxs] = await pool.query(
       'SELECT * FROM tbl_ipd_prescription WHERE treatment_id=? ORDER BY id ASC',
       [activeTx.id]
     ).catch(() => [[]]);
     adm.active_prescriptions = rxs || [];
   } else {
     adm.active_prescriptions = [];
   }

   // 3. Load latest 5 ward round notes
   const [notes] = await pool.query(
     'SELECT n.*, CONCAT(e.first_name," ",e.last_name) AS author_name FROM tbl_ipd_ward_note n LEFT JOIN tbl_employee e ON e.id = n.written_by WHERE n.admission_id=? ORDER BY n.id DESC LIMIT 5',
     [adm.id]
   ).catch(() => [[]]);
   adm.ward_notes_history = notes || [];
  }

  const { ipdPageData } = require('./lib/reactRouteHelpers');
  res.render('ipd-ward-rounds', {
   title: pageTitle(res, 'document_titles.ward_rounds', 'Ward Rounds — ZAIZENS'),
   ...ipdPageData('ward-rounds', {
    admissions: list,
    staffDoctorId: parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0,
    staffRole: String(req.session.user?.role || ''),
    flash: req.query.msg || null,
    error: req.query.err || null,
   }),
  });
 } catch (err) {
  console.error('IPD WARD ROUNDS ERROR:', err.message);
  renderAppError(res, 500, 'page.load_ward_rounds', 'Ward rounds load failure.', { detail: err.message })
 }
});

app.post('/ipd/ward-rounds/save', requireAuth, async (req, res) => {
 const aid = parseInt(req.body.admission_id) || 0;
 const ward_notes = String(req.body.ward_notes || '').trim();
 const new_orders = String(req.body.new_orders || '').trim();
 const uid = req.session.userId || req.session.user?.id || 1;
 if (aid < 1) return res.redirect('/ipd/ward-rounds?err=' + encodeURIComponent(flashT(res, 'flash.admission_not_found')))
 try {
  // Ensure table exists
  await pool.query(`
   CREATE TABLE IF NOT EXISTS tbl_ipd_ward_note (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admission_id INT NOT NULL,
    patient_id INT NOT NULL,
    note_text TEXT,
    orders_text TEXT,
    written_by INT DEFAULT NULL,
    written_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_admission (admission_id)
   )
  `);

  const [[adm]] = await pool.query('SELECT patient_id FROM tbl_admission WHERE id=? LIMIT 1', [aid]).catch(() => [[null]]);
  const pid = parseInt(adm?.patient_id) || 0;
  await pool.query(
   'INSERT INTO tbl_ipd_ward_note (admission_id, patient_id, note_text, orders_text, written_by) VALUES (?,?,?,?,?)',
   [aid, pid, ward_notes || '', new_orders || '', uid]
  );
  res.redirect('/ipd/ward-rounds?msg=' + encodeURIComponent(flashT(res, 'flash.ward_round_note_saved')))
 } catch (err) {
  console.error('WARD ROUND SAVE ERROR:', err.message);
  res.redirect('/ipd/ward-rounds?err=' + encodeURIComponent(flashT(res, 'flash.save_failed', { message: err.message })));
 }
});

// IPD CODE VALIDATION (Ward Station 10)
app.get('/wards/validate-ipd-code', requireAuth, async (req, res) => {
 const aid = parseInt(req.query.admission_id) || 0;
 const code = String(req.query.code || '').trim().toUpperCase();
 if (aid < 1) return res.json({ ok: false, error: 'Invalid admission.' });
 const fmt = (dt) => {
  if (!dt) return '—';
  try {
   const d = new Date(dt);
   if (Number.isNaN(d.getTime())) return String(dt);
   return d.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
  } catch (e) {
   return String(dt);
  }
 };
 try {
  await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_payment_code VARCHAR(40) DEFAULT NULL").catch(() => {});
  await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_code_consumed_at DATETIME DEFAULT NULL").catch(() => {});
  const [[row]] = await pool.query(
   `SELECT a.id, a.patient_id, a.deposit_amount, a.ipd_payment_code, a.ipd_code_consumed_at,
           p.first_name, p.last_name,
           b.ward_name, b.bed_label,
           a.discharged_at
    FROM tbl_admission a
    JOIN tbl_patient p ON p.id=a.patient_id
    LEFT JOIN tbl_bed b ON b.id=a.bed_id
    WHERE a.id=?
    LIMIT 1`,
   [aid]
  ).catch(() => [[null]]);
  if (!row) return res.json({ ok: false, error: 'Admission not found.' });

  const patientName = `${row.first_name} ${row.last_name}`.trim();

  if (row.discharged_at) {
   return res.json({ ok: false, error: 'This admission is already discharged.' });
  }

  if (row.ipd_code_consumed_at && String(row.ipd_payment_code || '').trim()) {
   return res.json({
    ok: false,
    error: `This Payment Code has already been confirmed on ${fmt(row.ipd_code_consumed_at)} for ${patientName}.`
   });
  }

  const [[sum]] = await pool.query(
   'SELECT COALESCE(SUM(amount),0) AS total_charges FROM tbl_ipd_charge WHERE admission_id=?',
   [aid]
  ).catch(() => [[{ total_charges: 0 }]]);
  const total = parseFloat(sum?.total_charges || 0) || 0;
  const deposit = parseFloat(row.deposit_amount || 0) || 0;
  const balance = Math.max(0, total - deposit);
  const zeroBalance = balance <= 0.001;

  if (!row.ipd_payment_code)
   return res.json({ ok: false, error: 'No settlement code found. Cashier must settle first.' });
  if (!code) return res.json({ ok: false, error: 'Enter the IPD payment code from Cashier.' });

  const expected = String(row.ipd_payment_code || '').trim().toUpperCase();
  if (code !== expected) {
   const [[glob]] = await pool.query(
    `SELECT a.ipd_code_consumed_at, a.discharged_at, p.first_name, p.last_name
     FROM tbl_admission a
     JOIN tbl_patient p ON p.id = a.patient_id
     WHERE UPPER(TRIM(a.ipd_payment_code)) = ? AND TRIM(a.ipd_payment_code) <> ''
     LIMIT 1`,
    [code]
   ).catch(() => [[null]]);
   const consumedAt = glob?.ipd_code_consumed_at || glob?.discharged_at;
   if (glob && consumedAt) {
    const pn = `${glob.first_name} ${glob.last_name}`.trim();
    return res.json({
     ok: false,
     error: `This Payment Code has already been confirmed on ${fmt(consumedAt)} for ${pn}.`
    });
   }
   return res.json({ ok: false, error: 'Invalid payment code.' });
  }

  return res.json({
   ok: true,
   zero_balance: zeroBalance,
   payment_code: row.ipd_payment_code,
   patient_name: patientName,
   ward: row.ward_name || '—',
   bed: row.bed_label || '—',
   total_charges: total,
   deposit,
   balance: zeroBalance ? 0 : balance
  });
 } catch (err) {
  return res.json({ ok: false, error: err.message });
 }
});

app.post('/wards/confirm-discharge', requireAuth, async (req, res) => {
 const aid = parseInt(req.body.admission_id) || 0;
 const paymentCodeIn = String(req.body.payment_code || '').trim().toUpperCase();
 if (aid < 1) return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_admission')))
 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();
  await conn.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_payment_code VARCHAR(40) DEFAULT NULL").catch(() => {});
  await conn.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_code_consumed_at DATETIME DEFAULT NULL").catch(() => {});
  const nd = '(discharged_at IS NULL OR discharged_at = \'0000-00-00 00:00:00\' OR discharged_at = \'0000-00-00\')';
  const [[adm]] = await conn.query(
   `SELECT a.id, a.bed_id, a.patient_id, a.deposit_amount, a.ipd_payment_code, a.ipd_code_consumed_at,
           p.first_name, p.last_name
    FROM tbl_admission a
    JOIN tbl_patient p ON p.id=a.patient_id
    WHERE a.id=? AND ${nd} LIMIT 1 FOR UPDATE`,
   [aid]
  ).catch(() => [[null]]);
  if (!adm) {
   await conn.rollback();
   conn.release();
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.admission_not_found_or_already_finalized')))
  }

  const patientName = `${adm.first_name} ${adm.last_name}`.trim();
  const storedCode = String(adm.ipd_payment_code || '').trim();

  if (adm.ipd_code_consumed_at && storedCode) {
   await conn.rollback();
   conn.release();
   const dt = new Date(adm.ipd_code_consumed_at);
   const when = Number.isNaN(dt.getTime())
    ? String(adm.ipd_code_consumed_at)
    : dt.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
   return res.redirect(
    '/wards?err=' +
     encodeURIComponent(`This Payment Code has already been confirmed on ${when} for ${patientName}.`)
   );
  }

  const [[sum]] = await conn.query(
   'SELECT COALESCE(SUM(amount),0) AS total_charges FROM tbl_ipd_charge WHERE admission_id=?',
   [aid]
  ).catch(() => [[{ total_charges: 0 }]]);
  const total = parseFloat(sum?.total_charges || 0) || 0;
  const deposit = parseFloat(adm.deposit_amount || 0) || 0;
  const balance = Math.max(0, total - deposit);

  if (!storedCode) {
   await conn.rollback();
   conn.release();
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.no_settlement_code_on_file_cashier_must_settle_this_admission_before_war')));
  }
  if (!paymentCodeIn) {
   await conn.rollback();
   conn.release();
   return res.redirect(
    '/wards?err=' +
     encodeURIComponent(flashT(res, 'flash.enter_and_validate_the_ipd_payment_code_from_cashier_before_confirming_d'))
   );
  }
  if (paymentCodeIn !== storedCode.toUpperCase()) {
   await conn.rollback();
   conn.release();
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_payment_code_ward_validation_must_match_cashier_settlement')));
  }

  const hadCode = Boolean(storedCode);
  if (hadCode) {
   await conn.query(
    `UPDATE tbl_admission SET discharged_at=NOW(), ipd_status='discharged', ipd_code_consumed_at=NOW() WHERE id=?`,
    [aid]
   );
  } else {
   await conn.query(`UPDATE tbl_admission SET discharged_at=NOW(), ipd_status='discharged' WHERE id=?`, [aid]);
  }
  if (adm.bed_id) {
   await conn.query("UPDATE tbl_bed SET status='housekeeping' WHERE id=?", [adm.bed_id]);
  }
  await conn.commit();
  conn.release();
  res.redirect('/wards?msg=' + encodeURIComponent(flashT(res, 'flash.patient_discharged_bed_flagged_for_cleaning_use_mark_ready_when_the_room')));
 } catch (err) {
  await conn.rollback().catch(() => {});
  conn.release();
  res.redirect('/wards?err=' + encodeURIComponent(err.message));
 }
});

// Move an active inpatient to another available bed (drag-and-drop on ward board)
app.post('/wards/transfer-patient', requireAuth, async (req, res) => {
 const admission_id = parseInt(req.body.admission_id, 10) || 0;
 const to_bed_id = parseInt(req.body.to_bed_id, 10) || 0;
 const wantJson =
  String(req.get('Accept') || '').includes('application/json') ||
  String(req.get('Content-Type') || '').includes('application/json');
 if (admission_id < 1 || to_bed_id < 1) {
  if (wantJson) return res.json({ ok: false, error: 'Invalid admission or target bed.' });
  return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_admission_or_target_bed')));
 }
 const conn = await pool.getConnection();
 try {
  await conn.beginTransaction();
  const [[adm]] = await conn.query(
   `SELECT id, patient_id, bed_id FROM tbl_admission
    WHERE id=? AND (discharged_at IS NULL OR discharged_at = '0000-00-00 00:00:00' OR discharged_at = '0000-00-00')
    LIMIT 1 FOR UPDATE`,
   [admission_id]
  );
  if (!adm?.bed_id) {
   await conn.rollback();
   conn.release();
   if (wantJson) return res.json({ ok: false, error: 'Admission not active or bed not assigned.' });
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.admission_not_active_or_bed_not_assigned')));
  }
  const fromBid = parseInt(adm.bed_id, 10) || 0;
  if (fromBid === to_bed_id) {
   await conn.rollback();
   conn.release();
   if (wantJson) return res.json({ ok: true, message: 'Patient is already on that bed.' });
   return res.redirect('/wards?msg=' + encodeURIComponent(flashT(res, 'flash.already_on_that_bed')));
  }
  const [[toBed]] = await conn.query('SELECT id, status FROM tbl_bed WHERE id=? FOR UPDATE', [to_bed_id]);
  if (!toBed) {
   await conn.rollback();
   conn.release();
   if (wantJson) return res.json({ ok: false, error: 'Target bed not found.' });
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.target_bed_not_found')))
  }
  if (String(toBed.status || '').toLowerCase() !== 'available') {
   await conn.rollback();
   conn.release();
   if (wantJson) return res.json({ ok: false, error: 'Target bed must be Available (empty).' });
   return res.redirect('/wards?err=' + encodeURIComponent(flashT(res, 'flash.target_bed_must_be_available')));
  }
  await conn.query('UPDATE tbl_admission SET bed_id=? WHERE id=?', [to_bed_id, admission_id]);
  await conn.query("UPDATE tbl_bed SET status='available' WHERE id=?", [fromBid]);
  await conn.query("UPDATE tbl_bed SET status='occupied' WHERE id=?", [to_bed_id]);
  await conn.commit();
  conn.release();
  if (wantJson) return res.json({ ok: true, message: 'Patient transferred.', admission_id, to_bed_id });
  res.redirect('/wards?msg=' + encodeURIComponent(flashT(res, 'flash.patient_transferred_to_selected_bed')));
 } catch (err) {
  await conn.rollback().catch(() => {});
  conn.release();
  if (wantJson) return res.json({ ok: false, error: err.message });
  res.redirect('/wards?err=' + encodeURIComponent(err.message));
 }
});

//  -  Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== Æ’ ============================== 
// DEBUG: IPD admission status check (remove after debugging)
app.get('/debug-ipd', async (req, res) => {
 try {
 const [rows] = await pool.query(`
 SELECT a.id, a.ipd_status, a.clinical_discharged_at, a.discharged_at,
 a.ipd_payment_code, p.first_name, p.last_name
 FROM tbl_admission a
 JOIN tbl_patient p ON p.id = a.patient_id
 ORDER BY a.id DESC LIMIT 20
 `);
 res.json({ count: rows.length, admissions: rows });
 } catch(e) { res.json({ error: e.message }); }
});

// TEMP TEST: Simulate clinical discharge on admission 2 (remove after testing)
app.get('/test-clinical-dc', async (req, res) => {
 const aid = parseInt(req.query.id || 2);
 try {
 await pool.query(`
 UPDATE tbl_admission
 SET clinical_discharged_at = NOW(),
 ipd_status = 'clinical_discharged',
 clinical_discharged_by = 1,
 discharge_summary = 'Test clinical discharge'
 WHERE id = ?
 `, [aid]);
 res.json({ ok: true, msg: 'Admission ' + aid + ' set to clinical_discharged' });
 } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Laboratory · structured test templates (registered late so nothing shadows this path)
function renderLabTemplateWorkbench(req, res) {
 res.render('laboratory-templates', labOdooLocals({
  title: pageTitle(res, 'document_titles.lab_templates', 'Lab templates · Laboratory · ZAIZENS'),
  queryCode: (req.query.code || '').toString().trim(),
  queryOi: (req.query.oi || '').toString().trim()
 }));
}
function renderRadTemplateWorkbench(req, res) {
 res.render('radiology-templates', {
  title: pageTitle(res, 'document_titles.rad_templates', 'Radiology templates · Imaging · ZAIZENS'),
  queryCode: (req.query.code || '').toString().trim(),
  queryOi: (req.query.oi || '').toString().trim()
 });
}
const labTemplatePagePerm = requirePerm('lab.read', 'lab.write', 'clinical.read', 'clinical.write', 'nursing.read');
const radTemplatePagePerm = requirePerm('radiology.read', 'radiology.write', 'clinical.read', 'clinical.write', 'nursing.read');
app.get('/lab/templates', requireAuth, labTemplatePagePerm, renderLabTemplateWorkbench);
app.get('/laboratory/templates', requireAuth, labTemplatePagePerm, renderLabTemplateWorkbench);
app.get('/laboratory/test-templates', requireAuth, labTemplatePagePerm, (req, res) => {
 const qs = new URLSearchParams(req.query).toString();
 res.redirect(302, '/laboratory/templates' + (qs ? '?' + qs : ''));
});
app.get('/radiology/templates', requireAuth, radTemplatePagePerm, renderRadTemplateWorkbench);
app.get('/rad/templates', requireAuth, radTemplatePagePerm, renderRadTemplateWorkbench);

app.get('/radiology/report/:id', requireAuth, requirePerm('radiology.read', 'radiology.write', 'clinical.read', 'clinical.write', 'nursing.read'), async (req, res) => {
 try {
  const id = parseInt(req.params.id, 10) || 0;
  if (id < 1) return res.redirect('/radiology?err=' + encodeURIComponent(flashT(res, 'flash.invalid_report_id')));
  const [[row]] = await pool
   .query(
    `SELECT rr.*, p.first_name AS p_fn, p.last_name AS p_ln,
            e.first_name AS ref_fn, e.last_name AS ref_ln,
            oi_ref.first_name AS oi_ref_fn, oi_ref.last_name AS oi_ref_ln
       FROM tbl_radiology_result rr
       JOIN tbl_patient p ON p.id = rr.patient_id
       LEFT JOIN tbl_employee e ON e.id = rr.referred_by_id
       LEFT JOIN tbl_opd_order_item oi ON oi.id = rr.opd_order_item_id
       LEFT JOIN tbl_consultation cons ON cons.id = oi.consultation_id
       LEFT JOIN tbl_employee oi_ref ON oi_ref.id = cons.created_by
      WHERE rr.id = ? LIMIT 1`,
    [id]
   )
   .catch(() => [[null]]);
  if (!row) return res.redirect('/radiology?err=' + encodeURIComponent(flashT(res, 'flash.report_not_found')));
  let structured = null;
  const raw = row.structured_result || row.result_template_json;
  if (raw) {
   try {
    structured = JSON.parse(raw);
   } catch (_) {
    structured = null;
   }
  }
  let correctionHistory = [];
  let validateCode = '';
  if (row.opd_order_item_id) {
   const [cRows] = await pool
    .query(
     `SELECT a.superseded_findings, a.superseded_conclusion, a.performed_at,
             TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,''))) AS performer_name
        FROM tbl_diagnostic_result_correction_audit a
        LEFT JOIN tbl_employee e ON e.id = a.performed_by
       WHERE a.event_type = 'correct' AND a.module = 'radiology' AND a.opd_order_item_id = ?
       ORDER BY a.id ASC`,
     [row.opd_order_item_id]
    )
    .catch(() => [[]]);
   correctionHistory = cRows || [];
   const [[oi2]] = await pool
    .query('SELECT service_code FROM tbl_opd_order_item WHERE id=? LIMIT 1', [row.opd_order_item_id])
    .catch(() => [[null]]);
   if (oi2 && oi2.service_code) validateCode = String(oi2.service_code).trim();
  } else {
   const [cRows] = await pool
    .query(
     `SELECT a.superseded_findings, a.superseded_conclusion, a.performed_at,
             TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.last_name,''))) AS performer_name
        FROM tbl_diagnostic_result_correction_audit a
        LEFT JOIN tbl_employee e ON e.id = a.performed_by
       WHERE a.event_type = 'correct' AND a.module = 'radiology' AND a.radiology_result_id = ?
       ORDER BY a.id ASC`,
     [id]
    )
    .catch(() => [[]]);
   correctionHistory = cRows || [];
  }
  const { fetchAttachmentsForResult } = require('./lib/diagnosticResultAttachment');
  const attachments = await fetchAttachmentsForResult(pool, 'radiology', id);
  const examName = row.exam_name || row.test_name || pageTitle(res, 'document_titles.result_fallback', 'Result');
  const { loadRadPrintPayload, buildDiagnosticPrintPayload, enrichRefDisplay } = require('./lib/diagnosticReportPrintPayload');
  let printPayload = await loadRadPrintPayload(pool, id);
  if (!printPayload) {
   enrichRefDisplay(row);
   printPayload = buildDiagnosticPrintPayload('radiology', row, structured, validateCode, null);
  }
  const templatesPath =
   row.opd_order_item_id && validateCode
    ? `/radiology/templates?code=${encodeURIComponent(validateCode)}&oi=${row.opd_order_item_id}&lock=1&autoload=1`
    : `/radiology/templates?radiology_result_id=${id}&pid=${row.patient_id || ''}`;
  res.render('radiology-report-view', {
   title: pageTitle(res, 'document_titles.imaging_exam', 'Imaging exam · {{name}} · ZAIZENS', { name: examName }),
   row,
   structured,
   correctionHistory,
   validateCode,
   attachments,
   printPayload,
   handoverModule: 'radiology',
   handoverTemplatesPath: templatesPath,
   flash: req.query.msg || null,
  });
 } catch (err) {
  console.error(err);
  res.redirect('/radiology?err=' + encodeURIComponent(flashT(res, 'flash.could_not_open_report')));
 }
});

app.get('/radiology/print-all/:patientId', requireAuth, requirePerm('radiology.read','radiology.write','clinical.read','clinical.write','nursing.read'), async (req, res) => {
 try {
  const patientId = parseInt(String(req.params.patientId || '').replace(/\D/g, ''), 10) || 0;
  if (patientId < 1) {
   return res.redirect('/radiology?err=' + encodeURIComponent(flashT(res, 'flash.invalid_patient', { defaultValue: 'Invalid patient.' })));
  }
  const [[pat]] = await pool
   .query('SELECT id, first_name, last_name FROM tbl_patient WHERE id = ? LIMIT 1', [patientId])
   .catch(() => [[null]]);
  const { loadRadPrintPayloadsByPatient, buildBatchPrintResponse } = require('./lib/diagnosticReportPrintPayload');
  const reports = await loadRadPrintPayloadsByPatient(pool, patientId);
  const patientName = pat ? [pat.first_name, pat.last_name].filter(Boolean).join(' ').trim() : '';
  const batchData = buildBatchPrintResponse('radiology', null, reports, {
   batchType: 'patient',
   patientNumericId: patientId,
   patientName,
   patientId: `#P-${patientId}`,
  });
  batchData.packageTitle = 'Radiology results package';
  const { renderDiagBatchPrint } = require('./lib/diagnosticBatchPrintRoute');
  return renderDiagBatchPrint(req, res, {
   title: pageTitle(res, 'document_titles.rad_batch_print', 'Radiology results — {{name}}', { name: patientName || `#P-${patientId}` }),
   batchData,
   backUrl: '/radiology',
   emptyMessage: flashT(res, 'flash.no_printable_rad_batch', { defaultValue: 'No completed printable radiology results for this patient yet.' }),
   noSelectionMessage: flashT(res, 'flash.no_printable_rad_selection', { defaultValue: 'None of the selected results are printable yet.' }),
   module: 'radiology',
   pickerLabels: {
    title: flashT(res, 'diag_batch_picker.title_rad', { ns: 'common', defaultValue: 'Select radiology results to print' }),
    subtitle: flashT(res, 'diag_batch_picker.subtitle', { ns: 'common', defaultValue: 'Choose one or more completed reports, then print a combined patient handover package.' }),
    selectAll: flashT(res, 'diag_batch_picker.select_all', { ns: 'common', defaultValue: 'Select all' }),
    clearAll: flashT(res, 'diag_batch_picker.clear_all', { ns: 'common', defaultValue: 'Clear all' }),
    printSelected: flashT(res, 'diag_batch_picker.print_selected', { ns: 'common', defaultValue: 'Print selected' }),
    printAll: flashT(res, 'diag_batch_picker.print_all', { ns: 'common', defaultValue: 'Print all' }),
    cancel: flashT(res, 'actions.cancel', { ns: 'common', defaultValue: 'Cancel' }),
   },
  });
 } catch (err) {
  console.error('radiology print-all:', err.message);
  return res.redirect('/radiology?err=' + encodeURIComponent(flashT(res, 'flash.print_batch_failed', { defaultValue: 'Could not prepare batch print.', message: err.message })));
 }
});

app.get('/radiology/print-all-by-code/:code', requireAuth, requirePerm('radiology.read','radiology.write','clinical.read','clinical.write','nursing.read'), async (req, res) => {
 try {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) {
   return res.redirect('/radiology/validate?err=' + encodeURIComponent(flashT(res, 'flash.invalid_code', { defaultValue: 'Invalid code.' })));
  }
  const { loadRadPrintPayloadsByCode, buildBatchPrintResponse } = require('./lib/diagnosticReportPrintPayload');
  const reports = await loadRadPrintPayloadsByCode(pool, code);
  const batchData = buildBatchPrintResponse('radiology', code, reports);
  batchData.packageTitle = 'Radiology results package';
  const { renderDiagBatchPrint } = require('./lib/diagnosticBatchPrintRoute');
  return renderDiagBatchPrint(req, res, {
   title: pageTitle(res, 'document_titles.rad_batch_print_code', 'Radiology results — {{code}}', { code }),
   batchData,
   backUrl: '/radiology/validate/' + encodeURIComponent(code),
   emptyMessage: flashT(res, 'flash.no_printable_rad_batch_code', { defaultValue: 'No completed printable results on this code yet.' }),
   noSelectionMessage: flashT(res, 'flash.no_printable_rad_selection', { defaultValue: 'None of the selected results are printable yet.' }),
   module: 'radiology',
   pickerLabels: {
    title: flashT(res, 'diag_batch_picker.title_rad_code', { ns: 'common', defaultValue: 'Select radiology results for this code' }),
    subtitle: flashT(res, 'diag_batch_picker.subtitle_code', { ns: 'common', defaultValue: 'Choose completed reports on this service code to include in the print package.' }),
    selectAll: flashT(res, 'diag_batch_picker.select_all', { ns: 'common', defaultValue: 'Select all' }),
    clearAll: flashT(res, 'diag_batch_picker.clear_all', { ns: 'common', defaultValue: 'Clear all' }),
    printSelected: flashT(res, 'diag_batch_picker.print_selected', { ns: 'common', defaultValue: 'Print selected' }),
    printAll: flashT(res, 'diag_batch_picker.print_all', { ns: 'common', defaultValue: 'Print all' }),
    cancel: flashT(res, 'actions.cancel', { ns: 'common', defaultValue: 'Cancel' }),
   },
  });
 } catch (err) {
  console.error('radiology print-all-by-code:', err.message);
  const code = String(req.params.code || '').trim();
  return res.redirect('/radiology/validate/' + encodeURIComponent(code) + '?err=' + encodeURIComponent(flashT(res, 'flash.print_batch_failed', { defaultValue: 'Could not prepare batch print.', message: err.message })));
 }
});

// 404 / 500 HANDLERS — MUST BE LAST
// If views/error.ejs is missing on the server, still return HTML (avoid double-failure).
function _escapeHtml(s) {
 return String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/"/g, '&quot;');
}
function _fallbackErrorHtml(status, title, message) {
 const st = parseInt(status, 10) || 500;
 return (
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>' +
  _escapeHtml(title || 'Error') +
  '</title>' +
  '<style>body{font-family:system-ui,sans-serif;background:#f8fafc;padding:2rem;color:#0f172a}' +
  '.box{max-width:520px;margin:3rem auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.75rem}' +
  'h1{margin:0 0 .5rem;font-size:2.5rem;color:#64748b}a{color:#2563eb}</style></head><body><div class="box">' +
  '<h1>' +
  st +
  '</h1><h2 style="margin:.5rem 0 1rem;font-size:1.1rem">' +
  _escapeHtml(title || 'Error') +
  '</h2><p>' +
  _escapeHtml(message || '') +
  '</p><p><a href="/">Go to home</a></p></div></body></html>'
 );
}
function renderAppError(res, status, key, fallback, opts = {}) {
 const code = parseInt(status, 10) || 500;
 const tFn = res.locals.t || ((k, o) => (o && o.defaultValue != null ? o.defaultValue : k));
 const message = tFn(key, { ns: 'errors', defaultValue: fallback, ...opts });
 _sendErrorView(res, code, _errorPageLocals(res, code, { message: message || fallback }));
}

function _errorPageLocals(res, status, overrides) {
 const tFn = res.locals.t || ((k, o) => (o && o.defaultValue != null ? o.defaultValue : k));
 const code = parseInt(status, 10) || 500;
 const base =
  code === 404
   ? {
      title: tFn('page.not_found_title', { ns: 'errors', defaultValue: '404 - Not Found' }),
      message: tFn('page.not_found_heading', { ns: 'errors', defaultValue: 'Page Not Found' }),
     }
   : {
      title: tFn('page.server_error_title', { ns: 'errors', defaultValue: 'Server Error' }),
      message: tFn('page.server_error_heading', { ns: 'errors', defaultValue: 'Something went wrong' }),
     };
 return Object.assign({ status: code }, base, overrides || {});
}

function _sendErrorView(res, status, locals) {
 const code = parseInt(status, 10) || 500;
 res.status(code);
 res.render('error', locals, (renderErr, html) => {
  if (renderErr) {
   console.error('[error view] views/error.ejs missing or invalid:', renderErr.message);
   return res.type('html').send(_fallbackErrorHtml(code, locals.title, locals.message));
  }
  res.send(html);
 });
}

app.use((req, res) => {
 if (apiWantsJson(req)) {
  return res.status(404).json({ ok: false, error: 'Not found' });
 }
 _sendErrorView(res, 404, _errorPageLocals(res, 404));
});

app.use((err, req, res, next) => {
 console.error(err.stack);
 if (typeof _writeCrash === 'function') {
  _writeCrash(`REQUEST-ERROR ${req.method} ${req.originalUrl}`, err);
 }
 if (apiWantsJson(req)) {
  return res.status(500).json({ ok: false, error: err.message || 'Server error' });
 }
 _sendErrorView(
  res,
  500,
  _errorPageLocals(res, 500, { message: err.message || undefined })
 );
});


// cPanel / Phusion Passenger loads this file via require() — must export `app`.
// Local dev (`node app.js`): require.main === module → call listen().
// Do NOT rely only on PASSENGER_* env vars; many cPanel hosts omit them and then
// every URL returns 500 ("application could not be started").
function bindHttpListener() {
 try {
  const http = require('http');
  const server = http.createServer(app);
  opdCallQueueLive.attachWebSocket(server);
  server.listen(port, () => {
   bootStep('listen', 'ok', `port=${port}`);
   console.log(`HMS running on port ${port}`);
   if (opdCallQueueLive.isWebSocketEnabled()) {
    console.log(`OPD call queue WebSocket: ws://localhost:${port}${opdCallQueueLive.WS_PATH}`);
   }
  }).on('error', (err) => {
   bootStep('listen', 'fail', err);
   if (err && err.code === 'EADDRINUSE') {
    try {
     console.error(
      `[listen] Port ${port} is already in use — this Node process is NOT serving HTTP. ` +
       'Stop the other server (old `node` / `nodemon` still bound to that port), or set PORT=3001 in `.env`, then start again.'
     );
    } catch (_) {
     /* ignore EPIPE when stderr is closed */
    }
   }
  });
 } catch (e) {
  bootStep('listen', 'fail', e);
 }
}

/** True when Phusion Passenger (or cPanel Node) is running this process. */
function underPassenger() {
 return (
  typeof PhusionPassenger !== 'undefined' ||
  !!process.env.PASSENGER_APP_ENV ||
  !!process.env.PASSENGER_BASE_URI ||
  !!process.env.PASSENGER_APP_ROOT ||
  !!process.env._PASSENGER_BROKER_SOCKET_URI
 );
}

// ALWAYS export — cPanel often sets startup file to app.js (require.main === module).
// The old if/else skipped module.exports when app.js was the main module → Passenger 500.
module.exports = app;
bootStep('module-export', 'ok', 'module.exports = app');

// Used by diagnostic2.js: `node app.js` with HMS_EXPORT_CHECK=1 (real cPanel startup path).
if (process.env.HMS_EXPORT_CHECK === '1') {
 const exportOk = module.exports && typeof module.exports.use === 'function';
 try {
  console.log(exportOk ? 'EXPORT_OK' : 'EXPORT_FAIL');
 } catch (_) {}
 process.exit(exportOk ? 0 : 2);
}

if (require.main === module && !underPassenger()) {
 (async () => {
  if (pool) {
   try {
    await require('./lib/ensureEmployeeHrSchema')(pool);
    await aclLayout.init(pool);
    bootStep('pre-listen-schema', 'ok');
   } catch (e) {
    bootStep('pre-listen-schema', 'warn', e);
   }
  }
  bindHttpListener();
  bootStep('listen', 'ok', 'local listen (node app.js)');
 })();
} else {
 bootStep('listen', 'skip', underPassenger() ? 'Passenger (no listen)' : 'required as module');
}

// Run startup schema migrations in the background. Each one is independently
// wrapped so a single failing migration does not skip the others, and all
// outcomes show up in /__health → boot.
(async () => {
 if (!pool) { bootStep('migrations', 'skip', 'No DB pool'); return; }
 if (pool.driver === 'postgres' || process.env.HMS_SKIP_SCHEMA_MIGRATIONS === '1') {
  bootStep('migrations', 'skip', 'PostgreSQL / HMS_SKIP_SCHEMA_MIGRATIONS — schema assumed migrated');
  try {
   const { ensureRuntimeAcl } = require('./lib/ensureRuntimeAcl');
   const aclBoot = await ensureRuntimeAcl(pool);
   bootStep(
    'ensureRuntimeAcl',
    'ok',
    aclBoot.directorRole ? `directorRole=${aclBoot.directorRole}` : 'no director role in tbl_role'
   );
   await require('./lib/ensureClinicalDeptRequisitionSchema')(pool);
   bootStep('ensureClinicalDeptRequisitionSchema', 'ok', 'postgres');
   const { ensureProcurementExtendedSchema } = require('./lib/ensureProcurementExtendedSchema');
   await ensureProcurementExtendedSchema(pool);
   bootStep('ensureProcurementExtendedSchema', 'ok', 'postgres');
   await aclLayout.init(pool);
   bootStep('aclLayout:init', 'ok', 'runtime ACL cache loaded (postgres/skip-migrations path)');
   const { ensurePostgresReceiptInvoiceSeq } = require('./lib/receiptNumber');
   await ensurePostgresReceiptInvoiceSeq(pool);
   bootStep('ensurePostgresReceiptInvoiceSeq', 'ok', 'tbl_receipt_seq / tbl_invoice_seq');
  } catch (e) {
   bootStep('migrations-postgres-acl', 'warn', e);
  }
  return;
 }
 const steps = [
  ['migratePatientInsuranceSchema', () => migratePatientInsuranceSchema(pool)],
  ['ensureOpdOrderItemsSchema',     () => ensureOpdOrderItemsSchema(pool)],
  ['ensureServiceCatalogSchema',    () => ensureServiceCatalogSchema(pool)],
  ['ensureHrPayrollSchema',         async () => {
   const fn = require('./lib/ensureHrPayrollSchema');
   await fn(pool);
  }],
  ['ensureIntegrationSchema',       async () => {
   await require('./lib/ensureIntegrationSchema').ensureIntegrationSchema(pool);
  }],
  ['ensureFacilityIntegrationSchema', async () => {
   await require('./lib/ensureFacilityIntegrationSchema')(pool);
  }],
  ['ensureDirectorPLManualSchema',  async () => {
   await require('./lib/ensureDirectorPLManualSchema')(pool);
  }],
  ['ensureEmployeeHrSchema',        async () => {
   await require('./lib/ensureEmployeeHrSchema')(pool);
   await require('./lib/ensureEmployeeHrSchema').syncEmployeeHrSchemaData(pool);
  }],
  ['ensureAclSchema',               async () => {
   const fn = require('./lib/ensureAclSchema');
   await fn(pool);
  }],
  ['aclLayout:init',                async () => {
   await aclLayout.init(pool);
  }],
  ['ensureVisitingDoctorSchema',    async () => {
   await require('./lib/ensureVisitingDoctorSchema')(pool);
   await require('./lib/visitingDoctor').resetExpiredAccounts(pool);
  }],
  ['ensureEmployeeClinicalLinksSchema', async () => {
   const { ensureEmployeeClinicalLinksSchema, migrateLegacyEmployeeClinicalLinks } = require('./lib/hmsEmployeeClinicalLinks');
   await ensureEmployeeClinicalLinksSchema(pool);
   await migrateLegacyEmployeeClinicalLinks(pool);
  }],
  ['ensureDeploymentSchema',        async () => {
   const { ensureDeploymentSchema } = require('./lib/ensureDeploymentSchema');
   await ensureDeploymentSchema(pool);
  }],
  ['ensureNavAccessSchema',         async () => {
   const { ensureNavAccessSchema } = require('./lib/ensureNavAccessSchema');
   await ensureNavAccessSchema(pool);
  }],
  ['ensurePortalSchema',            async () => {
   const { ensurePortalSchema } = require('./lib/ensurePortalSchema');
   await ensurePortalSchema(pool);
  }],
  ['ensureEmergencySchema',         async () => {
   const fn = require('./lib/ensureEmergencySchema');
   await fn(pool);
  }],
  ['ensureIpdMedSchema',            async () => {
   const fn = require('./lib/ensureIpdMedSchema');
   await fn(pool);
  }],
  ['ensureOpdMedSchema',            async () => {
   const fn = require('./lib/ensureOpdMedSchema');
   await fn(pool);
  }],
  ['ensureIpdHospitalizationSchema', async () => {
   const fn = require('./lib/ensureIpdHospitalizationSchema');
   await fn(pool);
  }],
  ['ensureDeathRegistrySchema', async () => {
   const fn = require('./lib/ensureDeathRegistrySchema');
   await fn(pool);
  }],
  ['ensureLabLimsSchema', async () => {
   const fn = require('./lib/ensureLabLimsSchema');
   await fn(pool);
  }],
  ['ensureDiagTemplateRefSchema', async () => {
   const fn = require('./lib/ensureDiagTemplateRefSchema');
   await fn(pool);
  }],
  ['ensureHmsExtendedSchema', async () => {
   const fn = require('./lib/ensureHmsExtendedSchema');
   await fn(pool);
  }],
  ['ensurePatientAgeColumns', async () => {
   await ensurePatientAgeColumns(pool);
  }],
  ['ensurePatientCodeSchema', async () => {
   const fn = require('./lib/ensurePatientCodeSchema');
   await fn(pool);
  }],
  ['ensurePatientIdentitySchema', async () => {
   const { ensurePatientIdentitySchema } = require('./lib/ensurePatientIdentitySchema');
   await ensurePatientIdentitySchema(pool);
  }],
  ['ensureConsultationRoomsSchema', async () => {
   const fn = require('./lib/ensureConsultationRoomsSchema');
   await fn(pool);
  }],
  ['ensureNursingSupplyRequestSchema', async () => {
   const fn = require('./lib/ensureNursingSupplyRequestSchema');
   await fn(pool);
  }],
  ['ensureInventorySchema', async () => {
   const fn = require('./lib/ensureInventorySchema');
   await fn(pool);
  }],
  ['ensureProcurementExtendedSchema', async () => {
   const { ensureProcurementExtendedSchema } = require('./lib/ensureProcurementExtendedSchema');
   await ensureProcurementExtendedSchema(pool);
  }],
  ['ensureClinicalDeptRequisitionSchema', async () => {
   const fn = require('./lib/ensureClinicalDeptRequisitionSchema');
   await fn(pool);
  }],
  ['ensureAssetManagementSchema', async () => {
   try {
    await require('./lib/ensureAssetManagementSchema')(pool);
   } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') return;
    throw e;
   }
  }],
  ['ensureFinAccountSchema', async () => {
   try {
    await require('./lib/ensureFinAccountSchema')(pool);
   } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') return;
    throw e;
   }
  }],
  ['ensureMaternitySchema', async () => {
   const fn = require('./lib/ensureMaternitySchema');
   await fn(pool);
  }],
  ['ensureVaccinationSchema', async () => {
   const fn = require('./lib/ensureVaccinationSchema');
   await fn(pool);
  }],
  ['ensureRadiologySchema', async () => {
   const fn = require('./lib/ensureRadiologySchema');
   await fn(pool);
  }],
  ['ensureOnlineBookingSchema', async () => {
   const fn = require('./lib/ensureOnlineBookingSchema');
   await fn(pool);
  }],
  ['ensureLicenseSchema', async () => {
   const { ensureLicenseSchema } = require('./lib/ensureLicenseSchema');
   await ensureLicenseSchema(pool);
  }],
  ['hmsLicense:refreshCache', async () => {
   const hmsLicense = require('./lib/hmsLicense');
   await hmsLicense.refreshLicenseCache(pool);
  }],
  ['hmsLicense:remoteSync', async () => {
   const { startLicenseServerSync } = require('./lib/hmsLicenseRemote');
   startLicenseServerSync(pool);
  }]
 ];
 for (const [label, run] of steps) {
  try { await run(); bootStep(`migrate:${label}`, 'ok'); }
  catch (e) { bootStep(`migrate:${label}`, 'fail', e); }
 }
})();
