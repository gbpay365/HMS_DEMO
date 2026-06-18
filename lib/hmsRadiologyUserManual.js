'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const RADIOLOGY_EXTRA_CSS = `
:root[data-doc="radiology-manual"] {
  --accent: #0891b2;
  --accent-light: #cffafe;
  --rad-cyan: #0891b2;
  --rad-cyan-dark: #0e7490;
  --rad-blue: #1a6bd8;
  --rad-teal: #0d9488;
  --rad-amber: #f59e0b;
  --rad-emerald: #10b981;
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
  border-radius: 50%; background: var(--rad-cyan-dark); color: white; font-size: 6.5pt; margin-bottom: 1mm;
}
.status-pill {
  display: inline-block; font-size: 7pt; font-weight: 700; padding: 0.5mm 2mm;
  border-radius: 99px; text-transform: uppercase;
}
.status-pill.pending { background: #fef3c7; color: #92400e; }
.status-pill.progress { background: #dbeafe; color: #1e40af; }
.status-pill.ready { background: #d1fae5; color: #065f46; }
.status-pill.revision { background: #fee2e2; color: #991b1b; }
.screen {
  border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  margin: 4mm 0 5mm; break-inside: avoid; box-shadow: 0 1px 4px rgba(8,145,178,0.08);
}
.screen-bar {
  background: linear-gradient(90deg, #0e7490, #1a6bd8);
  color: rgba(255,255,255,0.92); padding: 2mm 3mm; font-size: 8pt;
  display: flex; align-items: center; gap: 2mm;
}
.screen-bar .dot { width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #67e8f9; }
.screen-bar .dot:nth-child(2) { background: #fcd34d; }
.screen-bar .dot:nth-child(3) { background: #86efac; }
.screen-body { background: #ecfeff; padding: 4mm; }
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
  width: 5mm; height: 5mm; border-radius: 50%; background: var(--rad-cyan);
  color: white; font-size: 7pt; font-weight: 700; text-align: center; line-height: 5mm;
}
.perm-pill {
  display: inline-block; font-size: 7pt; font-family: ui-monospace, monospace;
  background: #f1f5f9; padding: 0.5mm 2mm; border-radius: 2px; margin: 0.5mm;
}
.hero-img { width: 100%; max-height: 45mm; object-fit: cover; border-radius: 4px; margin: 3mm 0; }
.code-badge {
  display: inline-block; font-family: ui-monospace, monospace; font-size: 8pt; font-weight: 800;
  padding: 1mm 2.5mm; border-radius: 3px; border: 2px solid #67e8f9; background: #cffafe; color: #0e7490;
}
.kanban-cols {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; margin: 3mm 0; font-size: 7.5pt;
}
.kanban-cols span {
  border-radius: 3px; padding: 2mm 1mm; text-align: center; border-top: 3px solid;
}
.kanban-cols .pending { background: #fffbeb; border-color: #f59e0b; }
.kanban-cols .progress { background: #eff6ff; border-color: #3b82f6; }
.kanban-cols .done { background: #ecfdf5; border-color: #10b981; }
`;

function buildRadiologyUsersManualHtml() {
  const b = brand;
  const body = `
<style>${PREMIUM_CSS}${RADIOLOGY_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'Radiology User Manual',
  title: 'Radiology & Imaging',
  subtitle: 'Complete staff guide — payment validation, order alerts, exam workflow, structured reporting, modalities, rooms, and clinical integration.',
  badge: 'Premium · Professional Edition',
  variant: 'radiology-manual',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)} Radiology User Manual</strong>. The Radiology module manages the full imaging pathway — from doctor orders and cashier payment verification through exam scheduling, acquisition, structured reporting, and patient report delivery.</p>
<div class="tip"><strong>Radiology hub:</strong> One worklist at <code>/radiology</code> for requests, workflow board, validate codes, templates, and consolidated results.</div>

<div class="kpi-row">
  <div class="kpi"><strong>RAD</strong><span>Service codes</span></div>
  <div class="kpi"><strong>3</strong><span>Workflow columns</span></div>
  <div class="kpi"><strong>All</strong><span>Clinical contexts</span></div>
</div>

<img class="hero-img" src="public/call-queue/photos/imaging.jpg" alt="Radiology imaging" />

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#overview">Radiology overview &amp; roles</a></li>
<li><a href="#workflow">End-to-end imaging workflow</a></li>
<li><a href="#portal">Radiology portal</a></li>
<li><a href="#worklist">Radiology worklist</a></li>
<li><a href="#validate">Validate payment code</a></li>
<li><a href="#alerts">Order alerts</a></li>
<li><a href="#kanban">Exam workflow board</a></li>
<li><a href="#requests">Radiology requests</a></li>
<li><a href="#templates">Templates &amp; structured reporting</a></li>
<li><a href="#results">Results registry</a></li>
<li><a href="#reports">Reports &amp; printing</a></li>
<li><a href="#corrections">Corrections &amp; recalls</a></li>
<li><a href="#external">External imaging results</a></li>
<li><a href="#clinical">OPD, IPD &amp; Emergency orders</a></li>
<li><a href="#cashier">Cashier integration</a></li>
<li><a href="#configuration">Rooms, groups &amp; catalog</a></li>
<li><a href="#screens">Screen reference</a></li>
<li><a href="#troubleshooting">Troubleshooting</a></li>
<li><a href="#glossary">Glossary</a></li>
</ol>
</div>

${section('overview', '1. Radiology Overview & Roles', `
<p>The <strong>Radiology module</strong> connects clinical imaging orders to verified, billable, and reportable exam results across OPD, IPD, Emergency, and Maternity contexts.</p>

<div class="role-grid">
  <div class="role-card" style="background:#cffafe;border-color:#67e8f9">
    <div class="icon">🩻</div>
    <strong>Radiology Technician</strong>
    <span>Validate RAD codes, perform exams, enter structured reports, manage workflow board</span>
  </div>
  <div class="role-card" style="background:#dbeafe;border-color:#93c5fd">
    <div class="icon">👨‍⚕️</div>
    <strong>Radiologist / Doctor</strong>
    <span>Orders imaging studies from consultation, IPD, or ER chart; reviews reports</span>
  </div>
  <div class="role-card" style="background:#d1fae5;border-color:#6ee7b7">
    <div class="icon">💳</div>
    <strong>Cashier</strong>
    <span>Collects payment; issues RAD service codes on order slips</span>
  </div>
  <div class="role-card" style="background:#fef3c7;border-color:#fcd34d">
    <div class="icon">🏥</div>
    <strong>Imaging Room Staff</strong>
    <span>Room assignment, patient positioning, modality-specific protocols</span>
  </div>
  <div class="role-card" style="background:#ede9fe;border-color:#c4b5fd">
    <div class="icon">📋</div>
    <strong>Radiology Supervisor</strong>
    <span>Configure rooms and test groups, authorize corrections, review quality</span>
  </div>
  <div class="role-card" style="background:#fce7f3;border-color:#f9a8d4">
    <div class="icon">👤</div>
    <strong>Patient</strong>
    <span>Pays at cashier, presents RAD code at imaging desk, receives printed report</span>
  </div>
</div>

<h3>Key URLs</h3>
<table class="data">
<tr><th>Screen</th><th>Path</th></tr>
<tr><td>Radiology Portal</td><td><code>/portal/radiology</code></td></tr>
<tr><td>Radiology worklist</td><td><code>/radiology</code></td></tr>
<tr><td>Validate RAD code</td><td><code>/radiology/validate</code></td></tr>
<tr><td>Exam workflow board</td><td><code>/radiology/workflow</code></td></tr>
<tr><td>Radiology request detail</td><td><code>/radiology/requests/:id</code></td></tr>
<tr><td>Templates / workbench</td><td><code>/radiology/templates</code></td></tr>
<tr><td>Order alerts</td><td><code>/radiology/order-alerts</code></td></tr>
<tr><td>Consolidated results</td><td><code>/radiology/results</code></td></tr>
<tr><td>Configuration</td><td><code>/radiology/configuration</code></td></tr>
<tr><td>Exam report</td><td><code>/radiology/report/:id</code></td></tr>
</table>

<div class="note"><strong>Permissions:</strong> <span class="perm-pill">radiology.read</span> view orders &amp; results · <span class="perm-pill">radiology.write</span> enter &amp; validate results · <span class="perm-pill">service_catalog.radiology.write</span> catalog &amp; configuration</div>
`)}

${section('workflow', '2. End-to-End Imaging Workflow', `
<div class="flow">Doctor orders imaging → Patient pays at Cashier (RAD code issued)
→ Radiology validates code → Exam scheduled / performed
→ Results entered (templates) → Finalized → Report on chart &amp; patient copy</div>

<div class="wf-strip">
  <div class="wf-chip"><span class="n">1</span><br/>Doctor order</div>
  <div class="wf-chip"><span class="n">2</span><br/>Cashier payment</div>
  <div class="wf-chip"><span class="n">3</span><br/>Validate RAD code</div>
  <div class="wf-chip"><span class="n">4</span><br/>Start exam</div>
  <div class="wf-chip"><span class="n">5</span><br/>Enter report</div>
  <div class="wf-chip"><span class="n">6</span><br/>Finalize &amp; print</div>
</div>

<h3>Standard OPD pathway</h3>
<ol class="step-row">
<li>Doctor adds imaging study (X-ray, ultrasound, CT, etc.) during consultation.</li>
<li>Patient pays at Cashier — receives slip with <span class="code-badge">RAD-…</span> service code.</li>
<li>Radiology technician validates code at <code>/radiology/validate</code>.</li>
<li>Exam appears on workflow board — <strong>Start exam</strong> when patient is ready.</li>
<li>Technician opens radiology template workbench for structured reporting.</li>
<li>Mark complete — result finalized on patient chart and worklist.</li>
<li>Print patient copy from report or worklist action menu.</li>
</ol>

<h3>Order alerts shortcut</h3>
<p>Doctor orders also appear on <strong>Order alerts</strong> (<code>/radiology/order-alerts</code>). Acknowledge → confirm → opens template with patient prefilled.</p>

<div class="warn"><strong>Payment gate:</strong> Radiology cannot process unpaid orders. System blocks validation until Cashier marks the order line as paid.</div>
`)}

${section('portal', '3. Radiology Portal', `
<p>The <strong>Radiology &amp; Imaging Portal</strong> (<code>/portal/radiology</code>) is the radiology technician home screen.</p>

<h3>KPI strip</h3>
<ul>
<li><strong>Total Exams</strong> — all registered imaging studies</li>
<li><strong>Pending work</strong> — awaiting acquisition or reporting</li>
<li><strong>Completed</strong> — finalized reports</li>
<li><strong>Orders Today</strong> — new orders registered today</li>
</ul>

<h3>Quick actions</h3>
<ul>
<li><strong>All Results</strong> — full worklist at <code>/radiology</code></li>
<li><strong>Order alerts</strong> — new doctor orders needing attention</li>
<li>Portal tiles — role-specific shortcuts (workflow, validate, configuration)</li>
</ul>

<p>Recent orders table shows latest patients with exam name, modality, status, and date.</p>
`)}

${section('worklist', '4. Radiology Worklist', `
<p>The <strong>Radiology worklist</strong> (<code>/radiology</code>) is the Odoo-style hub for all imaging requests — unified view of OPD orders, formal requests, and legacy results.</p>

<h3>KPI strip</h3>
<table class="data">
<tr><th>Stat</th><th>Meaning</th></tr>
<tr><td>Today (open)</td><td>Scheduled today, not yet completed</td></tr>
<tr><td>Awaiting acceptance</td><td>Submitted requests pending radiology acceptance</td></tr>
<tr><td>In progress</td><td>Exam started or reporting underway</td></tr>
</table>

<h3>Filters</h3>
<ul>
<li><strong>Today / All</strong> — date scope</li>
<li><strong>Status</strong> — pending payment, submitted, in progress, done, draft, revision</li>
<li><strong>Search</strong> — patient name or request number</li>
</ul>

<h3>Worklist columns</h3>
<table class="data">
<tr><th>Column</th><th>Description</th></tr>
<tr><td>Request</td><td>Request number; group badge for multi-exam bundles</td></tr>
<tr><td>Patient</td><td>Name</td></tr>
<tr><td>Tests</td><td>Exam count and description</td></tr>
<tr><td>Scheduled</td><td>Date and time</td></tr>
<tr><td>Room</td><td>Assigned imaging room</td></tr>
<tr><td>Prescriber</td><td>Ordering doctor</td></tr>
<tr><td>Status</td><td>Progress badge (e.g. 2/3 done for groups)</td></tr>
<tr><td>Action</td><td>Open, Enter result, Report, Print copy</td></tr>
</table>
`)}

${section('validate', '5. Validate Payment Code', `
<p>Primary entry when a patient arrives at the imaging desk with a payment slip.</p>

<ol class="step-row">
<li>Open <code>/radiology/validate</code> or use validate link from portal/worklist.</li>
<li>Scan barcode or type the <strong>RAD service code</strong> (e.g. <code>RAD-8821-K2HM9X4P</code>).</li>
<li>System verifies: code belongs to radiology · order line is paid · ticket validity passes.</li>
<li>Validate detail shows patient, referring doctor, and in-house exam lines.</li>
<li>Create radiology request or open template for structured entry.</li>
</ol>

<h3>Validation failures</h3>
<table class="data">
<tr><th>Error</th><th>Cause</th></tr>
<tr><td>Payment required</td><td>Patient has not paid at Cashier</td></tr>
<tr><td>Code belongs to lab/pharmacy</td><td>Wrong department code entered</td></tr>
<tr><td>Expired ticket</td><td>Consultation-linked validity expired</td></tr>
<tr><td>Duplicate result</td><td>Report already registered for this order line</td></tr>
</table>
`)}

${section('alerts', '6. Order Alerts', `
<p><strong>Order alerts</strong> (<code>/radiology/order-alerts</code>) surface doctor-ordered imaging from consultations, IPD, and Emergency.</p>

<ol class="step-row">
<li>Open Order alerts from portal or sidebar.</li>
<li>Review <strong>Needs your attention</strong> — unacknowledged orders.</li>
<li>Each alert shows patient, exam name, context (OPD / IPD / Emergency), ordering doctor.</li>
<li><strong>Confirm &amp; open template</strong> — prefills patient and order line.</li>
<li>Or <strong>Mark as seen</strong> if handled via validate-code flow.</li>
</ol>

<p>Clinical department alerts strip on portal pages highlights radiology items requiring action.</p>
`)}

${section('kanban', '7. Exam Workflow Board', `
<p>The <strong>workflow board</strong> (<code>/radiology/workflow</code>) provides a Kanban view of exams in three columns:</p>

<div class="kanban-cols">
<span class="pending"><strong>Pending</strong><br/>Awaiting start</span>
<span class="progress"><strong>In progress</strong><br/>Exam underway</span>
<span class="done"><strong>Completed</strong><br/>Report ready</span>
</div>

<h3>Card actions</h3>
<ul>
<li><strong>Start exam</strong> — moves to In progress; opens RAD template when service code linked</li>
<li><strong>Mark complete</strong> — enter findings and conclusion; finalize report</li>
<li><strong>Undo</strong> — move back to pending queue</li>
<li><strong>View report</strong> — open finalized report from completed column</li>
</ul>

<p>Each card shows patient initials, exam name, body part, referring doctor, and appointment date.</p>

<div class="tip">For custom exams without linked template code, confirm <strong>Start custom report</strong> to begin narrative reporting.</div>
`)}

${section('requests', '8. Radiology Requests', `
<p>Formal multi-exam requests use Odoo-style request documents.</p>

<h3>Create request</h3>
<ol class="step-row">
<li>Validate RAD service code first (required).</li>
<li>Select patient, prescribing doctor, and scheduled date/time.</li>
<li>Choose imaging room and test group (multi-exam bundle) or individual catalog exams.</li>
<li>Submit — request number assigned (e.g. <code>RAD-REQ-00042</code>).</li>
</ol>

<h3>Request lifecycle</h3>
<table class="data">
<tr><th>Status</th><th>Action</th></tr>
<tr><td>Submitted</td><td>Radiology accepts request</td></tr>
<tr><td>Accepted</td><td>Exams move to in progress on workflow board</td></tr>
<tr><td>In progress</td><td>Perform imaging; enter results per line</td></tr>
<tr><td>Done</td><td>All exam lines completed — reports available</td></tr>
</table>

<p>Open request detail at <code>/radiology/requests/:id</code> for line-by-line progress and room assignment.</p>
`)}

${section('templates', '9. Templates & Structured Reporting', `
<p>The <strong>Radiology Templates</strong> workbench (<code>/radiology/templates</code>) provides structured reporting for X-ray, ultrasound, CT, MRI, and custom exam types.</p>

<h3>Opening the workbench</h3>
<ul>
<li>From validate screen after code verification</li>
<li>From workflow board — Start exam with linked RAD code</li>
<li>From order alert confirmation</li>
<li>Direct URL: <code>?code=RAD-…&amp;oi=…&amp;lock=1&amp;autoload=1</code></li>
</ul>

<h3>Structured entry</h3>
<ol class="step-row">
<li>Select exam template matching ordered service (modality, body part).</li>
<li>Enter findings — narrative and structured fields where configured.</li>
<li>Select conclusion code (normal, abnormal, follow-up recommended, etc.).</li>
<li>Attach images or documents if PACS integration or upload enabled.</li>
<li>Save draft or finalize — status moves to <span class="status-pill ready">Results ready</span>.</li>
</ol>

<p>Test templates maintained under radiology configuration and service catalog.</p>
`)}

${section('results', '10. Results Registry', `
<p><strong>Consolidated results</strong> at <code>/radiology/results</code> and the main worklist provide searchable access to all imaging reports.</p>

<h3>Status badges</h3>
<p>
<span class="status-pill pending">Awaiting payment</span>
<span class="status-pill progress">In progress</span>
<span class="status-pill ready">Results ready</span>
<span class="status-pill revision">Return for correction</span>
</p>

<h3>Group requests</h3>
<p>Multi-exam bundles show progress (e.g. <strong>2/3 done</strong>) until all lines are completed.</p>

<h3>Legacy results</h3>
<p>Historical exams registered before request workflow link to workflow board by result ID for continuity.</p>
`)}

${section('reports', '11. Reports & Printing', `
<h3>View report</h3>
<p><code>/radiology/report/:id</code> — formatted report with facility header, patient demographics, exam details, findings, conclusion, and modality information.</p>

<h3>Print patient copy</h3>
<ul>
<li>From worklist action menu → Print patient copy</li>
<li>From report page → <code>?print=1</code></li>
<li>Diagnostic handover API for integrated print dialogs</li>
</ul>

<h3>Batch scenarios</h3>
<p>When multiple exams share one RAD service code, finalize each line individually; batch print when all lines complete.</p>

<p>Reports use facility branding and premium document theme where configured.</p>
`)}

${section('corrections', '12. Corrections & Recalls', `
<h3>Return for correction</h3>
<p>Supervisor with <code>radiology.write</code> can recall a finalized report:</p>
<ol class="step-row">
<li>Worklist or registry → <strong>Return for correction</strong>.</li>
<li>Enter audit reason (required).</li>
<li>Status → <strong>Return for correction</strong> with revision pending flag.</li>
<li>Re-open via validate code or templates to edit and resubmit.</li>
</ol>

<h3>Recall for edit by code</h3>
<p>When linked to billed orders, recall reopens validate-by-code path to maintain payment integrity — same pattern as Laboratory module.</p>
`)}

${section('external', '13. External Imaging Results', `
<p>Studies performed at external facilities are documented separately:</p>
<ul>
<li>Mark order line as <strong>external</strong> on validate screen</li>
<li>Upload report or images via <strong>External upload</strong> or <strong>Attach document</strong></li>
<li>Status shows appropriately on worklist</li>
<li>Document appears on patient chart as attached diagnostic report</li>
</ul>

<p>Patient obtains study at referral center; staff uploads PDF or DICOM export when results return.</p>
`)}

${section('clinical', '14. OPD, IPD & Emergency Orders', `
<table class="data">
<tr><th>Context</th><th>Order source</th><th>Payment</th></tr>
<tr><td><strong>OPD</strong></td><td>Consultation orders</td><td>Prepay at Cashier before validate</td></tr>
<tr><td><strong>IPD</strong></td><td>Inpatient chart orders</td><td>Credit tab — settle at discharge or per policy</td></tr>
<tr><td><strong>Emergency</strong></td><td>ER chart orders</td><td>Retrospective billing after care</td></tr>
<tr><td><strong>Maternity</strong></td><td>Obstetric imaging orders</td><td>Standard cashier or MAT ticket flow</td></tr>
</table>

<p>Order alerts show context: Outpatient · Inpatient · Emergency.</p>

<p>Modalities commonly ordered: X-ray, ultrasound, CT, MRI, fluoroscopy — configured in service catalog and room setup.</p>
`)}

${section('cashier', '15. Cashier Integration', `
<p>Radiology depends on Cashier for payment verification:</p>
<ol class="step-row">
<li>Doctor order creates OPD order line with pending payment status.</li>
<li>Cashier collects fee and marks line paid.</li>
<li>System generates <span class="code-badge">RAD-…</span> service code on receipt.</li>
<li>Radiology validate checks paid status and ticket validity.</li>
<li>Partial payments: patient returns to cashier until balance zero.</li>
</ol>

<p>See the <strong>Cashier User Manual</strong> (<code>/docs/cashier-users-manual</code>) for payment methods, wallets, and code validity.</p>
`)}

${section('configuration', '16. Rooms, Groups & Catalog', `
<h3>Imaging rooms</h3>
<p><code>/radiology/configuration</code> — define rooms with code, name, modality (X-ray, US, CT, MRI), and active status.</p>

<h3>Test groups</h3>
<p>Bundle multiple exams (e.g. trauma series, antenatal panel) for single-request workflow.</p>

<h3>Service catalog</h3>
<p>Imaging studies and prices in Service Catalog → Radiology. Import price lists via <code>/catalog/radiology/import-price-list</code>.</p>

<h3>Modalities</h3>
<p>Standard modalities: CR/DX (X-ray), US (ultrasound), CT, MR (MRI), RF (fluoroscopy). Room and catalog entries align modality for scheduling and reporting.</p>

<p>Requires <code>radiology.write</code> or <code>service_catalog.radiology.write</code>.</p>
`)}

${section('screens', '17. Screen Reference (UI)', `
<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Radiology Portal — /portal/radiology</div>
  <div class="screen-body">
    <div style="font-size:9pt;font-weight:800;color:#0e7490;margin-bottom:2mm">🩻 Radiology &amp; Imaging Portal</div>
    <div style="font-size:7.5pt;color:#64748b;margin-bottom:3mm">Validate codes · Perform exams · Enter reports</div>
    <div style="display:flex;gap:2mm;flex-wrap:wrap;margin-bottom:3mm">
      <span style="background:#cffafe;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Total 84</span>
      <span style="background:#fef3c7;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Pending 7</span>
      <span style="background:#d1fae5;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Done 72</span>
      <span style="background:#dbeafe;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Today 5</span>
    </div>
    <div style="display:flex;gap:2mm;flex-wrap:wrap;font-size:7.5pt">
      <span style="background:#0891b2;color:white;padding:1mm 2.5mm;border-radius:4px;font-weight:700">All Results</span>
      <span style="background:white;border:1px solid #e2e8f0;padding:1mm 2.5mm;border-radius:4px">Order alerts</span>
      <span style="background:white;border:1px solid #e2e8f0;padding:1mm 2.5mm;border-radius:4px">Workflow</span>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Validate code — /radiology/validate</div>
  <div class="screen-body" style="font-size:8.5pt">
    <div style="font-size:10pt;margin-bottom:2mm">🩻 Radiology · Validate code</div>
    <div style="background:white;border:2px solid #67e8f9;border-radius:4px;padding:3mm;text-align:center;font-family:monospace;font-weight:800;font-size:11pt;margin:2mm 0">RAD-8821-K2HM9X4P</div>
    <div style="background:white;border:1px solid #e2e8f0;border-radius:4px;padding:2.5mm;margin-top:2mm">
      <strong>Jean Nkoulou</strong> · Dr. Eboa · Chest X-ray PA + Lateral
      <div style="margin-top:1.5mm"><span style="color:#059669;font-weight:700">✓ Paid · Start exam</span></div>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Workflow board — /radiology/workflow</div>
  <div class="screen-body" style="font-size:8pt">
    <div class="kanban-cols" style="margin:0">
      <span class="pending"><strong>Pending (3)</strong><br/>Abdominal US</span>
      <span class="progress"><strong>In progress (2)</strong><br/>Chest X-ray</span>
      <span class="done"><strong>Completed (5)</strong><br/>Skull X-ray</span>
    </div>
  </div>
</div>

<div class="tip"><strong>Live screenshots:</strong> Open <code>/portal/radiology</code> or <code>/radiology</code> while signed in; Print → Save as PDF for training.</div>
`)}

${section('troubleshooting', '18. Troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Code rejected — payment required</td><td>Patient must pay at Cashier; verify order line status</td></tr>
<tr><td>Wrong department code</td><td>RAD codes for radiology; LAB and PHA go to respective departments</td></tr>
<tr><td>Cannot start exam</td><td>Validate RAD code first; check service code linked to order item</td></tr>
<tr><td>Template not loading</td><td>Confirm code, oi, and autoload query params; use order alert context</td></tr>
<tr><td>Request stuck on submitted</td><td>Accept request on detail page to begin exams</td></tr>
<tr><td>Group request partial</td><td>Complete each exam line; progress shows done/total</td></tr>
<tr><td>Print blank report</td><td>Verify status is Results ready; try <code>?print=1</code></td></tr>
<tr><td>Room not listed</td><td>Add or activate room under Configuration</td></tr>
<tr><td>External upload fails</td><td>Check file size limits; use PDF or image format</td></tr>
<tr><td>Expired consultation ticket</td><td>Patient needs new consultation payment if validity expired</td></tr>
</table>
`)}

${section('glossary', '19. Glossary', `
<table class="data">
<tr><th>Term</th><th>Definition</th></tr>
<tr><td>RAD code</td><td>Service code prefix for radiology order lines (e.g. RAD-8821-…)</td></tr>
<tr><td>Modality</td><td>Imaging type: X-ray, ultrasound, CT, MRI, fluoroscopy</td></tr>
<tr><td>Worklist</td><td>Unified hub of imaging requests at /radiology</td></tr>
<tr><td>Workflow board</td><td>Kanban view: pending → in progress → completed</td></tr>
<tr><td>Validate</td><td>Verify payment and open order for processing</td></tr>
<tr><td>Template</td><td>Structured form for exam findings and conclusion</td></tr>
<tr><td>Test group</td><td>Bundle of exams ordered as one request</td></tr>
<tr><td>Imaging room</td><td>Physical location/modality assignment for exams</td></tr>
<tr><td>Order alert</td><td>Notification of new doctor-ordered imaging study</td></tr>
<tr><td>Revision pending</td><td>Report recalled and awaiting correction</td></tr>
<tr><td>External</td><td>Study performed outside; results uploaded</td></tr>
</table>
`)}

<p class="footer-note">© ${esc(new Date().getFullYear())} ${esc(b.name)} · Radiology Users Manual v2.0 · ${esc(b.facilityName || b.orgName)} · Confidential</p>
</div>`;

  return wrapPremiumDoc({
    title: `Radiology User Manual — ${b.productName}`,
    variant: 'radiology-manual',
    bodyHtml: body,
  });
}

module.exports = { buildRadiologyUsersManualHtml, RADIOLOGY_EXTRA_CSS };
