'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { findBrowser } = require('./passportPdf');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'docs', 'guide-screenshots');

const CAPTURE_PLAN = [
  { login: 'Lariza', password: '12345', shots: [
    { file: 'cashier-portal.png', path: '/portal/cashier' },
    { file: 'cashier-hub.png', path: '/cashier' },
  ]},
  { login: 'Awelsa', password: '12345', shots: [
    { file: 'doctor-portal.png', path: '/portal/doctor' },
    { file: 'doctor-opd-queue.png', path: '/opd-queue' },
  ]},
  { login: 'Ghong', password: '12345', shots: [
    { file: 'nurse-portal.png', path: '/portal/nurse' },
    { file: 'nurse-triage.png', path: '/opd-queue' },
  ]},
  { login: 'Tef', password: '12345', shots: [
    { file: 'rad-portal.png', path: '/portal/radiology' },
    { file: 'rad-worklist.png', path: '/radiology' },
  ]},
  { login: 'Sedrick', password: '12345', shots: [
    { file: 'lab-portal.png', path: '/portal/lab' },
    { file: 'lab-validate.png', path: '/laboratory' },
    { file: 'lab-lims.png', path: '/lims' },
  ]},
  { login: 'Berinyuy', password: '12345', shots: [
    { file: 'pharm-portal.png', path: '/portal/pharmacy' },
    { file: 'pharm-dispense.png', path: '/pharmacy' },
  ]},
  { login: null, password: null, shots: [
    { file: 'login.png', path: '/', public: true },
  ]},
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loginCookie(base, username, password) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  const raw = res.headers.get('set-cookie') || '';
  const m = raw.match(/connect\.sid=([^;]+)/);
  if (!m) throw new Error(`Login failed for ${username} (HTTP ${res.status})`);
  return decodeURIComponent(m[1]);
}

let cdpSeq = 0;
function cdpCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++cdpSeq;
    const onMsg = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id !== id) return;
      ws.off('message', onMsg);
      if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
      else resolve(msg.result);
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function capturePage(browserPath, url, cookieValue, outFile) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const proc = spawn(
    browserPath,
    [
      `--headless=new`,
      `--remote-debugging-port=${port}`,
      '--disable-gpu',
      '--no-first-run',
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true }
  );

  try {
    await sleep(1200);
    const ver = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    const ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.once('open', res);
      ws.once('error', rej);
    });

    const { targetId } = await cdpCommand(ws, 'Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdpCommand(ws, 'Target.attachToTarget', { targetId, flatten: true });

    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++cdpSeq;
        const onMsg = (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.id !== id) return;
          ws.off('message', onMsg);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        };
        ws.on('message', onMsg);
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });

    if (cookieValue) {
      const u = new URL(url);
      await send('Network.enable');
      await send('Network.setCookie', {
        name: 'connect.sid',
        value: cookieValue,
        url: `${u.protocol}//${u.host}`,
        path: '/',
      });
    }

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Page.navigate', { url });
    await sleep(3500);
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
    ws.close();
  } finally {
    proc.kill('SIGTERM');
    await sleep(300);
  }
}

/**
 * Capture live HMS screenshots when server is reachable.
 * @returns {{ ok: number, skipped: boolean, errors: string[] }}
 */
async function captureRoleGuideScreenshots(opts = {}) {
  const base = String(opts.base || process.env.HMS_GUIDE_BASE || 'http://127.0.0.1:3004').replace(/\/$/, '');
  const browser = findBrowser();
  if (!browser) {
    return { ok: 0, skipped: true, errors: ['No Chrome/Edge found for screenshots'] };
  }

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const errors = [];
  let ok = 0;

  try {
    const health = await fetch(`${base}/`, { signal: AbortSignal.timeout(8000) });
    if (!health.ok && health.status !== 302) {
      return { ok: 0, skipped: true, errors: [`HMS not reachable at ${base}`] };
    }
  } catch (e) {
    return { ok: 0, skipped: true, errors: [`HMS not reachable: ${e.message}`] };
  }

  for (const plan of CAPTURE_PLAN) {
    let cookie = null;
    if (plan.login) {
      try {
        cookie = await loginCookie(base, plan.login, plan.password);
      } catch (e) {
        errors.push(`${plan.login}: ${e.message}`);
        continue;
      }
    }
    for (const shot of plan.shots) {
      const outFile = path.join(SCREENSHOT_DIR, shot.file);
      try {
        await capturePage(browser, `${base}${shot.path}`, shot.public ? null : cookie, outFile);
        console.log(`  Captured ${shot.file}`);
        ok += 1;
      } catch (e) {
        errors.push(`${shot.file}: ${e.message}`);
      }
    }
  }

  return { ok, skipped: false, errors };
}

function loadScreenshotDataUrl(filename) {
  const p = path.join(SCREENSHOT_DIR, filename);
  if (!fs.existsSync(p)) return null;
  const b64 = fs.readFileSync(p).toString('base64');
  return `data:image/png;base64,${b64}`;
}

function screenshotFigure(filename, caption, mockupHtml) {
  const dataUrl = loadScreenshotDataUrl(filename);
  if (dataUrl) {
    return `
<figure class="guide-screen guide-screen-live">
  <figcaption class="guide-screen-cap">📸 ${caption} <span class="live-badge">Live capture</span></figcaption>
  <img class="guide-screenshot" src="${dataUrl}" alt="${caption}" />
</figure>`;
  }
  return mockupHtml || '';
}

module.exports = {
  SCREENSHOT_DIR,
  captureRoleGuideScreenshots,
  loadScreenshotDataUrl,
  screenshotFigure,
};
