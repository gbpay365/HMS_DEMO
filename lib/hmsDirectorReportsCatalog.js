'use strict';

/**
 * Director / management reports catalog — sections, cards, financial rows, units.
 * Each item has a permission code grantable per role in Access Control.
 */

const SECTIONS = Object.freeze([
  { key: 'daily', label: 'Daily', icon: 'fa-sun-o', perm: 'hms_reports.daily', subtitle: 'Operational pulse', accent: '#0891b2', soft: '#ecfeff' },
  { key: 'weekly', label: 'Weekly', icon: 'fa-calendar', perm: 'hms_reports.weekly', subtitle: 'Trend monitoring', accent: '#7c3aed', soft: '#f5f3ff' },
  { key: 'monthly', label: 'Monthly', icon: 'fa-calendar-o', perm: 'hms_reports.monthly', subtitle: 'Strategic overview', accent: '#1e40af', soft: '#eff6ff' },
  { key: 'financial', label: 'Financial', icon: 'fa-money', perm: 'hms_reports.financial', subtitle: 'Transactions & unit economics', accent: '#059669', soft: '#ecfdf5' },
]);

function card(id, section, title, icon, iconBg, iconColor, items) {
  return {
    id,
    section,
    perm: `hms_reports.${section}.${id}`,
    title,
    icon,
    iconBg,
    iconColor,
    items,
  };
}

const CARDS = Object.freeze([
  // Daily
  card('census', 'daily', 'Patient census', 'fa-bed', '#E6F1FB', '#185FA5', [
    'Total admissions & discharges',
    'Current inpatient count by ward',
    'Bed occupancy rate (%)',
    'Pending admissions / waiting list',
    'Transfers in & out',
  ]),
  card('opd_emergency', 'daily', 'OPD & emergency', 'fa-stethoscope', '#E1F5EE', '#0F6E56', [
    'Total outpatient visits',
    'Emergency cases seen',
    'Average waiting time',
    'Walk-ins vs. appointments',
    'Referrals sent / received',
  ]),
  card('theatre', 'daily', 'Theatre & procedures', 'fa-scissors', '#FAEEDA', '#854F0B', [
    'Surgeries scheduled vs. done',
    'Theatre utilisation rate',
    'Cancelled / postponed surgeries',
    'Average turnaround time',
  ]),
  card('clinical_alerts', 'daily', 'Clinical alerts', 'fa-heartbeat', '#FCEBEB', '#A32D2D', [
    'Deaths (with cause summary)',
    'ICU / HDU census',
    'Critical lab values flagged',
    'Incident / near-miss reports',
    'Infection alerts (HAI)',
  ]),
  card('pharmacy', 'daily', 'Pharmacy', 'fa-medkit', '#EEEDFE', '#534AB7', [
    'Prescriptions dispensed',
    'Out-of-stock / low-stock alerts',
    'High-value drug consumption',
    'Returned / wasted medications',
  ]),
  card('daily_revenue', 'daily', 'Daily revenue snapshot', 'fa-money', '#EAF3DE', '#3B6D11', [
    'Cash collections (OPD, IPD)',
    'Insurance billing submitted',
    'Outstanding balances due',
    'Pending discharge invoices',
  ]),
  // Weekly
  card('patient_flow', 'weekly', 'Patient flow trends', 'fa-line-chart', '#E6F1FB', '#185FA5', [
    'Weekly admissions vs. prior week',
    'Average length of stay (ALOS)',
    'Readmission rate (7-day)',
    'Specialty-wise patient distribution',
  ]),
  card('hr_staffing', 'weekly', 'HR & staffing', 'fa-users', '#FAEEDA', '#854F0B', [
    'Staff attendance & absenteeism',
    'Overtime hours logged',
    'On-call coverage gaps',
    'Locum / agency staff usage',
    'Leave requests pending',
  ]),
  card('lab_radiology', 'weekly', 'Lab & radiology', 'fa-flask', '#E1F5EE', '#0F6E56', [
    'Tests ordered vs. completed',
    'Average turnaround time (TAT)',
    'Critical results reported',
    'Equipment downtime incidents',
  ]),
  card('quality_safety', 'weekly', 'Quality & safety', 'fa-clipboard', '#EEEDFE', '#534AB7', [
    'Patient complaints received',
    'Incident report summary',
    'Pressure ulcer / fall events',
    'Hand hygiene compliance (%)',
  ]),
  card('supply_inventory', 'weekly', 'Supply & inventory', 'fa-cubes', '#FAECE7', '#993C1D', [
    'Consumption vs. budget by dept.',
    'Items approaching reorder level',
    'Purchase orders raised & pending',
    'Expired items identified',
  ]),
  card('weekly_financial', 'weekly', 'Weekly financial', 'fa-file-text-o', '#EAF3DE', '#3B6D11', [
    'Revenue by department',
    'Insurance claims submitted',
    'Collections vs. target',
    'Top outstanding accounts',
  ]),
  // Monthly
  card('clinical_performance', 'monthly', 'Clinical performance', 'fa-bar-chart', '#E6F1FB', '#185FA5', [
    'Morbidity & mortality statistics',
    'Top 10 diagnoses (ICD codes)',
    'Surgical outcomes & complications',
    'ALOS by specialty vs. benchmark',
    'Readmission rates (30-day)',
  ]),
  card('dept_activity', 'monthly', 'Departmental activity', 'fa-hospital-o', '#EEEDFE', '#534AB7', [
    'OPD visits per doctor',
    'Procedures per specialty',
    'Theatre utilisation (%)',
    'Referral in/out by dept.',
    'No-show / did-not-attend rate',
  ]),
  card('pl_summary', 'monthly', 'P&L summary', 'fa-pie-chart', '#E1F5EE', '#0F6E56', [
    'Total revenue vs. budget',
    'Operating expenses breakdown',
    'Net profit / surplus',
    'Cost per patient day',
    'Revenue per bed',
  ]),
  card('patient_satisfaction', 'monthly', 'Patient satisfaction', 'fa-smile-o', '#FAEEDA', '#854F0B', [
    'CSAT / NPS scores',
    'Complaint resolution rate',
    'Feedback by department',
    'Waiting time satisfaction',
  ]),
  card('infection_control', 'monthly', 'Infection control', 'fa-bug', '#FCEBEB', '#A32D2D', [
    'HAI rates by ward',
    'Antibiotic consumption (DDD)',
    'Antimicrobial resistance alerts',
    'Sterilisation compliance',
  ]),
  card('assets_maintenance', 'monthly', 'Assets & maintenance', 'fa-wrench', '#EAF3DE', '#3B6D11', [
    'Equipment downtime summary',
    'Preventive maintenance completed',
    'Capital expenditure vs. plan',
    'Facility repair requests',
  ]),
]);

