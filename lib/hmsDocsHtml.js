/**
 * Printable HTML for HMS documentation (parity with PHP includes/*-pdf.php).
 */
const { buildProductDocumentHtml } = require('./hmsProductDocument');
const { buildComprehensiveUserGuideHtml } = require('./hmsComprehensiveUserGuide');
const { buildOpdUsersManualHtml } = require('./hmsOpdUserManual');
const { buildIpdUsersManualHtml } = require('./hmsIpdUserManual');
const { buildEmergencyUsersManualHtml } = require('./hmsEmergencyUserManual');
const { buildMaternityUsersManualHtml } = require('./hmsMaternityUserManual');
const { buildCashierUsersManualHtml } = require('./hmsCashierUserManual');
const { buildLabUsersManualHtml } = require('./hmsLabUserManual');
const { buildRadiologyUsersManualHtml } = require('./hmsRadiologyUserManual');
const { buildPharmacyUsersManualHtml } = require('./hmsPharmacyUserManual');
const { buildNursingUsersManualHtml } = require('./hmsNursingUserManual');
const { buildDoctorUsersManualHtml } = require('./hmsDoctorUserManual');
const { buildDirectorUsersManualHtml } = require('./hmsDirectorUserManual');

const DOC_STYLES = `
body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #0f172a; line-height: 1.45; max-width: 52rem; margin: 0 auto; padding: 1.5rem; }
h1 { font-size: 18pt; color: #0c8b8b; margin: 0 0 12px; border-bottom: 2px solid #0c8b8b; padding-bottom: 6px; }
h2 { font-size: 13pt; color: #1e293b; margin: 18px 0 8px; page-break-after: avoid; }
h3 { font-size: 11pt; color: #334155; margin: 12px 0 6px; }
p { margin: 0 0 8px; }
ul, ol { margin: 6px 0 10px 18px; padding: 0; }
li { margin-bottom: 4px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9.5pt; }
th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #f1f5f9; font-weight: bold; }
.meta { font-size: 9pt; color: #64748b; margin-bottom: 16px; }
.code { font-family: ui-monospace, monospace; font-size: 8.5pt; background: #f8fafc; padding: 2px 4px; }
.tip { background: #ecfdf5; border-left: 3px solid #0c8b8b; padding: 8px 10px; margin: 10px 0; font-size: 9.5pt; }
.box { background: #f8fafc; border-left: 3px solid #0c8b8b; padding: 10px 12px; margin: 10px 0; font-size: 9.5pt; }
.flow { font-family: ui-monospace, monospace; font-size: 8.5pt; background: #f1f5f9; padding: 10px; white-space: pre-wrap; margin: 10px 0; }
.page-break { page-break-before: always; }
.small { font-size: 9pt; color: #475569; }
@media print { body { padding: 0; } .no-print { display: none !important; } }
`;

function esc(s) {
 return String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
}

function generatedStamp() {
 return new Date().toLocaleString('en-GB', { timeZoneName: 'short' });
}

