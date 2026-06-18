import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { formatDate, opdQueueStatus, opdQueueStatusLabel } from '../lib/listUi';

function consultHref(visit) {
  return `/consultation-new?patient_id=${visit.patient_id}&visit_id=${visit.id}`;
}

export function ConsultationStartPageApp({ visits = [], flash = null, error = null }) {
  const { t } = useTranslation('clinical');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visits;
    return visits.filter((v) => {
      const hay = [
        v.first_name,
        v.last_name,
        v.patient_code,
        v.ticket_number,
        v.phone,
        v.department,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [visits, search]);

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="stethoscope" title={t('consultationStart.title')} subtitle={t('consultationStart.subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            <a href="/opd-queue" className="hms-btn-secondary text-xs">
              {t('consultationStart.opd_queue')}
            </a>
            <a href="/patients" className="hms-btn-primary text-xs">
              {t('consultationStart.patient_directory')}
            </a>
          </div>
        </SurfaceHero>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <StatCard label={t('consultationStart.stat_ready')} value={visits.length} tone="brand" icon="users" />
          <StatCard label={t('consultationStart.stat_filtered')} value={filtered.length} tone="default" icon="search" />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <SearchField
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder={t('consultationStart.search_ph')}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-semibold text-slate-700">{t('consultationStart.empty_title')}</p>
              <p className="mt-2 text-xs text-slate-500">{t('consultationStart.empty_hint')}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <a href="/opd-queue" className="hms-btn-primary text-xs">
                  {t('consultationStart.go_opd_queue')}
                </a>
                <a href="/patients" className="hms-btn-secondary text-xs">
                  {t('consultationStart.browse_patients')}
                </a>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('consultationStart.col_patient')}</th>
                    <th className="px-4 py-3">{t('consultationStart.col_ticket')}</th>
                    <th className="px-4 py-3">{t('consultationStart.col_status')}</th>
                    <th className="px-4 py-3">{t('consultationStart.col_department')}</th>
                    <th className="px-4 py-3">{t('consultationStart.col_visit')}</th>
                    <th className="px-4 py-3 text-right">{t('consultationStart.col_action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((v) => {
                    const st = opdQueueStatus(v.queue_status);
                    return (
                      <tr key={v.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-ink">
                            {v.first_name} {v.last_name}
                          </div>
                          <div className="text-xs text-slate-500">{v.patient_code || `PT-${v.patient_id}`}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{v.ticket_number || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.className}`}>
                            {opdQueueStatusLabel(t, v.queue_status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{v.department || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(v.visit_date)}</td>
                        <td className="px-4 py-3 text-right">
                          <a href={consultHref(v)} className="hms-btn-primary text-xs">
                            {t('consultationStart.start_consultation')}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
