'use strict';

/**
 * Generate COMPREHENSIVE-DEPLOYMENT-PLAN.pdf from HTML + ops-doc-styles.css
 * Usage: node scripts/generate-deployment-plan-pdf.js
 */

const fs = require('fs');
const path = require('path');
const { htmlToPdfBuffer } = require('../lib/passportPdf');

const docsDir = path.join(__dirname, '..', 'docs');
const htmlPath = path.join(docsDir, 'COMPREHENSIVE-DEPLOYMENT-PLAN.html');
const cssPath = path.join(docsDir, 'ops-doc-styles.css');
const pdfPath = path.join(docsDir, 'COMPREHENSIVE-DEPLOYMENT-PLAN.pdf');

let html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

// Inline CSS so headless browser renders correctly from temp file
html = html.replace(
  /<link rel="stylesheet" href="ops-doc-styles.css"\s*\/>/,
  `<style>${css}</style>`
);

console.log('Generating PDF with headless browser...');
const buf = htmlToPdfBuffer(html);
fs.writeFileSync(pdfPath, buf);
const kb = Math.round(buf.length / 1024);
console.log(`Wrote ${pdfPath} (${kb} KB)`);
