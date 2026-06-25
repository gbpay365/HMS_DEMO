'use strict';

const fs = require('fs');
const path = require('path');
const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');
const { loadShotBase64, credentialsTable, phaseBadge } = require('./hmsE2EWorkflowGuideHtml');

const GUIDE_CSS = `
:root[data-doc="complete-users-guide"] {
  --accent: #0c8b8b;
  --accent-light: #ccfbf1;
}
.part-banner {
  background: linear-gradient(135deg, var(--navy) 0%, #1e4d6b 100%);
  color: #fff; padding: 5mm 6mm; border-radius: 8px; margin: 6mm 0 5mm;
  page-break-before: always; break-before: page;
}
.part-banner h2 { margin: 0; font-size: 14pt; color: #fff; border: none; padding: 0; }
.part-banner p { margin: 2mm 0 0; font-size: 9.5pt; opacity: 0.92; }
.module-kpi {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 4mm 0 5mm;
}
.module-kpi div {
  background: var(--surface); border: 1px solid var(--line); border-radius: 6px;
  padding: 3mm; text-align: center; font-size: 8.5pt;
}
.module-kpi strong { display: block; font-size: 12pt; color: var(--navy); }
.flow {
  font-family: ui-monospace, Consolas, monospace; font-size: 8.5pt;
  background: var(--surface); border: 1px solid var(--line); border-radius: 6px;
  padding: 4mm 5mm; white-space: pre-wrap; line-height: 1.55; margin: 4mm 0 5mm;
}
.cred-table { width: 100%; font-size: 8.5pt; margin: 3mm 0 5mm; border-collapse: collapse; }
.cred-table th, .cred-table td { border: 1px solid var(--line); padding: 2.5mm 3mm; text-align: left; }
.cred-table th { background: var(--surface); font-weight: 700; }
.role-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 4mm 0 5mm;
}
.role-card {
  border-radius: 8px; padding: 3.5mm 4mm; border: 1px solid var(--line); break-inside: avoid;
  font-size: 8.5pt;
}
.role-card .icon { font-size: 18pt; margin-bottom: 1.5mm; }
.role-card strong { display: block; font-size: 9.5pt; margin-bottom: 1mm; }
.step-block { page-break-inside: avoid; margin: 0 0 7mm; }
.step-head { display: flex; align-items: flex-start; gap: 3mm; margin-bottom: 2mm; }
.step-num {
  flex-shrink: 0; width: 8mm; height: 8mm; border-radius: 50%;
  background: var(--accent); color: #fff; font-weight: 800; font-size: 9pt;
  text-align: center; line-height: 8mm;
}
.step-title { font-size: 10.5pt; font-weight: 800; color: var(--navy); margin: 0 0 1mm; }
.step-role {
  font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  color: #065f46; background: #d1fae5; padding: 0.5mm 2mm; border-radius: 99px; margin-right: 1mm;
}
.phase-login { background: #dbeafe; color: #1e40af; }
.phase-task { background: #ede9fe; color: #5b21b6; }
.phase-logout { background: #fee2e2; color: #991b1b; }
.step-explain { font-size: 9pt; color: var(--body); margin: 2mm 0 3mm; line-height: 1.52; }
.step-url { font-size: 7.5pt; color: var(--muted); font-family: ui-monospace, Consolas, monospace; margin: 0 0 2mm; }
.fullpage-shot {
  width: 100%; border: 1px solid var(--line); border-radius: 6px;
  box-shadow: 0 2px 10px rgba(15,23,42,0.1);
}
.doc-meta {
  font-size: 8pt; color: var(--muted); border-top: 1px solid var(--line);
  padding-top: 3mm; margin-top: 6mm;
}
`;

