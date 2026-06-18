'use strict';

const SHARED_PERM =
  'assistant_director.dashboard.read|director.dashboard.read|hms_reports.read|dashboard.read';

const TAB_DEFS = [
  { id: 'overview', code: 'adir.tab.overview', perm: 'assistant_director.dashboard.tab.overview', label: 'Overview', sort: 10 },
  { id: 'beds', code: 'adir.tab.beds', perm: 'assistant_director.dashboard.tab.beds', label: 'Bed map', sort: 20 },
  { id: 'flow', code: 'adir.tab.flow', perm: 'assistant_director.dashboard.tab.flow', label: 'Patient flow', sort: 30 },
  { id: 'revenue', code: 'adir.tab.revenue', perm: 'assistant_director.dashboard.tab.revenue', label: 'Revenue', sort: 40 },
  { id: 'reports', code: 'adir.tab.reports', perm: 'assistant_director.dashboard.tab.reports', label: 'Reports', sort: 50 },
];

const KPI_DEFS = [
  { id: 'patients_today', code: 'adir.kpi.patients_today', perm: 'assistant_director.dashboard.kpi.patients', label: 'Patients today', tab: 'overview', dataKey: 'patientsToday', icon: 'fa-users', color: '#4E8CF5', sort: 10 },
  { id: 'bed_occupancy', code: 'adir.kpi.bed_occupancy', perm: 'assistant_director.dashboard.kpi.beds', label: 'Bed occupancy', tab: 'overview', dataKey: 'bedOccupancy', icon: 'fa-bed', color: '#F5A623', sort: 20 },
  { id: 'er_wait', code: 'adir.kpi.er_wait', perm: 'assistant_director.dashboard.kpi.er_wait', label: 'ER average wait', tab: 'overview', dataKey: 'erWait', icon: 'fa-ambulance', color: '#F05050', sort: 30 },
  { id: 'revenue_today', code: 'adir.kpi.revenue_today', perm: 'assistant_director.dashboard.kpi.revenue', label: 'Revenue today', tab: 'overview', dataKey: 'revenueToday', icon: 'fa-money', color: '#36C98E', sort: 40 },
  { id: 'pending_lab', code: 'adir.kpi.pending_lab', perm: 'assistant_director.dashboard.kpi.lab', label: 'Pending lab', tab: 'overview', dataKey: 'pendingLab', icon: 'fa-flask', color: '#A78BFA', sort: 50 },
  { id: 'flow_admitted', code: 'adir.kpi.flow_admitted', perm: 'assistant_director.dashboard.kpi.flow_admitted', label: 'Admitted today', tab: 'flow', dataKey: 'flowAdmitted', icon: 'fa-sign-in', color: '#4E8CF5', sort: 60 },
  { id: 'flow_discharged', code: 'adir.kpi.flow_discharged', perm: 'assistant_director.dashboard.kpi.flow_discharged', label: 'Discharged today', tab: 'flow', dataKey: 'flowDischarged', icon: 'fa-sign-out', color: '#36C98E', sort: 70 },
  { id: 'revenue_collected', code: 'adir.kpi.revenue_collected', perm: 'assistant_director.dashboard.kpi.revenue_collected', label: 'Collected today', tab: 'revenue', dataKey: 'revenueCollected', icon: 'fa-money', color: '#36C98E', sort: 80 },
  { id: 'revenue_rate', code: 'adir.kpi.revenue_rate', perm: 'assistant_director.dashboard.kpi.revenue_rate', label: 'Collection rate', tab: 'revenue', dataKey: 'revenueRate', icon: 'fa-pie-chart', color: '#F5A623', sort: 90 },
];

const PANEL_DEFS = [
  { id: 'patient_flow', code: 'adir.panel.patient_flow', perm: 'assistant_director.dashboard.panel.patient_flow', label: 'Patient flow', tab: 'overview', dataKey: 'patientFlow', sort: 10 },
  { id: 'revenue_breakdown', code: 'adir.panel.revenue_breakdown', perm: 'assistant_director.dashboard.panel.revenue_breakdown', label: 'Revenue by category', tab: 'overview', dataKey: 'revenue', sort: 20 },
  { id: 'critical_alerts', code: 'adir.panel.critical_alerts', perm: 'assistant_director.dashboard.panel.critical_alerts', label: 'Critical alerts', tab: 'overview', dataKey: 'criticalAlerts', sort: 30 },
  { id: 'bed_grid', code: 'adir.panel.bed_grid', perm: 'assistant_director.dashboard.panel.bed_grid', label: 'Ward bed occupancy', tab: 'beds', dataKey: 'wards', sort: 40 },
  { id: 'lab_alerts', code: 'adir.panel.lab_alerts', perm: 'assistant_director.dashboard.panel.lab_alerts', label: 'Lab alerts', tab: 'reports', dataKey: 'labAlerts', sort: 50 },
  { id: 'pharmacy_alerts', code: 'adir.panel.pharmacy_alerts', perm: 'assistant_director.dashboard.panel.pharmacy_alerts', label: 'Pharmacy alerts', tab: 'reports', dataKey: 'pharmacyAlerts', sort: 60 },
];

