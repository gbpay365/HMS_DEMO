'use strict';
const fs = require('fs');
const path = require('path');
const V = path.join(__dirname, '../views');
const O = '<' + 'motion';
const C = '</' + 'motion>';

function fix(s) {
  return s.replace(/\{\{O\}\}/g, '<' + 'div').replace(/\{\{C\}\}/g, '</' + 'div>');
}

const files = {};
files['ipd-hospitalizations.ejs'] = fix(`<%- include('partials/header') %>
{{O}} class="page-wrapper">{{O}} class="content">
{{O}} class="d-flex justify-content-between mb-3 flex-wrap gap-2">
 {{O}}><a href="/ipd" class="small text-muted"><i class="fa fa-arrow-left"></i> IPD hub</a>
 <h4 class="font-weight-bold mb-0">Hospitalizations</h4>{{C}}
 {{O}} class="btn-group btn-group-sm">
  <a href="/ipd/hospitalizations?filter=active" class="btn btn-<%=filter==='active'?'primary':'outline-secondary'%>">Active</a>
  <a href="/ipd/hospitalizations?filter=completed" class="btn btn-<%=filter==='completed'?'primary':'outline-secondary'%>">Completed</a>
  <a href="/ipd/hospitalizations?filter=all" class="btn btn-<%=filter==='all'?'primary':'outline-secondary'%>">All</a>
 {{C}}{{C}}
{{O}} class="card border-0 shadow-sm" style="border-radius:14px;">{{O}} class="table-responsive">
<table class="table table-hover mb-0"><thead class="thead-light"><tr><th>Patient</th><th>Ward / bed</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>
<% if(!rows.length){ %><tr><td colspan="5" class="text-center text-muted py-4">No records.</td></tr><% } %>
<% rows.forEach(function(r){ %>
<tr><td class="font-weight-bold"><%=r.first_name%> <%=r.last_name%></td>
<td class="small"><%=r.ward_name||'—'%> <%=r.bed_label||''%></td>
<td class="small"><%=r.hospitalization_reason||'—'%></td>
<td><span class="badge badge-light border"><%=r.ipd_status%></span></td>
<td><a href="/ipd/hospitalization/<%=r.id%>" class="btn btn-sm btn-outline-primary">Open</a></td></tr>
<% }); %></tbody></table>{{C}}{{C}}
{{C}}{{C}}<%- include('partials/footer') %>
`);

files['ipd-death-registry.ejs'] = fix(`<%- include('partials/header') %>
{{O}} class="page-wrapper">{{O}} class="content">
{{O}} class="mb-3"><a href="/ipd" class="small text-muted">IPD hub</a><h4 class="font-weight-bold">Death registry</h4>{{C}}
{{O}} class="row">
 {{O}} class="col-lg-5 mb-4">{{O}} class="card shadow-sm p-3"><h6 class="font-weight-bold">Register death</h6>
 <form method="POST" action="/ipd/death-registry">
  <label class="small font-weight-bold">Admission</label>
  <select name="admission_id" class="form-control form-control-sm mb-2" required>
   <% activeAdmissions.forEach(function(a){ %><option value="<%=a.id%>"><%=a.first_name%> <%=a.last_name%> — <%=a.ward_name||'no bed'%></option><% }); %>
  </select>
  <label class="small font-weight-bold">Date of death</label>
  <input type="date" name="date_of_death" class="form-control form-control-sm mb-2" required>
  <label class="small font-weight-bold">Cause</label>
  <input type="text" name="cause_of_death" class="form-control form-control-sm mb-2">
  <label class="small font-weight-bold">Notes</label>
  <textarea name="notes" class="form-control form-control-sm mb-2" rows="2"></textarea>
  <button class="btn btn-danger btn-sm">Save record</button>
 </form>{{C}}{{C}}
 {{O}} class="col-lg-7 mb-4">{{O}} class="card shadow-sm">{{O}} class="table-responsive">
 <table class="table mb-0"><thead><tr><th>Patient</th><th>Date</th><th>Cause</th></tr></thead><tbody>
 <% rows.forEach(function(r){ %><tr><td><%=r.first_name%> <%=r.last_name%></td><td><%=r.date_of_death%></td><td class="small"><%=r.cause_of_death||'—'%></td></tr><% }); %>
 </tbody></table>{{C}}{{C}}{{C}}
{{C}}
{{C}}{{C}}<%- include('partials/footer') %>
`);

