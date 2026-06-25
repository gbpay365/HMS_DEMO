'use strict';

/**
 * Assemble the complete ZAIZENS HMS User's Guide from existing E2E workflow captures.
 * Uses screenshots in docs/workflow-screenshots/ (no re-capture required).
 *
 * Prerequisite: run npm run build:e2e-workflow-guides once with HMS running.
 * Usage: npm run build:complete-users-guide
 */

const fs = require('fs');
const path = require('path');
const { buildAllWorkflowPlans } = require('../lib/e2eWorkflowPlans');
const { buildCompleteUsersGuideHtml } = require('../lib/hmsCompleteUsersGuide');
const { htmlToPdfBuffer } = require('../lib/passportPdf');

const docsDir = path.join(__dirname, '..', 'docs');
const shotsRoot = path.join(docsDir, 'workflow-screenshots');
const manifestPath = path.join(docsDir, 'WORKFLOW-GUIDES-MANIFEST.json');
const htmlPath = path.join(docsDir, 'ZAIZENS-COMPLETE-USERS-GUIDE.html');
const pdfPath = path.join(docsDir, 'ZAIZENS-COMPLETE-USERS-GUIDE.pdf');

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      'Missing WORKFLOW-GUIDES-MANIFEST.json — run: npm run build:e2e-workflow-guides (with HMS running)'
    );
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function verifyScreenshots(plans) {
  for (const plan of plans) {
    const dir = path.join(shotsRoot, plan.id);
    if (!fs.existsSync(dir)) {
      throw new Error(`Missing screenshot folder: ${dir}`);
    }
    const missing = plan.steps.filter((s) => !fs.existsSync(path.join(dir, s.file)));
    if (missing.length) {
      throw new Error(
        `Missing ${missing.length} screenshot(s) for ${plan.id} (e.g. ${missing[0].file}). Re-run build:e2e-workflow-guides.`
      );
    }
  }
}

function main() {
  const manifest = loadManifest();
  const plans = buildAllWorkflowPlans(manifest.context);
  console.log(`Building Complete User's Guide from ${plans.length} workflow modules...`);
  plans.forEach((p) => console.log(`  · ${p.id}: ${p.steps.length} steps — patient ${p.patient}`));

  verifyScreenshots(plans);

  const html = buildCompleteUsersGuideHtml(plans, shotsRoot, manifest);
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`Wrote ${htmlPath}`);

  console.log('Generating PDF (this may take a few minutes)...');
  const pdfBuf = htmlToPdfBuffer(html);
  fs.writeFileSync(pdfPath, pdfBuf);
  console.log(`Wrote ${pdfPath} (${Math.round(pdfBuf.length / 1024)} KB)`);
  console.log("Done — ZAIZENS Complete User's Guide ready.");
}

main();
