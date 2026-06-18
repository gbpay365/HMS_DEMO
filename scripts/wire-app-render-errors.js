#!/usr/bin/env node
'use strict';

/** Replace res.status(...).render('error', ...) with renderAppError(...) in app.js */
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'app.js');
let src = fs.readFileSync(appPath, 'utf8');

const staticMap = {
  'Super Admin console failure.': "renderAppError(res, 500, 'page.super_admin_failure', 'Super Admin console failure.')",
  'Could not fetch patients.': "renderAppError(res, 500, 'page.load_patients', 'Could not fetch patients.')",
  'Could not prepare patient list for print.': "renderAppError(res, 500, 'page.load_patient_print', 'Could not prepare patient list for print.')",
  'Failed to load medical record.': "renderAppError(res, 500, 'page.load_medical_record', 'Failed to load medical record.')",
  'Could not fetch appointments.': "renderAppError(res, 500, 'page.load_appointments', 'Could not fetch appointments.')",
  'Could not fetch doctors.': "renderAppError(res, 500, 'page.load_doctors', 'Could not fetch doctors.')",
  'Could not fetch lab results.': "renderAppError(res, 500, 'page.load_lab_results', 'Could not fetch lab results.')",
  'Could not fetch radiology requests.': "renderAppError(res, 500, 'page.load_radiology_requests', 'Could not fetch radiology requests.')",
  'Could not fetch prescriptions.': "renderAppError(res, 500, 'page.load_prescriptions', 'Could not fetch prescriptions.')",
  'Cannot load prescription.': "renderAppError(res, 500, 'page.load_prescription', 'Cannot load prescription.')",
  'Payroll page failed to load.': "renderAppError(res, 500, 'page.load_payroll', 'Payroll page failed to load.')",
  'Staff load failure.': "renderAppError(res, 500, 'page.load_staff', 'Staff load failure.')",
  'Reports load failure.': "renderAppError(res, 500, 'page.load_reports', 'Reports load failure.')",
};

const detailMap = [
  ["'Could not load dashboard: ' + err.message", "renderAppError(res, 500, 'page.load_dashboard', 'Could not load dashboard.', { detail: err.message })"],
  ["'Failed to book appointment: ' + err.message", "renderAppError(res, 500, 'page.book_appointment', 'Failed to book appointment.', { detail: err.message })"],
  ["'Front Desk load failure: ' + err.message", "renderAppError(res, 500, 'page.load_front_desk', 'Front Desk load failure.', { detail: err.message })"],
  ["'Could not load radiology workflow: ' + err.message", "renderAppError(res, 500, 'page.load_radiology_workflow', 'Could not load radiology workflow.', { detail: err.message })"],
  ["'Pharmacy load failure: ' + err.message", "renderAppError(res, 500, 'page.load_pharmacy', 'Pharmacy load failure.', { detail: err.message })"],
  ["'Billing load failure: ' + err.message", "renderAppError(res, 500, 'page.load_billing', 'Billing load failure.', { detail: err.message })"],
  ["'Financials load failure: ' + err.message", "renderAppError(res, 500, 'page.load_financials', 'Financials load failure.', { detail: err.message })"],
  ["'Inventory load failure: ' + err.message", "renderAppError(res, 500, 'page.load_inventory', 'Inventory load failure.', { detail: err.message })"],
  ["'Cashier load failure: ' + err.message", "renderAppError(res, 500, 'page.load_cashier', 'Cashier load failure.', { detail: err.message })"],
  ["'Could not load service catalog: ' + e.message", "renderAppError(res, 500, 'page.load_service_catalog', 'Could not load service catalog.', { detail: e.message })"],
  ["'Visits load failure: ' + err.message", "renderAppError(res, 500, 'page.load_visits', 'Visits load failure.', { detail: err.message })"],
  ["'Vitals page load failure: ' + err.message", "renderAppError(res, 500, 'page.load_vitals', 'Vitals page load failure.', { detail: err.message })"],
  ["'Roster load failure: ' + err.message", "renderAppError(res, 500, 'page.load_roster', 'Roster load failure.', { detail: err.message })"],
  ["'Wallet load failure: ' + err.message", "renderAppError(res, 500, 'page.load_wallet', 'Wallet load failure.', { detail: err.message })"],
  ["'Wallet page load failure: ' + err.message", "renderAppError(res, 500, 'page.load_wallet_page', 'Wallet page load failure.', { detail: err.message })"],
  ["'Insurance load failure: ' + err.message", "renderAppError(res, 500, 'page.load_insurance', 'Insurance load failure.', { detail: err.message })"],
  ["'Insurance claims load failure: ' + err.message", "renderAppError(res, 500, 'page.load_insurance_claims', 'Insurance claims load failure.', { detail: err.message })"],
  ["'Workflow guides load failure: ' + err.message", "renderAppError(res, 500, 'page.load_workflow_guides', 'Workflow guides load failure.', { detail: err.message })"],
  ["'User manual load failure: ' + err.message", "renderAppError(res, 500, 'page.load_user_manual', 'User manual load failure.', { detail: err.message })"],
  ["'Portal load failure: ' + err.message", "renderAppError(res, 500, 'page.load_portal', 'Portal load failure.', { detail: err.message })"],
  ["'Credit receivables load failure: ' + err.message", "renderAppError(res, 500, 'page.load_credit_receivables', 'Credit receivables load failure.', { detail: err.message })"],
  ["'Credit account load failure: ' + err.message", "renderAppError(res, 500, 'page.load_credit_account', 'Credit account load failure.', { detail: err.message })"],
  ["'Doctor roster failure: ' + err.message", "renderAppError(res, 500, 'page.load_doctor_roster', 'Doctor roster failure.', { detail: err.message })"],
  ["'Running bill load failure: ' + err.message", "renderAppError(res, 500, 'page.load_running_bill', 'Running bill load failure.', { detail: err.message })"],
  ["'Census load failure: ' + err.message", "renderAppError(res, 500, 'page.load_census', 'Census load failure.', { detail: err.message })"],
  ["'Ward board load failure: ' + err.message", "renderAppError(res, 500, 'page.load_ward_board', 'Ward board load failure.', { detail: err.message })"],
  ["'Ward rounds load failure: ' + err.message", "renderAppError(res, 500, 'page.load_ward_rounds', 'Ward rounds load failure.', { detail: err.message })"],
];

