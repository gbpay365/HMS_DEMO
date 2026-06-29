'use strict';

/**
 * Generate lib/data/nigeria_ifrs_coa.json — Nigeria IFRS hospital chart of accounts.
 * Run: node scripts/generate-nigeria-coa.js
 */
const fs = require('fs');
const path = require('path');

function acct(code, label, cls, type, parent, posting = 1) {
  return {
    code: String(code),
    label,
    ohada_class: cls,
    account_type: type,
    parent_code: parent || null,
    is_posting: posting ? 1 : 0,
    sort_order: parseInt(code, 10) || 0,
  };
}

function header(code, label, cls, type, parent) {
  return acct(code, label, cls, type, parent, 0);
}

const accounts = [];

// Class 1 — Non-current assets
accounts.push(header('100000', 'Class 1 — Non-current assets', 1, 'asset', null));
accounts.push(header('110000', 'Property, plant and equipment', 1, 'asset', '100000'));
for (const [code, label] of [
  ['110100', 'Land'],
  ['110200', 'Buildings'],
  ['110300', 'Medical equipment'],
  ['110400', 'Furniture and fittings'],
  ['110500', 'Motor vehicles'],
  ['110600', 'Computer equipment'],
  ['110700', 'Generators and plant'],
  ['110800', 'Accumulated depreciation — PPE'],
]) {
  accounts.push(acct(code, label, 1, 'asset', '110000'));
}
accounts.push(header('120000', 'Intangible assets', 1, 'asset', '100000'));
for (const [code, label] of [
  ['120100', 'Software licences'],
  ['120200', 'Goodwill'],
  ['120800', 'Accumulated amortisation — intangibles'],
]) {
  accounts.push(acct(code, label, 1, 'asset', '120000'));
}
accounts.push(header('130000', 'Right-of-use assets (IFRS 16)', 1, 'asset', '100000'));
accounts.push(acct('130100', 'Leased premises — ROU asset', 1, 'asset', '130000'));
accounts.push(header('140000', 'Long-term investments', 1, 'asset', '100000'));
accounts.push(acct('140100', 'Investment in subsidiaries', 1, 'asset', '140000'));
accounts.push(acct('140200', 'Other long-term investments', 1, 'asset', '140000'));

// Class 2 — Current assets
accounts.push(header('200000', 'Class 2 — Current assets', 2, 'asset', null));
accounts.push(header('210000', 'Inventories', 2, 'asset', '200000'));
for (const [code, label] of [
  ['210100', 'Medical supplies inventory'],
  ['210200', 'Pharmacy inventory'],
  ['210300', 'Laboratory consumables'],
  ['210400', 'General stores and linen'],
  ['210500', 'Drugs and pharmaceuticals — warehouse'],
]) {
  accounts.push(acct(code, label, 2, 'asset', '210000'));
}
accounts.push(header('220000', 'Trade and other receivables', 2, 'asset', '200000'));
for (const [code, label] of [
  ['220100', 'Patients receivable'],
  ['220200', 'HMO / insurance receivable'],
  ['220300', 'NHIS receivable'],
  ['220400', 'Staff advances receivable'],
  ['220500', 'Other receivables'],
  ['220800', 'Allowance for doubtful debts'],
]) {
  accounts.push(acct(code, label, 2, 'asset', '220000'));
}
accounts.push(header('230000', 'Cash and cash equivalents', 2, 'asset', '200000'));
for (const [code, label, post] of [
  ['230100', 'Cash in hand (main till)', 1],
  ['230200', 'Petty cash', 1],
  ['230300', 'Bank — current account', 1],
  ['230400', 'Bank — POS settlement account', 1],
  ['230500', 'Treasury — patient payment methods', 0],
  ['230501', 'Cash — patient receipts', 1],
  ['230502', 'Bank transfer — patient receipts', 1],
  ['230503', 'POS / Card — patient receipts', 1],
  ['230504', 'Paystack / mobile money — patient receipts', 1],
  ['230505', 'Patient wallet — patient receipts', 1],
]) {
  accounts.push(acct(code, label, 2, 'asset', '230000', post));
}
accounts.push(header('240000', 'Prepayments', 2, 'asset', '200000'));
for (const [code, label] of [
  ['240100', 'Prepaid insurance'],
  ['240200', 'Prepaid rent'],
  ['240300', 'Prepaid subscriptions'],
]) {
  accounts.push(acct(code, label, 2, 'asset', '240000'));
}

