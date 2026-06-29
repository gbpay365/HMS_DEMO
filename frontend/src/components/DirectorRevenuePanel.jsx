import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HubStatCard } from './HubStatCard';
import { enrichDirectorRevenueStats, formatRevenueAmount } from '../lib/directorRevenueCatalog';
import { currencyCode } from '../lib/hmsLocale';

const PERIODS = [
  { id: 'daily', query: { period: 'day' } },
  { id: 'weekly', query: { period: 'week' } },
  { id: 'monthly', query: { period: 'month' } },
];

function buildQuery(periodId) {
  const row = PERIODS.find((p) => p.id === periodId) || PERIODS[0];
  const params = new URLSearchParams(row.query);
  return params.toString();
}

export function DirectorRevenuePanel({ revenueStatItems = [], showSection = true }) {
  const { t } = useTranslation('clinical');
  const visibleStats = useMemo(() => enrichDirectorRevenueStats(revenueStatItems), [revenueStatItems]);
  const [period, setPeriod] = useState('daily');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!showSection || visibleStats.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/portal/api/director-revenue?${buildQuery(period)}`, {
        credentials: 'same-origin'});
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || t('directorRevenue.load_error'));
      }
      setPayload(data);
    } catch (err) {
      setError(err.message || t('directorRevenue.load_error'));
    } finally {
      setLoading(false);
    }
  }, [period, showSection, visibleStats.length, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!showSection || visibleStats.length === 0) return undefined;
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh, showSection, visibleStats.length]);

  if (!showSection || visibleStats.length === 0) return null;

  const totals = payload?.totals || {};
  const primaryCards = visibleStats.filter((s) => s.primary);
  const otherCards = visibleStats.filter((s) => !s.primary && s.statKey !== 'total');
  const totalCard = visibleStats.find((s) => s.statKey === 'total');

  function cardValue(statKey) {
    return formatRevenueAmount(totals[statKey]);
  }

  function statLabel(item) {
    return t(`directorRevenue.stats.${item.statKey}`);
  }

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-card">
      <div
        className="border-b border-slate-100 px-5 py-5 sm:px-6"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #0f766e 100%)' }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200/90">
              {t('directorRevenue.eyebrow')}
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">{t('directorRevenue.title')}</h2>
            <p className="mt-1 text-sm text-white/70">{t('directorRevenue.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                  period === p.id
                    ? 'bg-white text-slate-900 shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {t(`directorRevenue.period_${p.id}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/75">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" aria-hidden="true" />
            {t('directorRevenue.live')}
          </span>
          {payload?.range?.label ? (
            <span>
              {t('directorRevenue.range')}: <strong className="text-white">{payload.range.label}</strong>
            </span>
          ) : null}
          {payload?.ticketCount != null ? (
            <span>
              {t('directorRevenue.tickets', { count: payload.ticketCount })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="px-5 py-5 sm:px-6">
        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading && !payload ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visibleStats.slice(0, 4).map((s) => (
              <div key={s.code} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <>
            {totalCard ? (
              <div className="mb-4">
                <HubStatCard
                  label={`${statLabel(totalCard)} (${currencyCode()})`}
                  value={cardValue('total')}
                  icon={totalCard.icon}
                  color={totalCard.color}
                />
              </div>
            ) : null}

            {primaryCards.filter((s) => s.statKey !== 'total').length > 0 ? (
              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {primaryCards
                  .filter((s) => s.statKey !== 'total')
                  .map((s) => (
                    <HubStatCard
                      key={s.code}
                      label={`${statLabel(s)} (${currencyCode()})`}
                      value={cardValue(s.statKey)}
                      icon={s.icon}
                      color={s.color}
                    />
                  ))}
              </div>
            ) : null}

            {otherCards.length > 0 ? (
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                  {t('directorRevenue.other_services')}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {otherCards.map((s) => (
                    <HubStatCard
                      key={s.code}
                      label={`${statLabel(s)} (${currencyCode()})`}
                      value={cardValue(s.statKey)}
                      icon={s.icon}
                      color={s.color}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