function wrapDoc(title, body) {
 return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${DOC_STYLES}</style></head><body>${body}</body></html>`;
}

function buildUserGuideHtml() {
 const g = esc(generatedStamp());
 const body = `
<h1>Hospital Management System</h1>
<p class="meta"><strong>User Guide</strong> — Task-oriented help for staff<br>Version 1.0 · Generated ${g} · Node HMS</p>
<p>This <strong>User Guide</strong> explains how to perform common tasks in HMS. Your administrator controls which menus and actions you see.</p>
<div class="tip"><strong>Tip:</strong> Use the left sidebar (Patients, Visits, Consultations, Cashier, Financials, etc.). The <strong>Users Manual</strong> lists modules and terms in reference form.</div>
<h2>1. Signing in &amp; security</h2><ul>
<li>Open your HMS URL and sign in with your <strong>username</strong> and <strong>password</strong>.</li>
<li><strong>Sign out</strong> when finished on shared computers.</li>
<li>Do not share credentials. Sensitive actions may be audited.</li>
</ul>
<h2>2. Facility (site) context</h2><p>If your hospital uses <strong>multiple sites</strong>, your session is tied to one <strong>facility</strong> at a time. Patient lists, charges, and stock are usually scoped to the active facility.</p>
<h2>3. Language</h2><p>English and French are available on <a href="/financials/platform-overview">Help &amp; setup</a> (<span class="code">POST /set-lang</span>).</p>
<div class="page-break"></div><h2>4. Quick start by role</h2>
<table><tr><th>Role</th><th>Start here (Node)</th></tr>
<tr><td>Front desk</td><td><span class="code">/portal/front-desk</span>, <span class="code">/patients</span>, OPD queue</td></tr>
<tr><td>Nursing</td><td><span class="code">/portal/nurse</span>, vitals, OPD queue, patient chart</td></tr>
<tr><td>Doctor</td><td><span class="code">/portal/doctor</span>, consultations, patient chart</td></tr>
<tr><td>Laboratory</td><td><span class="code">/portal/lab</span>, service verification, lab results</td></tr>
<tr><td>Radiology</td><td><span class="code">/portal/radiology</span>, service verification, radiology results</td></tr>
<tr><td>Pharmacy</td><td><span class="code">/portal/pharmacy</span>, prescriptions, dispensing</td></tr>
<tr><td>Cashier / billing</td><td><span class="code">/portal/cashier</span>, <span class="code">/billing</span>, receipts</td></tr>
<tr><td>Accountant</td><td><span class="code">/portal/accountant</span>, <span class="code">/financials</span>, expenses</td></tr>
</table>
<h2>5. Patients — register and open chart</h2><ol>
<li><strong>Patients</strong> → register or search.</li>
<li>Open <strong>Clinical chart</strong> for allergies, vitals, consultations, tests, prescriptions, insurance.</li>
</ol>
<h2>6. Visits &amp; OPD</h2><p>Use <strong>Visits</strong> and <strong>OPD queue</strong> for same-day attendance. Nursing or front desk may record <strong>vitals</strong> before the clinician.</p>
<div class="page-break"></div><h2>7. Consultations</h2><ol>
<li>Create or continue a consultation; add lab/radiology catalog lines; mark <em>external</em> when care is outside the hospital.</li>
<li>Complete the consultation; your site may generate a <strong>payment code</strong> for the cashier.</li>
</ol>
<h2>8. Cashier &amp; payment codes</h2><ol>
<li>Load the <strong>payment code</strong> at the cashier workspace.</li>
<li><strong>Partial payment</strong> is supported — the same code can be reused for remaining lines.</li>
<li>Issue receipts; insurance <strong>co-pay</strong> follows the primary policy on the chart.</li>
</ol>
<h2>9. Laboratory &amp; radiology</h2><ol>
<li>Verify the payment code from the department portal, then enter structured results and <strong>finalize</strong>.</li>
<li>Finalization may notify the patient portal and referring clinician.</li>
</ol>
<h2>10. Pharmacy</h2><p>Dispense prescriptions; link inventory when stock module is enabled.</p>
<div class="page-break"></div><h2>11. Insurance on the chart</h2><p>Set primary insurer and <strong>insurer share %</strong> on the patient chart and insurance hub.</p>
<h2>12. External documents</h2><p>Upload outside lab/imaging/pharmacy files so clinicians can review them on the chart.</p>
<h2>13. Inventory</h2><p>Receive stock, adjust quantities, and monitor low-stock alerts from the inventory module.</p>
<h2>14. Where to get more help</h2><ul>
<li><a href="/docs/product-document">Product Document</a> — comprehensive product overview (premium edition).</li>
<li><a href="/docs/comprehensive-user-guide">Comprehensive User Guide</a> — full staff guide by module and workflow.</li>
<li><a href="/financials/platform-overview">Help &amp; database setup</a> — migrations and workflow summary.</li>
<li><a href="/docs/users-manual">Users Manual</a>, <a href="/docs/workflow-document">Workflow document</a>, <a href="/docs/architecture-document">Architecture design</a>.</li>
<li><a href="/workflow-guides">Workflow guides</a> (interactive, by role).</li>
<li><a href="/user-manual">User manual</a> (in-app tutorials).</li>
</ul>
<p class="small"><strong>Disclaimer:</strong> Screen names and steps may vary by deployment.</p>`;
 return wrapDoc('HMS User Guide', body);
}

function buildUsersManualHtml() {
 const g = esc(generatedStamp());
 const body = `
<h1>Hospital Management System</h1>
<p class="meta"><strong>Users Manual</strong> — Reference edition<br>Version 1.0 · Generated ${g} · Node HMS</p>
<p>Reference for terminology, modules, and troubleshooting. For step-by-step tasks use the <a href="/docs/user-guide">User Guide</a>.</p>
<h2>1. System requirements</h2><ul>
<li><strong>Client:</strong> Modern browser.</li>
<li><strong>Server:</strong> Node.js 18+ and MySQL/MariaDB for this edition; PHP stack optional for legacy PDF scripts.</li>
</ul>
<h2>2. Terminology</h2><table>
<tr><th>Term</th><th>Meaning</th></tr>
<tr><td>Facility / site</td><td>Hospital unit; data scoped to active facility.</td></tr>
<tr><td>OPD</td><td>Outpatient — same-day visits and queue.</td></tr>
<tr><td>Payment ticket / code</td><td>Cashier reference; supports partial payment.</td></tr>
<tr><td>ACL / permission</td><td>Fine-grained access beyond base role.</td></tr>
</table>
<div class="page-break"></div><h2>3. Main areas (Node routes)</h2>
<table><tr><th>Area</th><th>Route</th><th>Purpose</th></tr>
<tr><td>Patients</td><td><span class="code">/patients</span></td><td>Register and search patients.</td></tr>
<tr><td>Billing</td><td><span class="code">/billing</span></td><td>Cashier, charges, receipts.</td></tr>
<tr><td>Financials</td><td><span class="code">/financials</span></td><td>GL, statements, tax, treasury.</td></tr>
<tr><td>Expenses</td><td><span class="code">/financials/expenses</span></td><td>Operating expense register.</td></tr>
<tr><td>Portals</td><td><span class="code">/portal/*</span></td><td>Role landing pages.</td></tr>
<tr><td>Help</td><td><span class="code">/financials/platform-overview</span></td><td>Migrations and setup.</td></tr>
</table>
<h2>4. Roles and access</h2><p>Sidebar and actions depend on role and ACL. Contact your administrator if a function is missing.</p>
<h2>5. Database setup</h2><p>Apply SQL migrations in order — see <a href="/financials/platform-overview">Help &amp; setup</a>.</p>
<h2>6. Troubleshooting</h2><table>
<tr><th>Issue</th><th>Suggestions</th></tr>
<tr><td>Menu missing</td><td>Check role/ACL; confirm migration for that module.</td></tr>
<tr><td>PDF download fails</td><td>Ensure PHP + <span class="code">composer install</span> in <span class="code">htdocs_php/htdocs</span> for Dompdf, or use browser Print on the HTML guide.</td></tr>
<tr><td>Wrong facility data</td><td>Verify facility context in session.</td></tr>
</table>
<h2>7. Related documents</h2><ul>
<li><a href="/docs/user-guide">User Guide</a></li>
<li><a href="/docs/workflow-document">Workflow document</a></li>
<li><a href="/docs/architecture-document">Architecture design</a></li>
<li><a href="/docs/demo-presentation.html">Demo presentation</a></li>
</ul>
<p class="small"><strong>Disclaimer:</strong> Local SOPs and legal requirements take precedence.</p>`;
 return wrapDoc('HMS Users Manual', body);
}

/** Short HTML summaries when full PHP bodies are not inlined. */
function buildArchitectureHtml() {
 const g = esc(generatedStamp());
 const body = `
<h1>Hospital Management System (HMS)</h1>
<p class="meta"><strong>Architecture Design Document</strong><br>Version 1.0 · Generated ${g} · Node ${esc(process.version)}</p>
<p>HMS is a <strong>hospital web application</strong> with a <strong>Node.js</strong> edition (this deployment) and a legacy <strong>PHP</strong> tree under <span class="code">htdocs_php/htdocs/</span>. Data lives in <strong>MySQL/MariaDB</strong>; schema evolves through ordered SQL migrations.</p>
<div class="box"><strong>Layers:</strong> Express routes + EJS views; domain helpers in <span class="code">lib/</span>; MySQL via <span class="code">mysql2</span>; optional PHP co-deploy for Dompdf and legacy screens.</div>
<h2>Major domains</h2>
<ul>
<li>Patients, OPD, consultations, vitals, lab/radiology workflows</li>
<li>Billing, cashier payment codes, receipts, insurance</li>
<li>Financial GL (OHADA), expenses, tax, treasury</li>
<li>Inventory, portals, ACL, audit</li>
</ul>
<p class="small">For the full architecture PDF (all sections), use <strong>Download PDF</strong> when Dompdf is available, or open the PHP include <span class="code">includes/architecture-document-pdf.php</span>.</p>`;
 return wrapDoc('HMS Architecture Design', body);
}

function buildWorkflowHtml() {
 const g = esc(generatedStamp());
 const body = `
<h1>Hospital Management System (HMS)</h1>
<p class="meta"><strong>Workflow Document</strong><br>Version 1.0 · Generated ${g}</p>
<div class="flow">Registration → OPD / vitals → Consultation → Cashier (payment code)
→ Lab / Radiology (verify code → result → finalize) → Pharmacy → Chart / portal</div>
<h2>Summary</h2>
<p>Patients register, attend OPD, are seen in consultation, pay at cashier (full or partial), receive diagnostics after code verification, collect medicines at pharmacy, and view results on the chart or patient portal when enabled.</p>
<p>See <a href="/workflow-guides">Workflow guides</a> for role-specific steps and <a href="/financials/platform-overview">Help &amp; setup</a> for migration order.</p>
<p class="small">For the complete workflow PDF, use <strong>Download PDF</strong> or the PHP workflow document include.</p>`;
 return wrapDoc('HMS Workflow Document', body);
}

const BUILDERS = {
 'user-guide': buildUserGuideHtml,
 'users-manual': buildUsersManualHtml,
 'architecture-document': buildArchitectureHtml,
 workflow: buildWorkflowHtml,
 architecture: buildArchitectureHtml,
 'workflow-document': buildWorkflowHtml,
 'product-document': buildProductDocumentHtml,
 'comprehensive-user-guide': buildComprehensiveUserGuideHtml,
 'opd-users-manual': buildOpdUsersManualHtml,
 'ipd-users-manual': buildIpdUsersManualHtml,
 'emergency-users-manual': buildEmergencyUsersManualHtml,
 'maternity-users-manual': buildMaternityUsersManualHtml,
 'cashier-users-manual': buildCashierUsersManualHtml,
 'lab-users-manual': buildLabUsersManualHtml,
 'radiology-users-manual': buildRadiologyUsersManualHtml,
 'pharmacy-users-manual': buildPharmacyUsersManualHtml,
 'nursing-users-manual': buildNursingUsersManualHtml,
 'doctor-users-manual': buildDoctorUsersManualHtml,
 'director-users-manual': buildDirectorUsersManualHtml,
};

function buildDocHtml(docKey) {
 const fn = BUILDERS[docKey];
 return fn ? fn() : null;
}

module.exports = {
 buildDocHtml,
 BUILDERS,
 buildProductDocumentHtml,
 buildComprehensiveUserGuideHtml,
 buildOpdUsersManualHtml,
 buildIpdUsersManualHtml,
 buildEmergencyUsersManualHtml,
 buildMaternityUsersManualHtml,
 buildCashierUsersManualHtml,
 buildLabUsersManualHtml,
 buildRadiologyUsersManualHtml,
 buildPharmacyUsersManualHtml,
 buildNursingUsersManualHtml,
 buildDoctorUsersManualHtml,
 buildDirectorUsersManualHtml,
};
