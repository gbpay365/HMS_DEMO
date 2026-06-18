'use strict';

/**
 * Director portal cashier revenue widgets — ACL catalogue + permissions.
 * Visibility is permission-driven (not hard-coded to any role id).
 */

const { BILLING_SECTION_ORDER } = require('./billingLineCategory');

const REVENUE_STAT_DEFS = [
  { key: 'consultation', code: 'dir.stat.revenue_consultation', perm: 'director.revenue.consultation', label: 'Consultation', icon: 'fa-stethoscope', color: '#16a34a', sort: 10, primary: true },
  { key: 'laboratory', code: 'dir.stat.revenue_laboratory', perm: 'director.revenue.laboratory', label: 'Laboratory', icon: 'fa-flask', color: '#7c3aed', sort: 20, primary: true },
  { key: 'radiology', code: 'dir.stat.revenue_radiology', perm: 'director.revenue.radiology', label: 'Radiology', icon: 'fa-film', color: '#0369a1', sort: 30, primary: true },
  { key: 'pharmacy', code: 'dir.stat.revenue_pharmacy', perm: 'director.revenue.pharmacy', label: 'Pharmacy', icon: 'fa-medkit', color: '#059669', sort: 40, primary: true },
  { key: 'maternity', code: 'dir.stat.revenue_maternity', perm: 'director.revenue.maternity', label: 'Maternity', icon: 'fa-female', color: '#9d174d', sort: 50, primary: false },
  { key: 'surgery', code: 'dir.stat.revenue_surgery', perm: 'director.revenue.surgery', label: 'Surgery / procedures', icon: 'fa-scissors', color: '#b45309', sort: 60, primary: false },
  { key: 'nursing', code: 'dir.stat.revenue_nursing', perm: 'director.revenue.nursing', label: 'Nursing', icon: 'fa-heartbeat', color: '#db2777', sort: 70, primary: false },
  { key: 'material', code: 'dir.stat.revenue_material', perm: 'director.revenue.material', label: 'Materials', icon: 'fa-cubes', color: '#64748b', sort: 80, primary: false },
  { key: 'service', code: 'dir.stat.revenue_service', perm: 'director.revenue.service', label: 'Other services', icon: 'fa-cog', color: '#475569', sort: 90, primary: false },
  { key: 'other', code: 'dir.stat.revenue_other', perm: 'director.revenue.other', label: 'Uncategorized', icon: 'fa-ellipsis-h', color: '#94a3b8', sort: 100, primary: false },
  { key: 'total', code: 'dir.stat.revenue_total', perm: 'director.revenue.total', label: 'Total collected', icon: 'fa-money', color: '#0f766e', sort: 5, primary: true },
];

const STAT_BY_CODE = new Map(REVENUE_STAT_DEFS.map((row) => [row.code, row]));
const STAT_BY_KEY = new Map(REVENUE_STAT_DEFS.map((row) => [row.key, row]));

const SHARED_PERM_FALLBACK =
  'hms_reports.financial|hms_reports.full|director.revenue.read|cashier.read|financials.read';

function aclUiElements() {
  const rows = [
    [
      'dir.section.cashier_revenue',
      'director',
      'section',
      'Cashier collections',
      null,
      null,
      null,
      SHARED_PERM_FALLBACK,
      5,
      null,
    ],
  ];
  for (const def of REVENUE_STAT_DEFS) {
    rows.push([
      def.code,
      'director',
      'stat',
      def.label,
      null,
      def.icon,
      def.color,
      `${def.perm}|${SHARED_PERM_FALLBACK}`,
      def.sort,
      null,
    ]);
  }
  return rows;
}

const ALL_DIRECTOR_REVENUE_PERMISSIONS = [
  ['director.revenue.read', 'Director cashier revenue (all categories)', 'director'],
  ...REVENUE_STAT_DEFS.map((def) => [def.perm, `Director revenue — ${def.label}`, 'director']),
];

function keysForVisibleStatCodes(codes) {
  const keys = new Set();
  for (const code of codes || []) {
    const def = STAT_BY_CODE.get(String(code || ''));
    if (def) keys.add(def.key);
  }
  return keys;
}

function filterTotalsForKeys(totals, allowedKeys) {
  const out = {};
  let visibleTotal = 0;
  for (const key of BILLING_SECTION_ORDER) {
    if (!allowedKeys.has(key)) continue;
    const amt = Number(totals[key] || 0);
    out[key] = amt;
    visibleTotal += amt;
  }
  if (allowedKeys.has('total')) {
    out.total = visibleTotal;
  }
  return out;
}

module.exports = {
  REVENUE_STAT_DEFS,
  STAT_BY_CODE,
  STAT_BY_KEY,
  SHARED_PERM_FALLBACK,
  aclUiElements,
  ALL_DIRECTOR_REVENUE_PERMISSIONS,
  keysForVisibleStatCodes,
  filterTotalsForKeys,
};
