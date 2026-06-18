'use strict';

/**
 * Write LAB-USERS-MANUAL.html and .pdf to docs/
 * Usage: node scripts/generate-lab-manual-pdf.js
 */

const fs = require('fs');
const path = require('path');
const { buildLabUsersManualHtml } = require('../lib/hmsLabUserManual');
const { htmlToPdfBuffer } = require('../lib/passportPdf');

const docsDir = path.join(__dirname, '..', 'docs');
const htmlPath = path.join(docsDir, 'LAB-USERS-MANUAL.html');
const pdfPath = path.join(docsDir, 'LAB-USERS-MANUAL.pdf');

const html = buildLabUsersManualHtml();
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
