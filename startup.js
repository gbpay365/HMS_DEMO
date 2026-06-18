'use strict';
/**
 * Minimal cPanel / Passenger startup (use when app.js or passenger-entry.js fail to boot).
 *
 * cPanel -> Setup Node.js App -> Application startup file: startup.js
 *
 * Writes tmp/passenger-start.log on every boot so you can see failures in File Manager.
 */
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const LOG = path.join(ROOT, 'tmp', 'passenger-start.log');

function log(line) {
 try {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${line}\n`);
 } catch (_) {}
}

function loadDotenv() {
 try {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  if (!process.env.DB_NAME) {
   require('dotenv').config({ path: path.join(ROOT, '.env.production') });
  }
 } catch (e) {
  log('dotenv warn: ' + (e.message || e));
 }
}

function fallbackApp(err) {
 const express = require('express');
 const app = express();
 const msg = err && err.message ? err.message : String(err);
 const safe = String(msg).replace(/</g, '&lt;');

 app.get('/cpanel-health', (req, res) => {
  res.status(200).type('text/html; charset=UTF-8').send('OK');
 });

 app.get('/__alive', (req, res) => {
  res.status(200).json({ alive: true, mode: 'startup-fallback', error: msg });
 });

 app.get('/', (req, res) => {
  res.status(200).type('text/html; charset=UTF-8').send(
   '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>HMS boot</title></head><body>' +
   '<h1>HMS — startup fallback</h1><p>Passenger is running <code>startup.js</code> but <code>app.js</code> did not load.</p>' +
   '<pre>' + safe + '</pre><p>See <code>tmp/passenger-start.log</code> and <code>tmp/crash.log</code>.</p></body></html>'
  );
 });

 app.use((req, res) => {
  res.status(503).type('text/html').send('HMS unavailable — see tmp/passenger-start.log');
 });

 return app;
}

let app;

try {
 log('startup.js begin node=' + process.version + ' cwd=' + process.cwd());
 loadDotenv();
 log('DB_NAME=' + (process.env.DB_NAME || '(missing)'));

 const real = require('./app');
 if (!real || typeof real.use !== 'function') {
  throw new Error('app.js did not export an Express app (module.exports missing?)');
 }
 app = real;
 log('app.js loaded OK');
} catch (e) {
 log('BOOT FAIL: ' + (e && e.stack ? e.stack : e));
 try {
  app = fallbackApp(e);
  log('serving fallback Express (cpanel-health will return OK)');
 } catch (e2) {
  log('FATAL cannot load express: ' + (e2 && e2.stack ? e2.stack : e2));
  throw e2;
 }
}

module.exports = app;
log('module.exports set');
