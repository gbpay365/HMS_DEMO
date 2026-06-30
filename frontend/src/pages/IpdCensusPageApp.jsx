import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { formatDate } from '../lib/listUi';
import { formatFcfa, ipdStatusPillLocalized } from '../lib/wardUi';

export function IpdCensusPageApp({ admissions = [], stats = {}, flash = null, error = null }) {
  const { t } = useTranslation('ipd');

  return (
    <div className="page-wrapper hms-surface-module hms-ipd-census-page">
      <div className="content px-4 pb-6 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="users" title={t('census.title')} subtitle={t('census.subtitle')} badge={t('census.kicker')} className="mb-4">
          <div className="hms-staff-hero-toolbar mt-3 flex flex-wrap items-center gap-2">
            <a href="/wards" className="hms-staff-hero-tab">
              <i className="fa fa-bed" aria-hidden="true" />
              {t('census.bed_board')}
            </a>
            <a href="/ipd/ward-rounds" className="hms-staff-hero-tab">
              <i className="fa fa-stethoscope" aria-hidden="true" />
              {t('census.ward_rounds')}
            </a>
            <a href="/ipd" className="hms-staff-hero-tab hms-staff-hero-tab--active">
              <i className="fa fa-hospital-o" aria-hidden="true" />
              {t('hub.title')}
            </a>
          </div>
        </SurfaceHero>

        <div className="hms-compact-kpi-grid mb-4">
          <StatCard label={t('census.kpi_total')} value={stats.total || 0} tone="brand" icon="list" size="dense" />
          <StatCard label={t('census.kpi_active')} value={stats.admitted || 0} tone="brand" icon="bed" size="dense" />
          <StatCard label={t('census.kpi_awaiting_dc')} value={stats.clinical_discharged || 0} tone="warning" icon="sign-out" size="dense" />
          <StatCard label={t('census.kpi_avg_los')} value={stats.avgLos || 0} tone="default" icon="calendar" size="dense" />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-xs font-bold text-ink">{t('census.table_title', { count: admissions.length })}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t('census.col_num')}</th>
                  <th className="px-3 py-2">{t('census.col_patient')}</th>
                  <th className="px-3 py-2">{t('census.col_ward')}</th>
                  <th className="px-3 py-2">{t('census.col_dept')}</th>
                  <th className="px-3 py-2">{t('census.col_admitted')}</th>
                  <th className="px-3 py-2">{t('census.col_los')}</th>
                  <th className="px-3 py-2">{t('census.col_diagnosis')}</th>
                  <th className="px-3 py-2">{t('census.col_doctor')}</th>
                  <th className="px-3 py-2 text-right">{t('census.col_bill')}</th>
                  <th className="px-3 py-2">{t('census.col_status')}</th>
                  <th className="px-3 py-2 text-right">{t('census.col_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admissions.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-500">
                      {t('census.empty')}
                    </td>
                  </tr>
                ) : (
                  admissions.map((a, i) => {
                    const pill = ipdStatusPillLocalized(a.ipd_status, t);
                    const los = parseInt(a.los_days, 10) || 0;
                    return (
                      <tr key={a.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="text-sm font-semibold text-ink">
                            {a.first_name} {a.last_name}
                          </div>
                          <div className="text-[11px] text-slate-500">{a.phone || ''}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-sm font-medium">{a.bed_label || '—'}</div>
                          <div className="text-[11px] text-slate-500">{a.ward_name || ''}</div>
                        </td>
                        <td className="max-w-[100px] truncate px-3 py-2 text-xs">{a.admitting_department || t('shared.dept_general')}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{formatDate(a.admitted_at)}</td>
                        <td className="px-3 py-2 text-sm font-semibold">{los}d</td>
                        <td className="max-w-[120px] truncate px-3 py-2 text-xs" title={a.admitting_diagnosis || ''}>
                          {a.admitting_diagnosis || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {a.doc_fn ? `Dr. ${a.doc_fn} ${a.doc_ln || ''}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-red-600">
                          {formatFcfa(a.running_bill)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={pill.className}>{pill.label}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <a href={`/patient-chart/${a.patient_id}`} className="hms-btn-secondary px-2 py-1 text-[10px]">
                              {t('shared.chart')}
                            </a>
                            <a href={`/ipd/running-bill/${a.id}`} className="hms-btn-secondary px-2 py-1 text-[10px]">
                              {t('shared.bill')}
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
