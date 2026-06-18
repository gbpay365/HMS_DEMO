import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {
  WEEKLY_KPI_META,
  formatWeeklyAmount,
  hasWeeklyPanel,
  weeklyKpiLabel,
  weeklyPanelLabel} from '../lib/directorWeeklyReportCatalog';
import { RPT, chartTooltipStyle, deltaTone } from '../lib/directorReportTheme';
import {
  DirectorKpiCard,
  DirectorPanel,
  DirectorPeriodHead,
  DirectorPeriodPills,
  DirectorReportBody,
  DirectorReportError,
  DirectorReportHero,
  DirectorReportInner,
  DirectorReportLoading,
  DirectorReportShell,
  DirectorSection} from './director/DirectorReportChrome';

const T = RPT;
const tooltipStyle = chartTooltipStyle();

function deltaLabel(v, invert = false) {
  const d = deltaTone(v, invert);
  return { label: d.label, color: d.color };
}

function Section({ title, subtitle, children, accent = T.brand }) {
  return (
    <DirectorSection eyebrow={subtitle} title={title} accent={accent}>
      {children}
    </DirectorSection>
  );
}

function SummaryCard({ label, value, unit, deltaVal, invert, accent, icon }) {
  const d = deltaLabel(deltaVal, invert);
  return (
    <DirectorKpiCard
      label={label}
      value={value}
      sub={unit || null}
      accent={accent || T.brand}
      icon={icon?.startsWith('fa-') ? icon : 'fa-bar-chart'}
      delta={deltaVal}
      invertDelta={invert}
      deltaSuffix="vs prior week"
    />
  );
}

function WeekSelector({ weeks, selected, onChange }) {
  return (
    <DirectorPeriodPills
      items={(weeks || []).map((w) => ({ key: w.key, label: w.label }))}
      value={selected}
      onChange={onChange}
    />
  );
}

function VolumeChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: T.textDim }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Bar dataKey="opd" name="OPD" stackId="a" fill={T.blue} />
        <Bar dataKey="ipd" name="IPD" stackId="a" fill={T.purple} />
        <Bar dataKey="emergency" name="Emergency" stackId="a" fill={T.red} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function OccupancyChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="colOcc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={T.teal} stopOpacity={0.15} />
            <stop offset="95%" stopColor={T.teal} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} />
        <YAxis domain={[60, 100]} tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} unit="%" />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`]} />
        <ReferenceLine y={85} stroke={T.red} strokeDasharray="4 3" strokeWidth={1.5} label={{ value: '85% cap', fontSize: 10, fill: T.red, position: 'right' }} />
        <ReferenceLine y={70} stroke={T.green} strokeDasharray="4 3" strokeWidth={1.5} label={{ value: '70% min', fontSize: 10, fill: T.green, position: 'right' }} />
        <Area type="monotone" dataKey="occupancy" name="Occupancy" stroke={T.teal} strokeWidth={2.5} fill="url(#colOcc)" dot={{ r: 4, fill: T.teal, strokeWidth: 2, stroke: T.surface }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function RevenueChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="colBilled" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={T.blue} stopOpacity={0.12} />
            <stop offset="95%" stopColor={T.blue} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colCollected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={T.green} stopOpacity={0.18} />
            <stop offset="95%" stopColor={T.green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: T.textDim }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip {...tooltipStyle} formatter={(v) => [formatWeeklyAmount(v)]} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Area type="monotone" dataKey="billed" name="Billed" stroke={T.blue} strokeWidth={2} fill="url(#colBilled)" dot={false} />
        <Area type="monotone" dataKey="collected" name="Collected" stroke={T.green} strokeWidth={2} fill="url(#colCollected)" dot={{ r: 3, fill: T.green }} />
        <Line type="monotone" dataKey="target" name="Daily target" stroke={T.amber} strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ALOSChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barSize={18}>
        <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
        <XAxis dataKey="dept" tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} unit=" d" domain={[0, 9]} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${v} days`]} />
        <Bar dataKey="alos" name="Actual ALOS" radius={[4, 4, 0, 0]}>
          {(data || []).map((entry) => (
            <Cell
              key={entry.dept}
              fill={entry.alos > entry.target ? T.red : entry.alos < entry.target - 0.3 ? T.green : T.blue}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Stars({ rating }) {
  const rounded = Math.round(Number(rating) || 0);
  return (
    <span className="text-xs" style={{ color: T.amber }}>
      {'★'.repeat(rounded)}
      {'☆'.repeat(Math.max(0, 5 - rounded))}
      <span className="ml-1 text-[11px]" style={{ color: T.textMid }}>
        {Number(rating || 0).toFixed(1)}
      </span>
    </span>
  );
}

function SeverityBadge({ severity }) {
  const map = {
    minor: { bg: T.blueLight, color: T.blue, label: 'Minor' },
    moderate: { bg: T.amberLight, color: T.amber, label: 'Moderate' },
    major: { bg: T.redLight, color: T.red, label: 'Major' }};
  const s = map[severity] || map.minor;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function panelCard(children) {
  return <DirectorPanel>{children}</DirectorPanel>;
}

export function DirectorWeeklyReport({ weeklyKpis = [], weeklyPanels = [] }) {
  const { t } = useTranslation('clinical');
  const [weekKey, setWeekKey] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async (wk) => {
    setLoading(true);
    setError(null);
    try {
      const qs = wk ? `?week=${encodeURIComponent(wk)}` : '';
      const res = await fetch(`/portal/api/director-weekly-report${qs}`, { credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t('directorWeekly.load_error'));
      setData(json);
      if (!wk && json.range?.weekKey) setWeekKey(json.range.weekKey);
    } catch (err) {
      setError(err.message || t('directorWeekly.load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    refresh(weekKey || undefined);
  }, [refresh, weekKey]);

  const s = data?.summary || {};
  const weeks = data?.weeks || [];
  const selectedWeek = weeks.find((w) => w.key === (weekKey || data?.range?.weekKey)) || weeks[0];
  const totalRevCollected = (data?.revenueByDay || []).reduce((acc, r) => acc + Number(r.collected || 0), 0);
  const totalRevBilled = (data?.revenueByDay || []).reduce((acc, r) => acc + Number(r.billed || 0), 0);
  const collectionRate = totalRevBilled ? Math.round((totalRevCollected / totalRevBilled) * 100) : 0;

  return (
    <DirectorReportShell variant="weekly">
      <DirectorReportHero
        icon="fa-calendar"
        title={t('directorWeekly.title')}
        subtitle={t('directorWeekly.subtitle')}
        actions={
          weeks.length > 0 ? (
            <WeekSelector weeks={weeks} selected={weekKey || data?.range?.weekKey} onChange={setWeekKey} />
          ) : null
        }
      />

      <DirectorReportInner>
        {error ? <DirectorReportError>{error}</DirectorReportError> : null}
        {loading && !data ? <DirectorReportLoading>{t('directorWeekly.loading')}</DirectorReportLoading> : null}

        {data ? (
          <>
            <DirectorPeriodHead
              title={selectedWeek?.label || data.range?.label}
              subtitle={t('directorWeekly.period_summary', { count: Number(s.totalPatients || 0).toLocaleString('en-GB') })}
            />

            {weeklyKpis.length > 0 ? (
              <div className="hms-dr-kpi-grid mb-7">
                {weeklyKpis.map((kpi) => {
                  const meta = WEEKLY_KPI_META[kpi.id] || {};
                  return (
                    <SummaryCard
                      key={kpi.code}
                      label={weeklyKpiLabel(t, kpi)}
                      value={meta.format ? meta.format(s) : '—'}
                      unit={meta.unit}
                      deltaVal={s[meta.deltaKey]}
                      invert={meta.invert}
                      accent={meta.accent || kpi.color}
                      icon={meta.icon || 'fa-bar-chart'}
                    />
                  );
                })}
              </div>
            ) : null}

            {(hasWeeklyPanel(weeklyPanels, 'patient_volume') || hasWeeklyPanel(weeklyPanels, 'occupancy_trend')) ? (
              <div className="mb-7 grid gap-4 lg:grid-cols-2">
                {hasWeeklyPanel(weeklyPanels, 'patient_volume')
                  ? panelCard(
                      <Section title={weeklyPanelLabel(t, weeklyPanels.find((p) => p.id === 'patient_volume'))} subtitle={t('directorWeekly.section_clinical')} accent={T.blue}>
                        <VolumeChart data={data.dailyVolume} />
                        <div className="mt-2.5 flex gap-4">
                          {[
                            { label: 'OPD', val: (data.dailyVolume || []).reduce((a, r) => a + r.opd, 0), color: T.blue },
                            { label: 'IPD', val: (data.dailyVolume || []).reduce((a, r) => a + r.ipd, 0), color: T.purple },
                            { label: 'ER', val: (data.dailyVolume || []).reduce((a, r) => a + r.emergency, 0), color: T.red },
                          ].map((item) => (
                            <div key={item.label} className="flex-1 rounded-lg px-3 py-2 text-center" style={{ background: T.bg }}>
                              <div className="text-[10px] uppercase tracking-wide" style={{ color: T.textDim }}>
                                {item.label}
                              </div>
                              <div className="text-xl font-extrabold" style={{ color: item.color }}>
                                {item.val.toLocaleString('en-GB')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )
                  : null}
                {hasWeeklyPanel(weeklyPanels, 'occupancy_trend')
                  ? panelCard(
                      <Section title={weeklyPanelLabel(t, weeklyPanels.find((p) => p.id === 'occupancy_trend'))} subtitle={t('directorWeekly.section_capacity')} accent={T.teal}>
                        <OccupancyChart data={data.occupancyTrend} />
                        <div className="mt-3 flex flex-wrap gap-3 text-[11px]" style={{ color: T.textMid }}>
                          <span>— — Target ceiling: 85%</span>
                          <span style={{ color: T.green }}>— — Minimum target: 70%</span>
                        </div>
                      </Section>
                    )
                  : null}
              </div>
            ) : null}

            {hasWeeklyPanel(weeklyPanels, 'revenue_chart') ? (
              <div className="mb-7">
                {panelCard(
                  <Section title={weeklyPanelLabel(t, weeklyPanels.find((p) => p.id === 'revenue_chart'))} subtitle={t('directorWeekly.section_financial')} accent={T.green}>
                    <div className="grid items-start gap-6 lg:grid-cols-[1fr_auto]">
                      <RevenueChart data={data.revenueByDay} />
                      <div className="flex min-w-[160px] flex-col gap-2.5">
                        {[
                          { label: t('directorWeekly.total_billed'), value: formatWeeklyAmount(totalRevBilled), color: T.blue, bg: T.blueLight },
                          { label: t('directorWeekly.total_collected'), value: formatWeeklyAmount(totalRevCollected), color: T.green, bg: T.greenLight },
                          { label: t('directorWeekly.collection_rate'), value: `${collectionRate}%`, color: collectionRate >= 90 ? T.green : T.amber, bg: collectionRate >= 90 ? T.greenLight : T.amberLight },
                          { label: t('directorWeekly.outstanding'), value: formatWeeklyAmount(totalRevBilled - totalRevCollected), color: T.red, bg: T.redLight },
                        ].map((item) => (
                          <div key={item.label} className="rounded-[10px] px-3.5 py-2.5" style={{ background: item.bg }}>
                            <div className="mb-0.5 text-[10px] uppercase tracking-wide" style={{ color: T.textMid }}>
                              {item.label}
                            </div>
                            <div className="text-xl font-extrabold" style={{ color: item.color }}>
                              {item.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Section>
                )}
              </div>
            ) : null}

            {hasWeeklyPanel(weeklyPanels, 'alos_chart') ? (
              <div className="mb-7">
                {panelCard(
                  <Section title={weeklyPanelLabel(t, weeklyPanels.find((p) => p.id === 'alos_chart'))} subtitle={t('directorWeekly.section_efficiency')} accent={T.purple}>
                    <ALOSChart data={data.alos} />
                  </Section>
                )}
              </div>
            ) : null}

            {hasWeeklyPanel(weeklyPanels, 'doctor_perf') ? (
              <div className="mb-7">
                {panelCard(
                  <Section title={weeklyPanelLabel(t, weeklyPanels.find((p) => p.id === 'doctor_perf'))} subtitle={t('directorWeekly.section_staff')} accent={T.teal}>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-[13px]">
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                            {['Doctor', 'Department', 'Patients seen', 'Surgeries', 'Satisfaction'].map((h) => (
                              <th key={h} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide" style={{ color: T.textMid }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(data.doctorPerf || []).map((doc, i) => (
                            <tr key={doc.name} style={{ borderBottom: `1px solid ${T.border}`, background: i === 0 ? T.greenLight : 'transparent' }}>
                              <td className="px-3 py-2.5 font-semibold">
                                {i === 0 ? (
                                  <span className="mr-1.5 rounded-full px-1.5 py-px text-[10px] text-white" style={{ background: T.green }}>
                                    Top
                                  </span>
                                ) : null}
                                {doc.name}
                              </td>
                              <td className="px-3 py-2.5" style={{ color: T.textMid }}>
                                {doc.dept}
                              </td>
                              <td className="px-3 py-2.5 font-bold">{doc.patients}</td>
                              <td className="px-3 py-2.5" style={{ color: doc.surgeries > 0 ? T.purple : T.textDim }}>
                                {doc.surgeries > 0 ? doc.surgeries : '—'}
                              </td>
                              <td className="px-3 py-2.5">
                                <Stars rating={doc.satisfaction} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                )}
              </div>
            ) : null}

            {(hasWeeklyPanel(weeklyPanels, 'incidents') || hasWeeklyPanel(weeklyPanels, 'supply_digest')) ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {hasWeeklyPanel(weeklyPanels, 'incidents')
                  ? panelCard(
                      <Section title={weeklyPanelLabel(t, weeklyPanels.find((p) => p.id === 'incidents'))} subtitle={t('directorWeekly.section_safety')} accent={T.red}>
                        <div className="flex flex-col gap-2">
                          {(data.incidents || []).map((inc) => (
                            <div key={inc.type} className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5" style={{ background: T.bg, borderColor: T.border }}>
                              <div
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold"
                                style={{
                                  background: inc.severity === 'major' ? T.redLight : inc.severity === 'moderate' ? T.amberLight : T.blueLight,
                                  color: inc.severity === 'major' ? T.red : inc.severity === 'moderate' ? T.amber : T.blue}}
                              >
                                {inc.count}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-semibold">{inc.type}</div>
                                <div className="text-[11px]" style={{ color: T.textMid }}>
                                  {inc.open > 0 ? (
                                    <span style={{ color: T.red }}>
                                      {inc.open} open investigation{inc.open > 1 ? 's' : ''}
                                    </span>
                                  ) : (
                                    <span style={{ color: T.green }}>All closed</span>
                                  )}
                                </div>
                              </div>
                              <SeverityBadge severity={inc.severity} />
                            </div>
                          ))}
                        </div>
                      </Section>
                    )
                  : null}
                {hasWeeklyPanel(weeklyPanels, 'supply_digest')
                  ? panelCard(
                      <Section title={weeklyPanelLabel(t, weeklyPanels.find((p) => p.id === 'supply_digest'))} subtitle={t('directorWeekly.section_operations')} accent={T.amber}>
                        <div className="flex flex-col gap-2">
                          {(data.supplyAlerts || []).map((item) => {
                            const isDeficit = item.status === 'deficit';
                            return (
                              <div
                                key={item.item}
                                className="rounded-lg border px-3 py-2.5"
                                style={{
                                  background: isDeficit ? T.redLight : T.bg,
                                  borderColor: isDeficit ? `${T.red}40` : T.border}}
                              >
                                <div className="mb-1.5 flex justify-between">
                                  <span className="text-xs font-semibold">{item.item}</span>
                                  <span
                                    className="rounded-full px-2 py-px text-[11px] font-bold"
                                    style={{
                                      color: isDeficit ? T.red : T.green,
                                      background: isDeficit ? T.redLight : T.greenLight}}
                                  >
                                    {item.balance > 0 ? `+${item.balance}` : item.balance} units
                                  </span>
                                </div>
                                <div className="flex gap-3.5 text-[11px]" style={{ color: T.textMid }}>
                                  <span>
                                    Consumed: <strong style={{ color: T.text }}>{Number(item.consumed || 0).toLocaleString('en-GB')}</strong>
                                  </span>
                                  <span>
                                    Restocked: <strong style={{ color: T.text }}>{Number(item.restocked || 0).toLocaleString('en-GB')}</strong>
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Section>
                    )
                  : null}
              </div>
            ) : null}

            <div
              className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-[11px]"
              style={{ borderColor: T.border, color: T.textDim }}
            >
              <span>{t('directorWeekly.footer_generated', { time: new Date(data.updatedAt || Date.now()).toLocaleString('en-GB') })}</span>
              <span>{t('directorWeekly.footer_confidential')}</span>
            </div>
          </>
        ) : null}
      </DirectorReportInner>
    </DirectorReportShell>
  );
}
