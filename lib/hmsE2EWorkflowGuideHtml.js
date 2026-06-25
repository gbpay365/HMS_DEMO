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
.cred-table { width: 100%; font-size: 8.5pt; margin: 3mm 0 5mm; border-collapse: collapse; }
.cred-table th, .cred-table td { border: 1px solid var(--line); padding: 2mm 3mm; text-align: left; }
.cred-table th { background: var(--surface); }
.step-block { page-break-inside: avoid; margin: 0 0 8mm; }
.step-head { display: flex; align-items: flex-start; gap: 3mm; margin-bottom: 2mm; }
.step-num {
  flex-shrink: 0; width: 8mm; height: 8mm; border-radius: 50%;
  background: var(--accent); color: #fff; font-weight: 800; font-size: 9pt;
  text-align: center; line-height: 8mm;
}
.step-title { font-size: 11pt; font-weight: 800; color: var(--navy); margin: 0 0 1mm; }
.step-role {
  font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  color: #065f46; background: #d1fae5; padding: 0.5mm 2mm; border-radius: 99px; margin-right: 1mm;
}
.phase-login { background: #dbeafe; color: #1e40af; }
.phase-task { background: #ede9fe; color: #5b21b6; }
.phase-logout { background: #fee2e2; color: #991b1b; }
.step-explain { font-size: 9pt; color: var(--body); margin: 2mm 0 3mm; line-height: 1.5; }
.step-url { font-size: 8pt; color: var(--muted); font-family: ui-monospace, Consolas, monospace; margin: 0 0 2mm; }
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
    throw new Error(`Missing required live screenshot: ${filename} — run npm run build:e2e-workflow-guides with HMS running`);
  }
  return fs.readFileSync(p).toString('base64');
}

function credentialsTable(creds) {
  if (!creds) return '';
  const rows = Object.entries(creds)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td><code>${esc(v)}</code></td><td><code>12345</code></td></tr>`)
    .join('');
  return `<table class="cred-table"><tr><th>Profile</th><th>Username</th><th>Password</th></tr>${rows}</table>`;
}

function phaseBadge(phase) {
  const p = String(phase || 'task');
  const label = p === 'login' ? 'Sign in' : p === 'logout' ? 'Sign out' : 'Task';
  return `<span class="step-role phase-${esc(p)}">${label}</span>`;
}

function buildE2EWorkflowGuideHtml(plan, shotsDir) {
  const stepsHtml = plan.steps
    .map((s, i) => {
      const b64 = loadShotBase64(shotsDir, s.file);
      const loginTag = s.login
        ? `<span class="step-role" style="background:#fef3c7;color:#92400e">User: ${esc(s.login)}</span>`
        : '';
      return `
<section class="step-block" id="step-${i + 1}">
  <div class="step-head">
    <span class="step-num">${i + 1}</span>
    <div style="flex:1">
      <p class="step-title">${esc(s.title)} <span class="live-only-badge">Live full-page</span></p>
      <div style="margin-bottom:1.5mm">
        <span class="step-role">${esc(s.role || '')}</span>
        ${phaseBadge(s.phase)}
        ${loginTag}
      </div>
      <div class="step-url">${esc(s.path)}</div>
      ${s.explanation ? `<div class="step-explain">${s.explanation}</div>` : ''}
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
  subtitle: `${plan.subtitle} — Patient: ${plan.patient}`,
  badge: 'Live Full-Page Capture · Login → Task → Logout',
  variant: 'e2e-workflow',
})}
<div class="doc-body">
<h2 class="section">Overview</h2>
<p>This guide documents a <strong>complete end-to-end workflow</strong> using <strong>live full-page screenshots only</strong> from the running ZAIZENS HMS demo. Each profile signs in, performs their tasks, and signs out. No illustrated placeholders are used.</p>
<dl class="workflow-meta">
  <dt>Patient:</dt><dd><strong>${esc(plan.patient)}</strong> (ID ${plan.patientId})</dd>
  <dt>Steps:</dt><dd>${plan.steps.length} full-page captures</dd>
  <dt>Module:</dt><dd>${esc(plan.id)}</dd>
</dl>
<h3 class="subsection">Demo credentials</h3>
${credentialsTable(plan.credentials)}

<h2 class="section">Step-by-step workflow</h2>
${stepsHtml}

<div class="footer-note">${esc(brand.name)} · ${esc(plan.title)} · Live capture · ${plan.steps.length} screens</div>
</div>`;

  return wrapPremiumDoc({
    title: `${plan.title} — ${brand.name}`,
    variant: 'e2e-workflow',
    bodyHtml: body,
  });
}

/** Master guide combining multiple workflow plans */
function buildMasterWorkflowGuideHtml(plans, shotsRoot) {
  const sections = plans
    .map((plan) => {
      const shotsDir = path.join(shotsRoot, plan.id);
      const inner = plan.steps
        .map((s, i) => {
          const b64 = loadShotBase64(shotsDir, s.file);
          return `
<div class="step-block" id="${esc(plan.id)}-step-${i + 1}">
  <div class="step-head">
    <span class="step-num">${i + 1}</span>
    <div style="flex:1">
      <p class="step-title">${esc(s.title)}</p>
      <span class="step-role">${esc(s.role || '')}</span> ${phaseBadge(s.phase)}
      ${s.login ? `<span class="step-role" style="background:#fef3c7;color:#92400e">${esc(s.login)}</span>` : ''}
      <div class="step-url">${esc(s.path)}</div>
      ${s.explanation ? `<div class="step-explain">${s.explanation}</div>` : ''}
    </div>
  </div>
  <img class="fullpage-shot" src="data:image/png;base64,${b64}" alt="${esc(s.title)}" />
</div>`;
        })
        .join('');
      return `
<div class="page-break"></div>
<h2 class="section" id="${esc(plan.id)}">${esc(plan.title)}</h2>
<p><strong>Patient:</strong> ${esc(plan.patient)} (ID ${plan.patientId}) — ${esc(plan.subtitle)}</p>
${inner}`;
    })
    .join('');

  const toc = plans
    .map((p) => `<li><a href="#${esc(p.id)}">${esc(p.title)} (${p.steps.length} steps)</a></li>`)
    .join('');

  const body = `
<style>${PREMIUM_CSS}${GUIDE_CSS}</style>
${coverPage({
  docLabel: 'Comprehensive Live Workflow Guide',
  title: 'ZAIZENS HMS — Complete Workflow Training',
  subtitle: 'OPD · IPD · Maternity · Emergency — full-page live captures with login, task, and logout for every profile',
  badge: 'Master Edition · Live Screenshots Only',
  variant: 'e2e-workflow',
})}
<div class="doc-body">
<h2 class="section">Introduction</h2>
<p>This master guide combines <strong>four complete patient journeys</strong> documented exclusively with live full-page screenshots. Every step shows the actual HMS interface. Staff profiles sign in, complete their module tasks, and sign out.</p>
<h3 class="subsection">Demo credentials (password for all: <code>12345</code>)</h3>
${credentialsTable(plans[0]?.credentials)}
<div class="toc"><strong>Workflows in this guide</strong><ol>${toc}</ol></div>
${sections}
<div class="footer-note">${esc(brand.name)} · Comprehensive Live Workflow Guide</div>
</div>`;

  return wrapPremiumDoc({
    title: 'ZAIZENS HMS — Comprehensive Live Workflow Guide',
    variant: 'e2e-workflow',
    bodyHtml: body,
  });
}

module.exports = { buildE2EWorkflowGuideHtml, buildMasterWorkflowGuideHtml, loadShotBase64, credentialsTable, phaseBadge };
