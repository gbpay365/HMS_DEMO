#!/usr/bin/env node
'use strict';

/** Replace static res.render title strings with pageTitle(res, key, fallback). */
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'app.js');
let src = fs.readFileSync(appPath, 'utf8');

if (!src.includes("require('./lib/pageTitle')")) {
  src = src.replace(
    "const { flashT } = require('./lib/flashI18n');",
    "const { flashT } = require('./lib/flashI18n');\nconst { pageTitle } = require('./lib/pageTitle');"
  );
}

const map = [
  ["title: 'Login - ZAIZENS'", "title: pageTitle(res, 'document_titles.login', 'Login — ZAIZENS')"],
  ["title: 'Super Admin - ZAIZENS'", "title: pageTitle(res, 'document_titles.super_admin', 'Super Admin — ZAIZENS')"],
  ["title: 'My Profile - ZAIZENS'", "title: pageTitle(res, 'document_titles.profile', 'My Profile — ZAIZENS')"],
  ["title: 'Dashboard - ZAIZENS'", "title: pageTitle(res, 'document_titles.dashboard', 'Dashboard — ZAIZENS')"],
  ["title: 'Patients - ZAIZENS'", "title: pageTitle(res, 'document_titles.patients', 'Patients — ZAIZENS')"],
  ["title: 'Merge patients — duplicate review'", "title: pageTitle(res, 'document_titles.merge_patients', 'Merge patients — duplicate review')"],
  ["title: 'Medications (consultation)'", "title: pageTitle(res, 'document_titles.medications_consultation', 'Medications (consultation)')"],
  ["title: 'Follow-up consultation'", "title: pageTitle(res, 'document_titles.follow_up_consultation', 'Follow-up consultation')"],
  ["title: 'Appointments - ZAIZENS'", "title: pageTitle(res, 'document_titles.appointments', 'Appointments — ZAIZENS')"],
  ["title: 'Online booking configuration'", "title: pageTitle(res, 'document_titles.online_booking_config', 'Online booking configuration')"],
  ["title: 'Front Desk - ZAIZENS'", "title: pageTitle(res, 'document_titles.front_desk', 'Front Desk — ZAIZENS')"],
  ["title: 'Doctors - ZAIZENS'", "title: pageTitle(res, 'document_titles.doctors', 'Doctors — ZAIZENS')"],
  ["title: 'Laboratory - ZAIZENS'", "title: pageTitle(res, 'document_titles.laboratory', 'Laboratory — ZAIZENS')"],
  ["title: 'Laboratory · Order alerts'", "title: pageTitle(res, 'document_titles.lab_order_alerts', 'Laboratory · Order alerts')"],
  ["title: 'Radiology · Order alerts'", "title: pageTitle(res, 'document_titles.radiology_order_alerts', 'Radiology · Order alerts')"],
  ["title: 'Pharmacy · Order alerts'", "title: pageTitle(res, 'document_titles.pharmacy_order_alerts', 'Pharmacy · Order alerts')"],
  ["title: 'Radiology — Requests'", "title: pageTitle(res, 'document_titles.radiology_requests', 'Radiology — Requests')"],
  ["title: 'Radiology request'", "title: pageTitle(res, 'document_titles.radiology_request', 'Radiology request')"],
  ["title: 'Radiology test results'", "title: pageTitle(res, 'document_titles.radiology_results', 'Radiology test results')"],
  ["title: 'Radiology configuration'", "title: pageTitle(res, 'document_titles.radiology_config', 'Radiology configuration')"],
  ["title: 'Radiology Workflow - ZAIZENS'", "title: pageTitle(res, 'document_titles.radiology_workflow', 'Radiology Workflow — ZAIZENS')"],
  ["title: 'Pharmacy'", "title: pageTitle(res, 'document_titles.pharmacy', 'Pharmacy')"],
  ["title: 'Prescriptions - ZAIZENS'", "title: pageTitle(res, 'document_titles.prescriptions', 'Prescriptions — ZAIZENS')"],
  ["title: 'Billing - ZAIZENS'", "title: pageTitle(res, 'document_titles.billing', 'Billing — ZAIZENS')"],
  ["title: 'Receipts & Invoices — ZAIZENS'", "title: pageTitle(res, 'document_titles.receipts_invoices', 'Receipts & Invoices — ZAIZENS')"],
  ["title: 'Accounting - ZAIZENS'", "title: pageTitle(res, 'document_titles.accounting', 'Accounting — ZAIZENS')"],
  ["title: 'Accounting'", "title: pageTitle(res, 'document_titles.accounting_short', 'Accounting')"],
  ["title: 'Payroll & HR - ZAIZENS'", "title: pageTitle(res, 'document_titles.payroll_hr', 'Payroll & HR — ZAIZENS')"],
  ["title: 'Balance Sheet - ZAIZENS'", "title: pageTitle(res, 'document_titles.balance_sheet', 'Balance Sheet — ZAIZENS')"],
  ["title: 'Inventory - ZAIZENS'", "title: pageTitle(res, 'document_titles.inventory', 'Inventory — ZAIZENS')"],
  ["title: 'Stock movements — ZAIZENS'", "title: pageTitle(res, 'document_titles.stock_movements', 'Stock movements — ZAIZENS')"],
  ["title: 'Staff - ZAIZENS'", "title: pageTitle(res, 'document_titles.staff', 'Staff — ZAIZENS')"],
  ["title: 'Reports - ZAIZENS'", "title: pageTitle(res, 'document_titles.reports', 'Reports — ZAIZENS')"],
  ["title: 'Patient Portal Login'", "title: pageTitle(res, 'document_titles.portal_login', 'Patient Portal Login')"],
  ["title: 'My Care Portal'", "title: pageTitle(res, 'document_titles.portal_dashboard', 'My Care Portal')"],
  ["title: 'Set Portal Password'", "title: pageTitle(res, 'document_titles.set_portal_password', 'Set Portal Password')"],
];

