'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand } = require('./hmsPremiumDocsTheme');

function buildProductDocumentHtml() {
  const b = brand;
  const body = `
${coverPage({
  docLabel: 'Product Document',
  title: `${b.name} Integrated Hospital Management System`,
  subtitle: 'Comprehensive product overview — modules, architecture, workflows, and enterprise capabilities for modern healthcare organisations.',
  badge: 'Product Edition',
  variant: 'product',
})}
<div class="doc-body">

<h2 class="section" id="executive-summary">Executive Summary</h2>
<p><strong>${esc(b.productName)}</strong> is an enterprise-grade Hospital Management System (HMS) designed for acute-care facilities, outpatient clinics, and multi-department hospitals. The platform unifies clinical care, revenue cycle management, diagnostics, pharmacy, human resources, and financial accounting in a single web application with role-based portals and fine-grained access control.</p>
<div class="kpi-row">
  <div class="kpi"><strong>40+</strong><span>Functional modules</span></div>
  <div class="kpi"><strong>9</strong><span>Staff portals</span></div>
  <div class="kpi"><strong>3</strong><span>Core clinical pathways</span></div>
</div>
<p>${esc(b.name)} delivers measurable value through reduced duplicate data entry, enforced payment and clinical business rules, real-time OPD queue management, integrated diagnostics workflows, OHADA-aligned financial reporting, and configurable access for every staff role from front desk to hospital director.</p>
<div class="tip"><strong>Tagline:</strong> ${esc(b.tagline)} — ${esc(b.name)} combines clinical precision with operational intelligence.</div>

${section('vision', '1. Product Vision & Value Proposition', `
<h3>Vision</h3>
<p>To provide hospitals with a unified digital platform where every patient journey — from registration to discharge — is traceable, billable, and clinically safe, while giving leadership live visibility into operations and finances.</p>
<h3>Core value pillars</h3>
<table class="data">
<tr><th>Pillar</th><th>Capability</th><th>Business outcome</th></tr>
<tr><td>Clinical excellence</td><td>OPD queue, consultations, vitals, IPD bed board, emergency waiver, maternity ANC</td><td>Faster throughput, fewer missed steps, complete patient chart</td></tr>
<tr><td>Revenue integrity</td><td>Cashier payment codes, partial payments, insurance co-pay, credit tabs, wallets</td><td>Charges captured before service delivery; reduced revenue leakage</td></tr>
<tr><td>Operational control</td><td>ACL permissions, navigation studio, workflow guides, management reports</td><td>Right staff see right functions; audit-ready access model</td></tr>
<tr><td>Financial compliance</td><td>General ledger, trial balance, tax hub, treasury, year-end, OHADA chart</td><td>Accountant-ready books aligned with regional standards</td></tr>
<tr><td>Staff empowerment</td><td>Department portals, HR self-service, duty rosters, bilingual UI (EN/FR)</td><td>Higher adoption; reduced training burden</td></tr>
</table>
`)}

${section('architecture', '2. Platform Architecture', `
<p>${esc(b.productName)} is built on a modern three-tier architecture optimised for hospital deployments on Windows/Linux servers with MySQL/MariaDB.</p>
<table class="data">
<tr><th>Layer</th><th>Technology</th><th>Responsibility</th></tr>
<tr><td>Presentation</td><td>Express.js · EJS views · React islands (<code>frontend/</code>)</td><td>Staff UI, portals, printable documents, waiting-screen TV</td></tr>
<tr><td>Application</td><td>Node.js 18+ · domain libraries in <code>lib/</code></td><td>Business rules, ACL, billing, clinical gates, workflows</td></tr>
<tr><td>Data</td><td>MySQL / MariaDB</td><td>Patients, visits, orders, GL, inventory, ACL catalogue</td></tr>
</table>
<h3>Design principles</h3>
<ul>
<li><strong>Permission-first security</strong> — Every menu item, tile, and route is governed by ACL permissions, not hard-coded role checks alone.</li>
<li><strong>Business rule enforcement</strong> — Payment validity, consultation gates, lab/pharmacy payment verification, and IPD discharge sequencing are enforced server-side.</li>
<li><strong>Self-healing schema</strong> — Database migrations run on application boot (<code>ensureAclSchema</code>, extended schema helpers).</li>
<li><strong>Multi-facility ready</strong> — Sessions scoped to facility context for multi-site deployments.</li>
<li><strong>Bilingual</strong> — English and French via i18next across legacy views and React pages.</li>
</ul>
<div class="flow">Browser → Express routes → lib/* domain logic → MySQL
                ↓
         ACL layout cache · Portal tiles · Top navigation</div>
`)}

${section('clinical', '3. Clinical Modules', `
<table class="data">
<tr><th>Module</th><th>Primary routes</th><th>Description</th></tr>
<tr><td>Patient directory</td><td><code>/patients</code></td><td>Registration, demographics, insurance, portal access, chart entry point</td></tr>
<tr><td>Patient chart</td><td>Chart views</td><td>Allergies, vitals history, consultations, orders, documents, external uploads</td></tr>
<tr><td>OPD queue</td><td><code>/opd-queue</code></td><td>Same-day visit registry, triage, queue status, consultation room assignment, carry-forward</td></tr>
<tr><td>Consultations</td><td><code>/consultation-new</code></td><td>Clinical notes, diagnoses, lab/radiology/Rx orders, follow-up eligibility</td></tr>
<tr><td>Nursing & vitals</td><td><code>/nursing/vitals</code></td><td>BP, temperature, weight, SpO₂, pulse; triage progression</td></tr>
<tr><td>Consultation rooms</td><td><code>/admin/consultation-rooms</code></td><td>Physical room catalogue, multi-doctor linkage, OPD card display</td></tr>
<tr><td>Hospitalization (IPD)</td><td><code>/ipd</code>, <code>/wards</code></td><td>Admissions, bed board, ward rounds, medication chart, census, death registry</td></tr>
<tr><td>Emergency / A&E</td><td><code>/emergency</code></td><td>Rapid registration with prepayment waiver, credit-tab billing</td></tr>
<tr><td>Maternity / ANC</td><td><code>/maternity</code></td><td>Antenatal registry, obstetric charts, labour documentation</td></tr>
<tr><td>Prescriptions</td><td><code>/prescriptions</code></td><td>Standalone and consult-linked Rx; QR verification for pharmacy</td></tr>
<tr><td>Appointments</td><td><code>/appointments</code></td><td>Scheduling, slot configuration, online booking portal</td></tr>
<tr><td>Waiting screen</td><td><code>/hms/waiting-screen</code></td><td>Lobby TV display of queue numbers and rooms</td></tr>
</table>
<h3>OPD visit lifecycle</h3>
<div class="flow">Registered → Triage → Waiting Doctor → In Consultation → Orders Pending → Billing → Completed</div>
<p>Each status transition is permission-gated and visible on the OPD queue dashboard and HMS Hub KPI widgets.</p>
`)}

${section('diagnostics', '4. Diagnostics & Pharmacy', `
<table class="data">
<tr><th>Module</th><th>Routes</th><th>Key features</th></tr>
<tr><td>Laboratory (LIMS)</td><td><code>/lims</code>, <code>/laboratory</code></td><td>Order worklist, structured test templates, result entry, finalisation, IPD/ER alerts</td></tr>
<tr><td>Radiology</td><td><code>/radiology</code></td><td>Imaging worklist, report upload, template-based reporting, order alerts</td></tr>
<tr><td>Pharmacy</td><td><code>/pharmacy</code></td><td>Dispensing queue, inventory linkage, purchase orders, IPD/ER medication alerts</td></tr>
<tr><td>Service catalog</td><td><code>/catalog</code></td><td>Consultation, laboratory, radiology, and pharmacy pricing</td></tr>
</table>
<div class="warn"><strong>Business rule:</strong> Unpaid diagnostic and pharmacy orders are blocked at verification/dispensing until the cashier confirms payment against the visit payment code.</div>
`)}

${section('operations', '5. Operations & Revenue', `
<table class="data">
<tr><th>Module</th><th>Routes</th><th>Description</th></tr>
<tr><td>Cashier</td><td><code>/cashier</code></td><td>Payment ticket issuance, alphanumeric payment codes, partial payment, receipts</td></tr>
<tr><td>Billing workspace</td><td><code>/billing</code></td><td>Charge review, transactions, receipts & invoices</td></tr>
<tr><td>Patient wallets</td><td><code>/wallet</code></td><td>Pre-paid balances deducted at point of service</td></tr>
<tr><td>Insurance</td><td><code>/insurance</code></td><td>Carrier management, co-pay rules, claims processing</td></tr>
<tr><td>Credit & receivables</td><td><code>/credit-receivables</code></td><td>Outstanding AR tracking and settlement</td></tr>
<tr><td>Inventory</td><td><code>/inventory</code></td><td>Stock levels, movements, low-stock alerts</td></tr>
<tr><td>Procurement</td><td><code>/procurement</code></td><td>Vendor RFQ, purchase orders, goods receipt</td></tr>
<tr><td>Asset management</td><td><code>/assets</code></td><td>Hospital equipment register and rentals</td></tr>
<tr><td>Payment validity</td><td><code>/payment-validity</code></td><td>OPD consultation slip window, max uses, follow-up rules</td></tr>
</table>
<h3>Payment code format</h3>
<p>Cashier tickets use secure alphanumeric codes (e.g. <code>CON-4829-K7HM3R9Q</code>) with service-specific prefixes: CON (consultation), LAB, RAD, PHA, HOS (hospitalization), EMG (emergency), and others.</p>
`)}

${section('finance', '6. Finance & Accounting', `
<p>The accountant portal provides a dedicated financial shell with its own top navigation for billing, GL, reporting, and configuration.</p>
<table class="data">
<tr><th>Area</th><th>Routes</th><th>Capabilities</th></tr>
<tr><td>Chart of accounts</td><td><code>/financials/accounts</code></td><td>OHADA-aligned account structure</td></tr>
<tr><td>General ledger</td><td><code>/financials/general-ledger</code></td><td>Journal entries, account movements</td></tr>
<tr><td>Trial balance</td><td><code>/financials/trial-balance</code></td><td>Period-end balancing</td></tr>
<tr><td>Financial statements</td><td><code>/financials/balance-sheet</code>, P&amp;L, cash flow</td><td>Management and statutory reporting</td></tr>
<tr><td>Tax hub</td><td><code>/tax</code></td><td>Tax worksheets, CNPS, compliance tools</td></tr>
<tr><td>Treasury & banking</td><td><code>/financials/treasury</code></td><td>Bank accounts, reconciliation</td></tr>
<tr><td>Expenses</td><td><code>/financials/expenses</code></td><td>Operating expense register</td></tr>
<tr><td>Payables</td><td><code>/financials/accounts-payable</code></td><td>Vendor liabilities</td></tr>
<tr><td>Year-end</td><td><code>/financials/year-end</code></td><td>Closing procedures</td></tr>
<tr><td>Management reports</td><td><code>/management-reports</code></td><td>Live director dashboards by frequency</td></tr>
</table>
`)}

${section('hr', '7. Human Resources', `
<table class="data">
<tr><th>Module</th><th>Routes</th><th>Description</th></tr>
<tr><td>Employees</td><td><code>/employees</code></td><td>Staff records, departments, specialisations, doctor profiles</td></tr>
<tr><td>Payroll & HR</td><td><code>/payroll</code></td><td>Payroll runs, payslips, statutory deductions</td></tr>
<tr><td>Leave management</td><td><code>/hr/leave-requests</code></td><td>Approval workflow, balances, holidays</td></tr>
<tr><td>Attendance</td><td><code>/hr/attendance</code></td><td>Time and attendance tracking</td></tr>
<tr><td>Duty rosters</td><td><code>/doctor-roster</code>, <code>/nurse-roster</code></td><td>Clinical staff scheduling</td></tr>
<tr><td>HR self-service</td><td><code>/hr/my-payslips</code>, etc.</td><td>Leave requests, payslips, attendance — all staff portals</td></tr>
</table>
`)}

${section('admin', '8. Administration & Configuration', `
<table class="data">
<tr><th>Feature</th><th>Route</th><th>Audience</th></tr>
<tr><td>Access control</td><td><code>/hms-admin/access</code></td><td>Roles, permissions, portal tiles, UI visibility, workflow designer</td></tr>
<tr><td>Departments & specialisations</td><td><code>/departments</code></td><td>Clinical department and specialty catalogues</td></tr>
<tr><td>Room configuration</td><td><code>/admin/consultation-rooms</code></td><td>OPD consultation spaces and doctor assignments</td></tr>
<tr><td>Solution subscriptions</td><td><code>/hms-admin/subscriptions</code></td><td>License activation and module entitlements</td></tr>
<tr><td>Super admin console</td><td><code>/super-admin</code></td><td>Deployment profiles, module toggles (role 99)</td></tr>
<tr><td>HMS configuration</td><td><code>/hms/config</code></td><td>Hospital-wide settings</td></tr>
<tr><td>Commission rules</td><td><code>/hms/commission</code></td><td>Staff commission on services</td></tr>
<tr><td>Workflow guides</td><td><code>/workflow-guides</code></td><td>Interactive role-scoped process maps</td></tr>
<tr><td>User manual</td><td><code>/user-manual</code></td><td>In-app staff tutorials</td></tr>
</table>
`)}

${section('portals', '9. Role-Based Portals', `
<p>Each staff category lands on a tailored portal with dashboard tiles linking to their most frequent tasks. Home URLs are resolved from ACL role-portal mappings.</p>
<table class="data">
<tr><th>Portal</th><th>URL</th><th>Primary users</th></tr>
<tr><td>Front Desk</td><td><code>/portal/front-desk</code></td><td>Registration, OPD queue, appointments, triage routing</td></tr>
<tr><td>Doctor</td><td><code>/portal/doctor</code></td><td>Consultations, OPD queue, prescriptions, lab orders</td></tr>
<tr><td>Nurse</td><td><code>/portal/nurse</code></td><td>Vitals, OPD triage, ward care, IPD medication</td></tr>
<tr><td>Cashier</td><td><code>/portal/cashier</code></td><td>Payments, receipts, wallet top-ups</td></tr>
<tr><td>Laboratory</td><td><code>/portal/lab</code></td><td>Test verification, result entry</td></tr>
<tr><td>Pharmacy</td><td><code>/portal/pharmacy</code></td><td>Dispensing, stock, alerts</td></tr>
<tr><td>Radiology</td><td><code>/portal/radiology</code></td><td>Imaging worklist, reporting</td></tr>
<tr><td>Accountant</td><td><code>/financials</code></td><td>Full financial module shell</td></tr>
<tr><td>Hospital Director</td><td><code>/portal/hub/director</code></td><td>Executive dashboards and reports</td></tr>
<tr><td>Patient portal</td><td><code>/portal/login</code></td><td>Self-service booking and results (public sign-in)</td></tr>
</table>
<p>Top navigation provides cross-module access: <span class="pill">Clinical</span> <span class="pill">Operations</span> <span class="pill">HR</span> <span class="pill">Settings</span></p>
`)}

${section('workflows', '10. Clinical Workflows at a Glance', `
<h3>Outpatient (OPD) — 9 stations</h3>
<div class="flow">Cashier (consult fee) → Front Desk (OPD queue) → Nurse (triage/vitals)
→ Doctor (consultation & orders) → Cashier (order payment) → Lab → Radiology
→ Pharmacy → Doctor (review & complete)</div>
<h3>Inpatient (IPD) — 10 stations</h3>
<div class="flow">Doctor (admit order) → Cashier (deposit) → ADT (bed assign) → Nurse (baseline)
→ Doctor (rounds) → Lab/Radiology → Pharmacy → Doctor (clinical discharge)
→ Cashier (financial discharge) → ADT (bed release)</div>
<div class="note"><strong>Dual discharge rule:</strong> A patient cannot leave until both <em>Clinical Discharge</em> (doctor) and <em>Financial Discharge</em> (cashier) are recorded.</div>
<h3>Emergency / A&E — 8 stations</h3>
<div class="flow">Front Desk (Emergency/Waiver) → Auto-route → Nurse (vitals) + Doctor (treatment)
→ Lab/Radiology → Pharmacy → Doctor (admit or discharge) → Cashier (retrospective bill)</div>
<p>Interactive step-by-step guides with role filtering are available at <code>/workflow-guides</code>.</p>
`)}

${section('security', '11. Security & Compliance', `
<ul>
<li><strong>Session authentication</strong> — Staff login with bcrypt password hashing; session-bound facility context.</li>
<li><strong>ACL permission model</strong> — 100+ granular permissions across clinical, billing, inventory, HR, and admin domains.</li>
<li><strong>Navigation grants</strong> — Optional per-role menu bundles for simplified access control.</li>
<li><strong>Business rule gates</strong> — Server-side enforcement of payment validity, consultation requirements, and diagnostic access.</li>
<li><strong>Audit readiness</strong> — Sensitive actions tied to staff identity; flash messages and redirects on denial.</li>
<li><strong>Super Admin isolation</strong> — Product configuration permissions reserved for role 99 only.</li>
<li><strong>Bilingual audit trail</strong> — User-facing messages available in English and French.</li>
</ul>
`)}

${section('technology', '12. Technology & Deployment', `
<table class="data">
<tr><th>Component</th><th>Requirement</th></tr>
<tr><td>Runtime</td><td>Node.js 18 or later</td></tr>
<tr><td>Database</td><td>MySQL 5.7+ or MariaDB 10.4+</td></tr>
<tr><td>Web server</td><td>Express (built-in) or Passenger/nginx reverse proxy</td></tr>
<tr><td>Client</td><td>Modern evergreen browser (Chrome, Edge, Firefox)</td></tr>
<tr><td>Optional</td><td>PHP + Dompdf for server-side PDF generation of documentation</td></tr>
</table>
<p>Environment variables configure branding (<code>HMS_BRAND_NAME</code>, <code>HMS_FACILITY_NAME</code>, logo paths). Schema migrations execute automatically on application start.</p>
`)}

${section('documentation', '13. Documentation Suite', `
<table class="data">
<tr><th>Document</th><th>Access</th><th>Audience</th></tr>
<tr><td>Product Document (this edition)</td><td><code>/docs/product-document</code></td><td>Leadership, implementers, sales</td></tr>
<tr><td>Comprehensive User Guide</td><td><code>/docs/comprehensive-user-guide</code></td><td>All hospital staff</td></tr>
<tr><td>Interactive User Manual</td><td><code>/user-manual</code></td><td>Role-based tutorials in-app</td></tr>
<tr><td>Workflow Guides</td><td><code>/workflow-guides</code></td><td>Process maps by role</td></tr>
<tr><td>Architecture & workflow PDFs</td><td><code>/docs/architecture-document</code></td><td>Technical teams</td></tr>
<tr><td>Business rules reference</td><td><code>docs/BUSINESS-RULES.md</code></td><td>Administrators, developers</td></tr>
</table>
`)}

<div class="footer-note">
<strong>${esc(b.name)}</strong> · ${esc(b.productName)} · Product Document v2.0<br>
${esc(b.copyrightLine)} · ${esc(b.websiteUrl)}<br>
This document describes product capabilities as implemented in the Node.js HMS edition. Local standard operating procedures and regulatory requirements take precedence.
</div>
</div>`;

  return wrapPremiumDoc({
    title: `${b.name} — Product Document`,
    variant: 'product',
    bodyHtml: body,
  });
}

module.exports = { buildProductDocumentHtml };
