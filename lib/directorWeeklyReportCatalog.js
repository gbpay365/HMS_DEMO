'use strict';

/**
 * Director weekly performance report — ACL catalogue (KPIs + panels).
 */

const WEEKLY_SHARED_PERM =
  'director.weekly.read|director.dashboard.read|hms_reports.full|hms_reports.read|dashboard.read';

const KPI_DEFS = [
  { id: 'total_patients', code: 'dir.wk.kpi.total_patients', perm: 'director.weekly.kpi.patients', label: 'Total patients', dataKey: 'totalPatients', icon: 'fa-users', color: '#1D6FE8', sort: 10 },
  { id: 'avg_occupancy', code: 'dir.wk.kpi.avg_occupancy', perm: 'director.weekly.kpi.occupancy', label: 'Avg bed occupancy', dataKey: 'avgOccupancy', icon: 'fa-bed', color: '#0891B2', sort: 20 },
  { id: 'avg_alos', code: 'dir.wk.kpi.avg_alos', perm: 'director.weekly.kpi.alos', label: 'Avg ALOS', dataKey: 'avgALOS', icon: 'fa-clock-o', color: '#7C3AED', sort: 30 },
  { id: 'weekly_revenue', code: 'dir.wk.kpi.weekly_revenue', perm: 'director.weekly.kpi.revenue', label: 'Weekly revenue', dataKey: 'revenueWeek', icon: 'fa-money', color: '#0D9E6E', sort: 40 },
  { id: 'avg_er_wait', code: 'dir.wk.kpi.avg_er_wait', perm: 'director.weekly.kpi.er_wait', label: 'Avg ER wait', dataKey: 'avgERWait', icon: 'fa-ambulance', color: '#D97706', sort: 50 },
  { id: 'incidents', code: 'dir.wk.kpi.incidents', perm: 'director.weekly.kpi.incidents', label: 'Safety incidents', dataKey: 'incidentCount', icon: 'fa-warning', color: '#DC2626', sort: 60 },
];

const PANEL_DEFS = [
  { id: 'patient_volume', code: 'dir.wk.panel.patient_volume', perm: 'director.weekly.panel.patient_volume', label: 'Patient volume', dataKey: 'dailyVolume', sort: 10 },
  { id: 'occupancy_trend', code: 'dir.wk.panel.occupancy_trend', perm: 'director.weekly.panel.occupancy_trend', label: 'Bed occupancy trend', dataKey: 'occupancyTrend', sort: 20 },
  { id: 'revenue_chart', code: 'dir.wk.panel.revenue_chart', perm: 'director.weekly.panel.revenue_chart', label: 'Revenue — billed vs. collected', dataKey: 'revenueByDay', sort: 30 },
  { id: 'alos_chart', code: 'dir.wk.panel.alos_chart', perm: 'director.weekly.panel.alos_chart', label: 'Average length of stay by department', dataKey: 'alos', sort: 40 },
  { id: 'doctor_perf', code: 'dir.wk.panel.doctor_perf', perm: 'director.weekly.panel.doctor_perf', label: 'Doctor performance', dataKey: 'doctorPerf', sort: 50 },
  { id: 'incidents', code: 'dir.wk.panel.incidents', perm: 'director.weekly.panel.incidents', label: 'Safety incidents', dataKey: 'incidents', sort: 60 },
  { id: 'supply_digest', code: 'dir.wk.panel.supply_digest', perm: 'director.weekly.panel.supply_digest', label: 'Supply chain digest', dataKey: 'supplyAlerts', sort: 70 },
];

const KPI_BY_CODE = new Map(KPI_DEFS.map((r) => [r.code, r]));
const PANEL_BY_CODE = new Map(PANEL_DEFS.map((r) => [r.code, r]));

function permWithFallback(perm) {
  return `${perm}|${WEEKLY_SHARED_PERM}`;
}

function aclUiElements() {
  const rows = [
    [
      'dir.section.weekly_report',
      'director',
      'section',
      'Weekly performance report',
      null,
      null,
      null,
      WEEKLY_SHARED_PERM,
      2,
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
      kpi.icon,
      kpi.color,
      permWithFallback(kpi.perm),
      kpi.sort,
      'dir.section.weekly_report',
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
      'dir.section.weekly_report',
    ]);
  }

  return rows;
}

const ALL_DIRECTOR_WEEKLY_PERMISSIONS = [
  ['director.weekly.read', 'Director weekly report (all widgets)', 'director'],
  ...KPI_DEFS.map((k) => [k.perm, `Director weekly KPI — ${k.id}`, 'director']),
  ...PANEL_DEFS.map((p) => [p.perm, `Director weekly panel — ${p.id}`, 'director']),
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

function buildVisibleWeeklyModel(aclPack) {
  const sections = aclPack.sections || [];
  const stats = aclPack.stats || [];
  const allCodes = codesForWidgets([...sections, ...stats]);
  const hasShell = allCodes.has('dir.section.weekly_report');

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
  WEEKLY_SHARED_PERM,
  aclUiElements,
  ALL_DIRECTOR_WEEKLY_PERMISSIONS,
  buildVisibleWeeklyModel,
};
