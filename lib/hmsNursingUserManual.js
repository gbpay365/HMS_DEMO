'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const NURSING_EXTRA_CSS = `
:root[data-doc="nursing-manual"] {
  --accent: #ea580c;
  --accent-light: #fff7ed;
  --nur-orange: #ea580c;
  --nur-orange-dark: #c2410c;
  --nur-rose: #f43f5e;
  --nur-amber: #f59e0b;
  --nur-violet: #8b5cf6;
  --nur-teal: #0d9488;
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
  flex: 1 1 22mm; min-width: 18mm; text-align: center; border-radius: 4px;
  padding: 2mm 1.5mm; font-size: 7pt; font-weight: 600;
  border: 1px solid rgba(0,0,0,0.08); break-inside: avoid;
}
.wf-chip .n {
  display: inline-block; width: 4.5mm; height: 4.5mm; line-height: 4.5mm;
  border-radius: 50%; background: var(--nur-orange-dark); color: white; font-size: 6.5pt; margin-bottom: 1mm;
}
.status-pill {
  display: inline-block; font-size: 7pt; font-weight: 700; padding: 0.5mm 2mm;
  border-radius: 99px; text-transform: uppercase;
}
.status-pill.registered { background: #dbeafe; color: #1e40af; }
.status-pill.triage { background: #fef3c7; color: #92400e; }
.status-pill.waiting { background: #ede9fe; color: #5b21b6; }
.status-pill.completed { background: #d1fae5; color: #065f46; }
.screen {
  border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  margin: 4mm 0 5mm; break-inside: avoid; box-shadow: 0 1px 4px rgba(234,88,12,0.08);
}
.screen-bar {
  background: linear-gradient(90deg, #c2410c, #f43f5e);
  color: rgba(255,255,255,0.92); padding: 2mm 3mm; font-size: 8pt;
  display: flex; align-items: center; gap: 2mm;
}
.screen-bar .dot { width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #fdba74; }
.screen-bar .dot:nth-child(2) { background: #fcd34d; }
.screen-bar .dot:nth-child(3) { background: #fda4af; }
.screen-body { background: #fff7ed; padding: 4mm; }
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
  width: 5mm; height: 5mm; border-radius: 50%; background: var(--nur-orange);
  color: white; font-size: 7pt; font-weight: 700; text-align: center; line-height: 5mm;
}
.perm-pill {
  display: inline-block; font-size: 7pt; font-family: ui-monospace, monospace;
  background: #f1f5f9; padding: 0.5mm 2mm; border-radius: 2px; margin: 0.5mm;
}
.hero-img { width: 100%; max-height: 45mm; object-fit: cover; border-radius: 4px; margin: 3mm 0; }
.vitals-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; margin: 3mm 0; font-size: 7.5pt;
}
.vitals-grid span {
  background: white; border: 1px solid #fed7aa; border-radius: 3px; padding: 2mm 1mm; text-align: center;
}
`;

function buildNursingUsersManualHtml() {
  const b = brand;
  const body = `
<style>${PREMIUM_CSS}${NURSING_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'Nursing User Manual',
  title: 'Nursing Module',
  subtitle: 'Complete staff guide — OPD triage, vitals, ward board, IPD care, medication administration, supply requests, handover, emergency nursing, and clinical integration.',
  badge: 'Premium · Professional Edition',
  variant: 'nursing-manual',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)} Nursing User Manual</strong>. The Nursing module supports front-line clinical care — from OPD triage and vital signs through inpatient ward management, medication administration, supply requisitions, and emergency response.</p>
<div class="tip"><strong>Nurse Station:</strong> Your home portal at <code>/portal/nurse</code> (hub: <code>/portal/hub/nursing</code>) with KPIs, OPD activity, emergency panel, and quick links to vitals, queue, and ward board.</div>

<div class="kpi-row">
  <div class="kpi"><strong>OPD</strong><span>Triage &amp; vitals</span></div>
  <div class="kpi"><strong>IPD</strong><span>Ward &amp; meds</span></div>
  <div class="kpi"><strong>ER</strong><span>Acute care</span></div>
</div>

<img class="hero-img" src="public/call-queue/photos/nurses.jpg" alt="Nursing care" />

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#overview">Nursing overview &amp; roles</a></li>
<li><a href="#workflow">Clinical nursing workflow</a></li>
<li><a href="#portal">Nurse Station portal</a></li>
<li><a href="#opd">OPD queue &amp; triage</a></li>
<li><a href="#vitals">Recording vitals</a></li>
<li><a href="#ward">Ward board &amp; IPD care</a></li>
<li><a href="#medication">IPD medication administration</a></li>
<li><a href="#supply">Nursing supply requests</a></li>
<li><a href="#handover">Handover &amp; nursing reports</a></li>
<li><a href="#emergency">Emergency nursing</a></li>
<li><a href="#maternity">Maternity &amp; obstetric nursing</a></li>
<li><a href="#alerts">Clinical department alerts</a></li>
<li><a href="#roster">Nurse roster</a></li>
<li><a href="#chart">Patient chart access</a></li>
<li><a href="#integration">Module integration</a></li>
<li><a href="#screens">Screen reference</a></li>
<li><a href="#troubleshooting">Troubleshooting</a></li>
<li><a href="#glossary">Glossary</a></li>
</ol>
</div>

${section('overview', '1. Nursing Overview & Roles', `
<p>The <strong>Nursing module</strong> connects bedside care to the hospital information system across OPD, IPD, Emergency, Maternity, and community outreach contexts.</p>

<div class="role-grid">
  <div class="role-card" style="background:#fff7ed;border-color:#fdba74">
    <div class="icon">💓</div>
    <strong>Registered Nurse</strong>
    <span>Triage, vitals, ward care, medication administration, patient education</span>
  </div>
  <div class="role-card" style="background:#ffe4e6;border-color:#fda4af">
    <div class="icon">🩺</div>
    <strong>Nursing Aid / Assistant</strong>
    <span>Vitals, patient positioning, basic care under nurse supervision</span>
  </div>
  <div class="role-card" style="background:#dbeafe;border-color:#93c5fd">
    <div class="icon">👨‍⚕️</div>
    <strong>Doctor</strong>
    <span>Orders care plans, medications, investigations; ward rounds</span>
  </div>
  <div class="role-card" style="background:#ede9fe;border-color:#c4b5fd">
    <div class="icon">🏥</div>
    <strong>Front Desk / ADT</strong>
    <span>Patient registration, queue management, bed assignment</span>
  </div>
  <div class="role-card" style="background:#d1fae5;border-color:#6ee7b7">
    <div class="icon">💊</div>
    <strong>Pharmacist</strong>
    <span>Fulfills nursing supply requests; dispenses medications</span>
  </div>
  <div class="role-card" style="background:#fce7f3;border-color:#f9a8d4">
    <div class="icon">👤</div>
    <strong>Patient</strong>
    <span>Receives triage, vitals monitoring, treatments, and discharge education</span>
  </div>
</div>

<h3>Key URLs</h3>
<table class="data">
<tr><th>Screen</th><th>Path</th></tr>
<tr><td>Nurse Station Portal</td><td><code>/portal/nurse</code> · <code>/portal/hub/nursing</code></td></tr>
<tr><td>Record vitals</td><td><code>/nursing/vitals</code></td></tr>
<tr><td>OPD queue</td><td><code>/opd-queue</code></td></tr>
<tr><td>Ward board</td><td><code>/wards</code></td></tr>
<tr><td>IPD medication chart</td><td><code>/ipd/medication</code></td></tr>
<tr><td>Nursing supply requests</td><td><code>/nursing/supply-requests</code></td></tr>
<tr><td>IPD handover</td><td><code>/ipd/handover</code></td></tr>
<tr><td>IPD nurse inbox</td><td><code>/ipd/inbox</code></td></tr>
<tr><td>Nurse roster</td><td><code>/nurse-roster</code></td></tr>
<tr><td>Patient chart</td><td><code>/patient-chart/:id</code></td></tr>
</table>

<div class="note"><strong>Permissions:</strong> <span class="perm-pill">nursing.read</span> view queue &amp; vitals · <span class="perm-pill">nursing.write</span> record vitals &amp; administer meds · <span class="perm-pill">adt.read/write</span> ward board · <span class="perm-pill">nurse_duty.read</span> roster</div>
`)}

${section('workflow', '2. Clinical Nursing Workflow', `
<div class="flow">Patient arrives → Register / queue → Nurse triage &amp; vitals
→ Waiting doctor → Consultation &amp; orders → Cashier (if OPD)
→ Nursing care / IPD admission / ER treatment → Discharge</div>

<div class="wf-strip">
  <div class="wf-chip"><span class="n">1</span><br/>Register</div>
  <div class="wf-chip"><span class="n">2</span><br/>Triage</div>
  <div class="wf-chip"><span class="n">3</span><br/>Vitals</div>
  <div class="wf-chip"><span class="n">4</span><br/>Doctor</div>
  <div class="wf-chip"><span class="n">5</span><br/>Orders</div>
  <div class="wf-chip"><span class="n">6</span><br/>Care plan</div>
</div>

<h3>Standard OPD pathway</h3>
<ol class="step-row">
<li>Front desk registers patient — status <span class="status-pill registered">Registered</span>.</li>
<li>Nurse locates patient on OPD queue or Nurse Station.</li>
<li>Click <strong>Triage</strong> — opens vitals form with patient prefilled.</li>
<li>Enter BP, temperature, weight, SpO₂, pulse, chief complaint notes.</li>
<li>Save — status moves to <span class="status-pill waiting">Waiting Doctor</span>.</li>
<li>Doctor consults, orders lab/rad/pharmacy as needed.</li>
<li>Patient pays at cashier if required; returns for nursing instructions or procedures.</li>
</ol>

<h3>IPD pathway</h3>
<p>After doctor admission request and cashier deposit: ADT assigns bed on ward board → nurse receives patient → baseline vitals → execute care plan and medication chart.</p>

<div class="warn"><strong>Emergency exception:</strong> ER patients receive immediate nursing assessment and vitals while doctor begins treatment — payment is retrospective.</div>
`)}

${section('portal', '3. Nurse Station Portal', `
<p>The <strong>Nurse Station</strong> portal is the nursing team's command center.</p>

<h3>KPI strip</h3>
<ul>
<li><strong>Patients Today</strong> — OPD visits scheduled or checked in today</li>
<li><strong>Pending Triage</strong> — registered patients awaiting vitals</li>
<li><strong>Beds Occupied</strong> — current inpatient census</li>
<li><strong>Total Patients</strong> — active patients in system scope</li>
</ul>

<h3>Quick actions</h3>
<ul>
<li><strong>Pharmacy requests</strong> — nursing supply requisitions</li>
<li><strong>OPD Queue</strong> — live queue with triage buttons</li>
<li><strong>Ward Board</strong> — IPD bed map and admissions</li>
<li><strong>Record Vitals</strong> — direct vitals entry</li>
<li><strong>Workflow Guide</strong> — role-specific step-by-step help</li>
</ul>

<h3>Today's activity panel</h3>
<p>Recent OPD visits with status badges, chief complaint, check-in time, and triage/chart action buttons.</p>

<h3>Emergency side panel</h3>
<p>Active ER visits requiring nursing attention — red-highlighted card with patient list and quick links.</p>

<p>Portal tiles provide shortcuts to clinical tools configured for nursing role.</p>
`)}

${section('opd', '4. OPD Queue & Triage', `
<p>The <strong>OPD queue</strong> at <code>/opd-queue</code> shows all outpatient visits with real-time status.</p>

<h3>Queue statuses</h3>
<p>
<span class="status-pill registered">Registered</span>
<span class="status-pill triage">Triage</span>
<span class="status-pill waiting">Waiting Doctor</span>
<span class="status-pill completed">Completed</span>
</p>

<h3>Triage workflow</h3>
<ol class="step-row">
<li>Open OPD queue from Nurse Station or sidebar.</li>
<li>Filter or scan for patients with status Registered or Triage.</li>
<li>Click <strong>Triage</strong> on patient row — redirects to vitals with visit ID.</li>
<li>Complete vitals form and save.</li>
<li>Patient automatically advances to Waiting Doctor on queue.</li>
</ol>

<h3>Consultation rooms</h3>
<p>Front desk or nursing may assign a physical consultation room on the patient card. Rooms configured under Settings → Room configuration.</p>

<h3>Carry-forward visits</h3>
<p>Returning patients within validity window may skip new consultation payment — nurse verifies follow-up eligibility on chart before triage.</p>
`)}

${section('vitals', '5. Recording Vitals', `
<p>The <strong>Vitals Registry</strong> at <code>/nursing/vitals</code> captures structured vital signs for clinical pre-assessment.</p>

<h3>Vital sign groups</h3>
<div class="vitals-grid">
<span>🫀 BP / Pulse</span><span>🌡 Temperature</span><span>⚖ Weight</span>
<span>💨 SpO₂</span><span>📏 Height</span><span>🧠 GCS (ER)</span>
</div>

<ol class="step-row">
<li>Select patient from dropdown (or prefilled from queue triage link).</li>
<li>Enter cardiovascular: systolic/diastolic BP, pulse rate.</li>
<li>Enter temperature (°C) and weight (kg).</li>
<li>Enter SpO₂ percentage if pulse oximetry available.</li>
<li>Add nursing notes or pain score if configured.</li>
<li>Save — vitals written to patient chart and linked OPD visit.</li>
</ol>

<h3>IPD vitals</h3>
<p>From ward board or IPD admission, record baseline vitals on admission and scheduled monitoring per care plan.</p>

<h3>Access control</h3>
<p>Doctors cannot save vitals through nursing station forms — vitals entry is restricted to nursing roles per clinical business rules.</p>

<div class="tip">Use deep links: <code>/nursing/vitals?patient_id=…&amp;opd_visit_id=…&amp;redirect_to=/opd-queue</code> for seamless queue return.</div>
`)}

${section('ward', '6. Ward Board & IPD Care', `
<p>The <strong>Ward Board</strong> at <code>/wards</code> is the central IPD bed management and nursing operations view.</p>

<h3>Bed map</h3>
<p>Wards grouped with bed status: Available · Occupied · Reserved · Housekeeping. Color-coded cards show patient name, length of stay, running bill summary.</p>

<h3>Active admissions panel</h3>
<ul>
<li>Patient name, ward, bed label</li>
<li>IPD status, admitting department</li>
<li>Length of stay (days)</li>
<li>Running bill and deposit amounts</li>
</ul>

<h3>Pending bed assignment</h3>
<p>Admissions awaiting bed placement after doctor request and cashier deposit — ADT assigns ward and bed.</p>

<h3>Nursing actions on ward board</h3>
<ol class="step-row">
<li>Receive newly admitted patient to assigned bed.</li>
<li>Record admission baseline vitals.</li>
<li>Review doctor orders and nursing care plan.</li>
<li>Open IPD medication chart for scheduled doses.</li>
<li>Submit nursing supply requests for ward stock.</li>
<li>Document nursing notes on patient chart.</li>
<li>Support clinical discharge workflow when doctor marks patient fit.</li>
</ol>

<h3>Bed lifecycle</h3>
<p>Available → Occupied (admit) → Housekeeping (discharge) → Available (bed ready). Nurse or ADT marks bed ready after cleaning.</p>
`)}

${section('medication', '7. IPD Medication Administration', `
<p>The <strong>IPD medication module</strong> at <code>/ipd/medication</code> manages scheduled drug administration.</p>

<h3>Medication chart</h3>
<ul>
<li>Doctor-prescribed medications with dosage, route, frequency</li>
<li>Scheduled dose times — due, administered, missed</li>
<li>Nurse administration with timestamp and initials</li>
</ul>

<h3>Administering a dose</h3>
<ol class="step-row">
<li>Open patient from ward board or medication module.</li>
<li>Locate due dose in today's schedule (24h window centered on now).</li>
<li>Verify patient identity and medication against chart.</li>
<li>Click <strong>Administer</strong> — record time and optional nurse comment.</li>
<li>Dose locked in audit trail — cannot be undone without supervisor correction.</li>
</ol>

<h3>Missed doses</h3>
<p>Mark dose as missed with reason (patient refused, NPO, unavailable, etc.) — documented for doctor review.</p>

<h3>Corrections</h3>
<p>Supervisor may correct administration record with audit reason — original entry preserved in history.</p>

<div class="note">Only users with nursing.write permission can administer doses — system enforces role check.</div>
`)}

${section('supply', '8. Nursing Supply Requests', `
<p>Ward nurses requisition supplies from pharmacy via <strong>Nursing Supply Requests</strong> (<code>/nursing/supply-requests</code>).</p>

<ol class="step-row">
<li>Open supply requests from Nurse Station or ward board link.</li>
<li>Click <strong>New request</strong> — add line items from inventory catalog.</li>
<li>Specify quantity and remarks per item.</li>
<li>Link to admission/ward/patient if context available.</li>
<li>Submit — request appears in pharmacy nursing-requests queue.</li>
<li>Pharmacy marks preparing → dispenses → nurse acknowledges receipt.</li>
</ol>

<h3>Request statuses</h3>
<p>Pending · Preparing · Ready · Fulfilled · Cancelled</p>

<p>Pharmacy portal shows badge count when nursing requests are pending.</p>
`)}

${section('handover', '9. Handover & Nursing Reports', `
<p>Structured shift handover at <code>/ipd/handover</code> ensures continuity of care between nursing shifts.</p>

<h3>Shift report</h3>
<ul>
<li>Current shift nurse documents patient status</li>
<li>Outstanding tasks and critical observations</li>
<li>Next shift nurse assignment</li>
<li>Lock report when shift ends — audit trail preserved</li>
</ul>

<h3>IPD nurse inbox</h3>
<p>Messages and alerts for nursing staff at <code>/ipd/inbox</code> — doctor orders, pending tasks, department notifications.</p>

<h3>Nursing notes</h3>
<p>Document interventions, patient response, and education on patient chart — visible to clinical team.</p>
`)}

${section('emergency', '10. Emergency Nursing', `
<p>Emergency/A&amp;E nursing follows a rapid assessment pathway:</p>

<ol class="step-row">
<li>Patient arrives — may bypass OPD registration prepayment.</li>
<li>Nurse performs immediate triage — vitals including GCS if indicated.</li>
<li>Doctor begins parallel assessment and treatment.</li>
<li>Orders placed on ER credit tab — lab, rad, pharmacy alerts to departments.</li>
<li>Nursing executes orders: IV access, medications, monitoring.</li>
<li>Disposition when stable — admission, transfer, or discharge.</li>
<li>Retrospective billing at cashier after care.</li>
</ol>

<p>Emergency panel on Nurse Station shows active ER patients requiring attention.</p>

<div class="warn">Life-threatening cases: use Emergency / Waiver on registration to bypass prepayment gate when policy allows.</div>
`)}

${section('maternity', '11. Maternity & Obstetric Nursing', `
<p>Obstetric nursing integrates with Maternity module workflows:</p>
<ul>
<li>ANC visits — vitals, fundal height, fetal heart rate documentation</li>
<li>Labor ward — partograph monitoring, contraction timing, cervical assessment</li>
<li>Delivery suite support — newborn initial care, Apgar documentation</li>
<li>Postnatal ward — maternal recovery vitals, breastfeeding support</li>
<li>NICU nursing — neonatal vitals and feeding charts when applicable</li>
</ul>

<p>See <strong>Maternity User Manual</strong> (<code>/docs/maternity-users-manual</code>) for full obstetric pathway.</p>
`)}

${section('alerts', '12. Clinical Department Alerts', `
<p>Nursing responds to cross-department alerts for pending clinical orders:</p>
<ul>
<li><strong>Lab alerts</strong> — specimen collection, pending tests</li>
<li><strong>Radiology alerts</strong> — patient transport to imaging</li>
<li><strong>Pharmacy alerts</strong> — medication ready for ward delivery</li>
<li><strong>IPD inbox</strong> — doctor messages and care plan updates</li>
</ul>

<p>Clinical department alerts strip appears on relevant portal pages when items need nursing action.</p>
`)}

${section('roster', '13. Nurse Roster', `
<p>View and manage duty schedules at <code>/nurse-roster</code>.</p>

<h3>Views</h3>
<ul>
<li><strong>Day</strong> — single day shift assignments</li>
<li><strong>Week</strong> — weekly grid</li>
<li><strong>Month</strong> — calendar overview</li>
</ul>

<h3>Permissions</h3>
<p><span class="perm-pill">nurse_duty.read</span> view roster · Administrators save and copy rosters between dates.</p>

<p>Staff can check their assigned shifts before reporting to Nurse Station or ward.</p>
`)}

${section('chart', '14. Patient Chart Access', `
<p>Nurses access the full clinical record at <code>/patient-chart/:id</code>:</p>
<ul>
<li>Vitals history and trends</li>
<li>Active medications and allergies</li>
<li>Doctor orders and nursing care plan</li>
<li>Lab, radiology, and pharmacy results</li>
<li>Admission and discharge summaries</li>
<li>Nursing notes and handover reports</li>
</ul>

<p>From OPD queue or ward board, click <strong>Chart</strong> to open patient record in context.</p>
`)}

${section('integration', '15. Module Integration', `
<table class="data">
<tr><th>Module</th><th>Nursing touchpoint</th></tr>
<tr><td><strong>OPD</strong></td><td>Triage, vitals, queue management</td></tr>
<tr><td><strong>IPD</strong></td><td>Ward board, medication chart, handover</td></tr>
<tr><td><strong>Emergency</strong></td><td>Rapid triage, credit-tab orders</td></tr>
<tr><td><strong>Maternity</strong></td><td>ANC, labor, postnatal care</td></tr>
<tr><td><strong>Pharmacy</strong></td><td>Supply requests, medication dispensing support</td></tr>
<tr><td><strong>Lab / Radiology</strong></td><td>Specimen collection, patient escort</td></tr>
<tr><td><strong>Cashier</strong></td><td>OPD prepayment before doctor (standard flow)</td></tr>
<tr><td><strong>Front Desk</strong></td><td>Registration, room assignment, bed allocation</td></tr>
</table>

<p>Related manuals: <strong>IPD</strong> (<code>/docs/ipd-users-manual</code>), <strong>Emergency</strong> (<code>/docs/emergency-users-manual</code>), <strong>Pharmacy</strong> (<code>/docs/pharmacy-users-manual</code>).</p>
`)}

${section('screens', '16. Screen Reference (UI)', `
<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Nurse Station — /portal/nurse</div>
  <div class="screen-body">
    <div style="font-size:9pt;font-weight:800;color:#c2410c;margin-bottom:2mm">💓 Nurse Station</div>
    <div style="font-size:7.5pt;color:#64748b;margin-bottom:3mm">Triage · Vitals · Ward care · Emergency</div>
    <div style="display:flex;gap:2mm;flex-wrap:wrap;margin-bottom:3mm">
      <span style="background:#fff7ed;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Today 24</span>
      <span style="background:#fef3c7;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Triage 5</span>
      <span style="background:#ffe4e6;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Beds 18</span>
      <span style="background:#ede9fe;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Patients 892</span>
    </div>
    <div style="display:flex;gap:2mm;flex-wrap:wrap;font-size:7.5pt">
      <span style="background:#ea580c;color:white;padding:1mm 2.5mm;border-radius:4px;font-weight:700">OPD Queue</span>
      <span style="background:white;border:1px solid #e2e8f0;padding:1mm 2.5mm;border-radius:4px">Ward Board</span>
      <span style="background:white;border:1px solid #e2e8f0;padding:1mm 2.5mm;border-radius:4px">Record Vitals</span>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Vitals entry — /nursing/vitals</div>
  <div class="screen-body" style="font-size:8.5pt">
    <div style="font-size:10pt;margin-bottom:2mm">💓 Record Patient Vitals</div>
    <div style="background:white;border:1px solid #fed7aa;border-radius:4px;padding:3mm;margin:2mm 0">
      <strong>Patient:</strong> Marie Nguema
    </div>
    <div class="vitals-grid" style="margin:2mm 0">
      <span>BP 120/80</span><span>Temp 36.8°C</span><span>Pulse 72</span>
      <span>SpO₂ 98%</span><span>Weight 62kg</span><span>—</span>
    </div>
    <div style="margin-top:2mm"><span style="color:#059669;font-weight:700">Save → Waiting Doctor</span></div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Ward board — /wards</div>
  <div class="screen-body" style="font-size:8pt">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin-bottom:2mm">
      <div style="background:#d1fae5;border:1px solid #6ee7b7;padding:2mm;text-align:center;border-radius:3px;font-size:7pt"><strong>Med A-01</strong><br/>Available</div>
      <div style="background:#fee2e2;border:1px solid #fca5a5;padding:2mm;text-align:center;border-radius:3px;font-size:7pt"><strong>Med A-02</strong><br/>J. Doe</div>
      <div style="background:#fef3c7;border:1px solid #fcd34d;padding:2mm;text-align:center;border-radius:3px;font-size:7pt"><strong>Med A-03</strong><br/>Cleaning</div>
      <div style="background:#fee2e2;border:1px solid #fca5a5;padding:2mm;text-align:center;border-radius:3px;font-size:7pt"><strong>Surg B-01</strong><br/>A. Smith</div>
    </div>
    <div style="font-size:7.5pt;color:#64748b">Active admissions: 18 · Pending bed: 2</div>
  </div>
</div>

<div class="tip"><strong>Live screenshots:</strong> Open <code>/portal/nurse</code> or <code>/nursing/vitals</code> while signed in; Print → Save as PDF for training.</div>
`)}

${section('troubleshooting', '17. Troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Cannot save vitals</td><td>Verify nursing.write permission; doctors use separate clinical note paths</td></tr>
<tr><td>Patient stuck on Registered</td><td>Complete triage vitals to advance queue status</td></tr>
<tr><td>No patient in vitals dropdown</td><td>Register patient first; use patient_id query param from queue</td></tr>
<tr><td>Cannot administer IPD dose</td><td>Check nursing.write role; verify dose is due in schedule window</td></tr>
<tr><td>Supply request rejected</td><td>Verify inventory item exists; check stock levels in inventory module</td></tr>
<tr><td>Bed shows occupied after discharge</td><td>Confirm financial discharge at cashier; mark bed ready for housekeeping</td></tr>
<tr><td>Follow-up patient charged again</td><td>Verify doctor marked follow-up eligible and payment validity passes</td></tr>
<tr><td>ER patient not on nursing panel</td><td>Confirm ER registration and triage completed on ER board</td></tr>
<tr><td>Cannot view roster</td><td>Request nurse_duty.read permission from administrator</td></tr>
</table>
`)}

${section('glossary', '18. Glossary', `
<table class="data">
<tr><th>Term</th><th>Definition</th></tr>
<tr><td>Triage</td><td>Initial nursing assessment including vitals before doctor consultation</td></tr>
<tr><td>Vitals</td><td>Vital signs: BP, pulse, temperature, SpO₂, weight, etc.</td></tr>
<tr><td>OPD queue</td><td>Outpatient visit tracking from registration to completion</td></tr>
<tr><td>Ward board</td><td>IPD bed map and admission management at /wards</td></tr>
<tr><td>ADT</td><td>Admission, Discharge, Transfer — bed and ward management</td></tr>
<tr><td>Care plan</td><td>Nursing interventions ordered by doctor for inpatient care</td></tr>
<tr><td>Med chart</td><td>Scheduled medication administration record for IPD</td></tr>
<tr><td>Handover</td><td>Shift report transferring patient care between nurses</td></tr>
<tr><td>Supply request</td><td>Ward requisition fulfilled by pharmacy</td></tr>
<tr><td>GCS</td><td>Glasgow Coma Scale — neurological assessment in emergency</td></tr>
<tr><td>Credit tab</td><td>Running unpaid charges during ER/IPD stay</td></tr>
</table>
`)}

<p class="footer-note">© ${esc(new Date().getFullYear())} ${esc(b.name)} · Nursing Users Manual v2.0 · ${esc(b.facilityName || b.orgName)} · Confidential</p>
</div>`;

  return wrapPremiumDoc({
    title: `Nursing User Manual — ${b.productName}`,
    variant: 'nursing-manual',
    bodyHtml: body,
  });
}

module.exports = { buildNursingUsersManualHtml, NURSING_EXTRA_CSS };
