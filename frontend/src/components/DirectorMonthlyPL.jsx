import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {
  MONTHLY_KPI_META,
  categoryLabel,
  formatMonthlyMoney,
  formatMonthlyPct,
  hasMonthlyPanel,
  monthlyKpiLabel,
  monthlyPanelLabel} from '../lib/directorMonthlyPLCatalog';
import { RPT, chartTooltipStyle } from '../lib/directorReportTheme';
import { priceUnitLabel } from '../lib/hmsLocale';
import {
  DirectorKpiCard,
  DirectorPanel,
  DirectorPeriodPills,
  DirectorReportError,
  DirectorReportHero,
  DirectorReportInner,
  DirectorReportShell,
  DirectorSection} from './director/DirectorReportChrome';

const T = RPT;
const ttStyle = chartTooltipStyle();

function Panel({ children, className = '' }) {
  return <DirectorPanel className={className}>{children}</DirectorPanel>;
}

function SectionTitle({ eyebrow, title, accent = T.brand }) {
  return <DirectorSection eyebrow={eyebrow} title={title} accent={accent} />;
}

function PLRow({ label, value, indent = 0, bold = false, highlight, borderTop }) {
  const classes = [
    'hms-dr-pl-row',
    bold ? 'is-bold' : '',
    highlight === 'green' ? 'is-highlight-green' : '',
    highlight === 'blue' ? 'is-highlight-blue' : '',
    highlight === 'amber' ? 'is-highlight-amber' : '',
    borderTop ? 'has-border' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} style={indent ? { paddingLeft: 12 + indent * 16 } : undefined}>
      <span style={{ color: bold ? T.text : T.textMid }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function KpiStrip({ summary, kpis, t }) {
  return (
    <div className="hms-dr-kpi-grid" style={{ marginBottom: 24 }}>
      {kpis.map((kpi) => {
        const meta = MONTHLY_KPI_META[kpi.id] || {};
        const delta = meta.deltaKey ? summary?.[meta.deltaKey] : null;
        return (
          <DirectorKpiCard
            key={kpi.id}
            label={monthlyKpiLabel(t, kpi)}
            value={meta.format ? meta.format(summary) : '—'}
            accent={meta.accent || T.brand}
            icon="fa-line-chart"
            delta={delta}
            invertDelta={meta.invert}
            deltaSuffix={delta != null ? t('directorMonthly.vs_last_month') : null}
          />
        );
      })}
    </div>
  );
}

function PLStatement({ summary, collection, t, panel }) {
  const s = summary || {};
  const c = collection || {};
  return (
    <Panel>
      <SectionTitle eyebrow={t('directorMonthly.section_financial')} title={monthlyPanelLabel(t, panel)} accent={T.green} />
      <PLRow label={t('directorMonthly.total_revenue')} value={formatMonthlyMoney(s.total_revenue)} bold highlight="blue" />
      <PLRow label={t('directorMonthly.cogs')} value={`(${formatMonthlyMoney(s.total_cogs)})`} indent={1} />
      <PLRow label={t('directorMonthly.gross_profit')} value={formatMonthlyMoney(s.gross_profit)} bold highlight="green" />
      <PLRow label={t('directorMonthly.gross_margin')} value={`${s.gross_margin_pct ?? 0}%`} indent={1} />
      <div style={{ height: 8 }} />
      <PLRow label={t('directorMonthly.staff_payroll')} value={`(${formatMonthlyMoney(s.total_payroll)})`} indent={1} borderTop />
      <PLRow label={t('directorMonthly.opex')} value={`(${formatMonthlyMoney(s.total_opex)})`} indent={1} />
      <PLRow label={t('directorMonthly.ebitda')} value={formatMonthlyMoney(s.ebitda)} bold highlight="green" />
      <PLRow label={t('directorMonthly.ebitda_margin')} value={`${s.ebitda_margin_pct ?? 0}%`} indent={1} />
      <div style={{ height: 8 }} />
      <PLRow label={t('directorMonthly.total_billed')} value={formatMonthlyMoney(c.total_billed)} indent={1} borderTop />
      <PLRow label={t('directorMonthly.total_collected')} value={formatMonthlyMoney(c.total_collected)} indent={1} />
      <PLRow
        label={t('directorMonthly.outstanding')}
        value={formatMonthlyMoney(c.outstanding)}
        bold
        highlight={c.collection_rate_pct < 80 ? 'amber' : 'green'}
      />
      <PLRow label={t('directorMonthly.collection_rate')} value={`${c.collection_rate_pct ?? 0}%`} indent={1} />
    </Panel>
  );
}

function RevenuePieChart({ sources, t, panel }) {
  const data = sources || [];
  return (
    <Panel>
      <SectionTitle eyebrow={t('directorMonthly.section_revenue')} title={monthlyPanelLabel(t, panel)} accent={T.blue} />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie data={data} dataKey="total_revenue" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={T.chartPie[i % T.chartPie.length]} />
              ))}
            </Pie>
            <Tooltip {...ttStyle} formatter={(v) => [formatMonthlyMoney(v)]} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ flex: 1, minWidth: 160 }}>
          {data.map((s, i) => (
            <div key={s.source} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: T.chartPie[i % T.chartPie.length], flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: T.text }}>{s.source}</div>
                <div style={{ height: 4, background: T.chartGrid, borderRadius: 2, marginTop: 3 }}>
                  <div style={{ height: '100%', width: `${s.pct_of_total}%`, background: T.chartPie[i % T.chartPie.length], borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{formatMonthlyMoney(s.total_revenue)}</div>
                <div style={{ fontSize: 10, color: T.textDim }}>{s.pct_of_total}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function TrendChart({ trend, t, panel }) {
  return (
    <Panel>
      <SectionTitle eyebrow={t('directorMonthly.section_trend')} title={monthlyPanelLabel(t, panel)} accent={T.blue} />
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={trend || []} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="moTrendBilled" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={T.blue} stopOpacity={0.1} />
              <stop offset="95%" stopColor={T.blue} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="moTrendCollected" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={T.green} stopOpacity={0.15} />
              <stop offset="95%" stopColor={T.green} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
          <XAxis dataKey="month_label" tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMonthlyMoney(v)} width={80} />
          <Tooltip {...ttStyle} formatter={(v) => [formatMonthlyMoney(v)]} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Area type="monotone" dataKey="total_billed" name={t('directorMonthly.total_billed')} stroke={T.blue} strokeWidth={2} fill="url(#moTrendBilled)" dot={false} />
          <Area type="monotone" dataKey="total_collected" name={t('directorMonthly.total_collected')} stroke={T.green} strokeWidth={2} fill="url(#moTrendCollected)" dot={{ r: 3, fill: T.green }} />
        </AreaChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {(trend || []).filter((x) => x.mom_growth_pct != null).map((x) => {
          const up = x.mom_growth_pct > 0;
          return (
            <span
              key={x.month_label}
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 20,
                background: up ? T.greenLight : T.redLight,
                color: up ? T.green : T.red}}
            >
              {x.month_label}: {formatMonthlyPct(x.mom_growth_pct)}
            </span>
          );
        })}
      </div>
    </Panel>
  );
}

