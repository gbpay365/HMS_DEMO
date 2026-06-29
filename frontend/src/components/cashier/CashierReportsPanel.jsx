import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { formatMoney } from '../../lib/hmsLocale';
import { CashierReportHubBar } from './CashierReportHubBar';
import { CashierDailySummaryPanel } from './CashierDailySummaryPanel';
import { CashierEodPanel } from './CashierEodPanel';
import { CashierLedgerPanel } from './CashierLedgerPanel';
import { PaymentMethodChip, ReportKpiTile, ReportLoading, ReportTh } from './CashierReportUi';

const PERIOD_OPTIONS = [
  { key: 'this_month', labelKey: 'cashier_odoo.reports_period_month' },
  { key: 'last_month', labelKey: 'cashier_odoo.reports_period_last_month' },
  { key: 'this_week', labelKey: 'cashier_odoo.reports_period_week' },
  { key: 'today', labelKey: 'cashier_odoo.reports_period_today' },
];

const REPORT_TABS = [
  { id: 'revenue', labelKey: 'cashier_odoo.reports_tab_revenue' },
  { id: 'collections', labelKey: 'cashier_odoo.reports_tab_collections' },
  { id: 'disbursements', labelKey: 'cashier_odoo.reports_tab_disbursements' },
];

function formatCompactMoney(amount) {
  const n = Number(amount) || 0;
  const code = formatMoney(0).split(' ').pop() || '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${code}`.trim();
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K ${code}`.trim();
  return formatMoney(n);
}

function formatChartTick(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
}

function ReportKpiCard({ label, value, deltaPct, tOps, icon = 'line-chart', tone = 'default', delay = 0 }) {
  const pct = Number(deltaPct) || 0;
  const positive = pct >= 0;
  const sub = (
    <span className={`rpt-delta${positive ? ' rpt-delta--up' : ' rpt-delta--down'}`}>
      {positive ? '+' : ''}
      {pct.toFixed(1)}% {tOps('cashier_odoo.reports_vs_prior', { defaultValue: 'vs prior period' })}
    </span>
  );
  return <ReportKpiTile icon={icon} label={label} value={value} sub={sub} tone={tone} delay={delay} />;
}

function CategoryDonut({ series = [] }) {
  const total = series.reduce((s, x) => s + (Number(x.value) || 0), 0);
  let cumulative = 0;
  const stops = total
    ? series
        .filter((s) => (Number(s.value) || 0) > 0)
        .map((seg) => {
          const start = (cumulative / total) * 100;
          cumulative += Number(seg.value) || 0;
          const end = (cumulative / total) * 100;
          return `${seg.color} ${start}% ${end}%`;
        })
        .join(', ')
    : '';

  return (
    <div className="cs-donut-layout rpt-donut-layout">
      <div
        className="cs-donut rpt-donut"
        style={{ background: stops ? `conic-gradient(${stops})` : '#e5e7eb' }}
        aria-hidden="true"
      >
        <div className="cs-donut-hole" />
      </div>
      <div className="cs-donut-legend rpt-donut-legend">
        {series.map((item) => (
          <div key={item.key} className="cs-donut-legend__row">
            <span className="cs-donut-legend__dot" style={{ background: item.color }} />
            <span className="cs-donut-legend__label">{item.label}</span>
            <span className="cs-donut-legend__value">{formatMoney(item.value || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyRevenueLineChart({ series = [] }) {
  const values = series.map((p) => Number(p.value) || 0);
  const maxVal = Math.max(...values, 1);
  const scaleMax = Math.max(maxVal * 1.1, maxVal + 1);
  const width = 640;
  const height = 220;
  const padX = 8;
  const padY = 12;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const points = series.map((p, i) => {
    const x = padX + (series.length <= 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
    const y = padY + plotH - ((Number(p.value) || 0) / scaleMax) * plotH;
    return { x, y, label: p.label };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1]?.x.toFixed(1) || padX} ${padY + plotH} L ${points[0]?.x.toFixed(1) || padX} ${padY + plotH} Z`;
  const tickIndexes = [0, Math.floor(series.length / 4), Math.floor(series.length / 2), Math.floor((series.length * 3) / 4), series.length - 1]
    .filter((v, i, arr) => v >= 0 && arr.indexOf(v) === i);

  return (
    <div className="rpt-line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="rpt-line-chart__svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="rptLineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padY + plotH * (1 - pct);
          return <line key={pct} x1={padX} y1={y} x2={width - padX} y2={y} className="rpt-line-chart__grid" />;
        })}
        <path d={areaPath} fill="url(#rptLineFill)" />
        <path d={linePath} className="rpt-line-chart__line" fill="none" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" className="rpt-line-chart__dot" />
        ))}
      </svg>
      <div className="rpt-line-chart__x">
        {tickIndexes.map((idx) => (
          <span key={idx}>{series[idx]?.label || ''}</span>
        ))}
      </div>
      <div className="rpt-line-chart__y" aria-hidden="true">
        {[1, 0.75, 0.5, 0.25, 0].map((pct) => (
          <span key={pct}>{formatChartTick(scaleMax * pct)}</span>
        ))}
      </div>
    </div>
  );
}