// Class 3 — Equity
accounts.push(header('300000', 'Class 3 — Equity', 3, 'equity', null));
accounts.push(header('310000', 'Share capital', 3, 'equity', '300000'));
accounts.push(acct('310100', 'Ordinary share capital', 3, 'equity', '310000'));
accounts.push(header('320000', 'Retained earnings', 3, 'equity', '300000'));
accounts.push(header('330000', 'Reserves', 3, 'equity', '300000'));
accounts.push(acct('330100', 'Statutory reserve', 3, 'equity', '330000'));
accounts.push(acct('330200', 'Revaluation reserve', 3, 'equity', '330000'));
accounts.push(header('340000', 'Current year profit / loss', 3, 'equity', '300000'));

// Class 4 — Liabilities
accounts.push(header('400000', 'Class 4 — Liabilities', 4, 'liability', null));
accounts.push(header('410000', 'Trade payables', 4, 'liability', '400000'));
accounts.push(acct('410100', 'Suppliers payable', 4, 'liability', '410000'));
accounts.push(acct('410200', 'Accrued purchases', 4, 'liability', '410000'));
accounts.push(header('420000', 'Staff and statutory payables', 4, 'liability', '400000'));
for (const [code, label] of [
  ['420100', 'PAYE tax payable'],
  ['420200', 'Pension contribution payable (PFA)'],
  ['420300', 'NHF payable'],
  ['420400', 'NHIS contribution payable'],
  ['420500', 'Salaries and wages payable'],
  ['420600', 'Staff advances payable'],
  ['420700', 'NSITF / ECII payable'],
]) {
  accounts.push(acct(code, label, 4, 'liability', '420000'));
}
accounts.push(header('430000', 'Other payables', 4, 'liability', '400000'));
accounts.push(acct('430100', 'Accrued expenses', 4, 'liability', '430000'));
accounts.push(acct('430200', 'Deposits received', 4, 'liability', '430000'));
accounts.push(header('440000', 'Tax liabilities', 4, 'liability', '400000'));
for (const [code, label] of [
  ['440100', 'VAT output (collected)'],
  ['440200', 'VAT input (recoverable)'],
  ['440300', 'Withholding tax payable'],
  ['440400', 'Company income tax payable'],
  ['440500', 'Education tax payable'],
  ['440600', 'Stamp duties payable'],
]) {
  accounts.push(acct(code, label, 4, 'liability', '440000'));
}
accounts.push(header('450000', 'Borrowings', 4, 'liability', '400000'));
accounts.push(acct('450100', 'Bank overdraft', 4, 'liability', '450000'));
accounts.push(acct('450200', 'Term loans', 4, 'liability', '450000'));
accounts.push(header('460000', 'Lease liabilities (IFRS 16)', 4, 'liability', '400000'));
accounts.push(acct('460100', 'Lease liability — current portion', 4, 'liability', '460000'));
accounts.push(acct('460200', 'Lease liability — non-current portion', 4, 'liability', '460000'));

// Class 5 — Revenue
accounts.push(header('500000', 'Class 5 — Revenue', 5, 'revenue', null));
accounts.push(header('510000', 'Patient service revenue', 5, 'revenue', '500000'));
for (const [code, label] of [
  ['510101', 'Outpatient consultation'],
  ['510102', 'Laboratory services'],
  ['510103', 'Radiology and imaging'],
  ['510104', 'Pharmacy sales'],
  ['510105', 'Inpatient / hospitalisation'],
  ['510106', 'Emergency services'],
  ['510107', 'Surgical procedures'],
  ['510108', 'Maternity / OBGYN'],
  ['510109', 'Dental services'],
  ['510110', 'Physiotherapy'],
  ['510111', 'Dialysis services'],
  ['510112', 'ICU / critical care'],
  ['510199', 'Other clinical revenue'],
]) {
  accounts.push(acct(code, label, 5, 'revenue', '510000'));
}
accounts.push(header('520000', 'Other operating revenue', 5, 'revenue', '500000'));
for (const [code, label] of [
  ['520100', 'Accommodation / canteen'],
  ['520200', 'Insurance reimbursements'],
  ['520300', 'Government grants — health'],
  ['520400', 'Training income'],
]) {
  accounts.push(acct(code, label, 5, 'revenue', '520000'));
}

// Class 6 — Cost of sales
accounts.push(header('600000', 'Class 6 — Cost of sales / direct costs', 6, 'expense', null));
for (const [code, label] of [
  ['610000', 'Medical consumables used'],
  ['610100', 'Surgical supplies consumed'],
  ['610200', 'Ward consumables'],
  ['620000', 'Pharmacy cost of goods sold'],
  ['630000', 'Laboratory reagents consumed'],
  ['640000', 'Imaging consumables'],
  ['650000', 'Blood bank supplies'],
]) {
  accounts.push(acct(code, label, 6, 'expense', '600000'));
}

