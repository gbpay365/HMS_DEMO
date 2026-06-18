import { useTranslation } from 'react-i18next';
import { hubItemLabel } from '../lib/hubI18n';

export function HubOpdTodayPanel({ visits = [], showOpdQueueLink = true }) {
  const { t } = useTranslation(['legacy', 'clinical']);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-card">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-ink">
          {hubItemLabel('hub.panel.opd_today', "Today's OPD", t)}
        </h2>
      </div>
      <ul className="divide-y divide-slate-100">
        {!visits.length ? (
          <li className="px-4 py-3 text-sm text-slate-500">
            {t('hub.no_visits_today', { ns: 'legacy' })}
          </li>
        ) : (
          visits.map((v) => (
            <li key={v.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold text-ink">
                  {v.first_name} {v.last_name}
                </div>
                <div className="text-xs text-slate-500">
                  {v.ticket_number || `#${v.id}`} ·{' '}
                  {t(`opd.status.${v.queue_status || ''}`, {
                    ns: 'clinical'}) || v.queue_status || '—'}
                </div>
              </div>
              {showOpdQueueLink ? (
                <a
                  href={`/opd-queue?q=${v.id}`}
                  className="shrink-0 rounded-full border border-brand/30 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/5"
                >
                  {t('hub.open', { ns: 'legacy' })}
                </a>
              ) : null}
            </li>
          ))
        )}
      </ul>
      {showOpdQueueLink ? (
        <div className="border-t border-slate-100 px-4 py-2">
          <a href="/opd-queue" className="text-xs font-semibold text-brand hover:underline">
            {t('hub.full_opd_queue', { ns: 'legacy' })}
          </a>
        </div>
      ) : null}
    </div>
  );
}