function MonthlyTargetBars({ bars = [] }) {
  const maxVal = Math.max(...bars.flatMap((b) => [b.actual || 0, b.target || 0]), 1);
  const scaleMax = Math.ceil(maxVal / 100_000) * 100_000 || maxVal;

  return (
    <div className="rpt-target-chart">
      <div className="rpt-target-chart__y" aria-hidden="true">
        {[1, 0.75, 0.5, 0.25, 0].map((pct) => (
          <span key={pct}>{formatChartTick(scaleMax * pct)}</span>
        ))}
      </div>
      <div className="rpt-target-chart__plot">
        <div className="rpt-target-chart__grid">
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <div key={pct} className="rpt-target-chart__gridline" style={{ bottom: `${pct * 100}%` }} />
          ))}
        </div>
        <div className="rpt-target-chart__bars">
          {bars.map((bar) => {
            const actualPct = Math.max(4, Math.round(((bar.actual || 0) / scaleMax) * 100));
            const targetPct = Math.max(4, Math.round(((bar.target || 0) / scaleMax) * 100));
            return (
              <div key={bar.key} className="rpt-target-chart__col">
                <div className="rpt-target-chart__pair">
                  <div className="rpt-target-chart__bar-wrap">
                    <div className="rpt-target-chart__bar rpt-target-chart__bar--actual" style={{ height: `${actualPct}%` }} title={bar.actual_fmt} />
                  </div>
                  <div className="rpt-target-chart__bar-wrap">
                    <div className="rpt-target-chart__bar rpt-target-chart__bar--target" style={{ height: `${targetPct}%` }} title={bar.target_fmt} />
                  </div>
                </div>
                <span className="rpt-target-chart__label">{bar.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rpt-target-chart__legend">
        <span><i className="rpt-swatch rpt-swatch--actual" /> Actual</span>
        <span><i className="rpt-swatch rpt-swatch--target" /> Target</span>
      </div>
    </div>
  );
}

function CollectionsMethodChart({ series = [] }) {
  const maxVal = Math.max(...series.map((s) => s.value || 0), 1);
  const scaleMax = Math.max(1_200_000, Math.ceil(maxVal / 300_000) * 300_000);

  return (
    <div className="shift-chart rpt-method-chart">
      <div className="shift-chart__y">
        {[1, 0.75, 0.5, 0.25, 0].map((pct) => (
          <span key={pct} className="shift-chart__tick">{formatChartTick(scaleMax * pct)}</span>
        ))}
      </div>
      <div className="shift-chart__plot">
        <div className="shift-chart__grid">
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
            <div key={pct} className="shift-chart__gridline" />
          ))}
        </div>
        <div className="shift-chart__bars">
          {series.map((item) => {
            const pct = Math.max(4, Math.round(((item.value || 0) / scaleMax) * 100));
            return (
              <div key={item.key} className="shift-chart__col">
                <div className="shift-chart__bar-wrap">
                  <div className="shift-chart__bar" style={{ height: `${pct}%`, background: item.color }} title={formatMoney(item.value)} />
                </div>
                <span className="shift-chart__label">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CashierReportsPanel({ initialData = {}, initialHubTab = 'revenue' }) {
  const { t: tOps } = useTranslation('ops');
  const [hubTab, setHubTab] = useState(initialHubTab || 'revenue');
  const [periodKey, setPeriodKey] = useState(initialData.period_key || 'this_month');
  const [activeTab, setActiveTab] = useState('revenue');
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(initialData.generated_at || null);

  useEffect(() => {
    setHubTab(initialHubTab || 'revenue');
  }, [initialHubTab]);

  const switchHubTab = useCallback((nextTab) => {
    setHubTab(nextTab);
    const params = new URLSearchParams(window.location.search);
    params.set('page', 'reports');
    if (!nextTab || nextTab === 'revenue') params.delete('report');
    else params.set('report', nextTab);
    window.history.replaceState({}, '', `/cashier?${params.toString()}`);
  }, []);

  const loadReports = useCallback(async (nextPeriod, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/cashier/reports?period=${encodeURIComponent(nextPeriod)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (json.ok) {
        setData(json);
        setLastUpdated(json.generated_at || new Date().toISOString());
      }
    } catch {
      /* keep prior data */
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hubTab !== 'revenue') return undefined;
    loadReports(periodKey);
  }, [periodKey, loadReports, hubTab]);

  useEffect(() => {
    if (hubTab !== 'revenue') return undefined;
    const timer = window.setInterval(() => {
      loadReports(periodKey, { silent: true });
    }, 60000);
    return () => window.clearInterval(timer);
  }, [periodKey, loadReports, hubTab]);

  const kpi = data.kpi || {};
  const exportHref = useMemo(() => {
    const date = data.bounds?.start || '';
    const period = data.bounds?.period || 'month';
    return `/cashier/daily-summary?period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`;
  }, [data.bounds]);

  const handlePrint = () => {
    window.open(exportHref, '_blank', 'noopener');
  };

  return (
    <div className="rpt-page">
      <CashierReportHubBar activeTab={hubTab} onTabChange={switchHubTab} className="rpt-hub-tabs--page" />

      {hubTab === 'daily_summary' ? <CashierDailySummaryPanel /> : null}
      {hubTab === 'eod' ? <CashierEodPanel /> : null}
      {hubTab === 'ledger' ? <CashierLedgerPanel /> : null}

      {hubTab === 'revenue' ? (
        <div className="cs-rpt-panel cs-ledger-panel cs-rpt-analytics">
      <div className="rpt-toolbar cs-rpt-toolbar">
        <div className="rpt-toolbar__title">
          <FaIcon name="line-chart" className="rpt-toolbar__icon" />
          {tOps('cashier_odoo.page_reports', { defaultValue: 'Revenue analytics' })}
          <span className="cs-badge bg-paid rpt-live-badge">
            {tOps('cashier_odoo.reports_live', { defaultValue: 'Live feed' })}
            {lastUpdated
              ? ` · ${new Date(lastUpdated).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </span>
        </div>
        <div className="rpt-toolbar__actions">
          <select
            className="cs-select rpt-period-select"
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            aria-label={tOps('cashier_odoo.reports_period_aria', { defaultValue: 'Report period' })}
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {tOps(opt.labelKey, { defaultValue: opt.key })}
              </option>
            ))}
          </select>
          <a href={exportHref} className="cs-btn cs-btn-sm rpt-export-btn">
            <FaIcon name="download" /> {tOps('cashier_odoo.reports_export', { defaultValue: 'Export' })}
          </a>
          <button type="button" className="cs-btn cs-btn-sm rpt-print-btn" onClick={handlePrint}>
            <FaIcon name="print" /> {tOps('cashier_odoo.reports_print', { defaultValue: 'Print' })}
          </button>
        </div>
      </div>

      <div className="row rpt-kpi-row cs-ledger-content">
        <ReportKpiCard
          label={tOps('cashier_odoo.reports_kpi_revenue', { defaultValue: 'Total revenue (net)' })}
          value={formatCompactMoney(kpi.total_revenue_net?.value || 0)}
          deltaPct={kpi.total_revenue_net?.delta_pct}
          tOps={tOps}
          icon="money"
          tone="accent"
          delay={0.04}
        />
        <ReportKpiCard
          label={tOps('cashier_odoo.reports_kpi_collection', { defaultValue: 'Collection rate' })}
          value={kpi.collection_rate?.fmt || '0%'}
          deltaPct={kpi.collection_rate?.delta_pct}
          tOps={tOps}
          icon="percent"
          tone="primary"
          delay={0.08}
        />
        <ReportKpiCard
          label={tOps('cashier_odoo.reports_kpi_avg_bill', { defaultValue: 'Avg bill value' })}
          value={kpi.avg_bill_value?.fmt || formatMoney(0)}
          deltaPct={kpi.avg_bill_value?.delta_pct}
          tOps={tOps}
          icon="file-text-o"
          tone="muted"
          delay={0.12}
        />
        <ReportKpiCard
          label={tOps('cashier_odoo.reports_kpi_insurance', { defaultValue: 'Insurance recovery' })}
          value={kpi.insurance_recovery?.fmt || '0%'}
          deltaPct={kpi.insurance_recovery?.delta_pct}
          tOps={tOps}
          icon="shield"
          tone="warn"
          delay={0.16}
        />
      </div>

      <div className="cs-inner-tabs rpt-inner-tabs" role="tablist">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`cs-inner-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tOps(tab.labelKey, { defaultValue: tab.id })}
          </button>
        ))}
      </div>

      {loading ? (
        <ReportLoading message={tOps('cashier_odoo.loading', { defaultValue: 'Loading…' })} />
      ) : null}

      {activeTab === 'revenue' ? (
        <>
          <div className="row rpt-charts-row cs-rpt-charts">
            <div className="col-7">
              <div className="cs-card rpt-chart-card cs-ledger-card cs-rpt-chart-card">
                <div className="cs-card-head">
                  <div className="cs-card-title">
                    <FaIcon name="area-chart" className="cs-ledger-card-icon" />{' '}
                    {tOps('cashier_odoo.reports_daily_revenue', { defaultValue: 'Daily revenue (last 30 days)' })}
                  </div>
                </div>
                <div className="cs-card-body rpt-line-body">
                  <DailyRevenueLineChart series={data.daily_revenue || []} />
                </div>
              </div>
            </div>
            <div className="col-5x">
              <div className="cs-card rpt-chart-card cs-ledger-card cs-rpt-chart-card">
                <div className="cs-card-head">
                  <div className="cs-card-title">
                    <FaIcon name="pie-chart" className="cs-ledger-card-icon" />{' '}
                    {tOps('cashier_odoo.reports_by_category', { defaultValue: 'Revenue by category' })}
                  </div>
                </div>
                <div className="cs-card-body">
                  <CategoryDonut series={data.category_series || []} />
                </div>
              </div>
            </div>
          </div>

          <div className="cs-card rpt-chart-card rpt-chart-card--wide cs-ledger-card cs-rpt-chart-card">
            <div className="cs-card-head">
              <div className="cs-card-title">
                <FaIcon name="bar-chart" className="cs-ledger-card-icon" />{' '}
                {tOps('cashier_odoo.reports_monthly_target', { defaultValue: 'Monthly collections vs target' })}
              </div>
            </div>
            <div className="cs-card-body rpt-target-body">
              <MonthlyTargetBars bars={data.monthly_bars || []} />
            </div>
          </div>
        </>
      ) : null}

      {activeTab === 'collections' ? (
        <div className="row rpt-charts-row cs-rpt-charts">
          <div className="col-7">
            <div className="cs-card rpt-chart-card cs-ledger-card cs-rpt-chart-card">
              <div className="cs-card-head">
                <div className="cs-card-title">
                  <FaIcon name="bar-chart" className="cs-ledger-card-icon" />{' '}
                  {tOps('cashier_odoo.reports_collections_method', { defaultValue: 'Collections by payment method' })}
                </div>
              </div>
              <div className="cs-card-body rpt-method-body">
                <CollectionsMethodChart series={data.collections_series || []} />
              </div>
            </div>
          </div>
          <div className="col-5x">
            <div className="cs-card rpt-chart-card cs-ledger-card cs-rpt-chart-card">
              <div className="cs-card-head">
                <div className="cs-card-title">
                  <FaIcon name="pie-chart" className="cs-ledger-card-icon" />{' '}
                  {tOps('cashier_odoo.reports_collections_split', { defaultValue: 'Method split' })}
                </div>
              </div>
              <div className="cs-card-body">
                <CategoryDonut series={data.collections_series || []} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'disbursements' ? (
        <div className="cs-card rpt-chart-card cs-ledger-card cs-rpt-chart-card">
          <div className="cs-card-head">
            <div className="cs-card-title">
              <FaIcon name="credit-card" className="cs-ledger-card-icon" />{' '}
              {tOps('cashier_odoo.reports_disbursements', { defaultValue: 'Disbursements' })}
            </div>
            <span className="rpt-disb-total">{data.disbursements?.total_fmt || formatMoney(0)}</span>
          </div>
          <div className="cs-card-body-0 cs-ledger-scroll">
            <table className="cs-ledger-table cs-ledger-table--summary">
              <colgroup>
                <col className="cs-ledger-col--ref" />
                <col className="cs-ledger-col--method" />
                <col className="cs-ledger-col--amount" />
                <col className="cs-ledger-col--time" />
              </colgroup>
              <thead>
                <tr>
                  <ReportTh icon="file-text-o">{tOps('cashier_odoo.reports_disb_reason', { defaultValue: 'Reason' })}</ReportTh>
                  <ReportTh icon="credit-card">{tOps('cashier_odoo.col_method', { defaultValue: 'Method' })}</ReportTh>
                  <ReportTh icon="money" numeric>
                    {tOps('cashier_odoo.shift_col_amount', { defaultValue: 'Amount' })}
                  </ReportTh>
                  <ReportTh icon="clock-o">{tOps('cashier_odoo.col_time', { defaultValue: 'Time' })}</ReportTh>
                </tr>
              </thead>
              <tbody>
                {(data.disbursements?.rows || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="cs-empty cs-ledger-empty">
                      <FaIcon name="inbox" className="cs-ledger-empty-icon" />
                      {tOps('cashier_odoo.reports_disb_empty', { defaultValue: 'No disbursements in this period.' })}
                    </td>
                  </tr>
                ) : (
                  data.disbursements.rows.map((row, idx) => (
                    <tr key={row.id} className="cs-ledger-row" style={{ animationDelay: `${idx * 0.04}s` }}>
                      <td>{row.reason}</td>
                      <td>
                        <PaymentMethodChip method={row.payment_method} />
                      </td>
                      <td className="cs-ledger-num cs-ledger-num--debit">{row.amount_fmt}</td>
                      <td className="cs-ledger-time rpt-muted">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString(undefined, {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
        </div>
      ) : null}
    </div>
  );
}
