import { useTranslation } from 'react-i18next';
import { formatDate } from '../lib/listUi';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { FaIcon } from '../components/FaIcon';

function ActionTile({ href, icon, label }) {
  return (
    <a
      href={href}
      className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-lg text-brand">
        <FaIcon name={icon} />
      </div>
      <span className="text-xs font-bold text-ink">{label}</span>
    </a>
  );
}

export function FrontDeskPageApp({ stats = {}, emergencies = [], appointments = [] }) {
  const { t } = useTranslation('clinical');
  const todayLabel = formatDate(new Date());

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <SurfaceHero
          icon="user-md"
          title={t('frontDesk.title')}
          subtitle={t('frontDesk.subtitle', { date: todayLabel })}
        >
          <div className="hms-surface-hero-actions mt-4">
            <a href="/patients?action=new" className="hms-btn-primary text-xs">
              {t('frontDesk.register_patient')}
            </a>
            <a href="/appointments" className="hms-btn-secondary text-xs">
              {t('frontDesk.book_visit')}
            </a>
          </div>
        </SurfaceHero>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label={t('frontDesk.stat_scheduled')} value={stats.appts || 0} hint={t('frontDesk.stat_scheduled_hint')} tone="brand" icon="calendar-check" />
          <StatCard label={t('frontDesk.stat_new_regs')} value={stats.newPats || 0} hint={t('frontDesk.stat_new_regs_hint')} tone="brand" icon="user-plus" />
          <StatCard label={t('frontDesk.stat_active')} value={stats.totalPats || 0} hint={t('frontDesk.stat_active_hint')} tone="brand" icon="users" />
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-card">
              <div className="flex items-center justify-between border-b border-red-100 bg-red-50/50 px-5 py-4">
                <h2 className="flex items-center gap-2 text-sm font-bold text-red-800">
                  <FaIcon name="ambulance" />
                  {t('frontDesk.emergencies')}
                </h2>
                <span className="rounded-full bg-red-600 px-3 py-0.5 text-xs font-bold text-white">
                  {t('frontDesk.active_count', { count: emergencies.length })}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">{t('shared.patient')}</th>
                      <th className="px-4 py-3">{t('frontDesk.col_triage')}</th>
                      <th className="px-4 py-3">{t('frontDesk.col_arrival')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {emergencies.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                          {t('frontDesk.no_emergencies')}
                        </td>
                      </tr>
                    ) : (
                      emergencies.map((er) => (
                        <tr key={er.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-semibold text-ink">
                            {er.first_name} {er.last_name}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold uppercase text-red-800">
                              {String(er.queue_status || '').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {er.queue_started_at
                              ? new Date(er.queue_started_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'})
                              : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-ink">{t('frontDesk.admin_actions')}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{t('frontDesk.admin_subtitle')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ActionTile href="/patients?action=new" icon="user-plus" label={t('frontDesk.tile_register')} />
                <ActionTile href="/opd-queue" icon="heartbeat" label={t('frontDesk.tile_vitals')} />
                <ActionTile href="/cashier" icon="credit-card" label={t('frontDesk.tile_payments')} />
                <ActionTile href="/opd-queue" icon="list-alt" label={t('frontDesk.tile_opd_queue')} />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-bold text-ink">{t('frontDesk.today_queue')}</h2>
                <a href="/appointments" className="text-xs font-bold text-brand hover:underline">
                  {t('shared.view_all')}
                </a>
              </div>
              <ul className="divide-y divide-slate-100">
                {appointments.length === 0 ? (
                  <li className="px-5 py-10 text-center text-sm text-slate-500">{t('frontDesk.no_appointments')}</li>
                ) : (
                  appointments.map((appt, i) => (
                    <li key={i} className="px-5 py-4 hover:bg-slate-50/80">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{appt.patient_name}</span>
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold">
                          {appt.time}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Dr. {appt.doctor} · {appt.department}
                      </p>
                    </li>
                  ))
                )}
              </ul>
              <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-center text-xs text-slate-500">
                {t('frontDesk.showing_top')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
