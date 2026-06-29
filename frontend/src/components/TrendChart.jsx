import { useTranslation } from 'react-i18next';

function formatChartDay(raw, locale) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try {
      return new Date(`${s}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' });
    } catch {
      return s;
    }
  }
  return s;
}

export function TrendChart({ labels = [], values = [], label, embedded = false }) {
  const { t, i18n } = useTranslation('dashboard');
  const chartLocale = (i18n.language || 'en').startsWith('fr') ? 'fr-FR' : 'en-GB';
  const chartLabel = label ?? t('panels.registrations_7d');
  const nums = values.map((v) => Number(v) || 0);
  const max = Math.max(1, ...nums);

  const bars = (
    <div
      className={embedded ? 'hms-dash-chart__bars' : 'flex h-52 items-end gap-2'}
      role="img"
      aria-label={`${chartLabel} trend chart`}
    >
      {labels.map((day, i) => {
        const val = nums[i] || 0;
        const pct = Math.round((val / max) * 100);
        const dayLabel = formatChartDay(day, chartLocale);
        return (
          <div
            key={`${day}-${i}`}
            className={embedded ? 'hms-dash-chart__col' : 'flex min-w-0 flex-1 flex-col items-center gap-2'}
          >
            <span className={embedded ? 'hms-dash-chart__val' : 'text-[10px] font-semibold text-slate-500'}>{val}</span>
            <div className={embedded ? 'hms-dash-chart__bar-wrap' : 'flex w-full flex-1 items-end'}>
              <div
                className={embedded ? 'hms-dash-chart__bar' : 'w-full rounded-t-lg bg-gradient-to-t from-brand to-brand/70 transition-all'}
                style={{ height: `${Math.max(val ? 8 : 0, pct)}%` }}
                title={`${dayLabel}: ${val}`}
              />
            </div>
            <span className={embedded ? 'hms-dash-chart__day' : 'truncate text-[10px] font-medium text-slate-500'}>
              {dayLabel}
            </span>
          </div>
        );
      })}
    </div>
  );

  if (embedded) {
    return (
      <div className="hms-dash-chart">
        <p className="hms-dash-chart__subtitle">{t('panels.last_7_days')}</p>
        {bars}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
      <h3 className="text-sm font-bold text-ink">{chartLabel}</h3>
      <p className="mb-4 text-xs text-slate-500">{t('panels.last_7_days')}</p>
      {bars}
    </div>
  );
}
