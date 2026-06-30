import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ActionMenu';
import { FlashMessages } from '../components/FlashMessages';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { SurfaceHero } from '../components/SurfaceHero';
import { appointmentRecordStatus, appointmentRecordStatusLabel, appointmentVisitTypeLabel, hasPerm } from '../lib/listUi';
import { BookAppointmentModal } from '../modals/BookAppointmentModal';

export function AppointmentsPageApp({
  appointments = [],
  patients = [],
  doctors = [],
  departments = [],
  searchQ = '',
  pager = null,
  flash = null,
  error = null,
  userPerms = []}) {
  const { t } = useTranslation('clinical');
  const [bookOpen, setBookOpen] = useState(false);
  const [search, setSearch] = useState(searchQ || '');

  const stats = useMemo(() => {
    let pending = 0;
    let confirmed = 0;
    appointments.forEach((a) => {
      const st = appointmentRecordStatus(a);
      if (st.key === 'pending') pending += 1;
      if (st.key === 'confirmed') confirmed += 1;
    });
    return {
      total: pager?.total ?? appointments.length,
      onPage: appointments.length,
      pending,
      confirmed};
  }, [appointments, pager]);

  const menuFor = (appt) => {
    const items = [];
    if (hasPerm(userPerms, ['scheduling.write', 'clinical.write'])) {
      items.push({ href: '#', label: t('common:actions.edit'), icon: <span className="text-brand">✎</span> });
    }
    if (hasPerm(userPerms, ['scheduling.write'])) {
      items.push({ href: '#', label: t('common:actions.cancel'), icon: <span className="text-red-500">✕</span> });
    }
    return items;
  };

  const query = useMemo(() => (search.trim() ? { q: search.trim() } : {}), [search]);

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="calendar-check" title={t('appointments.title')} subtitle={t('appointments.subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            <a href="/portal/call-queue/launcher" target="_blank" rel="noopener noreferrer" className="hms-btn-secondary text-xs">
              {t('appointments.waiting_tv')}
            </a>
            <a href="/hms/appointments/slots-config" className="hms-btn-secondary text-xs">
              {t('appointments.slot_config')}
            </a>
            <button type="button" className="hms-btn-primary text-xs" onClick={() => setBookOpen(true)}>
              {t('appointments.new_appointment')}
            </button>
          </div>
        </SurfaceHero>

        <div className="hms-compact-kpi-grid mb-3">
          <StatCard label={t('appointments.stat_total')} value={stats.total} tone="brand" icon="calendar" />
          <StatCard label={t('appointments.stat_on_page')} value={stats.onPage} tone="default" icon="list" />
          <StatCard label={t('appointments.stat_pending')} value={stats.pending} tone="warning" icon="clock" />
          <StatCard label={t('appointments.stat_confirmed')} value={stats.confirmed} tone="brand" icon="check" />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <form method="get" action="/appointments" className="flex flex-wrap items-center gap-2">
            <SearchField
              name="q"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('appointments.search_ph')}
              onSubmit={(ev) => ev.currentTarget.submit()}
            />
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('appointments.col_appt_id')}</th>
                  <th className="px-4 py-3">{t('appointments.col_patient')}</th>
                  <th className="px-4 py-3">{t('appointments.col_visit')}</th>
                  <th className="px-4 py-3">{t('appointments.col_doctor')}</th>
                  <th className="px-4 py-3">{t('appointments.col_department')}</th>
                  <th className="px-4 py-3">{t('appointments.col_datetime')}</th>
                  <th className="px-4 py-3">{t('appointments.col_status')}</th>
                  <th className="px-4 py-3 text-right">{t('appointments.col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appointments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                      {t('appointments.empty')}
                    </td>
                  </tr>
                ) : (
                  appointments.map((appt) => {
                    const st = appointmentRecordStatus(appt);
                    const patientName = appt.p_fn ? `${appt.p_fn} ${appt.p_ln}` : appt.patient_name;
                    const items = menuFor(appt);
                    const vt = String(appt.visit_type || 'in_person').toLowerCase();
                    const isPending = st.key === 'pending';
                    const isConfirmed = st.key === 'confirmed';
                    return (
                      <tr key={appt.id || appt.appointment_id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold text-brand">{appt.appointment_id}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-ink">{patientName}</div>
                          <div className="text-xs text-slate-500">{t('appointments.patient_id', { id: appt.patient_id })}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-lg border px-2 py-0.5 text-xs font-medium ${vt === 'telemedicine' ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            {appointmentVisitTypeLabel(t, vt)}
                          </span>
                          {appt.payment_code ? (
                            <div className="mt-1 font-mono text-[10px] text-slate-500">{appt.payment_code}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{appt.doctor || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {appt.department}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-ink">{appt.date}</div>
                          <div className="text-xs text-slate-500">{appt.time}</div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge variant={st.variant} label={appointmentRecordStatusLabel(t, appt)} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {isPending && hasPerm(userPerms, ['scheduling.write', 'clinical.write']) ? (
                              <form method="post" action={`/appointments/${appt.id}/confirm`} className="inline">
                                <button type="submit" className="hms-btn-primary px-2 py-1 text-xs">
                                  {t('appointments.confirm')}
                                </button>
                              </form>
                            ) : null}
                            {vt === 'telemedicine' && isConfirmed && appt.meeting_room ? (
                              <a href={`/telemedicine/${appt.id}`} target="_blank" rel="noreferrer" className="hms-btn-secondary px-2 py-1 text-xs">
                                {t('appointments.join_video')}
                              </a>
                            ) : null}
                            {items.length ? <ActionMenu items={items} /> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pager pager={pager} basePath="/appointments" query={query} />
        </div>
      </div>

      <BookAppointmentModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        patients={patients}
        doctors={doctors}
        departments={departments}
      />
    </div>
  );
}
