import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatStaffMoney,
  kpisForTab,
  kpiValue,
  panelsForTab,
  staffDashboardMeta} from '../lib/staffDashboardCatalog';

const LIGHT = {
  bg: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  textMid: '#64748b',
  blue: '#1d6fe8',
  green: '#059669',
  amber: '#b45309',
  red: '#dc2626',
  purple: '#6d28d9'};

const DARK = {
  bg: '#0F1117',
  surface: '#181C27',
  border: 'rgba(255,255,255,0.08)',
  text: '#E8EBF4',
  textMid: '#7A82A0',
  blue: '#4E8CF5',
  green: '#36C98E',
  amber: '#F5A623',
  red: '#F05050',
  purple: '#A78BFA'};

function KpiCard({ kpi, data, t, theme }) {
  const val = kpiValue(data, kpi.dataKey);
  const display =
    typeof val === 'number' && kpi.dataKey?.includes('revenue')
      ? formatStaffMoney(val)
      : String(val);
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        minWidth: 140}}
    >
      <div style={{ fontSize: 11, color: theme.textMid, marginBottom: 6 }}>{kpi.label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color || theme.text }}>{display}</div>
      {data?.kpi?.[kpi.dataKey]?.sub ? (
        <div style={{ fontSize: 11, color: theme.textMid, marginTop: 4 }}>{data.kpi[kpi.dataKey].sub}</div>
      ) : null}
    </div>
  );
}

function PanelBox({ title, children, theme }) {
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16}}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: theme.text }}>{title}</div>
      {children}
    </div>
  );
}

function renderPanel(panel, data, t, theme) {
  const panels = data?.panels || {};
  const rows = panels[panel.dataKey];

  if (panel.id === 'quick_actions' && Array.isArray(rows)) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {rows.map((a) => (
          <a
            key={a.code}
            href={a.url}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              background: `${a.color}18`,
              color: a.color,
              fontWeight: 600,
              fontSize: 13,
              textDecoration: 'none',
              border: `1px solid ${a.color}44`}}
          >
            {a.label}
          </a>
        ))}
      </div>
    );
  }

  if (panel.id === 'management_reports' && Array.isArray(rows)) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((r) => (
          <a key={r.url} href={r.url} style={{ color: theme.blue, fontSize: 13, textDecoration: 'none' }}>
            → {r.label}
          </a>
        ))}
      </div>
    );
  }

  if (panel.id === 'hospital_pulse' && Array.isArray(rows)) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ padding: 10, borderRadius: 8, background: `${theme.blue}10` }}>
            <div style={{ fontSize: 11, color: theme.textMid }}>{r.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{r.value}</div>
          </div>
        ))}
      </div>
    );
  }

  if (!Array.isArray(rows) || !rows.length) {
    return <div style={{ fontSize: 13, color: theme.textMid }}>{t('staffDashboard.no_data')}</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.slice(0, 10).map((row, idx) => (
        <div
          key={row.id || idx}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 13,
            padding: '8px 0',
            borderBottom: `1px solid ${theme.border}`}}
        >
          <span style={{ color: theme.text }}>
            {row.patient || row.title || row.name || row.drug || row.code || row.patient_name || '—'}
          </span>
          <span style={{ color: theme.textMid }}>
            {row.status || row.time || row.department || row.ticket || row.validateUrl ? (
              row.validateUrl ? (
                <a href={row.validateUrl} style={{ color: theme.green }}>
                  {t('staffDashboard.validate')}
                </a>
              ) : (
                row.status || row.time || row.department || row.ticket
              )
            ) : (
              '—'
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StaffOperationalDashboard({
  profile = 'front_desk',
  dashboardTabs = [],
  dashboardKpis = [],
  dashboardPanels = []}) {
  const { t } = useTranslation('clinical');
  const meta = staffDashboardMeta(profile);
  const theme = meta.theme === 'dark' ? DARK : LIGHT;
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

  return (
    <div style={{ background: theme.bg, minHeight: '60vh', fontFamily: 'Inter, system-ui, sans-serif', color: theme.text }}>
      <div
        style={{
          background: theme.surface,
          borderBottom: `1px solid ${theme.border}`,
          padding: '14px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12}}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t(meta.titleKey)}</div>
          <div style={{ fontSize: 12, color: theme.textMid }}>{t(meta.subtitleKey)}</div>
        </div>
        <button
          type="button"
          onClick={load}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: theme.surface,
            cursor: 'pointer',
            fontSize: 12}}
        >
          ↻ {t('staffDashboard.refresh')}
        </button>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {error ? (
          <div style={{ padding: 12, background: `${theme.red}18`, color: theme.red, borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        ) : null}

        {tabs.length > 1 ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {tabs.map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  border: `1px solid ${tab === tb.id ? theme.blue : theme.border}`,
                  background: tab === tb.id ? `${theme.blue}18` : theme.surface,
                  color: tab === tb.id ? theme.blue : theme.textMid,
                  fontWeight: tab === tb.id ? 700 : 400,
                  cursor: 'pointer',
                  fontSize: 12}}
              >
                {tb.label}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? <div style={{ color: theme.textMid }}>{t('staffDashboard.loading')}</div> : null}

        {!loading && data ? (
          <>
            {tabKpis.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
                {tabKpis.map((kpi) => (
                  <KpiCard key={kpi.id} kpi={kpi} data={data} t={t} theme={theme} />
                ))}
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
              {tabPanels.map((panel) => (
                <PanelBox key={panel.id} title={panel.label} theme={theme}>
                  {renderPanel(panel, data, t, theme)}
                </PanelBox>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
