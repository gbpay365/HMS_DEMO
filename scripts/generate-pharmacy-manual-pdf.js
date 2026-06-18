'use strict';

/**
 * Write PHARMACY-USERS-MANUAL.html and .pdf to docs/
 * Usage: node scripts/generate-pharmacy-manual-pdf.js
 */

const fs = require('fs');
const path = require('path');
const { buildPharmacyUsersManualHtml } = require('../lib/hmsPharmacyUserManual');
const { htmlToPdfBuffer } = require('../lib/passportPdf');

const docsDir = path.join(__dirname, '..', 'docs');
const htmlPath = path.join(docsDir, 'PHARMACY-USERS-MANUAL.html');
const pdfPath = path.join(docsDir, 'PHARMACY-USERS-MANUAL.pdf');

const html = buildPharmacyUsersManualHtml();
let outHtml = html;
const photoPath = path.join(__dirname, '..', 'public', 'call-queue', 'photos', 'pharmacy.jpg');
if (fs.existsSync(photoPath)) {
  const b64 = fs.readFileSync(photoPath).toString('base64');
  outHtml = outHtml.replace(
    'src="public/call-queue/photos/pharmacy.jpg"',
    `src="data:image/jpeg;base64,${b64}"`
  );
}
fs.writeFileSync(htmlPath, outHtml, 'utf8');
console.log(`Wrote ${htmlPath}`);

console.log('Generating PDF with headless browser...');
const buf = htmlToPdfBuffer(outHtml);
fs.writeFileSync(pdfPath, buf);
console.log(`Wrote ${pdfPath} (${Math.round(buf.length / 1024)} KB)`);
