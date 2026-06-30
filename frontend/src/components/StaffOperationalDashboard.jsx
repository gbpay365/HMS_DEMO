import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PortalQuickActions } from './PortalQuickActionCard';
import { StatCard } from './StatCard';
import { SurfaceHero } from './SurfaceHero';
import {
  formatStaffMoney,
  kpisForTab,
  kpiValue,
  panelsForTab,
  staffDashboardMeta,
} from '../lib/staffDashboardCatalog';

const KPI_ICON_FALLBACK = {
  totalReceived: 'calculator',
  totalDisbursement: 'arrow-circle-o-up',
  balance: 'balance-scale',
  receivedCash: 'money',
  receivedMomo: 'mobile',
  receivedOm: 'mobile',
  receivedBetterpay: 'qrcode',
  receivedWallet: 'credit-card',
};

function normalizeIcon(icon) {
  const raw = String(icon || '').trim();
  if (!raw) return null;
  return raw.replace(/^fa-/, '');
}

function resolveKpiIcon(kpi) {
  return normalizeIcon(kpi.icon) || KPI_ICON_FALLBACK[kpi.dataKey] || 'bar-chart';
}

function kpiTone(kpi) {
  if (kpi.dataKey === 'totalDisbursement') return 'danger';
  if (kpi.dataKey === 'balance') return 'success';
  if (kpi.dataKey === 'totalReceived') return 'brand';
  if (String(kpi.dataKey || '').includes('revenue')) return 'brand';
  if (String(kpi.dataKey || '').includes('pending')) return 'warning';
  return 'default';
}

function formatKpiValue(kpi, data) {
  const val = kpiValue(data, kpi.dataKey);
  if (val === '—') return '—';
  if (kpi.format === 'money' || (typeof val === 'number' && String(kpi.dataKey || '').includes('revenue'))) {
    return formatStaffMoney(val);
  }
  if (typeof val === 'number') return val.toLocaleString('fr-FR');
  return String(val);
}