function ExpenseChart({ expenses, t, panel }) {
  const data = (expenses || []).map((e) => ({ ...e, label: categoryLabel(e.category), over: e.variance > 0 }));
  return (
    <Panel>
      <SectionTitle eyebrow={t('directorMonthly.section_cost')} title={monthlyPanelLabel(t, panel)} accent={T.amber} />
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} layout="vertical" barSize={12}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMonthlyMoney(v)} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: T.textMid }} axisLine={false} tickLine={false} width={110} />
          <Tooltip {...ttStyle} formatter={(v) => [formatMonthlyMoney(v)]} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
          <Bar dataKey="budgeted" name={t('directorMonthly.budget')} fill={T.chartGrid} radius={[0, 4, 4, 0]} />
          <Bar dataKey="actual_expense" name={t('directorMonthly.actual')} radius={[0, 4, 4, 0]}>
            {data.map((e, i) => (
              <Cell key={i} fill={e.over ? T.red : T.green} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: T.textMid }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: T.red, borderRadius: 2 }} />
          {t('directorMonthly.over_budget')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: T.green, borderRadius: 2 }} />
          {t('directorMonthly.under_budget')}
        </span>
      </div>
    </Panel>
  );
}

function DeptPLTable({ deptPL, t, panel }) {
  const [filter, setFilter] = useState('all');
  const rows = deptPL || [];
  const filtered = filter === 'all' ? rows : rows.filter((d) => d.dept_type === filter);
  const maxRevenue = Math.max(...rows.map((d) => d.revenue), 1);

  return (
    <Panel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <SectionTitle eyebrow={t('directorMonthly.section_profitability')} title={monthlyPanelLabel(t, panel)} accent={T.purple} />
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'clinical', 'diagnostic', 'support'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                borderRadius: 8,
                cursor: 'pointer',
                border: `1px solid ${filter === f ? T.purple : T.border}`,
                background: filter === f ? T.purpleL : T.surface,
                color: filter === f ? T.purple : T.textMid,
                fontWeight: filter === f ? 700 : 400}}
            >
              {t(`directorMonthly.filter_${f}`)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              {[t('directorMonthly.col_department'), t('directorMonthly.col_revenue'), t('directorMonthly.col_direct_cost'), t('directorMonthly.col_payroll'), t('directorMonthly.col_gross_profit'), t('directorMonthly.col_margin')].map((h, idx) => (
                <th
                  key={h}
                  style={{
                    padding: '7px 10px',
                    textAlign: idx === 0 ? 'left' : 'right',
                    fontSize: 10,
                    color: T.textDim,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'}}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => {
              const profitable = d.gross_profit >= 0;
              return (
                <tr key={d.dept_name} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 ? T.surfaceAlt : 'transparent' }}>
                  <td style={{ padding: '9px 10px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{d.dept_name}</div>
                    <div style={{ marginTop: 3, height: 3, background: T.chartGrid, borderRadius: 2, width: 80 }}>
                      <div style={{ height: '100%', width: `${(d.revenue / maxRevenue) * 100}%`, background: T.blue, borderRadius: 2 }} />
                    </div>
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: T.text }}>{formatMonthlyMoney(d.revenue)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: T.textMid }}>{formatMonthlyMoney(d.direct_cost)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: T.textMid }}>{formatMonthlyMoney(d.payroll_cost)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: profitable ? T.green : T.red }}>{formatMonthlyMoney(d.gross_profit)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                    {d.margin_pct != null ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 20,
                          background: profitable ? T.greenLight : T.redLight,
                          color: profitable ? T.green : T.red}}
                      >
                        {d.margin_pct}%
                      </span>
                    ) : (
                      <span style={{ color: T.textDim }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function PayrollChart({ payroll, t, panel }) {
  const DEPT_COLORS = [T.blue, T.purple, T.teal, T.green, T.amber, T.textDim, '#E11D48'];
  const data = payroll || [];
  return (
    <Panel>
      <SectionTitle eyebrow={t('directorMonthly.section_staff')} title={monthlyPanelLabel(t, panel)} accent={T.amber} />
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barSize={22}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
          <XAxis dataKey="dept_name" tick={{ fontSize: 9, fill: T.textDim }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMonthlyMoney(v)} width={80} />
          <Tooltip {...ttStyle} formatter={(v, name) => [name === 'total_payroll' ? formatMonthlyMoney(v) : v, name === 'total_payroll' ? t('directorMonthly.payroll') : t('directorMonthly.headcount')]} />
          <Bar dataKey="total_payroll" name="total_payroll" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 6, marginTop: 10 }}>
        {data.slice(0, 4).map((d, i) => (
          <div key={d.dept_name} style={{ background: T.surfaceAlt, borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: T.textDim }}>{d.dept_name}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: DEPT_COLORS[i] }}>{formatMonthlyMoney(d.total_payroll)}</div>
            <div style={{ fontSize: 10, color: T.textDim }}>
              {d.headcount} {t('directorMonthly.staff')} · {d.pct_of_payroll}%
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ClaimsAging({ claimsAging, t, panel }) {
  const buckets = claimsAging || [];
  const total = buckets.reduce((s, c) => s + Number(c.pending_amount), 0);
  const bucketColor = { '0–30 days': T.green, '31–60 days': T.amber, '61–90 days': T.red, 'Over 90 days': T.red };

  return (
    <Panel>
      <SectionTitle eyebrow={t('directorMonthly.section_receivables')} title={monthlyPanelLabel(t, panel)} accent={T.red} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {buckets.map((bucket) => {
          const color = bucketColor[bucket.aging_bucket] || T.textMid;
          const pct = total > 0 ? Math.round((bucket.pending_amount / total) * 100) : 0;
          const urgent = bucket.aging_bucket === 'Over 90 days';
          return (
            <div
              key={bucket.aging_bucket}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: urgent ? T.redLight : T.surfaceAlt,
                border: `1px solid ${urgent ? `${T.red}40` : T.border}`}}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{bucket.aging_bucket}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color }}>{formatMonthlyMoney(bucket.pending_amount)}</span>
              </div>
              <div style={{ height: 5, background: T.border, borderRadius: 3, marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.textDim }}>
                <span>{bucket.claim_count} {t('directorMonthly.claims')}</span>
                <span>{t('directorMonthly.avg_days', { days: bucket.avg_days_outstanding })}</span>
                <span style={{ marginLeft: 'auto', color }}>{pct}% {t('directorMonthly.of_total')}</span>
              </div>
            </div>
          );
        })}
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: T.textMid }}>{t('directorMonthly.total_outstanding_claims')}</span>
          <span style={{ fontWeight: 700, color: T.red }}>{formatMonthlyMoney(total)}</span>
        </div>
      </div>
    </Panel>
  );
}

