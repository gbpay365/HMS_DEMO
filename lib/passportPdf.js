'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Render HTML to PDF using headless Chrome/Edge (print-to-pdf).
 */
function htmlToPdfBuffer(html) {
  const browser = findBrowser();
  if (!browser) {
    throw new Error('PDF engine unavailable. Install Chrome or Edge, or use Print → Save as PDF from the passport page.');
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-passport-'));
  const htmlPath = path.join(tmpDir, 'passport.html');
  const pdfPath = path.join(tmpDir, 'passport.pdf');
  fs.writeFileSync(htmlPath, html, 'utf8');
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=2500',
    `--print-to-pdf=${pdfPath}`,
    fileUrl,
  ];
  const result = spawnSync(browser, args, { stdio: 'pipe', encoding: 'utf8', windowsHide: true });
  try {
    if (result.status !== 0 || !fs.existsSync(pdfPath)) {
      throw new Error((result.stderr || result.stdout || 'Browser PDF failed').trim().slice(0, 300));
    }
    return fs.readFileSync(pdfPath);
  } finally {
    try {
      fs.unlinkSync(htmlPath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(pdfPath);
    } catch {
      /* ignore */
    }
    try {
      fs.rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

module.exports = { htmlToPdfBuffer, findBrowser };
