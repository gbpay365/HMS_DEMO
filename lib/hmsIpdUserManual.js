'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const IPD_EXTRA_CSS = `
:root[data-doc="ipd-manual"] {
  --accent: #7c3aed;
  --accent-light: #ede9fe;
  --ipd-violet: #7c3aed;
  --ipd-blue: #1e40af;
  --ipd-green: #059669;
  --ipd-amber: #d97706;
  --ipd-teal: #0891b2;
  --ipd-pink: #be185d;
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
.role-card .icon { font-size: 16pt; line-height: 1; margin-bottom: 1.5mm; }
.role-card strong { display: block; font-size: 9pt; color: var(--ink); margin-bottom: 1mm; }
.role-card span { font-size: 8pt; color: var(--muted); line-height: 1.35; }
.wf-strip { display: flex; flex-wrap: wrap; gap: 2mm; margin: 4mm 0; }
.wf-chip {
  flex: 1 1 26mm; min-width: 22mm; text-align: center; border-radius: 4px;
  padding: 2mm 1.5mm; font-size: 7pt; font-weight: 600;
  border: 1px solid rgba(0,0,0,0.08); break-inside: avoid;
}
.wf-chip .n {
  display: inline-block; width: 4.5mm; height: 4.5mm; line-height: 4.5mm;
  border-radius: 50%; background: var(--navy); color: white; font-size: 6.5pt; margin-bottom: 1mm;
}
.screen {
  border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  margin: 4mm 0 5mm; break-inside: avoid; box-shadow: 0 1px 4px rgba(12,35,64,0.08);
}
.screen-bar {
  background: linear-gradient(90deg, var(--navy), var(--navy-mid));
  color: rgba(255,255,255,0.9); padding: 2mm 3mm; font-size: 8pt;
  display: flex; align-items: center; gap: 2mm;
}
.screen-bar .dot { width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #ef4444; }
.screen-bar .dot:nth-child(2) { background: #f59e0b; }
.screen-bar .dot:nth-child(3) { background: #10b981; }
.screen-body { background: #f8fafc; padding: 4mm; }
.bed-card {
  display: inline-block; width: 48mm; background: white; border: 2px solid #10b981;
  border-radius: 3mm; padding: 2.5mm; font-size: 7.5pt; margin: 1.5mm; vertical-align: top;
}
.bed-card.occupied { border-color: #7c3aed; background: #faf5ff; }
.bed-card.hk { border-color: #f59e0b; background: #fffbeb; border-style: dashed; }
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
  width: 5mm; height: 5mm; border-radius: 50%; background: var(--ipd-violet);
  color: white; font-size: 7pt; font-weight: 700; text-align: center; line-height: 5mm;
}
.perm-pill {
  display: inline-block; font-size: 7pt; font-family: ui-monospace, monospace;
  background: #f1f5f9; padding: 0.5mm 2mm; border-radius: 2px; margin: 0.5mm;
}
.hero-img { width: 100%; max-height: 45mm; object-fit: cover; border-radius: 4px; margin: 3mm 0; }
.status-pill {
  display: inline-block; font-size: 7pt; font-weight: 700; padding: 0.5mm 2mm;
  border-radius: 99px; text-transform: uppercase; letter-spacing: 0.04em;
}
.status-pill.admitted { background: #dbeafe; color: #1e40af; }
.status-pill.clinical { background: #fef3c7; color: #92400e; }
.status-pill.discharged { background: #d1fae5; color: #065f46; }
`;

function buildIpdUsersManualHtml() {
  const b = brand;
  const body = `
<style>${PREMIUM_CSS}${IPD_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'IPD User Manual',
  title: 'Inpatient Department (IPD)',
  subtitle: 'Complete staff guide — admission, ward board, nursing care, medication, ward rounds, clinical discharge, and financial settlement.',
  badge: 'Premium · Professional Edition',
  variant: 'ipd-manual',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)} IPD User Manual</strong>. This document explains the full inpatient hospitalization lifecycle — from doctor admission order through bed assignment, daily care, and dual discharge (clinical + financial).</p>
<div class="tip"><strong>Key principle:</strong> A patient cannot physically leave until both <strong>Clinical Discharge</strong> (doctor) and <strong>Financial Discharge</strong> (cashier) are completed.</div>

<div class="kpi-row">
  <div class="kpi"><strong>10</strong><span>Workflow stations</span></div>
  <div class="kpi"><strong>3</strong><span>Discharge stages</span></div>
  <div class="kpi"><strong>8+</strong><span>Staff roles</span></div>
</div>

<img class="hero-img" src="public/call-queue/photos/ipd.jpg" alt="Inpatient ward" />

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#overview">IPD overview &amp; roles</a></li>
<li><a href="#workflow">10-station workflow</a></li>
<li><a href="#statuses">Admission statuses</a></li>
<li><a href="#hub">IPD hub &amp; navigation</a></li>
<li><a href="#admission">Admission request</a></li>
<li><a href="#cashier">Deposit &amp; running bill</a></li>
<li><a href="#wards">Ward board &amp; beds</a></li>
<li><a href="#nursing">Nursing &amp; baseline vitals</a></li>
<li><a href="#rounds">Ward rounds &amp; orders</a></li>
<li><a href="#medication">IPD medication &amp; drug chart</a></li>
<li><a href="#handover">Nurse handover</a></li>
<li><a href="#lab-pharmacy">Lab, radiology &amp; pharmacy</a></li>
<li><a href="#clinical-dc">Clinical discharge</a></li>
<li><a href="#financial-dc">Financial discharge</a></li>
<li><a href="#census">IPD census</a></li>
<li><a href="#death">Death registry</a></li>
<li><a href="#screens">Screen reference</a></li>
<li><a href="#troubleshooting">Troubleshooting</a></li>
<li><a href="#glossary">Glossary</a></li>
</ol>
</div>

${section('overview', '1. IPD Overview & Roles', `
<p>The <strong>Inpatient Department (IPD)</strong> manages hospitalized patients from admission through discharge. All charges accumulate on a <strong>running credit tab</strong> after the admission deposit is collected.</p>

<div class="role-grid">
  <div class="role-card" style="background:#ede9fe;border-color:#c4b5fd">
    <div class="icon">👨‍⚕️</div>
    <strong>Doctor</strong>
    <span>Admission decision, ward rounds, orders, clinical discharge, discharge summary</span>
  </div>
  <div class="role-card" style="background:#d1fae5;border-color:#6ee7b7">
    <div class="icon">💳</div>
    <strong>Cashier</strong>
    <span>Admission deposit, running bill settlement, financial discharge, IPD payment codes</span>
  </div>
  <div class="role-card" style="background:#fef3c7;border-color:#fcd34d">
    <div class="icon">🛏️</div>
    <strong>Front Desk / ADT</strong>
    <span>Ward &amp; bed assignment, transfers, confirm departure, bed released</span>
  </div>
  <div class="role-card" style="background:#fce7f3;border-color:#f9a8d4">
    <div class="icon">🩺</div>
    <strong>Nurse / Nursing Aid</strong>
    <span>Receive patient, baseline vitals, drug chart administration, handover reports</span>
  </div>
  <div class="role-card" style="background:#cffafe;border-color:#67e8f9">
    <div class="icon">🔬</div>
    <strong>Lab / Radiology</strong>
    <span>Process investigation orders; costs auto-added to running bill</span>
  </div>
  <div class="role-card" style="background:#fce7f3;border-color:#f9a8d4">
    <div class="icon">💊</div>
    <strong>Pharmacy</strong>
    <span>Ward dispensing, nursing supply requests, medication alerts</span>
  </div>
</div>

<h3>Key URLs</h3>
<table class="data">
<tr><th>Screen</th><th>Path</th><th>Typical roles</th></tr>
<tr><td>IPD Hub</td><td><code>/ipd</code></td><td>All clinical staff</td></tr>
<tr><td>Ward board</td><td><code>/wards</code></td><td>ADT, Nurse, Doctor</td></tr>
<tr><td>Hospitalizations</td><td><code>/ipd/hospitalizations</code></td><td>Doctor, Admin</td></tr>
<tr><td>IPD medication</td><td><code>/ipd/medication</code></td><td>Doctor, Nurse</td></tr>
<tr><td>Drug chart</td><td><code>/ipd/chart/:admission_id</code></td><td>Nurse</td></tr>
<tr><td>Running bill</td><td><code>/ipd/running-bill/:id</code></td><td>Cashier, Doctor</td></tr>
<tr><td>IPD census</td><td><code>/ipd/census</code></td><td>Nursing, Admin</td></tr>
<tr><td>IPD settlement</td><td><code>/ipd/discharge</code></td><td>Cashier</td></tr>
<tr><td>Nurse handover</td><td><code>/ipd/handover</code></td><td>Nurse</td></tr>
<tr><td>Death registry</td><td><code>/ipd/death-registry</code></td><td>Doctor, Admin</td></tr>
</table>

<div class="note"><strong>Permissions:</strong> IPD modules use <span class="perm-pill">adt.read</span> <span class="perm-pill">adt.write</span> <span class="perm-pill">nursing.write</span> <span class="perm-pill">clinical.write</span> <span class="perm-pill">ipd_medication.read</span> <span class="perm-pill">cashier.write</span>.</div>
`)}

${section('workflow', '2. Ten-Station IPD Workflow', `
<p>The IPD workflow banner shows the inpatient journey through <strong>10 stations</strong> from admission order to bed release.</p>

<div class="wf-strip">
  <div class="wf-chip" style="background:#dbeafe"><span class="n">1</span><br/>📋 Doctor<br/>Admit order</div>
  <div class="wf-chip" style="background:#d1fae5"><span class="n">2</span><br/>💳 Cashier<br/>Deposit</div>
  <div class="wf-chip" style="background:#fef3c7"><span class="n">3</span><br/>🛏️ ADT<br/>Bed assign</div>
  <div class="wf-chip" style="background:#ede9fe"><span class="n">4</span><br/>🩺 Nurse<br/>Baseline vitals</div>
  <div class="wf-chip" style="background:#eef2ff"><span class="n">5</span><br/>💉 Doctor<br/>Ward rounds</div>
  <div class="wf-chip" style="background:#cffafe"><span class="n">6</span><br/>🔬 Lab<br/>Tests</div>
  <div class="wf-chip" style="background:#fce7f3"><span class="n">7</span><br/>💊 Pharmacy<br/>Dispense</div>
  <div class="wf-chip" style="background:#dbeafe"><span class="n">8</span><br/>📋 Doctor<br/>Clinical DC</div>
  <div class="wf-chip" style="background:#d1fae5"><span class="n">9</span><br/>💳 Cashier<br/>Financial DC</div>
  <div class="wf-chip" style="background:#f1f5f9"><span class="n">10</span><br/>✅ ADT<br/>Bed released</div>
</div>

<div class="flow">Doctor Admit Order → Cashier Deposit → ADT Bed Assignment → Nurse Baseline Vitals
→ Doctor Ward Rounds → [Lab / Radiology / Pharmacy orders on credit tab]
→ Doctor Clinical Discharge → Cashier Financial Discharge → ADT Bed Released</div>

<h3>Step-by-step (all roles)</h3>
<ol class="step-row">
<li><strong>Doctor</strong> — Decide hospitalization needed. Issue admission request with admitting diagnosis. <span class="perm-pill">consult.write</span></li>
<li><strong>Cashier</strong> — Collect admission deposit. Running credit tab opens for future charges. <span class="perm-pill">cashier.write</span></li>
<li><strong>Front Desk / ADT</strong> — Assign ward and bed. Bed status → Occupied. <span class="perm-pill">adt.write</span></li>
<li><strong>Nurse</strong> — Receive patient. Record baseline vitals. Execute care plan. <span class="perm-pill">nursing.write</span></li>
<li><strong>Doctor</strong> — Daily ward rounds. Update notes. Place new orders as needed.</li>
<li><strong>Lab / Radiology</strong> — Process orders. Upload results. Charges added to bill.</li>
<li><strong>Pharmacist</strong> — Dispense medications to ward. Costs on running bill.</li>
<li><strong>Doctor</strong> — Clinical Discharge when medically fit. Write discharge summary.</li>
<li><strong>Cashier</strong> — Present final bill. Settle all charges. Financial Discharge. Bed freed.</li>
<li><strong>Front Desk / ADT</strong> — Confirm patient departed. Bed → Available or Housekeeping.</li>
</ol>
<div class="warn"><strong>Footnote:</strong> Deposit (Station 2) is required before bed assignment. Stations 8–10 must complete in order — clinical discharge before financial settlement.</div>
`)}

${section('statuses', '3. Admission Statuses', `
<p>Each hospitalization progresses through IPD status values visible on the ward board and census.</p>

<table class="data">
<tr><th>Status</th><th>Label</th><th>Meaning</th></tr>
<tr><td><span class="status-pill admitted">Admitted</span></td><td>Active stay</td><td>Patient on ward; care and orders ongoing</td></tr>
<tr><td><span class="status-pill clinical">Clinical DC</span></td><td>Awaiting financial DC</td><td>Doctor signed clinical discharge; cashier must settle</td></tr>
<tr><td><span class="status-pill discharged">Discharged</span></td><td>Discharged</td><td>Financial discharge complete; bed can be released</td></tr>
</table>

<h3>Bed statuses</h3>
<table class="data">
<tr><th>Bed status</th><th>Display</th><th>Action</th></tr>
<tr><td>Available</td><td>Green — AVAILABLE</td><td>Admit new patient</td></tr>
<tr><td>Occupied</td><td>Purple border — patient name</td><td>Open chart, transfer, discharge flow</td></tr>
<tr><td>Housekeeping</td><td>Amber dashed — cleaning required</td><td>Mark ready when clean</td></tr>
</table>
`)}

${section('hub', '4. IPD Hub & Navigation', `
<p>The <strong>Hospitalization (IPD) hub</strong> at <code>/ipd</code> is the central dashboard for inpatient operations.</p>

<h3>Hub KPIs</h3>
<ul>
<li><strong>Active stays</strong> — currently admitted patients</li>
<li><strong>Beds available</strong> — open beds across wards</li>
<li><strong>Awaiting settlement</strong> — clinical discharge done, financial pending</li>
<li><strong>Completed</strong> — all-time discharged count</li>
</ul>

<h3>Main menus (from hub)</h3>
<table class="data">
<tr><th>Menu</th><th>Description</th></tr>
<tr><td>Hospitalizations</td><td>Active &amp; completed inpatient stays list</td></tr>
<tr><td>Wards &amp; beds</td><td>Visual bed board — admit, transfer, discharge</td></tr>
<tr><td>IPD medication</td><td>Treatments, drug chart, shift reports</td></tr>
<tr><td>Nurse handover</td><td>I-SBARR shift reports, doctor submission</td></tr>
<tr><td>Pharmacy requests</td><td>Nursing station supply requests</td></tr>
<tr><td>Ward rounds</td><td>Physician &amp; nursing round notes</td></tr>
<tr><td>IPD census</td><td>Table of all current inpatients</td></tr>
<tr><td>Death registry</td><td>In-hospital mortality records</td></tr>
<tr><td>IPD settlement</td><td>Financial discharge &amp; payment codes</td></tr>
<tr><td>Configuration</td><td>Surgery templates, checklists, buildings, OT</td></tr>
</table>
`)}

${section('admission', '5. Admission Request', `
<h3>From consultation or chart</h3>
<ol class="step-row">
<li>Doctor assesses patient needs hospitalization.</li>
<li>Open <strong>Admit Patient</strong> from consultation or patient chart.</li>
<li>Enter admitting diagnosis and reason for hospitalization.</li>
<li>Submit admission request — patient appears on <strong>Awaiting bed assignment</strong> list.</li>
</ol>

<h3>From Emergency / OPD</h3>
<p>Stabilized emergency patients may transition to IPD: doctor issues admission request; ER charges may transfer to the IPD credit tab when configured.</p>

<h3>Maternity</h3>
<p>Maternity admissions link mother/neonatal charts. Labor patients may use pay-later deposit rules when enabled for emergency labor.</p>
`)}

${section('cashier', '6. Deposit & Running Bill', `
<h3>Admission deposit</h3>
<ol class="step-row">
<li>Cashier opens patient record or IPD settlement workspace.</li>
<li>Collect <strong>admission deposit</strong> as configured by hospital policy.</li>
<li>System opens <strong>running credit tab</strong> — all future IPD charges accumulate here.</li>
<li>Deposit amount shows on running bill and settlement screens.</li>
</ol>

<h3>Running bill</h3>
<p>View at <code>/ipd/running-bill/:admission_id</code>:</p>
<ul>
<li>Itemized charge breakdown (consultation, ward, lab, radiology, pharmacy, misc)</li>
<li>Deposit applied</li>
<li>Balance due (payable before final invoice)</li>
<li>Invoice forecast card for estimated totals</li>
</ul>

<h3>Adding charges</h3>
<p>Doctors and authorized staff use <strong>Add charge</strong> modal: pick Service Catalog section, pharmacy inventory search, or miscellaneous line. Pharmacy charges may include clinical/dispensing instructions matching IPD prescription fields.</p>
`)}

${section('wards', '7. Ward Board & Bed Assignment', `
<p>The <strong>IPD Ward Board</strong> at <code>/wards</code> provides a visual map of wards, beds, and active admissions.</p>

<h3>Assign bed</h3>
<ol class="step-row">
<li>Open ward board from IPD hub or <code>/wards</code>.</li>
<li>Review <strong>Awaiting bed assignment</strong> panel for pending admissions.</li>
<li>Click an <strong>Available</strong> bed or use <strong>+ Admit patient</strong>.</li>
<li>Select patient and confirm — bed status → <strong>Occupied</strong>.</li>
</ol>

<h3>Transfer</h3>
<p>Drag occupied bed to another bed/ward to transfer patient (when permissions allow). Transfer updates ward name and bed label on all IPD screens.</p>

<h3>Manage beds (Admin)</h3>
<p>Use <strong>Manage beds</strong> to add/remove wards and beds, set capacity, and mark beds out of service.</p>
`)}

${section('nursing', '8. Nursing & Baseline Vitals', `
<h3>Receive patient on ward</h3>
<ol class="step-row">
<li>Nurse opens occupied bed on ward board or IPD medication hub.</li>
<li>Record <strong>baseline vitals</strong>: BP, temperature, weight, SpO₂, pulse.</li>
<li>Review admitting diagnosis and doctor orders.</li>
<li>Begin care plan and medication schedule from drug chart.</li>
</ol>

<h3>IPD inbox</h3>
<p>Nurses respond to clinical department alerts and IPD nurse message inbox at <code>/ipd/inbox</code> for pending orders and medication notifications.</p>

<h3>Supply requests</h3>
<p>Request drugs and ward materials via <strong>Pharmacy requests</strong> from the IPD hub.</p>
`)}

${section('rounds', '9. Ward Rounds & Orders', `
<h3>Daily ward rounds</h3>
<ol class="step-row">
<li>Doctor opens <strong>Ward rounds</strong> (<code>/ipd/ward-rounds</code>) or patient chart from bed board.</li>
<li>Review each inpatient: vitals, progress, active treatments.</li>
<li>Enter round notes and update clinical documentation.</li>
<li>Place new lab, radiology, pharmacy, or procedure orders — auto-added to running bill.</li>
</ol>

<h3>IPD treatment manager</h3>
<p>At <code>/ipd/treatment/:admission_id</code> doctors start treatments, add prescriptions, and set dose schedules. Nurses administer via drug chart.</p>
`)}

${section('medication', '10. IPD Medication & Drug Chart', `
<p>Full inpatient medication workflow at <code>/ipd/medication</code> and per-admission treatment pages.</p>

<h3>Doctor — prescribe</h3>
<ul>
<li>Start treatment with diagnosis and estimated duration</li>
<li>Add prescriptions from pharmacy catalog or custom drug</li>
<li>Dose slots generated automatically for nursing administration</li>
<li>Extend, shorten, replace, or terminate treatment plans</li>
<li>Administration protocol — review scheduled doses, add doctor comments</li>
</ul>

<h3>Nurse — drug chart</h3>
<ul>
<li>Open <strong>Bedhead drug chart</strong> at <code>/ipd/chart/:admission_id</code></li>
<li>Confirm administration — turns green (locked)</li>
<li>Mark missed/refused with reason (patient refused, vomited, unavailable)</li>
<li><strong>Correct entry</strong> for documentation errors (audited)</li>
</ul>

<h3>Shift reports</h3>
<p>Nurse shift reports document treatments given during the shift. Handover board links to I-SBARR structured reports.</p>

<h3>Audit trail</h3>
<p>All dose changes, corrections, and administrations logged in treatment audit trail for clinical governance.</p>
`)}

${section('handover', '11. Nurse Handover', `
<p>The <strong>Nurse handover</strong> module at <code>/ipd/handover</code> supports structured shift transition:</p>
<ul>
<li>I-SBARR format shift reports</li>
<li>Treatments administered during shift</li>
<li>Doctor submission of handover notes</li>
<li>Outstanding tasks for incoming nursing team</li>
</ul>
<p>Use at every nursing shift change on busy wards to maintain continuity of care.</p>
`)}

${section('lab-pharmacy', '12. Lab, Radiology & Pharmacy', `
<h3>During stay</h3>
<ol class="step-row">
<li>Doctor places investigation orders from ward rounds or patient chart.</li>
<li>Lab/Radiology process orders — no separate prepayment; charges on credit tab.</li>
<li>Results upload to patient chart; clinicians notified via alerts.</li>
<li>Pharmacy dispenses to ward; nursing administers per drug chart.</li>
</ol>

<div class="note">IPD and Emergency orders generate clinical department alerts accessible from Lab/Radiology/Pharmacy sidebars when write permission is granted.</div>
`)}

${section('clinical-dc', '13. Clinical Discharge', `
<h3>Doctor signs clinical discharge</h3>
<ol class="step-row">
<li>Confirm patient medically fit for discharge.</li>
<li>Open admission from ward board or hospitalizations list.</li>
<li>Write <strong>discharge summary</strong> with final diagnosis and instructions.</li>
<li>Sign <strong>Clinical Discharge</strong> — status → Awaiting financial DC.</li>
</ol>

<div class="warn"><strong>Doctor-only:</strong> Only the admitting doctor (or authorized clinician) may sign clinical discharge unless bypass rules apply.</div>

<p>Bed shows <strong>Tap to complete discharge</strong> for cashier/ADT follow-up. Patient remains on ward until financial discharge.</p>
`)}

${section('financial-dc', '14. Financial Discharge & Settlement', `
<h3>Cashier settlement</h3>
<ol class="step-row">
<li>Open <strong>IPD settlement</strong> (<code>/ipd/discharge</code>) or Cashier IPD tab.</li>
<li>Locate patient — filter by name, ward, awaiting financial DC.</li>
<li>Review total charges, deposit, balance due.</li>
<li>Enter or validate <strong>IPD payment code</strong> from settlement workflow.</li>
<li><strong>Settle Bill</strong> — issue receipt, mark Financial Discharge.</li>
<li>Bed status freed for housekeeping or next admission.</li>
</ol>

<h3>Zero balance</h3>
<p>When deposit covers all charges, use <strong>Zero · Confirm</strong> to complete financial discharge without additional payment.</p>

<h3>Refunds</h3>
<p>Deposit exceeding final bill may trigger refund workflow per hospital policy.</p>
`)}

${section('census', '15. IPD Census', `
<p><strong>IPD Census</strong> at <code>/ipd/census</code> lists all currently admitted patients with KPIs:</p>
<ul>
<li>Total inpatients / active / awaiting financial DC</li>
<li>Average length of stay (LOS)</li>
<li>Sortable table: patient, ward/bed, department, admitted date, LOS, diagnosis, doctor, bill, status</li>
</ul>
<p>Use for nursing handoff, bed management meetings, and administration reporting.</p>
`)}

${section('death', '16. Death Registry', `
<p>Record in-hospital deaths via <strong>Death registry</strong> (<code>/ipd/death-registry</code>) linked from IPD hub or patient chart when mortality occurs during admission.</p>
<ul>
<li>Document date, cause, and clinical context</li>
<li>Coordinate with clinical and financial discharge workflows</li>
<li>Supports statutory reporting where configured</li>
</ul>
`)}

${section('screens', '17. Screen Reference (UI)', `
<p>Illustrative panels matching live IPD React screens. Open <code>/ipd</code> and <code>/wards</code> while signed in for your deployment.</p>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> IPD Hub — /ipd</div>
  <div class="screen-body">
    <div style="font-size:8pt;font-weight:700;color:#0c2340;margin-bottom:2mm">Hospitalization (IPD)</div>
    <div class="kpi-row" style="margin:0 0 3mm">
      <div class="kpi" style="padding:2mm"><strong style="font-size:11pt">24</strong><span style="font-size:6pt">Active stays</span></div>
      <div class="kpi" style="padding:2mm"><strong style="font-size:11pt">18</strong><span style="font-size:6pt">Beds avail</span></div>
      <div class="kpi" style="padding:2mm"><strong style="font-size:11pt">3</strong><span style="font-size:6pt">Awaiting DC</span></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2mm;font-size:7.5pt">
      <div style="background:white;border:1px solid #e2e8f0;border-radius:3mm;padding:2mm">🏥 Hospitalizations</div>
      <div style="background:white;border:1px solid #e2e8f0;border-radius:3mm;padding:2mm">🛏️ Wards &amp; beds</div>
      <div style="background:white;border:1px solid #e2e8f0;border-radius:3mm;padding:2mm">💊 IPD medication</div>
      <div style="background:white;border:1px solid #e2e8f0;border-radius:3mm;padding:2mm">📋 IPD census</div>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Ward Board — /wards</div>
  <div class="screen-body">
    <div style="font-size:8pt;font-weight:700;margin-bottom:2mm">General Ward · 12 beds</div>
    <div class="bed-card"><strong>Bed A1</strong><br/><span class="status-pill admitted">AVAILABLE</span></div>
    <div class="bed-card occupied"><strong>Bed A2</strong><br/>Jane Doe<br/><small>Admitted 3d · Dr. Smith</small></div>
    <div class="bed-card occupied"><strong>Bed A3</strong><br/>Paul K.<br/><span class="status-pill clinical">Awaiting fin. DC</span></div>
    <div class="bed-card hk"><strong>Bed A4</strong><br/>Housekeeping</div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> IPD Workflow Banner</div>
  <div class="screen-body">
    <div class="wf-strip" style="margin:0">
      <div class="wf-chip" style="background:#dbeafe;font-size:6pt">1 Admit</div>
      <div class="wf-chip" style="background:#d1fae5;font-size:6pt">2 Deposit</div>
      <div class="wf-chip" style="background:#fef3c7;font-size:6pt">3 Bed</div>
      <div class="wf-chip" style="background:#ede9fe;font-size:6pt">4 Vitals</div>
      <div class="wf-chip" style="background:#eef2ff;font-size:6pt">5 Rounds</div>
      <div class="wf-chip" style="background:#cffafe;font-size:6pt">6 Lab</div>
      <div class="wf-chip" style="background:#fce7f3;font-size:6pt">7 Rx</div>
      <div class="wf-chip" style="background:#dbeafe;font-size:6pt">8 Clin DC</div>
      <div class="wf-chip" style="background:#d1fae5;font-size:6pt">9 Fin DC</div>
      <div class="wf-chip" style="background:#f1f5f9;font-size:6pt">10 Released</div>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Drug Chart — Nurse</div>
  <div class="screen-body" style="font-size:8pt">
    <strong>Bedhead drug chart · AM doses</strong>
    <table class="data" style="margin:2mm 0;font-size:7pt">
    <tr style="background:#d1fae5"><td>08:00</td><td>Paracetamol 500mg PO</td><td>✓ Given</td></tr>
    <tr style="background:#fef3c7"><td>12:00</td><td>Amoxicillin 500mg PO</td><td>Pending</td></tr>
    <tr style="background:#fee2e2"><td>18:00</td><td>Metoclopramide 10mg IV</td><td>Missed</td></tr>
    </table>
  </div>
</div>

<div class="tip"><strong>Live screenshots:</strong> Sign in and open <code>/ipd</code>, <code>/wards</code>, or <code>/ipd/census</code>, then use Print → Save as PDF for site-specific training materials.</div>
`)}

${section('troubleshooting', '18. Troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Cannot assign bed</td><td>Confirm cashier collected admission deposit; check awaiting assignment list</td></tr>
<tr><td>Bed still occupied after discharge</td><td>Complete financial discharge; mark housekeeping ready</td></tr>
<tr><td>Clinical discharge blocked</td><td>Only admitting doctor may sign; check outstanding orders</td></tr>
<tr><td>Running bill unexpected charges</td><td>Review charge breakdown; verify lab/rad/pharmacy orders</td></tr>
<tr><td>Nurse cannot administer dose</td><td>Treatment may be terminated; dose already given (locked)</td></tr>
<tr><td>Transfer failed</td><td>Target bed must be available; check permissions</td></tr>
<tr><td>IPD settlement not listed</td><td>Patient needs clinical discharge first</td></tr>
<tr><td>ER charges not on IPD bill</td><td>Verify ER-to-IPD charge transfer rules and admission link</td></tr>
</table>
`)}

${section('glossary', '19. Glossary', `
<table class="data">
<tr><th>Term</th><th>Definition</th></tr>
<tr><td>IPD</td><td>Inpatient Department — hospitalized patients</td></tr>
<tr><td>ADT</td><td>Admission, Discharge, Transfer — bed and ward management</td></tr>
<tr><td>Running bill / credit tab</td><td>Cumulative charges during admission</td></tr>
<tr><td>Deposit</td><td>Up-front payment opening the credit tab</td></tr>
<tr><td>Clinical discharge</td><td>Doctor confirms patient medically fit to leave</td></tr>
<tr><td>Financial discharge</td><td>Cashier settles all charges; bed released</td></tr>
<tr><td>LOS</td><td>Length of stay — days since admission</td></tr>
<tr><td>Drug chart</td><td>Scheduled dose administration record for nurses</td></tr>
<tr><td>I-SBARR</td><td>Structured nursing handover format</td></tr>
<tr><td>Housekeeping</td><td>Bed cleaning state before next admission</td></tr>
</table>
`)}

<p class="footer-note">© ${esc(new Date().getFullYear())} ${esc(b.name)} · IPD Users Manual v2.0 · ${esc(b.facilityName || b.orgName)} · Confidential</p>
</div>`;

  return wrapPremiumDoc({
    title: `IPD User Manual — ${b.productName}`,
    variant: 'ipd-manual',
    bodyHtml: body,
  });
}

module.exports = { buildIpdUsersManualHtml, IPD_EXTRA_CSS };
