'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const MATERNITY_EXTRA_CSS = `
:root[data-doc="maternity-manual"] {
  --accent: #9d174d;
  --accent-light: #fdf2f8;
  --mat-rose: #9d174d;
  --mat-rose-dark: #831843;
  --mat-pink: #ec4899;
  --mat-green: #16a34a;
  --mat-amber: #d97706;
  --mat-red: #dc2626;
}
.role-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 4mm 0 5mm;
}
.role-card {
  border-radius: 6px; padding: 3mm 4mm; border: 1px solid var(--line); break-inside: avoid;
}
.role-card .icon { font-size: 16pt; line-height: 1; margin-bottom: 1.5mm; }
.role-card strong { display: block; font-size: 9pt; color: var(--ink); margin-bottom: 1mm; }
.role-card span { font-size: 8pt; color: var(--muted); line-height: 1.35; }
.wf-strip { display: flex; flex-wrap: wrap; gap: 2mm; margin: 4mm 0; }
.wf-chip {
  flex: 1 1 24mm; min-width: 20mm; text-align: center; border-radius: 4px;
  padding: 2mm 1.5mm; font-size: 7pt; font-weight: 600;
  border: 1px solid rgba(0,0,0,0.08); break-inside: avoid;
}
.wf-chip .n {
  display: inline-block; width: 4.5mm; height: 4.5mm; line-height: 4.5mm;
  border-radius: 50%; background: var(--mat-rose-dark); color: white; font-size: 6.5pt; margin-bottom: 1mm;
}
.phase-banner {
  background: linear-gradient(90deg, #fdf2f8 0%, transparent 100%);
  border-left: 4px solid var(--mat-rose);
  padding: 2.5mm 4mm; margin: 4mm 0 3mm;
  font-size: 9pt; font-weight: 700; color: var(--mat-rose-dark);
  letter-spacing: 0.04em; text-transform: uppercase;
}
.screen {
  border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  margin: 4mm 0 5mm; break-inside: avoid; box-shadow: 0 1px 4px rgba(131,24,67,0.08);
}
.screen-bar {
  background: linear-gradient(90deg, #831843, #9d174d);
  color: rgba(255,255,255,0.92); padding: 2mm 3mm; font-size: 8pt;
  display: flex; align-items: center; gap: 2mm;
}
.screen-bar .dot { width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #fbcfe8; }
.screen-bar .dot:nth-child(2) { background: #fcd34d; }
.screen-bar .dot:nth-child(3) { background: #86efac; }
.screen-body { background: #fdf2f8; padding: 4mm; }
.chart-tab {
  display: inline-block; font-size: 7.5pt; padding: 1mm 2.5mm; margin: 0.5mm;
  border-radius: 3px; background: white; border: 1px solid #f9a8d4;
}
.chart-tab.active { background: #831843; color: white; border-color: #831843; }
.step-row {
  counter-reset: step; list-style: none; padding: 0; margin: 3mm 0;
}
.step-row li {
  counter-increment: step; margin: 0 0 2.5mm; padding: 2.5mm 3mm 2.5mm 9mm;
  position: relative; background: var(--surface); border: 1px solid var(--line);
  border-radius: 3px; font-size: 9pt; break-inside: avoid;
}
.step-row li::before {
  content: counter(step); position: absolute; left: 2.5mm; top: 2.5mm;
  width: 5mm; height: 5mm; border-radius: 50%; background: var(--mat-rose);
  color: white; font-size: 7pt; font-weight: 700; text-align: center; line-height: 5mm;
}
.perm-pill {
  display: inline-block; font-size: 7pt; font-family: ui-monospace, monospace;
  background: #f1f5f9; padding: 0.5mm 2mm; border-radius: 2px; margin: 0.5mm;
}
.hero-img { width: 100%; max-height: 45mm; object-fit: cover; border-radius: 4px; margin: 3mm 0; }
.risk-pill {
  display: inline-block; font-size: 7pt; font-weight: 700; padding: 0.5mm 2mm;
  border-radius: 99px; text-transform: uppercase;
}
.risk-pill.low { background: #dcfce7; color: #166534; }
.risk-pill.medium { background: #fef3c7; color: #92400e; }
.risk-pill.high { background: #fee2e2; color: #991b1b; }
`;

function buildMaternityUsersManualHtml() {
  const b = brand;
  const body = `
<style>${PREMIUM_CSS}${MATERNITY_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'Maternity User Manual',
  title: 'Maternity & Antenatal Care (ANC)',
  subtitle: 'Complete staff guide — ANC registry, obstetric chart, labor ward, WHO partograph, delivery, newborn registration, postnatal care, and billing.',
  badge: 'Premium · Professional Edition',
  variant: 'maternity-manual',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)} Maternity User Manual</strong>. This document covers the full obstetric pathway — from first ANC booking through antenatal visits, labor monitoring, delivery, newborn care, and postnatal follow-up.</p>
<div class="tip"><strong>Module scope:</strong> Obstetrics &amp; gynaecology — ANC registry, maternity charts, labor ward, partograph, delivery documentation, neonatal linkage, and maternity billing tariffs.</div>

<div class="kpi-row">
  <div class="kpi"><strong>9</strong><span>Chart tabs</span></div>
  <div class="kpi"><strong>3</strong><span>Risk levels</span></div>
  <div class="kpi"><strong>98+</strong><span>Maternity services</span></div>
</div>

<img class="hero-img" src="public/call-queue/photos/maternity.jpg" alt="Maternity care" />

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#overview">Maternity overview &amp; roles</a></li>
<li><a href="#workflow">Care pathway</a></li>
<li><a href="#dashboard">Dashboard &amp; navigation</a></li>
<li><a href="#registration">ANC registration</a></li>
<li><a href="#chart">Maternity chart</a></li>
<li><a href="#anc-visits">ANC visits</a></li>
<li><a href="#risk">Risk assessment</a></li>
<li><a href="#ultrasound">Ultrasound scans</a></li>
<li><a href="#labor">Labor ward &amp; partograph</a></li>
<li><a href="#delivery">Delivery &amp; newborn</a></li>
<li><a href="#postnatal">Postnatal care</a></li>
<li><a href="#complications">Complications</a></li>
<li><a href="#billing">Billing &amp; MAT tickets</a></li>
<li><a href="#nicu">NICU &amp; pediatric linkage</a></li>
<li><a href="#screens">Screen reference</a></li>
<li><a href="#troubleshooting">Troubleshooting</a></li>
<li><a href="#glossary">Glossary</a></li>
</ol>
</div>

${section('overview', '1. Maternity Overview & Roles', `
<p>The <strong>Maternity module</strong> manages antenatal, intrapartum, and postnatal care with integrated billing, IPD admission, and newborn registration.</p>

<div class="role-grid">
  <div class="role-card" style="background:#fdf2f8;border-color:#f9a8d4">
    <div class="icon">👩‍⚕️</div>
    <strong>Obstetrician / Doctor</strong>
    <span>ANC reviews, risk scoring, scans, labor management, delivery, complications</span>
  </div>
  <div class="role-card" style="background:#fce7f3;border-color:#f9a8d4">
    <div class="icon">🩺</div>
    <strong>Midwife / Nurse</strong>
    <span>ANC vitals, partograph entries, delivery assistance, postnatal checks</span>
  </div>
  <div class="role-card" style="background:#ede9fe;border-color:#c4b5fd">
    <div class="icon">🖥</div>
    <strong>Front Desk</strong>
    <span>Link HMS patient, book ANC, route to cashier for MAT tariffs</span>
  </div>
  <div class="role-card" style="background:#d1fae5;border-color:#6ee7b7">
    <div class="icon">💳</div>
    <strong>Cashier</strong>
    <span>ANC booking fees, delivery charges, postnatal visits — MAT payment codes</span>
  </div>
  <div class="role-card" style="background:#cffafe;border-color:#67e8f9">
    <div class="icon">🔬</div>
    <strong>Lab / Ultrasound</strong>
    <span>ANC labs (Hb, HIV, blood group), anomaly scans, Doppler</span>
  </div>
  <div class="role-card" style="background:#fef3c7;border-color:#fcd34d">
    <div class="icon">🛏️</div>
    <strong>ADT / Ward</strong>
    <span>Labor ward admission, maternity bed assignment, NICU pediatric beds</span>
  </div>
</div>

<h3>Key URLs</h3>
<table class="data">
<tr><th>Screen</th><th>Path</th><th>Roles</th></tr>
<tr><td>Maternity dashboard</td><td><code>/maternity</code></td><td>All maternity staff</td></tr>
<tr><td>ANC registry</td><td><code>/maternity/patients</code></td><td>Doctor, Nurse, Front Desk</td></tr>
<tr><td>ANC booking</td><td><code>/maternity/register</code></td><td>Front Desk, Nurse</td></tr>
<tr><td>Maternity chart</td><td><code>/maternity/chart/:id</code></td><td>Doctor, Midwife</td></tr>
<tr><td>Labor ward</td><td><code>/maternity/labor</code></td><td>Midwife, Doctor</td></tr>
<tr><td>Patient chart tab</td><td>Clinical chart → Maternity</td><td>All clinical</td></tr>
<tr><td>Death registry</td><td><code>/maternity/death-registry</code></td><td>Doctor, Admin</td></tr>
</table>

<div class="note"><strong>Permissions:</strong> <span class="perm-pill">maternity.read</span> <span class="perm-pill">maternity.write</span> <span class="perm-pill">clinical.write</span> <span class="perm-pill">nursing.write</span></div>
`)}

${section('workflow', '2. Maternity Care Pathway', `
<p>The standard obstetric journey through the HMS maternity module:</p>

<div class="wf-strip">
  <div class="wf-chip" style="background:#fdf2f8"><span class="n">1</span><br/>📋 ANC<br/>Registration</div>
  <div class="wf-chip" style="background:#fce7f3"><span class="n">2</span><br/>🩺 Routine<br/>ANC visits</div>
  <div class="wf-chip" style="background:#fef3c7"><span class="n">3</span><br/>📡 Ultrasound<br/>&amp; labs</div>
  <div class="wf-chip" style="background:#fee2e2"><span class="n">4</span><br/>⚠ Risk<br/>Assessment</div>
  <div class="wf-chip" style="background:#ede9fe"><span class="n">5</span><br/>🛏️ Labor<br/>Admission</div>
  <div class="wf-chip" style="background:#fdf2f8"><span class="n">6</span><br/>📈 Partograph<br/>Monitoring</div>
  <div class="wf-chip" style="background:#fce7f3"><span class="n">7</span><br/>👶 Delivery<br/>&amp; newborn</div>
  <div class="wf-chip" style="background:#d1fae5"><span class="n">8</span><br/>💊 Postnatal<br/>Care</div>
</div>

<div class="flow">ANC Registration (G/P/A, LMP, EDD) → Routine ANC visits (vitals, FHR, Hb)
→ Ultrasound &amp; risk scoring → Admit to labor ward → WHO partograph
→ Record delivery → Register newborn → Postnatal visits → [NICU if required]</div>

<h3>Integration with other modules</h3>
<ul>
<li><strong>OPD</strong> — pediatric assessment for newborn; follow-up consultations</li>
<li><strong>IPD</strong> — labor ward admission, maternity beds, NICU pediatric ward</li>
<li><strong>Emergency</strong> — emergency labor with pay-later deposit option</li>
<li><strong>Cashier</strong> — MAT module payment tickets and maternity service catalog</li>
</ul>
`)}

${section('dashboard', '3. Dashboard & Navigation', `
<p>The <strong>Maternity dashboard</strong> at <code>/maternity</code> shows:</p>
<ul>
<li><strong>Registered</strong> — total maternity patients</li>
<li><strong>Active ANC</strong> — ongoing pregnancies</li>
<li><strong>In labor</strong> — active labor ward patients</li>
<li><strong>Deliveries today</strong> — births recorded today</li>
</ul>

<h3>Quick links</h3>
<table class="data">
<tr><th>Link</th><th>Purpose</th></tr>
<tr><td>Registry</td><td>Full ANC patient list with filters</td></tr>
<tr><td>New ANC booking</td><td>Register new pregnancy</td></tr>
<tr><td>Labor ward</td><td>Active labors and partograph</td></tr>
<tr><td>Death registry</td><td>Maternal/neonatal mortality</td></tr>
</table>

<h3>High-risk panel</h3>
<p>Dashboard highlights <strong>high-risk ANC</strong> patients (risk score ≥ 20) sorted by EDD for proactive management.</p>
`)}

${section('registration', '4. ANC Registration', `
<h3>Book new ANC</h3>
<ol class="step-row">
<li>Open <code>/maternity/register</code> or <strong>Book ANC</strong> from dashboard.</li>
<li>Link existing HMS patient (Patient directory → <code>?from=maternity</code>) or enter Patient ID.</li>
<li>Enter obstetric history: <strong>Gravida, Para, Abortions</strong>.</li>
<li>Record <strong>LMP</strong> — system calculates <strong>EDD</strong> (Naegele rule: LMP + 280 days).</li>
<li>Blood group, HIV status, PMTCT enrollment if applicable.</li>
<li>Save — system assigns <strong>ANC number</strong> (e.g. ANC-2026-0001).</li>
<li>Redirect to maternity chart for first visit.</li>
</ol>

<div class="tip"><strong>First visit:</strong> ANC booking visit tariff applies automatically. Collect payment at cashier or defer per hospital policy.</div>
`)}

${section('chart', '5. Maternity Chart', `
<p>Each pregnancy has a dedicated chart at <code>/maternity/chart/:id</code> with tabs:</p>

<div style="margin:3mm 0">
<span class="chart-tab active">ANC visits</span>
<span class="chart-tab">Risk</span>
<span class="chart-tab">Ultrasound</span>
<span class="chart-tab">Labor</span>
<span class="chart-tab">Delivery</span>
<span class="chart-tab">Newborn</span>
<span class="chart-tab">Postnatal</span>
<span class="chart-tab">Complications</span>
</div>

<h3>Chart header</h3>
<p>Displays ANC number, patient name, LMP, EDD, EGA (weeks), and risk level badge (<span class="risk-pill low">Low</span> <span class="risk-pill medium">Medium</span> <span class="risk-pill high">High</span>).</p>

<p>From the chart: admit to labor, record delivery, register newborn, open linked IPD admission, collect MAT payments, and document complications.</p>
`)}

${section('anc-visits', '6. ANC Visits', `
<h3>Record routine ANC visit</h3>
<ol class="step-row">
<li>Open chart → <strong>ANC visits</strong> tab.</li>
<li>Enter visit date — EGA auto-calculated from LMP.</li>
<li>Record: weight, BP (sys/dia), fetal heart rate (FHR), Hb, presentation.</li>
<li>Schedule next visit date; add clinical notes.</li>
<li>Save visit — appears in visit history table.</li>
</ol>

<h3>Visit history</h3>
<p>Table shows date, EGA, BP, FHR, Hb for trend monitoring across pregnancy.</p>

<h3>Clinical integration</h3>
<p>ANC vitals sync to patient clinical chart. Maternity episode visible on patient chart Maternity tab.</p>
`)}

${section('risk', '7. Risk Assessment', `
<p>WHO-style simplified risk scoring on the <strong>Risk</strong> tab:</p>

<h3>Risk factors (examples)</h3>
<ul>
<li>Age under 18 or over 35</li>
<li>Grand multipara, previous caesarean section</li>
<li>Previous PPH or stillbirth</li>
<li>Hypertension, diabetes, severe anemia</li>
<li>HIV positive (PMTCT pathway)</li>
<li>Multiple pregnancy, malpresentation, placenta previa</li>
<li>Pre-eclampsia, inadequate ANC attendance</li>
</ul>

<h3>Scoring</h3>
<table class="data">
<tr><th>Score</th><th>Level</th><th>Action</th></tr>
<tr><td>&lt; 10</td><td><span class="risk-pill low">Low</span></td><td>Routine ANC schedule</td></tr>
<tr><td>10–19</td><td><span class="risk-pill medium">Medium</span></td><td>Increased monitoring, specialist review</td></tr>
<tr><td>≥ 20</td><td><span class="risk-pill high">High</span></td><td>Dashboard alert, delivery planning, hospital birth</td></tr>
</table>

<p>Document action plan and save assessment. Review at each ANC visit.</p>
`)}

${section('ultrasound', '8. Ultrasound Scans', `
<p>Record scans on the <strong>Ultrasound</strong> tab:</p>
<ul>
<li><strong>Scan types:</strong> Dating, Anomaly (20–24 weeks), Growth, Doppler</li>
<li>Findings, placenta location, amniotic fluid index (AFI)</li>
<li>Anomaly detected flag for referral pathway</li>
</ul>
<p>Scan history table tracks all obstetric ultrasounds with type and anomaly status.</p>
`)}

${section('labor', '9. Labor Ward & Partograph', `
<div class="phase-banner">Step 1 — Admit to labor ward</div>
<ol class="step-row">
<li>Chart → <strong>Labor</strong> tab when patient in active labor.</li>
<li>Enter admission type, EGA, cervical dilation (cm).</li>
<li>Option: <strong>Create IPD admission</strong> (Maternity Ward) — auto-assign bed when available.</li>
<li><strong>Pay later</strong> — defer HOS payment for emergency labor.</li>
<li>Submit <strong>Admit &amp; open partograph</strong>.</li>
</ol>

<div class="phase-banner">Step 2 — WHO partograph monitoring</div>
<p>At <code>/maternity/labor</code>, select active labor from sidebar:</p>
<ul>
<li>Record time, dilation, station, contractions (/10 min), FHR, BP</li>
<li>System flags <strong>alert line</strong> and <strong>action line</strong> crossings</li>
<li>Timeline table shows all partograph entries</li>
</ul>

<p>Active labors list on dashboard and labor ward page for shift handover.</p>
`)}

${section('delivery', '10. Delivery & Newborn Registration', `
<div class="phase-banner">Step 2 — Record delivery</div>
<ol class="step-row">
<li>From chart <strong>Delivery</strong> tab or labor ward → Record delivery.</li>
<li>Delivery type: SVD, vacuum, forceps, emergency/elective CS, breech.</li>
<li>Outcome, estimated blood loss (ml), date/time.</li>
<li>Save delivery record — triggers billing catalog mapping.</li>
</ol>

<div class="phase-banner">Step 3 — Register newborn</div>
<ol class="step-row">
<li><strong>Newborn</strong> tab — sex, birth weight, APGAR 1 and 5 min.</li>
<li>Birth outcome: alive, fresh stillbirth.</li>
<li>Birth immunizations: Vit K, BCG, Hep B; breastfeeding initiated.</li>
<li>Create HMS patient record for baby; link to mother chart.</li>
<li>Option: <strong>NICU admission</strong> (Pediatric Ward IPD) with pay-later for prematurity/RDS.</li>
<li><strong>Pediatric OPD</strong> assessment for well newborn follow-up.</li>
</ol>
`)}

${section('postnatal', '11. Postnatal Care', `
<p><strong>Postnatal</strong> tab documents:</p>
<ul>
<li>Routine postnatal visits (Day 1, Day 7, Week 6)</li>
<li>Maternal recovery assessment</li>
<li>Infant feeding and umbilical care</li>
<li>Contraception counseling</li>
<li>MAT tariff: Postnatal Visit — Routine</li>
</ul>
<p>Update maternity patient status to <strong>Delivered</strong> when episode complete.</p>
`)}

${section('complications', '12. Complications', `
<p>Document on <strong>Complications</strong> tab:</p>
<table class="data">
<tr><th>Complication</th><th>Documentation</th></tr>
<tr><td>PPH</td><td>Postpartum hemorrhage — blood loss, interventions</td></tr>
<tr><td>Pre-eclampsia / eclampsia</td><td>Severity, magnesium, delivery timing</td></tr>
<tr><td>Sepsis</td><td>Source, antibiotics, ICU transfer</td></tr>
<tr><td>Obstructed labor</td><td>Partograph action line, CS decision</td></tr>
</table>
<p>Link to <strong>Death registry</strong> for maternal or neonatal mortality.</p>
`)}

${section('billing', '13. Billing & MAT Tickets', `
<p>Maternity module integrates with Service Catalog maternity tariff (98+ services):</p>
<ul>
<li><strong>ANC booking</strong> — first visit</li>
<li><strong>ANC routine</strong> — follow-up visits</li>
<li><strong>Labor ward admission</strong></li>
<li><strong>Delivery types</strong> — SVD, vacuum, forceps, CS (emergency/elective)</li>
<li><strong>Postnatal routine</strong></li>
<li><strong>NICU per day</strong></li>
<li>Neonatal items: BCG, OPV, incubator, phototherapy, kangaroo care</li>
</ul>

<h3>Chart billing panel</h3>
<p>Shows paid/due status, suggested tariffs for recorded events, MAT payment tickets on file. Route patient to cashier with payment code.</p>
`)}

${section('nicu', '14. NICU & Pediatric Linkage', `
<p>For infants requiring intensive care:</p>
<ol class="step-row">
<li>After delivery registration, choose <strong>NICU admission</strong>.</li>
<li>System creates pediatric IPD admission on available NICU/pediatric bed.</li>
<li>Neonatal catalog charges (incubator, phototherapy) bill to baby patient.</li>
<li>Mother and baby charts cross-linked on patient records.</li>
<li>Emergency labor may use <strong>pay later</strong> for both mother IPD and baby NICU deposits.</li>
</ol>
`)}

${section('screens', '15. Screen Reference (UI)', `
<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Maternity Dashboard — /maternity</div>
  <div class="screen-body">
    <div style="font-size:8pt;font-weight:700;color:#831843;margin-bottom:2mm">Obstetrics &amp; gynaecology</div>
    <div class="kpi-row" style="margin:0 0 3mm">
      <div class="kpi" style="padding:2mm"><strong style="font-size:11pt">142</strong><span style="font-size:6pt">Active ANC</span></div>
      <div class="kpi" style="padding:2mm"><strong style="font-size:11pt">3</strong><span style="font-size:6pt">In labor</span></div>
      <div class="kpi" style="padding:2mm"><strong style="font-size:11pt">5</strong><span style="font-size:6pt">Deliveries today</span></div>
    </div>
    <div style="font-size:8pt;font-weight:600;color:#991b1b;margin-bottom:1mm">High-risk ANC</div>
    <div style="background:white;border-left:3px solid #dc2626;padding:2mm;font-size:7.5pt;margin-bottom:1mm">ANC-2026-0042 · A. Ngu · EDD 15 Jul · <span class="risk-pill high">High</span></div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Maternity Chart — ANC-2026-0018</div>
  <div class="screen-body" style="font-size:8pt">
    <div style="margin-bottom:2mm">LMP 01 Sep 2025 · EDD 08 Jun 2026 · EGA 32w · <span class="risk-pill medium">Medium</span></div>
    <span class="chart-tab active">ANC</span><span class="chart-tab">Risk</span><span class="chart-tab">Scans</span><span class="chart-tab">Labor</span><span class="chart-tab">Delivery</span><span class="chart-tab">Newborn</span>
    <table class="data" style="margin-top:2mm;font-size:7pt">
    <tr><th>Date</th><th>EGA</th><th>BP</th><th>FHR</th><th>Hb</th></tr>
    <tr><td>14 Jun</td><td>32w</td><td>118/72</td><td>142</td><td>11.2</td></tr>
    </table>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Labor Ward — Partograph</div>
  <div class="screen-body" style="font-size:8pt">
    <strong>Active labor · Jane Doe · dilation 6 cm</strong>
    <table class="data" style="margin-top:2mm;font-size:7pt">
    <tr><th>Time</th><th>Dil.</th><th>Station</th><th>CTX</th><th>FHR</th><th>BP</th></tr>
    <tr><td>1430</td><td>4</td><td>-2</td><td>3/10</td><td>148</td><td>120/70</td></tr>
    <tr><td>1530</td><td>6</td><td>-1</td><td>4/10</td><td>140</td><td>118/72</td></tr>
    </table>
  </div>
</div>

<div class="tip"><strong>Live screenshots:</strong> Open <code>/maternity</code> while signed in; Print → Save as PDF for training materials.</div>
`)}

${section('troubleshooting', '16. Troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Cannot register ANC</td><td>Load HMS patient first; check maternity.write permission</td></tr>
<tr><td>EDD incorrect</td><td>Verify LMP date; ultrasound dating scan may override</td></tr>
<tr><td>High-risk not on dashboard</td><td>Save risk assessment with score ≥ 20; status must be active</td></tr>
<tr><td>Cannot admit labor</td><td>Use Labor tab on chart; complete admission form with dilation</td></tr>
<tr><td>Partograph empty</td><td>Select patient from Active labors sidebar on /maternity/labor</td></tr>
<tr><td>Delivery blocked</td><td>Admit to labor ward first (Step 1 before Step 2)</td></tr>
<tr><td>Newborn not linked</td><td>Complete delivery record before newborn registration</td></tr>
<tr><td>MAT ticket missing</td><td>Record clinical event; check billing panel for suggested tariff</td></tr>
<tr><td>NICU bed unavailable</td><td>Manual bed assignment on ward board; pay-later if configured</td></tr>
</table>
`)}

${section('glossary', '17. Glossary', `
<table class="data">
<tr><th>Term</th><th>Definition</th></tr>
<tr><td>ANC</td><td>Antenatal Care — pregnancy monitoring before birth</td></tr>
<tr><td>G/P/A</td><td>Gravida / Para / Abortions — obstetric history</td></tr>
<tr><td>LMP</td><td>Last Menstrual Period — start of pregnancy dating</td></tr>
<tr><td>EDD</td><td>Expected Date of Delivery (Naegele rule)</td></tr>
<tr><td>EGA</td><td>Estimated Gestational Age (weeks)</td></tr>
<tr><td>FHR</td><td>Fetal Heart Rate</td></tr>
<tr><td>Partograph</td><td>WHO labor monitoring chart (dilation, contractions, FHR)</td></tr>
<tr><td>PMTCT</td><td>Prevention of Mother-to-Child Transmission (HIV)</td></tr>
<tr><td>PPH</td><td>Postpartum Hemorrhage</td></tr>
<tr><td>SVD</td><td>Spontaneous Vaginal Delivery</td></tr>
<tr><td>CS</td><td>Caesarean Section</td></tr>
<tr><td>APGAR</td><td>Newborn vitality score at 1 and 5 minutes</td></tr>
<tr><td>NICU</td><td>Neonatal Intensive Care Unit</td></tr>
</table>
`)}

<p class="footer-note">© ${esc(new Date().getFullYear())} ${esc(b.name)} · Maternity Users Manual v2.0 · ${esc(b.facilityName || b.orgName)} · Confidential</p>
</div>`;

  return wrapPremiumDoc({
    title: `Maternity User Manual — ${b.productName}`,
    variant: 'maternity-manual',
    bodyHtml: body,
  });
}

module.exports = { buildMaternityUsersManualHtml, MATERNITY_EXTRA_CSS };
