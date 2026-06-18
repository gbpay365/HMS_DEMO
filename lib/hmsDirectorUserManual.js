'use strict';

const { esc, coverPage, wrapPremiumDoc, section, brand, PREMIUM_CSS } = require('./hmsPremiumDocsTheme');

const DIRECTOR_EXTRA_CSS = `
:root[data-doc="director-manual"] {
  --accent: #714b67;
  --accent-light: #f3e8ff;
  --doc-plum: #714b67;
  --doc-purple: #5b21b6;
  --doc-slate: #0f172a;
  --doc-cyan: #0891b2;
  --doc-violet: #7c3aed;
  --doc-blue: #1e40af;
  --doc-emerald: #059669;
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
.freq-strip { display: flex; flex-wrap: wrap; gap: 2mm; margin: 4mm 0; }
.freq-chip {
  flex: 1 1 24mm; min-width: 20mm; text-align: center; border-radius: 4px;
  padding: 2.5mm 2mm; font-size: 7.5pt; font-weight: 600; color: white; break-inside: avoid;
}
.freq-chip.daily { background: linear-gradient(135deg, #0891b2, #0e7490); }
.freq-chip.weekly { background: linear-gradient(135deg, #7c3aed, #6d28d9); }
.freq-chip.monthly { background: linear-gradient(135deg, #1e40af, #1d4ed8); }
.freq-chip.financial { background: linear-gradient(135deg, #059669, #047857); }
.freq-chip .sub { display: block; font-size: 6.5pt; font-weight: 400; opacity: 0.9; margin-top: 0.5mm; }
.screen {
  border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  margin: 4mm 0 5mm; break-inside: avoid; box-shadow: 0 1px 4px rgba(91,33,182,0.1);
}
.screen-bar {
  background: linear-gradient(90deg, #5b21b6, #714b67);
  color: rgba(255,255,255,0.92); padding: 2mm 3mm; font-size: 8pt;
  display: flex; align-items: center; gap: 2mm;
}
.screen-bar .dot { width: 2.5mm; height: 2.5mm; border-radius: 50%; background: #c4b5fd; }
.screen-bar .dot:nth-child(2) { background: #fcd34d; }
.screen-bar .dot:nth-child(3) { background: #86efac; }
.screen-body { background: #faf5ff; padding: 4mm; }
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
  width: 5mm; height: 5mm; border-radius: 50%; background: var(--doc-purple);
  color: white; font-size: 7pt; font-weight: 700; text-align: center; line-height: 5mm;
}
.perm-pill {
  display: inline-block; font-size: 7pt; font-family: ui-monospace, monospace;
  background: #f1f5f9; padding: 0.5mm 2mm; border-radius: 2px; margin: 0.5mm;
}
.hero-img { width: 100%; max-height: 45mm; object-fit: cover; border-radius: 4px; margin: 3mm 0; }
.kpi-mock {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin: 3mm 0; font-size: 7pt;
}
.kpi-mock span {
  background: white; border-radius: 4px; padding: 2mm; border-left: 3px solid var(--doc-purple);
  text-align: center;
}
.kpi-mock strong { display: block; font-size: 9pt; color: var(--doc-slate); }
.tab-mock {
  display: flex; flex-wrap: wrap; gap: 1.5mm; margin: 2mm 0 3mm;
}
.tab-mock span {
  font-size: 7pt; font-weight: 700; padding: 1mm 2.5mm; border-radius: 99px;
  background: white; border: 1px solid #e2e8f0; color: #64748b;
}
.tab-mock span.on { background: #0f172a; color: white; border-color: #0f172a; }
.tile-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin: 3mm 0; font-size: 7.5pt; text-align: center;
}
.tile-grid span {
  background: white; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2mm 1mm;
}
.domain-grid {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 2mm; margin: 3mm 0; font-size: 7pt; text-align: center;
}
.domain-grid span { border-radius: 4px; padding: 2mm 1mm; color: white; font-weight: 600; }
`;

