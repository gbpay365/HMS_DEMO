'use strict';
/** Second pass: replace bare ?err=Foo+Bar redirects using existing errors.flash keys */
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'app.js');
const enPath = path.join(__dirname, '..', 'locales', 'en', 'errors.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const flash = en.flash || {};

// english text -> flash.key
const byText = new Map();
for (const [k, v] of Object.entries(flash)) {
  byText.set(v, `flash.${k}`);
}

let out = fs.readFileSync(appPath, 'utf8');
let count = 0;

const entries = [...byText.entries()].sort((a, b) => b[0].length - a[0].length);
for (const [str, key] of entries) {
  if (out.includes(`flashT(res, '${key}')`)) continue;
  const esc = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plus = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\+');

  // ?err=Word+Word or ?msg=Word+Word (bare, no encodeURIComponent)
  const patterns = [
    [new RegExp(`(\\?err=)${plus}(?=[&'"\\)])`, 'g'), `$1' + encodeURIComponent(flashT(res, '${key}'))`],
    [new RegExp(`(\\?msg=)${plus}(?=[&'"\\)])`, 'g'), `$1' + encodeURIComponent(flashT(res, '${key}'))`],
    [new RegExp(`(\\?err=)${esc}(?=[&'"\\)])`, 'g'), `$1' + encodeURIComponent(flashT(res, '${key}'))`],
    [new RegExp(`(\\?msg=)${esc}(?=[&'"\\)])`, 'g'), `$1' + encodeURIComponent(flashT(res, '${key}'))`],
  ];
  for (const [re, rep] of patterns) {
    const before = out;
    out = out.replace(re, rep);
    if (out !== before) count++;
  }
}

// Dynamic suffix patterns
const dynamic = [
  [
    /\?err=Registration\+failed:\+' \+ encodeURIComponent\(err\.message\)/g,
    "?err=' + encodeURIComponent(flashT(res, 'flash.registration_failed', { message: err.message }))",
  ],
  [
    /\?err=Update\+failed:\+' \+ encodeURIComponent\(err\.message\)/g,
    "?err=' + encodeURIComponent(flashT(res, 'flash.update_failed', { message: err.message }))",
  ],
  [
    /\?err=Failed\+to\+create\+prescription:\+' \+ encodeURIComponent\(err\.message\)/g,
    "?err=' + encodeURIComponent(flashT(res, 'flash.failed_to_create_prescription', { message: err.message }))",
  ],
  [
    /\?err=Consultation\+load\+failed:\+' \+ encodeURIComponent\(err\.message\)/g,
    "?err=' + encodeURIComponent(flashT(res, 'flash.consultation_load_failed', { message: err.message }))",
  ],
  [
    /\?err=Save\+failed:\+' \+ encodeURIComponent\(err\.message\)/g,
    "?err=' + encodeURIComponent(flashT(res, 'flash.save_failed', { message: err.message }))",
  ],
  [
    /encodeURIComponent\('Failed to submit test request: ' \+ err\.message\)/g,
    "encodeURIComponent(flashT(res, 'flash.failed_to_submit_test_request', { message: err.message }))",
  ],
  [
    /encodeURIComponent\('Failed to submit imaging request: ' \+ err\.message\)/g,
    "encodeURIComponent(flashT(res, 'flash.failed_to_submit_imaging_request', { message: err.message }))",
  ],
  [
    /encodeURIComponent\('Activated deployment profiles: ' \+ names\)/g,
    "encodeURIComponent(flashT(res, 'flash.activated_deployment_profiles', { names }))",
  ],
  [
    /encodeURIComponent\('Deployment saved: ' \+ label \+ ' \(legacy global mode\)\.'\)/g,
    "encodeURIComponent(flashT(res, 'flash.deployment_saved', { label }))",
  ],
  [
    /encodeURIComponent\('Could not save deployment mode\. ' \+ \(err\.message \|\| ''\)\)/g,
    "encodeURIComponent(flashT(res, 'flash.could_not_save_deployment_mode', { message: err.message || '' }))",
  ],
  [
    /encodeURIComponent\('Facility "' \+ data\.name \+ '" created\.'\)/g,
    "encodeURIComponent(flashT(res, 'flash.facility_created', { name: data.name }))",
  ],
  [
    /encodeURIComponent\('Facility "' \+ data\.name \+ '" saved\.'\)/g,
    "encodeURIComponent(flashT(res, 'flash.facility_saved', { name: data.name }))",
  ],
  [
    /encodeURIComponent\('Request ' \+ created\.requestNo \+ ' saved\.'\)/g,
    "encodeURIComponent(flashT(res, 'flash.request_saved', { no: created.requestNo }))",
  ],
  [
    /encodeURIComponent\('Create failed: ' \+ e\.message\)/g,
    "encodeURIComponent(flashT(res, 'flash.create_failed', { message: e.message }))",
  ],
  [
    /encodeURIComponent\('Update failed: ' \+ e\.message\)/g,
    "encodeURIComponent(flashT(res, 'flash.update_failed', { message: e.message }))",
  ],
  [
    /encodeURIComponent\('Import failed: ' \+ e\.message\)/g,
    "encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message }))",
  ],
  [
    /encodeURIComponent\('Merge failed: ' \+ e\.message\)/g,
    "encodeURIComponent(flashT(res, 'flash.merge_failed', { message: e.message }))",
  ],
  [
    /encodeURIComponent\('Autofill failed: ' \+ e\.message\)/g,
    "encodeURIComponent(flashT(res, 'flash.autofill_failed', { message: e.message }))",
  ],
  [
    /encodeURIComponent\('Payment Collected! Receipt: ' \+ receipt_no \+ ' · Invoice: ' \+ invoice_no\)/g,
    "encodeURIComponent(flashT(res, 'flash.payment_collected', { receipt: receipt_no, invoice: invoice_no }))",
  ],
  [
    /encodeURIComponent\('Consultation link failed: ' \+ e\.message\)/g,
    "encodeURIComponent(flashT(res, 'flash.consultation_link_failed', { message: e.message }))",
  ],
  [
    /encodeURIComponent\('Could not load patient record: ' \+ dbErr\.message\)/g,
    "encodeURIComponent(flashT(res, 'flash.could_not_load_patient_record', { message: dbErr.message }))",
  ],
  [
    /encodeURIComponent\('Save failed: ' \+ err\.message\)/g,
    "encodeURIComponent(flashT(res, 'flash.save_failed', { message: err.message }))",
  ],
  [
    /encodeURIComponent\('Appointment rescheduled to ' \+ req\.body\.date \+ ' ' \+ req\.body\.time \+ '\. Awaiting confirmation\.'\)/g,
    "encodeURIComponent(flashT(res, 'flash.appointment_rescheduled', { date: req.body.date, time: req.body.time }))",
  ],
  [
    /encodeURIComponent\('Visit advanced to: ' \+ next\.replace\(\/_\/g, ' '\)\)/g,
    "encodeURIComponent(flashT(res, 'flash.visit_advanced', { status: next.replace(/_/g, ' ') }))",
  ],
  [
    /encodeURIComponent\('Visit status set to: ' \+ newStatus\.replace\(\/_\/g, ' '\)\)/g,
    "encodeURIComponent(flashT(res, 'flash.visit_status_set', { status: newStatus.replace(/_/g, ' ') }))",
  ],
  [
    /encodeURIComponent\('This visit is already ' \+ qs\.replace\(\/_\/g, ' '\) \+ '\.'\)/g,
    "encodeURIComponent(flashT(res, 'flash.visit_already_status', { status: qs.replace(/_/g, ' ') }))",
  ],
  [
    /encodeURIComponent\('Bed added: ' \+ ward_name \+ ' \/ ' \+ bed_label\)/g,
    "encodeURIComponent(flashT(res, 'flash.bed_added', { ward: ward_name, bed: bed_label }))",
  ],
  [
    /encodeURIComponent\('Bed removed: ' \+ label\)/g,
    "encodeURIComponent(flashT(res, 'flash.bed_removed', { label }))",
  ],
  [
    /encodeURIComponent\('Patient admitted\. Admission #' \+ ins\.insertId\)/g,
    "encodeURIComponent(flashT(res, 'flash.patient_admitted', { id: ins.insertId }))",
  ],
  [
    /encodeURIComponent\(duplicatePatientMessage\(duplicate\)\)/g,
    "encodeURIComponent(flashT(res, 'flash.duplicate_patient', { id: duplicate.id, name: ((duplicate.first_name||'')+' '+(duplicate.last_name||'')).trim() || flashT(res, 'flash.patient') }))",
  ],
];

for (const [re, rep] of dynamic) {
  if (re.test(out)) {
    out = out.replace(re, rep);
    count++;
  }
}

fs.writeFileSync(appPath, out, 'utf8');
console.log('Bare/dynamic flash replacements:', count);
