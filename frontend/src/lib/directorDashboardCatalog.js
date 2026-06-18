export const DIRECTOR_TAB_IDS = ['overview', 'beds', 'flow', 'staff', 'revenue', 'alerts'];
export const DIRECTOR_CURRENCY = 'XAF';

function formatDashboardNumber(value) {
  return Math.round(Number(value || 0)).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0});
}

export function formatDashboardMoney(value) {
  return `${formatDashboardNumber(value)} ${DIRECTOR_CURRENCY}`;
}

export function formatDashboardAmount(value) {
  return formatDashboardMoney(value);
}

export function kpisForTab(kpis, tabId) {
  return (kpis || []).filter((k) => k.tab === tabId);
}

export function panelsForTab(panels, tabId) {
  return (panels || []).filter((p) => p.tab === tabId);
}

export function tabLabel(t, tab) {
  return t(`directorDashboard.tabs.${tab.id}`);
}

export function kpiLabel(t, kpi) {
  return t(`directorDashboard.kpis.${kpi.id}`);
}

export function panelLabel(t, panel) {
  return t(`directorDashboard.panels.${panel.id}`);
}
