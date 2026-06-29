import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

function PanelCard({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-card">
      <h3 className="mb-3 text-sm font-bold text-ink">{title}</h3>
      {children}
    </div>
  );
}

function renderPanel(panel, data, t) {
  const panels = data?.panels || {};
  const rows = panels[panel.dataKey];

  if (panel.id === 'quick_actions' && Array.isArray(rows)) {
    return (
      <div className="flex flex-wrap gap-2">
        {rows.map((a) => (
          <a
            key={a.code}
            href={a.url}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold no-underline"
            style={{
              background: `${a.color}18`,
              color: a.color,
              border: `1px solid ${a.color}44`,
            }}
          >
            {a.label}
          </a>
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
    return <div className="text-sm text-slate-500">{t('staffDashboard.no_data')}</div>;
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

function KpiGrid({ kpis, data }) {
  if (!kpis.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8">
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
  const tabPanels = panelsForTab(dashboardPanels, tab);

  const profileIcon = {
    cashier: 'money',
    front_desk: 'hand-o-right',
    secretary: 'briefcase',
    assistant_director: 'line-chart',
  }[profile] || 'bar-chart';

  return (
    <div className="hms-staff-operational-dashboard">
      <SurfaceHero icon={profileIcon} title={t(meta.titleKey)} subtitle={t(meta.subtitleKey)}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {tabs.length > 1
            ? tabs.map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setTab(tb.id)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    tab === tb.id
                      ? 'bg-brand text-white shadow-sm'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tb.label}
                </button>
              ))
            : null}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
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
            <div className="mb-5">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                {t('staffDashboard.summary_heading')}
              </h2>
              <KpiGrid kpis={tabKpis} data={data} />
            </div>
          ) : (
            <div className="mb-4 text-sm text-slate-500">{t('staffDashboard.no_data')}</div>
          )}

          {tabPanels.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {tabPanels.map((panel) => (
                <PanelCard key={panel.id} title={panel.label}>
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
