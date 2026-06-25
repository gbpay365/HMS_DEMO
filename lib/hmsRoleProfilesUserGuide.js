'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const PROFILES = [
  {
    id: 'cashier',
    role: 'Cashier',
    login: 'Lariza',
    password: '12345',
    icon: '💳',
    color: '#059669',
    colorLight: '#d1fae5',
    portal: '/portal/cashier',
    hub: '/cashier',
    summary: 'Collect payments, issue prepay tickets, print receipts, manage wallets and payment codes.',
    steps: [
      'Open the HMS login page and sign in with your Cashier credentials.',
      'You land on the Cashier portal — click <strong>Cashier Command Center</strong> or go to <code>/cashier</code>.',
      'Use the <strong>Pending</strong> tab to find patients awaiting payment; search by name or ticket number.',
      'Click <strong>Collect</strong> or <strong>Issue payment</strong> to open the prepay modal — add services from the catalog.',
      'Select a payment method (Cash, MoMo, Wallet, BetterPay, etc.) and confirm collection.',
      'Print the receipt and share the <strong>payment code</strong> with Lab, Radiology, or Pharmacy as needed.',
      'Use <strong>Cash Top-up</strong> (after Petty cash payout) to credit patient wallets at the desk.',
      'End of day: open <strong>EOD reconciliation</strong> to review totals before sign-out.',
    ],
    tips: [
      'Wallet payments require the patient to have an active wallet with sufficient balance.',
      'BetterPay: wait for patient confirmation on their phone before marking payment received.',
      'Payment codes link OPD orders to Lab/Radiology/Pharmacy — always verify code status before redirecting patients.',
    ],
  },
  {
    id: 'doctor',
    role: 'Doctor',
    login: 'Awelsa',
    password: '12345',
    icon: '🩺',
    color: '#1a6bd8',
    colorLight: '#dbeafe',
    portal: '/portal/doctor',
    hub: '/opd-queue',
    summary: 'Consult patients, record clinical notes, order lab/radiology tests, prescribe medication, and admit IPD.',
    steps: [
      'Sign in — you are redirected to the <strong>Doctor portal</strong> (<code>/portal/doctor</code>).',
      'Open <strong>OPD Queue</strong> to see patients waiting or in consultation.',
      'Select a patient and click <strong>Start consultation</strong> — record vitals review, history, and examination.',
      'Add <strong>orders</strong> (lab tests, imaging, procedures) from the consultation workspace.',
      'Write <strong>prescriptions</strong> — send to Pharmacy after saving the consultation.',
      'Mark consultation <strong>Complete</strong> — patient may need Cashier payment before lab/radiology.',
      'For admissions: create an <strong>IPD admit order</strong> from the patient chart or IPD module.',
      'Use <strong>Ward rounds</strong> and <strong>IPD orders</strong> for in-patients under your care.',
    ],
    tips: [
      'Patients must pay (or have insurance coverage) before lab/radiology can process orders.',
      'Use the clinical chart (<code>/patient/:id</code>) for full history, allergies, and documents.',
      'Teleconsultation links are available when enabled by your administrator.',
    ],
  },
  {
    id: 'nurse',
    role: 'Nurse',
    login: 'Ghong',
    password: '12345',
    icon: '💉',
    color: '#ea580c',
    colorLight: '#fff7ed',
    portal: '/portal/nurse',
    hub: '/opd-queue',
    summary: 'Triage OPD patients, record vitals, support ward care, and assist IPD medication workflows.',
    steps: [
      'Sign in — open the <strong>Nurse portal</strong> (<code>/portal/nurse</code>).',
      'Go to <strong>OPD Queue</strong> — identify patients in <em>Registered</em> or <em>Waiting</em> status.',
      'Perform <strong>triage</strong>: update priority, chief complaint, and nursing notes.',
      'Record <strong>vital signs</strong> (BP, pulse, temperature, SpO₂, weight) on the patient chart.',
      'Move patient to <strong>Waiting for doctor</strong> when vitals and triage are complete.',
      'For IPD: open <strong>Ward board</strong> — assist admissions, bed assignment support, and nursing care plans.',
      'Administer and document <strong>IPD medications</strong> per doctor orders.',
      'Flag abnormal vitals or emergencies using ER shortcuts when urgent escalation is needed.',
    ],
    tips: [
      'Always verify patient identity (name, ID band, date of birth) before procedures.',
      'Vitals saved on the chart are visible to the consulting doctor immediately.',
      'Use the HMS Hub for a quick overview of today\'s OPD and IPD workload.',
    ],
  },
  {
    id: 'radiologist',
    role: 'Radiologist',
    login: 'Tef',
    password: '12345',
    icon: '📡',
    color: '#0369a1',
    colorLight: '#e0f2fe',
    portal: '/portal/radiology',
    hub: '/radiology',
    summary: 'Process imaging worklist, verify payment codes, upload reports, and finalise radiology studies.',
    steps: [
      'Sign in — open the <strong>Radiology portal</strong> (<code>/portal/radiology</code>).',
      'Go to <strong>Radiology worklist</strong> (<code>/radiology</code>) for pending imaging requests.',
      'Verify the patient\'s <strong>payment code</strong> or paid status before performing the study.',
      'Open the request — confirm clinical indication and prior imaging if relevant.',
      'After acquisition, attach <strong>images</strong> or link from PACS as configured.',
      'Enter the <strong>radiology report</strong> (findings, impression, recommendations).',
      'Mark the study <strong>Final</strong> — the ordering doctor and patient chart are updated.',
      'Use filters (date, modality, status) to manage daily workload efficiently.',
    ],
    tips: [
      'Unpaid orders appear with payment pending — direct patient to Cashier first.',
      'Critical findings should be communicated to the referring clinician per hospital protocol.',
      'Reports are visible on the patient chart once finalised.',
    ],
  },
  {
    id: 'lab',
    role: 'Lab Technician',
    login: 'Sedrick',
    password: '12345',
    icon: '🔬',
    color: '#7c3aed',
    colorLight: '#ede9fe',
    portal: '/portal/lab',
    hub: '/lab',
    summary: 'Receive lab requests, verify payments, enter results in LIMS, and release final reports.',
    steps: [
      'Sign in — open the <strong>Lab portal</strong> (<code>/portal/lab</code>).',
      'Open <strong>LIMS / Lab worklist</strong> (<code>/lab</code>) for pending test requests.',
      'Confirm <strong>payment code</strong> or cashier receipt before sample collection/processing.',
      'Register or scan <strong>sample ID</strong> linked to the patient request.',
      'Enter <strong>results</strong> per test parameter — use reference ranges shown on screen.',
      'Validate abnormal flags and repeat critical values per SOP before release.',
      'Mark tests <strong>Complete</strong> — results flow to the patient chart and ordering doctor.',
      'Print lab report copies for patients when requested at the lab desk.',
    ],
    tips: [
      'OPD lab orders from doctors require payment unless covered by insurance/waiver.',
      'Use barcode or request ID search for fast lookup during busy periods.',
      'Pending vs completed filters help prioritize STAT and emergency requests.',
    ],
  },
  {
    id: 'pharmacist',
    role: 'Pharmacist',
    login: 'Berinyuy',
    password: '12345',
    icon: '💊',
    color: '#be123c',
    colorLight: '#ffe4e6',
    portal: '/portal/pharmacy',
    hub: '/pharmacy',
    summary: 'Dispense prescriptions, verify payments, manage stock alerts, and counsel patients on medications.',
    steps: [
      'Sign in — open the <strong>Pharmacy portal</strong> (<code>/portal/pharmacy</code>).',
      'Go to <strong>Pharmacy dispensing</strong> (<code>/pharmacy</code>) for the active prescription queue.',
      'Locate the prescription by patient name, Rx number, or payment code.',
      'Verify <strong>payment</strong> or insurance approval before dispensing.',
      'Check <strong>stock availability</strong> — substitute per formulary policy if items are out of stock.',
      'Record <strong>quantities dispensed</strong> and batch numbers where required.',
      'Mark prescription <strong>Dispensed</strong> — inventory is decremented automatically.',
      'Provide patient counseling on dosage, timing, and side effects at the counter.',
    ],
    tips: [
      'Doctor prescriptions from OPD consultations appear after consultation is saved.',
      'Low-stock alerts are visible on the pharmacy dashboard — reorder via procurement if permitted.',
      'Partial dispensing is supported when full quantity is not immediately available.',
    ],
  },
];

