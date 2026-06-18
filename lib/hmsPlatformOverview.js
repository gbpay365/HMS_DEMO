/**
 * Help & database setup — content parity with htdocs_php/htdocs/platform-overview.php.
 */
const { tableExists } = require('./hmsFinGeneralLedger');

const MIGRATION_BASE = 'htdocs_php/htdocs/database/migrations';

/** Ordered migration notes (PHP platform-overview.php). */
const MIGRATION_STEPS = [
 { file: '001_multi_site_platform.sql', text: 'Run first — facilities, ACL, core platform.' },
 {
  file: '002_patient_portal.sql',
  text: 'Optional — patient portal login columns on tbl_patient.',
  optional: true
 },
 {
  file: '003_clinical_workflow.sql',
  text: 'After 001 — lab catalogue, consultations, prescriptions, pharmacy queue.'
 },
 {
  file: '012_service_catalog.sql',
  text: 'Price catalog; with 027_inventory_stock_categories.sql for stock categories.'
 },
 {
  file: '027_inventory_stock_categories.sql',
  text: 'Inventory categories and movements.'
 },
 {
  file: '037_pharmacy_inventory_catalog_link.sql',
  text: 'Links inventory to pharmacy catalog and prescription formulary.'
 },
 {
  file: '013_remove_encounters_clinical_orders.sql',
  text: 'Optional — drop legacy encounter/CPOE tables if unused.',
  optional: true
 },
 {
  file: '004_opd_queue_admission.sql',
  text: 'After 003 (or 001) — OPD queue and admission fields.'
 },
 {
  file: '005_cameroon_sample_patients_doctors.sql',
  text: 'Optional demo patients and doctors.',
  optional: true
 },
 { file: '006_insurance_and_payments_core.sql', text: 'Insurance carriers and patient policies.' },
 {
  file: '011_receipt_invoice_module.sql',
  text: 'Billing documents and receipt lines — requires 001.'
 },
 { file: '017_transactions_ledger_link.sql', text: 'Optional — links receipts to tbl_transaction.' },
 { file: '018_facility_admission_billing_episode.sql', text: 'Facility admission and billing episode anchors.' },
 {
  file: '019_credit_receivables.sql',
  text: 'Credit accounts, patient receivables, tbl_fin_journal_* (GL).'
 },
 { file: '020_vitals_recorder_and_station.sql', text: 'Vitals recorder and triage station metadata.' },
 {
  file: '021_vitals_weight_height_waist.sql',
  text: 'Optional anthropometrics on tbl_vital_sign.',
  optional: true
 },
 { file: '022_consult_billing_override_permission.sql', text: 'ACL consult.billing_override.' },
 { file: '023_payment_ticket_cashier.sql', text: 'Cashier payment codes and baskets.' },
 { file: '024_lab_radiology_result_workflow.sql', text: 'Structured lab/radiology results and notices.' },
 { file: '025_insurance_coverage_external_docs.sql', text: 'Insurer % and external document uploads.' },
 { file: '026_expense_management.sql', text: 'tbl_expense and expenses.read / expenses.write ACL.' },
 {
  file: '029_ohada_reporting_tax.sql',
  text: 'Tax settings, declarations, financials.read / financials.write — after 019.'
 },
 {
  file: '038_fin_tax_setting_value_widen.sql',
  text: 'Optional — widen tax setting values.',
  optional: true
 },
 { file: '039_tax_payroll_cnps_dipe.sql', text: 'Payroll tax / CNPS / DIPE tables.' },
 { file: '040_hr_payroll_leave_attendance.sql', text: 'HR pay profiles, leave, attendance.' },
 { file: '041_acl_employee_read.sql', text: 'ACL employee.read for directory and HR self-service.' }
];

const WORKFLOW_STEPS = [
 {
  title: 'Clinical chart & consultation',
  text: 'The doctor records the visit; prescribed laboratory and radiology lines are stored on the consultation. The patient chart shows consultations, tests, results, prescriptions, insurance co-pay %, and external documents.'
 },
 {
  title: 'Cashier & partial payment',
  text: 'A payment code may bundle consultation, lab, radiology, and pharmacy lines. The patient can pay selected lines now and return with the same code for the remainder. Insurer % on the policy sets patient co-pay at the desk.'
 },
 {
  title: 'External care & pending codes',
  text: 'Staff can cancel pending cashier codes or use zero–patient-due tickets when care is external or fully insured. Upload external reports so doctors still see them on the chart.'
 },
 {
  title: 'Service verification & results',
  text: 'Laboratory and radiology portals verify the code, capture structured results, and finalize notices to the patient portal and referring doctor. Pharmacy uses payment verification and dispense receipt flow.'
 }
];

/** Key tables surfaced on the help page (migration hint). */
const SCHEMA_CHECKS = [
 { table: 'tbl_facility', migration: '001', label: 'Platform / facilities' },
 { table: 'tbl_patient', migration: '001', label: 'Patients' },
 { table: 'tbl_opd_visit', migration: '004', label: 'OPD visits' },
 { table: 'tbl_billing_document', migration: '011', label: 'Receipts / billing documents' },
 { table: 'tbl_fin_journal_header', migration: '019', label: 'General ledger journals' },
 { table: 'tbl_expense', migration: '026', label: 'Expense register' },
 { table: 'tbl_fin_tax_setting', migration: '029', label: 'Tax settings' }
];

/**
 * @param {import('mysql2/promise').Pool} pool
 */
async function platformSchemaStatus(pool) {
 const out = [];
 for (const row of SCHEMA_CHECKS) {
  let ok = false;
  try {
   ok = await tableExists(pool, row.table);
  } catch (_) {
   ok = false;
  }
  out.push({ ...row, ok });
 }
 return out;
}

function migrationPath(file) {
 return `${MIGRATION_BASE}/${file}`;
}

module.exports = {
 MIGRATION_BASE,
 MIGRATION_STEPS,
 WORKFLOW_STEPS,
 SCHEMA_CHECKS,
 migrationPath,
 platformSchemaStatus
};