files['ipd-config.ejs'] = fix(`<%- include('partials/header') %>
{{O}} class="page-wrapper">{{O}} class="content">
{{O}} class="mb-3"><a href="/ipd" class="small text-muted">IPD hub</a><h4 class="font-weight-bold">IPD configuration</h4>{{C}}
<ul class="nav nav-tabs mb-3">
 <li class="nav-item"><a class="nav-link <%=section==='checklists'?'active':''%>" href="/ipd/config?section=checklists">Checklists</a></li>
 <li class="nav-item"><a class="nav-link <%=section==='surgery'?'active':''%>" href="/ipd/config?section=surgery">Surgery templates</a></li>
 <li class="nav-item"><a class="nav-link <%=section==='facilities'?'active':''%>" href="/ipd/config?section=facilities">Buildings &amp; OT</a></li>
 <li class="nav-item"><a class="nav-link <%=section==='careplans'?'active':''%>" href="/ipd/config?section=careplans">Care plans</a></li>
</ul>
<% if(section==='checklists'){ %>
{{O}} class="row"><div class="col-md-6">{{O}} class="card p-3 mb-3"><h6>Add checklist item</h6>
<form method="POST" action="/ipd/config/checklist">
<select name="checklist_type" class="form-control form-control-sm mb-2"><option value="admission">Admission</option><option value="pre_ward">Pre-ward</option><option value="pre_op">Pre-op</option></select>
<input name="label" class="form-control form-control-sm mb-2" placeholder="Label" required>
<input name="sort_order" type="number" class="form-control form-control-sm mb-2" value="0">
<button class="btn btn-primary btn-sm">Add</button></form>{{C}}{{C}}
{{O}} class="col-md-6">{{O}} class="card p-3"><ul class="list-group list-group-flush">
<% checklists.forEach(function(c){ %><li class="list-group-item small py-1"><span class="badge badge-secondary"><%=c.checklist_type%></span> <%=c.label%></li><% }); %>
</ul>{{C}}{{C}}{{C}}
<% } else if(section==='surgery'){ %>
{{O}} class="row"><div class="col-md-5"><form method="POST" action="/ipd/config/surgery-template" class="card p-3">
<input name="code" class="form-control form-control-sm mb-2" placeholder="Code">
<input name="name" class="form-control form-control-sm mb-2" placeholder="Name" required>
<input name="default_charge" type="number" class="form-control form-control-sm mb-2" placeholder="Default charge">
<button class="btn btn-primary btn-sm">Add template</button></form></div>
{{O}} class="col-md-7"><ul class="list-group"><% surgeryTpl.forEach(function(t){ %>
<li class="list-group-item d-flex justify-content-between"><span><%=t.code||''%> <%=t.name%></span><span><%=Number(t.default_charge).toLocaleString()%></span></li><% }); %></ul>{{C}}{{C}}
<% } else if(section==='facilities'){ %>
{{O}} class="row"><div class="col-md-6"><form method="POST" action="/ipd/config/building" class="card p-3 mb-3">
<input name="name" class="form-control form-control-sm mb-2" placeholder="Building name" required><button class="btn btn-sm btn-primary">Add building</button></form>
<form method="POST" action="/ipd/config/operation-theater" class="card p-3">
<input name="name" class="form-control form-control-sm mb-2" placeholder="OT name" required><button class="btn btn-sm btn-primary">Add OT</button></form></div>
{{O}} class="col-md-6"><h6>Buildings</h6><ul><% buildings.forEach(function(b){ %><li><%=b.name%></li><% }); %></ul>
<h6 class="mt-3">Operation theaters</h6><ul><% operationTheaters.forEach(function(ot){ %><li><%=ot.name%></li><% }); %></ul>{{C}}{{C}}
<% } else { %>
<form method="POST" action="/ipd/config/care-plan" class="card p-3 mb-3"><input name="name" class="form-control form-control-sm mb-2" placeholder="Care plan name" required><button class="btn btn-sm btn-primary">Add</button></form>
<ul><% carePlans.forEach(function(cp){ %><li><%=cp.name%></li><% }); %></ul>
<% } %>
{{C}}{{C}}<%- include('partials/footer') %>
`);