const GUIDE_EXTRA_CSS = `
:root[data-doc="role-profiles-guide"] {
  --accent: #0c8b8b;
  --accent-light: #ccfbf1;
}
@keyframes pulse-ring {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.08); opacity: 0.85; }
}
@keyframes fade-up {
  from { opacity: 0; transform: translateY(4mm); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.cred-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3mm;
  margin: 4mm 0 6mm;
}
.cred-card {
  border-radius: 8px;
  padding: 3.5mm 4mm;
  border: 2px solid var(--line);
  break-inside: avoid;
  animation: fade-up 0.6s ease-out both;
}
.cred-card .role-head {
  display: flex;
  align-items: center;
  gap: 3mm;
  margin-bottom: 2mm;
}
.cred-card .role-icon {
  font-size: 22pt;
  line-height: 1;
  animation: pulse-ring 2.5s ease-in-out infinite;
}
.cred-card .role-title {
  font-size: 11pt;
  font-weight: 800;
  color: var(--ink);
}
.cred-row {
  display: flex;
  gap: 2mm;
  font-size: 9pt;
  margin: 1mm 0;
}
.cred-row dt {
  font-weight: 700;
  min-width: 18mm;
  color: var(--muted);
}
.cred-row dd {
  margin: 0;
  font-family: ui-monospace, Consolas, monospace;
  font-weight: 700;
  color: var(--navy);
}
.profile-section {
  page-break-before: always;
  break-before: page;
}
.profile-header {
  display: flex;
  align-items: center;
  gap: 4mm;
  padding: 4mm 5mm;
  border-radius: 8px;
  margin-bottom: 4mm;
  color: white;
}
.profile-header .big-icon {
  font-size: 28pt;
  animation: pulse-ring 2s ease-in-out infinite;
}
.profile-header h2 {
  margin: 0;
  font-size: 16pt;
  color: white;
  border: none;
  padding: 0;
}
.profile-header p {
  margin: 1mm 0 0;
  font-size: 9pt;
  opacity: 0.92;
}
.cred-banner {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2mm;
  margin-bottom: 4mm;
}
.cred-banner div {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 2.5mm 3mm;
  font-size: 8.5pt;
  text-align: center;
}
.cred-banner strong {
  display: block;
  font-size: 10pt;
  color: var(--navy);
  font-family: ui-monospace, Consolas, monospace;
}
.step-anim li {
  animation: fade-up 0.5s ease-out both;
}
.step-anim li:nth-child(1) { animation-delay: 0.05s; }
.step-anim li:nth-child(2) { animation-delay: 0.1s; }
.step-anim li:nth-child(3) { animation-delay: 0.15s; }
.step-anim li:nth-child(4) { animation-delay: 0.2s; }
.step-anim li:nth-child(5) { animation-delay: 0.25s; }
.step-anim li:nth-child(6) { animation-delay: 0.3s; }
.step-anim li:nth-child(7) { animation-delay: 0.35s; }
.step-anim li:nth-child(8) { animation-delay: 0.4s; }
.tip-list {
  list-style: none;
  padding: 0;
  margin: 3mm 0;
}
.tip-list li {
  padding: 2mm 3mm 2mm 8mm;
  margin-bottom: 2mm;
  background: var(--accent-light);
  border-left: 3px solid var(--accent);
  border-radius: 0 4px 4px 0;
  font-size: 9pt;
  position: relative;
}
.tip-list li::before {
  content: "💡";
  position: absolute;
  left: 2mm;
  top: 2mm;
  font-size: 10pt;
}
.login-flow {
  background: linear-gradient(90deg, #0c2340, #0c8b8b, #0c2340);
  background-size: 200% 100%;
  animation: shimmer 4s linear infinite;
  color: white;
  border-radius: 8px;
  padding: 4mm 5mm;
  margin: 4mm 0 6mm;
  font-size: 9.5pt;
}
.login-flow ol {
  margin: 2mm 0 0;
  padding-left: 5mm;
}
.login-flow li { margin-bottom: 1.5mm; }
`;

