import { formatDashboardMoney } from './directorDashboardCatalog';

export const MONTHLY_KPI_META = {
  total_revenue: { accent: '#0ea5e9', deltaKey: 'revenue_mom_pct', invert: false, format: (s) => formatDashboardMoney(s.total_revenue) },
  gross_profit: { accent: '#10b981', deltaKey: null, invert: false, format: (s) => formatDashboardMoney(s.gross_profit) },
  gross_margin: { accent: '#10b981', deltaKey: null, invert: false, format: (s) => `${s.gross_margin_pct ?? 0}%` },
  ebitda: { accent: '#8b5cf6', deltaKey: null, invert: false, format: (s) => formatDashboardMoney(s.ebitda) },
  ebitda_margin: { accent: '#8b5cf6', deltaKey: null, invert: false, format: (s) => `${s.ebitda_margin_pct ?? 0}%` },
  payroll_cost: { accent: '#f59e0b', deltaKey: null, invert: true, format: (s) => formatDashboardMoney(s.total_payroll) },
};

export function monthlyKpiLabel(t, kpi) {
  return t(`directorMonthly.kpis.${kpi.id}`);
}

export function monthlyPanelLabel(t, panel) {
  return t(`directorMonthly.panels.${panel.id}`);
}

export function hasMonthlyPanel(panels, id) {
  return (panels || []).some((p) => p.id === id);
}

export function formatMonthlyMoney(value) {
  return formatDashboardMoney(value);
}

export function formatMonthlyPct(value) {
  if (value == null) return '—';
  return `${value > 0 ? '+' : ''}${value}%`;
}

export function categoryLabel(s) {
  return String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
