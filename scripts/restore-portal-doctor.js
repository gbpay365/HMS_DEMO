const fs = require('fs');
const path = require('path');

const appts = fs.readFileSync(path.join(__dirname, '_appts_chunk.ejs'), 'utf8');

const head = `<%- include('partials/header') %>
<%
var _up = locals.userPerms || [];
function hasP(){ if (_up.includes('*')) return true; for (var i=0;i<arguments.length;i++) if (_up.includes(arguments[i])) return true; return false; }
%>
<div class="page-wrapper"><div class="content">
<%- include('partials/portal-flash') %>

<!-- Hero Banner -->
<div class="card border-0 shadow mb-4" style="background:linear-gradient(135deg,#1a6bd8,#0c8b8b);color:#fff;border-radius:16px;">
  <div class="card-body py-4 px-4 d-flex align-items-center justify-content-between flex-wrap" style="gap:12px;">
 <div>
 <h1 class="h4 mb-1 font-weight-bold" style="color:#fff;"><i class="fa fa-user-md mr-2"></i>Welcome, Dr. <%=me.first_name||'Doctor'%> 👋</h1>
 <p class="mb-0 small" style="color:rgba(255,255,255,.85);"><%=me.primary_department||'Physician'%> &mdash; <%= new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) %></p>
 </div>
 <div class="d-flex flex-wrap" style="gap:8px;">
 <% if (uiVisible('doc.hero.guides')) { %><a href="/workflow-guides" class="btn btn-outline-light btn-sm font-weight-bold"><i class="fa fa-sitemap mr-1"></i>Workflow Guide</a><% } %>
 <% if(hasP('clinical.write','prescription.write')){ %><a href="/consultation-new" class="btn btn-light btn-sm font-weight-bold" style="color:#1a6bd8;"><i class="fa fa-plus mr-1"></i>New Consultation</a><% } %>
 <% if(hasP('clinical.write','prescription.write') && uiVisible('doc.hero.followup')){ %><button type="button" class="btn btn-sm font-weight-bold text-white border-0" style="background:linear-gradient(135deg,#6d28d9,#7c3aed);" data-toggle="modal" data-target="#docFollowUpModal"><i class="fa fa-calendar-check-o mr-1"></i>Follow-Up</button><% } %>
 <% if(hasP('opd.read','clinical.read','clinical.write','scheduling.read')){ %><a href="/opd-queue" class="btn btn-outline-light btn-sm font-weight-bold"><i class="fa fa-list-alt mr-1"></i>OPD Queue</a><% } %>
 </div>
  </div>
</div>

<!-- KPI Stats -->
<div class="row mb-4">
  <% [
 ['My Appts Today', stats.appts, 'fa-calendar-check-o','#1a6bd8','#dbeafe'],
 ['My Consultations', stats.consults, 'fa-stethoscope', '#10b981','#d1fae5'],
 ['OPD in Queue', stats.pending,  'fa-clock-o', '#f59e0b','#fef3c7'],
 ['Total Patients', stats.patients, 'fa-users', '#8b5cf6','#ede9fe']
  ].forEach(function(s){ %>
  <div class="col-6 col-md-3 mb-3">
 <div class="card border-0 shadow-sm h-100" style="border-left:4px solid <%=s[3]%>;border-radius:12px;">
 <div class="card-body d-flex align-items-center">
 <span class="rounded-circle mr-3 d-flex align-items-center justify-content-center" style="width:50px;height:50px;background:<%=s[4]%>;flex-shrink:0;">
 <i class="fa <%=s[2]%>" style="color:<%=s[3]%>;font-size:1.2rem;"></i>
 </span>
 <div><motion style="font-size:1.9rem;font-weight:800;color:#1e293b;"><%=s[1]%></div><div class="text-muted small"><%=s[0]%></div></div>
 </motion>
 </div>
  </div>
  <% }); %>
</div>

<%- include('partials/portal-tiles', { portal: 'doctors', title: 'Clinical Tools' }) %>

`;

const recentCol = `  <div class="col-lg-6 mb-4">
 <div class="card border-0 shadow-sm h-100" style="border-radius:14px;">
 <div class="card-header bg-white d-flex justify-content-between align-items-center py-3" style="border-bottom:2px solid #e2e8f0;">
 <span class="font-weight-bold"><i class="fa fa-stethoscope mr-1 text-success"></i>Recent Consultations</span>
 <a href="/consultation" class="btn btn-sm btn-outline-success" style="border-radius:8px;">All</a>
 </div>
 <div class="card-body p-0" data-hms-table-paginate data-hms-page-size="5"><div class="table-responsive">
<table class="table table-hover mb-0">
<thead class="thead-light"><tr><th>Patient</th><th>Date</th><th class="text-right">Actions</th></tr></thead>
<tbody>
<% if(!recentConsults||recentConsults.length===0){ %><tr><td colspan="3" class="text-center text-muted py-4">No recent consultations.</td></tr>
<% } else { recentConsults.forEach(function(r){ var d=r.created_at?new Date(r.created_at).toLocaleDateString('en-GB'):'—'; %>
<tr>
 <td class="font-weight-bold"><%=r.first_name||''%> <%=r.last_name||''%></td>
 <td class="small text-muted"><%=d%></td>
 <td class="text-right" style="white-space:nowrap;">
  <a href="/patient-chart/<%=r.patient_id%>" class="btn btn-xs btn-outline-primary" style="font-size:.7rem;padding:2px 7px;border-radius:6px;">
   <i class="fa fa-folder-open-o mr-1"></i>Chart
  </a>
  <% if(hasP('clinical.write','prescription.write')){ %>
  <a href="/clinical/follow-up-opd?patient_id=<%=r.patient_id%>" class="btn btn-xs font-weight-bold text-white ml-1" style="font-size:.7rem;padding:2px 7px;border-radius:6px;background:linear-gradient(135deg,#6d28d9,#7c3aed);" title="Start a follow-up consultation if payment validity and your prior request allow it">
   <i class="fa fa-calendar-check-o mr-1"></i>Follow Up
  </a>
  <% } %>
 </td>
</tr>
<% }); } %>
 </tbody>
 </table>
 </div></div>
 </div>
  </div>
</div>

`;

const tail = `
<%- include('partials/portal-doctor-followup-modal') %>

</div></div><%- include('partials/footer') %>
`;

let out = head + appts + '\n' + recentCol + tail;
out = out.replace(/<\/?motion\b[^>]*>/g, (m) => m.replace(/motion/g, 'motion'));
out = out.replace(/<motion /g, '<div ').replace(/<\/motion>/g, '</div>').replace(/<motion>/g, '<div>');

fs.writeFileSync(path.join(__dirname, '../views/portal-doctor.ejs'), out);
console.log('restored', out.length);