let n = 0;
for (const [from, to] of map) {
  const before = src;
  src = src.split(from).join(to);
  if (src !== before) n += (before.split(from).length - 1);
}

// Patient directory with brand
src = src.replace(
  /title: 'Patient Directory — ' \+ \(hmsBrand\.facilityName \|\| hmsBrand\.name\)/g,
  "title: pageTitle(res, 'document_titles.patient_directory', 'Patient Directory — {{brand}}', { brand: hmsBrand.facilityName || hmsBrand.name })"
);

// Lab test dynamic
src = src.replace(
  /title: 'Lab test · ' \+ \(row\.test_name \|\| 'Result'\) \+ ' · ZAIZENS'/g,
  "title: pageTitle(res, 'document_titles.lab_test_result', 'Lab test · {{name}} · ZAIZENS', { name: row.test_name || 'Result' })"
);

// Prescription dynamic
src = src.replace(
  /title: 'Prescription #RX-' \+ req\.params\.id/g,
  "title: pageTitle(res, 'document_titles.prescription_detail', 'Prescription #RX-{{id}}', { id: req.params.id })"
);
src = src.replace(
  /title: 'Print Rx #RX-' \+ req\.params\.id/g,
  "title: pageTitle(res, 'document_titles.print_rx', 'Print Rx #RX-{{id}}', { id: req.params.id })"
);

const batch2 = [
  ["title: 'Cashier - ZAIZENS'", "title: pageTitle(res, 'document_titles.cashier', 'Cashier — ZAIZENS')"],
  ["title: 'Service Catalog - ZAIZENS'", "title: pageTitle(res, 'document_titles.service_catalog', 'Service Catalog — ZAIZENS')"],
  ["title: 'Visits & OPD Registry - ZAIZENS'", "title: pageTitle(res, 'document_titles.visits_opd_registry', 'Visits & OPD Registry — ZAIZENS')"],
  ["title: 'New Consultation — ZAIZENS'", "title: pageTitle(res, 'document_titles.new_consultation', 'New Consultation — ZAIZENS')"],
  ["title: 'New Consultation - ZAIZENS'", "title: pageTitle(res, 'document_titles.new_consultation', 'New Consultation — ZAIZENS')"],
  ["title: 'Patient not assigned to you'", "title: pageTitle(res, 'document_titles.patient_not_assigned', 'Patient not assigned to you')"],
  ["title: 'Consultation Rooms — ZAIZENS'", "title: pageTitle(res, 'document_titles.consultation_rooms', 'Consultation Rooms — ZAIZENS')"],
  ["title: 'Nursing Vitals - ZAIZENS'", "title: pageTitle(res, 'document_titles.nursing_vitals', 'Nursing Vitals — ZAIZENS')"],
  ["title: 'Nurse Shift Roster - ZAIZENS'", "title: pageTitle(res, 'document_titles.nurse_roster', 'Nurse Shift Roster — ZAIZENS')"],
  ["title: 'Wallet Management - ZAIZENS'", "title: pageTitle(res, 'document_titles.wallet_management', 'Wallet Management — ZAIZENS')"],
  ["title: 'Patient Wallets - ZAIZENS'", "title: pageTitle(res, 'document_titles.patient_wallets', 'Patient Wallets — ZAIZENS')"],
  ["title: 'Insurance Carriers - ZAIZENS'", "title: pageTitle(res, 'document_titles.insurance_carriers', 'Insurance Carriers — ZAIZENS')"],
  ["title: 'Insurance Claims - ZAIZENS'", "title: pageTitle(res, 'document_titles.insurance_claims', 'Insurance Claims — ZAIZENS')"],
  ["title: 'Workflow Guides - ZAIZENS'", "title: pageTitle(res, 'document_titles.workflow_guides', 'Workflow Guides — ZAIZENS')"],
  ["title: 'User Manual - ZAIZENS'", "title: pageTitle(res, 'document_titles.user_manual', 'User Manual — ZAIZENS')"],
  ["title: 'Patient Insurance - ZAIZENS'", "title: pageTitle(res, 'document_titles.patient_insurance', 'Patient Insurance — ZAIZENS')"],
  ["title: 'Telemedicine consultation'", "title: pageTitle(res, 'document_titles.telemedicine_consultation', 'Telemedicine consultation')"],
  ["title: 'Credit & Receivables - ZAIZENS'", "title: pageTitle(res, 'document_titles.credit_receivables', 'Credit & Receivables — ZAIZENS')"],
  ["title: 'Credit Account - ZAIZENS'", "title: pageTitle(res, 'document_titles.credit_account', 'Credit Account — ZAIZENS')"],
  ["title: 'Doctor Duty Roster - ZAIZENS'", "title: pageTitle(res, 'document_titles.doctor_duty_roster', 'Doctor Duty Roster — ZAIZENS')"],
  ["title: 'Running Bill - ZAIZENS'", "title: pageTitle(res, 'document_titles.running_bill', 'Running Bill — ZAIZENS')"],
  ["title: 'IPD Census - ZAIZENS'", "title: pageTitle(res, 'document_titles.ipd_census', 'IPD Census — ZAIZENS')"],
  ["title: 'Ward Board / IPD - ZAIZENS'", "title: pageTitle(res, 'document_titles.ward_board', 'Ward Board / IPD — ZAIZENS')"],
  ["title: 'Ward Rounds - ZAIZENS'", "title: pageTitle(res, 'document_titles.ward_rounds', 'Ward Rounds — ZAIZENS')"],
];
for (const [from, to] of batch2) {
  const before = src;
  src = src.split(from).join(to);
  if (src !== before) n += (before.split(from).length - 1);
}

