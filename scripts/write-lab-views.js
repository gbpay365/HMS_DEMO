'use strict';
const fs = require('fs');
const path = require('path');
const V = path.join(__dirname, '../views');
const DO = '<' + 'di' + 'v';
const DC = '</' + 'di' + 'v>';

function w(name, body) {
  const html = body.replace(/\{\{O\}\}/g, DO).replace(/\{\{C\}\}/g, DC);
  fs.writeFileSync(path.join(V, name), html);
  console.log('wrote', name);
}

w('lims-hub.ejs', `<%- include('partials/header') %>
{{O}} class="page-wrapper">{{O}} class="content">
<%- include('partials/clinical-dept-alerts-strip', { clinicalDeptStripDept: 'laboratory' }) %>
{{O}} class="card border-0 shadow mb-4" style="background:linear-gradient(135deg,#7c3aed,#0ea5e9);color:#fff;border-radius:16px;">
{{O}} class="card-body py-4 px-4">
 <h1 class="h4 font-weight-bold"><i class="fa fa-flask mr-2"></i>Laboratory (LIMS)</h1>
 <p class="mb-0 small" style="opacity:.9;">Sample tracking, test requests, results and configuration.</p>
{{C}}{{C}}
{{O}} class="row mb-4">
 {{O}} class="col-6 col-md-3 mb-3">{{O}} class="card shadow-sm text-center py-3" style="border-left:4px solid #7c3aed;"><div style="font-size:1.6rem;font-weight:800;color:#7c3aed;"><%=stats.today_open||0%></div><motion class="small text-muted">Today's requests</div>{{C}}{{C}}
{{C}}
<h5 class="font-weight-bold mb-3">Menus</h5>
{{O}} class="row">
 <% [{h:'/lims/requests?filter=today',i:'fa-list',t:'Lab requests'},{h:'/lims/request/new',i:'fa-plus',t:'New request'},{h:'/lims/samples',i:'fa-tint',t:'Lab samples'},{h:'/lims/results',i:'fa-file-text-o',t:'Test results'},{h:'/laboratory/validate',i:'fa-qrcode',t:'Validate code'},{h:'/lab/templates',i:'fa-list-alt',t:'Templates'},{h:'/lims/config',i:'fa-cog',t:'Configuration'}].forEach(function(m){ %>
 {{O}} class="col-sm-6 col-lg-3 mb-3"><a href="<%=m.h%>" class="card p-3 d-block text-dark"><i class="fa <%=m.i%> mr-2 text-primary"></i><strong><%=m.t%></strong></a>{{C}}
 <% }); %>
{{C}}
{{C}}{{C}}<%- include('partials/footer') %>
`);

w('lims-requests.ejs', `<%- include('partials/header') %>
{{O}} class="page-wrapper">{{O}} class="content">
{{O}} class="d-flex justify-content-between mb-3 flex-wrap gap-2">
 {{O}}><a href="/lims" class="small text-muted">LIMS hub</a><h4 class="mb-0 font-weight-bold">Lab requests</h4>{{C}}
 {{O}} class="btn-group btn-group-sm">
  <a href="/lims/requests?filter=today" class="btn btn-<%=filter==='today'?'primary':'outline-secondary'%>">Today</a>
  <a href="/lims/requests?filter=pending" class="btn btn-<%=filter==='pending'?'primary':'outline-secondary'%>">Open</a>
  <a href="/lims/requests?filter=all" class="btn btn-<%=filter==='all'?'primary':'outline-secondary'%>">All</a>
  <a href="/lims/request/new" class="btn btn-success">New request</a>
 {{C}}{{C}}
<table class="table table-hover card shadow-sm"><thead class="thead-light"><tr><th>Request</th><th>Patient</th><th>Date</th><th>Status</th><th>Tests</th><th></th></tr></thead><tbody>
<% rows.forEach(function(r){ %><tr>
<td class="font-weight-bold"><%=r.request_no||('#'+r.id)%></td>
<td><%=r.first_name%> <%=r.last_name%></td>
<td class="small"><%=r.scheduled_date%></td>
<td><span class="badge badge-light border"><%=r.status%></span></td>
<td><%=r.line_count%></td>
<td><a href="/lims/request/<%=r.id%>" class="btn btn-sm btn-outline-primary">Open</a></td>
</tr><% }); %>
</tbody></table>
{{C}}{{C}}<%- include('partials/footer') %>
`);