const FINANCIAL_ROWS = Object.freeze([
  {
    id: 'daily_txn',
    perm: 'hms_reports.financial.daily_txn',
    title: 'Daily transaction summary',
    freq: 'daily',
    points: 'Cash received, card/mobile payments, insurance claims raised, refunds issued, total collections vs. target',
  },
  {
    id: 'daily_expense',
    perm: 'hms_reports.financial.daily_expense',
    title: 'Daily expense log',
    freq: 'daily',
    points: 'Petty cash spent, utilities, consumables used, emergency purchases',
  },
  {
    id: 'weekly_txn',
    perm: 'hms_reports.financial.weekly_txn',
    title: 'Weekly transaction report',
    freq: 'weekly',
    points: 'Revenue by payer (cash, insurance, corporate), outstanding invoices, payment reconciliation, weekly collections trend',
  },
  {
    id: 'weekly_procurement',
    perm: 'hms_reports.financial.weekly_procurement',
    title: 'Weekly procurement',
    freq: 'weekly',
    points: 'Purchase orders issued, goods received, supplier payments made, pending LPOs',
  },
  {
    id: 'monthly_pl',
    perm: 'hms_reports.financial.monthly_pl',
    title: 'Monthly P&L',
    freq: 'monthly',
    points: 'Total revenue vs. budget, operating costs, EBITDA, net surplus/deficit, cost per patient',
  },
  {
    id: 'monthly_expenses',
    perm: 'hms_reports.financial.monthly_expenses',
    title: 'Monthly expenses',
    freq: 'monthly',
    points: 'Salaries & wages, utilities, maintenance, consumables, depreciation — actual vs. budgeted',
  },
  {
    id: 'monthly_ar',
    perm: 'hms_reports.financial.monthly_ar',
    title: 'Monthly accounts receivable',
    freq: 'monthly',
    points: 'Ageing debtors (30/60/90 days), insurance claim status, bad debt provisioning',
  },
]);