function credCardsHtml() {
  return PROFILES.map((p, i) => `
<article class="cred-card" style="border-color:${esc(p.color)};background:${esc(p.colorLight)};animation-delay:${i * 0.08}s">
  <div class="role-head">
    <span class="role-icon">${p.icon}</span>
    <span class="role-title">${esc(p.role)}</span>
  </div>
  <dl>
    <div class="cred-row"><dt>Login</dt><dd>${esc(p.login)}</dd></div>
    <div class="cred-row"><dt>Password</dt><dd>${esc(p.password)}</dd></div>
    <div class="cred-row"><dt>Portal</dt><dd>${esc(p.portal)}</dd></div>
  </dl>
</article>`).join('');
}

function profileSectionHtml(p) {
  const steps = p.steps
    .map((s) => `<li>${s}</li>`)
    .join('');
  const tips = p.tips.map((t) => `<li>${esc(t)}</li>`).join('');
  return `
<section class="profile-section" id="${esc(p.id)}">
  <div class="profile-header" style="background:linear-gradient(135deg,${esc(p.color)},${esc(p.color)}dd)">
    <span class="big-icon">${p.icon}</span>
    <div>
      <h2>${esc(p.role)} — Staff Guide</h2>
      <p>${esc(p.summary)}</p>
    </div>
  </div>
  <div class="cred-banner">
    <div>Login<strong>${esc(p.login)}</strong></div>
    <div>Password<strong>${esc(p.password)}</strong></div>
    <div>Main screen<strong>${esc(p.hub)}</strong></div>
  </div>
  <h3 class="subsection">Daily workflow</h3>
  <ol class="step-row step-anim">${steps}</ol>
  <h3 class="subsection">Tips &amp; reminders</h3>
  <ul class="tip-list">${tips}</ul>
</section>`;
}

