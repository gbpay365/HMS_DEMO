#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '../views/cashier.ejs');
let s = fs.readFileSync(p, 'utf8');

// Remove erroneous duplicate block (broken motion tag + consult content before real SERVICES pane)
const dupMarker = '\n <!-- SERVICES -->\n <motion class="tab-pane fade" id="pane-hosp"';
const dupIdx = s.indexOf(dupMarker);
const defaultMarker = ' <!-- SERVICES (default) -->';
const defaultIdx = s.indexOf(defaultMarker);
if (defaultIdx >= 0 && dupIdx > defaultIdx) {
  s = s.slice(0, defaultIdx) + s.slice(dupIdx + '\n <!-- SERVICES -->\n'.length);
}

s = s.replace(/<motion /g, '<div ');

// Ensure default Services pane is active
s = s.replace(
  /<div class="tab-pane fade" id="pane-hosp" role="tabpanel">/,
  '<motion class="tab-pane fade show active" id="pane-hosp" role="tabpanel">'
);
s = s.replace(/<motion class="tab-pane fade show active" id="pane-hosp"/, '<motion class="tab-pane fade show active" id="pane-hosp"');
s = s.replace(/<motion class=/g, '<div class=');

const maternityPane = `
 <!-- MATERNITY -->
 <div class="tab-pane fade" id="pane-maternity" role="tabpanel">
 <div class="alert alert-info border-0 py-2 mb-3 small">
 <i class="fa fa-info-circle mr-1"></i>
 Collect prepayment for <strong>maternity services</strong> (Service Catalog → Maternity).
 </motion>
 <div class="form-row">
 <div class="col-md-8">
 <div class="form-group">
 <label class="font-weight-bold small">Maternity Service</label>
 <select id="selMaternity" class="form-control hms-svc-sel" data-type="maternity"
 <%= (maternityCatalog||[]).length === 0 ? 'disabled' : '' %>>
 <option value="">— Select maternity service —</option>
 <% (maternityCatalog||[]).forEach(c => { %>
 <option value="<%= c.id %>" data-price="<%= c.price %>" data-dept="<%= c.department_name || '' %>">
 <%= c.name %> — <%= Number(c.price).toLocaleString('fr-FR') %> FCFA
 </option>
 <% }); %>
 </select>
 <% if ((maternityCatalog||[]).length === 0) { %>
 <small class="text-danger">No maternity services in catalog. Add them under Service Catalog → Maternity.</small>
 <% } %>
 </div>
 </div>
 <div class="col-md-4">
 <motion class="form-group">
 <label class="font-weight-bold small">Amount (FCFA)</label>
 <input type="text" id="prepayAmountMaternity" class="form-control bg-light font-weight-bold text-primary" readonly placeholder="—">
 </div>
 </div>
 </div>
 </div>
`.replace(/<\/motion>/g, '</div>').replace(/<motion class=/g, '<motion class=');

// Fix maternity pane - I made errors again. Let me write clean version without motion typos
