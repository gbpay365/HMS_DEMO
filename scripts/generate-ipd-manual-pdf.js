'use strict';

/**
 * Write IPD-USERS-MANUAL.html and .pdf to docs/
 * Usage: node scripts/generate-ipd-manual-pdf.js
 */

const fs = require('fs');
const path = require('path');
const { buildIpdUsersManualHtml } = require('../lib/hmsIpdUserManual');
const { htmlToPdfBuffer } = require('../lib/passportPdf');

const docsDir = path.join(__dirname, '..', 'docs');
const htmlPath = path.join(docsDir, 'IPD-USERS-MANUAL.html');
const pdfPath = path.join(docsDir, 'IPD-USERS-MANUAL.pdf');

const html = buildIpdUsersManualHtml();
let outHtml = html;
const photoPath = path.join(__dirname, '..', 'public', 'call-queue', 'photos', 'ipd.jpg');
if (fs.existsSync(photoPath)) {
  const b64 = fs.readFileSync(photoPath).toString('base64');
  outHtml = outHtml.replace(
    'src="public/call-queue/photos/ipd.jpg"',
    `src="data:image/jpeg;base64,${b64}"`
  );
}
fs.writeFileSync(htmlPath, outHtml, 'utf8');
console.log(`Wrote ${htmlPath}`);

console.log('Generating PDF with headless browser...');
const buf = htmlToPdfBuffer(outHtml);
fs.writeFileSync(pdfPath, buf);
console.log(`Wrote ${pdfPath} (${Math.round(buf.length / 1024)} KB)`);