function buildRoleProfilesUserGuideHtml() {
  const b = brand;
  const tocItems = PROFILES.map(
    (p, i) => `<li><a href="#${esc(p.id)}">${i + 2}. ${esc(p.role)} (${esc(p.login)})</a></li>`
  ).join('');

  const body = `
<style>${PREMIUM_CSS}${GUIDE_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'Role Profiles User Guide',
  title: 'How to Use ZAIZENS HMS',
  subtitle: 'Step-by-step guides for Cashier, Doctor, Nurse, Radiologist, Lab Technician, and Pharmacist — with demo login credentials.',
  badge: 'Demo Training Edition',
  variant: 'role-profiles-guide',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)}</strong> Role Profiles User Guide. This document explains how each clinical and operations role uses the hospital system day to day. Use the credentials below to sign in and practice each workflow on the demo installation.</p>

<div class="login-flow">
  <strong>🔐 Signing in (all roles)</strong>
  <ol>
    <li>Open your HMS URL (demo: <code>http://localhost:3004</code>).</li>
    <li>Enter your <strong>username</strong> and <strong>password</strong> from the table below.</li>
    <li>Usernames are <strong>not case-sensitive</strong> — <code>lariza</code> and <code>Lariza</code> both work.</li>
    <li>After login you are taken to your role portal; use the sidebar or app launcher to open modules.</li>
    <li>Always <strong>sign out</strong> on shared computers when finished.</li>
  </ol>
</div>

<h2 class="section" id="credentials">Demo credentials</h2>
<div class="cred-grid">${credCardsHtml()}</div>

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#credentials">Demo credentials</a></li>
${tocItems}
<li><a href="#shared">Shared navigation</a></li>
<li><a href="#support">Support &amp; troubleshooting</a></li>
</ol>
</div>

${PROFILES.map(profileSectionHtml).join('')}

${section('shared', 'Shared navigation', `
<h3>Apps launcher</h3>
<p>Click the <strong>grid icon</strong> (top-left) to open the visual app launcher — switch between modules without returning to your portal.</p>
<h3>HMS Hub</h3>
<p><code>/hms</code> shows today's KPIs: OPD queue, appointments, IPD census, and shortcut cards to major modules.</p>
<h3>Patient chart</h3>
<p>From almost any list, open a patient to view the full chart: demographics, vitals, consultations, orders, prescriptions, and documents.</p>
<h3>Language</h3>
<p>Switch between <strong>English</strong> and <strong>Français</strong> using the language control in the header where available.</p>
<h3>Workflow guides (in-app)</h3>
<p>After login, visit <code>/workflow-guides</code> for additional role-scoped step-by-step flows inside the application.</p>
`)}

${section('support', 'Support & troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>What to do</th></tr>
<tr><td>Invalid username or password</td><td>Check credentials table — usernames are case-insensitive; passwords are case-sensitive.</td></tr>
<tr><td>Menu item missing</td><td>Your role may lack permission — contact the system administrator.</td></tr>
<tr><td>Lab/Radiology/Pharmacy won't process</td><td>Patient likely needs Cashier payment first — verify payment code status.</td></tr>
<tr><td>Wallet payment fails</td><td>Patient needs a wallet account and sufficient balance — use Cash Top-up at Cashier.</td></tr>
<tr><td>Session expired</td><td>Sign in again; unsaved work may be lost — save frequently.</td></tr>
</table>
<div class="warn"><strong>Security:</strong> Demo passwords are for training only. Change all credentials before production use. Never share your login with colleagues.</div>
`)}

<div class="footer-note">
  ${esc(b.name)} · Role Profiles User Guide · ${esc(b.facilityName)} · Generated for demo training.
  Interactive HTML version supports animations; PDF captures colour icons and layout.
</div>
</div>`;

  return wrapPremiumDoc({
    title: 'ZAIZENS HMS — Role Profiles User Guide',
    variant: 'role-profiles-guide',
    bodyHtml: body,
  });
}

module.exports = { buildRoleProfilesUserGuideHtml, PROFILES };