const FINANCIAL_UNITS = Object.freeze([
  { id: 'pharmacy', perm: 'hms_reports.financial.unit_pharmacy', name: 'Pharmacy', icon: 'fa-medkit', sales: 'Prescriptions dispensed, OTC sales, drug revenue by category', purchases: 'Drugs purchased, supplier invoices, stock valuation, expired write-offs' },
  { id: 'laboratory', perm: 'hms_reports.financial.unit_laboratory', name: 'Laboratory', icon: 'fa-flask', sales: 'Tests billed (cash & insurance), revenue per test type', purchases: 'Reagents & kits consumed, equipment servicing costs' },
  { id: 'radiology', perm: 'hms_reports.financial.unit_radiology', name: 'Radiology', icon: 'fa-film', sales: 'X-ray, CT, MRI, ultrasound billings per modality', purchases: 'Films/contrast media, equipment maintenance' },
  { id: 'theatre', perm: 'hms_reports.financial.unit_theatre', name: 'Theatre', icon: 'fa-scissors', sales: 'Surgical procedure fees, anaesthesia billing', purchases: 'Surgical consumables, sterile supplies, implants' },
  { id: 'ipd', perm: 'hms_reports.financial.unit_ipd', name: 'IPD / Wards', icon: 'fa-bed', sales: 'Bed charges, nursing care fees, room revenue', purchases: 'Ward consumables, linen, medical gases' },
  { id: 'icu', perm: 'hms_reports.financial.unit_icu', name: 'ICU / HDU', icon: 'fa-heartbeat', sales: 'ICU daily charges, ventilator fees, monitoring fees', purchases: 'Specialised drugs, disposables, IV lines' },
  { id: 'dietary', perm: 'hms_reports.financial.unit_dietary', name: 'Dietary', icon: 'fa-cutlery', sales: 'Patient meal billing, special diet charges', purchases: 'Food & provisions, kitchen consumables' },
  { id: 'emergency', perm: 'hms_reports.financial.unit_emergency', name: 'Emergency', icon: 'fa-ambulance', sales: 'A&E consultation fees, resuscitation billing', purchases: 'Crash trolley restocking, emergency drugs' },
]);

const CORE_PERMISSIONS = Object.freeze([
  ['hms_reports.read', 'Management reports: open module (any granted section)'],
  ['hms_reports.full', 'Management reports: full director suite (all sections & cards)'],
  ['hms_reports.daily', 'Management reports: entire Daily tab'],
  ['hms_reports.weekly', 'Management reports: entire Weekly tab'],
  ['hms_reports.monthly', 'Management reports: entire Monthly tab'],
  ['hms_reports.financial', 'Management reports: entire Financial tab'],
]);

function buildPermissionList() {
  const list = [...CORE_PERMISSIONS];
  for (const c of CARDS) {
    list.push([c.perm, `Report card: ${c.title} (${c.section})`]);
  }
  for (const r of FINANCIAL_ROWS) {
    list.push([r.perm, `Financial report: ${r.title}`]);
  }
  for (const u of FINANCIAL_UNITS) {
    list.push([u.perm, `Financial unit: ${u.name}`]);
  }
  return list;
}

const ALL_REPORT_PERMISSIONS = Object.freeze(buildPermissionList());

/** Resolve report id to card, financial row, or unit (for print / API). */
function findReportEntity(id, typeHint) {
  const idStr = String(id || '').trim();
  if (!idStr) return null;
  const hint = String(typeHint || '').trim().toLowerCase();
  if (hint === 'row' || hint === 'financial_row') {
    const row = FINANCIAL_ROWS.find((r) => r.id === idStr);
    return row ? { kind: 'row', entity: row, sectionKey: 'financial', defaultPeriod: row.freq } : null;
  }
  if (hint === 'unit' || hint === 'financial_unit') {
    const unit = FINANCIAL_UNITS.find((u) => u.id === idStr);
    return unit ? { kind: 'unit', entity: unit, sectionKey: 'financial', defaultPeriod: 'week' } : null;
  }
  if (hint === 'card') {
    const card = CARDS.find((c) => c.id === idStr);
    return card ? { kind: 'card', entity: card, sectionKey: card.section, defaultPeriod: card.section === 'daily' ? 'day' : card.section === 'weekly' ? 'week' : 'month' } : null;
  }
  const card = CARDS.find((c) => c.id === idStr);
  if (card) {
    return {
      kind: 'card',
      entity: card,
      sectionKey: card.section,
      defaultPeriod: card.section === 'daily' ? 'day' : card.section === 'weekly' ? 'week' : 'month',
    };
  }
  const row = FINANCIAL_ROWS.find((r) => r.id === idStr);
  if (row) return { kind: 'row', entity: row, sectionKey: 'financial', defaultPeriod: row.freq };
  const unit = FINANCIAL_UNITS.find((u) => u.id === idStr);
  if (unit) return { kind: 'unit', entity: unit, sectionKey: 'financial', defaultPeriod: 'week' };
  return null;
}

module.exports = {
  SECTIONS,
  CARDS,
  FINANCIAL_ROWS,
  FINANCIAL_UNITS,
  ALL_REPORT_PERMISSIONS,
  findReportEntity,
};
