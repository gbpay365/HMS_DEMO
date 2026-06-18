import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar, BarChart, CartesianGrid, PolarAngleAxis, PolarGrid, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {
  annualDomainLabel,
  gradeLabel,
  hasAnnualDomain,
  hasAnnualPanel} from '../lib/directorAnnualScorecardCatalog';
import { RPT, DOMAIN_COLORS, chartTooltipStyle } from '../lib/directorReportTheme';
import {
  DirectorPanel,
  DirectorPeriodPills,
  DirectorReportError,
  DirectorReportHero,
  DirectorReportInner,
  DirectorReportLoading,
  DirectorReportShell,
  DirectorSection} from './director/DirectorReportChrome';

const T = RPT;
const tooltipStyle = chartTooltipStyle();

function statusColor(s) {
  return s === 'good' ? T.green : s === 'warn' ? T.amber : s === 'bad' ? T.red : T.textMuted;
}
function statusBg(s) {
  return s === 'good' ? T.greenLight : s === 'warn' ? T.amberLight : s === 'bad' ? T.redLight : T.surfaceAlt;
}
function deltaArrow(dir) {
  if (dir === 'up-good' || dir === 'down-good') return { symbol: dir.startsWith('up') ? '↑' : '↓', color: T.green };
  if (dir === 'up-bad' || dir === 'down-bad') return { symbol: dir.startsWith('up') ? '↑' : '↓', color: T.red };
  return { symbol: '→', color: T.textMuted };
}

function ScoreRing({ score, color, size = 72, strokeW = 6 }) {
  const r = (size - strokeW * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const cx = size / 2;
  const cy = size / 2;
  const { grade } = gradeLabel(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.border} strokeWidth={strokeW} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 16, fontWeight: 800, fill: T.text }}>
        {score}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 9, fontWeight: 700, fill: color, letterSpacing: '0.06em' }}>
        {grade}
      </text>
    </svg>
  );
}

function HeroScore({ score, year, t }) {
  const { grade, label } = gradeLabel(score);
  const r = 52;
  const size = 128;
  const strokeW = 8;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const scoreColor = score >= 80 ? T.green : score >= 70 ? T.amber : T.red;
  return (
    <div className="hms-dr-score-hero">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={64} cy={64} r={r} fill="none" stroke={T.border} strokeWidth={strokeW} />
        <circle
          cx={64}
          cy={64}
          r={r}
          fill="none"
          stroke={scoreColor}
          strokeWidth={strokeW}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 64 64)"
        />
        <text x={64} y={58} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 28, fontWeight: 900, fill: T.text }}>
          {score}
        </text>
        <text x={64} y={80} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 11, fontWeight: 700, fill: scoreColor, letterSpacing: '0.06em' }}>
          / 100
        </text>
      </svg>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          {t('directorAnnual.overall_performance')}
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, color: T.text, lineHeight: 1, marginBottom: 4 }}>
          {t('directorAnnual.grade', { grade })}
        </div>
        <div style={{ fontSize: 14, color: T.textMid }}>
          {label} · {t('directorAnnual.annual_review', { year })}
        </div>
      </div>
    </div>
  );
}

