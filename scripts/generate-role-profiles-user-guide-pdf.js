'use strict';

/**
 * Capture live screenshots (when HMS is running), then build HTML + PDF guide.
 * Usage: node scripts/generate-role-profiles-user-guide-pdf.js
 * Env: HMS_GUIDE_BASE=http://127.0.0.1:3004
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { buildRoleProfilesUserGuideHtml } = require('../lib/hmsRoleProfilesUserGuide');
const { captureRoleGuideScreenshots } = require('../lib/guideScreenshotCapture');
const { htmlToPdfBuffer } = require('../lib/passportPdf');

const docsDir = path.join(__dirname, '..', 'docs');
const htmlPath = path.join(docsDir, 'ZAIZENS-ROLE-PROFILES-USER-GUIDE.html');
const pdfPath = path.join(docsDir, 'ZAIZENS-ROLE-PROFILES-USER-GUIDE.pdf');

async function main() {
  console.log('Attempting live screenshot capture...');
  const cap = await captureRoleGuideScreenshots();
  if (cap.skipped) {
    console.warn('Screenshot capture skipped:', cap.errors.join('; ') || 'unknown');
    console.warn('Guide will use illustrated UI screens. Start HMS and re-run for live captures.');
  } else {
    console.log(`Captured ${cap.ok} screenshot(s).`);
    if (cap.errors.length) console.warn('Capture warnings:', cap.errors.join('; '));
  }

  const html = buildRoleProfilesUserGuideHtml();
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`Wrote ${htmlPath}`);

  console.log('Generating PDF...');
  const buf = htmlToPdfBuffer(html);
  fs.writeFileSync(pdfPath, buf);
  console.log(`Wrote ${pdfPath} (${Math.round(buf.length / 1024)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
