'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');
const { PROFILES } = require('./hmsRoleGuideContent');
const { getScreenMockup } = require('./hmsGuideScreenMockups');
const { screenshotFigure } = require('./guideScreenshotCapture');

const GUIDE_EXTRA_CSS = `
:root[data-doc="role-profiles-guide"] {
  --accent: #0c8b8b;
  --accent-light: #ccfbf1;
}
@keyframes pulse-ring {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.06); opacity: 0.88; }
}
@keyframes fade-up {
  from { opacity: 0; transform: translateY(3mm); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.screen {
  border: 1px solid var(--line); border-radius: 8px; overflow: hidden;
  margin: 2mm 0 4mm; break-inside: avoid; box-shadow: 0 2px 8px rgba(15,23,42,0.1);
}
.screen-bar {
  color: rgba(255,255,255,0.95); padding: 2.5mm 3.5mm; font-size: 8pt;
  display: flex; align-items: center; gap: 2mm;
}
.screen-bar .dot { width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #fca5a5; flex-shrink: 0; }
.screen-bar .dot:nth-child(2) { background: #fcd34d; }
.screen-bar .dot:nth-child(3) { background: #86efac; }
.screen-title { font-weight: 600; margin-left: 1mm; }
.screen-body { background: #f8fafc; padding: 4mm; }
.guide-screen { margin: 3mm 0 5mm; break-inside: avoid; }
.guide-screen-cap {
  font-size: 8.5pt; font-weight: 700; color: var(--navy-mid);
  margin-bottom: 1.5mm; display: flex; align-items: center; gap: 2mm;
}
.live-badge {
  font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  background: #d1fae5; color: #065f46; padding: 0.5mm 2mm; border-radius: 99px;
}
.guide-screenshot {
  width: 100%; max-height: 95mm; object-fit: cover; object-position: top left;
  border: 1px solid var(--line); border-radius: 8px;
  box-shadow: 0 2px 10px rgba(15,23,42,0.12);
}
.cred-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm; margin: 4mm 0 6mm;
}
.cred-card {
  border-radius: 8px; padding: 3.5mm 4mm; border: 2px solid var(--line);
  break-inside: avoid; animation: fade-up 0.5s ease-out both;
}
.cred-card .role-head { display: flex; align-items: center; gap: 3mm; margin-bottom: 2mm; }
.cred-card .role-icon { font-size: 22pt; animation: pulse-ring 2.5s ease-in-out infinite; }
.cred-card .role-title { font-size: 11pt; font-weight: 800; color: var(--ink); }
.cred-row { display: flex; gap: 2mm; font-size: 9pt; margin: 1mm 0; }
.cred-row dt { font-weight: 700; min-width: 18mm; color: var(--muted); }
.cred-row dd { margin: 0; font-family: ui-monospace, Consolas, monospace; font-weight: 700; color: var(--navy); }
.profile-section { page-break-before: always; break-before: page; }
.profile-header {
  display: flex; align-items: center; gap: 4mm; padding: 4mm 5mm;
  border-radius: 8px; margin-bottom: 4mm; color: white;
}
.profile-header .big-icon { font-size: 28pt; animation: pulse-ring 2s ease-in-out infinite; }
.profile-header h2 { margin: 0; font-size: 16pt; color: white; border: none; padding: 0; }
.profile-header p { margin: 1mm 0 0; font-size: 9pt; opacity: 0.92; }
.workflow-block { margin: 5mm 0 6mm; break-inside: avoid-page; }
.workflow-block h3 {
  font-size: 11pt; color: var(--navy); border-left: 4px solid var(--accent);
  padding-left: 3mm; margin: 0 0 2mm;
}
.workflow-block .intro { font-size: 9pt; color: var(--muted); margin-bottom: 2mm; }
.step-row {
  counter-reset: step; list-style: none; padding: 0; margin: 2mm 0 3mm;
}
.step-row li {
  counter-increment: step; margin: 0 0 2mm; padding: 2.5mm 3mm 2.5mm 9mm;
  position: relative; background: var(--surface); border: 1px solid var(--line);
  border-radius: 4px; font-size: 9pt; break-inside: avoid;
  animation: fade-up 0.45s ease-out both;
}
.step-row li::before {
  content: counter(step); position: absolute; left: 2.5mm; top: 2.5mm;
  width: 5mm; height: 5mm; border-radius: 50%; background: var(--accent);
  color: white; font-size: 7pt; font-weight: 700; text-align: center; line-height: 5mm;
}
.screen-gallery { display: grid; grid-template-columns: 1fr; gap: 3mm; }
.login-flow {
  background: linear-gradient(90deg, #0c2340, #0c8b8b, #0c2340);
  background-size: 200% 100%; animation: shimmer 5s linear infinite;
  color: white; border-radius: 8px; padding: 4mm 5mm; margin: 4mm 0 6mm; font-size: 9.5pt;
}
.login-flow ol { margin: 2mm 0 0; padding-left: 5mm; }
.cross-flow {
  background: var(--surface); border: 1px solid var(--line); border-radius: 6px;
  padding: 4mm; margin: 4mm 0; font-family: ui-monospace, monospace; font-size: 8pt;
  white-space: pre-wrap; line-height: 1.5;
}
`;

function screenFigure(screenKey, caption) {
  const mockup = getScreenMockup(screenKey);
  const filename = `${screenKey}.png`;
  return screenshotFigure(filename, caption || screenKey, mockup);
}

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

