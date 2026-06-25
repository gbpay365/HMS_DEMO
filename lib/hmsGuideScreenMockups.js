'use strict';

/** High-fidelity illustrated UI screens for the role profiles guide (PDF-safe). */
function screen(title, bodyHtml, accent = '#0c8b8b') {
  return `
<figure class="guide-screen">
  <figcaption class="guide-screen-cap">📸 ${title}</figcaption>
  <div class="screen">
    <div class="screen-bar" style="background:linear-gradient(90deg,${accent},#0f172a)">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <span class="screen-title">${title}</span>
    </div>
    <div class="screen-body">${bodyHtml}</div>
  </div>
</figure>`;
}

const SCREENS = {
  login: screen(
    'Login — ZAIZENS HMS',
    `<div style="max-width:70mm;margin:4mm auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:5mm;box-shadow:0 4px 12px rgba(15,23,42,.12)">
      <div style="text-align:center;font-weight:800;color:#0c2340;font-size:11pt;margin-bottom:3mm">ZAIZENS Integrated HMS</div>
      <div style="font-size:8pt;color:#64748b;text-align:center;margin-bottom:4mm">Sign in with your staff credentials</div>
      <div style="margin-bottom:2.5mm"><label style="font-size:7pt;font-weight:700;color:#475569">Username</label>
        <div style="border:1px solid #cbd5e1;border-radius:4px;padding:2mm;font-size:9pt;background:#f8fafc">Lariza</div></div>
      <div style="margin-bottom:3mm"><label style="font-size:7pt;font-weight:700;color:#475569">Password</label>
        <div style="border:1px solid #cbd5e1;border-radius:4px;padding:2mm;font-size:9pt;background:#f8fafc">•••••</div></div>
      <div style="background:#0c8b8b;color:#fff;text-align:center;padding:2.5mm;border-radius:4px;font-weight:700;font-size:9pt">Sign in</div>
    </div>`,
    '#0c2340'
  ),

  'cashier-portal': screen(
    'Cashier Portal — /portal/cashier',
    `<div style="font-size:9pt;font-weight:800;color:#065f46;margin-bottom:2mm">💳 Cashier Portal</div>
     <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;font-size:7.5pt">
       <div style="background:#d1fae5;border:1px solid #6ee7b7;border-radius:6px;padding:3mm;text-align:center"><strong>Command Center</strong><br/>Collect &amp; codes</div>
       <div style="background:#dbeafe;border:1px solid #93c5fd;border-radius:6px;padding:3mm;text-align:center"><strong>Wallet hub</strong><br/>Top-ups</div>
       <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:3mm;text-align:center"><strong>Billing</strong><br/>Receipts</div>
     </div>
     <div style="margin-top:3mm;display:flex;gap:2mm;font-size:7pt">
       <span style="background:#ecfdf5;padding:1.5mm 2.5mm;border-radius:99px">Today revenue: 245,000 FCFA</span>
       <span style="background:#fef3c7;padding:1.5mm 2.5mm;border-radius:99px">Pending: 4</span>
     </div>`,
    '#059669'
  ),

  'cashier-hub': screen(
    'Cashier Command Center — /cashier',
    `<div style="font-size:9pt;font-weight:800;color:#0f172a;margin-bottom:2mm">💰 Cashier Command Center</div>
     <div style="display:flex;gap:1.5mm;flex-wrap:wrap;margin-bottom:3mm;font-size:7pt">
       <span style="background:#fef3c7;padding:1.5mm 2.5mm;border-radius:4px;font-weight:700">⏳ Pending 4</span>
       <span style="background:#ccfbf1;padding:1.5mm 2.5mm;border-radius:4px;font-weight:700">🩺 OPD 2</span>
       <span style="background:#dbeafe;padding:1.5mm 2.5mm;border-radius:4px;font-weight:700">🛏 IPD 1</span>
       <span style="background:#fee2e2;padding:1.5mm 2.5mm;border-radius:4px;font-weight:700">🚑 A&amp;E 1</span>
     </div>
     <div style="background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:2.5mm;font-size:8pt;margin-bottom:2mm">
       <strong>PAY-2026-000042</strong> · Jane Doe · 15,000 FCFA · <span style="color:#059669;font-weight:700">Collect</span>
     </div>
     <div style="display:flex;gap:2mm">
       <span style="background:#059669;color:#fff;padding:1.5mm 3mm;border-radius:4px;font-size:7.5pt;font-weight:700">+ Issue payment</span>
       <span style="background:#0d9488;color:#fff;padding:1.5mm 3mm;border-radius:4px;font-size:7.5pt;font-weight:700">↑ Cash Top-up</span>
     </div>`,
    '#059669'
  ),

  'cashier-prepay': screen(
    'Issue Payment / Prepay Modal',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">Issue payment — Jane Doe</div>
     <div style="font-size:8pt;margin-bottom:2mm">Service: <strong>General consultation</strong> · Dr. Awelsa · 10,000 FCFA</div>
     <div style="display:flex;gap:1.5mm;flex-wrap:wrap;font-size:7pt;margin-bottom:2mm">
       <span style="border:1px solid #e2e8f0;padding:1mm 2mm;border-radius:3px">💵 Cash</span>
       <span style="border:2px solid #059669;padding:1mm 2mm;border-radius:3px;background:#ecfdf5">👛 Wallet</span>
       <span style="border:1px solid #e2e8f0;padding:1mm 2mm;border-radius:3px">📲 BetterPay</span>
     </div>
     <div style="font-size:7.5pt;color:#b45309;background:#fffbeb;padding:2mm;border-radius:4px">Wallet balance: 25,000 FCFA — sufficient</div>`,
    '#059669'
  ),

  'cashier-settle': screen(
    'Settlement & Payment Codes',
    `<div style="font-size:9pt;font-weight:800">Ticket PAY-2026-000036</div>
     <table style="width:100%;font-size:7.5pt;margin:2mm 0;border-collapse:collapse">
       <tr style="border-bottom:1px solid #e2e8f0"><td>General consultation</td><td align="right">10,000 FCFA</td></tr>
       <tr><td><strong>Total</strong></td><td align="right"><strong>10,000 FCFA</strong></td></tr>
     </table>
     <div style="margin:2mm 0;display:flex;gap:2mm;font-size:7pt">
       <span style="background:#ede9fe;color:#5b21b6;padding:1mm 2mm;border-radius:3px;font-weight:700">LAB LAB-4829-X7</span>
       <span style="background:#e0f2fe;color:#0369a1;padding:1mm 2mm;border-radius:3px;font-weight:700">RAD RAD-8821-K2</span>
     </div>
     <div style="background:#059669;color:#fff;text-align:center;padding:2mm;border-radius:4px;font-size:8pt;font-weight:700">Collect Payment &amp; Print</div>`,
    '#059669'
  ),

  'cashier-wallet': screen(
    'Cash Top-up — Wallet Modal',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">👛 Wallet top-up</div>
     <div style="font-size:8pt;margin-bottom:2mm">Patient search: <strong>Souleman</strong></div>
     <div style="background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:2mm;font-size:7.5pt;margin-bottom:2mm">Ghouenzen Soulemanou · ZAI-000042-ZNS</div>
     <div style="font-size:8pt">Amount: <strong>50,000 FCFA</strong> · Method: Cash</div>
     <div style="margin-top:2mm;background:#0d9488;color:#fff;text-align:center;padding:2mm;border-radius:4px;font-size:8pt;font-weight:700">Confirm top-up</div>`,
    '#0d9488'
  ),

  'doctor-portal': screen(
    'Doctor Portal — /portal/doctor',
    `<div style="font-size:9pt;font-weight:800;color:#1e40af;margin-bottom:2mm">🩺 Doctor Portal</div>
     <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;font-size:7.5pt">
       <div style="background:#dbeafe;border-radius:6px;padding:3mm;text-align:center"><strong>OPD Queue</strong><br/>8 waiting</div>
       <div style="background:#ede9fe;border-radius:6px;padding:3mm;text-align:center"><strong>Consultations</strong><br/>New visit</div>
       <div style="background:#d1fae5;border-radius:6px;padding:3mm;text-align:center"><strong>Ward rounds</strong><br/>3 active IPD</div>
     </div>`,
    '#1a6bd8'
  ),

  'doctor-opd-queue': screen(
    'OPD Queue — /opd-queue',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">OPD Queue</div>
     <table style="width:100%;font-size:7.5pt;border-collapse:collapse">
       <tr style="background:#ede9fe"><td><strong>#042</strong> Jane Doe</td><td>Waiting</td><td><span style="color:#1a6bd8;font-weight:700">Start</span></td></tr>
       <tr><td><strong>#043</strong> Paul N.</td><td>In consultation</td><td>—</td></tr>
       <tr style="background:#f8fafc"><td><strong>#044</strong> Marie K.</td><td>Registered</td><td>Triage</td></tr>
     </table>`,
    '#1a6bd8'
  ),

  'doctor-consultation': screen(
    'Consultation Workspace',
    `<div style="font-size:9pt;font-weight:800">Consultation — Jane Doe</div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:2mm;font-size:7.5pt;margin:2mm 0">
       <div style="border-left:3px solid #1a6bd8;padding:2mm;background:#fff"><strong>S</strong> Chief complaint: fever 3 days</div>
       <div style="border-left:3px solid #1a6bd8;padding:2mm;background:#fff"><strong>O</strong> Temp 38.2°C, clear chest</div>
     </div>
     <div style="display:flex;gap:2mm;font-size:7pt">
       <span style="background:#ede9fe;padding:1.5mm 2.5mm;border-radius:4px">+ Lab order</span>
       <span style="background:#e0f2fe;padding:1.5mm 2.5mm;border-radius:4px">+ Imaging</span>
       <span style="background:#fce7f3;padding:1.5mm 2.5mm;border-radius:4px">+ Prescription</span>
     </div>`,
    '#1a6bd8'
  ),

  'doctor-orders': screen(
    'Doctor Orders — Lab & Radiology',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">Orders for Jane Doe</div>
     <div style="font-size:8pt;margin-bottom:1.5mm">🧪 <strong>FBC</strong> — Full blood count · 5,000 FCFA</div>
     <div style="font-size:8pt;margin-bottom:2mm">📡 <strong>Chest X-ray</strong> · 8,000 FCFA</div>
     <div style="font-size:7.5pt;color:#64748b">Patient must pay at Cashier before Lab/Radiology processing</div>`,
    '#1a6bd8'
  ),

  'doctor-rx': screen(
    'Prescription — Send to Pharmacy',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">💊 Prescription</div>
     <div style="font-size:8pt">Paracetamol 500mg — 2 tabs TID × 5 days</div>
     <div style="font-size:8pt;margin:1.5mm 0">Amoxicillin 500mg — 1 cap BID × 7 days</div>
     <div style="background:#1a6bd8;color:#fff;text-align:center;padding:2mm;border-radius:4px;font-size:8pt;font-weight:700;margin-top:2mm">Save &amp; send to Pharmacy</div>`,
    '#1a6bd8'
  ),

  'nurse-portal': screen(
    'Nurse Portal — /portal/nurse',
    `<div style="font-size:9pt;font-weight:800;color:#c2410c;margin-bottom:2mm">💉 Nurse Portal</div>
     <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;font-size:7.5pt">
       <div style="background:#ffedd5;border-radius:6px;padding:3mm;text-align:center"><strong>OPD triage</strong></div>
       <div style="background:#fce7f3;border-radius:6px;padding:3mm;text-align:center"><strong>Vital signs</strong></div>
       <div style="background:#dbeafe;border-radius:6px;padding:3mm;text-align:center"><strong>Ward board</strong></div>
     </div>`,
    '#ea580c'
  ),

  'nurse-triage': screen(
    'OPD Triage — Queue Management',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">Triage — OPD Queue</div>
     <div style="background:#fff;border:1px solid #fed7aa;border-radius:4px;padding:3mm;font-size:8pt">
       <strong>Marie K.</strong> · Registered → <span style="color:#ea580c;font-weight:700">Move to Waiting for doctor</span>
     </div>
     <div style="font-size:7.5pt;margin-top:2mm;color:#64748b">Priority: Normal · Chief complaint: headache</div>`,
    '#ea580c'
  ),

  'nurse-vitals': screen(
    'Vital Signs Entry',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">Vital signs — Marie K.</div>
     <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;font-size:7.5pt">
       <div style="background:#fff;border:1px solid #fed7aa;border-radius:4px;padding:2mm;text-align:center"><strong>BP</strong><br/>120/80</div>
       <div style="background:#fff;border:1px solid #fed7aa;border-radius:4px;padding:2mm;text-align:center"><strong>Pulse</strong><br/>72</div>
       <div style="background:#fff;border:1px solid #fed7aa;border-radius:4px;padding:2mm;text-align:center"><strong>Temp</strong><br/>36.8°C</div>
       <div style="background:#fff;border:1px solid #fed7aa;border-radius:4px;padding:2mm;text-align:center"><strong>SpO₂</strong><br/>98%</div>
       <div style="background:#fff;border:1px solid #fed7aa;border-radius:4px;padding:2mm;text-align:center"><strong>Weight</strong><br/>65 kg</div>
     </div>`,
    '#ea580c'
  ),

  'nurse-ward': screen(
    'Ward Board — IPD',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">Ward board — Medical Ward A</div>
     <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1.5mm;font-size:7pt">
       <div style="background:#d1fae5;border-radius:4px;padding:2mm;text-align:center">Bed 1<br/>Occupied</div>
       <div style="background:#d1fae5;border-radius:4px;padding:2mm;text-align:center">Bed 2<br/>Occupied</div>
       <div style="background:#f1f5f9;border-radius:4px;padding:2mm;text-align:center">Bed 3<br/>Free</div>
       <div style="background:#d1fae5;border-radius:4px;padding:2mm;text-align:center">Bed 4<br/>Occupied</div>
     </div>`,
    '#ea580c'
  ),

  'rad-portal': screen(
    'Radiology Portal — /portal/radiology',
    `<div style="font-size:9pt;font-weight:800;color:#0e7490;margin-bottom:2mm">📡 Radiology Portal</div>
     <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:2mm;font-size:7.5pt">
       <div style="background:#cffafe;border-radius:6px;padding:3mm"><strong>Worklist</strong><br/>6 pending studies</div>
       <div style="background:#e0f2fe;border-radius:6px;padding:3mm"><strong>Validate code</strong><br/>Patient check-in</div>
     </div>`,
    '#0891b2'
  ),

  'rad-worklist': screen(
    'Radiology Worklist — /radiology',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">Imaging worklist</div>
     <table style="width:100%;font-size:7.5pt;border-collapse:collapse">
       <tr style="background:#cffafe"><td>Chest X-ray</td><td>Jane Doe</td><td>Paid</td><td><strong>Open</strong></td></tr>
       <tr><td>Abdominal US</td><td>Paul N.</td><td>Pending pay</td><td>—</td></tr>
     </table>`,
    '#0891b2'
  ),

  'rad-report': screen(
    'Radiology Report Entry',
    `<div style="font-size:9pt;font-weight:800">Report — Chest X-ray · Jane Doe</div>
     <div style="font-size:8pt;margin:2mm 0"><strong>Findings:</strong> Clear lung fields. Normal cardiac silhouette.</div>
     <div style="font-size:8pt"><strong>Impression:</strong> No acute cardiopulmonary abnormality.</div>
     <div style="margin-top:2mm;background:#0891b2;color:#fff;text-align:center;padding:2mm;border-radius:4px;font-size:8pt;font-weight:700">Finalize report</div>`,
    '#0891b2'
  ),

  'lab-portal': screen(
    'Laboratory Portal — /portal/lab',
    `<div style="font-size:9pt;font-weight:800;color:#5b21b6;margin-bottom:2mm">🔬 Laboratory Portal</div>
     <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;font-size:7.5pt">
       <div style="background:#ede9fe;border-radius:6px;padding:3mm"><strong>LIMS hub</strong></div>
       <div style="background:#dbeafe;border-radius:6px;padding:3mm"><strong>Registry</strong></div>
       <div style="background:#fef3c7;border-radius:6px;padding:3mm"><strong>Order alerts</strong></div>
     </div>`,
    '#7c3aed'
  ),

  'lab-validate': screen(
    'Validate LAB Payment Code — /laboratory/validate',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">Validate payment code</div>
     <div style="border:2px solid #7c3aed;border-radius:4px;padding:2.5mm;font-size:9pt;font-family:monospace;margin-bottom:2mm">LAB-4829-K7HM3R9Q</div>
     <div style="font-size:8pt;background:#ecfdf5;padding:2mm;border-radius:4px;color:#065f46">✓ Paid · Jane Doe · FBC ordered by Dr. Awelsa</div>`,
    '#7c3aed'
  ),

  'lab-results': screen(
    'Lab Results Entry — Template Workbench',
    `<div style="font-size:9pt;font-weight:800">FBC — Jane Doe</div>
     <table style="width:100%;font-size:7.5pt;margin:2mm 0;border-collapse:collapse">
       <tr><td>Hb</td><td>13.2 g/dL</td><td style="color:#059669">Normal</td></tr>
       <tr><td>WBC</td><td>7.1 ×10⁹/L</td><td style="color:#059669">Normal</td></tr>
       <tr><td>Platelets</td><td>245 ×10⁹/L</td><td style="color:#059669">Normal</td></tr>
     </table>
     <div style="background:#7c3aed;color:#fff;text-align:center;padding:2mm;border-radius:4px;font-size:8pt;font-weight:700">Finalize result</div>`,
    '#7c3aed'
  ),

  'lab-lims': screen(
    'LIMS Hub — /lims',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">LIMS Hub</div>
     <div style="display:flex;gap:2mm;font-size:7pt;margin-bottom:2mm">
       <span style="background:#fef3c7;padding:1.5mm 2.5mm;border-radius:99px">Submitted: 3</span>
       <span style="background:#dbeafe;padding:1.5mm 2.5mm;border-radius:99px">In progress: 5</span>
       <span style="background:#d1fae5;padding:1.5mm 2.5mm;border-radius:99px">Samples today: 8</span>
     </div>
     <div style="font-size:8pt">📋 Requests · 🩸 Samples · 📝 Templates · ⚙️ Config</div>`,
    '#7c3aed'
  ),

  'pharm-portal': screen(
    'Pharmacy Portal — /portal/pharmacy',
    `<div style="font-size:9pt;font-weight:800;color:#059669;margin-bottom:2mm">💊 Pharmacy Portal</div>
     <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:2mm;font-size:7.5pt">
       <div style="background:#d1fae5;border-radius:6px;padding:3mm"><strong>Dispensing queue</strong><br/>4 pending Rx</div>
       <div style="background:#fef3c7;border-radius:6px;padding:3mm"><strong>Stock alerts</strong><br/>2 low items</div>
     </div>`,
    '#10b981'
  ),

  'pharm-dispense': screen(
    'Pharmacy Dispensing — /pharmacy',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">Prescription #RX-2026-0188</div>
     <div style="font-size:8pt">Patient: <strong>Jane Doe</strong> · Dr. Awelsa</div>
     <div style="font-size:8pt;margin:1.5mm 0">Paracetamol 500mg × 30 — <span style="color:#059669">In stock</span></div>
     <div style="font-size:8pt;margin:1.5mm 0">Amoxicillin 500mg × 14 — <span style="color:#059669">In stock</span></div>
     <div style="background:#10b981;color:#fff;text-align:center;padding:2mm;border-radius:4px;font-size:8pt;font-weight:700;margin-top:2mm">Mark dispensed</div>`,
    '#10b981'
  ),

  'pharm-verify': screen(
    'Verify Payment Before Dispensing',
    `<div style="font-size:9pt;font-weight:800;margin-bottom:2mm">Payment verification</div>
     <div style="font-size:8pt;font-family:monospace;background:#fce7f3;padding:2mm;border-radius:4px;margin-bottom:2mm">PHARM-4829-P9XK2</div>
     <div style="font-size:8pt;color:#065f46;background:#ecfdf5;padding:2mm;border-radius:4px">✓ Pharmacy line paid · Ready to dispense</div>`,
    '#10b981'
  ),
};

function getScreenMockup(key) {
  return SCREENS[key] || '';
}

module.exports = { getScreenMockup, SCREENS };
