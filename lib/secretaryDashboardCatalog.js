'use strict';

/**
 * Hospital Director's Secretary — executive support dashboard.
 * Based on common HMS executive-assistant patterns: calendar, briefings,
 * correspondence prep, management reports (read-only), and director schedule.
 */

const SHARED_PERM =
  'secretary.dashboard.read|scheduling.read|employee.read|hms_reports.read|dashboard.read';

const TAB_DEFS = [
  { id: 'briefing', code: 'sec.tab.briefing', perm: 'secretary.dashboard.tab.briefing', label: 'Director briefing', sort: 10 },
  { id: 'calendar', code: 'sec.tab.calendar', perm: 'secretary.dashboard.tab.calendar', label: 'Calendar', sort: 20 },
  { id: 'correspondence', code: 'sec.tab.correspondence', perm: 'secretary.dashboard.tab.correspondence', label: 'Correspondence', sort: 30 },
];

const KPI_DEFS = [
  { id: 'director_appointments', code: 'sec.kpi.director_appointments', perm: 'secretary.dashboard.kpi.appointments', label: 'Director appointments today', tab: 'calendar', dataKey: 'directorAppointments', icon: 'fa-calendar-check-o', color: '#4338ca', sort: 10 },
  { id: 'meetings_pending', code: 'sec.kpi.meetings_pending', perm: 'secretary.dashboard.kpi.meetings', label: 'Meetings to schedule', tab: 'calendar', dataKey: 'meetingsPending', icon: 'fa-handshake-o', color: '#7c3aed', sort: 20 },
  { id: 'opd_briefing', code: 'sec.kpi.opd_briefing', perm: 'secretary.dashboard.kpi.opd', label: 'OPD visits today', tab: 'briefing', dataKey: 'opdBriefing', icon: 'fa-hospital-o', color: '#0891b2', sort: 30 },
  { id: 'reports_ready', code: 'sec.kpi.reports_ready', perm: 'secretary.dashboard.kpi.reports', label: 'Reports available', tab: 'briefing', dataKey: 'reportsReady', icon: 'fa-bar-chart', color: '#059669', sort: 40 },
  { id: 'staff_directory', code: 'sec.kpi.staff_directory', perm: 'secretary.dashboard.kpi.staff', label: 'Active staff', tab: 'correspondence', dataKey: 'staffDirectory', icon: 'fa-id-badge', color: '#475569', sort: 50 },
  { id: 'pending_tasks', code: 'sec.kpi.pending_tasks', perm: 'secretary.dashboard.kpi.tasks', label: 'Pending tasks', tab: 'correspondence', dataKey: 'pendingTasks', icon: 'fa-tasks', color: '#b45309', sort: 60 },
];

const PANEL_DEFS = [
  { id: 'director_schedule', code: 'sec.panel.director_schedule', perm: 'secretary.dashboard.panel.director_schedule', label: 'Director schedule', tab: 'calendar', dataKey: 'directorSchedule', sort: 10 },
  { id: 'hospital_pulse', code: 'sec.panel.hospital_pulse', perm: 'secretary.dashboard.panel.hospital_pulse', label: 'Hospital pulse', tab: 'briefing', dataKey: 'hospitalPulse', sort: 20 },
  { id: 'management_reports', code: 'sec.panel.management_reports', perm: 'secretary.dashboard.panel.management_reports', label: 'Management reports', tab: 'briefing', dataKey: 'managementReports', sort: 30 },
  { id: 'correspondence_queue', code: 'sec.panel.correspondence_queue', perm: 'secretary.dashboard.panel.correspondence_queue', label: 'Correspondence queue', tab: 'correspondence', dataKey: 'correspondenceQueue', sort: 40 },
  { id: 'visitor_log', code: 'sec.panel.visitor_log', perm: 'secretary.dashboard.panel.visitor_log', label: 'Visitors & calls', tab: 'correspondence', dataKey: 'visitorLog', sort: 50 },
];

const KPI_BY_CODE = new Map(KPI_DEFS.map((r) => [r.code, r]));
const PANEL_BY_CODE = new Map(PANEL_DEFS.map((r) => [r.code, r]));

function permWithFallback(perm) {
  return `${perm}|${SHARED_PERM}`;
}

function aclUiElements() {
  const rows = [
    [
      'sec.section.dashboard',
      'secretary',
      'section',
      'Secretary dashboard',
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
      'secretary',
      'section',
      tab.label,
      null,
      null,
      null,
      permWithFallback(tab.perm),
      tab.sort,
      'sec.section.dashboard',
    ]);
  }
  for (const kpi of KPI_DEFS) {
    rows.push([
      kpi.code,
      'secretary',
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
      'secretary',
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

const ALL_SECRETARY_DASHBOARD_PERMISSIONS = [
  ['secretary.dashboard.read', 'Secretary dashboard (all widgets)', 'secretary'],
  ['secretary.calendar.manage', 'Secretary: manage director calendar & appointments', 'secretary'],
  ['secretary.reports.read', 'Secretary: view management reports for director', 'secretary'],
  ['secretary.correspondence.write', 'Secretary: prepare correspondence & meeting packs', 'secretary'],
  ['secretary.director.briefing.read', 'Secretary: view director operational briefing', 'secretary'],
  ...TAB_DEFS.map((t) => [t.perm, `Secretary tab — ${t.label}`, 'secretary']),
  ...KPI_DEFS.map((k) => [k.perm, `Secretary KPI — ${k.id}`, 'secretary']),
  ...PANEL_DEFS.map((p) => [p.perm, `Secretary panel — ${p.id}`, 'secretary']),
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
  const hasShell = allCodes.has('sec.section.dashboard');
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
  ALL_SECRETARY_DASHBOARD_PERMISSIONS,
  buildVisibleDashboardModel,
};
