const PROFILE_META = {
  assistant_director: {
    titleKey: 'staffDashboard.assistant_director.title',
    subtitleKey: 'staffDashboard.assistant_director.subtitle',
    api: '/portal/api/assistant-director-dashboard',
    theme: 'dark'},
  front_desk: {
    titleKey: 'staffDashboard.front_desk.title',
    subtitleKey: 'staffDashboard.front_desk.subtitle',
    api: '/portal/api/front-desk-dashboard',
    theme: 'light'},
  secretary: {
    titleKey: 'staffDashboard.secretary.title',
    subtitleKey: 'staffDashboard.secretary.subtitle',
    api: '/portal/api/secretary-dashboard',
    theme: 'light'}};

export function staffDashboardMeta(profile) {
  return PROFILE_META[profile] || PROFILE_META.front_desk;
}

export function kpisForTab(kpis, tabId) {
  return (kpis || []).filter((k) => k.tab === tabId);
}

export function panelsForTab(panels, tabId) {
  return (panels || []).filter((p) => p.tab === tabId);
}

export function kpiValue(data, dataKey) {
  const row = data?.kpi?.[dataKey];
  if (!row) return '—';
  if (row.value == null) return '—';
  return row.value;
}

export function formatStaffMoney(v) {
  const n = Math.round(Number(v) || 0);
  if (!n) return '0 XAF';
  return `${n.toLocaleString('en-GB')} XAF`;
}
