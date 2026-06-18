'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const CASHIER_EXTRA_CSS = `
:root[data-doc="cashier-manual"] {
  --accent: #059669;
  --accent-light: #d1fae5;
  --cash-emerald: #059669;
  --cash-teal: #0d9488;
  --cash-slate: #0f172a;
  --cash-amber: #f59e0b;
  --cash-violet: #7c3aed;
  --cash-rose: #e11d48;
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
.tab-strip { display: flex; flex-wrap: wrap; gap: 2mm; margin: 4mm 0; }
.tab-chip {
  font-size: 7.5pt; font-weight: 700; padding: 1.5mm 3mm; border-radius: 4px;
  border: 1px solid rgba(0,0,0,0.1); break-inside: avoid;
}
.tab-chip.pending { background: #fef3c7; color: #92400e; }
.tab-chip.opd { background: #ccfbf1; color: #115e59; }
.tab-chip.ipd { background: #dbeafe; color: #1e40af; }
.tab-chip.emergency { background: #fee2e2; color: #991b1b; }
.tab-chip.codes { background: #ede9fe; color: #5b21b6; }
.tab-chip.rx { background: #fce7f3; color: #9d174d; }
.screen {
  border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  margin: 4mm 0 5mm; break-inside: avoid; box-shadow: 0 1px 4px rgba(15,23,42,0.08);
}
.screen-bar {
  background: linear-gradient(90deg, #0f172a, #0d9488);
  color: rgba(255,255,255,0.92); padding: 2mm 3mm; font-size: 8pt;
  display: flex; align-items: center; gap: 2mm;
}
.screen-bar .dot { width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #fca5a5; }
.screen-bar .dot:nth-child(2) { background: #fcd34d; }
.screen-bar .dot:nth-child(3) { background: #86efac; }
.screen-body { background: #f8fafc; padding: 4mm; }
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
  width: 5mm; height: 5mm; border-radius: 50%; background: var(--cash-emerald);
  color: white; font-size: 7pt; font-weight: 700; text-align: center; line-height: 5mm;
}
.perm-pill {
  display: inline-block; font-size: 7pt; font-family: ui-monospace, monospace;
  background: #f1f5f9; padding: 0.5mm 2mm; border-radius: 2px; margin: 0.5mm;
}
.hero-img { width: 100%; max-height: 45mm; object-fit: cover; border-radius: 4px; margin: 3mm 0; }
.code-badge {
  display: inline-block; font-family: ui-monospace, monospace; font-size: 8pt; font-weight: 800;
  padding: 1mm 2.5mm; border-radius: 3px; border: 2px solid;
}
.code-badge.lab { border-color: #c4b5fd; background: #ede9fe; color: #5b21b6; }
.code-badge.rad { border-color: #7dd3fc; background: #e0f2fe; color: #0369a1; }
.code-badge.rx { border-color: #fda4af; background: #ffe4e6; color: #be123c; }
.method-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin: 3mm 0;
  font-size: 8pt; text-align: center;
}
.method-grid span {
  background: white; border: 1px solid #e2e8f0; border-radius: 3px; padding: 2mm 1mm;
}
`;

function buildCashierUsersManualHtml() {
  const b = brand;
  const body = `
<style>${PREMIUM_CSS}${CASHIER_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'Cashier User Manual',
  title: 'Cashier Module',
  subtitle: 'Complete staff guide — payment collection, codes, receipts, OPD/IPD/ER settlement, wallets, BetterPay, insurance co-pay, and refunds.',
  badge: 'Premium · Professional Edition',
  variant: 'cashier-manual',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)} Cashier User Manual</strong>. The Cashier module is the financial front line of the hospital — collecting fees, issuing payment codes, managing receipts, and enabling clinical departments to verify paid services.</p>
<div class="tip"><strong>Cashier Command Center:</strong> One workspace at <code>/cashier</code> for pending payments, OPD orders, IPD settlement, emergency bills, issued codes, and doctor prescriptions.</div>

<div class="kpi-row">
  <div class="kpi"><strong>7</strong><span>Main tabs</span></div>
  <div class="kpi"><strong>8+</strong><span>Payment methods</span></div>
  <div class="kpi"><strong>All</strong><span>Clinical modules</span></div>
</div>

<img class="hero-img" src="public/call-queue/photos/consultation.jpg" alt="Cashier desk" />

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#overview">Cashier overview &amp; roles</a></li>
<li><a href="#workspace">Command center workspace</a></li>
<li><a href="#workflow">Standard payment workflow</a></li>
<li><a href="#issue-payment">Issue payment &amp; prepay</a></li>
<li><a href="#methods">Payment methods</a></li>
<li><a href="#codes">Payment codes &amp; validity</a></li>
<li><a href="#opd">OPD payments</a></li>
<li><a href="#consultation">Consultation fees</a></li>
<li><a href="#ipd">IPD settlement</a></li>
<li><a href="#emergency">Emergency / A&amp;E billing</a></li>
<li><a href="#maternity">Maternity &amp; MAT tickets</a></li>
<li><a href="#wallet">Wallets &amp; top-ups</a></li>
<li><a href="#betterpay">BetterPay QR</a></li>
<li><a href="#insurance">Insurance co-pay</a></li>
<li><a href="#refunds">Refunds &amp; receipts</a></li>
<li><a href="#screens">Screen reference</a></li>
<li><a href="#troubleshooting">Troubleshooting</a></li>
<li><a href="#glossary">Glossary</a></li>
</ol>
</div>

${section('overview', '1. Cashier Overview & Roles', `
<p>The <strong>Cashier module</strong> connects patient payments to clinical workflows across OPD, IPD, Emergency, Maternity, Lab, Radiology, and Pharmacy.</p>

<div class="role-grid">
  <div class="role-card" style="background:#d1fae5;border-color:#6ee7b7">
    <div class="icon">💳</div>
    <strong>Cashier</strong>
    <span>Collect payments, issue codes, print receipts, wallet deductions, BetterPay confirmation</span>
  </div>
  <div class="role-card" style="background:#dbeafe;border-color:#93c5fd">
    <div class="icon">🖥</div>
    <strong>Front Desk</strong>
    <span>Route patients to cashier before OPD queue; issue prepayment for walk-ins</span>
  </div>
  <div class="role-card" style="background:#ede9fe;border-color:#c4b5fd">
    <div class="icon">👨‍⚕️</div>
    <strong>Doctor</strong>
    <span>Generates orders requiring payment; department-specific service codes after settlement</span>
  </div>
  <div class="role-card" style="background:#cffafe;border-color:#67e8f9">
    <div class="icon">🔬</div>
    <strong>Lab / Radiology / Pharmacy</strong>
    <span>Verify payment codes before processing orders</span>
  </div>
  <div class="role-card" style="background:#fef3c7;border-color:#fcd34d">
    <div class="icon">📊</div>
    <strong>Accountant</strong>
    <span>Billing workspace, receipts register, financial reports</span>
  </div>
  <div class="role-card" style="background:#fce7f3;border-color:#f9a8d4">
    <div class="icon">👤</div>
    <strong>Patient</strong>
    <span>Pays at cashier or via wallet/BetterPay; carries codes to departments</span>
  </div>
</div>

<h3>Key URLs</h3>
<table class="data">
<tr><th>Screen</th><th>Path</th></tr>
<tr><td>Cashier Command Center</td><td><code>/cashier</code></td></tr>
<tr><td>Cashier portal</td><td><code>/portal/cashier</code></td></tr>
<tr><td>Settle ticket</td><td><code>/cashier/settle/:ticket_id</code></td></tr>
<tr><td>IPD settle modal</td><td>Cashier → IPD Payment tab</td></tr>
<tr><td>ER settle modal</td><td>Cashier → Emergency tab</td></tr>
<tr><td>Wallet hub</td><td><code>/wallet</code></td></tr>
<tr><td>Billing / receipts</td><td><code>/billing</code></td></tr>
</table>

<div class="note"><strong>Permissions:</strong> <span class="perm-pill">cashier.read</span> view tickets · <span class="perm-pill">cashier.write</span> collect payments · <span class="perm-pill">billing.write</span> adjustments</div>
`)}

${section('workspace', '2. Command Center Workspace', `
<p>The revamped <strong>Cashier Command Center</strong> organizes all payment activity in color-coded tabs:</p>

<div class="tab-strip">
<span class="tab-chip pending">⏳ Pending Payments</span>
<span class="tab-chip">📜 Payment History</span>
<span class="tab-chip opd">🩺 OPD Payment</span>
<span class="tab-chip ipd">🛏️ IPD Payment</span>
<span class="tab-chip emergency">🚑 Emergency</span>
<span class="tab-chip codes">🏷️ Codes Issued</span>
<span class="tab-chip rx">💊 Doctors Rx</span>
</div>

<h3>KPI strip</h3>
<ul>
<li><strong>Today revenue</strong> — payments collected today</li>
<li><strong>Pending queue</strong> — tickets awaiting collection</li>
<li><strong>Wallet payments</strong> — deductions today</li>
<li><strong>Wallet hub</strong> — quick link for top-ups</li>
</ul>

<h3>Quick code lookup</h3>
<p>Enter any payment code (e.g. <code>PAY-2026-00000036</code>) to open settlement screen instantly.</p>

<h3>Issue payment button</h3>
<p>Opens prepay modal for walk-in services: consultation, lab, imaging, maternity, surgery catalog items — with doctor assignment and insurance options.</p>
`)}

${section('workflow', '3. Standard Payment Workflow', `
<div class="flow">Patient arrives → Cashier collects fee (or wallet/BetterPay)
→ Payment code issued → Patient goes to clinical department
→ Staff enters code to verify payment → Service processed</div>

<h3>OPD standard flow</h3>
<ol class="step-row">
<li>Patient pays <strong>consultation fee</strong> at cashier first.</li>
<li>Receives consultation payment code.</li>
<li>Front Desk adds patient to OPD queue.</li>
<li>After doctor visit, patient returns for <strong>order payment</strong> (lab/rad/pharmacy).</li>
<li>Departments verify codes before processing.</li>
</ol>

<h3>Emergency exception</h3>
<p>Emergency/A&amp;E patients bypass prepayment — billing is <strong>retrospective</strong> after clinical care on the credit tab.</p>
`)}

${section('issue-payment', '4. Issue Payment & Prepay', `
<h3>Walk-in prepayment</h3>
<ol class="step-row">
<li>Click <strong>Issue payment</strong> on Cashier Command Center.</li>
<li>Search and select patient (or create from maternity/OPD deep link).</li>
<li>Choose service type: consultation, laboratory, radiology, maternity, surgery, general service.</li>
<li>Select catalog item and assigned doctor if required.</li>
<li>Apply insurance co-pay % if on file.</li>
<li>Choose payment method (see Section 6).</li>
<li>Confirm — ticket created in <strong>Pending</strong> queue or settled immediately.</li>
</ol>

<h3>Maternity deep links</h3>
<p>Maternity chart billing panel can open cashier with pre-filled MAT event (<code>?prepay=1&amp;maternity_event=...</code>).</p>

<h3>BetterPay retry</h3>
<p>Failed or timed-out BetterPay sessions show <strong>Retry</strong> on pending tickets — reopens QR payment flow.</p>
`)}

${section('methods', '5. Payment Methods', `
<div class="method-grid">
<span>💵 Cash</span><span>📱 MoMo</span><span>🟠 Orange Money</span><span>🏦 Bank</span>
<span>📲 BetterPay QR</span><span>👛 Wallet</span><span>🏥 Insurance</span><span>💳 Mixed</span>
</div>

<table class="data">
<tr><th>Method</th><th>When to use</th></tr>
<tr><td><strong>Cash</strong></td><td>Physical FCFA at desk — default</td></tr>
<tr><td><strong>MoMo / OM</strong></td><td>Mobile money transfer confirmed by cashier</td></tr>
<tr><td><strong>Bank transfer</strong></td><td>Corporate or large payments with reference</td></tr>
<tr><td><strong>BetterPay</strong></td><td>Patient scans QR or opens link; cashier confirms receipt</td></tr>
<tr><td><strong>Wallet</strong></td><td>Deduct from pre-paid patient wallet balance</td></tr>
<tr><td><strong>Insurance</strong></td><td>Split insurer share vs patient co-pay automatically</td></tr>
</table>

<p>On settlement screen (<code>/cashier/settle/:id</code>), select method, review line items, and click <strong>Collect Payment</strong>.</p>
`)}

${section('codes', '6. Payment Codes & Validity', `
<p>Each settled service generates a unique <strong>payment code</strong> (e.g. <code>CON-4829-K7HM3R9Q</code>, <code>PAY-2026-00000036</code>).</p>

<h3>Code purposes</h3>
<ul>
<li>Verify payment at Lab, Radiology, Pharmacy stations</li>
<li>Track partial payments on multi-line tickets</li>
<li>Support OPD follow-up within validity rules</li>
<li>Link doctor orders to department-specific codes (Lab / Rad / Pharm badges)</li>
</ul>

<h3>Validity rules</h3>
<p>Consultation codes may expire based on:</p>
<ul>
<li>Configured validity days (Settings → Payment validity)</li>
<li>Maximum uses per code</li>
<li>Doctor-documented follow-up interval</li>
</ul>
<p>Lab, radiology, pharmacy, IPD, and emergency codes are checked for paid status — not time expiry.</p>

<h3>Codes Issued tab</h3>
<p>Search all generated codes with type, status, date, and print links.</p>
`)}

${section('opd', '7. OPD Payments', `
<p><strong>OPD Payment</strong> tab lists consultations with unpaid order lines:</p>
<ol class="step-row">
<li>Filter by patient name or consultation number.</li>
<li>Review pending items and total due.</li>
<li>Click <strong>View / Bill</strong> — opens OPD orders bill modal.</li>
<li>Collect full or partial payment per line.</li>
<li>Issue department codes (Lab, Rad, Pharm) shown on Doctors Rx tab.</li>
</ol>

<h3>Partial payment</h3>
<p>Same consultation can accept multiple payments until balance zero — patient reuses ticket until fully paid.</p>

<h3>Refunds</h3>
<p><strong>Refund</strong> action on eligible consultations — requires authorization; reverses or adjusts ticket lines.</p>
`)}

${section('consultation', '8. Consultation Fees', `
<h3>General vs specialist consultation</h3>
<p>Service catalog distinguishes:</p>
<ul>
<li><strong>General consultation</strong> — any doctor</li>
<li><strong>Specialist consultation</strong> — requires matching specialisation</li>
</ul>
<p>Cashier assigns doctor at prepay; system validates catalog rules.</p>

<h3>Telemedicine</h3>
<p>Teleconsultation tickets follow consultation validity rules when enabled.</p>

<h3>Follow-up visits</h3>
<p>Returning patients may use existing payment code if doctor marked follow-up eligible and validity passes — otherwise new consultation fee required.</p>
`)}

${section('ipd', '9. IPD Settlement', `
<p><strong>IPD Payment</strong> tab shows inpatients awaiting financial discharge:</p>
<ol class="step-row">
<li>Filter by patient, ward, or bed.</li>
<li>Review running bill: deposit, charges, balance due.</li>
<li>Open <strong>IPD Settle</strong> modal.</li>
<li>Enter or validate IPD payment code.</li>
<li>Collect final settlement — mark Financial Discharge.</li>
<li>Bed released for housekeeping on ward board.</li>
</ol>

<p>IPD charges include ward fees, lab, radiology, pharmacy, procedures accumulated during stay.</p>
`)}

${section('emergency', '10. Emergency / A&E Billing', `
<p><strong>Emergency</strong> tab (A&amp;E badge) lists patients with unpaid credit tab charges:</p>
<ol class="step-row">
<li>Clinical care completed on ER chart (disposition confirmed).</li>
<li>Cashier presents retrospective bill from open tab total.</li>
<li>Collect via standard payment methods or wallet.</li>
<li>Issue EMG settlement code — closes ER visit financially.</li>
</ol>

<div class="warn">Emergency patients do not pay before triage — always collect after stabilization unless policy requires deposit.</div>
`)}

${section('maternity', '11. Maternity & MAT Tickets', `
<p>Maternity module payment tickets link to ANC events:</p>
<ul>
<li>ANC booking (first visit)</li>
<li>ANC routine visits</li>
<li>Labor ward admission</li>
<li>Delivery types (SVD, CS, etc.)</li>
<li>Postnatal routine</li>
<li>NICU per day</li>
</ul>

<p>From maternity chart <strong>Billing</strong> panel: view paid/due, MAT tickets on file, <strong>Collect at cashier</strong> deep link with event pre-selected.</p>
`)}

${section('wallet', '12. Wallets & Top-ups', `
<p><strong>Pre-paid wallets</strong> at <code>/wallet</code> enable cashless department payments:</p>
<ol class="step-row">
<li>Search patient — create wallet if none exists.</li>
<li><strong>Top-up</strong> — receive cash at desk, credit virtual balance.</li>
<li>Patient shows wallet QR at Pharmacy/Lab for automatic deduction.</li>
<li>At settlement, choose <strong>Wallet</strong> method if balance sufficient.</li>
</ol>

<p>GBPay MoMo auto-credit when patient sends to wallet QR (if configured).</p>

<div class="tip">If wallet insufficient, use <strong>Go to Wallet &amp; Top-up</strong> from settlement screen, then retry wallet payment.</div>
`)}

${section('betterpay', '13. BetterPay QR Payments', `
<h3>QR workflow</h3>
<ol class="step-row">
<li>Select <strong>BetterPay</strong> as payment method on prepay or settle.</li>
<li>System displays QR code and payment link.</li>
<li>Patient scans or opens link on mobile.</li>
<li>After payment on BetterPay, cashier clicks <strong>Confirm payment received</strong>.</li>
<li>Ticket marked paid — codes issued.</li>
</ol>

<p>Configure BetterPay partner ID under Accounting → Settings → Payments. Pending BetterPay tickets show badge and retry option.</p>
`)}

${section('insurance', '14. Insurance Co-pay', `
<p>When patient has insurance on clinical chart:</p>
<ul>
<li>System applies configured <strong>insurer share %</strong></li>
<li>Settlement screen shows: Insurer pays / Patient pays split</li>
<li>Manual override checkbox for exceptional cases</li>
</ul>
<p>Primary insurer set on patient chart or insurance hub (<code>/insurance</code>).</p>
`)}

${section('refunds', '15. Refunds & Receipts', `
<h3>Receipts</h3>
<ul>
<li>Print receipt after every collection</li>
<li>Payment History tab — search past transactions</li>
<li>Billing workspace — fiscal documents register</li>
<li>Service codes printed on settlement for patient to carry to departments</li>
</ul>

<h3>Doctor prescriptions print</h3>
<p><strong>Doctors Rx</strong> tab — print prescription with Lab/Rad/Pharm codes for patient handoff.</p>

<h3>Refunds</h3>
<p>OPD refund modal for eligible consultations — documents reason, adjusts financial records per policy.</p>
`)}

${section('screens', '16. Screen Reference (UI)', `
<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Cashier Command Center — /cashier</div>
  <div class="screen-body">
    <div style="font-size:9pt;font-weight:800;color:#0f172a;margin-bottom:2mm">💰 Cashier Command Center</div>
    <div style="font-size:7.5pt;color:#64748b;margin-bottom:3mm">Collect fees · Issue codes · Manage receipts · Wallet payments</div>
    <div style="display:flex;gap:2mm;flex-wrap:wrap;margin-bottom:3mm">
      <span style="background:#fef3c7;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">Pending 4</span>
      <span style="background:#ccfbf1;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">OPD 2</span>
      <span style="background:#dbeafe;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">IPD 1</span>
      <span style="background:#fee2e2;padding:1mm 2mm;border-radius:4px;font-size:7pt;font-weight:700">A&amp;E 1</span>
    </div>
    <div style="background:white;border:1px solid #e2e8f0;border-radius:4px;padding:2.5mm;font-size:8pt">
      <strong>PAY-2026-00000042</strong> · Jane Doe · 15,000 FCFA · <span style="color:#059669;font-weight:700">Collect</span>
    </div>
  </div>
</div>

<div class="screen">
  <div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Settlement — Payment methods</div>
  <div class="screen-body" style="font-size:8.5pt">
    <strong>Ticket PAY-2026-00000036 · Consultation</strong>
    <table class="data" style="margin:2mm 0;font-size:7.5pt">
    <tr><td>General consultation</td><td>10,000 FCFA</td></tr>
    </table>
    <div class="method-grid" style="margin:2mm 0">
      <span>💵 Cash</span><span>📱 MoMo</span><span>📲 QR</span><span>👛 Wallet</span>
    </div>
    <div style="margin-top:2mm">
      <span class="code-badge lab">LAB CON-4829-X7</span>
      <span class="code-badge rad">RAD RAD-8821-K2</span>
    </div>
  </div>
</div>

<div class="tip"><strong>Live screenshots:</strong> Open <code>/cashier</code> while signed in; Print → Save as PDF for training.</div>
`)}

${section('troubleshooting', '17. Troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>Solution</th></tr>
<tr><td>Code not accepted at lab</td><td>Confirm ticket status paid; check correct department code (Lab vs Rad vs Pharm)</td></tr>
<tr><td>Consultation code expired</td><td>Check validity rules; patient needs new consultation payment</td></tr>
<tr><td>Cannot assign doctor</td><td>Specialist service requires matching doctor specialisation</td></tr>
<tr><td>Wallet payment fails</td><td>Top up wallet first; verify wallet exists for patient</td></tr>
<tr><td>BetterPay not confirming</td><td>Verify partner ID configured; patient must complete payment before confirm</td></tr>
<tr><td>IPD not in settle list</td><td>Doctor must sign clinical discharge first</td></tr>
<tr><td>ER ticket missing</td><td>Confirm disposition and open credit tab on ER visit chart</td></tr>
<tr><td>Insurance split wrong</td><td>Update insurer share on patient chart; check manual override</td></tr>
<tr><td>Partial payment stuck</td><td>Reopen same ticket from Pending; collect remaining balance</td></tr>
</table>
`)}

${section('glossary', '18. Glossary', `
<table class="data">
<tr><th>Term</th><th>Definition</th></tr>
<tr><td>Payment code</td><td>Unique alphanumeric ticket identifier for a paid service</td></tr>
<tr><td>Ticket</td><td>Payment record in tbl_payment_ticket (pending or paid)</td></tr>
<tr><td>Prepay</td><td>Payment before clinical service (standard OPD flow)</td></tr>
<tr><td>Settlement</td><td>Final payment collection closing a bill</td></tr>
<tr><td>Co-pay</td><td>Patient portion when insurance covers remainder</td></tr>
<tr><td>Credit tab</td><td>Running unpaid charges (ER/IPD)</td></tr>
<tr><td>MAT ticket</td><td>Maternity module payment linked to obstetric event</td></tr>
<tr><td>BetterPay</td><td>QR/mobile payment partner integration</td></tr>
<tr><td>Wallet</td><td>Pre-paid patient balance for cashless deductions</td></tr>
<tr><td>Follow-up</td><td>Return visit under existing consultation code validity</td></tr>
</table>
`)}

<p class="footer-note">© ${esc(new Date().getFullYear())} ${esc(b.name)} · Cashier Users Manual v2.0 · ${esc(b.facilityName || b.orgName)} · Confidential</p>
</div>`;

  return wrapPremiumDoc({
    title: `Cashier User Manual — ${b.productName}`,
    variant: 'cashier-manual',
    bodyHtml: body,
  });
}

module.exports = { buildCashierUsersManualHtml, CASHIER_EXTRA_CSS };