files['ipd-hospitalization-detail.ejs'] = fix(`<%- include('partials/header') %>
{{O}} class="page-wrapper">{{O}} class="content">
{{O}} class="card border-0 shadow mb-3" style="background:linear-gradient(135deg,#1e40af,#0c8b8b);color:#fff;border-radius:14px;">
{{O}} class="card-body py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
 {{O}}><a href="/ipd/hospitalizations" class="text-white-50 small">Hospitalizations</a>
 <h4 class="font-weight-bold mb-0 text-white"><%=adm.first_name%> <%=adm.last_name%></h4>
 <span class="small" style="opacity:.85;"><%=adm.ward_name||'Pending bed'%> <%=adm.bed_label||''%> · <%=adm.ipd_status%></span>{{C}}
 {{O}} class="text-right"><div class="h5 mb-0"><%=Number(forecast.forecast_total||0).toLocaleString()%> FCFA</div><div class="small" style="opacity:.8;">Invoice forecast</div>{{C}}
{{C}}{{C}}
<ul class="nav nav-pills mb-3">
 <li class="nav-item"><a class="nav-link <%=tab==='overview'?'active':''%>" href="?tab=overview">Overview</a></li>
 <li class="nav-item"><a class="nav-link <%=tab==='checklists'?'active':''%>" href="?tab=checklists">Checklists (<%=checklist.pct%>%)</a></li>
 <li class="nav-item"><a class="nav-link <%=tab==='surgery'?'active':''%>" href="?tab=surgery">Surgery</a></li>
 <li class="nav-item"><a class="nav-link <%=tab==='forecast'?'active':''%>" href="?tab=forecast">Invoice forecast</a></li>
 <li class="nav-item"><a href="/ipd/running-bill/<%=adm.id%>" class="nav-link">Running bill</a></li>
 <li class="nav-item"><a href="/ipd/medication" class="nav-link">Medication hub</a></li>
</ul>
<% if(tab==='overview'){ %>
{{O}} class="card p-3 shadow-sm"><form method="POST" action="/ipd/hospitalization/<%=adm.id%>/update">
{{O}} class="row">
<div class="col-md-6 mb-2"><label class="small font-weight-bold">Hospitalization reason</label><input name="hospitalization_reason" class="form-control form-control-sm" value="<%=adm.hospitalization_reason||''%>"></div>
<div class="col-md-3 mb-2"><label class="small font-weight-bold">Relative name</label><input name="relative_name" class="form-control form-control-sm" value="<%=adm.relative_name||''%>"></div>
<div class="col-md-3 mb-2"><label class="small font-weight-bold">Relative phone</label><input name="relative_phone" class="form-control form-control-sm" value="<%=adm.relative_phone||''%>"></div>
<div class="col-md-4 mb-2"><label class="small font-weight-bold">Primary surgeon</label><select name="primary_surgeon_id" class="form-control form-control-sm"><option value="">—</option><% employees.forEach(function(e){ %><option value="<%=e.id%>" <%=adm.primary_surgeon_id==e.id?'selected':''%>>Dr. <%=e.first_name%> <%=e.last_name%></option><% }); %></select></div>
<div class="col-md-4 mb-2"><label class="small font-weight-bold">Primary nurse</label><select name="primary_nurse_id" class="form-control form-control-sm"><option value="">—</option><% employees.forEach(function(e){ %><option value="<%=e.id%>" <%=adm.primary_nurse_id==e.id?'selected':''%>><%=e.first_name%> <%=e.last_name%></option><% }); %></select></div>
<div class="col-md-4 mb-2"><label class="small font-weight-bold">Care plan</label><select name="care_plan_template_id" class="form-control form-control-sm"><option value="">—</option><% carePlans.forEach(function(cp){ %><option value="<%=cp.id%>" <%=adm.care_plan_template_id==cp.id?'selected':''%>><%=cp.name%></option><% }); %></select></div>
<div class="col-12 mb-2"><label class="small font-weight-bold">Legal case notes</label><textarea name="legal_case_notes" class="form-control form-control-sm" rows="2"><%=adm.legal_case_notes||''%></textarea></div>
</div><button class="btn btn-primary btn-sm">Save</button></form>{{C}}
<% } else if(tab==='checklists'){ %>
{{O}} class="card p-3 shadow-sm"><p class="small text-muted">Completion: <strong><%=checklist.pct%>%</strong></p>
<% ['admission','pre_ward','pre_op'].forEach(function(typ){ var items=checklist.byType[typ]||[]; if(!items.length) return; %>
<h6 class="font-weight-bold text-uppercase small mt-2"><%=typ.replace('_',' ')%></h6>
<% items.forEach(function(it){ %>
<form method="POST" action="/ipd/hospitalization/<%=adm.id%>/checklist" class="d-flex align-items-center mb-1">
<input type="hidden" name="template_id" value="<%=it.template_id%>">
<input type="hidden" name="done" value="<%=it.completed_at?0:1%>">
<button type="submit" class="btn btn-sm <%=it.completed_at?'btn-success':'btn-outline-secondary'%> mr-2"><i class="fa fa-<%=it.completed_at?'check':'square-o'%>"></i></button>
<span class="small"><%=it.label%></span></form>
<% }); }); %></div>
<% } else if(tab==='surgery'){ %>
{{O}} class="row"><div class="col-md-5"><form method="POST" action="/ipd/hospitalization/<%=adm.id%>/surgery" class="card p-3">
<h6 class="font-weight-bold">Schedule surgery</h6>
<select name="template_id" class="form-control form-control-sm mb-2"><option value="">Custom</option><% surgeryTemplates.forEach(function(t){ %><option value="<%=t.id%>"><%=t.name%></option><% }); %></select>
<input name="title" class="form-control form-control-sm mb-2" placeholder="Title">
<input name="charge_amount" type="number" class="form-control form-control-sm mb-2" placeholder="Charge">
<select name="operation_theater_id" class="form-control form-control-sm mb-2"><option value="">OT</option><% operationTheaters.forEach(function(ot){ %><option value="<%=ot.id%>"><%=ot.name%></option><% }); %></select>
<button class="btn btn-primary btn-sm">Create</button></form></div>
{{O}} class="col-md-7"><ul class="list-group"><% surgeries.forEach(function(s){ %>
<li class="list-group-item d-flex justify-content-between"><span><%=s.title%> <span class="badge badge-light"><%=s.status%></span></span>
<% if(s.status!=='completed'){ %><form method="POST" action="/ipd/surgery/<%=s.id%>/complete"><button class="btn btn-xs btn-success">Complete</button></form><% } %>
</li><% }); %></ul>{{C}}{{C}}
<% } else { %>
{{O}} class="card p-3 shadow-sm"><h6>Invoice forecast</h6>
<table class="table table-sm"><tbody>
<% (forecast.lines||[]).forEach(function(l){ %><tr><td><%=l.description%></td><td class="text-right"><%=l.amount.toLocaleString()%></td></tr><% }); %>
<tr class="font-weight-bold"><td>Total forecast</td><td class="text-right"><%=Number(forecast.forecast_total||0).toLocaleString()%></td></tr>
<tr><td>Deposit paid</td><td class="text-right text-success">-<%=Number(forecast.deposit||0).toLocaleString()%></td></tr>
<tr><td>Balance due</td><td class="text-right text-danger"><%=Number(forecast.balance_due||0).toLocaleString()%></td></tr>
</tbody></table>
<a href="/cashier/ipd-settle" class="btn btn-sm btn-outline-success">Cashier settlement</a>{{C}}
<% } %>
{{C}}{{C}}<%- include('partials/footer') %>
`);

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(V, name), fix(content));
  console.log('wrote', name);
}

let hub = fs.readFileSync(path.join(V, 'ipd-hub.ejs'), 'utf8');
hub = hub.replace(/<\/motion>/g, '</' + 'div>').replace(/<motion/g, '<' + 'div');
fs.writeFileSync(path.join(V, 'ipd-hub.ejs'), hub);
