'use strict';

/**
 * Director daily dashboard — ACL catalogue (tabs, KPIs, panels, modules).
 * All widgets are permission-driven; nothing is tied to a fixed role id.
 */

const {
  REVENUE_STAT_DEFS,
  aclUiElements: revenueAclUiElements,
  ALL_DIRECTOR_REVENUE_PERMISSIONS,
} = require('./directorRevenueCatalog');

const DASHBOARD_SHARED_PERM =
  'director.dashboard.read|hms_reports.full|hms_reports.read|dashboard.read';

const TAB_DEFS = [
  { id: 'overview', code: 'dir.tab.overview', perm: 'director.dashboard.tab.overview', label: 'Overview', sort: 10 },
  { id: 'beds', code: 'dir.tab.beds', perm: 'director.dashboard.tab.beds', label: 'Bed map', sort: 20 },
  { id: 'flow', code: 'dir.tab.flow', perm: 'director.dashboard.tab.flow', label: 'Patient flow', sort: 30 },
  { id: 'staff', code: 'dir.tab.staff', perm: 'director.dashboard.tab.staff', label: 'Staff roster', sort: 40 },
  { id: 'revenue', code: 'dir.tab.revenue', perm: 'director.dashboard.tab.revenue', label: 'Revenue', sort: 50 },
  { id: 'alerts', code: 'dir.tab.alerts', perm: 'director.dashboard.tab.alerts', label: 'Alerts', sort: 60 },
];

const KPI_DEFS = [
  { id: 'patients_today', code: 'dir.kpi.patients_today', perm: 'director.dashboard.kpi.patients', label: 'Patients today', tab: 'overview', dataKey: 'patientsToday', icon: 'fa-users', color: '#4E8CF5', sort: 10 },
  { id: 'bed_occupancy', code: 'dir.kpi.bed_occupancy', perm: 'director.dashboard.kpi.beds', label: 'Bed occupancy', tab: 'overview', dataKey: 'bedOccupancy', icon: 'fa-bed', color: '#F5A623', sort: 20 },
  { id: 'er_wait', code: 'dir.kpi.er_wait', perm: 'director.dashboard.kpi.er_wait', label: 'ER average wait', tab: 'overview', dataKey: 'erWait', icon: 'fa-ambulance', color: '#F05050', sort: 30 },
  { id: 'revenue_today', code: 'dir.kpi.revenue_today', perm: 'director.dashboard.kpi.revenue', label: 'Revenue today', tab: 'overview', dataKey: 'revenueToday', icon: 'fa-money', color: '#36C98E', sort: 40 },
  { id: 'staff_onduty', code: 'dir.kpi.staff_onduty', perm: 'director.dashboard.kpi.staff', label: 'Staff on duty', tab: 'overview', dataKey: 'staffOnDuty', icon: 'fa-id-badge', color: '#A78BFA', sort: 50 },
  { id: 'pending_lab', code: 'dir.kpi.pending_lab', perm: 'director.dashboard.kpi.lab', label: 'Pending lab results', tab: 'overview', dataKey: 'pendingLab', icon: 'fa-flask', color: '#F5A623', sort: 60 },
  { id: 'flow_admitted', code: 'dir.kpi.flow_admitted', perm: 'director.dashboard.kpi.flow_admitted', label: 'Total admitted', tab: 'flow', dataKey: 'flowAdmitted', icon: 'fa-sign-in', color: '#4E8CF5', sort: 70 },
  { id: 'flow_discharged', code: 'dir.kpi.flow_discharged', perm: 'director.dashboard.kpi.flow_discharged', label: 'Total discharged', tab: 'flow', dataKey: 'flowDischarged', icon: 'fa-sign-out', color: '#36C98E', sort: 80 },
  { id: 'flow_net', code: 'dir.kpi.flow_net', perm: 'director.dashboard.kpi.flow_net', label: 'Net inpatients', tab: 'flow', dataKey: 'flowNet', icon: 'fa-hospital-o', color: '#A78BFA', sort: 90 },
  { id: 'revenue_collected', code: 'dir.kpi.revenue_collected', perm: 'director.dashboard.kpi.revenue_collected', label: 'Total collected', tab: 'revenue', dataKey: 'revenueCollected', icon: 'fa-money', color: '#36C98E', sort: 100 },
  { id: 'revenue_billed', code: 'dir.kpi.revenue_billed', perm: 'director.dashboard.kpi.revenue_billed', label: 'Total billed', tab: 'revenue', dataKey: 'revenueBilled', icon: 'fa-file-text-o', color: '#4E8CF5', sort: 110 },
  { id: 'revenue_rate', code: 'dir.kpi.revenue_rate', perm: 'director.dashboard.kpi.revenue_rate', label: 'Collection rate', tab: 'revenue', dataKey: 'revenueRate', icon: 'fa-pie-chart', color: '#F5A623', sort: 120 },
];

