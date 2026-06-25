'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function loginCookie(base, username, password) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual',
  });
  console.log('login status', res.status);
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie().join(';') : (res.headers.get('set-cookie') || '');
  const m = raw.match(/connect\.sid=([^;]+)/);
  if (!m) throw new Error(`Login failed HTTP ${res.status}`);
  return `connect.sid=${decodeURIComponent(m[1])}`;
}

(async () => {
  const base = 'http://127.0.0.1:3004';
  const cookie = await loginCookie(base, 'Awelsa', '12345');
  const res = await fetch(`${base}/ipd/hospitalizations`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
  });
  const text = await res.text();
  console.log('status', res.status);
  if (text.includes('function if(') || text.includes('does not exist')) {
    console.log('ERROR PAGE DETECTED');
    const m = text.match(/Oops![^<]*/);
    console.log(m ? m[0] : text.slice(0, 500));
  } else if (text.includes('Hospitalizations')) {
    console.log('OK — Hospitalizations page loaded');
  } else {
    console.log(text.slice(0, 300));
  }
})().catch((e) => console.error(e));
