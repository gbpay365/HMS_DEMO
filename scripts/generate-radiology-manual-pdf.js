'use strict';

/**
 * Write RADIOLOGY-USERS-MANUAL.html and .pdf to docs/
 * Usage: node scripts/generate-radiology-manual-pdf.js
 */

const fs = require('fs');
const path = require('path');
const { buildRadiologyUsersManualHtml } = require('../lib/hmsRadiologyUserManual');
const { htmlToPdfBuffer } = require('../lib/passportPdf');

const docsDir = path.join(__dirname, '..', 'docs');
const htmlPath = path.join(docsDir, 'RADIOLOGY-USERS-MANUAL.html');
const pdfPath = path.join(docsDir, 'RADIOLOGY-USERS-MANUAL.pdf');

const html = buildRadiologyUsersManualHtml();
let outHtml = html;
const photoPath = path.join(__dirname, '..', 'public', 'call-queue', 'photos', 'imaging.jpg');
if (fs.existsSync(photoPath)) {
  const b64 = fs.readFileSync(photoPath).toString('base64');
  outHtml = outHtml.replace(
    'src="public/call-queue/photos/imaging.jpg"',
    `src="data:image/jpeg;base64,${b64}"`
  );
}
fs.writeFileSync(htmlPath, outHtml, 'utf8');
console.log(`Wrote ${htmlPath}`);

console.log('Generating PDF with headless browser...');
const buf = htmlToPdfBuffer(outHtml);
fs.writeFileSync(pdfPath, buf);
console.log(`Wrote ${pdfPath} (${Math.round(buf.length / 1024)} KB)`);
