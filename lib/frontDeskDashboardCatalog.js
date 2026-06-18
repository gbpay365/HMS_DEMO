'use strict';

const SHARED_PERM = 'front_desk.dashboard.read|dashboard.read|patient.read|scheduling.read|opd.read';

const TAB_DEFS = [
  { id: 'today', code: 'fd.tab.today', perm: 'front_desk.dashboard.tab.today', label: 'Today', sort: 10 },
  { id: 'queue', code: 'fd.tab.queue', perm: 'front_desk.dashboard.tab.queue', label: 'OPD queue', sort: 20 },
  { id: 'appointments', code: 'fd.tab.appointments', perm: 'front_desk.dashboard.tab.appointments', label: 'Appointments', sort: 30 },
];

const KPI_DEFS = [
  { id: 'registrations_today', code: 'fd.kpi.registrations_today', perm: 'front_desk.dashboard.kpi.registrations', label: 'New registrations', tab: 'today', dataKey: 'registrationsToday', icon: 'fa-user-plus', color: '#0c8b8b', sort: 10 },
  { id: 'visits_today', code: 'fd.kpi.visits_today', perm: 'front_desk.dashboard.kpi.visits', label: 'Visits created', tab: 'today', dataKey: 'visitsToday', icon: 'fa-list-alt', color: '#1a6bd8', sort: 20 },
  { id: 'vitals_pending', code: 'fd.kpi.vitals_pending', perm: 'front_desk.dashboard.kpi.vitals', label: 'Vitals pending', tab: 'today', dataKey: 'vitalsPending', icon: 'fa-heartbeat', color: '#ec4899', sort: 30 },
  { id: 'payment_validations', code: 'fd.kpi.payment_validations', perm: 'front_desk.dashboard.kpi.payment_codes', label: 'Payment codes to validate', tab: 'today', dataKey: 'paymentValidations', icon: 'fa-check-circle', color: '#10b981', sort: 40 },
  { id: 'appointments_today', code: 'fd.kpi.appointments_today', perm: 'front_desk.dashboard.kpi.appointments', label: 'Appointments today', tab: 'appointments', dataKey: 'appointmentsToday', icon: 'fa-calendar', color: '#f59e0b', sort: 50 },
  { id: 'waiting_patients', code: 'fd.kpi.waiting_patients', perm: 'front_desk.dashboard.kpi.waiting', label: 'Waiting in queue', tab: 'queue', dataKey: 'waitingPatients', icon: 'fa-clock-o', color: '#ef4444', sort: 60 },
];

const PANEL_DEFS = [
  { id: 'quick_actions', code: 'fd.panel.quick_actions', perm: 'front_desk.dashboard.panel.quick_actions', label: 'Quick actions', tab: 'today', dataKey: 'quickActions', sort: 10 },
  { id: 'opd_queue', code: 'fd.panel.opd_queue', perm: 'front_desk.dashboard.panel.opd_queue', label: 'OPD queue snapshot', tab: 'queue', dataKey: 'opdQueue', sort: 20 },
  { id: 'appointments_list', code: 'fd.panel.appointments_list', perm: 'front_desk.dashboard.panel.appointments_list', label: 'Today\'s appointments', tab: 'appointments', dataKey: 'appointmentsList', sort: 30 },
  { id: 'payment_codes', code: 'fd.panel.payment_codes', perm: 'front_desk.dashboard.panel.payment_codes', label: 'Payment code validation', tab: 'today', dataKey: 'paymentCodes', sort: 40 },
];

const KPI_BY_CODE = new Map(KPI_DEFS.map((r) => [r.code, r]));
const PANEL_BY_CODE = new Map(PANEL_DEFS.map((r) => [r.code, r]));

function permWithFallback(perm) {
  return `${perm}|${SHARED_PERM}`;
}

function aclUiElements() {
  const rows = [
    [
      'fd.section.dashboard',
      'front_desk',
      'section',
      'Front Desk dashboard',
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
      'front_desk',
      'section',
      tab.label,
      null,
      null,
      null,
      permWithFallback(tab.perm),
      tab.sort,
      'fd.section.dashboard',
    ]);
  }
  for (const kpi of KPI_DEFS) {
    rows.push([
      kpi.code,
      'front_desk',
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
      'front_desk',
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

const ALL_FRONT_DESK_DASHBOARD_PERMISSIONS = [
  ['front_desk.dashboard.read', 'Front Desk dashboard (all widgets)', 'front_desk'],
  ['front_desk.visit.create', 'Front Desk: create OPD visits', 'front_desk'],
  ['front_desk.vitals.record', 'Front Desk: record patient vitals', 'front_desk'],
  ['front_desk.payment_code.validate', 'Front Desk: validate consultation payment codes', 'front_desk'],
  ['front_desk.appointment.book', 'Front Desk: book appointments', 'front_desk'],
  ['front_desk.patient.register', 'Front Desk: register new patients', 'front_desk'],
  ...TAB_DEFS.map((t) => [t.perm, `Front Desk tab — ${t.label}`, 'front_desk']),
  ...KPI_DEFS.map((k) => [k.perm, `Front Desk KPI — ${k.id}`, 'front_desk']),
  ...PANEL_DEFS.map((p) => [p.perm, `Front Desk panel — ${p.id}`, 'front_desk']),
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
  const hasShell = allCodes.has('fd.section.dashboard');
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
  ALL_FRONT_DESK_DASHBOARD_PERMISSIONS,
  buildVisibleDashboardModel,
};