function buildDirectorUsersManualHtml() {
  const b = brand;
  const body = `
<style>${PREMIUM_CSS}${DIRECTOR_EXTRA_CSS}</style>
${coverPage({
  docLabel: 'Hospital Director User Manual',
  title: 'Hospital Director Module',
  subtitle: 'Executive guide — daily dashboards, weekly performance, monthly P&L, annual scorecards, live management reports, financial unit economics, and governance workflows.',
  badge: 'Premium · Professional Edition',
  variant: 'director-manual',
})}
<div class="doc-body">

<h2 class="section" id="introduction">Introduction</h2>
<p>Welcome to the <strong>${esc(b.productName)} Hospital Director User Manual</strong>. The Director module is the executive intelligence layer of your hospital — aggregating live operational, clinical, financial, and workforce data into dashboards and reports designed for governance, strategic planning, and day-to-day leadership decisions.</p>
<div class="tip"><strong>Director Portal:</strong> Your executive home at <code>/portal/hub/director</code> — daily dashboard, weekly report, monthly P&amp;L, annual scorecard, and quick links to management reports and analytics.</div>

<div class="kpi-row">
  <div class="kpi"><strong>Daily</strong><span>Operational pulse</span></div>
  <div class="kpi"><strong>Weekly</strong><span>Trend monitoring</span></div>
  <div class="kpi"><strong>Monthly</strong><span>Strategic P&amp;L</span></div>
  <div class="kpi"><strong>Annual</strong><span>Scorecard</span></div>
</div>

<img class="hero-img" src="public/call-queue/photos/ipd.jpg" alt="Hospital executive overview" />

<div class="toc">
<strong>Table of contents</strong>
<ol>
<li><a href="#overview">Director overview &amp; roles</a></li>
<li><a href="#portal">Director portal hub</a></li>
<li><a href="#daily">Daily dashboard</a></li>
<li><a href="#weekly">Weekly performance report</a></li>
<li><a href="#monthly">Monthly P&amp;L report</a></li>
<li><a href="#annual">Annual performance scorecard</a></li>
<li><a href="#mgmt-reports">Live management reports</a></li>
<li><a href="#daily-reports">Daily report cards</a></li>
<li><a href="#weekly-reports">Weekly report cards</a></li>
<li><a href="#monthly-reports">Monthly report cards</a></li>
<li><a href="#financial">Financial reports &amp; unit economics</a></li>
<li><a href="#permissions">Permissions &amp; access control</a></li>
<li><a href="#print">Print &amp; export</a></li>
<li><a href="#assistant">Assistant Director portal</a></li>
<li><a href="#secretary">Secretary portal</a></li>
<li><a href="#workflows">Executive decision workflows</a></li>
<li><a href="#integration">Module integration</a></li>
<li><a href="#screens">Screen reference</a></li>
<li><a href="#troubleshooting">Troubleshooting</a></li>
<li><a href="#glossary">Glossary</a></li>
</ol>
</div>

${section('overview', '1. Director Overview & Roles', `
<p>The Hospital Director module serves executive leadership and their support staff. Access is permission-driven — no widget or report appears unless explicitly granted in Access Control.</p>

<div class="role-grid">
  <div class="role-card" style="background:#faf5ff;border-color:#e9d5ff">
    <div class="icon">👔</div>
    <strong>Hospital Director / CEO</strong>
    <span>Full executive suite — all dashboards, management reports, and strategic scorecards at <code>/portal/hub/director</code>.</span>
  </div>
  <div class="role-card" style="background:#eff6ff;border-color:#bfdbfe">
    <div class="icon">🩺</div>
    <strong>Medical Director</strong>
    <span>Clinical quality focus — daily census, ER flow, clinical alerts, morbidity/mortality, infection control reports.</span>
  </div>
  <div class="role-card" style="background:#f0fdf4;border-color:#bbf7d0">
    <div class="icon">📊</div>
    <strong>Finance Director / CFO</strong>
    <span>Financial tab, monthly P&amp;L, unit economics (pharmacy, lab, radiology, theatre, IPD), AR ageing.</span>
  </div>
  <div class="role-card" style="background:#fff7ed;border-color:#fed7aa">
    <div class="icon">🤝</div>
    <strong>Assistant Director</strong>
    <span>Operational oversight at <code>/portal/hub/assistant-director</code> — beds, flow, revenue, alerts (subset of director suite).</span>
  </div>
  <div class="role-card" style="background:#f5f3ff;border-color:#ddd6fe">
    <div class="icon">📋</div>
    <strong>Director's Secretary</strong>
    <span>Executive support at <code>/portal/hub/secretary</code> — calendar, briefings, management reports (read), correspondence.</span>
  </div>
  <div class="role-card" style="background:#ecfeff;border-color:#a5f3fc">
    <div class="icon">🔐</div>
    <strong>System Administrator</strong>
    <span>Configures permissions at <code>/hms-admin/access</code> — grants report sections, KPIs, panels per role.</span>
  </div>
</div>

<h3>Key routes</h3>
<table class="data">
<tr><th>Screen</th><th>Route</th><th>Purpose</th></tr>
<tr><td>Director portal</td><td><code>/portal/hub/director</code></td><td>Executive hub with report tabs</td></tr>
<tr><td>Management reports</td><td><code>/management-reports</code></td><td>Live catalogued report cards (Daily / Weekly / Monthly / Financial)</td></tr>
<tr><td>Reports hub</td><td><code>/hms-reports</code></td><td>Central reports navigation</td></tr>
<tr><td>Print / PDF</td><td><code>/management-reports/print</code></td><td>Print current tab or full suite</td></tr>
<tr><td>Assistant Director</td><td><code>/portal/hub/assistant-director</code></td><td>Deputy operational dashboard</td></tr>
<tr><td>Secretary</td><td><code>/portal/hub/secretary</code></td><td>Executive assistant workspace</td></tr>
<tr><td>Access control</td><td><code>/hms-admin/access</code></td><td>Grant report &amp; dashboard permissions</td></tr>
</table>

<div class="freq-strip">
  <div class="freq-chip daily">Daily<span class="sub">Operational pulse</span></div>
  <div class="freq-chip weekly">Weekly<span class="sub">Trend monitoring</span></div>
  <div class="freq-chip monthly">Monthly<span class="sub">Strategic overview</span></div>
  <div class="freq-chip financial">Financial<span class="sub">Unit economics</span></div>
</div>
`)}

${section('portal', '2. Director Portal Hub', `
<p>The Director Portal is the landing page for hospital executives. It hosts the React-powered <strong>DirectorPortalShell</strong> with tabbed access to daily, weekly, monthly, and annual views — each visible only when the user's role has the corresponding permission.</p>

<div class="screen">
<div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Director Portal — /portal/hub/director</div>
<div class="screen-body">
<div class="tab-mock">
<span class="on">Daily dashboard</span><span>Weekly report</span><span>Monthly P&amp;L</span><span>Annual scorecard</span>
</div>
<div class="kpi-mock">
<span><strong>847</strong>Patients today</span>
<span><strong>78%</strong>Bed occupancy</span>
<span><strong>42 min</strong>ER avg wait</span>
<span><strong>2.4M</strong>Revenue today</span>
</div>
<p style="font-size:8pt;color:#64748b;margin:0">Overview · Bed map · Patient flow · Staff roster · Revenue · Alerts</p>
</div>
</div>

<h3>Portal navigation</h3>
<ol class="step-row">
<li>Sign in with a director-enabled role — home portal routes to <code>/portal/hub/director</code>.</li>
<li>Use the <strong>Director reports</strong> tab bar to switch between Daily, Weekly, Monthly, and Annual views.</li>
<li>URL parameter <code>?report=weekly</code> deep-links to a specific report (e.g. share with board members).</li>
<li>Sidebar tile <strong>Management Reports</strong> opens the full live report catalog at <code>/management-reports</code>.</li>
<li>Top navigation <strong>Operations → Management Reports</strong> provides the same entry when sidebar is collapsed.</li>
</ol>

<h3>Portal tiles (typical)</h3>
<div class="tile-grid">
<span>📊 Daily dashboard</span><span>📈 Management reports</span><span>🏥 Ward board</span><span>💰 Financials</span>
<span>👥 Staff directory</span><span>📅 Appointments</span><span>🔔 Alerts</span><span>📋 Reports hub</span>
</div>

<div class="note">Portal tiles are configurable in Access Control under the <strong>director</strong> portal catalogue. Administrators can add, reorder, or hide tiles per deployment.</div>
`)}

${section('daily', '3. Daily Dashboard', `
<p>The <strong>Daily Dashboard</strong> provides real-time operational intelligence — patient volume, bed occupancy, ER wait times, revenue collection, staff on duty, and critical alerts. Data refreshes from live hospital transactions.</p>

<h3>Dashboard tabs</h3>
<table class="data">
<tr><th>Tab</th><th>Permission</th><th>Content</th></tr>
<tr><td>Overview</td><td><span class="perm-pill">director.dashboard.tab.overview</span></td><td>KPI strip, patient flow chart, revenue breakdown, critical alerts</td></tr>
<tr><td>Bed map</td><td><span class="perm-pill">director.dashboard.tab.beds</span></td><td>Ward-by-ward bed occupancy grid</td></tr>
<tr><td>Patient flow</td><td><span class="perm-pill">director.dashboard.tab.flow</span></td><td>Admissions, discharges, net inpatients</td></tr>
<tr><td>Staff roster</td><td><span class="perm-pill">director.dashboard.tab.staff</span></td><td>On-duty staff attendance snapshot</td></tr>
<tr><td>Revenue</td><td><span class="perm-pill">director.dashboard.tab.revenue</span></td><td>Collected vs. billed, collection rate</td></tr>
<tr><td>Alerts</td><td><span class="perm-pill">director.dashboard.tab.alerts</span></td><td>Lab/radiology delays, pharmacy stock alerts</td></tr>
</table>

<h3>Key KPIs (Overview)</h3>
<table class="data">
<tr><th>KPI</th><th>What it measures</th></tr>
<tr><td>Patients today</td><td>Total OPD + ER + IPD encounters for the current day</td></tr>
<tr><td>Bed occupancy</td><td>Occupied beds ÷ total operational beds (%)</td></tr>
<tr><td>ER average wait</td><td>Mean time from triage to doctor consultation</td></tr>
<tr><td>Revenue today</td><td>Cash and insurance collections posted today</td></tr>
<tr><td>Staff on duty</td><td>Clinical and support staff currently clocked in</td></tr>
<tr><td>Pending lab results</td><td>Orders awaiting finalization beyond SLA threshold</td></tr>
</table>

<h3>Panels</h3>
<ul>
<li><strong>Patient flow</strong> — hourly admission/discharge trend</li>
<li><strong>Revenue by category</strong> — OPD, IPD, pharmacy, diagnostics breakdown</li>
<li><strong>Critical alerts</strong> — deaths, ICU census, incident flags</li>
<li><strong>Ward bed occupancy</strong> — colour-coded bed grid per ward</li>
<li><strong>Staff attendance</strong> — roster vs. scheduled</li>
<li><strong>Lab &amp; radiology alerts</strong> — overdue results, equipment issues</li>
<li><strong>Pharmacy stock alerts</strong> — low stock, expiry warnings</li>
</ul>

<div class="tip"><strong>Morning briefing:</strong> Open the Daily Dashboard before stand-up meetings. Cross-check KPIs with the Daily tab in Management Reports for narrative detail on census, theatre, and clinical alerts.</div>
`)}

${section('weekly', '4. Weekly Performance Report', `
<p>The <strong>Weekly Performance Report</strong> shifts from same-day pulse to seven-day trends — patient volume, occupancy, average length of stay (ALOS), revenue, ER wait, safety incidents, and supply chain digest.</p>

<h3>Weekly KPIs</h3>
<table class="data">
<tr><th>KPI</th><th>Description</th></tr>
<tr><td>Total patients</td><td>Aggregate encounters for the rolling 7-day period</td></tr>
<tr><td>Avg bed occupancy</td><td>Mean ward occupancy across the week</td></tr>
<tr><td>Avg ALOS</td><td>Average length of stay — days from admission to discharge</td></tr>
<tr><td>Weekly revenue</td><td>Total billed and collected for the week</td></tr>
<tr><td>Avg ER wait</td><td>Seven-day mean ER waiting time</td></tr>
<tr><td>Safety incidents</td><td>Reported incidents and near-misses</td></tr>
</table>

<h3>Weekly panels</h3>
<ul>
<li><strong>Patient volume</strong> — daily bar chart for the week</li>
<li><strong>Bed occupancy trend</strong> — line chart vs. prior week</li>
<li><strong>Revenue — billed vs. collected</strong> — daily comparison</li>
<li><strong>ALOS by department</strong> — specialty breakdown</li>
<li><strong>Doctor performance</strong> — consultations and throughput</li>
<li><strong>Safety incidents</strong> — incident log summary</li>
<li><strong>Supply chain digest</strong> — reorder alerts, PO status</li>
</ul>

<div class="screen">
<div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Weekly Performance Report</div>
<div class="screen-body">
<div class="kpi-mock">
<span><strong>4,218</strong>Total patients</span>
<span><strong>74%</strong>Avg occupancy</span>
<span><strong>3.2d</strong>Avg ALOS</span>
<span><strong>18.6M</strong>Weekly revenue</span>
</div>
<p style="font-size:8pt;margin:0">Patient volume · Occupancy trend · Revenue chart · ALOS · Doctor perf · Incidents · Supply digest</p>
</div>
</div>
`)}

${section('monthly', '5. Monthly P&amp;L Report', `
<p>The <strong>Monthly P&amp;L Report</strong> presents financial performance for governance — revenue, gross profit, EBITDA, payroll costs, department P&amp;L, expense vs. budget charts, and insurance claims ageing.</p>

<h3>Monthly KPIs</h3>
<table class="data">
<tr><th>KPI</th><th>Description</th></tr>
<tr><td>Total revenue</td><td>All revenue streams for the calendar month</td></tr>
<tr><td>Gross profit</td><td>Revenue minus direct cost of services</td></tr>
<tr><td>Gross margin</td><td>Gross profit as percentage of revenue</td></tr>
<tr><td>EBITDA</td><td>Earnings before interest, taxes, depreciation, amortization</td></tr>
<tr><td>EBITDA margin</td><td>EBITDA as percentage of revenue</td></tr>
<tr><td>Payroll cost</td><td>Total staff compensation for the month</td></tr>
</table>

<h3>Monthly panels</h3>
<ul>
<li><strong>P&amp;L statement</strong> — line-by-line income statement summary</li>
<li><strong>Revenue by source</strong> — OPD, IPD, diagnostics, pharmacy, theatre</li>
<li><strong>6-month revenue trend</strong> — rolling half-year chart</li>
<li><strong>Expenses vs. budget</strong> — variance analysis by category</li>
<li><strong>Department P&amp;L</strong> — profit contribution by clinical department</li>
<li><strong>Payroll by department</strong> — staffing cost distribution</li>
<li><strong>Insurance claims aging</strong> — 30 / 60 / 90-day outstanding claims</li>
</ul>

<div class="note">Monthly figures integrate with the Finance module. Accountants post journal entries; director dashboards reflect posted GL data. Unposted transactions may not appear until synchronized.</div>
`)}

${section('annual', '6. Annual Performance Scorecard', `
<p>The <strong>Annual Scorecard</strong> provides a board-ready view of hospital performance across five strategic domains, with multi-year trend analysis and domain radar visualization.</p>

<div class="domain-grid">
<span style="background:#1B5FA8">Clinical quality</span>
<span style="background:#1A7A55">Financial health</span>
<span style="background:#7B3FA0">Patient experience</span>
<span style="background:#B05C0A">Workforce</span>
<span style="background:#B81C1C">Safety &amp; compliance</span>
</div>

<h3>Scorecard panels</h3>
<ul>
<li><strong>Overall performance</strong> — hero summary with composite score</li>
<li><strong>Domain radar</strong> — pentagonal radar chart across five domains</li>
<li><strong>5-year performance</strong> — longitudinal trend for strategic planning</li>
</ul>

<p>Each domain has granular ACL permissions (<code>director.annual.domain.*</code>) so boards can share clinical quality without exposing financial detail, or vice versa.</p>

<div class="tip">Use the annual scorecard for board meetings, donor reports, and ministry submissions. Export via Print from Management Reports or portal browser print for PDF archival.</div>
`)}

${section('mgmt-reports', '7. Live Management Reports', `
<p><code>/management-reports</code> is the comprehensive live report suite — organized into four frequency tabs with colour-coded themes. Each tab contains report <strong>cards</strong> with bullet-point metrics loaded from live hospital data.</p>

<div class="screen">
<div class="screen-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Live Management Reports — /management-reports</div>
<div class="screen-body">
<div class="freq-strip" style="margin:0 0 3mm">
<div class="freq-chip daily" style="flex:1">Daily</div>
<div class="freq-chip weekly" style="flex:1;opacity:0.85">Weekly</div>
<div class="freq-chip monthly" style="flex:1;opacity:0.85">Monthly</div>
<div class="freq-chip financial" style="flex:1;opacity:0.85">Financial</div>
</div>
<p style="font-size:8pt;margin:0">Patient census · OPD &amp; emergency · Theatre · Clinical alerts · Pharmacy · Daily revenue</p>
</div>
</div>

<h3>Report sections</h3>
<table class="data">
<tr><th>Tab</th><th>Permission</th><th>Theme</th><th>Focus</th></tr>
<tr><td>Daily</td><td><span class="perm-pill">hms_reports.daily</span></td><td>Cyan</td><td>Operational pulse — census, ER, theatre, alerts</td></tr>
<tr><td>Weekly</td><td><span class="perm-pill">hms_reports.weekly</span></td><td>Violet</td><td>Trend monitoring — flow, HR, quality, supply</td></tr>
<tr><td>Monthly</td><td><span class="perm-pill">hms_reports.monthly</span></td><td>Blue</td><td>Strategic overview — clinical perf, P&amp;L, satisfaction</td></tr>
<tr><td>Financial</td><td><span class="perm-pill">hms_reports.financial</span></td><td>Emerald</td><td>Transactions &amp; unit economics</td></tr>
</table>

<h3>Using management reports</h3>
<ol class="step-row">
<li>Open <code>/management-reports</code> from sidebar, portal tile, or reports hub.</li>
<li>Select a frequency tab — only tabs granted to your role appear.</li>
<li>Review report cards — each card lists live metrics as bullet points.</li>
<li>Check the <strong>generated at</strong> timestamp and report reference in the header.</li>
<li>Click <strong>Refresh</strong> to reload live figures from the database.</li>
<li>Use <strong>Print tab</strong> or <strong>Full PDF</strong> for board packs (see Print section).</li>
</ol>

<h3>Core permissions</h3>
<table class="data">
<tr><th>Permission</th><th>Grants</th></tr>
<tr><td><span class="perm-pill">hms_reports.read</span></td><td>Open module (any granted section)</td></tr>
<tr><td><span class="perm-pill">hms_reports.full</span></td><td>Full director suite — all sections and cards</td></tr>
<tr><td><span class="perm-pill">hms_reports.daily</span></td><td>Entire Daily tab</td></tr>
<tr><td><span class="perm-pill">hms_reports.weekly</span></td><td>Entire Weekly tab</td></tr>
<tr><td><span class="perm-pill">hms_reports.monthly</span></td><td>Entire Monthly tab</td></tr>
<tr><td><span class="perm-pill">hms_reports.financial</span></td><td>Entire Financial tab</td></tr>
</table>

<div class="warning">If you see <strong>No reports assigned</strong>, your role lacks management report permissions. Contact an administrator to grant <code>hms_reports.read</code> plus the relevant section permissions.</div>
`)}

${section('daily-reports', '8. Daily Report Cards', `
<p>The Daily tab covers same-day operational metrics across six report cards:</p>

<table class="data">
<tr><th>Card</th><th>Key metrics</th></tr>
<tr><td>Patient census</td><td>Admissions, discharges, inpatient count by ward, bed occupancy %, pending admissions, transfers</td></tr>
<tr><td>OPD &amp; emergency</td><td>Outpatient visits, ER cases, average wait time, walk-ins vs. appointments, referrals</td></tr>
<tr><td>Theatre &amp; procedures</td><td>Surgeries scheduled vs. done, utilisation rate, cancellations, turnaround time</td></tr>
<tr><td>Clinical alerts</td><td>Deaths, ICU/HDU census, critical lab values, incidents, infection alerts (HAI)</td></tr>
<tr><td>Pharmacy</td><td>Prescriptions dispensed, stock alerts, high-value consumption, returns/waste</td></tr>
<tr><td>Daily revenue snapshot</td><td>Cash collections, insurance billing, outstanding balances, pending discharge invoices</td></tr>
</table>

<p>Individual cards can be granted separately (e.g. <code>hms_reports.daily.census</code>) for department heads who need census without financial detail.</p>
`)}

${section('weekly-reports', '9. Weekly Report Cards', `
<p>The Weekly tab monitors seven-day trends across six domains:</p>

<table class="data">
<tr><th>Card</th><th>Key metrics</th></tr>
<tr><td>Patient flow trends</td><td>Weekly admissions vs. prior week, ALOS, 7-day readmission rate, specialty distribution</td></tr>
<tr><td>HR &amp; staffing</td><td>Attendance, absenteeism, overtime, on-call gaps, locum usage, pending leave</td></tr>
<tr><td>Lab &amp; radiology</td><td>Tests ordered vs. completed, TAT, critical results, equipment downtime</td></tr>
<tr><td>Quality &amp; safety</td><td>Complaints, incident summary, pressure ulcers/falls, hand hygiene compliance</td></tr>
<tr><td>Supply &amp; inventory</td><td>Consumption vs. budget, reorder levels, POs raised/pending, expired items</td></tr>
<tr><td>Weekly financial</td><td>Revenue by department, insurance claims submitted, collections vs. target, top debtors</td></tr>
</table>
`)}

${section('monthly-reports', '10. Monthly Report Cards', `
<p>The Monthly tab supports strategic governance with six report cards:</p>

<table class="data">
<tr><th>Card</th><th>Key metrics</th></tr>
<tr><td>Clinical performance</td><td>Morbidity/mortality, top 10 ICD diagnoses, surgical outcomes, ALOS vs. benchmark, 30-day readmissions</td></tr>
<tr><td>Departmental activity</td><td>OPD visits per doctor, procedures per specialty, theatre utilisation, referral in/out, no-show rate</td></tr>
<tr><td>P&amp;L summary</td><td>Revenue vs. budget, operating expenses, net surplus, cost per patient day, revenue per bed</td></tr>
<tr><td>Patient satisfaction</td><td>CSAT/NPS scores, complaint resolution, feedback by department, waiting time satisfaction</td></tr>
<tr><td>Infection control</td><td>HAI rates by ward, antibiotic consumption (DDD), AMR alerts, sterilisation compliance</td></tr>
<tr><td>Assets &amp; maintenance</td><td>Equipment downtime, preventive maintenance, capex vs. plan, repair requests</td></tr>
</table>
`)}

${section('financial', '11. Financial Reports & Unit Economics', `
<p>The Financial tab provides transaction-level and unit-level economics for executive financial oversight.</p>

<h3>Financial report rows</h3>
<table class="data">
<tr><th>Report</th><th>Frequency</th><th>Content</th></tr>
<tr><td>Daily transaction summary</td><td>Daily</td><td>Cash, card/mobile, insurance claims, refunds, collections vs. target</td></tr>
<tr><td>Daily expense log</td><td>Daily</td><td>Petty cash, utilities, consumables, emergency purchases</td></tr>
<tr><td>Weekly transaction report</td><td>Weekly</td><td>Revenue by payer, outstanding invoices, reconciliation, collections trend</td></tr>
<tr><td>Weekly procurement</td><td>Weekly</td><td>POs issued, goods received, supplier payments, pending LPOs</td></tr>
<tr><td>Monthly P&amp;L</td><td>Monthly</td><td>Revenue vs. budget, operating costs, EBITDA, net surplus, cost per patient</td></tr>
<tr><td>Monthly expenses</td><td>Monthly</td><td>Salaries, utilities, maintenance, consumables, depreciation vs. budget</td></tr>
<tr><td>Monthly accounts receivable</td><td>Monthly</td><td>Debtor ageing (30/60/90 days), insurance claim status, bad debt provisioning</td></tr>
</table>

<h3>Unit economics (cost centres)</h3>
<table class="data">
<tr><th>Unit</th><th>Sales tracked</th><th>Purchases / costs</th></tr>
<tr><td>Pharmacy</td><td>Prescriptions, OTC, drug revenue by category</td><td>Drug purchases, supplier invoices, stock valuation, write-offs</td></tr>
<tr><td>Laboratory</td><td>Tests billed (cash &amp; insurance), revenue per test</td><td>Reagents, kits, equipment servicing</td></tr>
<tr><td>Radiology</td><td>X-ray, CT, MRI, ultrasound per modality</td><td>Films/contrast, equipment maintenance</td></tr>
<tr><td>Theatre</td><td>Surgical fees, anaesthesia billing</td><td>Consumables, sterile supplies, implants</td></tr>
<tr><td>IPD / Wards</td><td>Bed charges, nursing care, room revenue</td><td>Ward consumables, linen, medical gases</td></tr>
<tr><td>ICU / HDU</td><td>ICU daily charges, ventilator, monitoring fees</td><td>Specialised drugs, disposables, IV lines</td></tr>
<tr><td>Dietary</td><td>Patient meal billing, special diets</td><td>Food provisions, kitchen consumables</td></tr>
<tr><td>Emergency</td><td>A&amp;E consultation, resuscitation billing</td><td>Crash trolley restocking, emergency drugs</td></tr>
</table>

<div class="tip">Cross-reference Financial tab unit reports with the Finance module (<code>/financials</code>) for journal detail, trial balance, and OHADA-compliant statements.</div>
`)}

${section('permissions', '12. Permissions & Access Control', `
<p>Director module visibility is entirely permission-driven. Administrators configure access at <code>/hms-admin/access</code>.</p>

<h3>Permission layers</h3>
<table class="data">
<tr><th>Layer</th><th>Example permissions</th><th>Effect</th></tr>
<tr><td>Module entry</td><td><span class="perm-pill">hms_reports.read</span>, <span class="perm-pill">director.dashboard.read</span></td><td>Can open management reports or director portal</td></tr>
<tr><td>Full suite</td><td><span class="perm-pill">hms_reports.full</span></td><td>All tabs, cards, KPIs, and panels</td></tr>
<tr><td>Section tab</td><td><span class="perm-pill">hms_reports.daily</span></td><td>Entire Daily tab in management reports</td></tr>
<tr><td>Individual card</td><td><span class="perm-pill">hms_reports.daily.census</span></td><td>Single report card only</td></tr>
<tr><td>Dashboard tab</td><td><span class="perm-pill">director.dashboard.tab.revenue</span></td><td>Revenue tab on daily dashboard</td></tr>
<tr><td>KPI widget</td><td><span class="perm-pill">director.dashboard.kpi.beds</span></td><td>Bed occupancy KPI tile</td></tr>
<tr><td>Panel widget</td><td><span class="perm-pill">director.weekly.panel.doctor_perf</span></td><td>Doctor performance panel</td></tr>
</table>

<h3>Granting access — step by step</h3>
<ol class="step-row">
<li>Open <code>/hms-admin/access</code> and select the target role (e.g. Hospital Director, Assistant Director).</li>
<li>Under <strong>Permissions</strong>, enable <code>hms_reports.read</code> or <code>hms_reports.full</code>.</li>
<li>Grant section permissions (<code>hms_reports.daily</code>, etc.) or individual card permissions as needed.</li>
<li>Under <strong>UI visibility</strong>, enable director dashboard KPIs, panels, and tabs.</li>
<li>Assign the <strong>director</strong> portal as home portal under <strong>Role portals</strong>.</li>
<li>Save — user sees changes on next page load.</li>
</ol>

<h3>Role profiles</h3>
<p>Deployment bootstrap may auto-grant director permissions to roles matching <em>Hospital Director</em>, <em>CEO</em>, or <em>Medical Director</em> titles. Custom roles require manual ACL configuration.</p>
`)}

${section('print', '13. Print & Export', `
<p>Management reports support professional print and PDF export for board packs, ministry submissions, and archival.</p>

<h3>Print options</h3>
<table class="data">
<tr><th>Action</th><th>URL</th><th>Output</th></tr>
<tr><td>Print current tab</td><td><code>/management-reports/print?scope=tab&amp;tab=daily</code></td><td>Print-optimized view of active tab</td></tr>
<tr><td>Full PDF suite</td><td><code>/management-reports/print?scope=all</code></td><td>All granted sections in one document</td></tr>
</table>

<h3>Print workflow</h3>
<ol class="step-row">
<li>Navigate to <code>/management-reports</code> and select the desired tab.</li>
<li>Click <strong>Print tab</strong> in the hero actions bar — opens print view in new tab.</li>
<li>Use browser Print (Ctrl+P) → Save as PDF for archival.</li>
<li>For comprehensive packs, click <strong>Full PDF</strong> to include all granted sections.</li>
<li>Print CSS hides navigation, buttons, and screen chrome — only report content prints.</li>
</ol>

<p>Director portal React views can be printed from the browser when presenting daily/weekly/monthly dashboards in meetings.</p>
`)}

${section('assistant', '14. Assistant Director Portal', `
<p>The <strong>Assistant Director</strong> portal at <code>/portal/hub/assistant-director</code> provides operational oversight with a focused subset of director capabilities — ideal for deputy directors and clinical operations managers.</p>

<h3>Dashboard tabs</h3>
<table class="data">
<tr><th>Tab</th><th>Focus</th></tr>
<tr><td>Overview</td><td>Patients today, bed occupancy, ER wait, revenue, pending lab, patient flow, critical alerts</td></tr>
<tr><td>Bed map</td><td>Ward bed occupancy grid</td></tr>
<tr><td>Patient flow</td><td>Admissions and discharges today</td></tr>
<tr><td>Revenue</td><td>Collected today, collection rate</td></tr>
<tr><td>Reports</td><td>Lab alerts, pharmacy alerts digest</td></tr>
</table>

<h3>Portal tiles</h3>
<ul>
<li>Assistant dashboard (home)</li>
<li>Management reports — <code>/management-reports</code></li>
<li>Ward board — <code>/wards</code></li>
<li>OPD queue — <code>/opd-queue</code></li>
</ul>

<div class="note">Assistant Director permissions use the <code>assistant_director.*</code> namespace. Grant via Access Control without giving full <code>hms_reports.full</code> if financial detail should remain restricted.</div>
`)}

${section('secretary', '15. Secretary Portal', `
<p>The <strong>Director's Secretary</strong> portal at <code>/portal/hub/secretary</code> supports executive administration — calendar management, hospital briefings, correspondence, and read-only management reports.</p>

<h3>Dashboard tabs</h3>
<table class="data">
<tr><th>Tab</th><th>Content</th></tr>
<tr><td>Director briefing</td><td>Hospital pulse, OPD visits today, available reports, management report links</td></tr>
<tr><td>Calendar</td><td>Director schedule, appointments today, meetings to schedule</td></tr>
<tr><td>Correspondence</td><td>Correspondence queue, visitors &amp; calls log, staff directory</td></tr>
</table>

<h3>Portal tiles</h3>
<div class="tile-grid">
<span>📊 Secretary dashboard</span><span>📅 Director calendar</span><span>📈 Management reports</span><span>👔 Director portal</span>
<span>🔍 Patient lookup</span><span>👥 Staff directory</span><span>📋 OPD briefing</span><span>📞 Visitors</span>
</div>

<p>Secretary roles typically receive <code>secretary.reports.read</code> and <code>hms_reports.read</code> for read-only report access — sufficient to prepare briefing packs without editing clinical or financial data.</p>
`)}

${section('workflows', '16. Executive Decision Workflows', `
<h3>Morning operational review</h3>
<ol class="step-row">
<li>Open Director Portal → Daily dashboard.</li>
<li>Review bed occupancy and ER wait KPIs — escalate if thresholds exceeded.</li>
<li>Check Critical alerts panel — deaths, ICU census, incidents.</li>
<li>Switch to Management Reports Daily tab for narrative detail on census, theatre, pharmacy.</li>
<li>Share key figures in stand-up or secretary briefing pack.</li>
</ol>

<h3>Weekly leadership meeting</h3>
<ol class="step-row">
<li>Open Weekly Performance Report (portal tab or management reports Weekly tab).</li>
<li>Compare patient volume and occupancy vs. prior week.</li>
<li>Review HR staffing card — address absenteeism and overtime trends.</li>
<li>Discuss quality &amp; safety incidents and supply chain alerts.</li>
<li>Print weekly tab for meeting minutes attachment.</li>
</ol>

<h3>Monthly board pack</h3>
<ol class="step-row">
<li>Generate Monthly P&amp;L from director portal.</li>
<li>Export Management Reports monthly tab (Print → Full PDF).</li>
<li>Include clinical performance and patient satisfaction cards.</li>
<li>Cross-check with Finance module statements (<code>/financials</code>).</li>
<li>Present annual scorecard if quarter-end or year-end.</li>
</ol>

<h3>Capacity &amp; escalation triggers</h3>
<table class="data">
<tr><th>Signal</th><th>Typical threshold</th><th>Action</th></tr>
<tr><td>Bed occupancy</td><td>&gt; 90%</td><td>Review pending admissions, consider overflow wards</td></tr>
<tr><td>ER wait</td><td>&gt; 60 min average</td><td>Deploy additional doctor, review triage staffing</td></tr>
<tr><td>Pending lab</td><td>Spike vs. baseline</td><td>Escalate to lab supervisor, check equipment</td></tr>
<tr><td>Pharmacy stock alerts</td><td>Critical items</td><td>Approve emergency procurement</td></tr>
<tr><td>Collection rate</td><td>&lt; 80%</td><td>Finance review — billing gaps, insurance delays</td></tr>
</table>
`)}

${section('integration', '17. Module Integration', `
<p>Director dashboards aggregate data from across ${esc(b.productName)}. Understanding source modules helps interpret figures and trace discrepancies.</p>

<table class="data">
<tr><th>Source module</th><th>Data contributed</th><th>Director touchpoint</th></tr>
<tr><td>OPD / Front Desk</td><td>Visit counts, queue times, no-shows</td><td>Daily OPD card, patient flow KPIs</td></tr>
<tr><td>Emergency / A&amp;E</td><td>ER cases, triage wait, resuscitation billing</td><td>ER wait KPI, daily OPD &amp; emergency card</td></tr>
<tr><td>IPD / ADT</td><td>Admissions, discharges, bed occupancy, ALOS</td><td>Census card, bed map, flow panels</td></tr>
<tr><td>Cashier / Billing</td><td>Collections, receipts, outstanding balances</td><td>Revenue KPIs, daily revenue, financial tab</td></tr>
<tr><td>Pharmacy</td><td>Dispensing, stock levels, consumption</td><td>Pharmacy card, pharmacy alerts panel</td></tr>
<tr><td>Laboratory</td><td>Test volume, TAT, critical results</td><td>Lab card, pending lab KPI, lab alerts</td></tr>
<tr><td>Radiology</td><td>Imaging volume, report turnaround</td><td>Lab &amp; radiology weekly card</td></tr>
<tr><td>HR / Payroll</td><td>Attendance, leave, payroll costs</td><td>HR staffing card, monthly payroll panel</td></tr>
<tr><td>Finance / GL</td><td>Journal postings, P&amp;L, AR ageing</td><td>Monthly P&amp;L, financial tab, unit economics</td></tr>
<tr><td>Procurement</td><td>POs, goods received, supplier payments</td><td>Supply card, weekly procurement report</td></tr>
</table>

<p>Related manuals: <code>/docs/cashier-users-manual</code>, <code>/docs/ipd-users-manual</code>, <code>/docs/nursing-users-manual</code>, and the Comprehensive User Guide at <code>/docs/comprehensive-user-guide</code>.</p>
`)}

${section('screens', '18. Screen Reference', `
<table class="data">
<tr><th>Screen</th><th>Route</th><th>Primary users</th></tr>
<tr><td>Director portal hub</td><td><code>/portal/hub/director</code></td><td>CEO, Hospital Director, Medical Director</td></tr>
<tr><td>Director portal (weekly)</td><td><code>/portal/hub/director?report=weekly</code></td><td>Executive team</td></tr>
<tr><td>Director portal (monthly)</td><td><code>/portal/hub/director?report=monthly</code></td><td>Board, CFO</td></tr>
<tr><td>Director portal (annual)</td><td><code>/portal/hub/director?report=annual</code></td><td>Board, ministry reporting</td></tr>
<tr><td>Live management reports</td><td><code>/management-reports</code></td><td>All executive roles</td></tr>
<tr><td>Management reports (tab)</td><td><code>/management-reports?tab=financial</code></td><td>CFO, Finance Director</td></tr>
<tr><td>Print view</td><td><code>/management-reports/print?scope=all</code></td><td>Secretary, board prep</td></tr>
<tr><td>Reports hub</td><td><code>/hms-reports</code></td><td>Cross-module report navigation</td></tr>
<tr><td>Assistant Director portal</td><td><code>/portal/hub/assistant-director</code></td><td>Deputy directors</td></tr>
<tr><td>Secretary portal</td><td><code>/portal/hub/secretary</code></td><td>Director's secretary</td></tr>
<tr><td>Ward board (reference)</td><td><code>/wards</code></td><td>Bed capacity verification</td></tr>
<tr><td>Financial module</td><td><code>/financials</code></td><td>Detailed GL and statements</td></tr>
<tr><td>Access control</td><td><code>/hms-admin/access</code></td><td>Administrators</td></tr>
<tr><td>This manual</td><td><code>/docs/director-users-manual</code></td><td>All director module users</td></tr>
</table>
`)}

${section('troubleshooting', '19. Troubleshooting', `
<table class="data">
<tr><th>Issue</th><th>Likely cause</th><th>Resolution</th></tr>
<tr><td>No reports assigned</td><td>Role lacks <code>hms_reports.*</code> permissions</td><td>Administrator grants <code>hms_reports.read</code> plus section permissions in Access Control</td></tr>
<tr><td>Empty dashboard / missing KPIs</td><td>UI visibility not granted for KPI/panel codes</td><td>Enable <code>dir.kpi.*</code> and <code>dir.panel.*</code> under UI visibility for the role</td></tr>
<tr><td>Live figures could not be loaded</td><td>Database query error or missing schema</td><td>Check server logs; run migrations; contact IT support</td></tr>
<tr><td>Revenue mismatch vs. cashier</td><td>Timing — dashboard may use posted date vs. transaction date</td><td>Compare with <code>/billing</code> and Finance GL for reconciliation</td></tr>
<tr><td>Bed occupancy seems wrong</td><td>Beds not marked Available/Occupied on ward board</td><td>Verify ADT bed status at <code>/wards</code></td></tr>
<tr><td>Print shows blank sections</td><td>Tab not granted — print respects same ACL as screen</td><td>Grant section permission or use Full PDF with <code>hms_reports.full</code></td></tr>
<tr><td>Wrong portal on login</td><td>Home portal not assigned to director portal</td><td>Set <code>/portal/hub/director</code> as home under Role portals</td></tr>
<tr><td>Weekly/monthly tabs missing</td><td>Section permissions not granted</td><td>Grant <code>director.weekly.read</code>, <code>director.monthly.read</code>, or <code>hms_reports.weekly/monthly</code></td></tr>
</table>

<div class="tip">For persistent data issues, capture the report reference (<code>#</code> chip in management reports header) and generated-at timestamp when contacting support — this helps trace the live query batch.</div>
`)}

${section('glossary', '20. Glossary', `
<table class="data">
<tr><th>Term</th><th>Definition</th></tr>
<tr><td>ALOS</td><td>Average Length of Stay — mean days from admission to discharge</td></tr>
<tr><td>Bed occupancy</td><td>Percentage of operational beds currently occupied</td></tr>
<tr><td>Board pack</td><td>Compiled set of reports for governance meetings</td></tr>
<tr><td>Collection rate</td><td>Collected revenue ÷ billed revenue (%)</td></tr>
<tr><td>Cost centre / unit economics</td><td>Revenue and cost tracking per hospital department (pharmacy, lab, etc.)</td></tr>
<tr><td>EBITDA</td><td>Earnings Before Interest, Taxes, Depreciation, and Amortization</td></tr>
<tr><td>HAI</td><td>Healthcare-Associated Infection — nosocomial infection rate</td></tr>
<tr><td>KPI</td><td>Key Performance Indicator — headline metric on dashboards</td></tr>
<tr><td>Management reports</td><td>Live catalogued report suite at <code>/management-reports</code></td></tr>
<tr><td>P&amp;L</td><td>Profit and Loss statement — revenue minus expenses</td></tr>
<tr><td>Scorecard</td><td>Multi-domain performance summary (especially annual)</td></tr>
<tr><td>TAT</td><td>Turnaround Time — e.g. lab result from order to finalize</td></tr>
<tr><td>Unit economics</td><td>Sales vs. purchases analysis per clinical cost centre</td></tr>
<tr><td>AR ageing</td><td>Accounts Receivable analysed by days outstanding (30/60/90)</td></tr>
</table>
`)}

<p class="footer-note">© ${esc(new Date().getFullYear())} ${esc(b.name)} · Hospital Director Users Manual v2.0 · ${esc(b.facilityName || b.orgName)} · Confidential</p>
</div>`;

  return wrapPremiumDoc({
    title: `Hospital Director User Manual — ${b.productName}`,
    variant: 'director-manual',
    bodyHtml: body,
  });
}

module.exports = { buildDirectorUsersManualHtml, DIRECTOR_EXTRA_CSS };