function emptyPayrollLine() {
  return { line_type: 'payroll_dept', label: '', dept_name: '', amount_xaf: '', notes: '' };
}

function emptyExpenseLine(type = 'opex') {
  return { line_type: type, label: '', dept_name: null, amount_xaf: '', notes: '' };
}

function ManualCostsPanel({ month, costSources, onSaved, t }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [prefs, setPrefs] = useState({ use_hms_payroll: false, use_hms_expenses: true, notes: '' });
  const [lines, setLines] = useState([]);
  const [integrated, setIntegrated] = useState(null);

  const loadCosts = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/portal/api/director-monthly-pl/costs?month=${encodeURIComponent(month)}`, {
        credentials: 'same-origin'});
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load costs');
      setPrefs(json.prefs || { use_hms_payroll: false, use_hms_expenses: true, notes: '' });
      setLines(json.lines?.length ? json.lines : [emptyPayrollLine(), emptyExpenseLine('cogs'), emptyExpenseLine('opex')]);
      setIntegrated(json.integrated || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (open) loadCosts();
  }, [open, loadCosts]);

  const updateLine = (idx, patch) => {
    setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const addLine = (type) => {
    setLines((prev) => [...prev, type === 'payroll_dept' ? emptyPayrollLine() : emptyExpenseLine(type)]);
  };

  const removeLine = (idx) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        month,
        prefs,
        lines: lines
          .map((l) => ({
            ...l,
            amount_xaf: Math.round(Number(String(l.amount_xaf).replace(/,/g, '')) || 0)}))
          .filter((l) => l.amount_xaf > 0)};
      const res = await fetch(`/portal/api/director-monthly-pl/costs?month=${encodeURIComponent(month)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)});
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to save');
      setLines(json.lines || []);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const payrollSource = costSources?.payroll || 'none';
  const expenseSource = costSources?.expenses || 'none';

  return (
    <Panel style={{ marginBottom: 16, border: `1px solid ${T.amber}55` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{t('directorMonthly.manual_costs_title')}</div>
          <div style={{ fontSize: 12, color: T.textMid, marginTop: 4 }}>
            {t('directorMonthly.manual_costs_sub')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: T.blueLight, color: T.blue }}>
              {t('directorMonthly.payroll_source')}: {payrollSource === 'hms_payroll'
                ? t('directorMonthly.source_hms_payroll', { amount: formatMonthlyMoney(costSources?.integrated_payroll_total || 0) })
                : payrollSource === 'manual'
                  ? t('directorMonthly.source_manual')
                  : t('directorMonthly.source_none')}
            </span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: T.amberL, color: T.amber }}>
              {t('directorMonthly.expense_source')}: {expenseSource === 'tbl_expense'
                ? t('directorMonthly.source_tbl_expense', { amount: formatMonthlyMoney(costSources?.integrated_expense_total || 0) })
                : expenseSource === 'manual'
                  ? t('directorMonthly.source_manual')
                  : t('directorMonthly.source_none')}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.surface,
            cursor: 'pointer',
            fontWeight: 600}}
        >
          {open ? t('directorMonthly.manual_costs_close') : t('directorMonthly.manual_costs_open')}
        </button>
      </div>

      {open ? (
        <div style={{ marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          {loading ? (
            <div style={{ fontSize: 12, color: T.textDim }}>{t('directorMonthly.manual_costs_loading')}</div>
          ) : (
            <>
              {integrated?.payroll?.total > 0 ? (
                <div style={{ fontSize: 12, color: T.textMid, marginBottom: 12, padding: 10, background: T.surfaceAlt, borderRadius: 8 }}>
                  {t('directorMonthly.hms_payroll_hint', {
                    amount: formatMonthlyMoney(integrated.payroll.total),
                    count: integrated.payroll.record_count})}
                </div>
              ) : null}

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={!!prefs.use_hms_payroll}
                  onChange={(e) => setPrefs((p) => ({ ...p, use_hms_payroll: e.target.checked }))}
                />
                {t('directorMonthly.use_hms_payroll')}
              </label>

              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', marginBottom: 8 }}>
                {t('directorMonthly.manual_payroll_lines')}
              </div>
              {lines.map((line, idx) => line.line_type !== 'payroll_dept' ? null : (
                  <div key={`pay-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 32px', gap: 8, marginBottom: 8 }}>
                    <input
                      placeholder={t('directorMonthly.dept_name')}
                      value={line.dept_name || line.label || ''}
                      onChange={(e) => updateLine(idx, { dept_name: e.target.value, label: e.target.value })}
                      style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                    />
                    <input
                      placeholder={t('directorMonthly.notes_optional')}
                      value={line.notes || ''}
                      onChange={(e) => updateLine(idx, { notes: e.target.value })}
                      style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                    />
                    <input
                      placeholder={priceUnitLabel()}
                      value={line.amount_xaf}
                      onChange={(e) => updateLine(idx, { amount_xaf: e.target.value })}
                      style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                    />
                    <button type="button" onClick={() => removeLine(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: T.red }}>×</button>
                  </div>
              ))}
              <button type="button" onClick={() => addLine('payroll_dept')} style={{ fontSize: 11, marginBottom: 16, color: T.blue, background: 'none', border: 'none', cursor: 'pointer' }}>
                + {t('directorMonthly.add_payroll_line')}
              </button>

              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', marginBottom: 8 }}>
                {t('directorMonthly.manual_expense_lines')}
              </div>
              {lines.map((line, idx) => (line.line_type !== 'cogs' && line.line_type !== 'opex') ? null : (
                  <div key={`exp-${idx}`} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 140px 32px', gap: 8, marginBottom: 8 }}>
                    <select
                      value={line.line_type}
                      onChange={(e) => updateLine(idx, { line_type: e.target.value })}
                      style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                    >
                      <option value="cogs">{t('directorMonthly.expense_cogs')}</option>
                      <option value="opex">{t('directorMonthly.expense_opex')}</option>
                    </select>
                    <input
                      placeholder={t('directorMonthly.expense_label')}
                      value={line.label || ''}
                      onChange={(e) => updateLine(idx, { label: e.target.value })}
                      style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                    />
                    <input
                      placeholder={priceUnitLabel()}
                      value={line.amount_xaf}
                      onChange={(e) => updateLine(idx, { amount_xaf: e.target.value })}
                      style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                    />
                    <button type="button" onClick={() => removeLine(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: T.red }}>×</button>
                  </div>
              ))}
              <button type="button" onClick={() => addLine('opex')} style={{ fontSize: 11, marginBottom: 16, color: T.blue, background: 'none', border: 'none', cursor: 'pointer' }}>
                + {t('directorMonthly.add_expense_line')}
              </button>

              <textarea
                placeholder={t('directorMonthly.manual_notes')}
                value={prefs.notes || ''}
                onChange={(e) => setPrefs((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12, marginBottom: 12 }}
              />

              {error ? <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>{error}</div> : null}

              <button
                type="button"
                onClick={save}
                disabled={saving}
                style={{
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 8,
                  border: 'none',
                  background: T.green,
                  color: '#fff',
                  cursor: saving ? 'wait' : 'pointer'}}
              >
                {saving ? t('directorMonthly.saving') : t('directorMonthly.save_costs')}
              </button>
            </>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

function LoadingSkeleton() {
  const Bone = ({ w = '100%', h = 16, mb = 8 }) => (
    <div style={{ width: w, height: h, background: T.border, borderRadius: 6, marginBottom: mb, animation: 'moPulse 1.5s ease-in-out infinite' }} />
  );
  return (
    <div style={{ padding: '24px 28px' }}>
      <style>{`@keyframes moPulse { 0%,100%{opacity:1}50%{opacity:0.4} }`}</style>
      <Bone h={32} w="40%" mb={24} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 24 }}>
        {[...Array(6)].map((_, i) => (
          <Bone key={i} h={80} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Bone h={280} />
        <Bone h={280} />
      </div>
      <Bone h={240} mb={16} />
      <Bone h={200} />
    </div>
  );
}

export function DirectorMonthlyPL({ monthlyKpis = [], monthlyPanels = [] }) {
  const { t } = useTranslation('clinical');
  const monthsDefault = [];
  const [month, setMonth] = useState('');
  const [months, setMonths] = useState(monthsDefault);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = month ? `?month=${encodeURIComponent(month)}` : '';
      const res = await fetch(`/portal/api/director-monthly-pl${qs}`, { credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      if (json.months?.length) {
        setMonths(json.months);
        if (!month) setMonth(json.range?.month || json.months[0]?.value || '');
      }
    } catch (err) {
      setError(err.message || t('directorMonthly.load_error'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedLabel = months.find((m) => m.value === month)?.label || data?.range?.label || month;
  const panelById = (id) => monthlyPanels.find((p) => p.id === id) || { id, label: id };

  return (
    <DirectorReportShell variant="monthly">
      <DirectorReportHero
        icon="fa-pie-chart"
        title={t('directorMonthly.title')}
        subtitle={t('directorMonthly.subtitle')}
        actions={
          <>
            <DirectorPeriodPills
              items={months.map((m) => ({ key: m.value, label: m.label }))}
              value={month}
              onChange={setMonth}
            />
            <button type="button" className="hms-dr-print-btn" onClick={fetchData}>
              <i className="fa fa-refresh mr-1" aria-hidden="true" />
              {t('directorMonthly.refresh')}
            </button>
          </>
        }
      />

      {error ? (
        <DirectorReportError onRetry={fetchData} retryLabel={t('directorMonthly.try_again')}>
          {error}
        </DirectorReportError>
      ) : null}

      {loading && <LoadingSkeleton />}

      {!loading && data && (
        <DirectorReportInner>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{selectedLabel}</div>
            <div style={{ fontSize: 13, color: T.textMid, marginTop: 2 }}>{t('directorMonthly.period_subtitle')}</div>
          </div>

          {monthlyKpis.length > 0 && <KpiStrip summary={data.summary} kpis={monthlyKpis} t={t} />}

          <ManualCostsPanel
            month={month || data.range?.month}
            costSources={data.costSources}
            onSaved={fetchData}
            t={t}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
            {hasMonthlyPanel(monthlyPanels, 'pl_statement') && (
              <PLStatement summary={data.summary} collection={data.collection} t={t} panel={panelById('pl_statement')} />
            )}
            {hasMonthlyPanel(monthlyPanels, 'revenue_sources') && (
              <RevenuePieChart sources={data.revenueSources} t={t} panel={panelById('revenue_sources')} />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
            {hasMonthlyPanel(monthlyPanels, 'trend_chart') && (
              <TrendChart trend={data.trend} t={t} panel={panelById('trend_chart')} />
            )}
            {hasMonthlyPanel(monthlyPanels, 'expense_chart') && (
              <ExpenseChart expenses={data.expenses} t={t} panel={panelById('expense_chart')} />
            )}
          </div>

          {hasMonthlyPanel(monthlyPanels, 'dept_pl') && (
            <div style={{ marginBottom: 16 }}>
              <DeptPLTable deptPL={data.deptPL} t={t} panel={panelById('dept_pl')} />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {hasMonthlyPanel(monthlyPanels, 'payroll_chart') && (
              <PayrollChart payroll={data.payroll} t={t} panel={panelById('payroll_chart')} />
            )}
            {hasMonthlyPanel(monthlyPanels, 'claims_aging') && (
              <ClaimsAging claimsAging={data.claimsAging} t={t} panel={panelById('claims_aging')} />
            )}
          </div>

          <div
            style={{
              marginTop: 32,
              paddingTop: 14,
              borderTop: `1px solid ${T.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: T.textDim,
              flexWrap: 'wrap',
              gap: 8}}
          >
            <span>{t('directorMonthly.footer_generated', { time: new Date().toLocaleString('en-GB') })}</span>
            <span>{t('directorMonthly.footer_confidential')}</span>
          </div>
        </DirectorReportInner>
      )}
    </DirectorReportShell>
  );
}