const MODULE_INTROS = {
  'opd-e2e': {
    part: 'Part I',
    icon: '🩺',
    color: '#1a6bd8',
    summary:
      'Outpatient care from consultation fee collection through nursing triage, doctor consultation, order payment, and department processing (Lab, Radiology, Pharmacy).',
    flow: `Patient arrives
  → Cashier (consultation fee)
  → Nurse (triage & vitals)
  → Doctor (consultation & orders)
  → Cashier (order payment)
  → Lab · Radiology · Pharmacy
  → Doctor (complete visit)`,
    roles: 'Cashier · Nurse · Doctor · Lab Technician · Radiologist · Pharmacist',
  },
  'ipd-e2e': {
    part: 'Part II',
    icon: '🛏️',
    color: '#7c3aed',
    summary:
      'Inpatient hospitalization from admission deposit through bed assignment, ward nursing, clinical discharge, and financial settlement.',
    flow: `Doctor (admit order)
  → Cashier (deposit)
  → Nurse (bed assignment & ward care)
  → Doctor (ward rounds & clinical discharge)
  → Cashier (final bill & financial discharge)`,
    roles: 'Doctor · Cashier · Nurse · ADT',
  },
  'maternity-e2e': {
    part: 'Part III',
    icon: '🤰',
    color: '#9d174d',
    summary:
      'Antenatal registration through maternity chart documentation (ANC, risk, scans, labor, delivery), newborn and postnatal care, and cashier billing.',
    flow: `Nurse (ANC registration)
  → Doctor (antenatal chart tabs)
  → Nurse (newborn & postnatal)
  → Cashier (maternity billing)`,
    roles: 'Nurse · Doctor · Cashier',
  },
  'emergency-e2e': {
    part: 'Part IV',
    icon: '🚑',
    color: '#dc2626',
    summary:
      'Emergency / A&E with no prepayment — rapid triage, doctor treatment on credit tab, supporting departments, disposition, and retrospective cashier settlement.',
    flow: `Nurse (ER triage)
  → Doctor (assessment & orders on credit)
  → Lab · Radiology · Pharmacy
  → Doctor (disposition)
  → Cashier (retrospective settlement)`,
    roles: 'Nurse · Doctor · Lab · Radiologist · Pharmacist · Cashier',
  },
};

