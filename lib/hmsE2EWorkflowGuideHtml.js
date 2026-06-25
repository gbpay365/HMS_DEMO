'use strict';

const fs = require('fs');
const path = require('path');
const { esc, coverPage, wrapPremiumDoc, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const GUIDE_CSS = `
:root[data-doc="e2e-workflow"] { --accent: #0c8b8b; --accent-light: #ccfbf1; }
.workflow-meta {
  background: var(--surface); border: 1px solid var(--line); border-radius: 8px;
  padding: 4mm 5mm; margin: 4mm 0 6mm; font-size: 9pt;
}
.workflow-meta dt { font-weight: 700; color: var(--muted); display: inline; }
.workflow-meta dd { display: inline; margin: 0 4mm 0 1mm; }
.step-block { page-break-inside: avoid; margin: 0 0 8mm; }
.step-head {
  display: flex; align-items: flex-start; gap: 3mm; margin-bottom: 2mm;
}
.step-num {
  flex-shrink: 0; width: 8mm; height: 8mm; border-radius: 50%;
  background: var(--accent); color: #fff; font-weight: 800; font-size: 9pt;
  text-align: center; line-height: 8mm;
}
.step-title { font-size: 11pt; font-weight: 800; color: var(--navy); margin: 0; }
.step-role {
  font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  color: #065f46; background: #d1fae5; padding: 0.5mm 2mm; border-radius: 99px;
}
.step-url { font-size: 8pt; color: var(--muted); font-family: ui-monospace, Consolas, monospace; margin: 1mm 0 2mm; }
.fullpage-shot {
  width: 100%; border: 1px solid var(--line); border-radius: 6px;
  box-shadow: 0 2px 12px rgba(15,23,42,0.12);
}
.live-only-badge {
  font-size: 7pt; font-weight: 700; text-transform: uppercase;
  background: #dbeafe; color: #1e40af; padding: 0.5mm 2mm; border-radius: 99px;
}
`;

function loadShotBase64(shotsDir, filename) {
  const p = path.join(shotsDir, filename);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing required live screenshot: ${filename}`);
  }
  return fs.readFileSync(p).toString('base64');
}

function buildE2EWorkflowGuideHtml(plan, shotsDir) {
  const stepsHtml = plan.steps
    .map((s, i) => {
      const b64 = loadShotBase64(shotsDir, s.file);
      return `
<section class="step-block" id="step-${i + 1}">
  <div class="step-head">
    <span class="step-num">${i + 1}</span>
    <div>
      <p class="step-title">${esc(s.title)} <span class="live-only-badge">Live full-page</span></p>
      <span class="step-role">${esc(s.role || '')}</span>
      ${s.login ? `<span class="step-role" style="background:#ede9fe;color:#5b21b6;margin-left:1mm">Login: ${esc(s.login)}</span>` : ''}
      <div class="step-url">${esc(s.path)}</div>
    </div>
  </div>
  <img class="fullpage-shot" src="data:image/png;base64,${b64}" alt="${esc(s.title)}" />
</section>`;
    })
    .join('');

  const body = `
<style>${PREMIUM_CSS}${GUIDE_CSS}</style>
${coverPage({
  docLabel: plan.title,
  title: plan.title,
  subtitle: `${plan.subtitle} — Patient: ${plan.patient} (ID ${plan.patientId})`,
  badge: 'Live Full-Page Capture · No Illustrations',
  variant: 'e2e-workflow',
})}
<div class="doc-body">
<h2 class="section">Overview</h2>
<p>This guide documents a <strong>complete end-to-end workflow</strong> using live full-page screenshots from the running ZAIZENS HMS demo. Every screen was captured from the actual application — no illustrated placeholders.</p>
<dl class="workflow-meta">
  <dt>Patient:</dt><dd><strong>${esc(plan.patient)}</strong> (ID ${plan.patientId})</dd>
  <dt>Steps:</dt><dd>${plan.steps.length} full-page captures</dd>
  <dt>Module:</dt><dd>${esc(plan.id)}</dd>
</dl>

<h2 class="section">Workflow steps</h2>
${stepsHtml}

<div class="footer-note">${esc(brand.name)} · ${esc(plan.title)} · Live capture edition</div>
</div>`;

  return wrapPremiumDoc({
    title: `${plan.title} — ${brand.name}`,
    variant: 'e2e-workflow',
    bodyHtml: body,
  });
}

module.exports = { buildE2EWorkflowGuideHtml, loadShotBase64 };
