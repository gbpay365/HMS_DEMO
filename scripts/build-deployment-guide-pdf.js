'use strict';

/**
 * Renders docs/LOCAL-DEPLOYMENT-IMPLEMENTATION.html to PDF.
 * Usage: node scripts/build-deployment-guide-pdf.js
 *
 * Prefers Microsoft Edge / Chrome headless (no extra npm download).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'docs', 'LOCAL-DEPLOYMENT-IMPLEMENTATION.html');
const pdfPath = path.join(root, 'docs', 'LOCAL-DEPLOYMENT-IMPLEMENTATION.pdf');

if (!fs.existsSync(htmlPath)) {
  console.error('Missing HTML guide:', htmlPath);
  process.exit(1);
}

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function printWithBrowser(browserPath) {
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--print-to-pdf=${pdfPath}`,
    fileUrl,
  ];

  const result = spawnSync(browserPath, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status !== 0 || !fs.existsSync(pdfPath)) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(err || `Browser exited with code ${result.status}`);
  }
}

function printWithPuppeteer() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    throw new Error('puppeteer is not installed. Install Edge/Chrome or run: npm install --no-save puppeteer');
  }

  return puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] }).then(async (browser) => {
    const page = await browser.newPage();
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '11mm', right: '12mm', bottom: '13mm', left: '12mm' },
    });
    await browser.close();
  });
}

(async () => {
  const browser = findBrowser();
  if (browser) {
    console.log('Generating PDF with:', browser);
    printWithBrowser(browser);
  } else {
    console.log('No Edge/Chrome found — trying puppeteer...');
    await printWithPuppeteer();
  }

  const stat = fs.statSync(pdfPath);
  console.log('PDF written:', pdfPath);
  console.log('Size:', Math.round(stat.size / 1024) + ' KB');
})().catch((err) => {
  console.error('PDF generation failed:', err.message);
  console.error('');
  console.error('Manual fallback: open in browser and Print → Save as PDF:');
  console.error(' ', htmlPath);
  process.exit(1);
});