src = src.replace(
  /title: 'Legacy module overrides — ' \+ legacy\.productMode/g,
  "title: pageTitle(res, 'document_titles.legacy_module_overrides', 'Legacy module overrides — {{mode}}', { mode: legacy.productMode })"
);
src = src.replace(
  /title: 'Module overrides — ' \+ profile\.name/g,
  "title: pageTitle(res, 'document_titles.module_overrides', 'Module overrides — {{name}}', { name: profile.name })"
);
src = src.replace(
  /title: 'Expiry warning · ' \+ ctx\.code/g,
  "title: pageTitle(res, 'document_titles.expiry_warning', 'Expiry warning · {{code}}', { code: ctx.code })"
);
src = src.replace(
  /title: 'Payment Code -' \+ code/g,
  "title: pageTitle(res, 'document_titles.payment_code', 'Payment Code — {{code}}', { code: code })"
);
src = src.replace(
  /title: 'Settle Payment -' \+ ticket\.ticket_code/g,
  "title: pageTitle(res, 'document_titles.settle_payment', 'Settle Payment — {{code}}', { code: ticket.ticket_code })"
);
src = src.replace(
  /title: 'Fiscal Receipt -' \+ receipt\.doc_number/g,
  "title: pageTitle(res, 'document_titles.fiscal_receipt', 'Fiscal Receipt — {{num}}', { num: receipt.doc_number })"
);
src = src.replace(
  /title: 'Receipt - ' \+ receipt\.doc_number/g,
  "title: pageTitle(res, 'document_titles.receipt', 'Receipt — {{num}}', { num: receipt.doc_number })"
);
src = src.replace(
  /title: 'Invoice - ' \+ \(doc\.invoice_doc_number \|\| doc\.doc_number\)/g,
  "title: pageTitle(res, 'document_titles.invoice', 'Invoice — {{num}}', { num: doc.invoice_doc_number || doc.doc_number })"
);
src = src.replace(
  /title: 'Print Ticket -' \+ ticket\.ticket_code/g,
  "title: pageTitle(res, 'document_titles.print_ticket', 'Print Ticket — {{code}}', { code: ticket.ticket_code })"
);
src = src.replace(
  /title: 'Prescription #RX-' \+ rxId/g,
  "title: pageTitle(res, 'document_titles.prescription_rx', 'Prescription #RX-{{id}}', { id: rxId })"
);
src = src.replace(
  /title: 'Print Rx #RX-' \+ rxId/g,
  "title: pageTitle(res, 'document_titles.print_rx_id', 'Print Rx #RX-{{id}}', { id: rxId })"
);

fs.writeFileSync(appPath, src);
console.log('Replaced', n, 'static page titles');
