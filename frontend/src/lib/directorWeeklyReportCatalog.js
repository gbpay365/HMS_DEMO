import { formatDashboardMoney } from './directorDashboardCatalog';

export const WEEKLY_KPI_META = {
  total_patients: { icon: 'fa-hospital-o', accent: '#0ea5e9', unit: '', deltaKey: 'patientsVsPrev', invert: false, format: (s) => Number(s.totalPatients || 0).toLocaleString('en-GB') },
  avg_occupancy: { icon: 'fa-bed', accent: '#0891b2', unit: '', deltaKey: 'occupancyVsPrev', invert: false, format: (s) => `${s.avgOccupancy ?? 0}%` },
  avg_alos: { icon: 'fa-clock-o', accent: '#8b5cf6', unit: 'days', deltaKey: 'alosVsPrev', invert: true, format: (s) => s.avgALOS ?? 0 },
  weekly_revenue: { icon: 'fa-money', accent: '#10b981', unit: '', deltaKey: 'revenueVsPrev', invert: false, format: (s) => formatDashboardMoney(s.revenueWeek) },
  avg_er_wait: { icon: 'fa-ambulance', accent: '#f59e0b', unit: 'min', deltaKey: 'erWaitVsPrev', invert: true, format: (s) => s.avgERWait ?? 0 },
  incidents: { icon: 'fa-exclamation-triangle', accent: '#ef4444', unit: '', deltaKey: 'incidentsVsPrev', invert: true, format: (s) => s.incidentCount ?? 0 },
};

export function weeklyKpiLabel(t, kpi) {
  return t(`directorWeekly.kpis.${kpi.id}`);
}

export function weeklyPanelLabel(t, panel) {
  return t(`directorWeekly.panels.${panel.id}`);
}

export function hasWeeklyPanel(panels, id) {
  return (panels || []).some((p) => p.id === id);
}

export function formatWeeklyAmount(value) {
  return formatDashboardMoney(value);
}
