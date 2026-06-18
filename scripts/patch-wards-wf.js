'use strict';
const fs = require('fs');
const p = require('path').join(__dirname, '..', 'views', 'wards.ejs');
let c = fs.readFileSync(p, 'utf8');
const start = c.indexOf('      <% var stations = [');
const end = c.indexOf('<! - Stats Row - >');
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}
const replacement = `    <%
    var wfSteps = [
      {n:1,  icon:'📋', label:'Doctor\\nAdmit Order',       role:'Doctor',      color:'#1e40af'},
      {n:2,  icon:'💳', label:'Cashier\\nDeposit',          role:'Cashier',     color:'#059669'},
      {n:3,  icon:'🛏️', label:'ADT\\nBed Assign',           role:'ADT / Nurse', color:'#d97706'},
      {n:4,  icon:'🩺', label:'Nurse\\nBaseline Vitals',    role:'Nurse',       color:'#7c3aed'},
      {n:5,  icon:'💉', label:'Doctor\\nWard Rounds',       role:'Doctor',      color:'#6366f1'},
      {n:6,  icon:'🔬', label:'Lab\\nTests',                role:'Lab Tech',    color:'#0891b2'},
      {n:7,  icon:'💊', label:'Pharmacy\\nDispense',        role:'Pharmacist',  color:'#be185d'},
      {n:8,  icon:'📋', label:'Doctor\\nClinical DC',       role:'Doctor',      color:'#1e40af'},
      {n:9,  icon:'💳', label:'Cashier\\nFinancial DC',     role:'Cashier',     color:'#059669'},
      {n:10, icon:'✅', label:'ADT\\nBed Released',         role:'ADT',         color:'#64748b'}
    ];
    wfSteps.forEach(function(s,i){ %>
      <div class="opd-wf-step-wrap" role="listitem">
        <div class="opd-wf-step">
          <span class="opd-wf-num" style="background:<%=s.color%>;" title="Station <%=s.n%>"><%=s.n%></span>
          <span class="opd-wf-icon" style="background:<%=s.color%>18;border:2px solid <%=s.color%>;" aria-hidden="true"><%=s.icon%></span>
          <span class="opd-wf-label"><%=s.label%></span>
          <span class="opd-wf-role"><%=s.role%></span>
        </div>
        <% if(i < wfSteps.length - 1){ %>
        <span class="opd-wf-arrow" aria-hidden="true"><i class="fa fa-long-arrow-right"></i></span>
        <% } %>
      </div>
    <% }); %>
    </div>
    <div class="mt-3 pt-3" style="border-top:1px dashed #cbd5e1;">
      <p class="opd-wf-footnote mb-0">
        <strong style="color:#1e40af;">Station 1 — Admit order:</strong>
        Doctor creates the admission → <strong>Station 2 (Cashier deposit)</strong> before bed assignment
        &nbsp;|&nbsp;
        <strong>Station 3 (ADT)</strong> assigns ward &amp; bed → nursing baseline, ward rounds, orders, then
        <strong>Stations 8–10</strong> clinical discharge → financial settlement → bed released.
      </p>
    </div>
  </div>
</div>

<!-- Stats Row -->
`;
const rep = replacement.replace(/<motion /g, '<motion ').replace(/<\/motion>/g, '</motion>');
const rep2 = rep.replace(/<motion /g, '<div ').replace(/<\/motion>/g, '</div>');
c = c.slice(0, start) + rep2 + c.slice(end);
fs.writeFileSync(p, c);
console.log('patched wards.ejs workflow');
