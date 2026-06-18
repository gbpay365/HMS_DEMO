// patch_frontend.js — Replace modals + scripts in ipd-ward-rounds.ejs
const fs = require('fs');
const filePath = 'views/ipd-ward-rounds.ejs';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
console.log('Original lines:', lines.length);

// Find the Add Charge Modal start (line ~150)
const modalStart = lines.findIndex(l => l.includes('<!-- Add Charge Modal -->'));
if (modalStart < 0) { console.error('Cannot find Add Charge Modal!'); process.exit(1); }
console.log('Modal section starts at line:', modalStart + 1);

// Replace from modalStart to end of file (before the last line which is empty)
const newSection = `
<!-- ═══════════════ Add Charge Modal (Catalog-Aware) ═══════════════ -->
<div class="modal fade" id="chargeModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content border-0 shadow" style="border-radius:14px;overflow:hidden;">
      <div class="modal-header" style="background:linear-gradient(135deg,#7f1d1d,#dc2626);">
        <h5 class="modal-title text-white font-weight-bold"><i class="fa fa-plus mr-2"></i>Add Charge to Running Bill</h5>
        <button type="button" class="close text-white" data-dismiss="modal"><span>&times;</span></button>
      </div>
      <form action="/ipd/add-charge" method="POST">
        <input type="hidden" name="admission_id" id="chargeAdmId">
        <input type="hidden" name="catalog_id" id="chargeCatalogId" value="">
        <div class="modal-body px-4 pt-3">
          <div class="font-weight-bold text-danger mb-3" id="chargePatientName" style="font-size:.95rem;"></div>
          <div class="form-group">
            <label class="small font-weight-bold">Charge Type</label>
            <select id="chargeTypeSelect" name="charge_type" class="form-control" onchange="onChargeTypeChange()">
              <option value="consultation">Consultation</option>
              <option value="laboratory">Laboratory</option>
              <option value="radiology">Radiology</option>
              <option value="pharmacy">Pharmacy</option>
              <option value="procedure">Procedure</option>
              <option value="room_daily">Daily Room Charge</option>
              <option value="misc">Miscellaneous</option>
            </select>
          </div>
          <!-- Catalog service dropdown (shown for all except misc) -->
          <div class="form-group" id="catalogServiceGroup">
            <label class="small font-weight-bold">Select Service <span class="text-danger">*</span></label>
            <select id="catalogServiceSelect" class="form-control" onchange="onServiceSelect()">
              <option value="">-- Loading services... --</option>
            </select>
            <small class="text-muted" id="catalogCount"></small>
          </div>
          <!-- Manual description (shown for misc, or auto-filled from catalog) -->
          <div class="form-group" id="manualDescGroup" style="display:none;">
            <label class="small font-weight-bold">Description <span class="text-danger">*</span></label>
            <input type="text" name="description" id="chargeDesc" class="form-control" placeholder="e.g. IV Drip - Day 2" required>
          </div>
          <div class="form-group mb-0">
            <label class="small font-weight-bold">Amount (FCFA) <span class="text-danger">*</span></label>
            <input type="number" name="amount" id="chargeAmount" class="form-control form-control-lg font-weight-bold" min="1" step="100" placeholder="0" required>
          </div>
        </div>
        <div class="modal-footer border-0 bg-light px-4 py-3">
          <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-danger font-weight-bold px-5">Add to Bill</button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- ═══════════════ Record Vitals Modal ═══════════════ -->
<div class="modal fade" id="vitalsModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg">
    <div class="modal-content border-0 shadow" style="border-radius:14px;overflow:hidden;">
      <div class="modal-header" style="background:linear-gradient(135deg,#0e7490,#06b6d4);">
        <h5 class="modal-title text-white font-weight-bold"><i class="fa fa-heartbeat mr-2"></i>Record Vitals</h5>
        <button type="button" class="close text-white" data-dismiss="modal"><span>&times;</span></button>
      </div>
      <form action="/nursing/vitals/save" method="POST">
        <input type="hidden" name="patient_id" id="vitalsPatientId">
        <div class="modal-body px-4 pt-3">
          <div class="d-flex align-items-center mb-3 p-2" style="background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd;">
            <i class="fa fa-user-circle fa-2x text-info mr-3"></i>
            <div>
              <div class="small text-muted font-weight-bold text-uppercase" style="font-size:.65rem;letter-spacing:.05em;">Patient Name</div>
              <div class="font-weight-bold" id="vitalsPatientName" style="font-size:1.05rem;color:#0e7490;"></div>
            </div>
          </div>
          <div class="form-row">
            <div class="col-md-3 mb-3">
              <label class="small font-weight-bold text-muted">BP Systolic</label>
              <div class="input-group input-group-sm">
                <input type="number" name="bp_sys" class="form-control" placeholder="120" min="50" max="300">
                <div class="input-group-append"><span class="input-group-text">mmHg</span></div>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <label class="small font-weight-bold text-muted">BP Diastolic</label>
              <div class="input-group input-group-sm">
                <input type="number" name="bp_dia" class="form-control" placeholder="80" min="20" max="200">
                <div class="input-group-append"><span class="input-group-text">mmHg</span></div>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <label class="small font-weight-bold text-muted">&#x2665; Heart Rate</label>
              <div class="input-group input-group-sm">
                <input type="number" name="heart_rate" class="form-control" placeholder="72" min="20" max="250">
                <div class="input-group-append"><span class="input-group-text">bpm</span></div>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <label class="small font-weight-bold text-muted">&#x1F321; Temp</label>
              <div class="input-group input-group-sm">
                <input type="number" name="temp_c" class="form-control" placeholder="37.0" min="30" max="45" step="0.1">
                <div class="input-group-append"><span class="input-group-text">&deg;C</span></div>
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="col-md-3 mb-3">
              <label class="small font-weight-bold text-muted">SpO&#x2082;</label>
              <div class="input-group input-group-sm">
                <input type="number" name="spo2" class="form-control" placeholder="98" min="50" max="100">
                <div class="input-group-append"><span class="input-group-text">%</span></div>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <label class="small font-weight-bold text-muted">Resp. Rate</label>
              <div class="input-group input-group-sm">
                <input type="number" name="rr" class="form-control" placeholder="16" min="4" max="60">
                <div class="input-group-append"><span class="input-group-text">/min</span></div>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <label class="small font-weight-bold text-muted">&#x2696; Weight</label>
              <div class="input-group input-group-sm">
                <input type="number" name="weight_kg" class="form-control" placeholder="70" min="0.5" max="500" step="0.1">
                <div class="input-group-append"><span class="input-group-text">kg</span></div>
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <label class="small font-weight-bold text-muted">Height</label>
              <div class="input-group input-group-sm">
                <input type="number" name="height_cm" class="form-control" placeholder="170" min="30" max="250">
                <div class="input-group-append"><span class="input-group-text">cm</span></div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer border-0 bg-light px-4 py-3">
          <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">Cancel</button>
          <button type="submit" class="btn font-weight-bold px-5 text-white" style="background:linear-gradient(135deg,#0e7490,#06b6d4);">
            <i class="fa fa-check mr-1"></i> Save Vitals
          </button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- ═══════════════ Clinical Discharge Modal ═══════════════ -->
<div class="modal fade" id="clinDCModal" tabindex="-1" role="dialog" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content border-0 shadow" style="border-radius:14px;overflow:hidden;">
      <div class="modal-header" style="background:linear-gradient(135deg,#92400e,#f59e0b);">
        <h5 class="modal-title text-white font-weight-bold">&#x1F9BE; Clinical Discharge</h5>
        <button type="button" class="close text-white" data-dismiss="modal"><span>&times;</span></button>
      </div>
      <form action="/wards/clinical-discharge" method="POST">
        <input type="hidden" name="admission_id" id="clinDCAdmId">
        <div class="modal-body px-4 pt-3">
          <div class="alert alert-warning border-0 py-2 mb-3 small" style="border-radius:8px;">
            <strong id="clinDCPatient"></strong> &mdash; Issuing clinical discharge will notify the Cashier for financial settlement.
          </div>
          <div class="form-group">
            <label class="small font-weight-bold">Discharge Summary <span class="text-muted">(optional)</span></label>
            <textarea name="discharge_summary" class="form-control" rows="3"
              placeholder="Patient condition at discharge, treatment summary, reason for discharge..."></textarea>
          </div>
          <div class="form-group mb-0">
            <label class="small font-weight-bold">Follow-Up Instructions <span class="text-muted">(optional)</span></label>
            <textarea name="follow_up" class="form-control" rows="2"
              placeholder="Review in 2 weeks, continue medications, return if fever..."></textarea>
          </div>
        </div>
        <div class="modal-footer border-0 bg-light px-4 py-3">
          <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-warning font-weight-bold px-5 text-white">
            &#x1F9BE; Confirm Clinical Discharge
          </button>
        </div>
      </form>
    </div>
  </div>
</div>

<script>
// ── Add Charge: catalog-aware logic ──
var _catalogCache = {};

function openCharge(admId, patName) {
  document.getElementById('chargeAdmId').value = admId;
  document.getElementById('chargePatientName').textContent = 'Patient: ' + patName;
  document.getElementById('chargeTypeSelect').value = 'consultation';
  document.getElementById('chargeDesc').value = '';
  document.getElementById('chargeAmount').value = '';
  document.getElementById('chargeCatalogId').value = '';
  onChargeTypeChange();
  $('#chargeModal').modal('show');
}

function onChargeTypeChange() {
  var cat = document.getElementById('chargeTypeSelect').value;
  var catGroup = document.getElementById('catalogServiceGroup');
  var manGroup = document.getElementById('manualDescGroup');
  var descInput = document.getElementById('chargeDesc');
  var amtInput = document.getElementById('chargeAmount');

  if (cat === 'misc') {
    catGroup.style.display = 'none';
    manGroup.style.display = '';
    descInput.required = true;
    descInput.value = '';
    amtInput.value = '';
    document.getElementById('chargeCatalogId').value = '';
  } else {
    catGroup.style.display = '';
    manGroup.style.display = 'none';
    descInput.required = false;
    loadCatalog(cat);
  }
}

function loadCatalog(category) {
  var sel = document.getElementById('catalogServiceSelect');
  var countEl = document.getElementById('catalogCount');
  sel.innerHTML = '<option value="">-- Loading... --</option>';
  countEl.textContent = '';

  if (_catalogCache[category]) {
    populateCatalog(_catalogCache[category]);
    return;
  }

  fetch('/api/service-catalog?category=' + encodeURIComponent(category))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      _catalogCache[category] = data;
      populateCatalog(data);
    })
    .catch(function() {
      sel.innerHTML = '<option value="">-- Failed to load --</option>';
    });
}

function populateCatalog(items) {
  var sel = document.getElementById('catalogServiceSelect');
  var countEl = document.getElementById('catalogCount');
  sel.innerHTML = '<option value="">-- Select a service --</option>';
  items.forEach(function(item) {
    var opt = document.createElement('option');
    opt.value = item.id + '|' + item.name + '|' + item.price;
    opt.textContent = item.name + ' - ' + Number(item.price).toLocaleString('fr-FR') + ' FCFA';
    sel.appendChild(opt);
  });
  countEl.textContent = items.length + ' service(s) available';
}

function onServiceSelect() {
  var val = document.getElementById('catalogServiceSelect').value;
  if (!val) return;
  var parts = val.split('|');
  document.getElementById('chargeCatalogId').value = parts[0];
  document.getElementById('chargeDesc').value = parts[1];
  document.getElementById('chargeAmount').value = parts[2];
}

// ── Record Vitals ──
function openVitals(patientId, patName) {
  document.getElementById('vitalsPatientId').value = patientId;
  document.getElementById('vitalsPatientName').textContent = patName;
  // Clear all inputs
  var inputs = document.querySelectorAll('#vitalsModal input[type=number]');
  inputs.forEach(function(inp) { inp.value = ''; });
  $('#vitalsModal').modal('show');
}

// ── Clinical Discharge ──
function openClinDC(admId, patName) {
  document.getElementById('clinDCAdmId').value = admId;
  document.getElementById('clinDCPatient').textContent = patName;
  $('#clinDCModal').modal('show');
}
</script>

</div></div>
<%- include('partials/footer') %>
`;

// Remove old lines from modalStart to end, insert new
lines.splice(modalStart, lines.length - modalStart, ...newSection.split('\n'));
console.log('New total lines:', lines.length);

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

// EJS lint
try {
  require('child_process').execSync('npx ejs-lint ' + filePath, { cwd: __dirname, timeout: 15000 });
  console.log('EJS Lint: OK');
} catch(e) {
  console.log('EJS Lint:', (e.stderr||e.stdout||'').toString().split('\n')[0]);
}