function PanelCard({ title, children, accent }) {
  return (
    <div
      className="hms-staff-panel-card overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
      style={accent ? { borderTopWidth: 3, borderTopColor: accent } : undefined}
    >
      <div className="hms-staff-panel-card__header border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <h3 className="text-sm font-extrabold tracking-tight text-slate-800">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function QuickActionButton({ action }) {
  const iconCls = String(action.icon || 'fa-circle')
    .replace(/^fa\s+/, '')
    .replace(/^fa-/, '');
  const color = action.color || '#047857';
  return (
    <a
      href={action.url}
      className="hms-staff-quick-btn group no-underline"
      style={{
        '--hms-quick-accent': color,
      }}
    >
      <span
        className="hms-staff-quick-btn__icon"
        style={{
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          boxShadow: `0 4px 12px ${color}35`,
        }}
      >
        <i className={`fa fa-${iconCls}`} aria-hidden="true" />
      </span>
      <span className="hms-staff-quick-btn__label">{action.label}</span>
      <span className="hms-staff-quick-btn__arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}

function renderPanel(panel, data, t) {
  const panels = data?.panels || {};
  const rows = panels[panel.dataKey];

  if (panel.id === 'quick_actions' && Array.isArray(rows)) {
    return (
      <div className="hms-staff-quick-btn-grid">
        {rows.map((a) => (
          <QuickActionButton key={a.code} action={a} />
        ))}
      </div>
    );
  }

  if (panel.id === 'management_reports' && Array.isArray(rows)) {
    return (
      <div className="grid gap-2">
        {rows.map((r) => (
          <a key={r.url} href={r.url} className="text-sm font-medium text-brand no-underline hover:underline">
            → {r.label}
          </a>
        ))}
      </div>
    );
  }

  if (panel.id === 'hospital_pulse' && Array.isArray(rows)) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{r.label}</div>
            <div className="mt-0.5 text-lg font-bold text-ink">{r.value}</div>
          </div>
        ))}
      </div>
    );
  }

  if (!Array.isArray(rows) || !rows.length) {
    return (
      <div className="flex min-h-[88px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
        <i className="fa fa-inbox mb-2 text-lg text-slate-300" aria-hidden="true" />
        <div className="text-sm font-medium text-slate-500">{t('staffDashboard.no_data')}</div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {rows.slice(0, 10).map((row, idx) => (
        <div key={row.id || idx} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="font-medium text-ink">
            {row.patient || row.title || row.name || row.drug || row.code || row.patient_name || '—'}
          </span>
          <span className="shrink-0 text-slate-500">
            {row.validateUrl ? (
              <a href={row.validateUrl} className="font-semibold text-emerald-600 no-underline hover:underline">
                {t('staffDashboard.validate')}
              </a>
            ) : (
              row.status || row.time || row.department || row.ticket || '—'
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function KpiGrid({ kpis, data, profile }) {
  if (!kpis.length) return null;
  const gridClass =
    kpis.length <= 4
      ? 'hms-staff-kpi-grid hms-staff-kpi-grid--4'
      : 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8';
  return (
    <div className={gridClass}>
      {kpis.map((kpi, idx) => (
        <StatCard
          key={kpi.id}
          label={kpi.label}
          value={formatKpiValue(kpi, data)}
          tone={kpiTone(kpi)}
          icon={resolveKpiIcon(kpi)}
          accentColor={kpi.color || null}
          size="compact"
          animated
          animationDelay={idx * 60}
        />
      ))}
    </div>
  );
}

export function StaffOperationalDashboard({
  profile = 'front_desk',
  dashboardTabs = [],
  dashboardKpis = [],
  dashboardPanels = [],
  portalTiles = [],
  portalColor = '#047857',
  hideQuickActionsPanel = false,
}) {
  const { t } = useTranslation('clinical');
  const meta = staffDashboardMeta(profile);
  const tabs = dashboardTabs.length ? dashboardTabs : [{ id: 'today', label: t('staffDashboard.tab_today') }];
  const [tab, setTab] = useState(tabs[0]?.id || 'today');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(meta.api, { credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err.message || t('staffDashboard.load_error'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [meta.api, t]);

  useEffect(() => {
    load();
  }, [load]);

  const tabKpis = kpisForTab(dashboardKpis, tab);
  const tabPanels = panelsForTab(dashboardPanels, tab).filter(
    (panel) => !(hideQuickActionsPanel && panel.id === 'quick_actions')
  );
  const panelsGridClass = tabPanels.length === 1 ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-2';

  const profileIcon = {
    cashier: 'money',
    front_desk: 'hand-o-right',
    secretary: 'briefcase',
    assistant_director: 'line-chart',
  }[profile] || 'bar-chart';

  return (
    <div className={`hms-staff-operational-dashboard hms-staff-operational-dashboard--${profile}`}>
      <SurfaceHero icon={profileIcon} title={t(meta.titleKey)} subtitle={t(meta.subtitleKey)}>
        <div className="hms-staff-hero-toolbar mt-4 flex flex-wrap items-center gap-2">
          {tabs.length > 1
            ? tabs.map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setTab(tb.id)}
                  className={`hms-staff-hero-tab${tab === tb.id ? ' hms-staff-hero-tab--active' : ''}`}
                >
                  {tb.label}
                </button>
              ))
            : null}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="hms-staff-hero-tab hms-staff-hero-tab--refresh ml-auto"
          >
            <i className={`fa fa-refresh${loading ? ' fa-spin' : ''}`} aria-hidden="true" />
            {t('staffDashboard.refresh')}
          </button>
        </div>
      </SurfaceHero>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? <div className="mb-4 text-sm text-slate-500">{t('staffDashboard.loading')}</div> : null}

      {!loading && data ? (
        <>
          {tabKpis.length > 0 ? (
            <div className="mb-6">
              <h2 className="hms-staff-section-title">{t('staffDashboard.summary_heading')}</h2>
              <KpiGrid kpis={tabKpis} data={data} profile={profile} />
            </div>
          ) : (
            <div className="mb-4 text-sm text-slate-500">{t('staffDashboard.no_data')}</div>
          )}

          {portalTiles.length > 0 ? (
            <div className="mb-6">
              <PortalQuickActions tiles={portalTiles} accentColor={portalColor} dense />
            </div>
          ) : null}

          {tabPanels.length > 0 ? (
            <div className={panelsGridClass}>
              {tabPanels.map((panel) => (
                <PanelCard
                  key={panel.id}
                  title={panel.label}
                  accent={panel.id === 'payment_codes' ? '#10b981' : panel.id === 'quick_actions' ? '#0c8b8b' : undefined}
                >
                  {renderPanel(panel, data, t)}
                </PanelCard>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
