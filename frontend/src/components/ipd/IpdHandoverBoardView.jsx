import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ipdStatusPillLocalized } from '../../lib/wardUi';

function fmtDt(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'});
  } catch {
    return String(value);
  }
}

export function IpdHandoverBoardView({ patients = [], recentHandovers = [], isNurse = false }) {
  const { t } = useTranslation('ipd');

  const byWard = useMemo(() => {
    const map = {};
    for (const p of patients) {
      const ward = p.ward_name || t('pages.general_ward');
      if (!map[ward]) map[ward] = [];
      map[ward].push(p);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [patients, t]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-900 via-slate-800 to-sky-900 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-sky-300">
              <i className="fa fa-exchange" aria-hidden="true" />
              I-SBARR
            </div>
            <h1 className="text-2xl font-extrabold">{t('handover.board_title')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">{t('handover.board_subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/wards" className="hms-btn-secondary text-xs !bg-white/10 !text-white !border-white/20">
              <i className="fa fa-th-large mr-1" aria-hidden="true" />
              {t('wards.title')}
            </a>
            <a href="/ipd/medication" className="hms-btn-secondary text-xs !bg-white/10 !text-white !border-white/20">
              <i className="fa fa-medkit mr-1" aria-hidden="true" />
              {t('hub.menu_meds')}
            </a>
            <a href="/nursing/supply-requests" className="hms-btn-secondary text-xs !bg-white/10 !text-white !border-white/20">
              <i className="fa fa-shopping-basket mr-1" aria-hidden="true" />
              {t('supply.short_label')}
            </a>
          </div>
        </div>
      </div>

      {recentHandovers.length > 0 ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
          <h2 className="mb-3 font-bold text-emerald-900">
            <i className="fa fa-check-circle mr-1" aria-hidden="true" />
            {t('handover.recent_submitted')}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recentHandovers.slice(0, 6).map((h) => (
              <a
                key={h.id}
                href={`/ipd/shift/${h.admission_id}?report=${h.id}`}
                className="rounded-xl border border-emerald-100 bg-white p-3 text-sm shadow-sm transition hover:border-emerald-300"
              >
                <div className="font-bold text-ink">{h.patient_name}</div>
                <div className="text-[10px] text-slate-500">
                  {h.ward_name} · {h.bed_label}
                </div>
                <div className="mt-1 text-[10px] text-emerald-800">
                  {h.nurse_name} · {fmtDt(h.shift_ended_at)}
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {byWard.map(([wardName, beds]) => (
        <div key={wardName} className="rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="font-extrabold text-ink">
              <i className="fa fa-hospital-o mr-2 text-sky-600" aria-hidden="true" />
              {wardName}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
              {beds.length} {t('shared.patients')}
            </span>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {beds.map((p) => {
              const pill = ipdStatusPillLocalized(p.ipd_status || 'admitted', t);
              const submitted = p.submitted || p.report_status === 'submitted';
              const href =
                submitted && p.shift_report_id
                  ? `/ipd/shift/${p.admission_id}?report=${p.shift_report_id}`
                  : `/ipd/shift/${p.admission_id}`;
              return (
                <div
                  key={p.admission_id}
                  className="rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{p.bed_label}</div>
                      <div className="font-extrabold text-ink">{p.patient_name}</div>
                    </div>
                    <span className={pill.className}>{pill.label}</span>
                  </div>
                  <div className="mb-3 space-y-1 text-[10px] text-slate-500">
                    {p.nurse_name ? (
                      <div>
                        <i className="fa fa-user-md mr-1" aria-hidden="true" />
                        {p.nurse_name} · {p.shift_label || '—'}
                      </div>
                    ) : (
                      <div className="italic">{t('handover.no_report_yet')}</div>
                    )}
                    <div>
                      <i className="fa fa-medkit mr-1" aria-hidden="true" />
                      {t('handover.doses_count', { count: p.doses_given || 0 })}
                    </div>
                    <div>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 font-bold uppercase ${
                          submitted ? 'bg-emerald-100 text-emerald-800' : p.is_mine ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {submitted ? t('handover.status_submitted') : p.is_mine ? t('handover.status_draft') : t('handover.status_open')}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <a href={href} className="hms-btn-primary flex-1 py-1.5 text-[10px]">
                      <i className="fa fa-file-text-o mr-1" aria-hidden="true" />
                      {submitted ? t('handover.read_report') : isNurse ? t('handover.write_report') : t('handover.view_report')}
                    </a>
                    <a href={`/ipd/chart/${p.admission_id}`} className="hms-btn-secondary py-1.5 text-[10px]">
                      <i className="fa fa-table" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!patients.length ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-500">
          {t('handover.no_patients')}
        </div>
      ) : null}
    </div>
  );
}
