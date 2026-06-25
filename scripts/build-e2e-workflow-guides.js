'use strict';

/**
 * Build four E2E workflow guides + master comprehensive guide (live full-page screenshots only).
 * Usage: npm run build:e2e-workflow-guides
 * Requires: HMS running (default http://127.0.0.1:3004)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { loadWorkflowGuideContext } = require('../lib/workflowGuideContext');
const { buildAllWorkflowPlans } = require('../lib/e2eWorkflowPlans');
const { captureWorkflowSteps } = require('../lib/fullPageCapture');
const { buildE2EWorkflowGuideHtml, buildMasterWorkflowGuideHtml } = require('../lib/hmsE2EWorkflowGuideHtml');
const { htmlToPdfBuffer } = require('../lib/passportPdf');

const docsDir = path.join(__dirname, '..', 'docs');
const shotsRoot = path.join(docsDir, 'workflow-screenshots');

const GUIDE_FILES = {
  'opd-e2e': 'ZAIZENS-WORKFLOW-OPD-E2E',
  'ipd-e2e': 'ZAIZENS-WORKFLOW-IPD-E2E',
  'maternity-e2e': 'ZAIZENS-WORKFLOW-MATERNITY-E2E',
  'emergency-e2e': 'ZAIZENS-WORKFLOW-EMERGENCY-E2E',
};

async function buildOneGuide(plan, baseUrl) {
  const shotsDir = path.join(shotsRoot, plan.id);
  fs.mkdirSync(shotsDir, { recursive: true });

  console.log(`\n=== ${plan.title} — ${plan.patient} (${plan.steps.length} steps) ===`);

  const stepsForCapture = plan.steps.map((s) => ({
    file: s.file,
    login: s.login,
    password: s.password,
    path: s.path,
    waitMs: s.waitMs,
    phase: s.phase,
  }));

  await captureWorkflowSteps(stepsForCapture, { base: baseUrl, outDir: shotsDir });

  const html = buildE2EWorkflowGuideHtml(plan, shotsDir);
  const baseName = GUIDE_FILES[plan.id] || plan.id;
  const htmlPath = path.join(docsDir, `${baseName}.html`);
  const pdfPath = path.join(docsDir, `${baseName}.pdf`);

  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`Wrote ${htmlPath}`);

  const pdfBuf = htmlToPdfBuffer(html);
  fs.writeFileSync(pdfPath, pdfBuf);
  console.log(`Wrote ${pdfPath} (${Math.round(pdfBuf.length / 1024)} KB)`);

  return { id: plan.id, htmlPath, pdfPath, steps: plan.steps.length };
}

async function main() {
  const baseUrl = String(process.env.HMS_GUIDE_BASE || 'http://127.0.0.1:3004').replace(/\/$/, '');
  console.log(`HMS base: ${baseUrl}`);

  const ctx = await loadWorkflowGuideContext();
  console.log('Patient context:', JSON.stringify(ctx, null, 2));

  const plans = buildAllWorkflowPlans(ctx);
  const built = [];

  for (const plan of plans) {
    built.push(await buildOneGuide(plan, baseUrl));
  }

  console.log('\n=== Master comprehensive guide (all workflows) ===');
  const masterHtml = buildMasterWorkflowGuideHtml(plans, shotsRoot);
  const masterHtmlPath = path.join(docsDir, 'ZAIZENS-COMPREHENSIVE-LIVE-WORKFLOW-GUIDE.html');
  const masterPdfPath = path.join(docsDir, 'ZAIZENS-COMPREHENSIVE-LIVE-WORKFLOW-GUIDE.pdf');
  fs.writeFileSync(masterHtmlPath, masterHtml, 'utf8');
  console.log(`Wrote ${masterHtmlPath}`);
  const masterPdf = htmlToPdfBuffer(masterHtml);
  fs.writeFileSync(masterPdfPath, masterPdf);
  console.log(`Wrote ${masterPdfPath} (${Math.round(masterPdf.length / 1024)} KB)`);

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    context: ctx,
    guides: built,
    master: { htmlPath: masterHtmlPath, pdfPath: masterPdfPath },
    totalSteps: plans.reduce((n, p) => n + p.steps.length, 0),
  };
  fs.writeFileSync(path.join(docsDir, 'WORKFLOW-GUIDES-MANIFEST.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nDone. ${manifest.totalSteps} live full-page screenshots across ${plans.length} workflows + master guide.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
