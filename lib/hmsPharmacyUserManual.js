'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const PHARMACY_EXTRA_CSS = `
:root[data-doc="pharmacy-manual"] {
  --accent: #10b981;
  --accent-light: #d1fae5;
  --pha-emerald: #10b981;
  --pha-emerald-dark: #059669;
  --pha-violet: #8b5cf6;
  --pha-blue: #1a6bd8;
  --pha-amber: #f59e0b;
  --pha-rose: #e11d48;
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
  border-radius: 50%; background: var(--pha-emerald-dark); color: white; font-size: 6.5pt; margin-bottom: 1mm;
}
.status-pill {
  display: inline-block; font-size: 7pt; font-weight: 700; padding: 0.5mm 2mm;
  border-radius: 99px; text-transform: uppercase;
}
.status-pill.pending { background: #fef3c7; color: #92400e; }
.status-pill.paid { background: #dbeafe; color: #1e40af; }
.status-pill.dispensed { background: #d1fae5; color: #065f46; }
.status-pill.offcat { background: #ede9fe; color: #5b21b6; }
.screen {
  border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  margin: 4mm 0 5mm; break-inside: avoid; box-shadow: 0 1px 4px rgba(5,150,105,0.08);
}
.screen-bar {
  background: linear-gradient(90deg, #059669, #1a6bd8);
  color: rgba(255,255,255,0.92); padding: 2mm 3mm; font-size: 8pt;
  display: flex; align-items: center; gap: 2mm;
}
.screen-bar .dot { width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #86efac; }
.screen-bar .dot:nth-child(2) { background: #fcd34d; }
.screen-bar .dot:nth-child(3) { background: #c4b5fd; }
.screen-body { background: #ecfdf5; padding: 4mm; }
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
  width: 5mm; height: 5mm; border-radius: 50%; background: var(--pha-emerald);
  color: white; font-size: 7pt; font-weight: 700; text-align: center; line-height: 5mm;
}
.perm-pill {
  display: inline-block; font-size: 7pt; font-family: ui-monospace, monospace;
  background: #f1f5f9; padding: 0.5mm 2mm; border-radius: 2px; margin: 0.5mm;
}
.hero-img { width: 100%; max-height: 45mm; object-fit: cover; border-radius: 4px; margin: 3mm 0; }
.code-badge {
  display: inline-block; font-family: ui-monospace, monospace; font-size: 8pt; font-weight: 800;
  padding: 1mm 2.5mm; border-radius: 3px; border: 2px solid #6ee7b7; background: #d1fae5; color: #065f46;
}
.tab-strip { display: flex; flex-wrap: wrap; gap: 2mm; margin: 4mm 0; }
.tab-chip {
  font-size: 7.5pt; font-weight: 700; padding: 1.5mm 3mm; border-radius: 4px;
  border: 1px solid rgba(0,0,0,0.1); break-inside: avoid;
}
.tab-chip.overview { background: #ecfdf5; color: #065f46; }
.tab-chip.products { background: #dbeafe; color: #1e40af; }
.tab-chip.dispense { background: #fef3c7; color: #92400e; }
.tab-chip.rx { background: #ede9fe; color: #5b21b6; }
`;

function buildPharmacyUsersManualHtml() {
  const b = brand;
  const body = `
<style>${PREMIUM_CSS}${PHARMACY_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'Pharmacy User Manual',
  title: 'Pharmacy & Dispensing',
  subtitle: 'Complete staff guide — validate PHA codes, dispense medications, inventory, off-catalog pricing, nursing requests, purchase orders, intelligence reports, and cashier integration.',
  badge: 'Premium · Professional Edition',
  variant: 'pharmacy-manual',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)} Pharmacy User Manual</strong>. The Pharmacy module manages the full medication pathway — from doctor prescriptions and cashier payment through validation, stock checks, dispensing, and inventory intelligence.</p>
<div class="tip"><strong>Pharmacy hub:</strong> One workspace at <code>/pharmacy</code> with Dashboard, Products, Dispensing, and Prescriptions tabs — plus validate-and-dispense at <code>/pharmacy/validate</code>.</div>

<div class="kpi-row">
  <div class="kpi"><strong>PHA</strong><span>Service codes</span></div>
  <div class="kpi"><strong>4</strong><span>Hub tabs</span></div>
  <div class="kpi"><strong>8+</strong><span>Intelligence reports</span></div>
</div>

<img class="hero-img" src="public/call-queue/photos/pharmacy.jpg" alt="Pharmacy dispensing" />

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#overview">Pharmacy overview &amp; roles</a></li>
<li><a href="#workflow">End-to-end dispensing workflow</a></li>
<li><a href="#portal">Pharmacy portal</a></li>
<li><a href="#hub">Pharmacy hub tabs</a></li>
<li><a href="#validate">Validate PHA code &amp; dispense</a></li>
<li><a href="#alerts">Order alerts</a></li>
<li><a href="#offcatalog">Off-catalog &amp; custom Rx</a></li>
<li><a href="#external">External medications</a></li>
<li><a href="#products">Products &amp; inventory</a></li>
<li><a href="#dispensing">Dispensing queue &amp; log</a></li>
<li><a href="#prescriptions">Prescription registry</a></li>
<li><a href="#nursing">Nursing supply requests</a></li>
<li><a href="#purchase">Purchase orders</a></li>
<li><a href="#reports">Intelligence reports</a></li>
<li><a href="#expiry">Expiry management</a></li>
<li><a href="#cashier">Cashier &amp; wallet integration</a></li>
<li><a href="#catalog">Catalog &amp; configuration</a></li>
<li><a href="#screens">Screen reference</a></li>
<li><a href="#troubleshooting">Troubleshooting</a></li>
<li><a href="#glossary">Glossary</a></li>
</ol>
</div>

${section('overview', '1. Pharmacy Overview & Roles', `
<p>The <strong>Pharmacy module</strong> connects clinical prescriptions to verified, billable, and dispensed medications across OPD, IPD, Emergency, and ward supply contexts.</p>

<div class="role-grid">
  <div class="role-card" style="background:#d1fae5;border-color:#6ee7b7">
    <div class="icon">💊</div>
    <strong>Pharmacist</strong>
    <span>Validate PHA codes, check stock, dispense line-by-line, counsel patients</span>
  </div>
  <div class="role-card" style="background:#dbeafe;border-color:#93c5fd">
    <div class="icon">👨‍⚕️</div>
    <strong>Doctor</strong>
    <span>Prescribes medications from consultation, IPD, or ER chart</span>
  </div>
  <div class="role-card" style="background:#fef3c7;border-color:#fcd34d">
    <div class="icon">💳</div>
    <strong>Cashier</strong>
    <span>Collects payment; issues PHA service codes on order slips</span>
  </div>
  <div class="role-card" style="background:#ede9fe;border-color:#c4b5fd">
    <div class="icon">📦</div>
    <strong>Inventory / Procurement</strong>
    <span>Stock receive, purchase orders, reorder levels, vendor management</span>
  </div>
  <div class="role-card" style="background:#cffafe;border-color:#67e8f9">
    <div class="icon">🏥</div>
    <strong>Nurse</strong>
    <span>Ward supply requests; receives dispensed items from pharmacy</span>
  </div>
  <div class="role-card" style="background:#fce7f3;border-color:#f9a8d4">
    <div class="icon">👤</div>
    <strong>Patient</strong>
    <span>Pays at cashier, presents PHA code at pharmacy window, collects medicines</span>
  </div>
</div>

<h3>Key URLs</h3>
<table class="data">
<tr><th>Screen</th><th>Path</th></tr>
<tr><td>Pharmacy Portal</td><td><code>/portal/pharmacy</code></td></tr>
<tr><td>Pharmacy Hub</td><td><code>/pharmacy</code></td></tr>
<tr><td>Validate &amp; dispense</td><td><code>/pharmacy/validate</code></td></tr>
<tr><td>Prescription Registry</td><td><code>/prescriptions</code></td></tr>
<tr><td>Order alerts</td><td><code>/pharmacy/order-alerts</code></td></tr>
<tr><td>Nursing requests</td><td><code>/pharmacy/nursing-requests</code></td></tr>
<tr><td>Purchase orders</td><td><code>/pharmacy/purchase-orders</code></td></tr>
<tr><td>Intelligence reports</td><td><code>/pharmacy/reporting</code></td></tr>
<tr><td>Expiry report</td><td><code>/pharmacy/reporting/expiry</code></td></tr>
<tr><td>Inventory (central)</td><td><code>/inventory</code></td></tr>
<tr><td>Service catalog</td><td><code>/catalog</code></td></tr>
</table>

<div class="note"><strong>Permissions:</strong> <span class="perm-pill">pharmacy.read</span> view stock &amp; queue · <span class="perm-pill">pharmacy.write</span> dispense &amp; adjust stock · <span class="perm-pill">prescription.read/write</span> prescription registry</div>
`)}

${section('workflow', '2. End-to-End Dispensing Workflow', `
<div class="flow">Doctor prescribes → Patient pays at Cashier (PHA code issued)
→ Pharmacy validates code → Stock check → Dispense line-by-line
→ Patient receives medicines → Chart updated</div>

<div class="wf-strip">
  <div class="wf-chip"><span class="n">1</span><br/>Doctor Rx</div>
  <div class="wf-chip"><span class="n">2</span><br/>Cashier payment</div>
  <div class="wf-chip"><span class="n">3</span><br/>Validate PHA</div>
  <div class="wf-chip"><span class="n">4</span><br/>Stock check</div>
  <div class="wf-chip"><span class="n">5</span><br/>Dispense</div>
  <div class="wf-chip"><span class="n">6</span><br/>Hand to patient</div>
</div>

<h3>Standard OPD pathway</h3>
<ol class="step-row">
<li>Doctor adds medication(s) during consultation — dosage, frequency, duration.</li>
<li>Patient pays at Cashier — receives slip with <span class="code-badge">PHA-…</span> service code.</li>
<li>Patient presents PHA code at pharmacy window.</li>
<li>Pharmacist validates code — reviews each medication line.</li>
<li>Check stock on hand; warn if expired or insufficient quantity.</li>
<li>Dispense one line at a time — stock deducted automatically.</li>
<li>Partial Rx: remaining lines stay pending until next visit.</li>
</ol>

<h3>Off-catalog exception</h3>
<p>Custom prescriptions with no catalog price require pharmacist to mark available and set unit price before patient pays at Cashier.</p>

<div class="warn"><strong>Payment gate:</strong> In-house medications cannot be dispensed until the order line is paid (unless local policy allows credit for IPD/ER).</div>
`)}

${section('portal', '3. Pharmacy Portal', `
<p>The <strong>Pharmacy Portal</strong> (<code>/portal/pharmacy</code>) is the pharmacist home screen.</p>

<h3>KPI strip</h3>
<ul>
<li><strong>Total Prescriptions</strong> — all registered prescriptions</li>
<li><strong>Issued Today</strong> — new prescriptions today</li>
<li><strong>Active / Pending</strong> — awaiting dispense</li>
<li><strong>Dispensed</strong> — completed dispensing</li>
<li><strong>Nursing requests</strong> — ward supply requests pending</li>
</ul>

<h3>Quick actions</h3>
<ul>
<li><strong>Prescriptions Queue</strong> — <code>/prescriptions</code></li>
<li><strong>Order alerts</strong> — new doctor prescriptions</li>
<li><strong>Nursing requests</strong> — ward supply with badge count when pending</li>
</ul>

<p>Portal tiles link to pharmacy hub, validate, reporting, and configuration shortcuts.</p>
`)}

${section('hub', '4. Pharmacy Hub Tabs', `
<p>The revamped <strong>Pharmacy Hub</strong> at <code>/pharmacy</code> organizes daily work in four tabs:</p>

<div class="tab-strip">
<span class="tab-chip overview">📊 Dashboard</span>
<span class="tab-chip products">📦 Products</span>
<span class="tab-chip dispense">💊 Dispensing</span>
<span class="tab-chip rx">📋 Prescriptions</span>
</div>

<h3>Dashboard</h3>
<p>KPIs: products count, awaiting dispense, dispensed today, out of stock, active Rx, Rx today. Quick links to products, dispensing queue, validate, and expiry report.</p>

<h3>Products</h3>
<p>Pharmacy inventory linked to service catalog — SKU, category, price, on-hand quantity, reorder level. Stock adjust (+/−), receive stock, sync from catalog.</p>

<h3>Dispensing</h3>
<p>Toggle <strong>Dispensed log</strong> (by day) vs <strong>Awaiting</strong> pending lines. Search by patient, medication, PHA code, pharmacist.</p>

<h3>Prescriptions</h3>
<p>Historical prescription registry — Rx ID, patient, title, status, created date.</p>
`)}

${section('validate', '5. Validate PHA Code & Dispense', `
<p>The validate screen is the primary dispensing entry point when a patient presents a payment slip.</p>

<ol class="step-row">
<li>Open <code>/pharmacy/validate</code> or click <strong>Validate &amp; dispense</strong> from hub.</li>
<li>Enter <strong>PHA service code</strong> (e.g. <code>PHA-7721-M3KP8X2Q</code>).</li>
<li>System verifies payment and loads all medication lines on the code.</li>
<li>Review patient, referring doctor, and prescription status badge.</li>
<li>For each in-house line: check dosage, quantity, stock, expiry.</li>
<li>Click <strong>Dispense this medication</strong> per line — one at a time.</li>
<li>Add pharmacist notes (batch, substitution, counselling) if needed.</li>
</ol>

<h3>Line status badges</h3>
<p>
<span class="status-pill pending">Not yet dispensed</span>
<span class="status-pill paid">Paid · awaiting</span>
<span class="status-pill dispensed">Dispensed</span>
<span class="status-pill offcat">Off-catalog</span>
</p>

<h3>Prescription progress</h3>
<p>Header shows <strong>Partially dispensed (2 of 5)</strong> or <strong>Fully dispensed</strong> as lines are completed.</p>

<h3>Stock warnings</h3>
<ul>
<li>Insufficient stock — option to dispense anyway (stock may go negative for off-catalog)</li>
<li>Expired batch — dispense blocked or warning per policy</li>
<li>No inventory SKU linked — off-catalog or catalog sync needed</li>
</ul>
`)}

${section('alerts', '6. Order Alerts', `
<p><strong>Order alerts</strong> (<code>/pharmacy/order-alerts</code>) surface doctor-prescribed medications from consultations, IPD, and Emergency.</p>

<ol class="step-row">
<li>Open Order alerts from portal or sidebar.</li>
<li>Review unacknowledged prescriptions needing pharmacy attention.</li>
<li>Each alert shows patient, medication, context (OPD / IPD / Emergency).</li>
<li><strong>Mark as seen</strong> when handled via validate flow or off-catalog pricing.</li>
</ol>

<p>Clinical department alerts strip on portal highlights pharmacy items requiring action.</p>
`)}

${section('offcatalog', '7. Off-Catalog & Custom Prescriptions', `
<p>When a doctor prescribes a medication <strong>not in the hospital catalog</strong> or with zero price:</p>

<ol class="step-row">
<li>Line appears on validate screen with <strong>Custom Rx</strong> or <strong>Off-catalog</strong> badge.</li>
<li>Pharmacist toggles <strong>Available off-catalog</strong> if product can be supplied.</li>
<li>Enter <strong>unit price (FCFA)</strong> and save — patient sent to Cashier on same PHA code.</li>
<li>After payment, re-validate same PHA code to dispense.</li>
<li>Stock may go negative until inventory is updated for off-catalog items.</li>
</ol>

<h3>Cashier billing panel</h3>
<p>Cashier OPD bill shows <strong>Await pharmacy</strong> badge until pharmacist confirms off-catalog availability and price.</p>

<div class="tip">Clear off-catalog toggle if product cannot be supplied — patient may need refund or alternative prescription.</div>
`)}

${section('external', '8. External Medications', `
<p>Medications the patient obtains <strong>outside the hospital</strong> are documented without dispensing:</p>

<ol class="step-row">
<li>Doctor marks line as external on prescription.</li>
<li>Validate screen shows external section separate from in-house items.</li>
<li>Pharmacist clicks <strong>Acknowledge served outside</strong> — no stock movement.</li>
<li>Chart shows line resolved with "served outside hospital" note.</li>
</ol>

<p>No payment collection at cashier for external-only lines unless local policy requires documentation fee.</p>
`)}

${section('products', '9. Products & Inventory', `
<h3>Product list</h3>
<p>Products tab shows pharmacy catalog items with inventory linkage:</p>
<table class="data">
<tr><th>Column</th><th>Description</th></tr>
<tr><td>SKU</td><td>Stock keeping unit code</td></tr>
<tr><td>Product</td><td>Medication name</td></tr>
<tr><td>Category</td><td>Medicine type / therapeutic category</td></tr>
<tr><td>Price</td><td>Tariff from Service Catalog</td></tr>
<tr><td>On hand</td><td>Current stock quantity</td></tr>
<tr><td>Reorder at</td><td>Minimum level before alert</td></tr>
</table>

<h3>Stock operations</h3>
<ul>
<li><strong>Adjust</strong> — +/− 1 or custom delta</li>
<li><strong>Receive</strong> — add quantity from goods receipt</li>
<li><strong>Reorder level</strong> — set par level for low-stock alerts</li>
<li><strong>Sync from catalog</strong> — import new catalog items to inventory</li>
<li><strong>Stock history</strong> — view movements per product</li>
</ul>

<h3>Central inventory</h3>
<p><code>/inventory</code> provides hospital-wide SKU management — import pharmacy catalog, apply stock sheet, RFQ for restock.</p>

<h3>Stock status</h3>
<p><span class="status-pill dispensed">In stock</span> · <span class="status-pill pending">Low stock</span> · Out of stock (critical alert on dashboard)</p>
`)}

${section('dispensing', '10. Dispensing Queue & Log', `
<h3>Awaiting tab</h3>
<p>All paid prescription lines not yet dispensed — open validate via PHA code link.</p>

<h3>Dispensed log</h3>
<p>Filter by date — shows patient, medication, PHA code, quantity, pharmacist, dispensed timestamp.</p>

<h3>Legacy IPD path</h3>
<p>Older IPD prescription lines may appear in legacy queue — dispense via line ID action when applicable.</p>

<h3>Dispense with expiry warning</h3>
<p>If batch is near expiry, system may redirect through <code>/pharmacy/dispense-warn/:lineId</code> — confirm before proceeding.</p>
`)}

${section('prescriptions', '11. Prescription Registry', `
<p><strong>Prescription Registry</strong> at <code>/prescriptions</code> lists all clinical medication orders.</p>

<table class="data">
<tr><th>Column</th><th>Description</th></tr>
<tr><td>Rx ID</td><td>Prescription reference number</td></tr>
<tr><td>Patient</td><td>Name and ID</td></tr>
<tr><td>Order title</td><td>Prescription summary</td></tr>
<tr><td>Status</td><td>Active, Partial, Dispensed, Completed, Cancelled</td></tr>
<tr><td>Created</td><td>Order date</td></tr>
</table>

<h3>Actions</h3>
<ul>
<li><strong>View Details</strong> — full prescription with all lines</li>
<li><strong>Print Rx</strong> — patient copy for external pharmacy if needed</li>
<li><strong>Patient Chart</strong> — navigate to clinical record</li>
</ul>
`)}

${section('nursing', '12. Nursing Supply Requests', `
<p>Ward nurses request supplies via <strong>Nursing requests</strong> (<code>/pharmacy/nursing-requests</code>).</p>

<ol class="step-row">
<li>Nurse submits supply request from ward — items and quantities needed.</li>
<li>Pharmacy portal shows badge count when requests pending.</li>
<li>Pharmacist reviews request — mark preparing or dispense.</li>
<li>Stock deducted on dispense; nurse acknowledges receipt on ward.</li>
</ol>

<p>Integrates with IPD ward board and nursing module supply workflow.</p>
`)}

${section('purchase', '13. Purchase Orders', `
<p>Pharmacy procurement at <code>/pharmacy/purchase-orders</code>:</p>

<ol class="step-row">
<li><strong>New PO</strong> — select vendor, add product lines with quantities and unit costs.</li>
<li><strong>Draft</strong> — review before confirmation.</li>
<li><strong>Confirm</strong> — PO sent to vendor; cannot edit lines freely.</li>
<li><strong>Receive goods</strong> — record delivery; stock updated automatically.</li>
</ol>

<p>Links to procurement vendors and inventory movement audit trail.</p>

<p>Purchase activity report available under Intelligence Reports.</p>
`)}

${section('reports', '14. Intelligence Reports', `
<p><strong>Pharmacy Intelligence Reports</strong> hub at <code>/pharmacy/reporting</code> — premium analytics with period filters and print.</p>

<table class="data">
<tr><th>Report</th><th>Purpose</th></tr>
<tr><td>Stock movement</td><td>In/out movements over period</td></tr>
<tr><td>Dispensing</td><td>Medications dispensed by day/pharmacist</td></tr>
<tr><td>Fast-moving</td><td>Top sellers for reorder planning</td></tr>
<tr><td>Dormant stock</td><td>Slow-moving items tying up capital</td></tr>
<tr><td>Low stock</td><td>Items at or below reorder level</td></tr>
<tr><td>Stock valuation</td><td>Inventory value at current prices</td></tr>
<tr><td>Purchase activity</td><td>PO and receiving summary</td></tr>
<tr><td>Negative stock</td><td>SKUs below zero — data quality alert</td></tr>
<tr><td>Expiry</td><td>Batches expiring within N days</td></tr>
</table>

<p>Each report supports period selection (today, week, month, custom) and print-friendly layout.</p>
`)}

${section('expiry', '15. Expiry Management', `
<p>Prevent dispensing expired medications:</p>
<ul>
<li><strong>Expiry report</strong> — <code>/pharmacy/reporting/expiry</code> lists batches nearing expiry</li>
<li>Validate screen shows expiry hint per order line when batch data linked</li>
<li>Dispense blocked or warned for expired stock</li>
<li>Remove expired stock via inventory adjustment after physical quarantine</li>
</ul>

<p>Configure expiry window (days) on expiry report filter.</p>
`)}

${section('cashier', '16. Cashier & Wallet Integration', `
<p>Pharmacy depends on Cashier for payment verification:</p>
<ol class="step-row">
<li>Doctor order creates pharmacy order line — pending payment.</li>
<li>Cashier collects fee; marks line paid; PHA code on receipt.</li>
<li>Pharmacist validates — system confirms paid status before dispense.</li>
<li><strong>Wallet</strong> — patient may pay via pre-paid wallet; same PHA validate flow.</li>
<li>Partial payment — patient returns to cashier for remaining lines.</li>
</ol>

<p>Off-catalog items: pharmacist sets price → cashier bills → patient pays → return to pharmacy.</p>

<p>See <strong>Cashier User Manual</strong> (<code>/docs/cashier-users-manual</code>) for payment methods and code validity.</p>
`)}

${section('catalog', '17. Catalog & Configuration', `
<h3>Service catalog</h3>
<p>Pharmacy medications and XAF tariffs at <code>/catalog</code> → Pharmacy department. Import 139-item price list or Excel/PDF/Word file.</p>

<h3>Medicine types &amp; categories</h3>
<ul>
<li><code>/pharmacy/config/medicine-types</code> — tablet, syrup, injection, etc.</li>
<li><code>/pharmacy/config/medicine-categories</code> — therapeutic class; Rx-required flag</li>
</ul>

<h3>Product profiles</h3>
<p>Link inventory SKU to medicine type, category, and catalog item on product profile save.</p>

<h3>Sync inventory</h3>
<p>Hub → Products → <strong>Sync products from catalog</strong> — adds new catalog items; keeps existing quantities.</p>
`)}

${section('screens', '18. Screen Reference (UI)', `
<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Pharmacy Portal — /portal/pharmacy</div>
  <div class="screen-body">
    <div style="font-size:9pt;font-weight:800;color:#059669;margin-bottom:2mm">💊 Pharmacy Portal</div>
    <div style="font-size:7.5pt;color:#64748b;margin-bottom:3mm">Validate · Dispense · Manage stock · Reports</div>
    <div style="display:flex;gap:2mm;flex-wrap:wrap;margin-bottom:3mm">
      <span style="background:#d1fae5;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Rx 156</span>
      <span style="background:#fef3c7;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Pending 9</span>
      <span style="background:#ede9fe;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Dispensed 142</span>
      <span style="background:#fee2e2;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Nursing 2</span>
    </div>
    <div style="display:flex;gap:2mm;flex-wrap:wrap;font-size:7.5pt">
      <span style="background:#10b981;color:white;padding:1mm 2.5mm;border-radius:4px;font-weight:700">Prescriptions</span>
      <span style="background:white;border:1px solid #e2e8f0;padding:1mm 2.5mm;border-radius:4px">Order alerts</span>
      <span style="background:white;border:1px solid #e2e8f0;padding:1mm 2.5mm;border-radius:4px">Nursing requests</span>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Validate &amp; dispense — /pharmacy/validate</div>
  <div class="screen-body" style="font-size:8.5pt">
    <div style="font-size:10pt;margin-bottom:2mm">💊 Pharmacy · Validate code</div>
    <div style="background:white;border:2px solid #6ee7b7;border-radius:4px;padding:3mm;text-align:center;font-family:monospace;font-weight:800;font-size:11pt;margin:2mm 0">PHA-7721-M3KP8X2Q</div>
    <div style="background:white;border:1px solid #e2e8f0;border-radius:4px;padding:2.5mm;margin:2mm 0">
      <strong>Amoxicillin 500mg</strong> · Qty 21 · Stock 450
      <div style="margin-top:1.5mm"><span style="color:#059669;font-weight:700">Dispense this medication</span></div>
    </div>
    <div style="background:white;border:1px solid #e2e8f0;border-radius:4px;padding:2.5mm;opacity:0.85">
      <strong>Paracetamol 500mg</strong> · <span style="color:#10b981;font-weight:700">✓ Dispensed</span>
    </div>
    <div style="margin-top:2mm;font-size:7.5pt;color:#64748b">Rx status: Partially dispensed (1 of 2)</div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Pharmacy Hub — /pharmacy</div>
  <div class="screen-body" style="font-size:8pt">
    <div class="tab-strip" style="margin:0 0 3mm">
      <span class="tab-chip overview">Dashboard</span>
      <span class="tab-chip products">Products</span>
      <span class="tab-chip dispense">Dispensing</span>
      <span class="tab-chip rx">Prescriptions</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:2mm">
      <div style="background:white;padding:2mm;text-align:center;border-radius:3px"><strong>139</strong><br/>Products</div>
      <div style="background:white;padding:2mm;text-align:center;border-radius:3px"><strong>9</strong><br/>Awaiting</div>
      <div style="background:white;padding:2mm;text-align:center;border-radius:3px"><strong>24</strong><br/>Today</div>
      <div style="background:white;padding:2mm;text-align:center;border-radius:3px"><strong>3</strong><br/>Out</div>
      <div style="background:white;padding:2mm;text-align:center;border-radius:3px"><strong>12</strong><br/>Active Rx</div>
    </div>
  </div>
</div>

<div class="tip"><strong>Live screenshots:</strong> Open <code>/portal/pharmacy</code> or <code>/pharmacy</code> while signed in; Print → Save as PDF for training.</div>
`)}

${section('troubleshooting', '19. Troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Code rejected — payment required</td><td>Patient must pay at Cashier; verify order line paid status</td></tr>
<tr><td>Wrong department code</td><td>PHA for pharmacy; LAB and RAD go to respective departments</td></tr>
<tr><td>Cannot dispense — awaiting pharmacist price</td><td>Set off-catalog price first; send patient to Cashier</td></tr>
<tr><td>Insufficient stock</td><td>Receive stock or use force dispense for off-catalog; create PO</td></tr>
<tr><td>Expired medication blocked</td><td>Check expiry report; quarantine batch; dispense from valid batch</td></tr>
<tr><td>Product not in inventory</td><td>Sync from catalog or add SKU in inventory module</td></tr>
<tr><td>Partial Rx stuck</td><td>Re-validate same PHA code; dispense remaining lines</td></tr>
<tr><td>Cashier shows "Await pharmacy"</td><td>Confirm off-catalog availability and enter unit price</td></tr>
<tr><td>Nursing request missing</td><td>Verify nurse submitted from ward; check nursing-requests page</td></tr>
<tr><td>Negative stock alert</td><td>Run negative stock report; receive goods or adjust data</td></tr>
</table>
`)}

${section('glossary', '20. Glossary', `
<table class="data">
<tr><th>Term</th><th>Definition</th></tr>
<tr><td>PHA code</td><td>Service code prefix for pharmacy order lines (e.g. PHA-7721-…)</td></tr>
<tr><td>Validate</td><td>Verify payment and open prescription for dispensing</td></tr>
<tr><td>Off-catalog</td><td>Medication available but not in standard inventory catalog</td></tr>
<tr><td>Custom Rx</td><td>Doctor-prescribed item with no preset catalog price</td></tr>
<tr><td>External medication</td><td>Patient obtains outside hospital — acknowledge only</td></tr>
<tr><td>SKU</td><td>Stock keeping unit — inventory identifier</td></tr>
<tr><td>Reorder level</td><td>Minimum stock before low-stock alert</td></tr>
<tr><td>Partial dispense</td><td>Some lines dispensed; others remain pending</td></tr>
<tr><td>PO</td><td>Purchase order — procurement document for restocking</td></tr>
<tr><td>Order alert</td><td>Notification of new doctor prescription</td></tr>
<tr><td>Nursing request</td><td>Ward supply requisition fulfilled by pharmacy</td></tr>
</table>
`)}

<p class="footer-note">© ${esc(new Date().getFullYear())} ${esc(b.name)} · Pharmacy Users Manual v2.0 · ${esc(b.facilityName || b.orgName)} · Confidential</p>
</div>`;

  return wrapPremiumDoc({
    title: `Pharmacy User Manual — ${b.productName}`,
    variant: 'pharmacy-manual',
    bodyHtml: body,
  });
}

module.exports = { buildPharmacyUsersManualHtml, PHARMACY_EXTRA_CSS };