const KPI_BY_CODE = new Map(KPI_DEFS.map((r) => [r.code, r]));
const PANEL_BY_CODE = new Map(PANEL_DEFS.map((r) => [r.code, r]));

function permWithFallback(perm) {
  return `${perm}|${SHARED_PERM}`;
}

function aclUiElements() {
  const rows = [
    [
      'adir.section.dashboard',
      'assistant_director',
      'section',
      'Assistant Director dashboard',
      null,
      null,
      null,
      SHARED_PERM,
      1,
      null,
    ],
  ];
  for (const tab of TAB_DEFS) {
    rows.push([
      tab.code,
      'assistant_director',
      'section',
      tab.label,
      null,
      null,
      null,
      permWithFallback(tab.perm),
      tab.sort,
      'adir.section.dashboard',
    ]);
  }
  for (const kpi of KPI_DEFS) {
    rows.push([
      kpi.code,
      'assistant_director',
      'stat',
      kpi.label,
      null,
      kpi.icon,
      kpi.color,
      permWithFallback(kpi.perm),
      kpi.sort,
      TAB_DEFS.find((t) => t.id === kpi.tab)?.code || null,
    ]);
  }
  for (const panel of PANEL_DEFS) {
    rows.push([
      panel.code,
      'assistant_director',
      'section',
      panel.label,
      null,
      null,
      null,
      permWithFallback(panel.perm),
      panel.sort,
      TAB_DEFS.find((t) => t.id === panel.tab)?.code || null,
    ]);
  }
  return rows;
}

const ALL_ASSISTANT_DIRECTOR_DASHBOARD_PERMISSIONS = [
  ['assistant_director.dashboard.read', 'Assistant Director dashboard (all widgets)', 'assistant_director'],
  ...TAB_DEFS.map((t) => [t.perm, `Assistant Director tab — ${t.label}`, 'assistant_director']),
  ...KPI_DEFS.map((k) => [k.perm, `Assistant Director KPI — ${k.id}`, 'assistant_director']),
  ...PANEL_DEFS.map((p) => [p.perm, `Assistant Director panel — ${p.id}`, 'assistant_director']),
];

function codesForWidgets(visible) {
  const codes = new Set();
  for (const item of visible || []) {
    if (item?.code) codes.add(String(item.code));
  }
  return codes;
}

function filterWidgetDefs(defs, visibleCodes, map) {
  return defs
    .filter((def) => visibleCodes.has(def.code))
    .map((def) => {
      const acl = map.get(def.code);
      return { ...def, label: acl?.label || def.label || def.id };
    });
}

function buildVisibleDashboardModel(aclPack) {
  const sections = aclPack.sections || [];
  const stats = aclPack.stats || [];
  const allCodes = codesForWidgets([...sections, ...stats]);
  const hasShell = allCodes.has('adir.section.dashboard');
  const tabs = filterWidgetDefs(TAB_DEFS, allCodes, new Map(TAB_DEFS.map((t) => [t.code, t]))).map((t) => ({
    ...t,
    label: sections.find((s) => s.code === t.code)?.label || t.label,
  }));
  const kpis = filterWidgetDefs(KPI_DEFS, allCodes, KPI_BY_CODE).map((k) => ({
    ...k,
    label: stats.find((s) => s.code === k.code)?.label || k.label,
  }));
  const panels = filterWidgetDefs(PANEL_DEFS, allCodes, PANEL_BY_CODE).map((p) => ({
    ...p,
    label: sections.find((s) => s.code === p.code)?.label || p.label,
  }));
  return { hasShell, tabs, kpis, panels, allCodes };
}

module.exports = {
  TAB_DEFS,
  KPI_DEFS,
  PANEL_DEFS,
  aclUiElements,
  ALL_ASSISTANT_DIRECTOR_DASHBOARD_PERMISSIONS,
  buildVisibleDashboardModel,
};