w('lims-request-new.ejs', `<%- include('partials/header') %>
{{O}} class="page-wrapper">{{O}} class="content">
<h4 class="font-weight-bold mb-3"><a href="/lims/requests" class="small text-muted">Requests</a> / New lab request</h4>
<form method="POST" action="/lims/request" class="card p-4 shadow-sm">
{{O}} class="row">
<div class="col-md-6 mb-2"><label class="small font-weight-bold">Patient</label>
<select name="patient_id" class="form-control form-control-sm" required><option value="">—</option>
<% patients.forEach(function(p){ %><option value="<%=p.id%>"><%=p.first_name%> <%=p.last_name%></option><% }); %></select></div>
<div class="col-md-6 mb-2"><label class="small font-weight-bold">Prescribing doctor</label>
<select name="prescribing_doctor_id" class="form-control form-control-sm"><option value="">—</option>
<% doctors.forEach(function(d){ %><option value="<%=d.id%>">Dr. <%=d.first_name%> <%=d.last_name%></option><% }); %></select></motion>
<div class="col-md-4 mb-2"><label class="small font-weight-bold">Test group (panel)</label>
<select name="test_group_id" class="form-control form-control-sm"><option value="">— optional —</option>
<% groups.forEach(function(g){ %><option value="<%=g.id%>"><%=g.code||''%> <%=g.name%></option><% }); %></select></div>
<div class="col-md-4 mb-2"><label class="small font-weight-bold">Collection center</label>
<select name="collection_center_id" class="form-control form-control-sm"><option value="">—</option>
<% centers.forEach(function(c){ %><option value="<%=c.id%>"><%=c.name%></option><% }); %></select></div>
<div class="col-md-4 mb-2"><label class="small font-weight-bold">Schedule date</label>
<input type="date" name="scheduled_date" class="form-control form-control-sm" value="<%=today%>" required></motion>
<div class="col-md-4 mb-2"><label class="small font-weight-bold">Time</label>
<input type="time" name="scheduled_time" class="form-control form-control-sm"></div>
<div class="col-12 mb-2"><label class="small font-weight-bold">Additional tests (if no group)</label>
{{O}} class="row"><% catalog.forEach(function(c){ %>
<div class="col-md-4"><label class="small"><input type="checkbox" name="catalog_id" value="<%=c.id%>"> <%=c.name%></label></div>
<% }); %></div>
<div class="col-12 mb-2"><label class="small"><input type="checkbox" name="is_group_request" value="1"> Group / family request</label></div>
<div class="col-12 mb-2"><textarea name="notes" class="form-control form-control-sm" rows="2" placeholder="Notes"></textarea></div>
</div>
<button class="btn btn-primary">Submit request</button>
</form>
{{C}}{{C}}<%- include('partials/footer') %>
`);

w('lims-request-detail.ejs', `<%- include('partials/header') %>
{{O}} class="page-wrapper">{{O}} class="content">
{{O}} class="card mb-3 p-3" style="background:linear-gradient(135deg,#7c3aed,#0ea5e9);color:#fff;border-radius:14px;">
 <strong><%=req.request_no%></strong> — <%=req.first_name%> <%=req.last_name%>
 <span class="badge badge-light text-dark ml-2"><%=req.status%></span>
 <span class="small ml-2"><%=req.scheduled_date%> · <%=req.collection_center_name||'—'%></span>
{{C}}
<ul class="nav nav-pills mb-3">
 <li class="nav-item"><a class="nav-link <%=tab==='workflow'?'active':''%>" href="?tab=workflow">Workflow</a></li>
 <li class="nav-item"><a class="nav-link <%=tab==='samples'?'active':''%>" href="?tab=samples">Samples</a></li>
 <li class="nav-item"><a class="nav-link" href="/laboratory">All results</a></li>
</ul>
<% if(tab==='workflow'){ %>
{{O}} class="row mb-3">
 <div class="col-md-8">
  <% if(req.status==='submitted'){ %><form method="POST" action="/lims/request/<%=req.id%>/accept"><button class="btn btn-success btn-sm mb-2">Accept request</button></form><% } %>
  <% if(req.status==='accepted'||req.status==='in_progress'){ %><form method="POST" action="/lims/request/<%=req.id%>/in-progress" class="d-inline"><button class="btn btn-warning btn-sm mb-2">Mark in progress</button></form><% } %>
  <table class="table table-sm card shadow-sm"><thead><tr><th>Test</th><th>Line status</th><th>Result</th><th></th></tr></thead><tbody>
  <% lines.forEach(function(l){ %>
  <tr><td><%=l.test_name%></td><td><%=l.line_status%></td><td><% if(l.lab_result_id){ %><a href="/laboratory/report/<%=l.lab_result_id%>"><%=l.result_status||'pending'%></a><% } else { %>—<% } %></td>
  <td><% if(l.lab_result_id){ %><a href="/lab/templates?lab_result_id=<%=l.lab_result_id%>" class="btn btn-xs btn-primary">Enter result</a><% } %></td></tr>
  <% }); %></tbody></table>
  <% if(req.status!=='done'){ %><form method="POST" action="/lims/request/<%=req.id%>/done"><button class="btn btn-dark btn-sm mt-2">Mark request done</button></form><% } %>
 </div>
 <div class="col-md-4"><div class="card p-3 small"><strong>Doctor:</strong> <%=req.doc_fn||''%> <%=req.doc_ln||'—'%><br><strong>Group:</strong> <%=req.test_group_name||'—'%><br><strong>Notes:</strong> <%=req.notes||'—'%></div></div>
{{C}}
<% } else { %>
{{O}} class="card p-3 mb-3"><h6>Record sample</h6>
<form method="POST" action="/lims/request/<%=req.id%>/sample" class="form-inline flex-wrap">
<select name="request_line_id" class="form-control form-control-sm mb-1 mr-1"><option value="">Whole request</option>
<% lines.forEach(function(l){ %><option value="<%=l.id%>"><%=l.test_name%></option><% }); %></select>
<input name="container_no" class="form-control form-control-sm mb-1 mr-1" placeholder="Container #" required>
<select name="sample_type_id" class="form-control form-control-sm mb-1 mr-1"><option value="">Type</option>
<% sampleTypes.forEach(function(st){ %><option value="<%=st.id%>"><%=st.name%></option><% }); %></select>
<button class="btn btn-sm btn-primary mb-1">Mark collected</button>
</form></motion>
<table class="table table-sm mt-3"><thead><tr><th>Container</th><th>Type</th><th>Status</th><th>When</th></tr></thead><tbody>
<% samples.forEach(function(s){ %><tr><td><%=s.container_no||'—'%></td><td><%=s.sample_type_name||'—'%></td><td><%=s.status%></td><td class="small"><%=s.collected_at||''%></td></tr><% }); %>
</tbody></table>
<% } %>
{{C}}{{C}}<%- include('partials/footer') %>
`);