// Class 7 — Operating expenses
accounts.push(header('700000', 'Class 7 — Operating expenses', 7, 'expense', null));
accounts.push(header('710000', 'Staff costs', 7, 'expense', '700000'));
for (const [code, label] of [
  ['710100', 'Salaries and wages'],
  ['710200', 'Employer pension contribution (10%)'],
  ['710300', 'Staff welfare and meals'],
  ['710400', 'Training and development'],
  ['710500', 'Medical staff locum fees'],
  ['710600', 'NHIS employer contribution'],
  ['710700', 'NSITF / ECII employer levy'],
]) {
  accounts.push(acct(code, label, 7, 'expense', '710000'));
}
accounts.push(header('720000', 'Utilities', 7, 'expense', '700000'));
for (const [code, label] of [
  ['720100', 'Electricity (PHCN / DISCO)'],
  ['720200', 'Water'],
  ['720300', 'Diesel and generator fuel'],
  ['720400', 'Medical gases'],
]) {
  accounts.push(acct(code, label, 7, 'expense', '720000'));
}
for (const [hdr, hdrLabel, children] of [
  ['730000', 'Repairs and maintenance', [['730100', 'Building repairs'], ['730200', 'Equipment maintenance'], ['730300', 'Biomedical engineering']]],
  ['740000', 'Professional fees', [['740100', 'Legal fees'], ['740200', 'Audit fees'], ['740300', 'Consultancy fees']]],
  ['750000', 'Insurance', [['750100', 'Medical malpractice insurance'], ['750200', 'Property insurance']]],
  ['760000', 'Rent and rates', [['760100', 'Rent — premises'], ['760200', 'Property rates and levies']]],
  ['770000', 'Communication', [['770100', 'Telephone and internet'], ['770200', 'Postage and courier']]],
  ['780000', 'Bank charges', [['780100', 'Bank charges'], ['780200', 'POS charges']]],
  ['790000', 'General administration', [['790100', 'Office supplies'], ['790200', 'Cleaning and hygiene'], ['790300', 'Security services'], ['790400', 'Laundry and linen'], ['790500', 'Waste disposal']]],
]) {
  accounts.push(header(hdr, hdrLabel, 7, 'expense', '700000'));
  for (const [code, label] of children) {
    accounts.push(acct(code, label, 7, 'expense', hdr));
  }
}

// Class 8 — Other income and expenses
accounts.push(header('800000', 'Class 8 — Other income and expenses', 8, 'expense', null));
accounts.push(header('810000', 'Finance costs', 8, 'expense', '800000'));
accounts.push(acct('810100', 'Interest on borrowings', 8, 'expense', '810000'));
accounts.push(acct('810200', 'Interest on lease liabilities', 8, 'expense', '810000'));
accounts.push(header('820000', 'Depreciation and amortisation', 8, 'expense', '800000'));
for (const [code, label] of [
  ['820100', 'Depreciation — buildings'],
  ['820200', 'Depreciation — medical equipment'],
  ['820300', 'Depreciation — vehicles'],
  ['820400', 'Amortisation — software'],
]) {
  accounts.push(acct(code, label, 8, 'expense', '820000'));
}
accounts.push(acct('830000', 'Foreign exchange gains and losses', 8, 'expense', '800000'));
accounts.push(acct('840000', 'Gain / loss on disposal of assets', 8, 'expense', '800000'));
accounts.push(acct('850000', 'Donations and CSR expenditure', 8, 'expense', '800000'));
accounts.push(acct('860000', 'Penalties and fines', 8, 'expense', '800000'));
accounts.push(header('870000', 'Other non-operating income', 8, 'income', '800000'));
accounts.push(acct('870100', 'Interest income', 8, 'income', '870000'));
accounts.push(acct('870200', 'Miscellaneous income', 8, 'income', '870000'));

const payload = {
  accounts,
  class_titles: {
    '1': 'Class 1 — Non-current assets',
    '2': 'Class 2 — Current assets',
    '3': 'Class 3 — Equity',
    '4': 'Class 4 — Liabilities',
    '5': 'Class 5 — Revenue',
    '6': 'Class 6 — Cost of sales / direct costs',
    '7': 'Class 7 — Operating expenses',
    '8': 'Class 8 — Other income and expenses',
  },
  locale: 'en',
  country: 'NG',
  posting_rule: 'Nigeria IFRS — hospital chart; journal postings use leaf accounts',
};

const out = path.join(__dirname, '..', 'lib', 'data', 'nigeria_ifrs_coa.json');
fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`Wrote ${accounts.length} accounts to ${out}`);
