#!/usr/bin/env node
'use strict';
/**
 * Authenticated smoke test — probes high-traffic HMS routes for 404/500.
 * Usage:
 *   node scripts/smoke-routes.js
 *   HMS_SMOKE_BASE=http://127.0.0.1:3003 HMS_SMOKE_USER=admin HMS_SMOKE_PASS=secret node scripts/smoke-routes.js
 *
 * If HMS_SMOKE_USER/PASS are omitted, bootstraps a DB session for role 99/1 (or first active user).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');

const BASE = String(process.env.HMS_SMOKE_BASE || 'http://127.0.0.1:3003').replace(/\/$/, '');
const TIMEOUT_MS = parseInt(process.env.HMS_SMOKE_TIMEOUT_MS, 10) || 15000;

const PAGE_ROUTES = [
  '/dashboard',
  '/hms',
  '/hms/reports',
  '/hms-reports',
  '/patients',
  '/appointments',
  '/opd-queue',
  '/consultation-new',
  '/emergency',
  '/emergency/kpi',
  '/ipd',
  '/ipd/hospitalizations',
  '/ipd/census',
  '/ipd/ward-rounds',
  '/ipd/inbox',
  '/wards',
  '/maternity',
  '/maternity/patients',
  '/vaccination',
  '/vaccination/patients',
  '/lims',
  '/laboratory',
  '/radiology',
  '/pharmacy',
  '/pharmacy/reporting',
  '/pharmacy/reporting/expiry',
  '/prescriptions',
  '/cashier',
  '/billing',
  '/inventory',
  '/catalog',
  '/procurement',
  '/payroll',
  '/payroll/monthly',
  '/tax',
  '/tax/statutory-reports',
  '/tax/cnps',
  '/tax/dgi',
  '/tax/compliance',
  '/financials',
  '/financials/journal',
  '/financials/trial-balance',
  '/financials/general-ledger',
  '/management-reports',
  '/death-registry',
  '/access-control',
  '/users',
  '/employees',
  '/workflow-guides',
  '/user-manual',
  '/patient-insurance',
  '/facilities',
  '/wallet-management',
  '/insurance',
  '/assets',
  '/nurse-roster',
  '/doctor-roster',
  '/front-desk',
  '/portal/call-queue',
  '/portal/call-queue/enter',
  '/admin/consultation-rooms',
  '/admin/visiting-doctors',
  '/hms-admin/access',
  '/super-admin',
  '/credit-receivables',
  '/payment-validity',
  '/docs/user-guide',
  '/docs/comprehensive-user-guide',
];

const API_ROUTES = [
  '/__health',
  '/cpanel-health',
  '/portal/api/daily/today/all',
  '/portal/api/hub-stats',
  '/api/service-catalog',
  '/management-reports/api/live?tab=daily',
];

function parseSetCookie(setCookie) {
  if (!setCookie) return '';
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

async function resolveCredentials(pool) {
  const user = String(process.env.HMS_SMOKE_USER || '').trim();
  const pass = String(process.env.HMS_SMOKE_PASS || '').trim();
  if (user && pass) return { username: user, password: pass, source: 'env', mode: 'login' };

  const [rows] = await pool.query(
    `SELECT id, username, password, role, first_name, last_name, photo_path, specialisation, profile_emoji, gender
     FROM tbl_employee
     WHERE status = 1 AND role IN ('99', '1')
     ORDER BY FIELD(role, '99', '1'), id ASC
     LIMIT 1`
  );
  if (rows.length) {
    return { ...rows[0], source: `bootstrap:${rows[0].username}`, mode: 'bootstrap' };
  }

  const [any] = await pool.query(
    `SELECT id, username, password, role, first_name, last_name, photo_path, specialisation, profile_emoji, gender
     FROM tbl_employee WHERE status = 1 ORDER BY id ASC LIMIT 1`
  );
  if (!any.length) throw new Error('No active users in tbl_employee.');
  return { ...any[0], source: `bootstrap:${any[0].username}`, mode: 'bootstrap' };
}

async function bootstrapSessionCookie(pool, user) {
  const signature = require('cookie-signature');
  const uid = require('uid-safe');
  const sessionId = await uid(24);
  const maxAge = 24 * 60 * 60 * 1000;
  const expiresDate = new Date(Date.now() + maxAge);
  const expiresSec = Math.floor(expiresDate.getTime() / 1000);
  const payload = {
    cookie: {
      originalMaxAge: maxAge,
      expires: expiresDate.toISOString(),
      httpOnly: true,
      path: '/',
    },
    user: {
      id: user.id,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      username: user.username,
      role: user.role,
      photo: user.photo_path || null,
      specialisation: user.specialisation || null,
      profile_emoji: user.profile_emoji || null,
      gender: user.gender || null,
    },
    userId: user.id,
    lastActivity: Date.now(),
  };
  await pool.query('INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?)', [
    sessionId,
    expiresSec,
    JSON.stringify(payload),
  ]);
  const secret = process.env.SESSION_SECRET || 'hms-secret';
  return `connect.sid=s:${signature.sign(sessionId, secret)}`;
}

async function establishSession(pool, credentials) {
  if (credentials.mode === 'bootstrap') {
    return bootstrapSessionCookie(pool, credentials);
  }

  const body = new URLSearchParams({ username: credentials.username, password: credentials.password });
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const cookie = parseSetCookie(res.headers.get('set-cookie'));
  if (!cookie && res.status !== 302) {
    throw new Error(`Login failed (HTTP ${res.status}). Check HMS_SMOKE_USER / HMS_SMOKE_PASS.`);
  }
  return cookie;
}

async function probe(path, cookie, asJson) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: {
        Cookie: cookie,
        Accept: asJson ? 'application/json' : 'text/html',
        ...(asJson ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const status = res.status;
    let snippet = '';
    if (status >= 400) {
      const text = await res.text();
      snippet = text.replace(/\s+/g, ' ').slice(0, 120);
    } else {
      await res.arrayBuffer();
    }
    return { path, status, snippet };
  } catch (e) {
    return { path, status: 0, snippet: e.message || 'request failed' };
  }
}

function bucket(results) {
  const ok = [];
  const redirect = [];
  const notFound = [];
  const serverErr = [];
  const other = [];
  for (const r of results) {
    if (r.status >= 200 && r.status < 300) ok.push(r);
    else if (r.status >= 300 && r.status < 400) redirect.push(r);
    else if (r.status === 404) notFound.push(r);
    else if (r.status >= 500) serverErr.push(r);
    else other.push(r);
  }
  return { ok, redirect, notFound, serverErr, other };
}

async function main() {
  console.log(`HMS smoke test → ${BASE}\n`);

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
    waitForConnections: true,
    connectionLimit: 2,
  });

  let cookie = '';
  try {
    const creds = await resolveCredentials(pool);
    console.log(`Auth as ${creds.username} (${creds.source}, ${creds.mode})`);
    cookie = await establishSession(pool, creds);
    console.log('Session established.\n');
  } finally {
    await pool.end();
  }

  const results = [];
  for (const path of PAGE_ROUTES) {
    const r = await probe(path, cookie, false);
    results.push(r);
    const mark = r.status === 404 ? '404' : r.status >= 500 ? '500' : r.status === 0 ? 'ERR' : String(r.status);
    if (r.status === 404 || r.status >= 500 || r.status === 0) {
      console.log(`  [${mark}] ${path}`);
    }
  }
  for (const path of API_ROUTES) {
    const r = await probe(path, cookie, true);
    results.push(r);
    const mark = r.status === 404 ? '404' : r.status >= 500 ? '500' : r.status === 0 ? 'ERR' : String(r.status);
    if (r.status === 404 || r.status >= 500 || r.status === 0) {
      console.log(`  [${mark}] ${path}`);
    }
  }

  const b = bucket(results);
  console.log('\n=== SUMMARY ===');
  console.log(`Probed: ${results.length}`);
  console.log(`2xx: ${b.ok.length}  3xx: ${b.redirect.length}  404: ${b.notFound.length}  5xx: ${b.serverErr.length}  other: ${b.other.length}`);

  if (b.notFound.length) {
    console.log('\n--- 404 NOT FOUND ---');
    b.notFound.forEach((r) => console.log(`  ${r.path}`));
  }
  if (b.serverErr.length) {
    console.log('\n--- 500 SERVER ERROR ---');
    b.serverErr.forEach((r) => console.log(`  ${r.path} — ${r.snippet}`));
  }
  if (b.other.length) {
    console.log('\n--- OTHER (403/401/400…) ---');
    b.other.forEach((r) => console.log(`  [${r.status}] ${r.path}${r.snippet ? ` — ${r.snippet}` : ''}`));
  }

  process.exit(b.notFound.length + b.serverErr.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
