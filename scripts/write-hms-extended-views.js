'use strict';
const fs = require('fs');
const path = require('path');
const views = path.join(__dirname, '..', 'views');

const files = {
  'hms-appointment-slots-config.ejs': `<%- include('partials/header') %>
<div class="page-wrapper"><div class="content">
<p class="mb-2"><a href="/hms">HMS hub</a> · <a href="/appointments">Appointments</a></p>
<h4 class="font-weight-bold mb-3">Appointment slots configuration</h4>
<% if(flash){%><motion class="alert alert-success"><%=flash%></div><%}%>
<div class="row">
<div class="col-md-5">
<form method="POST" action="/hms/appointments/slots-config/settings" class="card p-3 mb-3">
<h6>Global hours</h6>
<div class="form-group"><label class="small">Start hour</label><input name="slot_start_hour" class="form-control form-control-sm" value="<%=settings.slotStartHour%>"></div>
<div class="form-group"><label class="small">End hour</label><input name="slot_end_hour" class="form-control form-control-sm" value="<%=settings.slotEndHour%>"></div>
<div class="form-group"><label class="small">Interval (min)</label><input name="slot_interval_minutes" class="form-control form-control-sm" value="<%=settings.slotInterval%>"></motion>
<div class="form-group"><label class="small">Max days ahead</label><input name="max_days_ahead" class="form-control form-control-sm" value="<%=settings.maxDaysAhead%>"></div>
<div class="form-group"><label class="small">Min notice (hours)</label><input name="min_hours_notice" class="form-control form-control-sm" value="<%=settings.minHoursNotice%>"></div>
<button class="btn btn-primary btn-sm">Save global</button>
</form>
<form method="POST" action="/hms/appointments/slots-config/availability" class="card p-3">
<h6>Doctor weekly window</h6>
<select name="doctor_id" class="form-control form-control-sm mb-2" required><% doctors.forEach(function(d){ %><option value="<%=d.id%>">Dr. <%=d.first_name%> <%=d.last_name%></option><% }); %></select>
<select name="weekday" class="form-control form-control-sm mb-2"><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select>
<input type="time" name="start_time" class="form-control form-control-sm mb-2" value="08:00" required>
<input type="time" name="end_time" class="form-control form-control-sm mb-2" value="17:00" required>
<input type="number" name="slot_minutes" class="form-control form-control-sm mb-2" value="30" min="10">
<button class="btn btn-outline-primary btn-sm">Add window</button>
</form>
</div>
<div class="col-md-7">
<table class="table table-sm card shadow-sm"><thead><tr><th>Doctor</th><th>Day</th><th>Hours</th><th>Slot</th></tr></thead><tbody>
<% availability.forEach(function(a){ var days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; %>
<tr><td>Dr. <%=a.first_name%> <%=a.last_name%></td><td><%=days[a.weekday]||a.weekday%></td><td><%=String(a.start_time).slice(0,5)%>–<%=String(a.end_time).slice(0,5)%></td><td><%=a.slot_minutes%>m</td></tr>
<% }); %>
</tbody></table>
</div>
</div>
</div></div><%- include('partials/footer') %>`,

  'verify-prescription.ejs': `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Rx verification</title>
<style>body{font-family:system-ui;max-width:520px;margin:2rem auto;padding:1rem;} .ok{border:2px solid #16a34a;background:#f0fdf4;padding:1.5rem;border-radius:12px;} .bad{border:2px solid #dc2626;background:#fef2f2;padding:1.5rem;border-radius:12px;} .qr{text-align:center;margin:1rem 0;}</style></head><body>
<% if(!rx){ %><div class="bad"><h2>Invalid prescription</h2><p>This QR code is not recognized.</p></div>
<% } else { %>
<div class="<%= rx.verified_at ? 'ok' : 'ok' %>">
<h2><%= rx.verified_at ? 'Verified prescription' : 'Valid prescription' %></h2>
<p><strong>#RX-<%=rx.id%></strong> · <%=rx.first_name%> <%=rx.last_name%></p>
<p class="small text-muted">Issued <%= rx.created_at ? new Date(rx.created_at).toLocaleString() : '' %></p>
<% if(rx.doc_fn){ %><p>Prescriber: Dr. <%=rx.doc_fn%> <%=rx.doc_ln%></p><% } %>
<p><%= rx.title || 'Prescription' %></p>
<% if(rx.verified_at){ %><p class="text-success font-weight-bold">Pharmacy verified <%= new Date(rx.verified_at).toLocaleString() %></p>
<% } else if (typeof locals.canVerify !== 'undefined' && canVerify) { %>
<form method="POST" action="/verify/rx/<%=token%>/confirm"><button type="submit" class="btn btn-success">Mark verified at pharmacy</button></form>
<% } %>
</div>
<% } %>
</body></html>`,

  'hms-prescription-verify.ejs': `<%- include('partials/header') %>
<div class="page-wrapper"><div class="content">
<h4 class="mb-3">Verify prescription QR</h4>
<p class="text-muted">Scan a prescription QR or paste the verification URL token.</p>
<form class="card p-4" onsubmit="var t=document.getElementById('rxToken').value.trim(); if(t){ window.location='/verify/rx/'+t.replace(/.*\\/verify\\/rx\\//,''); } return false;">
<input id="rxToken" class="form-control mb-3" placeholder="Token or full URL">
<button class="btn btn-primary">Verify</button>
</form>
</div></motion><%- include('partials/footer') %>`,

  'hms-commission.ejs': `<%- include('partials/header') %>
<div class="page-wrapper"><div class="content">
<p class="mb-2"><a href="/hms">HMS hub</a> · <a href="/hms/commission/report">Commission report</a></p>
<h4 class="font-weight-bold mb-3">Doctor commission rules</h4>
<div class="row">
<div class="col-md-5"><form method="POST" action="/hms/commission/rule" class="card p-3">
<select name="doctor_id" class="form-control form-control-sm mb-2" required><% doctors.forEach(function(d){ %><option value="<%=d.id%>">Dr. <%=d.first_name%> <%=d.last_name%></option><% }); %></select>
<input name="rule_name" class="form-control form-control-sm mb-2" placeholder="Rule name" required>
<select name="service_kind" class="form-control form-control-sm mb-2"><option value="consultation">Consultation</option><option value="laboratory">Laboratory</option><option value="radiology">Radiology</option><option value="pharmacy">Pharmacy</option><option value="all">All services</option></select>
<select name="rate_type" class="form-control form-control-sm mb-2"><option value="percent">Percent %</option><option value="fixed">Fixed amount</option></select>
<input name="rate_value" type="number" step="0.01" class="form-control form-control-sm mb-2" placeholder="Rate" required>
<button class="btn btn-primary btn-sm">Add rule</button>
</form></div>
<div class="col-md-7"><table class="table table-sm card shadow-sm"><thead><tr><th>Doctor</th><th>Service</th><th>Rate</th></tr></thead><tbody>
<% rules.forEach(function(r){ %><tr><td>Dr. <%=r.first_name%> <%=r.last_name%></td><td><%=r.service_kind%></td><td><%=r.rate_type==='percent'?r.rate_value+'%':r.rate_value+' XAF'%></td></tr><% }); %>
</tbody></table></div></div>
</div></div><%- include('partials/footer') %>`,

  'hms-commission-report.ejs': `<%- include('partials/header') %>
<div class="page-wrapper"><div class="content">
<p class="mb-2"><a href="/hms/commission">Commission rules</a></p>
<form class="form-inline mb-3 card p-3" method="GET" action="/hms/commission/report">
<select name="doctor_id" class="form-control form-control-sm mr-2"><option value="">All doctors</option>
<% doctors.forEach(function(d){ %><option value="<%=d.id%>" <%=filters.doctor_id==d.id?'selected':''%>>Dr. <%=d.first_name%> <%=d.last_name%></option><% }); %></select>
<input type="date" name="from" value="<%=filters.from%>" class="form-control form-control-sm mr-2">
<input type="date" name="to" value="<%=filters.to%>" class="form-control form-control-sm mr-2">
<button class="btn btn-primary btn-sm">Run report</button>
</form>
<p class="font-weight-bold">Total commission: <%= Number(report.totalCommission||0).toLocaleString('fr-FR') %> XAF</p>
<table class="table table-sm card shadow-sm"><thead><tr><th>Date</th><th>Doctor</th><th>Patient</th><th>Service</th><th>Base</th><th>Commission</th></tr></thead><tbody>
<% (report.lines||[]).forEach(function(l){ %><tr>
<td class="small"><%= l.date ? new Date(l.date).toLocaleDateString() : '' %></td>
<td><%=l.doctor_name%></td><td><%=l.patient_name%></td><td><%=l.service_kind%></td>
<td class="text-right"><%=Number(l.base_amount).toLocaleString('fr-FR')%></td>
<td class="text-right font-weight-bold"><%=Number(l.commission).toLocaleString('fr-FR')%></td>
</tr><% }); %>
</tbody></table>
</div></div><%- include('partials/footer') %>`,
};

for (const [name, content] of Object.entries(files)) {
  const fixed = content.replace(/<motion /g, '<div ').replace(/<\/motion>/g, '</div>');
  fs.writeFileSync(path.join(views, name), fixed);
  console.log('wrote', name);
}
