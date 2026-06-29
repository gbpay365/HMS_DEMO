import { currencyCode, formatMoney } from './hmsLocale';

export const DIRECTOR_TAB_IDS = ['overview', 'beds', 'flow', 'staff', 'revenue', 'alerts'];

/** @deprecated Use directorCurrencyCode() */
export const DIRECTOR_CURRENCY = 'XAF';

export function directorCurrencyCode() {
  return currencyCode() || DIRECTOR_CURRENCY;
}

export function formatDashboardMoney(value) {
  return formatMoney(value);
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
