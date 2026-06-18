'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const EMERGENCY_EXTRA_CSS = `
:root[data-doc="emergency-manual"] {
  --accent: #ef4444;
  --accent-light: #fee2e2;
  --er-red: #ef4444;
  --er-dark: #7f1d1d;
  --er-amber: #f59e0b;
  --er-green: #059669;
  --er-blue: #1a6bd8;
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
  border-radius: 50%; background: var(--er-dark); color: white; font-size: 6.5pt; margin-bottom: 1mm;
}
.phase-banner {
  background: linear-gradient(90deg, #fee2e2 0%, transparent 100%);
  border-left: 4px solid var(--er-red);
  padding: 2.5mm 4mm; margin: 4mm 0 3mm;
  font-size: 9pt; font-weight: 700; color: var(--er-dark);
  letter-spacing: 0.04em; text-transform: uppercase;
}
.screen {
  border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  margin: 4mm 0 5mm; break-inside: avoid; box-shadow: 0 1px 4px rgba(127,29,29,0.1);
}
.screen-bar {
  background: linear-gradient(90deg, #7f1d1d, #991b1b);
  color: rgba(255,255,255,0.92); padding: 2mm 3mm; font-size: 8pt;
  display: flex; align-items: center; gap: 2mm;
}
.screen-bar .dot { width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #fca5a5; }
.screen-bar .dot:nth-child(2) { background: #fcd34d; }
.screen-bar .dot:nth-child(3) { background: #86efac; }
.screen-body { background: #fef2f2; padding: 4mm; }
.lane-card {
  display: block; background: white; border-left: 3px solid var(--er-red);
  border-radius: 3mm; padding: 2.5mm 3mm; margin: 0 0 2mm; font-size: 8pt;
}
.lane-card.l1 { border-left-color: #7f1d1d; background: #fef2f2; }
.lane-card.l2 { border-left-color: #b45309; }
.lane-card.l3 { border-left-color: #92400e; }
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
  width: 5mm; height: 5mm; border-radius: 50%; background: var(--er-red);
  color: white; font-size: 7pt; font-weight: 700; text-align: center; line-height: 5mm;
}
.perm-pill {
  display: inline-block; font-size: 7pt; font-family: ui-monospace, monospace;
  background: #f1f5f9; padding: 0.5mm 2mm; border-radius: 2px; margin: 0.5mm;
}
.hero-img { width: 100%; max-height: 45mm; object-fit: cover; border-radius: 4px; margin: 3mm 0; }
.acuity-pill {
  display: inline-block; font-size: 7pt; font-weight: 700; padding: 0.5mm 2mm;
  border-radius: 99px; margin: 0.5mm;
}
.acuity-pill.l1 { background: #fee2e2; color: #7f1d1d; }
.acuity-pill.l2 { background: #fef3c7; color: #b45309; }
.acuity-pill.l3 { background: #fef9c3; color: #92400e; }
.acuity-pill.l4 { background: #dcfce7; color: #166534; }
.acuity-pill.l5 { background: #dbeafe; color: #1e40af; }
.danger-box {
  background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626;
  padding: 3mm 4mm; margin: 3mm 0; border-radius: 0 4px 4px 0; font-size: 9pt;
}
`;

function buildEmergencyUsersManualHtml() {
  const b = brand;
  const body = `
<style>${PREMIUM_CSS}${EMERGENCY_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'Emergency User Manual',
  title: 'Emergency / A&E Department',
  subtitle: 'Complete staff guide — rapid registration, triage, concurrent care, parallel orders, disposition, medico-legal cases, and retrospective billing.',
  badge: 'Premium · Professional Edition',
  variant: 'emergency-manual',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)} Emergency User Manual</strong>. This document covers the full Accident &amp; Emergency (A&amp;E) workflow — designed for critical patients where <strong>prepayment is bypassed</strong> and care begins immediately on a <strong>credit tab</strong>.</p>

<div class="danger-box"><strong>Critical rule:</strong> For emergency patients, select <strong>Emergency / Waiver</strong> at registration (or use A&amp;E Quick Registration). This activates prepayment bypass and routes the case to the Emergency board — not standard OPD cashier-first flow.</div>

<div class="kpi-row">
  <div class="kpi"><strong>4</strong><span>Clinical phases</span></div>
  <div class="kpi"><strong>8</strong><span>Workflow steps</span></div>
  <div class="kpi"><strong>6</strong><span>Acuity levels</span></div>
</div>

<img class="hero-img" src="public/call-queue/photos/nurses.jpg" alt="Emergency nursing care" />

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#overview">Emergency overview &amp; roles</a></li>
<li><a href="#phases">Four-phase ER workflow</a></li>
<li><a href="#eight-steps">Eight-step process</a></li>
<li><a href="#acuity">Acuity &amp; triage levels</a></li>
<li><a href="#board">Emergency board</a></li>
<li><a href="#registration">Quick registration</a></li>
<li><a href="#triage">Phase 1 — Triage</a></li>
<li><a href="#consultation">Phase 2 — SOAP &amp; orders</a></li>
<li><a href="#disposition">Phase 3 — Disposition</a></li>
<li><a href="#charges">Phase 4 — Charges &amp; settlement</a></li>
<li><a href="#mlc">Medico-legal cases (MLC)</a></li>
<li><a href="#admit">ER → IPD admission</a></li>
<li><a href="#cashier">Retrospective billing</a></li>
<li><a href="#kpi">KPI dashboard</a></li>
<li><a href="#alerts">Doctor ER alerts</a></li>
<li><a href="#screens">Screen reference</a></li>
<li><a href="#troubleshooting">Troubleshooting</a></li>
<li><a href="#glossary">Glossary</a></li>
</ol>
</div>

${section('overview', '1. Emergency Overview & Roles', `
<p><strong>Emergency / A&amp;E</strong> manages critically ill or injured patients with concurrent nursing and medical assessment. Orders and medications accumulate on an open <strong>credit tab</strong> until disposition and cashier settlement.</p>

<div class="role-grid">
  <div class="role-card" style="background:#fee2e2;border-color:#fca5a5">
    <div class="icon">🚑</div>
    <strong>Front Desk</strong>
    <span>Rapid registration, Emergency/Waiver, A&amp;E quick reg — bypass prepayment</span>
  </div>
  <div class="role-card" style="background:#fef3c7;border-color:#fcd34d">
    <div class="icon">🩺</div>
    <strong>Nurse / Nursing Aid</strong>
    <span>Immediate vitals, acuity assignment, bed assignment, continuous monitoring</span>
  </div>
  <div class="role-card" style="background:#ede9fe;border-color:#c4b5fd">
    <div class="icon">👨‍⚕️</div>
    <strong>Doctor</strong>
    <span>Immediate assessment, SOAP, parallel orders (lab/rad/pharm/blood), disposition</span>
  </div>
  <div class="role-card" style="background:#cffafe;border-color:#67e8f9">
    <div class="icon">🔬</div>
    <strong>Lab / Radiology</strong>
    <span>Urgent investigations — STAT priority; results to chart immediately</span>
  </div>
  <div class="role-card" style="background:#fce7f3;border-color:#f9a8d4">
    <div class="icon">💊</div>
    <strong>Pharmacy</strong>
    <span>Stat doses, emergency medications on credit tab</span>
  </div>
  <div class="role-card" style="background:#d1fae5;border-color:#6ee7b7">
    <div class="icon">💳</div>
    <strong>Cashier</strong>
    <span>Retrospective bill presentation and settlement after stabilization</span>
  </div>
</div>

<h3>Key URLs</h3>
<table class="data">
<tr><th>Screen</th><th>Path</th><th>Roles</th></tr>
<tr><td>Emergency board</td><td><code>/emergency</code></td><td>All A&amp;E staff</td></tr>
<tr><td>ER visit chart</td><td><code>/emergency/visit/:id</code></td><td>Doctor, Nurse</td></tr>
<tr><td>ER KPI dashboard</td><td><code>/emergency/kpi</code></td><td>Supervisors, Admin</td></tr>
<tr><td>Doctor ER alerts</td><td><code>/doctor/er-inbox</code></td><td>Doctor</td></tr>
<tr><td>OPD queue (switch)</td><td><code>/opd-queue</code></td><td>Front Desk — Emergency/Waiver</td></tr>
<tr><td>Ward board / ADT</td><td><code>/wards</code></td><td>Admit from ER</td></tr>
<tr><td>ER cashier tab</td><td><code>/cashier</code> (A&amp;E filter)</td><td>Cashier</td></tr>
</table>

<div class="note"><strong>Separate from OPD:</strong> Emergency patients on the ER board do not appear on the standard OPD queue when assigned to an ER doctor. <span class="perm-pill">emergency.read</span> <span class="perm-pill">emergency.write</span></div>
`)}

${section('phases', '2. Four-Phase ER Workflow', `
<p>The revamped Emergency module follows <strong>four clinical phases</strong> on each visit chart (<code>/emergency/visit/:id</code>):</p>

<div class="phase-banner">Phase 1 — Arrival · Quick registration · Triage</div>
<p>Patient arrives → quick reg (existing or new/unknown) → acuity level, vitals, flags, chief complaint, bed assignment.</p>

<div class="phase-banner">Phase 2 — Parallel orders · SOAP consultation</div>
<p>Doctor assessment concurrent with nursing. Place STAT lab, radiology, pharmacy, blood bank, or procedure orders on credit tab.</p>

<div class="phase-banner">Phase 3 — Disposition</div>
<p>Once stabilized: discharge home, short stay (SSU), admit IPD, direct to OT, transfer out, deceased, or left without being seen (LWBS).</p>

<div class="phase-banner">Phase 4 — Charge capture · ER closure · Bill settlement</div>
<p>Real-time charges on open tab → confirm disposition → cashier retrospective settlement → visit closed.</p>

<div class="flow">Arrival → Triage (Acuity + Vitals) → Doctor SOAP + Orders (concurrent)
→ Disposition → Charges settled at Cashier → [Admit to IPD if required]</div>
`)}

${section('eight-steps', '3. Eight-Step Emergency Process', `
<p>Role-based steps aligned with workflow guides and live ER board:</p>

<ol class="step-row">
<li><strong>Front Desk</strong> — Rapid registration. Tick <strong>Emergency / Waiver</strong>. No prepayment — billing exception created. <span class="perm-pill">opd.write</span></li>
<li><strong>System</strong> — Auto-routed to Emergency/A&amp;E. Status → Waiting Doctor. ER widgets update on dashboards.</li>
<li><strong>Nurse</strong> — Record vitals immediately: BP, Temp, SpO₂, Pulse, GCS, pain score. Concurrent with doctor. <span class="perm-pill">nursing.write</span></li>
<li><strong>Doctor</strong> — Immediate assessment and treatment. Rapid orders (IV, bloods, imaging, meds) on credit tab. <span class="perm-pill">consult.write</span></li>
<li><strong>Lab / Radiology</strong> — Process urgent investigations. Upload results immediately to chart.</li>
<li><strong>Pharmacist</strong> — Dispense emergency medications. Costs on credit tab.</li>
<li><strong>Doctor</strong> — Once stabilized: admit to IPD, or discharge with documented disposition.</li>
<li><strong>Cashier</strong> — Present retrospective bill. Settle all emergency charges. Issue receipt.</li>
</ol>
`)}

${section('acuity', '4. Acuity & Triage Levels', `
<p>Triage assigns an <strong>acuity level</strong> (L0–L5) with SLA targets for door-to-doctor time. Patients appear in color-coded lanes on the Emergency board.</p>

<table class="data">
<tr><th>Level</th><th>Label</th><th>SLA</th><th>Typical presentation</th></tr>
<tr><td><span class="acuity-pill">L0</span></td><td>Awaiting triage</td><td>—</td><td>Just registered — assign acuity</td></tr>
<tr><td><span class="acuity-pill l1">L1</span></td><td>Resuscitation</td><td>Immediate</td><td>Cardiac arrest, major trauma</td></tr>
<tr><td><span class="acuity-pill l2">L2</span></td><td>Emergent</td><td>&lt; 10 min</td><td>Chest pain, stroke symptoms</td></tr>
<tr><td><span class="acuity-pill l3">L3</span></td><td>Urgent</td><td>&lt; 30 min</td><td>Moderate injury, fever</td></tr>
<tr><td><span class="acuity-pill l4">L4</span></td><td>Less urgent</td><td>&lt; 60 min</td><td>Minor laceration, mild symptoms</td></tr>
<tr><td><span class="acuity-pill l5">L5</span></td><td>Non-urgent</td><td>&lt; 120 min</td><td>Primary care suitable</td></tr>
</table>

<h3>Triage flags</h3>
<p>Mark clinical flags during triage: Trauma, Cardiac, Stroke, Pediatric, Psychiatric, Obstetric — for routing and KPI reporting.</p>

<h3>ER bays</h3>
<ul>
<li><strong>Resuscitation</strong> — critical care bay</li>
<li><strong>Holding</strong> — pending bed or disposition</li>
<li><strong>Observation</strong> — short-term monitoring</li>
<li><strong>Short Stay Unit (SSU)</strong> — &lt; 24h observation pathway</li>
</ul>
`)}

${section('board', '5. Emergency Board', `
<p>The live <strong>Emergency Department</strong> board at <code>/emergency</code> shows:</p>
<ul>
<li><strong>KPI strip</strong> — active cases, awaiting triage, critical alerts, door→doctor median, open MLC cases</li>
<li><strong>Credit tabs summary</strong> — total FCFA across open emergency visits</li>
<li><strong>Acuity lanes</strong> — patients grouped by L0–L5 with wait times and SLA highlighting</li>
<li><strong>My ER patients</strong> — doctor-assigned cases (not on OPD queue)</li>
</ul>

<h3>Opening a visit</h3>
<p>Click any lane card to open <code>/emergency/visit/:id</code> — full four-phase chart with triage, orders, disposition, and charges.</p>

<div class="tip">Top navigation <strong>ER</strong> link (red) opens the Emergency board directly from any screen for urgent access.</div>
`)}

${section('registration', '6. Quick Registration', `
<h3>A&amp;E Quick Registration modal</h3>
<ol class="step-row">
<li>Click <strong>New emergency patient</strong> on Emergency board.</li>
<li><strong>Phase 1 — Arrival:</strong> choose existing patient or new/unknown.</li>
<li>For new: enter name, gender, phone (or Unknown), chief complaint.</li>
<li>Assign doctor (or any available).</li>
<li>Submit <strong>Register &amp; start triage</strong> — bypasses cashier prepayment.</li>
</ol>

<h3>From OPD queue</h3>
<p>When adding an OPD visit, tick <strong>Emergency</strong> — system prompts switch to A&amp;E Quick Registration with waiver message.</p>

<h3>Unknown / walk-in</h3>
<p>Use <strong>New / Unknown</strong> path for unidentified patients; complete demographics when available during care.</p>
`)}

${section('triage', '7. Phase 1 — Triage', `
<p>On the ER visit chart, complete <strong>Phase 1 · Triage</strong>:</p>
<ol class="step-row">
<li>Set <strong>Acuity Level</strong> (L1–L5).</li>
<li>Enter vitals: BP sys/dia, pulse, SpO₂, temp, respiratory rate, GCS, pain 0–10.</li>
<li>Set triage flags (trauma, cardiac, stroke, etc.).</li>
<li>Record <strong>Chief complaint</strong> (clinical).</li>
<li><strong>Assign bed</strong> in resuscitation, holding, observation, or SSU bay.</li>
<li>Save triage — vitals sync to nursing chart for OPD consultation rules.</li>
</ol>

<p>Update triage as condition changes. Critical results trigger alerts on the board.</p>
`)}

${section('consultation', '8. Phase 2 — SOAP & Parallel Orders', `
<h3>Consultation workflow</h3>
<ol class="step-row">
<li><strong>Mark Doctor Seen</strong> — starts door-to-doctor KPI timer.</li>
<li><strong>Create consultation</strong> — SOAP note required before prescriptions and some clinical docs.</li>
<li>Concurrent nursing continues vitals and monitoring.</li>
<li>Use <strong>Phase 2 · Parallel Orders</strong> for urgent requests.</li>
</ol>

<h3>Order types</h3>
<table class="data">
<tr><th>Type</th><th>Examples</th><th>Priority</th></tr>
<tr><td>Laboratory</td><td>CBC, cross-match, blood gas</td><td>STAT / Urgent / Routine</td></tr>
<tr><td>Radiology</td><td>Chest X-ray, CT head</td><td>STAT</td></tr>
<tr><td>Pharmacy</td><td>Stat dose medications</td><td>STAT</td></tr>
<tr><td>Blood bank</td><td>Transfusion products</td><td>STAT</td></tr>
<tr><td>Procedure</td><td>Suturing, chest drain</td><td>Urgent</td></tr>
</table>

<p>Orders show charge preview on credit tab. Lab/radiology alert department inboxes — use <strong>New Order</strong> in Phase 2 for tests (Phase 4 charges alone do not authorize tests).</p>
`)}

${section('disposition', '9. Phase 3 — Disposition', `
<p>When clinically stable, choose a <strong>disposition pathway</strong>:</p>

<table class="data">
<tr><th>Pathway</th><th>When to use</th></tr>
<tr><td><strong>Discharge home</strong></td><td>Stabilized — settle bill at cashier; take-home meds &amp; return precautions</td></tr>
<tr><td><strong>Short Stay (SSU)</strong></td><td>&lt; 24h observation before final disposition</td></tr>
<tr><td><strong>Admit to IPD</strong></td><td>Requires hospitalization — ER charges transfer to IPD bill</td></tr>
<tr><td><strong>Direct to OT</strong></td><td>Emergency surgery — document procedure</td></tr>
<tr><td><strong>Transfer out</strong></td><td>Refer to another facility</td></tr>
<tr><td><strong>Deceased</strong></td><td>Record death — opens death registry</td></tr>
<tr><td><strong>LWBS</strong></td><td>Left without being seen — waives pending billing per policy</td></tr>
</table>

<p>Enter clinical summary and confirm disposition. Visit timeline records arrived, doctor first seen, and door→doctor minutes.</p>
`)}

${section('charges', '10. Phase 4 — Charges & Settlement', `
<p><strong>Phase 4 · Charges</strong> on the ER visit chart:</p>
<ul>
<li>View all line items on open credit tab</li>
<li>Add manual charges (catalog, pharmacy search, miscellaneous)</li>
<li>Mark items settled as cashier processes payment</li>
<li><strong>Total open tab</strong> displayed until closure</li>
</ul>

<p>After disposition, visit moves toward <strong>clinical discharge</strong> state — chart becomes read-only for clinical edits; awaiting financial settlement.</p>

<h3>EMG settlement tickets</h3>
<p>Cashier workspace shows emergency patients with unpaid charges. Filter A&amp;E badge cases for pending settlement.</p>
`)}

${section('mlc', '11. Medico-Legal Cases (MLC)', `
<p>For assault, RTA, poisoning, burns, sexual assault, and other notifiable cases:</p>
<ol class="step-row">
<li>Flag visit as <strong>MLC</strong> on ER chart.</li>
<li>Complete MLC form: case type, incident time/place, brought by, police details.</li>
<li>Document examination, injuries, provisional diagnosis.</li>
<li><strong>Notify police</strong> when required.</li>
<li><strong>Sign &amp; Lock</strong> — record becomes read-only; print triplicate copies.</li>
</ol>

<div class="warn">Once MLC is locked, it cannot be edited — only viewed and reprinted. Open MLC count appears on Emergency board KPIs.</div>
`)}

${section('admit', '12. ER → IPD Admission', `
<p>When disposition is <strong>Admit to IPD</strong>:</p>
<ol class="step-row">
<li>Doctor confirms admitting department and diagnosis.</li>
<li>System creates IPD admission request.</li>
<li>ER charges may <strong>transfer to IPD running bill</strong> when configured.</li>
<li>ADT assigns ward and bed on ward board.</li>
<li>Follow IPD User Manual for deposit, nursing, and discharge workflows.</li>
</ol>

<p>Maternity emergencies may link to labor ward and neonatal pathways with pay-later deposit rules.</p>
`)}

${section('cashier', '13. Retrospective Billing', `
<h3>After clinical care</h3>
<ol class="step-row">
<li>Patient or family directed to cashier when medically appropriate.</li>
<li>Cashier filters <strong>Emergency / A&amp;E</strong> pending tickets.</li>
<li>Review full credit tab: consultations, orders, medications, procedures.</li>
<li>Collect payment or apply insurance co-pay.</li>
<li>Issue receipt — mark EMG settlement complete.</li>
</ol>

<div class="note">Emergency flow intentionally defers payment until after stabilization — unlike standard OPD consultation-first payment.</div>
`)}

${section('kpi', '14. KPI Dashboard', `
<p><strong>ER KPI dashboard</strong> at <code>/emergency/kpi</code> tracks:</p>
<ul>
<li>Door-to-doctor time (median / SLA breaches)</li>
<li>Left without being seen (LWBS) rate</li>
<li>ER → IPD conversion rate</li>
<li>Critical alert counts</li>
<li>MLC cases open</li>
<li>Credit tab totals across active visits</li>
</ul>
<p>Use for shift handover, quality improvement, and hospital management reporting.</p>
`)}

${section('alerts', '15. Doctor ER Alerts', `
<p>Doctors receive real-time alerts at <code>/doctor/er-inbox</code> for:</p>
<ul>
<li>Critical lab/radiology results</li>
<li>Stat order completions</li>
<li>Medication administration notifications</li>
<li>Assigned ER patients requiring review</li>
</ul>
<p>Red <strong>ER alerts</strong> strip appears on clinical pages when pending items exist.</p>
`)}

${section('screens', '16. Screen Reference (UI)', `
<p>Illustrative panels matching live Emergency React screens.</p>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Emergency Board — /emergency</div>
  <div class="screen-body">
    <div style="font-size:8pt;font-weight:700;color:#7f1d1d;margin-bottom:2mm">🚑 Live · Emergency / A&E</div>
    <div style="display:flex;gap:2mm;margin-bottom:3mm;font-size:7pt">
      <span style="background:#fee2e2;padding:1mm 2mm;border-radius:99px">Active: 8</span>
      <span style="background:#fef3c7;padding:1mm 2mm;border-radius:99px">Awaiting triage: 2</span>
      <span style="background:#fecaca;padding:1mm 2mm;border-radius:99px">Critical: 1</span>
    </div>
    <div class="lane-card l1"><strong>L1 · Resuscitation</strong> · J. Doe · 3 min · MLC</div>
    <div class="lane-card l2"><strong>L2 · Emergent</strong> · P. Kam · 8 min · Chest pain</div>
    <div class="lane-card l3"><strong>L3 · Urgent</strong> · A. Mbu · 22 min</div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> ER Visit Chart — Phase panels</div>
  <div class="screen-body" style="font-size:8pt">
    <div class="phase-banner" style="margin:0 0 2mm">Phase 1 · Triage ✓</div>
    <div class="phase-banner" style="margin:0 0 2mm;background:#ede9fe;border-color:#7c3aed">Phase 2 · Orders (3 active)</div>
    <div class="phase-banner" style="margin:0 0 2mm;background:#fef3c7;border-color:#f59e0b">Phase 3 · Disposition — choose pathway</div>
    <div class="phase-banner" style="margin:0;background:#d1fae5;border-color:#059669">Phase 4 · Open tab: 45,000 FCFA</div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Quick Registration</div>
  <div class="screen-body" style="font-size:8.5pt">
    <strong>🚑 Quick registration · Phase 1 — Arrival</strong>
    <p style="margin:2mm 0"><label><input type="radio" checked /> Existing patient</label>
    <label style="margin-left:3mm"><input type="radio" /> New / Unknown</label></p>
    <p style="margin:0">Chief complaint: <em>Severe abdominal pain</em></p>
    <span style="background:#dc2626;color:white;padding:1mm 3mm;border-radius:3px;font-size:7.5pt;margin-top:2mm;display:inline-block">Register &amp; start triage</span>
  </div>
</div>

<div class="tip"><strong>Live screenshots:</strong> Open <code>/emergency</code> while signed in; use Print → Save as PDF for site-specific training packs.</div>
`)}

${section('troubleshooting', '17. Troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Patient sent to OPD cashier first</td><td>Re-register with Emergency/Waiver or use A&amp;E Quick Reg</td></tr>
<tr><td>Patient not on ER board</td><td>Confirm emergency flag; check assigned doctor ER queue not OPD</td></tr>
<tr><td>Cannot place orders</td><td>Create SOAP consultation first; verify visit not closed</td></tr>
<tr><td>Lab not processing</td><td>Use Phase 2 New Order — charges alone do not authorize tests</td></tr>
<tr><td>Cannot edit chart</td><td>Visit closed (clinical discharge) — financial settlement pending or complete</td></tr>
<tr><td>MLC cannot edit</td><td>MLC is locked after Sign &amp; Lock — reprint only</td></tr>
<tr><td>Admit to IPD blocked</td><td>Complete disposition pathway; check bed availability on ward board</td></tr>
<tr><td>LWBS still showing charges</td><td>LWBS disposition waives billing per policy — confirm pathway confirmed</td></tr>
</table>
`)}

${section('glossary', '18. Glossary', `
<table class="data">
<tr><th>Term</th><th>Definition</th></tr>
<tr><td>A&amp;E</td><td>Accident &amp; Emergency — same as Emergency Department</td></tr>
<tr><td>Credit tab</td><td>Running bill for ER orders before cashier settlement</td></tr>
<tr><td>Acuity</td><td>Triage severity level L1 (highest) to L5 (lowest)</td></tr>
<tr><td>STAT</td><td>Immediate priority order</td></tr>
<tr><td>SOAP</td><td>Subjective, Objective, Assessment, Plan — consultation note</td></tr>
<tr><td>Disposition</td><td>Final clinical pathway (discharge, admit, transfer, etc.)</td></tr>
<tr><td>MLC</td><td>Medico-Legal Case — assault, RTA, notifiable injury documentation</td></tr>
<tr><td>LWBS</td><td>Left Without Being Seen</td></tr>
<tr><td>SSU</td><td>Short Stay Unit — brief observation</td></tr>
<tr><td>Door-to-doctor</td><td>Time from arrival to first doctor contact</td></tr>
<tr><td>ER waiver</td><td>Prepayment bypass for emergency registration</td></tr>
</table>
`)}

<p class="footer-note">© ${esc(new Date().getFullYear())} ${esc(b.name)} · Emergency Users Manual v2.0 · ${esc(b.facilityName || b.orgName)} · Confidential</p>
</div>`;

  return wrapPremiumDoc({
    title: `Emergency User Manual — ${b.productName}`,
    variant: 'emergency-manual',
    bodyHtml: body,
  });
}

module.exports = { buildEmergencyUsersManualHtml, EMERGENCY_EXTRA_CSS };
