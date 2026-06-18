'use strict';

/**
 * Build operations PDF guides from docs/*.html
 * Usage: node scripts/build-ops-docs-pdf.js [doc-name ...]
 *
 * Outputs:
 *   docs/LICENSE-SERVER-RAILWAY-DEPLOYMENT.pdf
 *   docs/MYSQL-REPLICATION-LOCAL-TO-RAILWAY.pdf
 *   docs/WINDOWS-LOCAL-BACKUP-DR.pdf
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const docsDir = path.join(root, 'docs');

const ALL_DOCS = [
  { html: 'LICENSE-SERVER-RAILWAY-DEPLOYMENT.html', pdf: 'LICENSE-SERVER-RAILWAY-DEPLOYMENT.pdf' },
  { html: 'MYSQL-REPLICATION-LOCAL-TO-RAILWAY.html', pdf: 'MYSQL-REPLICATION-LOCAL-TO-RAILWAY.pdf' },
  { html: 'WINDOWS-LOCAL-BACKUP-DR.html', pdf: 'WINDOWS-LOCAL-BACKUP-DR.pdf' },
];

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

function printWithBrowser(browserPath, htmlPath, pdfPath) {
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
  const result = spawnSync(browserPath, args, { stdio: 'pipe', encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || !fs.existsSync(pdfPath)) {
    throw new Error((result.stderr || result.stdout || 'Browser PDF failed').trim());
  }
}

async function printWithPuppeteer(htmlPath, pdfPath) {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '11mm', right: '12mm', bottom: '13mm', left: '12mm' },
    });
  } finally {
    await browser.close();
  }
}

async function buildOne(doc, browser) {
  const htmlPath = path.join(docsDir, doc.html);
  const pdfPath = path.join(docsDir, doc.pdf);
  if (!fs.existsSync(htmlPath)) throw new Error('Missing HTML: ' + htmlPath);
  if (browser) {
    printWithBrowser(browser, htmlPath, pdfPath);
  } else {
    await printWithPuppeteer(htmlPath, pdfPath);
  }
  const kb = Math.round(fs.statSync(pdfPath).size / 1024);
  console.log('OK', doc.pdf, `(${kb} KB)`);
}

(async () => {
  const filter = process.argv.slice(2).map((s) => s.toLowerCase());
  let docs = ALL_DOCS;
  if (filter.length) {
    docs = ALL_DOCS.filter(
      (d) => filter.some((f) => d.pdf.toLowerCase().includes(f) || d.html.toLowerCase().includes(f))
    );
  }
  if (!docs.length) {
    console.error('No matching documents. Available:', ALL_DOCS.map((d) => d.pdf).join(', '));
    process.exit(1);
  }

  const browser = findBrowser();
  console.log(browser ? 'PDF engine: ' + browser : 'PDF engine: puppeteer');
  for (const doc of docs) {
    await buildOne(doc, browser);
  }
  console.log('Done — PDFs in docs/');
})().catch((err) => {
  console.error('PDF generation failed:', err.message);
  process.exit(1);
});
