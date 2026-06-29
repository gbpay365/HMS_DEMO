'use strict';

const SHARED_PERM = 'cashier.dashboard.read|cashier.read|cashier.write';

const TAB_DEFS = [
  { id: 'today', code: 'cash.tab.today', perm: 'cashier.dashboard.tab.today', label: 'Today', sort: 10 },
];

const KPI_DEFS = [
  { id: 'total_received_today', code: 'cash.kpi.total_received_today', perm: 'cashier.dashboard.kpi.total_received', label: 'Total', tab: 'today', dataKey: 'totalReceived', format: 'money', icon: 'fa-calculator', color: '#1d4ed8', sort: 5 },
  { id: 'total_disbursement_today', code: 'cash.kpi.total_disbursement_today', perm: 'cashier.dashboard.kpi.disbursement', label: 'Total disbursement', tab: 'today', dataKey: 'totalDisbursement', format: 'money', icon: 'fa-arrow-circle-o-up', color: '#dc2626', sort: 6 },
  { id: 'balance_today', code: 'cash.kpi.balance_today', perm: 'cashier.dashboard.kpi.balance', label: 'Balance', tab: 'today', dataKey: 'balance', format: 'money', icon: 'fa-balance-scale', color: '#059669', sort: 7 },
  { id: 'cash_today', code: 'cash.kpi.cash_today', perm: 'cashier.dashboard.kpi.cash', label: 'Cash', tab: 'today', dataKey: 'receivedCash', format: 'money', icon: 'fa-money', color: '#16a34a', sort: 10 },
  { id: 'momo_today', code: 'cash.kpi.momo_today', perm: 'cashier.dashboard.kpi.momo', label: 'MOMO', tab: 'today', dataKey: 'receivedMomo', format: 'money', icon: 'fa-mobile', color: '#eab308', sort: 20 },
  { id: 'om_today', code: 'cash.kpi.om_today', perm: 'cashier.dashboard.kpi.om', label: 'OM', tab: 'today', dataKey: 'receivedOm', format: 'money', icon: 'fa-mobile', color: '#f97316', sort: 30 },
  { id: 'betterpay_today', code: 'cash.kpi.betterpay_today', perm: 'cashier.dashboard.kpi.betterpay', label: 'BetterPay', tab: 'today', dataKey: 'receivedBetterpay', format: 'money', icon: 'fa-qrcode', color: '#0ea5e9', sort: 40 },
  { id: 'wallet_today', code: 'cash.kpi.wallet_today', perm: 'cashier.dashboard.kpi.wallet', label: 'Wallet', tab: 'today', dataKey: 'receivedWallet', format: 'money', icon: 'fa-credit-card', color: '#8b5cf6', sort: 50 },
];

const PANEL_DEFS = [];

const KPI_BY_CODE = new Map(KPI_DEFS.map((r) => [r.code, r]));
const PANEL_BY_CODE = new Map(PANEL_DEFS.map((r) => [r.code, r]));

function permWithFallback(perm) {
  return `${perm}|${SHARED_PERM}`;
}

function aclUiElements() {
  const rows = [
    [
      'cash.section.dashboard',
      'cashier',
      'section',
      'Cashier dashboard',
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
      'cashier',
      'section',
      tab.label,
      null,
      null,
      null,
      permWithFallback(tab.perm),
      tab.sort,
      'cash.section.dashboard',
    ]);
  }
  for (const kpi of KPI_DEFS) {
    rows.push([
      kpi.code,
      'cashier',
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
  return rows;
}

const ALL_CASHIER_DASHBOARD_PERMISSIONS = [
  ['cashier.dashboard.read', 'Cashier dashboard (all widgets)', 'cashier'],
  ...TAB_DEFS.map((t) => [t.perm, `Cashier tab — ${t.label}`, 'cashier']),
  ...KPI_DEFS.map((k) => [k.perm, `Cashier KPI — ${k.id}`, 'cashier']),
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
  const hasShell = allCodes.has('cash.section.dashboard');
  const tabs = filterWidgetDefs(TAB_DEFS, allCodes, new Map(TAB_DEFS.map((t) => [t.code, t]))).map((t) => ({
    ...t,
    label: sections.find((s) => s.code === t.code)?.label || t.label,
  }));
  let kpis = filterWidgetDefs(KPI_DEFS, allCodes, KPI_BY_CODE).map((k) => ({
    ...k,
    label: k.label || stats.find((s) => s.code === k.code)?.label,
  }));
  const hasCashierDashboard =
    allCodes.has('cash.section.dashboard') || KPI_DEFS.some((def) => allCodes.has(def.code));
  if (hasCashierDashboard) {
    const seen = new Set(kpis.map((k) => k.code));
    for (const def of KPI_DEFS) {
      if (seen.has(def.code)) continue;
      if (def.dataKey !== 'totalDisbursement' && def.dataKey !== 'balance') continue;
      kpis.push({
        ...def,
        label: def.label || stats.find((s) => s.code === def.code)?.label,
      });
      seen.add(def.code);
    }
    kpis.sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }
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
  ALL_CASHIER_DASHBOARD_PERMISSIONS,
  buildVisibleDashboardModel,
};
