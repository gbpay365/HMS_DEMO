'use strict';

const MONTHLY_SHARED_PERM =
  'director.monthly.read|director.dashboard.read|hms_reports.full|hms_reports.read|dashboard.read';

const KPI_DEFS = [
  { id: 'total_revenue', code: 'dir.mo.kpi.total_revenue', perm: 'director.monthly.kpi.revenue', label: 'Total revenue', dataKey: 'totalRevenue', color: '#1D6FE8', sort: 10 },
  { id: 'gross_profit', code: 'dir.mo.kpi.gross_profit', perm: 'director.monthly.kpi.gross_profit', label: 'Gross profit', dataKey: 'grossProfit', color: '#059669', sort: 20 },
  { id: 'gross_margin', code: 'dir.mo.kpi.gross_margin', perm: 'director.monthly.kpi.gross_margin', label: 'Gross margin', dataKey: 'grossMarginPct', color: '#059669', sort: 30 },
  { id: 'ebitda', code: 'dir.mo.kpi.ebitda', perm: 'director.monthly.kpi.ebitda', label: 'EBITDA', dataKey: 'ebitda', color: '#6D28D9', sort: 40 },
  { id: 'ebitda_margin', code: 'dir.mo.kpi.ebitda_margin', perm: 'director.monthly.kpi.ebitda_margin', label: 'EBITDA margin', dataKey: 'ebitdaMarginPct', color: '#6D28D9', sort: 50 },
  { id: 'payroll_cost', code: 'dir.mo.kpi.payroll_cost', perm: 'director.monthly.kpi.payroll', label: 'Payroll cost', dataKey: 'totalPayroll', color: '#B45309', sort: 60 },
];

const PANEL_DEFS = [
  { id: 'pl_statement', code: 'dir.mo.panel.pl_statement', perm: 'director.monthly.panel.pl_statement', label: 'P&L statement', dataKey: 'summary', sort: 10 },
  { id: 'revenue_sources', code: 'dir.mo.panel.revenue_sources', perm: 'director.monthly.panel.revenue_sources', label: 'Revenue by source', dataKey: 'revenueSources', sort: 20 },
  { id: 'trend_chart', code: 'dir.mo.panel.trend_chart', perm: 'director.monthly.panel.trend_chart', label: '6-month revenue trend', dataKey: 'trend', sort: 30 },
  { id: 'expense_chart', code: 'dir.mo.panel.expense_chart', perm: 'director.monthly.panel.expense_chart', label: 'Expenses vs. budget', dataKey: 'expenses', sort: 40 },
  { id: 'dept_pl', code: 'dir.mo.panel.dept_pl', perm: 'director.monthly.panel.dept_pl', label: 'Department P&L', dataKey: 'deptPL', sort: 50 },
  { id: 'payroll_chart', code: 'dir.mo.panel.payroll_chart', perm: 'director.monthly.panel.payroll_chart', label: 'Payroll by department', dataKey: 'payroll', sort: 60 },
  { id: 'claims_aging', code: 'dir.mo.panel.claims_aging', perm: 'director.monthly.panel.claims_aging', label: 'Insurance claims aging', dataKey: 'claimsAging', sort: 70 },
];

const KPI_BY_CODE = new Map(KPI_DEFS.map((r) => [r.code, r]));
const PANEL_BY_CODE = new Map(PANEL_DEFS.map((r) => [r.code, r]));

function permWithFallback(perm) {
  return `${perm}|${MONTHLY_SHARED_PERM}`;
}

function aclUiElements() {
  const rows = [
    [
      'dir.section.monthly_pl',
      'director',
      'section',
      'Monthly P&L report',
      null,
      null,
      null,
      MONTHLY_SHARED_PERM,
      3,
      null,
    ],
  ];

  for (const kpi of KPI_DEFS) {
    rows.push([
      kpi.code,
      'director',
      'stat',
      kpi.label,
      null,
      null,
      kpi.color,
      permWithFallback(kpi.perm),
      kpi.sort,
      'dir.section.monthly_pl',
    ]);
  }

  for (const panel of PANEL_DEFS) {
    rows.push([
      panel.code,
      'director',
      'section',
      panel.label,
      null,
      null,
      null,
      permWithFallback(panel.perm),
      panel.sort,
      'dir.section.monthly_pl',
    ]);
  }

  return rows;
}

const ALL_DIRECTOR_MONTHLY_PERMISSIONS = [
  ['director.monthly.read', 'Director monthly P&L (all widgets)', 'director'],
  ['director.monthly.costs.write', 'Director monthly P&L — enter manual payroll & expenses', 'director'],
  ...KPI_DEFS.map((k) => [k.perm, `Director monthly KPI — ${k.id}`, 'director']),
  ...PANEL_DEFS.map((p) => [p.perm, `Director monthly panel — ${p.id}`, 'director']),
];

function codesForWidgets(visible) {
  const codes = new Set();
  for (const item of visible || []) {
    if (item?.code) codes.add(String(item.code));
  }
  return codes;
}

function filterWidgetDefs(defs, visibleCodes, map) {
  return defs.filter((def) => visibleCodes.has(def.code)).map((def) => {
    const acl = map.get(def.code);
    return { ...def, label: acl?.label || def.label || def.id };
  });
}

function buildVisibleMonthlyModel(aclPack) {
  const sections = aclPack.sections || [];
  const stats = aclPack.stats || [];
  const allCodes = codesForWidgets([...sections, ...stats]);
  const hasShell = allCodes.has('dir.section.monthly_pl');

  const kpis = filterWidgetDefs(KPI_DEFS, allCodes, KPI_BY_CODE).map((k) => ({
    ...k,
    label: stats.find((s) => s.code === k.code)?.label || k.label,
  }));

  const panels = filterWidgetDefs(PANEL_DEFS, allCodes, PANEL_BY_CODE).map((p) => ({
    ...p,
    label: sections.find((s) => s.code === p.code)?.label || p.label,
  }));

  return { hasShell, kpis, panels, allCodes };
}

module.exports = {
  KPI_DEFS,
  PANEL_DEFS,
  KPI_BY_CODE,
  PANEL_BY_CODE,
  MONTHLY_SHARED_PERM,
  aclUiElements,
  ALL_DIRECTOR_MONTHLY_PERMISSIONS,
  buildVisibleMonthlyModel,
};
