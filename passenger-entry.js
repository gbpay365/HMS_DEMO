'use strict';
/**
 * cPanel / Phusion Passenger startup file.
 * Setup Node.js App -> Application startup file: passenger-entry.js
 * (or use startup.js — even more defensive)
 */
const path = require('path');
const fs = require('fs');

const LOG = path.join(__dirname, 'tmp', 'passenger-start.log');

function logBoot(msg) {
 try {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, `[${new Date().toISOString()}] passenger-entry: ${msg}\n`);
  try {
   fs.appendFileSync(path.join(__dirname, 'tmp', 'crash.log'), `[${new Date().toISOString()}] passenger-entry: ${msg}\n`);
  } catch (_) {}
 } catch (_) {}
}

function loadEnvSafe() {
 try {
  return require('./lib/loadEnv').loadEnv();
 } catch (e) {
  try {
   require('dotenv').config({ path: path.join(__dirname, '.env') });
   if (!process.env.DB_NAME) {
    require('dotenv').config({ path: path.join(__dirname, '.env.production') });
   }
  } catch (_) {}
  return { loadedFrom: process.env.DB_NAME ? '.env' : null };
 }
}

function esc(s) {
 return String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/"/g, '&quot;');
}

function bootFailureApp(err) {
 const express = require('express');
 const app = express();
 const message = err && err.message ? err.message : String(err);
 const stack = err && err.stack ? err.stack.split('\n').slice(0, 12).join('\n') : '';

 const html =
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
  '<title>ZAIZENS HMS — boot error</title></head><body style="font-family:system-ui,sans-serif;padding:2rem">' +
  '<h1>ZAIZENS HMS could not start</h1>' +
  '<p><code>app.js</code> failed to load. See <code>tmp/passenger-start.log</code> and <code>tmp/crash.log</code>.</p>' +
  '<pre style="background:#f1f5f9;padding:1rem;border-radius:8px;overflow:auto">' +
  esc(message) +
  '\n' +
  esc(stack) +
  '</pre></body></html>';

 app.get('/cpanel-health', (req, res) => {
  res.status(200).type('text/html; charset=UTF-8').send('OK');
 });

 app.get('/__alive', (req, res) => {
  res.status(200).json({ alive: false, ok: false, bootError: message });
 });

 app.get('/', (req, res) => {
  res.status(200).type('text/html; charset=UTF-8').send(html);
 });

 app.use((req, res) => {
  res.status(503).type('text/html; charset=UTF-8').send('HMS unavailable — boot failed');
 });

 return app;
}

let app;

try {
 logBoot('begin node=' + process.version);
 loadEnvSafe();
 app = require('./app');
 if (!app || typeof app.use !== 'function') {
  throw new Error('app.js did not export an Express application');
 }
 logBoot('OK — app.js loaded');
} catch (e) {
 logBoot('FAIL ' + (e && e.stack ? e.stack : e));
 try {
  console.error('[passenger-entry]', e && e.stack ? e.stack : e);
 } catch (_) {}
 app = bootFailureApp(e);
}

module.exports = app;
logBoot('module.exports ready');
