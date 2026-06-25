'use strict';

/**
 * Write ZAIZENS-ROLE-PROFILES-USER-GUIDE.html and .pdf to docs/
 * Usage: node scripts/generate-role-profiles-user-guide-pdf.js
 */

const fs = require('fs');
const path = require('path');
const { buildRoleProfilesUserGuideHtml } = require('../lib/hmsRoleProfilesUserGuide');
const { htmlToPdfBuffer } = require('../lib/passportPdf');

const docsDir = path.join(__dirname, '..', 'docs');
const htmlPath = path.join(docsDir, 'ZAIZENS-ROLE-PROFILES-USER-GUIDE.html');
const pdfPath = path.join(docsDir, 'ZAIZENS-ROLE-PROFILES-USER-GUIDE.pdf');

const html = buildRoleProfilesUserGuideHtml();
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`Wrote ${htmlPath}`);

console.log('Generating PDF with headless browser...');
const buf = htmlToPdfBuffer(html);
fs.writeFileSync(pdfPath, buf);
console.log(`Wrote ${pdfPath} (${Math.round(buf.length / 1024)} KB)`);
