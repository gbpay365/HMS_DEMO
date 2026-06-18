'use strict';
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'views', 'appointments.ejs');
let s = fs.readFileSync(f, 'utf8');

if (!s.includes('apptDoctorId')) {
  s = s.replace(
    `<select class="form-control" name="doctor" required>
 <% doctors.forEach(doc => { %>
 <option value="<%= doc.first_name %> <%= doc.last_name %>">Dr. <%= doc.first_name %> <%= doc.last_name %></option>
 <% }) %>
 </select>`,
    `<select class="form-control" name="doctor_id" id="apptDoctorId" required>
 <% doctors.forEach(doc => { %>
 <option value="<%= doc.id %>" data-name="<%= doc.first_name %> <%= doc.last_name %>">Dr. <%= doc.first_name %> <%= doc.last_name %></option>
 <% }) %>
 </select>
 <input type="hidden" name="doctor" id="apptDoctorName" value="">`
  );

  s = s.replace(
    'name="date" required value="<%= new Date().toISOString().split(\'T\')[0] %>"',
    'name="date" id="apptDate" required value="<%= new Date().toISOString().split(\'T\')[0] %>"'
  );

  s = s.replace(
    `<div class="col-sm-6">
 <div class="form-group">
 <label class="small font-weight-bold">Time <span class="text-danger">*</span></label>
 <input class="form-control" type="time" name="time" required>
 </motion>
 </motion>`,
    `<div class="col-12">
 <label class="small font-weight-bold">Available slot</label>
 <div id="apptSlotGrid" class="d-flex flex-wrap mb-2" style="gap:6px;"></div>
 <input type="hidden" name="slot" id="apptSlot" value="">
 <input class="form-control form-control-sm" type="time" name="time" id="apptTimeFallback" placeholder="Or enter time manually">
 <small class="text-muted d-block" id="apptSlotHint"></small>
 </div>`
  );

  s = s.replace(/<\/motion>/g, '</div>').replace(/<motion /g, '<div ');
}

if (!s.includes('appt-slots.js')) {
  s = s.replace(
    "<%- include('partials/footer') %>",
    "<script src=\"/js/appt-slots.js\"></script>\n<%- include('partials/footer') %>"
  );
}

fs.writeFileSync(f, s);
console.log('patched', s.includes('apptDoctorId'));