function DomainSection({ domain, expanded, onToggle, priorYear, t }) {
  const { grade, label } = gradeLabel(domain.score);
  const delta = domain.score - domain.prevScore;
  const color = domain.color || DOMAIN_COLORS[domain.id] || DOMAIN_COLORS.clinical;
  const lightColor = domain.lightColor || T.surfaceAlt;

  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 20px',
          cursor: 'pointer',
          background: expanded ? lightColor : T.surface,
          userSelect: 'none'}}
      >
        <ScoreRing score={domain.score} color={color} size={64} strokeW={5} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
            {domain.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{t('directorAnnual.grade', { grade })}</span>
            <span style={{ fontSize: 13, color: T.textMid }}>{label}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: delta >= 0 ? T.green : T.red, fontWeight: 600 }}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} {t('directorAnnual.pts_vs', { year: priorYear })}
            </span>
            <span style={{ fontSize: 12, color: T.textDim }}>
              {(domain.kpis || []).filter((k) => k.status === 'good').length}/{(domain.kpis || []).length} {t('directorAnnual.kpis_on_target')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {(domain.kpis || []).map((k, i) => (
            <div key={i} style={{ width: 6, height: 24, borderRadius: 3, background: statusColor(k.status), opacity: 0.85 }} />
          ))}
        </div>
        <div style={{ color: T.textDim, fontSize: 18, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px 90px 90px 64px',
              padding: '8px 20px',
              background: T.bg,
              borderBottom: `1px solid ${T.border}`}}
          >
            {[t('directorAnnual.col_kpi'), t('directorAnnual.col_actual'), t('directorAnnual.col_prior'), t('directorAnnual.col_target'), t('directorAnnual.col_status')].map((h, idx) => (
              <div
                key={h}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.textDim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  textAlign: idx === 0 ? 'left' : 'center'}}
              >
                {h}
              </div>
            ))}
          </div>
          {(domain.kpis || []).map((kpi, i) => {
            const arrow = deltaArrow(kpi.direction);
            return (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px 90px 90px 64px',
                  padding: '11px 20px',
                  alignItems: 'center',
                  background: i % 2 === 0 ? T.surface : T.bg,
                  borderBottom: i < domain.kpis.length - 1 ? `1px solid ${T.border}` : 'none'}}
              >
                <div style={{ fontSize: 13, color: T.text }}>{kpi.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{kpi.value}</span>
                  <span style={{ fontSize: 12, color: arrow.color }}>{arrow.symbol}</span>
                </div>
                <div style={{ fontSize: 12, color: T.textDim, textAlign: 'center' }}>{kpi.prev}</div>
                <div style={{ fontSize: 12, color: T.textDim, textAlign: 'center' }}>{kpi.target}</div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 20,
                      background: statusBg(kpi.status),
                      color: statusColor(kpi.status),
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'}}
                  >
                    {kpi.status === 'good' ? t('directorAnnual.on_target') : kpi.status === 'warn' ? t('directorAnnual.watch') : kpi.status === 'bad' ? t('directorAnnual.off_target') : '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DomainRadar({ domains, year, t }) {
  const data = domains.map((d) => ({
    domain: String(d.label || d.id).split(' ')[0],
    score: d.score,
    prev: d.prevScore}));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke={T.border} />
        <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: T.textMid }} />
        <Radar name={year} dataKey="score" stroke={DOMAIN_COLORS.clinical} fill={DOMAIN_COLORS.clinical} fillOpacity={0.15} strokeWidth={2} dot={{ r: 3, fill: DOMAIN_COLORS.clinical }} />
        <Radar name={String(parseInt(year, 10) - 1)} dataKey="prev" stroke={T.textDim} fill="none" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
        <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} formatter={(v, name) => [`${v}/100`, name]} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function TrendChart({ trend, t }) {
  const [hovered, setHovered] = useState(null);
  const keys = ['clinical', 'financial', 'patient', 'workforce', 'safety'];
  const colors = [DOMAIN_COLORS.clinical, DOMAIN_COLORS.financial, DOMAIN_COLORS.patient, DOMAIN_COLORS.workforce, DOMAIN_COLORS.safety];
  const labels = [
    t('directorAnnual.legend_clinical'),
    t('directorAnnual.legend_financial'),
    t('directorAnnual.legend_patient'),
    t('directorAnnual.legend_workforce'),
    t('directorAnnual.legend_safety'),
  ];

  return (
    <>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={trend || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: T.textDim }} axisLine={false} tickLine={false} />
          <YAxis domain={[50, 100]} tick={{ fontSize: 10, fill: T.textDim }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v}/100`]} />
          {keys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="a"
              fill={colors[i]}
              opacity={hovered && hovered !== key ? 0.3 : 1}
              radius={i === keys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        {labels.map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.textMid }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: colors[i] }} />
            {label}
          </div>
        ))}
      </div>
    </>
  );
}

export function DirectorAnnualScorecard({ annualPanels = [], annualDomains = [] }) {
  const { t } = useTranslation('clinical');
  const [year, setYear] = useState('');
  const [years, setYears] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({ clinical: true });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = year ? `?year=${encodeURIComponent(year)}` : '';
      const res = await fetch(`/portal/api/director-annual-scorecard${qs}`, { credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      if (json.years?.length) {
        setYears(json.years);
        if (!year) setYear(json.range?.year || json.years[0]);
      }
    } catch (err) {
      setError(err.message || t('directorAnnual.load_error'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const priorYear = String(parseInt(year || data?.range?.year || '2026', 10) - 1);
  const visibleDomains = (data?.domains || []).filter((d) => hasAnnualDomain(annualDomains, d.id));

  const toggleDomain = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const expandAll = () => setExpanded(Object.fromEntries(visibleDomains.map((d) => [d.id, true])));
  const collapseAll = () => setExpanded({});

  if (loading && !data) {
    return (
      <DirectorReportShell variant="annual">
        <DirectorReportLoading>{t('directorAnnual.loading')}</DirectorReportLoading>
      </DirectorReportShell>
    );
  }

  return (
    <DirectorReportShell variant="annual">
      <DirectorReportHero
        icon="fa-trophy"
        title={t('directorAnnual.title')}
        subtitle={data?.hospital || '—'}
        actions={
          <>
            <DirectorPeriodPills
              items={years.map((y) => ({ key: y, label: String(y) }))}
              value={year}
              onChange={setYear}
            />
            <button type="button" className="hms-dr-print-btn hms-dr-no-print" onClick={() => window.print()}>
              <i className="fa fa-print mr-1" aria-hidden="true" />
              {t('directorAnnual.print_export')}
            </button>
          </>
        }
      />

      {error ? (
        <DirectorReportError onRetry={fetchData} retryLabel={t('directorAnnual.try_again')}>
          {error}
        </DirectorReportError>
      ) : null}

      {data && (
        <DirectorReportInner>
          {(hasAnnualPanel(annualPanels, 'hero_summary') || hasAnnualPanel(annualPanels, 'domain_radar')) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 20, marginBottom: 28 }}>
              {hasAnnualPanel(annualPanels, 'hero_summary') && (
                <DirectorPanel>
                  <HeroScore score={data.overallScore} year={year || data.range?.year} t={t} />
                  <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 20 }}>
                    <div style={{ fontSize: 11, color: T.textDim, marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {t('directorAnnual.domain_scores')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {visibleDomains.map((dom) => {
                        const delta = dom.score - dom.prevScore;
                        const color = dom.color || DOMAIN_COLORS[dom.id];
                        return (
                          <div key={dom.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: T.textMid, flex: 1 }}>{dom.label}</span>
                            <div style={{ width: 120, height: 5, background: T.border, borderRadius: 3 }}>
                              <div style={{ height: '100%', width: `${dom.score}%`, background: color, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: T.text, minWidth: 24 }}>{dom.score}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: delta >= 0 ? T.green : T.red, minWidth: 32 }}>
                              {delta >= 0 ? '+' : ''}
                              {delta}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </DirectorPanel>
              )}

              {hasAnnualPanel(annualPanels, 'domain_radar') && visibleDomains.length > 0 && (
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '20px 24px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                    {t('directorAnnual.domain_radar')}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>
                    {year || data.range?.year} vs {priorYear}
                  </div>
                  <DomainRadar domains={visibleDomains} year={year || data.range?.year} t={t} />
                </div>
              )}
            </div>
          )}

          {hasAnnualPanel(annualPanels, 'trend_chart') && (data.trend || []).length > 0 && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '20px 24px', marginBottom: 28 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                  {t('directorAnnual.five_year')}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{t('directorAnnual.five_year_sub')}</div>
              </div>
              <TrendChart trend={data.trend} t={t} />
            </div>
          )}

          {visibleDomains.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                    {t('directorAnnual.kpi_detail')}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{t('directorAnnual.kpi_detail_sub')}</div>
                </div>
                <div className="yr-no-print" style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={expandAll} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 8, cursor: 'pointer', border: `1px solid ${T.border}`, background: T.surface, color: T.textMid }}>
                    {t('directorAnnual.expand_all')}
                  </button>
                  <button type="button" onClick={collapseAll} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 8, cursor: 'pointer', border: `1px solid ${T.border}`, background: T.surface, color: T.textMid }}>
                    {t('directorAnnual.collapse_all')}
                  </button>
                </div>
              </div>

              {visibleDomains.map((domain) => (
                <DomainSection
                  key={domain.id}
                  domain={{ ...domain, label: annualDomainLabel(t, domain) }}
                  expanded={!!expanded[domain.id]}
                  onToggle={() => toggleDomain(domain.id)}
                  priorYear={priorYear}
                  t={t}
                />
              ))}
            </>
          )}

          <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textDim, flexWrap: 'wrap', gap: 8 }}>
            <span>{t('directorAnnual.footer_period', { period: data.period })}</span>
            <span>{t('directorAnnual.footer_confidential', { hospital: data.hospital })}</span>
          </div>
        </DirectorReportInner>
      )}
    </DirectorReportShell>
  );
}
