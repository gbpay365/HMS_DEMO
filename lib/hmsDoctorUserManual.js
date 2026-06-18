'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const DOCTOR_EXTRA_CSS = `
:root[data-doc="doctor-manual"] {
  --accent: #1a6bd8;
  --accent-light: #dbeafe;
  --doc-blue: #1a6bd8;
  --doc-blue-dark: #1e40af;
  --doc-slate: #0f172a;
  --doc-teal: #0d9488;
  --doc-violet: #7c3aed;
  --doc-emerald: #059669;
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
  border-radius: 50%; background: var(--doc-blue-dark); color: white; font-size: 6.5pt; margin-bottom: 1mm;
}
.status-pill {
  display: inline-block; font-size: 7pt; font-weight: 700; padding: 0.5mm 2mm;
  border-radius: 99px; text-transform: uppercase;
}
.status-pill.waiting { background: #ede9fe; color: #5b21b6; }
.status-pill.consult { background: #dbeafe; color: #1e40af; }
.status-pill.completed { background: #d1fae5; color: #065f46; }
.status-pill.tele { background: #e0f2fe; color: #0369a1; }
.screen {
  border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  margin: 4mm 0 5mm; break-inside: avoid; box-shadow: 0 1px 4px rgba(26,107,216,0.08);
}
.screen-bar {
  background: linear-gradient(90deg, #1e40af, #0f172a);
  color: rgba(255,255,255,0.92); padding: 2mm 3mm; font-size: 8pt;
  display: flex; align-items: center; gap: 2mm;
}
.screen-bar .dot { width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #93c5fd; }
.screen-bar .dot:nth-child(2) { background: #fcd34d; }
.screen-bar .dot:nth-child(3) { background: #86efac; }
.screen-body { background: #eff6ff; padding: 4mm; }
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
  width: 5mm; height: 5mm; border-radius: 50%; background: var(--doc-blue);
  color: white; font-size: 7pt; font-weight: 700; text-align: center; line-height: 5mm;
}
.perm-pill {
  display: inline-block; font-size: 7pt; font-family: ui-monospace, monospace;
  background: #f1f5f9; padding: 0.5mm 2mm; border-radius: 2px; margin: 0.5mm;
}
.hero-img { width: 100%; max-height: 45mm; object-fit: cover; border-radius: 4px; margin: 3mm 0; }
.soap-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 2mm; margin: 3mm 0; font-size: 8pt;
}
.soap-grid span {
  background: white; border-left: 3px solid #1a6bd8; border-radius: 3px; padding: 2mm 2.5mm;
}
.tile-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin: 3mm 0; font-size: 7.5pt; text-align: center;
}
.tile-grid span {
  background: white; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2mm 1mm;
}
`;

function buildDoctorUsersManualHtml() {
  const b = brand;
  const body = `
<style>${PREMIUM_CSS}${DOCTOR_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'Doctor User Manual',
  title: 'Doctor Module',
  subtitle: 'Complete physician guide — consultations, SOAP notes, orders, prescriptions, admissions, ward rounds, emergency care, telemedicine, and clinical integration.',
  badge: 'Premium · Professional Edition',
  variant: 'doctor-manual',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)} Doctor User Manual</strong>. The Doctor module is the clinical command center for physicians — managing outpatient consultations, diagnostic orders, prescriptions, inpatient care, emergency response, and specialist workflows.</p>
<div class="tip"><strong>Doctor Portal:</strong> Your home at <code>/portal/doctor</code> — appointments, OPD queue, new consultations, ER alerts, and quick links to prescriptions, patients, and laboratory.</div>

<div class="kpi-row">
  <div class="kpi"><strong>SOAP</strong><span>Clinical notes</span></div>
  <div class="kpi"><strong>Orders</strong><span>Lab · Rad · Rx</span></div>
  <div class="kpi"><strong>IPD</strong><span>Admit · Rounds · DC</span></div>
</div>

<img class="hero-img" src="public/call-queue/photos/consultation.jpg" alt="Doctor consultation" />

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#overview">Doctor overview &amp; roles</a></li>
<li><a href="#workflow">Clinical consultation workflow</a></li>
<li><a href="#portal">Doctor portal</a></li>
<li><a href="#consultation">Starting a consultation</a></li>
<li><a href="#soap">SOAP documentation</a></li>
<li><a href="#orders">Diagnostic orders</a></li>
<li><a href="#prescriptions">Prescriptions</a></li>
<li><a href="#followup">Follow-up consultations</a></li>
<li><a href="#appointments">Appointments &amp; telemedicine</a></li>
<li><a href="#emergency">Emergency physician workflow</a></li>
<li><a href="#ipd">IPD admissions &amp; ward rounds</a></li>
<li><a href="#discharge">Clinical discharge</a></li>
<li><a href="#maternity">Maternity &amp; obstetric care</a></li>
<li><a href="#chart">Patient chart</a></li>
<li><a href="#eralerts">ER alerts inbox</a></li>
<li><a href="#roster">Doctor roster</a></li>
<li><a href="#visiting">Visiting doctors</a></li>
<li><a href="#integration">Module integration</a></li>
<li><a href="#screens">Screen reference</a></li>
<li><a href="#troubleshooting">Troubleshooting</a></li>
<li><a href="#glossary">Glossary</a></li>
</ol>
</div>

${section('overview', '1. Doctor Overview & Roles', `
<p>The <strong>Doctor module</strong> supports the full physician pathway across OPD, IPD, Emergency, Maternity, and telemedicine contexts.</p>

<div class="role-grid">
  <div class="role-card" style="background:#dbeafe;border-color:#93c5fd">
    <div class="icon">👨‍⚕️</div>
    <strong>Physician / Consultant</strong>
    <span>Consultations, diagnoses, orders, prescriptions, admissions, ward rounds, discharge</span>
  </div>
  <div class="role-card" style="background:#ede9fe;border-color:#c4b5fd">
    <div class="icon">🩺</div>
    <strong>Specialist</strong>
    <span>Specialist consultation fees, referrals, department-specific care</span>
  </div>
  <div class="role-card" style="background:#fff7ed;border-color:#fdba74">
    <div class="icon">💓</div>
    <strong>Nurse</strong>
    <span>Triage, vitals, medication administration — supports doctor workflow</span>
  </div>
  <div class="role-card" style="background:#d1fae5;border-color:#6ee7b7">
    <div class="icon">💳</div>
    <strong>Cashier</strong>
    <span>Consultation payment before OPD visit; order payment codes on completion</span>
  </div>
  <div class="role-card" style="background:#cffafe;border-color:#67e8f9">
    <div class="icon">🏥</div>
    <strong>Front Desk</strong>
    <span>Registration, queue, consultation room assignment</span>
  </div>
  <div class="role-card" style="background:#fce7f3;border-color:#f9a8d4">
    <div class="icon">👤</div>
    <strong>Patient</strong>
    <span>Pays consultation fee, receives care, collects results and prescriptions</span>
  </div>
</div>

<h3>Key URLs</h3>
<table class="data">
<tr><th>Screen</th><th>Path</th></tr>
<tr><td>Doctor Portal</td><td><code>/portal/doctor</code></td></tr>
<tr><td>New consultation</td><td><code>/consultation-new</code></td></tr>
<tr><td>Consultation (visit)</td><td><code>/consultation/visit/:id</code></td></tr>
<tr><td>OPD queue</td><td><code>/opd-queue</code></td></tr>
<tr><td>Prescription registry</td><td><code>/prescriptions</code></td></tr>
<tr><td>Patient directory</td><td><code>/patients</code></td></tr>
<tr><td>Appointments</td><td><code>/appointments</code></td></tr>
<tr><td>Emergency board</td><td><code>/emergency</code></td></tr>
<tr><td>ER alerts inbox</td><td><code>/portal/doctor/er-alerts</code></td></tr>
<tr><td>IPD ward rounds</td><td><code>/ipd/ward-rounds</code></td></tr>
<tr><td>Patient chart</td><td><code>/patient-chart/:id</code></td></tr>
<tr><td>Doctor roster</td><td><code>/doctor-roster</code></td></tr>
</table>

<div class="note"><strong>Permissions:</strong> <span class="perm-pill">clinical.read</span> view charts · <span class="perm-pill">clinical.write</span> consultations · <span class="perm-pill">consult.write</span> SOAP &amp; orders · <span class="perm-pill">prescription.write</span> medications</div>
`)}

${section('workflow', '2. Clinical Consultation Workflow', `
<div class="flow">Register → Pay consultation → Nurse triage &amp; vitals
→ Waiting doctor → Consultation (SOAP) → Orders → Complete
→ Cashier (order payment) → Lab / Rad / Pharmacy</div>

<div class="wf-strip">
  <div class="wf-chip"><span class="n">1</span><br/>Register</div>
  <div class="wf-chip"><span class="n">2</span><br/>Pay fee</div>
  <div class="wf-chip"><span class="n">3</span><br/>Triage</div>
  <div class="wf-chip"><span class="n">4</span><br/>Consult</div>
  <div class="wf-chip"><span class="n">5</span><br/>Orders</div>
  <div class="wf-chip"><span class="n">6</span><br/>Complete</div>
</div>

<h3>Standard OPD pathway</h3>
<ol class="step-row">
<li>Patient registers at front desk — pays consultation fee at cashier.</li>
<li>Nurse records triage vitals — status <span class="status-pill waiting">Waiting Doctor</span>.</li>
<li>Doctor opens patient from OPD queue or <strong>New Consultation</strong>.</li>
<li>Document SOAP: complaint, history, examination, diagnosis, plan.</li>
<li>Add lab tests, radiology exams, medications as needed.</li>
<li>Mark follow-up eligibility if applicable.</li>
<li><strong>Complete consultation</strong> — orders sent to cashier queue.</li>
<li>Patient pays for orders at cashier; visits departments with payment codes.</li>
</ol>

<div class="warn"><strong>Payment gate:</strong> Standard OPD requires consultation payment before doctor sees patient. Emergency waiver available for acute cases.</div>
`)}

${section('portal', '3. Doctor Portal', `
<p>The revamped <strong>Doctor Portal</strong> at <code>/portal/doctor</code> centralizes daily clinical work.</p>

<h3>Hero banner</h3>
<p>Welcome message with department, date, and primary actions: Workflow Guide, New Consultation, ER Alerts, OPD Queue.</p>

<h3>KPI strip</h3>
<ul>
<li><strong>My Appts Today</strong> — scheduled appointments</li>
<li><strong>My Consultations</strong> — completed today</li>
<li><strong>OPD in Queue</strong> — patients waiting for doctor</li>
<li><strong>Total Patients</strong> — patients under your care</li>
</ul>

<h3>Quick link tiles</h3>
<div class="tile-grid">
<span>🚑 ER board</span><span>🚨 ER alerts</span><span>➕ New consult</span><span>📋 OPD queue</span>
<span>💊 Prescriptions</span><span>👥 Patients</span><span>📅 Appointments</span><span>🧪 Laboratory</span>
</div>

<h3>My Appointments</h3>
<p>Tabs: <strong>Pending</strong> (confirm/decline) · <strong>Confirmed</strong> (start consultation). Supports in-person and telemedicine visit types.</p>

<h3>Recent consultations</h3>
<p>Quick access to today's completed visits — open chart or edit consultation.</p>
`)}

${section('consultation', '4. Starting a Consultation', `
<h3>From OPD queue</h3>
<ol class="step-row">
<li>Open <code>/opd-queue</code> — filter Waiting Doctor.</li>
<li>Click patient row → <strong>Start consultation</strong>.</li>
<li>System validates payment code and opens consultation form.</li>
</ol>

<h3>New consultation picker</h3>
<p><code>/consultation-new</code> lists patients ready for consultation today. Select patient to open SOAP form.</p>

<h3>From patient chart</h3>
<p>Open chart → <strong>Create consultation</strong> or <strong>Edit consultation</strong> when active visit exists.</p>

<h3>Consultation room</h3>
<p>Assign physical consultation room from OPD queue or patient card. Default room may auto-fill from doctor's configured seat.</p>

<h3>Retake vitals</h3>
<p>If vitals need updating, use <strong>Retake vitals</strong> — sends patient back to queue for nursing to record new measurements.</p>
`)}

${section('soap', '5. SOAP Documentation', `
<p>Structured clinical documentation using the SOAP framework:</p>

<div class="soap-grid">
<span><strong>S</strong> — Subjective<br/>Chief complaint, history</span>
<span><strong>O</strong> — Objective<br/>Examination, vitals review</span>
<span><strong>A</strong> — Assessment<br/>Diagnosis, impression</span>
<span><strong>P</strong> — Plan<br/>Treatment, follow-up</span>
</div>

<h3>Fields</h3>
<ul>
<li><strong>Chief complaint</strong> — why patient presented</li>
<li><strong>History / Subjective</strong> — present illness, past history, review of systems</li>
<li><strong>Examination / Objective</strong> — physical findings; review nurse vitals (BP, pulse, temp, SpO₂, weight)</li>
<li><strong>Assessment / Diagnosis</strong> — working diagnosis; pick from common list or free text</li>
<li><strong>Plan</strong> — treatment, patient education, numbered plan items</li>
</ul>

<h3>Complete vs update</h3>
<p><strong>Complete consultation</strong> finalizes the visit and releases orders to cashier. <strong>Update consultation</strong> saves draft changes while visit in progress.</p>

<div class="tip">SOAP pick lists provide common entries — selection inserts into notes; type freely for additional detail.</div>
`)}

${section('orders', '6. Diagnostic Orders', `
<h3>Laboratory tests</h3>
<p>Search hospital lab catalog — click to add tests. Custom/non-catalog tests available when not in standard list. Numbered order lines sent to laboratory queue on completion.</p>

<h3>Radiology imaging</h3>
<p>Search radiology catalog — X-ray, ultrasound, CT, MRI, etc. Custom exams for studies not in catalog. Orders appear on radiology worklist after patient payment.</p>

<h3>External care</h3>
<p>Mark services performed outside hospital — patient obtains externally; document on chart without in-house processing.</p>

<h3>Order workflow after completion</h3>
<ol class="step-row">
<li>Doctor completes consultation with orders.</li>
<li>Orders appear on cashier billing panel.</li>
<li>Patient pays at cashier — receives LAB/RAD/PHA service codes.</li>
<li>Departments verify codes and process orders.</li>
<li>Results return to patient chart — doctor reviews.</li>
</ol>

<div class="warn">Lab and radiology cannot process unpaid orders. Patient must pay at cashier first.</div>
`)}

${section('prescriptions', '7. Prescriptions', `
<h3>During consultation</h3>
<p><strong>Medications</strong> section — search pharmacy catalog or enter custom drug:</p>
<ul>
<li>Drug name, dosage, frequency, duration, quantity</li>
<li>Catalog items with prices; custom drugs for off-catalog medications</li>
<li>Pharmacist may need to confirm off-catalog availability and price</li>
</ul>

<h3>Prescription registry</h3>
<p>Standalone prescriptions at <code>/prescriptions</code> — requires active consultation for OPD patients unless IPD/ER/follow-up rules apply.</p>

<h3>Print prescription</h3>
<p>Print Rx copy for patient from consultation or prescription registry — includes PHA codes for pharmacy dispensing.</p>

<h3>IPD medications</h3>
<p>Prescribe on IPD medication chart — nurse administers scheduled doses on ward.</p>
`)}

${section('followup', '8. Follow-Up Consultations', `
<p>Returning patients may qualify for follow-up under existing payment code:</p>
<ul>
<li>Doctor documents <strong>follow-up eligibility</strong> during consultation</li>
<li>Set <strong>next consultation interval</strong> for payment validity</li>
<li>Patient uses Follow Up path from chart or OPD queue when within validity window</li>
<li>Otherwise new consultation payment required</li>
</ul>

<h3>Follow-up checkbox</h3>
<p>Check <strong>Patient may return for follow-up consultation</strong> to allow reuse of payment code per validity rules configured in Settings → Payment validity.</p>

<p>See <strong>OPD User Manual</strong> (<code>/docs/opd-users-manual</code>) for front desk and cashier follow-up flows.</p>
`)}

${section('appointments', '9. Appointments & Telemedicine', `
<h3>Online booking</h3>
<p>Patients book appointments via patient portal — appear on Doctor Portal as pending requests.</p>

<h3>Confirm / decline</h3>
<ol class="step-row">
<li>Review pending appointment on Doctor Portal.</li>
<li><strong>Confirm</strong> — moves to confirmed tab; patient notified.</li>
<li><strong>Decline</strong> — optional reason; patient may rebook.</li>
</ol>

<h3>Visit types</h3>
<p>
<span class="status-pill consult">In-person</span>
<span class="status-pill tele">Telemedicine</span>
</p>

<h3>Teleconsultation</h3>
<p>Video consultation requires cashier payment code. Doctor confirms appointment before visit. Meeting room link on confirmed appointment.</p>

<h3>Start from appointment</h3>
<p>Confirmed appointments → <strong>Start consultation</strong> opens SOAP form with patient prefilled.</p>
`)}

${section('emergency', '10. Emergency Physician Workflow', `
<p>Emergency/A&amp;E physician pathway:</p>

<ol class="step-row">
<li>Patient arrives — may bypass OPD prepayment with emergency waiver.</li>
<li>Doctor assigned on ER board — receives ER alert notification.</li>
<li>Open ER chart — document assessment parallel to nursing vitals.</li>
<li>Place orders on credit tab — lab, rad, pharmacy, procedures.</li>
<li>Stabilize and determine disposition: admit, transfer, or discharge.</li>
<li>Issue clinical discharge when fit — retrospective billing at cashier.</li>
</ol>

<p><strong>ER board</strong> at <code>/emergency</code> — acuity levels, door-to-doctor metrics, disposition tracking.</p>

<p><strong>ER alerts inbox</strong> at <code>/portal/doctor/er-alerts</code> — new arrivals, awaiting doctor, critical updates.</p>

<p>See <strong>Emergency User Manual</strong> (<code>/docs/emergency-users-manual</code>) for full ER workflow.</p>
`)}

${section('ipd', '11. IPD Admissions & Ward Rounds', `
<h3>Admission request</h3>
<p>From consultation or patient chart when hospitalization needed:</p>
<ol class="step-row">
<li>Check <strong>Recommend IPD admission</strong> on consultation form.</li>
<li>Enter admission indication / admitting diagnosis.</li>
<li>Submit — triggers IPD workflow.</li>
<li>Cashier collects admission deposit.</li>
<li>ADT assigns ward and bed on ward board.</li>
<li>Nurse receives patient — baseline vitals and care plan.</li>
</ol>

<h3>Ward rounds</h3>
<p><code>/ipd/ward-rounds</code> — daily review of inpatients:</p>
<ul>
<li>Update clinical notes per patient</li>
<li>Review lab, radiology, pharmacy results</li>
<li>Place new orders on running credit tab</li>
<li>Adjust medications on IPD chart</li>
</ul>

<h3>During stay</h3>
<p>Doctor ward rounds, nursing care, diagnostic orders, IPD medication administration — all charges accumulate on running bill.</p>

<p>See <strong>IPD User Manual</strong> (<code>/docs/ipd-users-manual</code>) for full inpatient lifecycle.</p>
`)}

${section('discharge', '12. Clinical Discharge', `
<p>When patient is medically fit to leave:</p>

<ol class="step-row">
<li>Review final results and pending treatments.</li>
<li>Write <strong>discharge summary</strong> — diagnosis, course, medications, follow-up instructions.</li>
<li>Issue <strong>Clinical Discharge</strong> on IPD chart.</li>
<li>Cashier performs financial discharge — final bill settlement.</li>
<li>ADT confirms departure — bed released for housekeeping.</li>
</ol>

<div class="note">Both clinical and financial discharge are mandatory before patient physically leaves hospital.</div>

<h3>Death registry</h3>
<p>Document in-hospital deaths per policy at <code>/ipd/death-registry</code> when applicable.</p>
`)}

${section('maternity', '13. Maternity & Obstetric Care', `
<p>Obstetric physicians use integrated maternity workflows:</p>
<ul>
<li>ANC consultations and obstetric assessments</li>
<li>Antenatal orders — lab, ultrasound, supplements</li>
<li>Labor ward management — partograph, delivery documentation</li>
<li>Postnatal ward rounds and newborn care orders</li>
<li>Referral to NICU when indicated</li>
</ul>

<p>See <strong>Maternity User Manual</strong> (<code>/docs/maternity-users-manual</code>) for ANC registry, partograph, and delivery documentation.</p>
`)}

${section('chart', '14. Patient Chart', `
<p>Central clinical record at <code>/patient-chart/:id</code>:</p>
<ul>
<li>Demographics, allergies, problem list</li>
<li>Vitals history and trends</li>
<li>Consultations (SOAP notes)</li>
<li>Lab, radiology, pathology results</li>
<li>Prescriptions and medication history</li>
<li>IPD admissions and ward notes</li>
<li>Documents and attachments</li>
<li>Follow-up eligibility and payment validity</li>
</ul>

<p>Open from Doctor Portal recent consultations, OPD queue, appointments, or patient search.</p>
`)}

${section('eralerts', '15. ER Alerts Inbox', `
<p><code>/portal/doctor/er-alerts</code> — dedicated inbox for emergency notifications:</p>
<ul>
<li>New patient arrivals assigned to you</li>
<li>Patients awaiting doctor after triage</li>
<li>Critical updates on active ER visits</li>
<li>Acknowledge alerts when chart opened</li>
</ul>

<p>ER alerts strip on Doctor Portal header shows unacknowledged count when alerts pending.</p>
`)}

${section('roster', '16. Doctor Roster', `
<p>View duty schedules at <code>/doctor-roster</code>:</p>
<ul>
<li><strong>Day / Week / Month</strong> views</li>
<li>Shift assignments and on-call coverage</li>
<li>Administrators save and copy rosters between dates</li>
</ul>

<p>Permission: <span class="perm-pill">doctor_duty.read</span> view · admin save rosters.</p>
`)}

${section('visiting', '17. Visiting Doctors', `
<p>External specialists and locum physicians via <strong>Visiting Doctor</strong> module:</p>
<ul>
<li>Profile setup at <code>/visiting-doctor/setup</code></li>
<li>My visit dashboard for session documentation</li>
<li>Claims and administrative workflows for visiting staff</li>
<li>Integration with main doctor portal for assigned visits</li>
</ul>

<p>Visiting doctor banner appears on Doctor Portal when active visit session configured.</p>
`)}

${section('integration', '18. Module Integration', `
<table class="data">
<tr><th>Module</th><th>Doctor touchpoint</th></tr>
<tr><td><strong>OPD</strong></td><td>Consultations, queue, follow-up</td></tr>
<tr><td><strong>Cashier</strong></td><td>Consultation fee, order payment codes</td></tr>
<tr><td><strong>Nursing</strong></td><td>Triage vitals before consultation</td></tr>
<tr><td><strong>Lab / Radiology</strong></td><td>Order tests; review results on chart</td></tr>
<tr><td><strong>Pharmacy</strong></td><td>Prescribe medications; patient collects at pharmacy</td></tr>
<tr><td><strong>IPD</strong></td><td>Admit, ward rounds, clinical discharge</td></tr>
<tr><td><strong>Emergency</strong></td><td>Acute assessment, credit-tab orders</td></tr>
<tr><td><strong>Maternity</strong></td><td>ANC, labor, postnatal care</td></tr>
</table>

<p>Related manuals: OPD, IPD, Emergency, Maternity, Nursing, Pharmacy, Lab, Radiology, Cashier — all at <code>/docs/*-users-manual</code>.</p>
`)}

${section('screens', '19. Screen Reference (UI)', `
<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Doctor Portal — /portal/doctor</div>
  <div class="screen-body">
    <div style="font-size:9pt;font-weight:800;color:#1e40af;margin-bottom:2mm">👨‍⚕️ Welcome, Dr. Mbarga</div>
    <div style="font-size:7.5pt;color:#64748b;margin-bottom:3mm">General Medicine — ${esc(new Date().toLocaleDateString('en-GB'))}</div>
    <div style="display:flex;gap:2mm;flex-wrap:wrap;margin-bottom:3mm">
      <span style="background:#dbeafe;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Appts 4</span>
      <span style="background:#d1fae5;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Consults 12</span>
      <span style="background:#fef3c7;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Queue 3</span>
      <span style="background:#f1f5f9;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Patients 1.2k</span>
    </div>
    <div class="tile-grid" style="margin:0">
      <span>🚑 ER</span><span>➕ Consult</span><span>📋 Queue</span><span>💊 Rx</span>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Consultation — SOAP form</div>
  <div class="screen-body" style="font-size:8.5pt">
    <div style="font-size:10pt;font-weight:800;margin-bottom:2mm">Marie Nguema · OPD Visit #1842</div>
    <div class="soap-grid" style="margin:2mm 0">
      <span><strong>S:</strong> Headache 3 days…</span>
      <span><strong>O:</strong> BP 120/80, afebrile…</span>
      <span><strong>A:</strong> Tension headache</span>
      <span><strong>P:</strong> Paracetamol, rest…</span>
    </div>
    <div style="margin-top:2mm;font-size:7.5pt;color:#64748b">Orders: FBC · Chest X-ray · Paracetamol 500mg</div>
    <div style="margin-top:2mm"><span style="background:#059669;color:white;padding:1mm 3mm;border-radius:4px;font-size:7.5pt;font-weight:700">COMPLETE CONSULTATION</span></div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> OPD Queue — /opd-queue</div>
  <div class="screen-body" style="font-size:8pt">
    <table class="data" style="margin:0;font-size:7.5pt">
    <tr><td><strong>Jean Dupont</strong></td><td><span class="status-pill waiting">Waiting Doctor</span></td><td>Fever</td><td>Start →</td></tr>
    <tr><td><strong>Amina Bello</strong></td><td><span class="status-pill consult">In Consultation</span></td><td>Cough</td><td>Open →</td></tr>
    </table>
  </div>
</div>

<div class="tip"><strong>Live screenshots:</strong> Open <code>/portal/doctor</code> or <code>/consultation-new</code> while signed in; Print → Save as PDF for training.</div>
`)}

${section('troubleshooting', '20. Troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Cannot start consultation</td><td>Verify patient paid consultation fee; check payment code validity</td></tr>
<tr><td>Patient not on consultation-new list</td><td>Ensure registered on OPD queue with vitals completed</td></tr>
<tr><td>Orders not appearing at cashier</td><td>Complete consultation — draft orders not released until finalized</td></tr>
<tr><td>Cannot prescribe without consultation</td><td>Create SOAP consultation first; IPD/ER have separate rules</td></tr>
<tr><td>Follow-up rejected at front desk</td><td>Document follow-up eligibility; check validity interval expired</td></tr>
<tr><td>Specialist fee mismatch</td><td>Cashier must assign matching specialist doctor at prepay</td></tr>
<tr><td>Lab/rad won't process order</td><td>Patient must pay at cashier for order lines first</td></tr>
<tr><td>Cannot issue admission</td><td>Complete consultation with admission recommendation</td></tr>
<tr><td>Clinical discharge blocked</td><td>Resolve pending critical results or treatments first</td></tr>
<tr><td>Telemedicine won't start</td><td>Confirm appointment; verify teleconsultation payment code entered</td></tr>
</table>
`)}

${section('glossary', '21. Glossary', `
<table class="data">
<tr><th>Term</th><th>Definition</th></tr>
<tr><td>SOAP</td><td>Subjective, Objective, Assessment, Plan — clinical note structure</td></tr>
<tr><td>Consultation</td><td>Doctor-patient encounter documented on OPD visit</td></tr>
<tr><td>OPD queue</td><td>Outpatient visit tracking from registration to completion</td></tr>
<tr><td>Payment code</td><td>Cashier-issued ticket for consultation or orders</td></tr>
<tr><td>Follow-up</td><td>Return visit under existing payment validity rules</td></tr>
<tr><td>Credit tab</td><td>Running unpaid charges during IPD/ER stay</td></tr>
<tr><td>Ward round</td><td>Daily inpatient review by doctor</td></tr>
<tr><td>Clinical discharge</td><td>Doctor declaration patient medically fit to leave</td></tr>
<tr><td>Admission request</td><td>Doctor order to begin IPD hospitalization</td></tr>
<tr><td>Telemedicine</td><td>Remote video consultation with payment code</td></tr>
<tr><td>External care</td><td>Services obtained outside hospital — documented only</td></tr>
</table>
`)}

<p class="footer-note">© ${esc(new Date().getFullYear())} ${esc(b.name)} · Doctor Users Manual v2.0 · ${esc(b.facilityName || b.orgName)} · Confidential</p>
</div>`;

  return wrapPremiumDoc({
    title: `Doctor User Manual — ${b.productName}`,
    variant: 'doctor-manual',
    bodyHtml: body,
  });
}

module.exports = { buildDoctorUsersManualHtml, DOCTOR_EXTRA_CSS };