w('lims-samples.ejs', `<%- include('partials/header') %>
{{O}} class="page-wrapper">{{O}} class="content">
<h4 class="mb-3"><a href="/lims">LIMS</a> / Lab samples</h4>
<table class="table table-hover card shadow-sm"><thead><tr><th>Request</th><th>Patient</th><th>Container</th><th>Type</th><th>Status</th></tr></thead><tbody>
<% rows.forEach(function(s){ %><tr><td><%=s.request_no%></td><td><%=s.first_name%> <%=s.last_name%></td><td><%=s.container_no%></td><td><%=s.sample_type_name||'—'%></td><td><%=s.status%></td></tr><% }); %>
</tbody></table>
{{C}}{{C}}<%- include('partials/footer') %>
`);

w('lims-config.ejs', `<%- include('partials/header') %>
{{O}} class="page-wrapper">{{O}} class="content">
<h4 class="mb-3"><a href="/lims">LIMS</a> / Configuration</h4>
<ul class="nav nav-tabs mb-3">
<li class="nav-item"><a class="nav-link <%=section==='groups'?'active':''%>" href="?section=groups">Test groups</a></li>
<li class="nav-item"><a class="nav-link <%=section==='centers'?'active':''%>" href="?section=centers">Collection centers</a></li>
</ul>
<% if(section==='groups'){ %>
{{O}} class="row"><div class="col-md-5"><form method="POST" action="/lims/config/group" class="card p-3">
<input name="code" class="form-control form-control-sm mb-2" placeholder="Code e.g. FBC">
<input name="name" class="form-control form-control-sm mb-2" placeholder="Group name" required>
<p class="small font-weight-bold">Tests in group:</p>
<% catalog.forEach(function(c){ %><label class="d-block small"><input type="checkbox" name="catalog_id" value="<%=c.id%>"> <%=c.name%></label><% }); %>
<button class="btn btn-primary btn-sm mt-2">Add group</button></form></div>
<div class="col-md-7"><ul class="list-group"><% groups.forEach(function(g){ %>
<li class="list-group-item d-flex justify-content-between"><span><%=g.code||''%> <%=g.name%></span><span class="badge badge-light"><%=g.line_count%> tests</span></li>
<% }); %></ul></div></div>
<% } else { %>
<form method="POST" action="/lims/config/center" class="card p-3 mb-3"><input name="name" class="form-control form-control-sm mb-2" placeholder="Center name" required><button class="btn btn-sm btn-primary">Add center</button></form>
<ul><% centers.forEach(function(c){ %><li><%=c.name%></li><% }); %></ul>
<% } %>
{{C}}{{C}}<%- include('partials/footer') %>
`);
