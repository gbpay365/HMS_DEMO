'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { findBrowser } = require('./passportPdf');

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
    signal: AbortSignal.timeout(25000),
  });
  const raw = res.headers.get('set-cookie') || '';
  const m = raw.match(/connect\.sid=([^;]+)/);
  if (!m) throw new Error(`Login failed for ${username} (HTTP ${res.status})`);
  return decodeURIComponent(m[1]);
}

class FullPageCapturer {
  constructor(baseUrl, browserPath) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.browserPath = browserPath;
    this.proc = null;
    this.ws = null;
    this.sessionId = null;
    this.cdpSeq = 0;
    this.currentUser = null;
  }

  async start() {
    const port = 9600 + Math.floor(Math.random() * 400);
    this.port = port;
    this.proc = spawn(
      this.browserPath,
      [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank',
      ],
      { stdio: 'ignore', windowsHide: true }
    );
    await sleep(1500);
    const ver = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    this.ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      this.ws.once('open', res);
      this.ws.once('error', rej);
    });
    const { targetId } = await this._cmd('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this._cmd('Target.attachToTarget', { targetId, flatten: true });
    this.sessionId = sessionId;
    await this._send('Network.enable');
    await this._send('Page.enable');
  }

  async stop() {
    try {
      if (this.ws) this.ws.close();
    } catch (_) {
      /* ignore */
    }
    if (this.proc) this.proc.kill('SIGTERM');
    await sleep(200);
  }

  _cmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.cdpSeq;
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id !== id) return;
        this.ws.off('message', onMsg);
        if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
        else resolve(msg.result);
      };
      this.ws.on('message', onMsg);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  _send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.cdpSeq;
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id !== id) return;
        this.ws.off('message', onMsg);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      };
      this.ws.on('message', onMsg);
      this.ws.send(JSON.stringify({ id, method, params, sessionId: this.sessionId }));
    });
  }

  async clearSession() {
    try {
      await this._send('Network.clearBrowserCookies');
    } catch (_) {
      /* ignore */
    }
    this.currentUser = null;
  }

  async loginAs(username, password) {
    if (!username) {
      await this.clearSession();
      return;
    }
    if (this.currentUser === username) return;
    const cookie = await loginCookie(this.baseUrl, username, password);
    await this._send('Network.setCookie', {
      name: 'connect.sid',
      value: cookie,
      url: `${this.baseUrl}/`,
      path: '/',
    });
    this.currentUser = username;
  }

  async captureFullPage(relativePath, outFile, waitMs = 5000) {
    const url = `${this.baseUrl}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
    fs.mkdirSync(path.dirname(outFile), { recursive: true });

    await this._send('Emulation.setDeviceMetricsOverride', {
      width: 1366,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await this._send('Page.navigate', { url });
    await sleep(waitMs);

    const metrics = await this._send('Page.getLayoutMetrics');
    const content = metrics.cssContentSize || metrics.contentSize || { width: 1366, height: 900 };
    const width = Math.min(Math.max(Math.ceil(content.width), 1024), 1600);
    const height = Math.min(Math.max(Math.ceil(content.height), 600), 16000);

    await this._send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
    });
    await sleep(400);

    const shot = await this._send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true,
    });
    fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
    return { url, width, height, bytes: Buffer.from(shot.data, 'base64').length };
  }
}

async function captureWorkflowSteps(steps, opts = {}) {
  const base = String(opts.base || process.env.HMS_GUIDE_BASE || 'http://127.0.0.1:3004').replace(/\/$/, '');
  const outDir = opts.outDir;
  const browser = findBrowser();
  if (!browser) throw new Error('Chrome/Edge required for full-page capture');

  try {
    await fetch(`${base}/`, { signal: AbortSignal.timeout(10000) });
  } catch (e) {
    throw new Error(`HMS not reachable at ${base}: ${e.message}`);
  }

  const capturer = new FullPageCapturer(base, browser);
  const results = [];
  const errors = [];

  try {
    await capturer.start();
    for (const step of steps) {
      const file = path.join(outDir, step.file);
      try {
        if (!step.login) {
          await capturer.clearSession();
        } else {
          await capturer.loginAs(step.login, step.password || '12345');
        }
        const meta = await capturer.captureFullPage(step.path, file, step.waitMs || 5500);
        if (step.phase === 'logout') {
          await capturer.clearSession();
        }
        console.log(`  ✓ ${step.file} (${Math.round(meta.bytes / 1024)} KB)`);
        results.push({ ...step, ok: true, file, meta });
      } catch (e) {
        console.error(`  ✗ ${step.file}: ${e.message}`);
        errors.push({ step, error: e.message });
      }
    }
  } finally {
    await capturer.stop();
  }

  if (errors.length) {
    const msg = errors.map((e) => `${e.step.file}: ${e.error}`).join('; ');
    throw new Error(`Capture failed for ${errors.length} step(s): ${msg}`);
  }
  return results;
}

module.exports = { FullPageCapturer, captureWorkflowSteps, loginCookie };
