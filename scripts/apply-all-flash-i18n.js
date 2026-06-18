'use strict';
/** Apply flashT() to all static redirect messages in app.js (safe full-redirect replacement). */
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'app.js');
const enPath = path.join(__dirname, '..', 'locales', 'en', 'errors.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const flash = en.flash || {};

const byText = new Map(Object.entries(flash).map(([k, v]) => [v, `flash.${k}`]));

let out = fs.readFileSync(appPath, 'utf8');
if (!out.includes("require('./lib/flashI18n')")) {
  out = out.replace(
    "const express = require('express');",
    "const express = require('express');\nconst { flashT } = require('./lib/flashI18n');"
  );
}

let count = 0;

// encodeURIComponent('literal')
for (const [str, key] of [...byText.entries()].sort((a, b) => b[0].length - a[0].length)) {
  const esc = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`encodeURIComponent\\(\\s*['"]${esc}['"]\\s*\\)`, 'g');
  const rep = `encodeURIComponent(flashT(res, '${key}'))`;
  const n = (out.match(re) || []).length;
  if (n) {
    out = out.replace(re, rep);
    count += n;
  }
}

// res.redirect('/path?err=bare'); — suffix replace avoids regex pitfalls
for (const [str, key] of [...byText.entries()].sort((a, b) => b[0].length - a[0].length)) {
  if (/['`]/.test(str)) continue;
  const rep = (field) =>
    `?${field}=' + encodeURIComponent(flashT(res, '${key}')))`;
  for (const field of ['err', 'msg']) {
    for (const variant of [str, str.replace(/ /g, '+')]) {
      const suffix = `?${field}=${variant}');`;
      const n = out.split(suffix).length - 1;
      if (n > 0) {
        out = out.split(suffix).join(rep(field));
        count += n;
      }
    }
  }
}

const dynamic = [
  [/encodeURIComponent\('Failed to submit test request: ' \+ err\.message\)/g, "encodeURIComponent(flashT(res, 'flash.failed_to_submit_test_request', { message: err.message }))"],
  [/encodeURIComponent\('Failed to submit imaging request: ' \+ err\.message\)/g, "encodeURIComponent(flashT(res, 'flash.failed_to_submit_imaging_request', { message: err.message }))"],
  [/encodeURIComponent\('Activated deployment profiles: ' \+ names\)/g, "encodeURIComponent(flashT(res, 'flash.activated_deployment_profiles', { names }))"],
  [/encodeURIComponent\('Deployment saved: ' \+ label \+ ' \(legacy global mode\)\.'\)/g, "encodeURIComponent(flashT(res, 'flash.deployment_saved', { label }))"],
  [/encodeURIComponent\('Could not save deployment mode\. ' \+ \(err\.message \|\| ''\)\)/g, "encodeURIComponent(flashT(res, 'flash.could_not_save_deployment_mode', { message: err.message || '' }))"],
  [/encodeURIComponent\('Facility "' \+ data\.name \+ '" created\.'\)/g, "encodeURIComponent(flashT(res, 'flash.facility_created', { name: data.name }))"],
  [/encodeURIComponent\('Facility "' \+ data\.name \+ '" saved\.'\)/g, "encodeURIComponent(flashT(res, 'flash.facility_saved', { name: data.name }))"],
  [/encodeURIComponent\('Request ' \+ created\.requestNo \+ ' saved\.'\)/g, "encodeURIComponent(flashT(res, 'flash.request_saved', { no: created.requestNo }))"],
  [/encodeURIComponent\('Create failed: ' \+ e\.message\)/g, "encodeURIComponent(flashT(res, 'flash.create_failed', { message: e.message }))"],
  [/encodeURIComponent\('Update failed: ' \+ e\.message\)/g, "encodeURIComponent(flashT(res, 'flash.update_failed', { message: e.message }))"],
  [/encodeURIComponent\('Import failed: ' \+ e\.message\)/g, "encodeURIComponent(flashT(res, 'flash.import_failed', { message: e.message }))"],
  [/encodeURIComponent\('Merge failed: ' \+ e\.message\)/g, "encodeURIComponent(flashT(res, 'flash.merge_failed', { message: e.message }))"],
  [/encodeURIComponent\('Autofill failed: ' \+ e\.message\)/g, "encodeURIComponent(flashT(res, 'flash.autofill_failed', { message: e.message }))"],
  [/encodeURIComponent\('Pharmacy "Used for" auto-fill completed\. Review Uncategorized items and adjust if needed\.'\)/g, "encodeURIComponent(flashT(res, 'flash.pharmacy_autofill_completed'))"],
  [/encodeURIComponent\('Payment Collected! Receipt: ' \+ receipt_no \+ ' · Invoice: ' \+ invoice_no\)/g, "encodeURIComponent(flashT(res, 'flash.payment_collected', { receipt: receipt_no, invoice: invoice_no }))"],
  [/encodeURIComponent\('Consultation link failed: ' \+ e\.message\)/g, "encodeURIComponent(flashT(res, 'flash.consultation_link_failed', { message: e.message }))"],
  [/encodeURIComponent\('Could not load patient record: ' \+ dbErr\.message\)/g, "encodeURIComponent(flashT(res, 'flash.could_not_load_patient_record', { message: dbErr.message }))"],
  [/encodeURIComponent\('Save failed: ' \+ err\.message\)/g, "encodeURIComponent(flashT(res, 'flash.save_failed', { message: err.message }))"],
  [/encodeURIComponent\('Appointment rescheduled to ' \+ req\.body\.date \+ ' ' \+ req\.body\.time \+ '\. Awaiting confirmation\.'\)/g, "encodeURIComponent(flashT(res, 'flash.appointment_rescheduled', { date: req.body.date, time: req.body.time }))"],
  [/encodeURIComponent\('Visit advanced to: ' \+ next\.replace\(\/_\/g, ' '\)\)/g, "encodeURIComponent(flashT(res, 'flash.visit_advanced', { status: next.replace(/_/g, ' ') }))"],
  [/encodeURIComponent\('Visit status set to: ' \+ newStatus\.replace\(\/_\/g, ' '\)\)/g, "encodeURIComponent(flashT(res, 'flash.visit_status_set', { status: newStatus.replace(/_/g, ' ') }))"],
  [/encodeURIComponent\('This visit is already ' \+ qs\.replace\(\/_\/g, ' '\) \+ '\.'\)/g, "encodeURIComponent(flashT(res, 'flash.visit_already_status', { status: qs.replace(/_/g, ' ') }))"],
  [/encodeURIComponent\('Bed added: ' \+ ward_name \+ ' \/ ' \+ bed_label\)/g, "encodeURIComponent(flashT(res, 'flash.bed_added', { ward: ward_name, bed: bed_label }))"],
  [/encodeURIComponent\('Bed removed: ' \+ label\)/g, "encodeURIComponent(flashT(res, 'flash.bed_removed', { label }))"],
  [/encodeURIComponent\('Patient admitted\. Admission #' \+ ins\.insertId\)/g, "encodeURIComponent(flashT(res, 'flash.patient_admitted', { id: ins.insertId }))"],
  [/encodeURIComponent\(duplicatePatientMessage\(duplicate\)\)/g, "encodeURIComponent(flashT(res, 'flash.duplicate_patient', { id: duplicate.id, name: ((duplicate.first_name||'')+' '+(duplicate.last_name||'')).trim() || flashT(res, 'flash.patient') }))"],
  [/\?err=Registration\+failed:\+' \+ encodeURIComponent\(err\.message\)/g, "?err=' + encodeURIComponent(flashT(res, 'flash.registration_failed', { message: err.message }))"],
  [/\?err=Update\+failed:\+' \+ encodeURIComponent\(err\.message\)/g, "?err=' + encodeURIComponent(flashT(res, 'flash.update_failed', { message: err.message }))"],
  [/\?err=Failed\+to\+create\+prescription:\+' \+ encodeURIComponent\(err\.message\)/g, "?err=' + encodeURIComponent(flashT(res, 'flash.failed_to_create_prescription', { message: err.message }))"],
  [/\?err=Consultation\+load\+failed:\+' \+ encodeURIComponent\(err\.message\)/g, "?err=' + encodeURIComponent(flashT(res, 'flash.consultation_load_failed', { message: err.message }))"],
  [/\?err=Save\+failed:\+' \+ encodeURIComponent\(err\.message\)/g, "?err=' + encodeURIComponent(flashT(res, 'flash.save_failed', { message: err.message }))"],
  [/\/cashier\?err=Payment failed: ' \+ encodeURIComponent\(err\.message\)/g, "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.payment_failed', { message: err.message }))"],
  [/\/cashier\?err=Print slip error: ' \+ err\.message/g, "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.print_slip_error', { message: err.message }))"],
  [/\/cashier\?msg=Ticket generated: ' \+ ticket_code \+ '&print=' \+ ticket_code/g, "/cashier?msg=' + encodeURIComponent(flashT(res, 'flash.ticket_generated', { code: ticket_code })) + '&print=' + ticket_code"],
  [/\/cashier\?err=System Error: ' \+ err\.message/g, "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.system_error', { message: err.message }))"],
  [/\/cashier\?err=Collection failed: ' \+ err\.message/g, "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.collection_failed', { message: err.message }))"],
  [/\?msg=Credit\+account\+opened\+for\+' \+ label/g, "?msg=' + encodeURIComponent(flashT(res, 'flash.credit_account_opened_for', { label }))"],
  [/\/patients\?err=Could\+not\+open\+credit:\+' \+ encodeURIComponent\(err\.message\)/g, "/patients?err=' + encodeURIComponent(flashT(res, 'flash.could_not_open_credit', { message: err.message }))"],
  [/\/wards\?err=Charge failed: ' \+ err\.message/g, "/wards?err=' + encodeURIComponent(flashT(res, 'flash.charge_failed', { message: err.message }))"],
];

for (const [re, rep] of dynamic) {
  const n = (out.match(re) || []).length;
  if (n) {
    out = out.replace(re, rep);
    count += n;
  }
}

out = out.replace(
  /return res\.redirect\(`\/cashier\?err=Selected physician is not assigned to the \$\{filterDept\} department\. Update their profile or choose another doctor\.`\);/g,
  "return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.selected_physician_not_assigned_dept', { dept: filterDept })));"
);
out = out.replace(
  /return res\.redirect\(`\/opd-queue\?err=Dr\. \$\{docRows\[0\]\.first_name\|\|''\} \$\{docRows\[0\]\.last_name\|\|''\} is not assigned to the \$\{department_name\} department\.`\);/g,
  "return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.physician_not_assigned_dept', { name: `Dr. ${docRows[0].first_name||''} ${docRows[0].last_name||''}`.trim(), dept: department_name })));"
);

fs.writeFileSync(appPath, out, 'utf8');
console.log('Total flashT replacements:', count);
console.log('flashT calls now:', (out.match(/flashT\(res/g) || []).length);