function renderWorkflowSteps(plan, shotsDir, stepOffset = 0) {
  return plan.steps
    .map((s, i) => {
      const b64 = loadShotBase64(shotsDir, s.file);
      const n = stepOffset + i + 1;
      const loginTag = s.login
        ? `<span class="step-role" style="background:#fef3c7;color:#92400e">${esc(s.login)}</span>`
        : '';
      return `
<section class="step-block" id="${esc(plan.id)}-step-${i + 1}">
  <div class="step-head">
    <span class="step-num">${n}</span>
    <div style="flex:1">
      <p class="step-title">${esc(s.title)}</p>
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
}

function renderModuleSection(plan, shotsDir, stepOffset) {
  const intro = MODULE_INTROS[plan.id] || {};
  const stepsHtml = renderWorkflowSteps(plan, shotsDir, stepOffset);

  return `
<div class="part-banner" id="${esc(plan.id)}" style="border-left:6px solid ${esc(intro.color || '#0c8b8b')}">
  <div style="font-size:9pt;opacity:0.85;margin-bottom:1mm">${esc(intro.part || '')} · Live workflow capture</div>
  <h2>${intro.icon || ''} ${esc(plan.title)}</h2>
  <p>${esc(plan.subtitle)}</p>
</div>

<div class="module-kpi">
  <div><strong>${plan.steps.length}</strong>screenshots</div>
  <div><strong>${esc(plan.patient)}</strong>demo patient</div>
  <div><strong>ID ${plan.patientId}</strong>patient record</div>
</div>

<p>${esc(intro.summary || '')}</p>
<div class="flow">${esc(intro.flow || '')}</div>
<p><strong>Roles involved:</strong> ${esc(intro.roles || '')}</p>

<h3 class="subsection">Step-by-step (${plan.steps.length} live screens)</h3>
<p>Each profile <strong>signs in</strong>, completes their tasks, and <strong>signs out</strong> before the next user continues the patient journey. All images are full-page captures from the live HMS application.</p>
${stepsHtml}
`;
}

/**
 * Build the complete ZAIZENS HMS User's Guide from existing workflow screenshot folders.
 * @param {object[]} plans - from buildAllWorkflowPlans()
 * @param {string} shotsRoot - docs/workflow-screenshots
 * @param {object} [meta] - optional manifest metadata
 */
function buildCompleteUsersGuideHtml(plans, shotsRoot, meta = {}) {
  const b = brand;
  const creds = plans[0]?.credentials;
  const totalSteps = plans.reduce((n, p) => n + p.steps.length, 0);
  const generated = meta.generatedAt
    ? new Date(meta.generatedAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
    : new Date().toLocaleString('en-GB', { dateStyle: 'long' });

  let stepOffset = 0;
  const moduleSections = plans
    .map((plan) => {
      const shotsDir = path.join(shotsRoot, plan.id);
      const html = renderModuleSection(plan, shotsDir, stepOffset);
      stepOffset += plan.steps.length;
      return html;
    })
    .join('');

  const tocModules = plans
    .map((p) => {
      const intro = MODULE_INTROS[p.id] || {};
      return `<li><a href="#${esc(p.id)}">${esc(intro.part || '')}: ${esc(p.title)}</a> — ${p.steps.length} steps · Patient: ${esc(p.patient)}</li>`;
    })
    .join('');

  const body = `
<style>${PREMIUM_CSS}${GUIDE_CSS}</style>
${coverPage({
  docLabel: "Complete User's Guide",
  title: `${b.name} Hospital Management System`,
  subtitle: 'Official staff manual — OPD, IPD, Maternity & Emergency workflows with live application screenshots, role-based login procedures, and step-by-step instructions.',
  badge: "Staff Edition · Live Screenshots · ${totalSteps} Screens",
  variant: 'complete-users-guide',
})}
<div class="doc-body">

<h2 class="section" id="about">About this guide</h2>
<p>Welcome to the <strong>${esc(b.productName)} Complete User's Guide</strong>. This manual is built from live full-page screenshots captured on the running HMS demo — the same visual quality expected of modern hospital information systems. It documents four complete patient journeys across outpatient, inpatient, maternity, and emergency care.</p>
<div class="tip"><strong>How to use this guide:</strong> Train staff module-by-module (Part I–IV) or follow a single patient end-to-end within each part. Every workflow step shows the actual screen, the URL path, the responsible role, and whether the action is sign-in, task work, or sign-out.</div>

<dl class="workflow-meta" style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:4mm 5mm;margin:4mm 0 6mm;font-size:9pt">
  <dt>Edition:</dt><dd>Live Capture Staff Manual</dd>
  <dt>Generated:</dt><dd>${esc(generated)}</dd>
  <dt>Total screens:</dt><dd>${totalSteps} full-page captures</dd>
  <dt>Source workflows:</dt><dd>OPD · IPD · Maternity · Emergency E2E guides</dd>
</dl>

${section('getting-started', '1. Getting Started', `
<h3>Accessing the system</h3>
<ol>
<li>Open your HMS URL (demo: <code>http://localhost:3004</code>).</li>
<li>Enter your <strong>username</strong> and <strong>password</strong>.</li>
<li>Usernames are <strong>not case-sensitive</strong> (e.g. <code>lariza</code> and <code>Lariza</code> both work).</li>
<li>After sign-in you are redirected to your role portal (Cashier, Nurse, Doctor, Lab, etc.).</li>
<li>Always <strong>sign out</strong> via the top menu (<code>/logout</code>) on shared computers.</li>
</ol>
<h3>Session workflow pattern</h3>
<p>Every role in this guide follows the same pattern:</p>
<ol>
<li><strong>Sign in</strong> — authenticate and open your portal</li>
<li><strong>Perform tasks</strong> — complete module-specific actions for the patient</li>
<li><strong>Sign out</strong> — end your session before the next colleague signs in</li>
</ol>
`)}

${section('navigation', '2. Navigation & Interface', `
<h3>Main navigation</h3>
<table class="data">
<tr><th>Area</th><th>Path</th><th>Purpose</th></tr>
<tr><td>Login</td><td><code>/</code></td><td>Staff authentication</td></tr>
<tr><td>HMS Hub</td><td><code>/hms</code></td><td>Clinical operations dashboard</td></tr>
<tr><td>Apps launcher</td><td>Grid icon (top-left)</td><td>Quick switch between modules</td></tr>
<tr><td>Patient chart</td><td><code>/patient-chart/:id</code></td><td>Full clinical record</td></tr>
<tr><td>OPD queue</td><td><code>/opd-queue</code></td><td>Outpatient visit management</td></tr>
<tr><td>Cashier</td><td><code>/cashier</code></td><td>Payments &amp; codes</td></tr>
<tr><td>IPD</td><td><code>/ipd</code></td><td>Inpatient hospitalizations</td></tr>
<tr><td>Maternity</td><td><code>/maternity</code></td><td>ANC &amp; obstetric care</td></tr>
<tr><td>Emergency</td><td><code>/emergency</code></td><td>A&amp;E board &amp; visits</td></tr>
</table>
<p>Language: English and Français are supported via the header language switcher.</p>
`)}

${section('roles', '3. Roles & Demo Credentials', `
<p>The workflows in this guide use the following demo accounts. Password for all: <code>12345</code>.</p>
${credentialsTable(creds)}
<div class="role-grid">
  <div class="role-card" style="background:#d1fae5"><div class="icon">💳</div><strong>Cashier</strong>Payments, codes, wallets, IPD/ER settlement</div>
  <div class="role-card" style="background:#ffedd5"><div class="icon">💉</div><strong>Nurse</strong>Triage, vitals, ward care, ER triage</div>
  <div class="role-card" style="background:#dbeafe"><div class="icon">🩺</div><strong>Doctor</strong>Consultations, orders, admissions, discharge</div>
  <div class="role-card" style="background:#ede9fe"><div class="icon">🔬</div><strong>Lab Technician</strong>Validate codes, enter results, LIMS</div>
  <div class="role-card" style="background:#cffafe"><div class="icon">📡</div><strong>Radiologist</strong>Imaging worklist &amp; reports</div>
  <div class="role-card" style="background:#fce7f3"><div class="icon">💊</div><strong>Pharmacist</strong>Prescription dispensing</div>
</div>
`)}

<h2 class="section" id="workflows">4. Clinical Workflows (Live Screenshots)</h2>
<div class="toc">
<strong>Table of contents — workflow parts</strong>
<ol>
${tocModules}
<li><a href="#appendix">Appendix — troubleshooting &amp; glossary</a></li>
</ol>
</div>

${moduleSections}

${section('appendix', 'Appendix — Troubleshooting & Glossary', `
<h3>Common issues</h3>
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Invalid login</td><td>Verify username (case-insensitive) and password. Demo password: <code>12345</code></td></tr>
<tr><td>Menu item missing</td><td>Your role may lack permission — contact administrator</td></tr>
<tr><td>Lab/Rad/Pharm won't process</td><td>Patient must pay at Cashier first — verify payment code</td></tr>
<tr><td>Wallet payment fails</td><td>Top up patient wallet at Cashier before wallet deduction</td></tr>
<tr><td>IPD not in settle list</td><td>Doctor must sign clinical discharge before financial settlement</td></tr>
<tr><td>ER bill empty</td><td>Charges accumulate on credit tab during treatment — settle at end</td></tr>
</table>
<h3>Glossary</h3>
<table class="data">
<tr><th>Term</th><th>Meaning</th></tr>
<tr><td>OPD</td><td>Outpatient Department — visits without overnight stay</td></tr>
<tr><td>IPD</td><td>Inpatient Department — hospitalization with bed assignment</td></tr>
<tr><td>ANC</td><td>Antenatal Care — maternity module registration &amp; visits</td></tr>
<tr><td>Payment code</td><td>Alphanumeric code proving a service was paid (LAB/RAD/PHARM)</td></tr>
<tr><td>Credit tab</td><td>Running unpaid charges (ER/IPD) settled later at Cashier</td></tr>
<tr><td>Clinical discharge</td><td>Doctor signs patient medically fit to leave (IPD)</td></tr>
<tr><td>Financial discharge</td><td>Cashier settles all charges and frees the bed</td></tr>
</table>
<div class="warn"><strong>Security:</strong> Demo passwords are for training only. Change all credentials before production use.</div>
`)}

<div class="doc-meta">
  ${esc(b.name)} · ${esc(b.productName)} · Complete User's Guide · ${totalSteps} live screenshots ·
  Source: ZAIZENS-WORKFLOW-OPD-E2E, IPD-E2E, MATERNITY-E2E, EMERGENCY-E2E
</div>
</div>`;

  return wrapPremiumDoc({
    title: `${b.name} — Complete User's Guide`,
    variant: 'complete-users-guide',
    bodyHtml: body,
  });
}

module.exports = { buildCompleteUsersGuideHtml, MODULE_INTROS };