const PANEL_DEFS = [
  { id: 'patient_flow', code: 'dir.panel.patient_flow', perm: 'director.dashboard.panel.patient_flow', label: 'Patient flow', tab: 'overview', dataKey: 'patientFlow', sort: 10 },
  { id: 'revenue_breakdown', code: 'dir.panel.revenue_breakdown', perm: 'director.dashboard.panel.revenue_breakdown', label: 'Revenue by category', tab: 'overview', dataKey: 'revenue', sort: 20 },
  { id: 'critical_alerts', code: 'dir.panel.critical_alerts', perm: 'director.dashboard.panel.critical_alerts', label: 'Critical alerts', tab: 'overview', dataKey: 'criticalAlerts', sort: 30 },
  { id: 'bed_grid', code: 'dir.panel.bed_grid', perm: 'director.dashboard.panel.bed_grid', label: 'Ward bed occupancy', tab: 'beds', dataKey: 'wards', sort: 40 },
  { id: 'staff_roster', code: 'dir.panel.staff_roster', perm: 'director.dashboard.panel.staff_roster', label: 'Staff attendance', tab: 'staff', dataKey: 'staff', sort: 50 },
  { id: 'lab_alerts', code: 'dir.panel.lab_alerts', perm: 'director.dashboard.panel.lab_alerts', label: 'Lab & radiology alerts', tab: 'alerts', dataKey: 'labAlerts', sort: 60 },
  { id: 'pharmacy_alerts', code: 'dir.panel.pharmacy_alerts', perm: 'director.dashboard.panel.pharmacy_alerts', label: 'Pharmacy stock alerts', tab: 'alerts', dataKey: 'pharmacyAlerts', sort: 70 },
];

const TAB_BY_CODE = new Map(TAB_DEFS.map((r) => [r.code, r]));
const KPI_BY_CODE = new Map(KPI_DEFS.map((r) => [r.code, r]));
const PANEL_BY_CODE = new Map(PANEL_DEFS.map((r) => [r.code, r]));

function permWithFallback(perm) {
  return `${perm}|${DASHBOARD_SHARED_PERM}`;
}

function aclUiElements() {
  const rows = [
    [
      'dir.section.daily_dashboard',
      'director',
      'section',
      'Director daily dashboard',
      null,
      null,
      null,
      DASHBOARD_SHARED_PERM,
      1,
      null,
    ],
  ];

  for (const tab of TAB_DEFS) {
    rows.push([
      tab.code,
      'director',
      'section',
      tab.label,
      null,
      null,
      null,
      permWithFallback(tab.perm),
      tab.sort,
      'dir.section.daily_dashboard',
    ]);
  }

  for (const kpi of KPI_DEFS) {
    rows.push([
      kpi.code,
      'director',
      'stat',
      kpi.label || kpi.id,
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
      'director',
      'section',
      panel.label || panel.id,
      null,
      null,
      null,
      permWithFallback(panel.perm),
      panel.sort,
      TAB_DEFS.find((t) => t.id === panel.tab)?.code || null,
    ]);
  }

  return rows.concat(revenueAclUiElements());
}

const ALL_DIRECTOR_DASHBOARD_PERMISSIONS = [
  ['director.dashboard.read', 'Director daily dashboard (all widgets)', 'director'],
  ...TAB_DEFS.map((t) => [t.perm, `Director dashboard tab — ${t.label}`, 'director']),
  ...KPI_DEFS.map((k) => [k.perm, `Director dashboard KPI — ${k.id}`, 'director']),
  ...PANEL_DEFS.map((p) => [p.perm, `Director dashboard panel — ${p.id}`, 'director']),
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

function buildVisibleDashboardModel(aclPack) {
  const sections = aclPack.sections || [];
  const stats = aclPack.stats || [];
  const allCodes = codesForWidgets([...sections, ...stats]);
  const sectionByCode = new Map(sections.map((s) => [s.code, s]));

  const hasShell = allCodes.has('dir.section.daily_dashboard');
  const tabs = TAB_DEFS.filter((t) => allCodes.has(t.code)).map((t) => ({
    ...t,
    label: sectionByCode.get(t.code)?.label || t.label,
  }));

  const kpis = filterWidgetDefs(KPI_DEFS, allCodes, KPI_BY_CODE).map((k) => ({
    ...k,
    label: stats.find((s) => s.code === k.code)?.label || k.label,
  }));

  const panels = filterWidgetDefs(PANEL_DEFS, allCodes, PANEL_BY_CODE).map((p) => ({
    ...p,
    label: sections.find((s) => s.code === p.code)?.label || p.label,
  }));

  const revenueStats = stats.filter((s) => String(s.code || '').startsWith('dir.stat.revenue_'));

  return { hasShell, tabs, kpis, panels, revenueStats, allCodes };
}

module.exports = {
  TAB_DEFS,
  KPI_DEFS,
  PANEL_DEFS,
  REVENUE_STAT_DEFS,
  TAB_BY_CODE,
  KPI_BY_CODE,
  PANEL_BY_CODE,
  DASHBOARD_SHARED_PERM,
  aclUiElements,
  ALL_DIRECTOR_DASHBOARD_PERMISSIONS,
  ALL_DIRECTOR_REVENUE_PERMISSIONS,
  buildVisibleDashboardModel,
};
