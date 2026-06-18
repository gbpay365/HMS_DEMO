'use strict';
const fs = require('fs');
const path = require('path');
const appPath = path.join(__dirname, '..', 'app.js');
let out = fs.readFileSync(appPath, 'utf8');

const pairs = [
  ["/patients?err=Email+is+required+when+portal+access+is+enabled.", "/patients?err=' + encodeURIComponent(flashT(res, 'flash.email_is_required_when_portal_access_is_enabled'))"],
  ["/patients?err=Invalid+patient.", "/patients?err=' + encodeURIComponent(flashT(res, 'flash.invalid_patient_2'))"],
  ["/cashier?err=Invalid admission.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.invalid_admission'))"],
  ["/cashier?err=Admission not found or already discharged.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.admission_not_found_or_discharged'))"],
  ["/cashier?err=Select a valid patient.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.select_a_valid_patient'))"],
  ["/cashier?err=Select a valid service from the catalog.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.select_valid_service_catalog'))"],
  ["/cashier?err=Service not found in catalog.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.service_not_found_in_catalog'))"],
  ["/cashier?err=Select the assigned physician for this consultation.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.select_assigned_physician'))"],
  ["/cashier?err=Select the specialist specialisation.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.select_specialist_specialisation'))"],
  ["/cashier?err=Selected physician does not match the chosen specialisation.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.physician_not_match_specialisation'))"],
  ["/cashier?err=Selected physician is not eligible for general consultation.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.physician_not_eligible_general'))"],
  ["/cashier?err=Payment failed: ' + encodeURIComponent(err.message)", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.payment_failed', { message: err.message }))"],
  ["/cashier?err=Slip not found.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.slip_not_found'))"],
  ["/cashier?err=Print slip error: ' + err.message", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.print_slip_error', { message: err.message }))"],
  ["/cashier?err=Missing patient or service selection.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.missing_patient_or_service'))"],
  ["/cashier?msg=Ticket generated: ' + ticket_code + '&print=' + ticket_code", "/cashier?msg=' + encodeURIComponent(flashT(res, 'flash.ticket_generated', { code: ticket_code })) + '&print=' + ticket_code"],
  ["/cashier?err=System Error: ' + err.message", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.system_error', { message: err.message }))"],
  ["/cashier?err=Ticket not found.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.ticket_not_found'))"],
  ["/cashier?err=Ticket not found or already paid.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.ticket_not_found_or_paid'))"],
  ["/cashier?err=No wallet Account", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.no_wallet_account'))"],
  ["/cashier?err=Not enough Funds, please topup", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.not_enough_funds_please_topup'))"],
  ["/cashier?err=Collection failed: ' + err.message", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.collection_failed', { message: err.message }))"],
  ["/cashier?err=Lookup failed.", "/cashier?err=' + encodeURIComponent(flashT(res, 'flash.lookup_failed'))"],
  ["/opd-queue?err=Invalid consultation link.", "/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_consultation_link'))"],
  ["/opd-queue?err=No visit found for that patient.", "/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.no_visit_for_patient'))"],
  ["/opd-queue?err=Invalid+consultation+link+(missing+visit).", "/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_consultation_link_missing_visit'))"],
  ["/opd-queue?err=Invalid consultation data.", "/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_consultation_data'))"],
  ["/nursing/vitals?msg=Vitals+saved.", "/nursing/vitals?msg=' + encodeURIComponent(flashT(res, 'flash.vitals_saved'))"],
  ["/opd-queue?err=Invalid triage request.", "/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_triage_request'))"],
  ["?msg=Policy+saved", "?msg=' + encodeURIComponent(flashT(res, 'flash.policy_saved'))"],
  ["?msg=Policy+removed", "?msg=' + encodeURIComponent(flashT(res, 'flash.policy_removed'))"],
  ["?msg=Credit+account+opened+for+' + label", "?msg=' + encodeURIComponent(flashT(res, 'flash.credit_account_opened_for', { label }))"],
  ["/patients?err=Could+not+open+credit:+' + encodeURIComponent(err.message)", "/patients?err=' + encodeURIComponent(flashT(res, 'flash.could_not_open_credit', { message: err.message }))"],
  ["/opd-queue?err=Select a valid patient.", "/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.select_a_valid_patient'))"],
  ["/opd-queue?err=Selected physician is not valid.", "/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.selected_physician_not_valid'))"],
  ["/opd-queue?err=Invalid+visit.", "/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.invalid_visit_2'))"],
  ["/wards?err=Invalid charge data.", "/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_charge_data'))"],
  ["/wards?err=Admission not found or already discharged.", "/wards?err=' + encodeURIComponent(flashT(res, 'flash.admission_not_found_or_discharged'))"],
  ["/wards?err=Charge failed: ' + err.message", "/wards?err=' + encodeURIComponent(flashT(res, 'flash.charge_failed', { message: err.message }))"],
  ["/wards?err=Invalid admission.", "/wards?err=' + encodeURIComponent(flashT(res, 'flash.invalid_admission'))"],
  ["encodeURIComponent('Pharmacy \"Used for\" auto-fill completed. Review Uncategorized items and adjust if needed.')", "encodeURIComponent(flashT(res, 'flash.pharmacy_autofill_completed'))"],
];

out = out.replace(
  /return res\.redirect\(`\/cashier\?err=Selected physician is not assigned to the \$\{filterDept\} department\. Update their profile or choose another doctor\.`\);/g,
  "return res.redirect('/cashier?err=' + encodeURIComponent(flashT(res, 'flash.selected_physician_not_assigned_dept', { dept: filterDept })));"
);
out = out.replace(
  /return res\.redirect\(`\/opd-queue\?err=Dr\. \$\{docRows\[0\]\.first_name\|\|''\} \$\{docRows\[0\]\.last_name\|\|''\} is not assigned to the \$\{department_name\} department\.`\);/g,
  "return res.redirect('/opd-queue?err=' + encodeURIComponent(flashT(res, 'flash.physician_not_assigned_dept', { name: `Dr. ${docRows[0].first_name||''} ${docRows[0].last_name||''}`.trim(), dept: department_name })));"
);

let n = 0;
for (const [from, to] of pairs) {
  const count = out.split(from).length - 1;
  if (count > 0) {
    out = out.split(from).join(to);
    n += count;
  }
}
fs.writeFileSync(appPath, out, 'utf8');
console.log('Replacements:', n);
