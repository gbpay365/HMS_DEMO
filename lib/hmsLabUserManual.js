'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const LAB_EXTRA_CSS = `
:root[data-doc="lab-manual"] {
  --accent: #7c3aed;
  --accent-light: #ede9fe;
  --lab-violet: #7c3aed;
  --lab-violet-dark: #5b21b6;
  --lab-cyan: #0ea5e9;
  --lab-emerald: #10b981;
  --lab-amber: #f59e0b;
  --lab-rose: #e11d48;
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
  border-radius: 50%; background: var(--lab-violet-dark); color: white; font-size: 6.5pt; margin-bottom: 1mm;
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
  margin: 4mm 0 5mm; break-inside: avoid; box-shadow: 0 1px 4px rgba(91,33,182,0.08);
}
.screen-bar {
  background: linear-gradient(90deg, #5b21b6, #0ea5e9);
  color: rgba(255,255,255,0.92); padding: 2mm 3mm; font-size: 8pt;
  display: flex; align-items: center; gap: 2mm;
}
.screen-bar .dot { width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #c4b5fd; }
.screen-bar .dot:nth-child(2) { background: #fcd34d; }
.screen-bar .dot:nth-child(3) { background: #86efac; }
.screen-body { background: #f5f3ff; padding: 4mm; }
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
  width: 5mm; height: 5mm; border-radius: 50%; background: var(--lab-violet);
  color: white; font-size: 7pt; font-weight: 700; text-align: center; line-height: 5mm;
}
.perm-pill {
  display: inline-block; font-size: 7pt; font-family: ui-monospace, monospace;
  background: #f1f5f9; padding: 0.5mm 2mm; border-radius: 2px; margin: 0.5mm;
}
.hero-img { width: 100%; max-height: 45mm; object-fit: cover; border-radius: 4px; margin: 3mm 0; }
.code-badge {
  display: inline-block; font-family: ui-monospace, monospace; font-size: 8pt; font-weight: 800;
  padding: 1mm 2.5mm; border-radius: 3px; border: 2px solid #c4b5fd; background: #ede9fe; color: #5b21b6;
}
.lims-menu {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin: 3mm 0; font-size: 7.5pt;
}
.lims-menu span {
  background: white; border: 1px solid #e2e8f0; border-radius: 3px; padding: 2mm 1mm; text-align: center;
}
`;

function buildLabUsersManualHtml() {
  const b = brand;
  const body = `
<style>${PREMIUM_CSS}${LAB_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'Laboratory User Manual',
  title: 'Laboratory & LIMS',
  subtitle: 'Complete staff guide — payment validation, order alerts, structured templates, sample tracking, results registry, reports, corrections, and clinical integration.',
  badge: 'Premium · Professional Edition',
  variant: 'lab-manual',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)} Laboratory User Manual</strong>. The Laboratory module manages the full diagnostic pathway — from doctor orders and cashier payment verification through sample collection, structured result entry, finalization, and patient report delivery.</p>
<div class="tip"><strong>Two workspaces:</strong> Use the <strong>Laboratory Registry</strong> (<code>/laboratory</code>) for results and the <strong>LIMS hub</strong> (<code>/lims</code>) for requests, samples, and configuration.</div>

<div class="kpi-row">
  <div class="kpi"><strong>LAB</strong><span>Service codes</span></div>
  <div class="kpi"><strong>LIMS</strong><span>Sample tracking</span></div>
  <div class="kpi"><strong>All</strong><span>Clinical contexts</span></div>
</div>

<img class="hero-img" src="public/call-queue/photos/imaging.jpg" alt="Laboratory diagnostics" />

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#overview">Laboratory overview &amp; roles</a></li>
<li><a href="#workflow">End-to-end lab workflow</a></li>
<li><a href="#portal">Laboratory portal</a></li>
<li><a href="#lims">LIMS hub</a></li>
<li><a href="#validate">Validate payment code</a></li>
<li><a href="#alerts">Order alerts</a></li>
<li><a href="#templates">Lab templates &amp; workbench</a></li>
<li><a href="#registry">Laboratory registry</a></li>
<li><a href="#requests">LIMS test requests</a></li>
<li><a href="#samples">Sample collection</a></li>
<li><a href="#results">Entering &amp; finalizing results</a></li>
<li><a href="#reports">Reports &amp; printing</a></li>
<li><a href="#corrections">Corrections &amp; recalls</a></li>
<li><a href="#external">External lab results</a></li>
<li><a href="#clinical">OPD, IPD &amp; Emergency orders</a></li>
<li><a href="#cashier">Cashier integration</a></li>
<li><a href="#catalog">Catalog &amp; LIMS configuration</a></li>
<li><a href="#screens">Screen reference</a></li>
<li><a href="#troubleshooting">Troubleshooting</a></li>
<li><a href="#glossary">Glossary</a></li>
</ol>
</div>

${section('overview', '1. Laboratory Overview & Roles', `
<p>The <strong>Laboratory module</strong> connects clinical orders to verified, billable, and reportable test results across OPD, IPD, Emergency, and Maternity contexts.</p>

<div class="role-grid">
  <div class="role-card" style="background:#ede9fe;border-color:#c4b5fd">
    <div class="icon">🧪</div>
    <strong>Lab Technician</strong>
    <span>Validate LAB codes, enter structured results, collect samples, finalize reports</span>
  </div>
  <div class="role-card" style="background:#dbeafe;border-color:#93c5fd">
    <div class="icon">👨‍⚕️</div>
    <strong>Doctor</strong>
    <span>Orders laboratory tests from consultation, IPD, or ER chart</span>
  </div>
  <div class="role-card" style="background:#d1fae5;border-color:#6ee7b7">
    <div class="icon">💳</div>
    <strong>Cashier</strong>
    <span>Collects payment; issues LAB service codes on order slips</span>
  </div>
  <div class="role-card" style="background:#cffafe;border-color:#67e8f9">
    <div class="icon">🩺</div>
    <strong>Nurse / Phlebotomist</strong>
    <span>Sample collection, LIMS request workflow</span>
  </div>
  <div class="role-card" style="background:#fef3c7;border-color:#fcd34d">
    <div class="icon">📋</div>
    <strong>Lab Supervisor</strong>
    <span>Review results, authorize corrections, manage LIMS config</span>
  </div>
  <div class="role-card" style="background:#fce7f3;border-color:#f9a8d4">
    <div class="icon">👤</div>
    <strong>Patient</strong>
    <span>Pays at cashier, presents LAB code at lab desk, receives printed report</span>
  </div>
</div>

<h3>Key URLs</h3>
<table class="data">
<tr><th>Screen</th><th>Path</th></tr>
<tr><td>Laboratory Portal</td><td><code>/portal/lab</code></td></tr>
<tr><td>Laboratory Registry</td><td><code>/laboratory</code></td></tr>
<tr><td>Validate LAB code</td><td><code>/laboratory/validate</code></td></tr>
<tr><td>Lab templates / workbench</td><td><code>/laboratory/templates</code></td></tr>
<tr><td>Order alerts</td><td><code>/laboratory/order-alerts</code></td></tr>
<tr><td>LIMS hub</td><td><code>/lims</code></td></tr>
<tr><td>Lab requests</td><td><code>/lims/requests</code></td></tr>
<tr><td>Lab samples</td><td><code>/lims/samples</code></td></tr>
<tr><td>LIMS configuration</td><td><code>/lims/config</code></td></tr>
<tr><td>Test report</td><td><code>/laboratory/report/:id</code></td></tr>
</table>

<div class="note"><strong>Permissions:</strong> <span class="perm-pill">lab.read</span> view orders &amp; results · <span class="perm-pill">lab.write</span> enter &amp; validate results · <span class="perm-pill">service_catalog.laboratory.write</span> catalog &amp; LIMS config</div>
`)}

${section('workflow', '2. End-to-End Lab Workflow', `
<div class="flow">Doctor orders test → Patient pays at Cashier (LAB code issued)
→ Lab validates code → Sample collected (LIMS) → Results entered (templates)
→ Finalized → Report on chart &amp; patient copy printed</div>

<div class="wf-strip">
  <div class="wf-chip"><span class="n">1</span><br/>Doctor order</div>
  <div class="wf-chip"><span class="n">2</span><br/>Cashier payment</div>
  <div class="wf-chip"><span class="n">3</span><br/>Validate LAB code</div>
  <div class="wf-chip"><span class="n">4</span><br/>Sample collection</div>
  <div class="wf-chip"><span class="n">5</span><br/>Enter results</div>
  <div class="wf-chip"><span class="n">6</span><br/>Finalize &amp; print</div>
</div>

<h3>Standard OPD pathway</h3>
<ol class="step-row">
<li>Doctor adds laboratory test(s) during consultation.</li>
<li>Patient pays at Cashier — receives slip with <span class="code-badge">LAB-…</span> service code.</li>
<li>Lab technician validates code at <code>/laboratory/validate</code>.</li>
<li>Sample collected; LIMS request updated if used.</li>
<li>Technician opens lab template workbench and enters structured parameters.</li>
<li>Result finalized — appears on patient chart and Laboratory Registry.</li>
<li>Print patient copy from report or registry action menu.</li>
</ol>

<h3>Order alerts shortcut</h3>
<p>Doctor orders also appear on <strong>Order alerts</strong> (<code>/laboratory/order-alerts</code>). Acknowledge alert → confirm → opens lab template with patient prefilled.</p>

<div class="warn"><strong>Payment gate:</strong> Lab cannot process unpaid orders. System blocks validation until Cashier marks the order line as paid.</div>
`)}

${section('portal', '3. Laboratory Portal', `
<p>The <strong>Laboratory Portal</strong> (<code>/portal/lab</code>) is the lab technician home screen with KPIs and quick links.</p>

<h3>KPI strip</h3>
<ul>
<li><strong>Total Tests</strong> — all registered lab results</li>
<li><strong>Pending</strong> — awaiting completion</li>
<li><strong>Completed</strong> — finalized results</li>
<li><strong>Today's Tests</strong> — tests registered today</li>
</ul>

<h3>Quick actions</h3>
<ul>
<li><strong>LIMS hub</strong> — requests, samples, configuration</li>
<li><strong>Registry</strong> — full results list at <code>/laboratory</code></li>
<li><strong>Templates</strong> — structured result entry workbench</li>
<li><strong>Order alerts</strong> — new doctor orders needing attention</li>
<li><strong>Patients</strong> — patient search (if permitted)</li>
</ul>

<p>Portal tiles provide role-specific shortcuts configured by your administrator.</p>
`)}

${section('lims', '4. LIMS Hub', `
<p>The <strong>Laboratory Information Management System (LIMS)</strong> hub at <code>/lims</code> tracks the operational side of lab work — requests, samples, and configuration — complementing the results registry.</p>

<h3>Hub KPIs</h3>
<table class="data">
<tr><th>Stat</th><th>Meaning</th></tr>
<tr><td>Today's open</td><td>Requests scheduled today not yet completed</td></tr>
<tr><td>Submitted</td><td>New requests awaiting acceptance</td></tr>
<tr><td>In progress</td><td>Accepted or actively being processed</td></tr>
<tr><td>Samples collected</td><td>Physical samples recorded in system</td></tr>
</table>

<h3>LIMS menus</h3>
<div class="lims-menu">
<span>📋 Lab requests</span><span>➕ New request</span><span>🩸 Lab samples</span><span>📄 Test results</span>
<span>🔍 Validate code</span><span>📝 Templates</span><span>⚙️ Configuration</span><span>🔗 Registry</span>
</div>

<p>Test results menu redirects to the Laboratory Registry (<code>/laboratory</code>) where finalized reports are managed.</p>
`)}

${section('validate', '5. Validate Payment Code', `
<p>The validate screen is the primary entry point when a patient arrives at the lab desk with a payment slip.</p>

<ol class="step-row">
<li>Open <code>/laboratory/validate</code> or click <strong>+ New test</strong> on the Registry.</li>
<li>Scan barcode or type the <strong>LAB service code</strong> (e.g. <code>LAB-4829-K7HM3R9Q</code>).</li>
<li>System verifies: code belongs to laboratory · order line is paid · ticket validity passes.</li>
<li>Validate detail shows patient, referring doctor, and in-house test lines.</li>
<li>Choose action: open lab template for structured entry, or submit quick findings.</li>
</ol>

<h3>Validation failures</h3>
<table class="data">
<tr><th>Error</th><th>Cause</th></tr>
<tr><td>Payment required</td><td>Patient has not paid at Cashier</td></tr>
<tr><td>Code belongs to radiology/pharmacy</td><td>Wrong department code entered</td></tr>
<tr><td>Expired ticket</td><td>Consultation-linked validity expired</td></tr>
<tr><td>Duplicate result</td><td>Result already registered for this order line</td></tr>
</table>

<div class="tip">Use the API preflight at validate time — the system checks authorization before opening templates to prevent unpaid processing.</div>
`)}

${section('alerts', '6. Order Alerts', `
<p><strong>Order alerts</strong> (<code>/laboratory/order-alerts</code>) surface doctor-ordered tests from consultations, IPD, and Emergency contexts.</p>

<ol class="step-row">
<li>Open Order alerts from portal or sidebar.</li>
<li>Review <strong>Needs your attention</strong> — unacknowledged orders.</li>
<li>Each alert shows patient, test name, context (OPD / IPD / Emergency), and ordering doctor.</li>
<li>Click <strong>Confirm &amp; open lab template</strong> — prefills patient and order line.</li>
<li>Or <strong>Mark as seen</strong> if handled through validate-code flow.</li>
</ol>

<p>Recent history shows previously acknowledged alerts for audit trail.</p>

<div class="note">Alerts for IPD and Emergency patients may appear before cashier settlement on credit tabs — verify local policy for when to process vs when payment is required.</div>
`)}

${section('templates', '7. Lab Templates & Workbench', `
<p>The <strong>Lab Templates</strong> workbench (<code>/laboratory/templates</code>) provides structured data entry for common test panels — CBC, urinalysis, chemistry, serology, and custom templates.</p>

<h3>Opening the workbench</h3>
<ul>
<li>From validate screen after code verification</li>
<li>From order alert confirmation</li>
<li>Direct URL with <code>?code=LAB-…&amp;oi=…</code> query parameters</li>
<li><strong>+ New test</strong> on Laboratory Registry (with patient authorization)</li>
</ul>

<h3>Template entry</h3>
<ol class="step-row">
<li>Select test template matching the ordered service.</li>
<li>Enter parameter values — numeric fields, dropdowns, reference ranges shown where configured.</li>
<li>Add findings and conclusion text for narrative sections.</li>
<li>Attach supporting documents if required.</li>
<li>Save draft or finalize — status moves to <span class="status-pill ready">Results ready</span>.</li>
</ol>

<p>Template definitions are maintained under <code>/laboratory/test-templates</code> (admin/lab supervisor).</p>
`)}

${section('registry', '8. Laboratory Registry', `
<p>The <strong>Laboratory Registry</strong> (<code>/laboratory</code>) lists all test results with search, pagination, and actions.</p>

<h3>Columns</h3>
<table class="data">
<tr><th>Column</th><th>Description</th></tr>
<tr><td>Test ID</td><td>Internal reference <code>#LAB-0001</code></td></tr>
<tr><td>Patient</td><td>Name and patient ID</td></tr>
<tr><td>Test name</td><td>Catalog or free-text test name</td></tr>
<tr><td>Referred by</td><td>Ordering doctor or self-referral</td></tr>
<tr><td>Date</td><td>Appointment / collection date</td></tr>
<tr><td>Status</td><td>Pending, In progress, Results ready, Completed, Revision</td></tr>
</table>

<h3>Status badges</h3>
<p>
<span class="status-pill pending">Pending</span>
<span class="status-pill progress">In progress</span>
<span class="status-pill ready">Results ready</span>
<span class="status-pill revision">Return for correction</span>
</p>

<h3>Actions menu</h3>
<ul>
<li><strong>View test</strong> — open full report</li>
<li><strong>Print patient copy</strong> — when result is ready</li>
<li><strong>Return for correction</strong> — supervisor recall with audit note</li>
</ul>
`)}

${section('requests', '9. LIMS Test Requests', `
<p>Create and manage formal lab requests through LIMS when your facility uses request/sample tracking.</p>

<h3>New request</h3>
<ol class="step-row">
<li>Open <code>/lims/request/new</code>.</li>
<li>Select patient and prescribing doctor.</li>
<li>Choose collection center and scheduled date/time.</li>
<li>Select test group (panel) or individual catalog tests.</li>
<li>Submit — request status <strong>Submitted</strong>.</li>
</ol>

<h3>Request lifecycle</h3>
<table class="data">
<tr><th>Status</th><th>Action</th></tr>
<tr><td>Submitted</td><td>Lab accepts request</td></tr>
<tr><td>Accepted</td><td>Mark in progress when work begins</td></tr>
<tr><td>In progress</td><td>Record samples, enter results</td></tr>
<tr><td>Done</td><td>Request completed — linked to registry result</td></tr>
</table>

<p>Filter requests: Today · Pending · Done · All at <code>/lims/requests</code>.</p>
`)}

${section('samples', '10. Sample Collection', `
<p>Physical sample tracking at <code>/lims/samples</code> and per-request <strong>Samples</strong> tab.</p>

<ol class="step-row">
<li>Open lab request detail page.</li>
<li>Go to <strong>Samples</strong> tab.</li>
<li>Record sample type (blood, urine, swab, etc.), collection time, and collector.</li>
<li>Sample status: collected → in transit → received in lab.</li>
<li>Sample list visible on LIMS samples page for batch review.</li>
</ol>

<div class="tip">Sample types and collection centers are configured under LIMS Configuration.</div>
`)}

${section('results', '11. Entering & Finalizing Results', `
<h3>Quick findings (validate flow)</h3>
<p>On validate detail, enter findings and conclusion per order line and submit — creates registry entry with status <strong>received</strong>.</p>

<h3>Structured templates</h3>
<p>Preferred for panels with many parameters — ensures consistent formatting and reference range display on printed reports.</p>

<h3>Finalization checklist</h3>
<ul>
<li>All ordered lines have results entered</li>
<li>Critical values flagged per local protocol</li>
<li>Conclusion / interpretation documented</li>
<li>Supervisor review if required by policy</li>
<li>Status = Results ready or Completed</li>
</ul>

<p>Results sync to patient chart — doctors view under Laboratory section of clinical record.</p>
`)}

${section('reports', '12. Reports & Printing', `
<h3>View report</h3>
<p><code>/laboratory/report/:id</code> — formatted report with facility header, patient demographics, test parameters, reference ranges, and conclusion.</p>

<h3>Print patient copy</h3>
<ul>
<li>From Registry action menu → Print patient copy</li>
<li>From report page → <code>?print=1</code> query</li>
<li>Diagnostic handover API for integrated print dialogs</li>
</ul>

<h3>Batch print</h3>
<p>When multiple tests share one LAB service code, batch print API returns all finalized reports for patient handoff at once.</p>

<p>Reports use facility branding configured in deployment settings.</p>
`)}

${section('corrections', '13. Corrections & Recalls', `
<h3>Return for correction</h3>
<p>Supervisor with <code>lab.write</code> can recall a finalized result:</p>
<ol class="step-row">
<li>Registry → action menu → <strong>Return for correction</strong>.</li>
<li>Enter audit reason (required for compliance).</li>
<li>Status changes to <strong>Return for correction</strong> — revision pending flag set.</li>
<li>Re-open via validate code or templates to edit and resubmit.</li>
</ol>

<h3>Correction reason on resubmit</h3>
<p>When editing a recalled result, document correction reason — stored in audit trail linked to order item.</p>

<div class="warn">Recalled results linked to billed orders reopen the validate-by-code path to maintain payment integrity.</div>
`)}

${section('external', '14. External Lab Results', `
<p>Tests performed outside the facility (external referral) are documented separately:</p>
<ul>
<li>Mark order line as <strong>external</strong> on validate screen</li>
<li>Upload result document via <strong>External upload</strong> or <strong>Attach document</strong></li>
<li>Status shows as <strong>External</strong> on registry</li>
<li>Document appears on patient chart as attached diagnostic report</li>
</ul>

<p>Patient obtains test at external lab; staff uploads PDF or image when results return.</p>
`)}

${section('clinical', '15. OPD, IPD & Emergency Orders', `
<table class="data">
<tr><th>Context</th><th>Order source</th><th>Payment</th></tr>
<tr><td><strong>OPD</strong></td><td>Consultation orders</td><td>Prepay at Cashier before validate</td></tr>
<tr><td><strong>IPD</strong></td><td>Inpatient chart orders</td><td>Credit tab — settle at discharge or per policy</td></tr>
<tr><td><strong>Emergency</strong></td><td>ER chart orders</td><td>Retrospective billing after care</td></tr>
<tr><td><strong>Maternity</strong></td><td>ANC / labor orders</td><td>MAT tickets or standard cashier flow</td></tr>
</table>

<p>Order alerts show context badge: Outpatient · Inpatient · Emergency — so technicians prioritize correctly.</p>

<p>IPD/Emergency alerts may route from ward board or ER disposition workflows.</p>
`)}

${section('cashier', '16. Cashier Integration', `
<p>Laboratory depends on Cashier for payment verification:</p>
<ol class="step-row">
<li>Doctor order creates OPD order line with pending payment status.</li>
<li>Cashier collects fee and marks line paid.</li>
<li>System generates <span class="code-badge">LAB-…</span> service code on receipt.</li>
<li>Lab validate checks <code>isOrderLinePaidForFulfillment</code> and ticket validity.</li>
<li>Partial payments: patient returns to cashier until balance zero before lab proceeds.</li>
</ol>

<p>See the <strong>Cashier User Manual</strong> (<code>/docs/cashier-users-manual</code>) for payment methods, wallets, and code validity rules.</p>
`)}

${section('catalog', '17. Catalog & LIMS Configuration', `
<h3>Service catalog</h3>
<p>Laboratory tests and prices maintained in Service Catalog → Laboratory. Import price lists via <code>/catalog/laboratory/import-price-list</code>.</p>

<h3>LIMS configuration</h3>
<p><code>/lims/config</code> sections:</p>
<ul>
<li><strong>Test groups</strong> — panels combining multiple catalog tests</li>
<li><strong>Collection centers</strong> — phlebotomy locations</li>
<li><strong>Sample types</strong> — blood, urine, CSF, etc.</li>
<li><strong>Catalog linkage</strong> — active tests available for requests</li>
</ul>

<p>Requires <code>lab.write</code> or <code>service_catalog.laboratory.write</code>.</p>
`)}

${section('screens', '18. Screen Reference (UI)', `
<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Laboratory Portal — /portal/lab</div>
  <div class="screen-body">
    <div style="font-size:9pt;font-weight:800;color:#5b21b6;margin-bottom:2mm">🧪 Laboratory Portal</div>
    <div style="font-size:7.5pt;color:#64748b;margin-bottom:3mm">Validate codes · Enter results · Track samples</div>
    <div style="display:flex;gap:2mm;flex-wrap:wrap;margin-bottom:3mm">
      <span style="background:#ede9fe;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Total 128</span>
      <span style="background:#fef3c7;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Pending 12</span>
      <span style="background:#d1fae5;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Done 96</span>
      <span style="background:#e0f2fe;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Today 8</span>
    </div>
    <div style="display:flex;gap:2mm;flex-wrap:wrap;font-size:7.5pt">
      <span style="background:#7c3aed;color:white;padding:1mm 2.5mm;border-radius:4px;font-weight:700">LIMS hub</span>
      <span style="background:white;border:1px solid #e2e8f0;padding:1mm 2.5mm;border-radius:4px">Registry</span>
      <span style="background:white;border:1px solid #e2e8f0;padding:1mm 2.5mm;border-radius:4px">Templates</span>
      <span style="background:white;border:1px solid #e2e8f0;padding:1mm 2.5mm;border-radius:4px">Order alerts</span>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Validate code — /laboratory/validate</div>
  <div class="screen-body" style="font-size:8.5pt">
    <div style="font-size:10pt;margin-bottom:2mm">🧪 Laboratory · Validate code</div>
    <div style="background:white;border:2px solid #c4b5fd;border-radius:4px;padding:3mm;text-align:center;font-family:monospace;font-weight:800;font-size:11pt;margin:2mm 0">LAB-4829-K7HM3R9Q</div>
    <div style="background:white;border:1px solid #e2e8f0;border-radius:4px;padding:2.5mm;margin-top:2mm">
      <strong>Jane Doe</strong> · Dr. Mbarga · CBC + Malaria RDT
      <div style="margin-top:1.5mm"><span style="color:#059669;font-weight:700">✓ Paid · Open template</span></div>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> LIMS Hub — /lims</div>
  <div class="screen-body" style="font-size:8pt">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin-bottom:3mm">
      <div style="background:white;border-left:3px solid #7c3aed;padding:2mm;text-align:center"><strong>6</strong><br/>Today open</div>
      <div style="background:white;border-left:3px solid #0ea5e9;padding:2mm;text-align:center"><strong>3</strong><br/>Submitted</div>
      <div style="background:white;border-left:3px solid #f59e0b;padding:2mm;text-align:center"><strong>2</strong><br/>In progress</div>
      <div style="background:white;border-left:3px solid #16a34a;padding:2mm;text-align:center"><strong>5</strong><br/>Samples</div>
    </div>
    <div class="lims-menu" style="margin:0">
      <span>Requests</span><span>New</span><span>Samples</span><span>Validate</span>
    </div>
  </div>
</div>

<div class="tip"><strong>Live screenshots:</strong> Open <code>/portal/lab</code> or <code>/laboratory</code> while signed in; Print → Save as PDF for training materials.</div>
`)}

${section('troubleshooting', '19. Troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Code rejected — payment required</td><td>Patient must pay at Cashier first; verify order line status</td></tr>
<tr><td>Wrong department code</td><td>LAB codes start with LAB; RAD and PHA codes go to respective departments</td></tr>
<tr><td>Duplicate result warning</td><td>Result already exists for order line — view existing report or recall for correction</td></tr>
<tr><td>Template not loading</td><td>Confirm code and oi query params; check order alert context API</td></tr>
<tr><td>Cannot finalize result</td><td>Ensure all required template fields filled; check lab.write permission</td></tr>
<tr><td>Print blank report</td><td>Verify status is Results ready; try <code>?print=1</code> directly</td></tr>
<tr><td>Order alert missing</td><td>Doctor may not have saved order; check consultation chart orders tab</td></tr>
<tr><td>LIMS request stuck</td><td>Accept request → mark in progress → record sample → complete</td></tr>
<tr><td>External upload fails</td><td>Check file size limits; use PDF or image format</td></tr>
<tr><td>Expired consultation ticket</td><td>Patient needs new consultation payment if validity expired</td></tr>
</table>
`)}

${section('glossary', '20. Glossary', `
<table class="data">
<tr><th>Term</th><th>Definition</th></tr>
<tr><td>LAB code</td><td>Service code prefix for laboratory order lines (e.g. LAB-4829-…)</td></tr>
<tr><td>LIMS</td><td>Laboratory Information Management System — requests &amp; samples</td></tr>
<tr><td>Registry</td><td>Master list of all lab results at /laboratory</td></tr>
<tr><td>Validate</td><td>Verify payment and open order for processing</td></tr>
<tr><td>Template</td><td>Structured form for entering test parameters</td></tr>
<tr><td>Order alert</td><td>Notification of new doctor-ordered test</td></tr>
<tr><td>Order line (oi)</td><td>Single test item on OPD/IPD/ER order</td></tr>
<tr><td>Revision pending</td><td>Result recalled and awaiting correction</td></tr>
<tr><td>In-house</td><td>Test performed at this facility</td></tr>
<tr><td>External</td><td>Test performed outside; results uploaded</td></tr>
<tr><td>Panel / test group</td><td>Bundle of tests ordered together in LIMS</td></tr>
</table>
`)}

<p class="footer-note">© ${esc(new Date().getFullYear())} ${esc(b.name)} · Laboratory Users Manual v2.0 · ${esc(b.facilityName || b.orgName)} · Confidential</p>
</div>`;

  return wrapPremiumDoc({
    title: `Laboratory User Manual — ${b.productName}`,
    variant: 'lab-manual',
    bodyHtml: body,
  });
}

module.exports = { buildLabUsersManualHtml, LAB_EXTRA_CSS };
