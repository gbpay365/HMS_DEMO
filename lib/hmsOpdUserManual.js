'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const OPD_EXTRA_CSS = `
:root[data-doc="opd-manual"] {
  --accent: #1a6bd8;
  --accent-light: #dbeafe;
  --opd-blue: #1a6bd8;
  --opd-green: #059669;
  --opd-amber: #d97706;
  --opd-violet: #7c3aed;
  --opd-pink: #be185d;
}
.role-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3mm;
  margin: 4mm 0 5mm;
}
.role-card {
  border-radius: 6px;
  padding: 3mm 4mm;
  border: 1px solid var(--line);
  break-inside: avoid;
}
.role-card .icon {
  font-size: 16pt;
  line-height: 1;
  margin-bottom: 1.5mm;
}
.role-card strong {
  display: block;
  font-size: 9pt;
  color: var(--ink);
  margin-bottom: 1mm;
}
.role-card span {
  font-size: 8pt;
  color: var(--muted);
  line-height: 1.35;
}
.wf-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 2mm;
  margin: 4mm 0;
}
.wf-chip {
  flex: 1 1 28mm;
  min-width: 24mm;
  text-align: center;
  border-radius: 4px;
  padding: 2mm 1.5mm;
  font-size: 7.5pt;
  font-weight: 600;
  border: 1px solid rgba(0,0,0,0.08);
  break-inside: avoid;
}
.wf-chip .n {
  display: inline-block;
  width: 4.5mm;
  height: 4.5mm;
  line-height: 4.5mm;
  border-radius: 50%;
  background: var(--navy);
  color: white;
  font-size: 6.5pt;
  margin-bottom: 1mm;
}
.screen {
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
  margin: 4mm 0 5mm;
  break-inside: avoid;
  box-shadow: 0 1px 4px rgba(12,35,64,0.08);
}
.screen-bar {
  background: linear-gradient(90deg, var(--navy), var(--navy-mid));
  color: rgba(255,255,255,0.9);
  padding: 2mm 3mm;
  font-size: 8pt;
  display: flex;
  align-items: center;
  gap: 2mm;
}
.screen-bar .dot {
  width: 2.5mm;
  height: 2.5mm;
  border-radius: 50%;
  background: #ef4444;
}
.screen-bar .dot:nth-child(2) { background: #f59e0b; }
.screen-bar .dot:nth-child(3) { background: #10b981; }
.screen-body {
  background: #f8fafc;
  padding: 4mm;
}
.visit-card-mock {
  display: inline-block;
  width: 52mm;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 4mm;
  padding: 3mm;
  font-size: 8pt;
  vertical-align: top;
  margin: 1.5mm;
}
.visit-card-mock .avatar {
  width: 8mm;
  height: 8mm;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  color: white;
  font-size: 7pt;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 2mm;
}
.visit-card-mock .status {
  display: inline-block;
  font-size: 6.5pt;
  font-weight: 700;
  padding: 0.5mm 2mm;
  border-radius: 99px;
  background: #fef3c7;
  color: #92400e;
}
.visit-card-mock .status.waiting { background: #dbeafe; color: #1e40af; }
.visit-card-mock .status.consult { background: #ede9fe; color: #5b21b6; }
.step-row {
  counter-reset: step;
  list-style: none;
  padding: 0;
  margin: 3mm 0;
}
.step-row li {
  counter-increment: step;
  margin: 0 0 2.5mm;
  padding: 2.5mm 3mm 2.5mm 9mm;
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 3px;
  font-size: 9pt;
  break-inside: avoid;
}
.step-row li::before {
  content: counter(step);
  position: absolute;
  left: 2.5mm;
  top: 2.5mm;
  width: 5mm;
  height: 5mm;
  border-radius: 50%;
  background: var(--opd-blue);
  color: white;
  font-size: 7pt;
  font-weight: 700;
  text-align: center;
  line-height: 5mm;
}
.perm-pill {
  display: inline-block;
  font-size: 7pt;
  font-family: ui-monospace, monospace;
  background: #f1f5f9;
  padding: 0.5mm 2mm;
  border-radius: 2px;
  margin: 0.5mm;
}
.hero-img {
  width: 100%;
  max-height: 45mm;
  object-fit: cover;
  border-radius: 4px;
  margin: 3mm 0;
}
`;

function buildOpdUsersManualHtml() {
  const b = brand;
  const body = `
<style>${PREMIUM_CSS}${OPD_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'OPD User\'s Manual',
  title: 'Outpatient Department (OPD)',
  subtitle: 'Complete staff guide — registration, queue, triage, consultation, orders, billing, and visit completion for Front Desk, Cashier, Nursing, and Doctors.',
  badge: 'Premium · Professional Edition',
  variant: 'opd-manual',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)} OPD User's Manual</strong>. This document explains the full outpatient journey — from patient arrival through consultation, investigations, pharmacy, and visit completion.</p>
<div class="tip"><strong>Who should read this:</strong> Front Desk, Cashier, Nurses, Nursing Aids, Doctors, and supervisors who manage the OPD queue at <code>/opd-queue</code>.</div>

<div class="kpi-row">
  <div class="kpi"><strong>11</strong><span>Workflow stations</span></div>
  <div class="kpi"><strong>8</strong><span>Visit statuses</span></div>
  <div class="kpi"><strong>6+</strong><span>Staff roles</span></div>
</div>

<img class="hero-img" src="public/call-queue/photos/opd.jpg" alt="OPD waiting area" />

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#overview">OPD overview &amp; roles</a></li>
<li><a href="#workflow">11-station workflow</a></li>
<li><a href="#statuses">Visit statuses</a></li>
<li><a href="#front-desk">Front Desk procedures</a></li>
<li><a href="#cashier">Cashier &amp; payment codes</a></li>
<li><a href="#nursing">Nursing &amp; triage</a></li>
<li><a href="#doctor">Doctor consultation</a></li>
<li><a href="#orders">Lab, radiology &amp; pharmacy</a></li>
<li><a href="#rooms">Consultation rooms</a></li>
<li><a href="#follow-up">Follow-up visits</a></li>
<li><a href="#opd-med">OPD treatment &amp; drug chart</a></li>
<li><a href="#complete">Completing a visit</a></li>
<li><a href="#screens">Screen reference</a></li>
<li><a href="#troubleshooting">Troubleshooting</a></li>
<li><a href="#glossary">Glossary</a></li>
</ol>
</div>

${section('overview', '1. OPD Overview & Roles', `
<p>The <strong>Outpatient Department (OPD)</strong> manages same-day patient visits. Standard flow: patient pays consultation fee → Front Desk adds visit to queue → Nurse records vitals → Doctor consults → patient pays for orders → Lab/Radiology/Pharmacy process → Doctor completes visit.</p>

<div class="role-grid">
  <div class="role-card" style="background:#dbeafe;border-color:#93c5fd">
    <div class="icon">🖥</div>
    <strong>Front Desk</strong>
    <span>Register patients, add OPD visits, assign rooms, route to cashier</span>
  </div>
  <div class="role-card" style="background:#d1fae5;border-color:#6ee7b7">
    <div class="icon">💳</div>
    <strong>Cashier</strong>
    <span>Collect consultation fee and order payments; issue receipts &amp; payment codes</span>
  </div>
  <div class="role-card" style="background:#fef3c7;border-color:#fcd34d">
    <div class="icon">🩺</div>
    <strong>Nurse / Nursing Aid</strong>
    <span>Triage, record vitals (BP, temp, weight, SpO₂, pulse)</span>
  </div>
  <div class="role-card" style="background:#ede9fe;border-color:#c4b5fd">
    <div class="icon">👨‍⚕️</div>
    <strong>Doctor</strong>
    <span>Consultation, diagnosis, orders, prescriptions, complete visit</span>
  </div>
  <div class="role-card" style="background:#cffafe;border-color:#67e8f9">
    <div class="icon">🔬</div>
    <strong>Lab / Radiology</strong>
    <span>Verify payment codes, enter results, finalise reports</span>
  </div>
  <div class="role-card" style="background:#fce7f3;border-color:#f9a8d4">
    <div class="icon">💊</div>
    <strong>Pharmacy</strong>
    <span>Dispense paid prescriptions; OPD medication alerts</span>
  </div>
</div>

<h3>Key URLs</h3>
<table class="data">
<tr><th>Screen</th><th>Path</th><th>Typical roles</th></tr>
<tr><td>OPD Queue</td><td><code>/opd-queue</code></td><td>Front Desk, Nurse, Doctor</td></tr>
<tr><td>Front Desk portal</td><td><code>/portal/front-desk</code></td><td>Front Desk</td></tr>
<tr><td>Nurse portal</td><td><code>/portal/nurse</code></td><td>Nurse</td></tr>
<tr><td>Doctor portal</td><td><code>/portal/doctor</code></td><td>Doctor</td></tr>
<tr><td>Cashier</td><td><code>/cashier</code></td><td>Cashier</td></tr>
<tr><td>New consultation</td><td><code>/consultation-new</code></td><td>Doctor</td></tr>
<tr><td>Waiting screen (TV)</td><td><code>/hms/waiting-screen</code></td><td>Lobby display</td></tr>
<tr><td>Room configuration</td><td><code>/admin/consultation-rooms</code></td><td>Admin, Director</td></tr>
</table>

<div class="note"><strong>Permissions:</strong> Menus and actions depend on your role. Required permissions include <span class="perm-pill">opd.read</span> <span class="perm-pill">opd.write</span> <span class="perm-pill">nursing.write</span> <span class="perm-pill">clinical.write</span> <span class="perm-pill">cashier.write</span>.</div>
`)}

${section('workflow', '2. Eleven-Station OPD Workflow', `
<p>The OPD workflow banner on the queue page shows the patient journey through <strong>11 stations</strong>. Existing patients may skip registration; new patients register first.</p>

<div class="wf-strip">
  <div class="wf-chip" style="background:#eef2ff"><span class="n">1</span><br/>🚶 Patient arrives</div>
  <div class="wf-chip" style="background:#dbeafe"><span class="n">2</span><br/>🖥 Front Desk check-in</div>
  <div class="wf-chip" style="background:#dbeafe"><span class="n">3</span><br/>📋 Registration<br/><small>new only</small></div>
  <div class="wf-chip" style="background:#d1fae5"><span class="n">4</span><br/>💳 Cashier consult fee</div>
  <div class="wf-chip" style="background:#dbeafe"><span class="n">5</span><br/>🖥 OPD Queue</div>
  <div class="wf-chip" style="background:#fef3c7"><span class="n">6</span><br/>🩺 Nurse vitals</div>
  <div class="wf-chip" style="background:#ede9fe"><span class="n">7</span><br/>👨‍⚕️ Doctor consult</div>
  <div class="wf-chip" style="background:#d1fae5"><span class="n">8</span><br/>💳 Cashier orders</div>
  <div class="wf-chip" style="background:#cffafe"><span class="n">9</span><br/>🔬 Lab tests</div>
  <div class="wf-chip" style="background:#cffafe"><span class="n">10</span><br/>📡 Radiology</div>
  <div class="wf-chip" style="background:#fce7f3"><span class="n">11</span><br/>💊 Pharmacy</div>
</div>

<div class="flow">Patient Arrives → Front Desk Check-in → [Registration if new] → Cashier (Consult Fee)
→ Front Desk (Add to OPD Queue) → Nurse (Triage/Vitals) → Doctor (Consultation)
→ [Orders?] → Cashier (Pay Orders) → Lab / Radiology → Doctor (Review) → Pharmacy → Completed</div>

<h3>Step-by-step (all roles)</h3>
<ol class="step-row">
<li><strong>Cashier</strong> — Collect consultation fee. Issue receipt to patient. <span class="perm-pill">cashier.write</span></li>
<li><strong>Front Desk</strong> — Register patient. Add to OPD Queue under correct department. <span class="perm-pill">opd.write</span></li>
<li><strong>Nurse</strong> — Select patient. Record vitals: BP, Temp, Weight, SpO₂, Pulse. Status → Waiting Doctor. <span class="perm-pill">nursing.write</span></li>
<li><strong>Doctor</strong> — Open consultation. Record notes, diagnosis, orders (lab/imaging/prescriptions). <span class="perm-pill">consult.write</span></li>
<li><strong>Cashier</strong> — Patient pays for all investigation and medication orders before processing.</li>
<li><strong>Lab / Radiology</strong> — Run tests; upload results to patient chart.</li>
<li><strong>Pharmacist</strong> — Dispense paid prescriptions.</li>
<li><strong>Doctor</strong> — Review results. Finalize diagnosis. Mark visit Completed.</li>
</ol>
<div class="tip"><strong>Footnote:</strong> Station 2 — Existing patients skip to Station 4 (Cashier). New patients go to Station 3 (Registration) first. After payment → Station 5 (OPD Queue).</div>
`)}

${section('statuses', '3. Visit Statuses', `
<p>Each OPD visit progresses through defined queue statuses. Cards on <code>/opd-queue</code> show the current status with color-coded badges.</p>

<table class="data">
<tr><th>Status</th><th>Meaning</th><th>Next action</th></tr>
<tr><td><span class="pill">Registered</span></td><td>Visit added to queue; payment may be pending</td><td>Nurse starts triage / vitals</td></tr>
<tr><td><span class="pill">Triage</span></td><td>Vitals in progress</td><td>Complete vitals → Waiting Doctor</td></tr>
<tr><td><span class="pill">Waiting doctor</span></td><td>Vitals recorded; patient waiting</td><td>Doctor opens consultation</td></tr>
<tr><td><span class="pill">In consultation</span></td><td>Doctor actively consulting</td><td>Record orders; advance status</td></tr>
<tr><td><span class="pill">Orders pending</span></td><td>Orders placed; payment/processing needed</td><td>Cashier payment → departments</td></tr>
<tr><td><span class="pill">Billing</span></td><td>Final billing stage</td><td>Settle charges; complete visit</td></tr>
<tr><td><span class="pill">Completed</span></td><td>Visit finished</td><td>—</td></tr>
<tr><td><span class="pill">Cancelled</span></td><td>Visit cancelled</td><td>—</td></tr>
</table>

<div class="flow">Registered → Triage → Waiting Doctor → In Consultation → Orders Pending → Billing → Completed</div>

<h3>Carry-forward rule</h3>
<p>Patients <strong>not consulted yesterday</strong> are automatically returned to today's active queue each morning with a <strong>renewed queue number</strong> (first in line). Use <strong>Return to today's queue</strong> from the visit menu when needed.</p>
`)}

${section('front-desk', '4. Front Desk Procedures', `
<h3>Opening the OPD queue</h3>
<ol>
<li>Sign in and open <strong>Clinical → OPD queue</strong> or <code>/opd-queue</code>.</li>
<li>Review <strong>Active Queue — Today</strong> for current visits.</li>
<li>Use <strong>+ New Visit</strong> to add a patient after consultation fee is paid.</li>
</ol>

<h3>Adding a new visit</h3>
<ol class="step-row">
<li>Confirm patient paid <strong>consultation fee</strong> at cashier (unless emergency waiver).</li>
<li>Click <strong>+ New Visit</strong> on OPD queue.</li>
<li>Search and select the patient.</li>
<li>Choose <strong>department</strong> and referring doctor if applicable.</li>
<li>Save — patient receives a <strong>queue number</strong> and status <em>Registered</em>.</li>
</ol>

<h3>Existing vs new patients</h3>
<ul>
<li><strong>Existing patients</strong> — Front Desk check-in only; skip registration.</li>
<li><strong>New patients</strong> — Register via <code>/patients</code> first (demographics, contact, ID).</li>
</ul>

<h3>Visit registry &amp; filters</h3>
<p>The <strong>Visit Registry</strong> section lists historical visits. Filter by name, ticket, date range, status, or department. Sort newest/oldest as needed.</p>

<div class="warn"><strong>Emergency visits:</strong> Tick <strong>Emergency / Waiver</strong> at registration to bypass consultation prepayment. See Emergency module guide for full A&amp;E workflow.</div>
`)}

${section('cashier', '5. Cashier & Payment Codes', `
<h3>Consultation fee (OPD entry)</h3>
<p>Standard OPD: patient pays <strong>consultation fee first</strong>, then returns to Front Desk for queue registration. Without valid payment, vitals and consultation may be blocked.</p>

<h3>Payment codes</h3>
<p>Each paid service generates an alphanumeric <strong>payment code</strong> (e.g. <code>CON-4829-K7HM3R9Q</code>). Codes are used to:</p>
<ul>
<li>Verify payment before lab, radiology, or pharmacy</li>
<li>Track partial payments on multi-line tickets</li>
<li>Support follow-up consultations within validity rules</li>
</ul>

<h3>Collecting payment for orders</h3>
<ol class="step-row">
<li>Patient returns from doctor with new orders.</li>
<li>Load payment code at <code>/cashier</code> or Cashier portal.</li>
<li>Review line items (lab, radiology, pharmacy, procedures).</li>
<li>Accept full or <strong>partial payment</strong> — balance stays on same code.</li>
<li>Print receipt; patient proceeds to departments.</li>
</ol>

<h3>Insurance co-pay</h3>
<p>When insurance is on the patient chart, the cashier applies configured <strong>insurer share %</strong> automatically.</p>
`)}

${section('nursing', '6. Nursing & Triage', `
<h3>Starting triage</h3>
<ol class="step-row">
<li>On OPD queue, locate the patient card (status <em>Registered</em>).</li>
<li>Click <strong>Start Triage</strong> or <strong>Triage / Vitals</strong>.</li>
<li>If payment is invalid, system shows <strong>Payment required</strong> — send patient to cashier first.</li>
<li>Enter vitals: blood pressure, temperature, weight, SpO₂, pulse rate.</li>
<li>Save — status advances to <strong>Waiting Doctor</strong>.</li>
</ol>

<h3>Vitals on the card</h3>
<p>After recording, the card shows vitals timestamp. Nurses cannot edit vitals once the patient is in consultation or waiting for doctor (locked state).</p>

<h3>Optional vitals</h3>
<p>Vitals may be optional for some workflows, but doctors typically require them before consultation opens. Front Desk staff without clinical write permission see queue cards in read-only mode.</p>

<h3>Assign consultation room</h3>
<p>Nursing or Front Desk can assign a physical room from the patient card when rooms are configured. Room appears on waiting-screen TV.</p>
`)}

${section('doctor', '7. Doctor Consultation', `
<h3>Opening a consultation</h3>
<ol class="step-row">
<li>From OPD queue, click <strong>Consult</strong> on your assigned patient (or unassigned queue).</li>
<li>System opens <code>/consultation-new</code> with patient and visit context.</li>
<li>Record chief complaint, history, examination, diagnosis.</li>
<li>Add orders: laboratory, radiology, prescriptions, procedures.</li>
<li>Mark <em>external</em> when care is outside the hospital.</li>
<li>Complete consultation — payment code generated for new orders if applicable.</li>
</ol>

<h3>Doctor-assigned queue split</h3>
<p>When enabled, doctors see <strong>Assigned to you</strong> separately from other physicians and unassigned visits. Your patients' cards highlight with a green border.</p>

<h3>Consultation prerequisites</h3>
<ul>
<li>Valid consultation payment (or emergency waiver)</li>
<li>Vitals recorded (for statuses triage / waiting doctor)</li>
<li>Patient not already completed or cancelled</li>
</ul>

<h3>Follow-up vs new consultation</h3>
<p>Returning patients may qualify for <strong>Follow Up</strong> under prior payment code if documented and validity rules pass. Otherwise patient needs new consultation payment — use <strong>New Consultation (payment)</strong>.</p>
`)}

${section('orders', '8. Lab, Radiology & Pharmacy', `
<h3>After doctor orders</h3>
<ol class="step-row">
<li>Patient pays at cashier (Station 8).</li>
<li>Lab technician verifies payment code → enters results → finalises.</li>
<li>Radiologist verifies code → uploads report → finalises.</li>
<li>Pharmacist dispenses paid prescriptions.</li>
<li>Doctor reviews results on chart and advances visit toward completion.</li>
</ol>

<div class="warn"><strong>Unpaid orders:</strong> Lab and radiology cannot process unpaid orders. Send patient to cashier first.</div>

<h3>OPD orders billing modal</h3>
<p>Doctors and cashiers can open the <strong>Orders bill</strong> modal from the visit card to review line items, refunds, or consolidated billing for the visit.</p>
`)}

${section('rooms', '9. Consultation Rooms', `
<p>Physical consultation rooms link to doctors and display on OPD cards and the lobby waiting screen.</p>

<h3>Configure rooms (Admin)</h3>
<ol>
<li>Open <strong>Settings → Room configuration</strong> (<code>/admin/consultation-rooms</code>).</li>
<li>Add room: code (e.g. R1), display name, department, sort order.</li>
<li>Assign doctors who use that room.</li>
</ol>

<h3>Assign on visit</h3>
<p>From the patient card menu: <strong>Assign consultation room</strong>. Override auto-detected room for this visit. Waiting screen shows room and queue number.</p>
`)}

${section('follow-up', '10. Follow-Up Visits', `
<p>Follow-up allows a returning patient to consult without a new consultation fee when:</p>
<ul>
<li>Prior visit documented follow-up eligibility</li>
<li>Payment code still valid (uses / max uses / date rules)</li>
<li>Doctor selects <strong>Follow Up</strong> from visit menu</li>
</ul>
<p>If follow-up is blocked, the system shows a message — patient must pay for a new consultation.</p>
`)}

${section('opd-med', '11. OPD Treatment & Drug Chart', `
<p>For multi-day outpatient treatment with scheduled doses:</p>
<ul>
<li><strong>Doctor:</strong> <code>/opd/treatment/:visit_id</code> — start treatment, prescriptions, dose schedule</li>
<li><strong>Nurse:</strong> <code>/opd/chart/:visit_id</code> — administer doses, drug chart</li>
<li>Terminate active treatment before starting a new course on the same visit</li>
</ul>
<p>Medication administered triggers alerts to the prescribing doctor when configured.</p>
`)}

${section('complete', '12. Completing a Visit', `
<ol class="step-row">
<li>All orders paid and processed (or explicitly cancelled/documented).</li>
<li>Doctor reviews results and final diagnosis.</li>
<li>From visit menu: <strong>Mark Completed</strong>.</li>
<li>Status → <strong>Completed</strong>; patient leaves OPD flow.</li>
</ol>
<p>Use <strong>Cancel Visit</strong> only when visit should not proceed — requires confirmation.</p>
<p><strong>Record death</strong> links to death registry for in-hospital mortality documentation when applicable.</p>
`)}

${section('screens', '13. Screen Reference (UI)', `
<p>The following panels illustrate key OPD screens. Your live system uses the React OPD queue with the same layout and actions.</p>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> OPD Queue — /opd-queue</div>
  <div class="screen-body">
    <div style="font-size:8pt;font-weight:700;color:#0c2340;margin-bottom:2mm">Active Queue — Today · 3 active</div>
    <div class="visit-card-mock">
      <span class="avatar">JD</span>
      <strong>Jane Doe</strong><br/>
      <span class="status waiting">Waiting doctor</span><br/>
      <small>Queue No 12 · General · Dr. Smith</small><br/>
      <small>Vitals: 09:42 · Room R2</small>
    </div>
    <div class="visit-card-mock">
      <span class="avatar">PK</span>
      <strong>Paul K.</strong><br/>
      <span class="status">Registered</span><br/>
      <small>Queue No 13 · Cardiology</small><br/>
      <small style="color:#059669">▶ Triage / Vitals</small>
    </div>
    <div class="visit-card-mock" style="border-color:#10b981;box-shadow:0 0 0 2px rgba(16,185,129,0.2)">
      <span class="avatar">AM</span>
      <strong>Alice M.</strong> <small style="color:#059669">Yours</small><br/>
      <span class="status consult">In consultation</span><br/>
      <small>Queue No 11 · Pediatrics</small>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> OPD Workflow Banner</div>
  <div class="screen-body">
    <div class="wf-strip" style="margin:0">
      <div class="wf-chip" style="background:#eef2ff;font-size:6.5pt">1 Arrives</div>
      <div class="wf-chip" style="background:#dbeafe;font-size:6.5pt">4 Cashier</div>
      <div class="wf-chip" style="background:#dbeafe;font-size:6.5pt">5 Queue</div>
      <div class="wf-chip" style="background:#fef3c7;font-size:6.5pt">6 Vitals</div>
      <div class="wf-chip" style="background:#ede9fe;font-size:6.5pt">7 Doctor</div>
      <div class="wf-chip" style="background:#d1fae5;font-size:6.5pt">8 Pay</div>
      <div class="wf-chip" style="background:#cffafe;font-size:6.5pt">9 Lab</div>
      <div class="wf-chip" style="background:#fce7f3;font-size:6.5pt">11 Rx</div>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Triage Modal — Vitals</div>
  <div class="screen-body" style="font-size:8.5pt">
    <strong>Record vitals</strong>
    <table class="data" style="margin:2mm 0;font-size:8pt">
    <tr><td>BP</td><td>120/80 mmHg</td></tr>
    <tr><td>Temp</td><td>36.8 °C</td></tr>
    <tr><td>Weight</td><td>68 kg</td></tr>
    <tr><td>SpO₂</td><td>98%</td></tr>
    <tr><td>Pulse</td><td>72 bpm</td></tr>
    </table>
    <span style="background:#1a6bd8;color:white;padding:1mm 3mm;border-radius:3px;font-size:7.5pt">Save vitals</span>
  </div>
</div>

<div class="tip"><strong>Live screenshots:</strong> Open <code>/opd-queue</code> while signed in, use browser Print → Save as PDF to capture your site's exact appearance for local training materials.</div>
`)}

${section('troubleshooting', '14. Troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Cannot start triage — payment required</td><td>Patient must pay consultation fee at cashier first; verify payment code validity</td></tr>
<tr><td>Consult button disabled</td><td>Record vitals first; ensure valid payment; check visit not completed</td></tr>
<tr><td>Patient missing from today's queue</td><td>Check Visit Registry filters; use Return to today's queue if carried from yesterday</td></tr>
<tr><td>Lab/Radiology rejects order</td><td>Confirm cashier payment for that order line</td></tr>
<tr><td>Follow-up blocked</td><td>Payment code expired or max uses reached — new consultation fee required</td></tr>
<tr><td>No consultation rooms on card</td><td>Configure rooms under Settings → Room configuration</td></tr>
<tr><td>Wrong doctor sees patient</td><td>Assign doctor on visit; use room assignment; check doctor queue split</td></tr>
</table>
`)}

${section('glossary', '15. Glossary', `
<table class="data">
<tr><th>Term</th><th>Definition</th></tr>
<tr><td>OPD</td><td>Outpatient Department — same-day visits without admission</td></tr>
<tr><td>Queue number</td><td>Daily ticket number for waiting-screen and triage order</td></tr>
<tr><td>Payment code</td><td>Alphanumeric code proving payment for consultation or orders</td></tr>
<tr><td>Triage</td><td>Nurse assessment including vital signs before doctor</td></tr>
<tr><td>Carry-forward</td><td>Unconsulted visit moved to next day's queue automatically</td></tr>
<tr><td>Follow-up</td><td>Return visit under prior payment validity without new consult fee</td></tr>
<tr><td>Consultation room</td><td>Physical room linked to doctors for waiting-screen display</td></tr>
</table>
`)}

<p class="footer-note">© ${esc(new Date().getFullYear())} ${esc(b.name)} · OPD Users Manual v2.0 · ${esc(b.facilityName || b.orgName)} · Confidential</p>
</div>`;

  return wrapPremiumDoc({
    title: `OPD User's Manual — ${b.productName}`,
    variant: 'opd-manual',
    bodyHtml: body,
  });
}

module.exports = { buildOpdUsersManualHtml, OPD_EXTRA_CSS };