function workflowHtml(wf, accent) {
  const steps = wf.steps.map((s) => `<li>${s}</li>`).join('');
  const screens = (wf.screens || [])
    .map((key, idx) => screenFigure(key, wf.screenCaptions?.[idx] || key.replace(/-/g, ' ')))
    .join('');
  return `
<div class="workflow-block">
  <h3 style="border-color:${esc(accent)}">${esc(wf.title)}</h3>
  <p class="intro">${wf.intro}</p>
  <ol class="step-row">${steps}</ol>
  <div class="screen-gallery">${screens}</div>
</div>`;
}

function profileSectionHtml(p) {
  const workflows = (p.workflows || []).map((wf) => workflowHtml(wf, p.color)).join('');
  const trouble = (p.troubleshooting || [])
    .map(([issue, fix]) => `<tr><td>${esc(issue)}</td><td>${esc(fix)}</td></tr>`)
    .join('');

  return `
<section class="profile-section" id="${esc(p.id)}">
  <div class="profile-header" style="background:linear-gradient(135deg,${esc(p.color)},${esc(p.color)}cc)">
    <span class="big-icon">${p.icon}</span>
    <div>
      <h2>${esc(p.role)} — Comprehensive Guide</h2>
      <p>${esc(p.summary)}</p>
      <p style="margin-top:2mm"><strong>Login:</strong> ${esc(p.login)} · <strong>Password:</strong> ${esc(p.password)} · <strong>Hub:</strong> <code>${esc(p.hub)}</code></p>
    </div>
  </div>
  ${workflows}
  ${trouble ? `<h3 class="subsection">Troubleshooting</h3><table class="data">${trouble}</table>` : ''}
</section>`;
}

function buildRoleProfilesUserGuideHtml() {
  const b = brand;
  const tocItems = PROFILES.map(
    (p, i) => `<li><a href="#${esc(p.id)}">${i + 2}. ${esc(p.role)} — ${esc(p.login)} (${(p.workflows || []).length} workflows)</a></li>`
  ).join('');

  const body = `
<style>${GUIDE_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'Comprehensive Role Profiles User Guide',
  title: 'How to Use ZAIZENS HMS',
  subtitle: 'Full workflows with screenshots for Cashier, Doctor, Nurse, Radiologist, Lab Technician, and Pharmacist — demo training edition.',
  badge: 'Illustrated · Screenshot Edition',
  variant: 'role-profiles-guide',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>This <strong>Comprehensive Role Profiles User Guide</strong> covers every major workflow for the six demo staff profiles. Each section includes step-by-step instructions and <strong>screenshots</strong> (live captures when HMS is running during generation, plus illustrated UI references otherwise).</p>

<div class="login-flow">
  <strong>🔐 Signing in</strong>
  <ol>
    <li>Open <code>http://localhost:3004</code> (or your deployed HMS URL).</li>
    <li>Enter username and password from the credentials table — usernames are <strong>case-insensitive</strong>.</li>
    <li>Passwords are case-sensitive (demo: <code>12345</code>).</li>
    <li>Use the app launcher (grid icon) and sidebar to switch modules.</li>
  </ol>
</div>

${screenFigure('login', 'Login screen')}

<h2 class="section" id="hospital-flow">Hospital-wide patient flow</h2>
<div class="cross-flow">Registration / OPD queue
  → Nurse triage &amp; vitals
  → Doctor consultation &amp; orders
  → Cashier payment &amp; codes (LAB / RAD / PHARM)
  → Lab · Radiology · Pharmacy process paid orders
  → Results &amp; medications on patient chart</div>

<h2 class="section" id="credentials">Demo credentials</h2>
<div class="cred-grid">${credCardsHtml()}</div>

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#credentials">Demo credentials</a></li>
<li><a href="#hospital-flow">Hospital-wide flow</a></li>
${tocItems}
<li><a href="#shared">Shared navigation</a></li>
<li><a href="#support">Support</a></li>
</ol>
</div>

${PROFILES.map(profileSectionHtml).join('')}

${section('shared', 'Shared navigation', `
<h3>Apps launcher &amp; HMS Hub</h3>
<p>Grid icon (top-left) opens all applications. <code>/hms</code> shows today's clinical KPIs.</p>
<h3>Patient chart</h3>
<p>Full history at <code>/patient/:id</code> — vitals, consultations, orders, results, prescriptions.</p>
<h3>In-app guides</h3>
<p>Visit <code>/workflow-guides</code> and <code>/user-manual</code> after login for additional role-scoped help.</p>
<h3>Regenerating this guide with live screenshots</h3>
<p>Start HMS (<code>npm start</code>), then run <code>npm run build:role-profiles-guide</code>. The build captures authenticated pages for each demo user when the server is reachable.</p>
`)}

${section('support', 'Support & security', `
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Invalid login</td><td>Check credentials table; username case does not matter</td></tr>
<tr><td>Module missing</td><td>Role permissions — contact administrator</td></tr>
<tr><td>Lab/Rad/Pharm blocked</td><td>Patient must pay at Cashier first</td></tr>
<tr><td>Screenshots show mockups only</td><td>Run guide build while HMS is running on port 3004</td></tr>
</table>
<div class="warn"><strong>Demo only:</strong> Change all passwords before production. Never share credentials.</div>
`)}

<div class="footer-note">
  ${esc(b.name)} · Comprehensive Role Profiles User Guide · ${esc(b.facilityName)}
</div>
</div>`;

  return wrapPremiumDoc({
    title: 'ZAIZENS HMS — Comprehensive Role Profiles User Guide',
    variant: 'role-profiles-guide',
    bodyHtml: body,
  });
}

module.exports = { buildRoleProfilesUserGuideHtml, PROFILES };
