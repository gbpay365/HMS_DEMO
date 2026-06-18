'use strict';

/**
 * Sidebar section headers for global navigation (order matters).
 * Items not listed fall into "Other".
 */
const SIDEBAR_SECTIONS = Object.freeze([
  { key: 'main', label: 'Main Navigation', codes: ['sb.dashboard', 'sb.patients', 'sb.appointments'] },
  {
    key: 'clinical',
    label: 'Clinical',
    codes: [
      'sb.opd', 'sb.emergency', 'sb.maternity', 'sb.wards', 'sb.census',
      'sb.ipd_medication', 'sb.ipd_inbox', 'sb.nurse_roster', 'sb.doctor_roster',
    ],
  },
  {
    key: 'hr',
    label: 'HR & Staff',
    codes: [
      'sb.employees', 'sb.payroll', 'sb.hr_leave_requests', 'sb.hr_leave_balances',
      'sb.hr_holidays', 'sb.attendance', 'sb.access',
    ],
  },
  {
    key: 'ops',
    label: 'Operations',
    codes: [
      'sb.cashier', 'sb.wallet', 'sb.inventory', 'sb.procurement', 'sb.catalog',
      'sb.lab', 'sb.pharmacy', 'sb.radiology', 'sb.prescriptions',
    ],
  },
  {
    key: 'admin',
    label: 'Administration',
    codes: [
      'sb.financials', 'sb.tax_hub', 'sb.wallet_admin', 'sb.credit', 'sb.insurance',
      'sb.insurance_claims', 'sb.payment_validity', 'sb.subscriptions', 'sb.access',
    ],
  },
  {
    key: 'help',
    label: 'Help',
    codes: ['sb.guides', 'sb.manual'],
  },
]);

const CODE_TO_SECTION = new Map();
for (const sec of SIDEBAR_SECTIONS) {
  for (const code of sec.codes) CODE_TO_SECTION.set(code, sec.key);
}

function sectionForCode(code) {
  return CODE_TO_SECTION.get(String(code)) || 'other';
}

function groupSidebarItems(items) {
  const buckets = new Map();
  for (const sec of SIDEBAR_SECTIONS) buckets.set(sec.key, { ...sec, items: [] });
  buckets.set('other', { key: 'other', label: 'More', items: [] });

  for (const it of items) {
    const key = sectionForCode(it.code);
    const b = buckets.get(key) || buckets.get('other');
    b.items.push(it);
  }

  const out = [];
  for (const sec of SIDEBAR_SECTIONS) {
    const b = buckets.get(sec.key);
    if (b && b.items.length) out.push(b);
  }
  const other = buckets.get('other');
  if (other.items.length) out.push(other);
  return out;
}

module.exports = { SIDEBAR_SECTIONS, groupSidebarItems, sectionForCode };