let count = 0;

for (const [msg, replacement] of Object.entries(staticMap)) {
  const re = new RegExp(
    `res\\.status\\(500\\)\\.render\\('error', \\{ title: 'Error', message: '${msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}', status: 500 \\}\\);`,
    'g'
  );
  const before = src;
  src = src.replace(re, () => { count++; return replacement; });
  if (before !== src) console.log('static:', msg.slice(0, 40));
}

for (const [expr, replacement] of detailMap) {
  const re = new RegExp(
    `res\\.status\\(500\\)\\.render\\('error', \\{ title: 'Error', message: ${expr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, status: 500 \\}\\);`,
    'g'
  );
  const before = src;
  src = src.replace(re, () => { count++; return replacement; });
  if (before !== src) console.log('detail:', expr.slice(0, 50));
}

// e.message || 'Load failed'
src = src.replace(
  /res\.status\(500\)\.render\('error', \{ title: 'Error', message: e\.message \|\| 'Load failed', status: 500 \}\);/g,
  () => { count++; return "renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });"; }
);

// e.message alone (no fallback)
src = src.replace(
  /res\.status\(500\)\.render\('error', \{ title: 'Error', message: e\.message, status: 500 \}\);/g,
  () => { count++; return "renderAppError(res, 500, 'page.load_failed', 'Load failed', { detail: e.message });"; }
);

// Could not load duplicates
src = src.replace(
  /res\.status\(500\)\.render\('error', \{ title: 'Error', message: e\.message \|\| 'Could not load duplicates\.', status: 500 \}\);/g,
  () => { count++; return "renderAppError(res, 500, 'page.load_duplicates', 'Could not load duplicates.', { detail: e.message });"; }
);

// 404 radiology
src = src.replace(
  /return res\.status\(404\)\.render\('error', \{ title: 'Not found', message: 'Radiology request not found\.', status: 404 \}\);/g,
  () => { count++; return "return renderAppError(res, 404, 'page.radiology_not_found', 'Radiology request not found.');"; }
);

const remaining = (src.match(/render\('error'/g) || []).length;
fs.writeFileSync(appPath, src);
console.log(`Replaced ${count} error renders. Remaining render('error'): ${remaining}`);
