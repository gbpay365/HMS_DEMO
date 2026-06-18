import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/listUi';

function patientInitials(visit) {
  const a = (visit.first_name || '?')[0] || '?';
  const b = (visit.last_name || '?')[0] || '?';
  return `${a}${b}`.toUpperCase();
}

export function OpdDrugChartView({ visit = {}, active = null, slots = [], canAdminister = false }) {
  const { t } = useTranslation('clinical');
  const visitId = visit.id;
  const initials = patientInitials(visit);

  if (!active) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-sky-300 bg-gradient-to-br from-sky-50 to-blue-50/50 px-6 py-12 text-center shadow-sm">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-3xl text-sky-600">
          <i className="fa fa-heartbeat" aria-hidden="true" />
        </span>
        <p className="mb-4 text-sm font-semibold text-sky-900">{t('opd.treatment.no_active_chart')}</p>
        <a
          href={`/opd/treatment/${visitId}`}
          className="hms-btn hms-btn-action-start"
        >
          <i className="fa fa-medkit" aria-hidden="true" />
          {t('opd.treatment.open_treatment')}
        </a>
      </div>
    );
  }

  const pendingCount = slots.filter((s) => !s.administered).length;
  const givenCount = slots.filter((s) => s.administered).length;

  return (
    <>
      <div className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-sky-700 via-sky-600 to-blue-700 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-xl font-black ring-2 ring-white/20">
              {initials}
            </div>
            <div>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider">
                <i className="fa fa-heartbeat" aria-hidden="true" />
                {t('opd.treatment.chart_nurse_badge')}
              </div>
              <h1 className="text-xl font-black sm:text-2xl">{t('opd.treatment.chart_title')}</h1>
              <p className="text-sm text-sky-100">
                {visit.first_name} {visit.last_name}
                {visit.ticket_number ? ` · ${visit.ticket_number}` : ''}
              </p>
            </div>
          </div>
          <a
            href={`/opd/treatment/${visitId}`}
            className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold transition hover:bg-white/20"
          >
            <i className="fa fa-medkit" aria-hidden="true" />
            {t('opd.treatment.open_treatment')}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-sky-900/40 text-center text-xs font-bold">
          <div className="bg-sky-900/30 px-3 py-2.5">
            <i className="fa fa-hourglass-half mr-1 text-amber-300" aria-hidden="true" />
            {t('opd.treatment.chart_pending_count', { count: pendingCount })}
          </div>
          <div className="bg-sky-900/30 px-3 py-2.5">
            <i className="fa fa-check-circle mr-1 text-emerald-300" aria-hidden="true" />
            {t('opd.treatment.chart_given_count', { count: givenCount })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-card">
        <div className="divide-y divide-sky-100">
          {slots.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <i className="fa fa-calendar-times-o mb-3 text-3xl text-sky-300" aria-hidden="true" />
              <p className="text-sm text-slate-500">{t('opd.treatment.no_doses_window')}</p>
            </div>
          ) : (
            slots.map((s) => (
              <div
                key={s.id}
                className={`flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition ${
                  s.administered
                    ? 'bg-gradient-to-r from-emerald-50/80 to-teal-50/40'
                    : 'bg-white hover:bg-sky-50/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm ${
                      s.administered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    <i className={`fa ${s.administered ? 'fa-check' : 'fa-flask'}`} aria-hidden="true" />
                  </span>
                  <div>
                    <div className="font-bold text-slate-900">{s.drug_name}</div>
                    <div className="text-sm text-slate-600">
                      <i className="fa fa-tint mr-1 text-sky-500" aria-hidden="true" />
                      {s.dosage}
                      <span className="mx-1 text-slate-300">·</span>
                      <i className="fa fa-clock-o mr-1 text-sky-500" aria-hidden="true" />
                      {formatDate(s.scheduled_at)}
                    </div>
                    {s.nurse_name && s.administered ? (
                      <div className="mt-1 text-xs font-semibold text-emerald-700">
                        <i className="fa fa-user-md mr-1" aria-hidden="true" />
                        {t('opd.treatment.by_nurse', { name: s.nurse_name })}
                      </div>
                    ) : null}
                  </div>
                </div>
                {s.administered ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-900">
                    <i className="fa fa-check-circle" aria-hidden="true" />
                    {t('opd.treatment.given')}
                  </span>
                ) : canAdminister ? (
                  <form method="POST" action={`/opd/dose/${s.id}/administer`} className="flex flex-col items-end gap-2 sm:flex-row">
                    <input
                      name="nurse_comment"
                      className="hms-input min-w-[10rem] border-sky-200 text-xs"
                      placeholder={t('opd.treatment.nurse_comment_ph')}
                    />
                    <button
                      type="submit"
                      className="hms-btn hms-btn-action-dispense hms-btn-sm"
                    >
                      <i className="fa fa-check" aria-hidden="true" />
                      {t('opd.treatment.confirm_given')}
                    </button>
                  </form>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">
                    <i className="fa fa-hourglass-half" aria-hidden="true" />
                    {t('opd.treatment.pending')}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
