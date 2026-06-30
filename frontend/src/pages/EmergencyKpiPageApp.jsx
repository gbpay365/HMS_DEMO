import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';

function BarRow({ label, count, total, color }) {
  const pct = total ? Math.round((Number(count) / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-slate-500">
          {count} · {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const DISPO_COLORS = {
  discharge: '#166534',
  ssu: '#1e40af',
  ipd: '#dc2626',
  ot: '#7c3aed',
  transfer: '#0c8b8b',
  deceased: '#1f2937',
  lwbs: '#92400e'};

export function EmergencyKpiPageApp({
  days = 7,
  summary = {},
  dispoCounts = [],
  dailyTrend = [],
  flash = null}) {
  const { t } = useTranslation('clinical');
  const totV = Number(summary.total_visits || 0);
  const lwbs = Number(summary.lwbs || 0);
  const lwbsPct = totV ? ((lwbs * 100) / totV).toFixed(1) : '0.0';
  const dispoTot = dispoCounts.reduce((s, d) => s + Number(d.n || 0), 0) || 1;
  const trendMax = Math.max(1, ...dailyTrend.map((d) => Number(d.n) || 0));

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} />

        <SurfaceHero icon="bar-chart" title={t('emergencyKpi.title')} subtitle={t('emergencyKpi.last_days', { count: days })}>
          <div className="hms-surface-hero-actions mt-4">
            <a href="/emergency" className="hms-btn-secondary text-xs">
              {t('emergencyKpi.back_er')}
            </a>
            <form method="GET" className="inline-flex items-center gap-2">
              <label htmlFor="er-days" className="text-xs font-semibold text-white/90">
                {t('emergencyKpi.period')}
              </label>
              <select
                id="er-days"
                name="days"
                className="hms-input w-auto py-2 text-sm"
                defaultValue={String(days)}
                onChange={(ev) => ev.target.form?.submit()}
              >
                {[1, 7, 14, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {t('emergencyKpi.last_days', { count: d })}
                  </option>
                ))}
              </select>
            </form>
          </div>
        </SurfaceHero>

        <div className="hms-compact-kpi-grid mb-4">
          <StatCard
            label={t('emergencyKpi.total_visits')}
            value={totV.toLocaleString()}
            hint={t('emergencyKpi.across_days', { count: days })}
            tone="danger"
            icon="ambulance"
          />
          <StatCard
            label={t('emergencyKpi.avg_door_doctor')}
            value={summary.avg_door_to_doctor != null ? `${Math.round(summary.avg_door_to_doctor)}m` : '—'}
            hint={t('emergencyKpi.target_30min')}
            tone="brand"
            icon="stopwatch"
          />
          <StatCard
            label={t('emergencyKpi.avg_los')}
            value={summary.avg_length_of_stay != null ? `${Math.round(summary.avg_length_of_stay)}m` : '—'}
            hint={t('emergencyKpi.los_sub')}
            tone="brand"
            icon="clock"
          />
          <StatCard
            label={t('emergencyKpi.lwbs_rate')}
            value={`${lwbsPct}%`}
            hint={t('emergencyKpi.lwbs_sub', { count: lwbs })}
            tone="warning"
            icon="sign-out"
          />
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
            <h2 className="mb-4 text-sm font-bold text-ink">{t('emergencyKpi.acuity_mix')}</h2>
            <BarRow label={t('emergencyKpi.l1')} count={summary.l1} total={totV} color="#7f1d1d" />
            <BarRow label={t('emergencyKpi.l2')} count={summary.l2} total={totV} color="#b45309" />
            <BarRow label={t('emergencyKpi.l3')} count={summary.l3} total={totV} color="#92400e" />
            <BarRow label={t('emergencyKpi.l4')} count={summary.l4} total={totV} color="#166534" />
            <BarRow label={t('emergencyKpi.l5')} count={summary.l5} total={totV} color="#1e40af" />
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
            <h2 className="mb-4 text-sm font-bold text-ink">{t('emergencyKpi.disposition_mix')}</h2>
            {dispoCounts.length === 0 ? (
              <p className="text-sm text-slate-500">{t('emergencyKpi.no_dispositions')}</p>
            ) : (
              dispoCounts.map((d) => (
                <BarRow
                  key={d.pathway}
                  label={String(d.pathway || '').replace(/_/g, ' ')}
                  count={d.n}
                  total={dispoTot}
                  color={DISPO_COLORS[d.pathway] || '#475569'}
                />
              ))
            )}
          </div>
        </div>

        <div className="hms-compact-kpi-grid mb-4">
          <StatCard label={t('emergencyKpi.mlc_cases')} value={Number(summary.mlc || 0)} tone="default" icon="gavel" />
          <StatCard label={t('emergencyKpi.by_ambulance')} value={Number(summary.by_ambulance || 0)} tone="danger" icon="ambulance" />
          <StatCard label={t('emergencyKpi.walk_in')} value={Number(summary.by_walk_in || 0)} tone="brand" icon="walking" />
          <StatCard label={t('emergencyKpi.referral')} value={Number(summary.by_referral || 0)} tone="brand" icon="share" />
        </div>

        {dailyTrend.length > 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
            <h2 className="mb-4 text-sm font-bold text-ink">{t('emergencyKpi.daily_trend')}</h2>
            <div className="flex h-40 items-end gap-2">
              {dailyTrend.map((row) => {
                const n = Number(row.n) || 0;
                const pct = Math.round((n / trendMax) * 100);
                const day = row.d ? String(row.d).slice(5) : '';
                return (
                  <div key={row.d} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold text-slate-500">{n}</span>
                    <div className="flex w-full flex-1 items-end">
                      <div className="w-full rounded-t bg-red-500/80" style={{ height: `${Math.max(n ? 8 : 0, pct)}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-400">{day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
