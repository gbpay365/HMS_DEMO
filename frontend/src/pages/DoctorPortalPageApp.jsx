import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip } from '../components/FilterChip';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { FaIcon } from '../components/FaIcon';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { formatDate } from '../lib/listUi';
import { VisitingDoctorVisitBanner } from './VisitingDoctorMyVisitPageApp';

function ApptTypeBadge({ visitType, t }) {
  const vt = String(visitType || 'in_person').toLowerCase();
  if (vt === 'telemedicine') {
    return (
      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">
        {t('doctorPortal.telemedicine')}
      </span>
    );
  }
  return (
    <span className="rounded border bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-600">
      {t('doctorPortal.in_person')}
    </span>
  );
}

function DeclineApptModal({ open, appt, onClose, t }) {
  if (!appt) return null;
  const ref = appt.appointment_id || `#A-${appt.id}`;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <>
          {t('doctorPortal.decline_title')}{' '}
          <span className="text-sm font-normal text-indigo-100">{ref}</span>
        </>
      }
      size="sm"
      footer={
        <>
          <ModalCancelButton onClick={onClose} label={t('common:actions.cancel')} />
          <ModalSubmitButton
            form="doctor-decline-appt-form"
            variant="outline-danger"
            label={t('doctorPortal.decline_submit')}
          />
        </>
      }
    >
      <form id="doctor-decline-appt-form" method="POST" action={`/appointments/${appt.id}/decline`}>
        <p className="mb-3 text-sm text-slate-600">{t('doctorPortal.decline_hint')}</p>
        <label className="mb-1 block text-xs font-bold">{t('doctorPortal.decline_reason')}</label>
        <textarea
          name="reason"
          className="hms-input w-full text-sm"
          rows={3}
          placeholder={t('doctorPortal.decline_reason_ph')}
        />
      </form>
    </Modal>
  );
}

export function DoctorPortalPageApp({
  me = {},
  stats = {},
  pendingAppts = [],
  confirmedAppts = [],
  recentConsults = [],
  visitingVisit = null,
  flash = null,
  error = null}) {
  const { t } = useTranslation('clinical');
  const [tab, setTab] = useState('pending');
  const [declineAppt, setDeclineAppt] = useState(null);
  const name = me.first_name || t('doctorPortal.physician');

  const quickLinks = [
    { href: '/emergency', label: t('doctorPortal.tile_er_board'), icon: 'ambulance' },
    { href: '/portal/doctor/er-alerts', label: t('doctorPortal.tile_er_alerts'), icon: 'bell' },
    { href: '/consultation-new', label: t('doctorPortal.tile_new_consult'), icon: 'plus' },
    { href: '/opd-queue', label: t('doctorPortal.tile_opd_queue'), icon: 'list-alt' },
    { href: '/prescriptions', label: t('doctorPortal.tile_prescriptions'), icon: 'medkit' },
    { href: '/patients', label: t('doctorPortal.tile_patients'), icon: 'users' },
    { href: '/appointments', label: t('doctorPortal.tile_appointments'), icon: 'calendar' },
    { href: '/laboratory', label: t('doctorPortal.tile_laboratory'), icon: 'flask' },
  ];

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />
        <VisitingDoctorVisitBanner visit={visitingVisit} />

        <SurfaceHero
          icon="user-md"
          title={t('doctorPortal.welcome', { name })}
          subtitle={t('doctorPortal.role_date', {
            department: me.primary_department || t('doctorPortal.physician'),
            date: formatDate(new Date())})}
        >
          <div className="hms-surface-hero-actions mt-4">
            <a href="/workflow-guides" className="hms-btn-secondary text-xs">
              {t('doctorPortal.workflow_guide')}
            </a>
            <a href="/consultation-new" className="hms-btn-primary text-xs">
              {t('doctorPortal.new_consultation')}
            </a>
            <a href="/portal/doctor/er-alerts" className="hms-btn-outline-danger text-xs">
              {t('doctorPortal.er_alerts')}
            </a>
            <a href="/opd-queue" className="hms-btn-secondary text-xs">
              {t('doctorPortal.opd_queue')}
            </a>
          </div>
        </SurfaceHero>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t('doctorPortal.stat_appts_today')} value={stats.appts || 0} tone="brand" icon="calendar-check" />
          <StatCard label={t('doctorPortal.stat_consultations')} value={stats.consults || 0} tone="brand" icon="stethoscope" />
          <StatCard label={t('doctorPortal.stat_opd_queue')} value={stats.pending || 0} tone="warning" icon="clock" />
          <StatCard label={t('doctorPortal.stat_patients')} value={stats.patients || 0} tone="default" icon="users" />
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quickLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex flex-col items-center rounded-xl border border-slate-100 bg-white p-4 text-center shadow-card transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-xl text-brand">
                <FaIcon name={link.icon} />
              </span>
              <span className="text-xs font-bold text-ink">{link.label}</span>
            </a>
          ))}
        </div>

        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <span className="font-bold text-ink">{t('doctorPortal.my_appointments')}</span>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={tab === 'pending'} onClick={() => setTab('pending')} count={pendingAppts.length}>
                {t('appointments.status.pending')}
              </FilterChip>
              <FilterChip active={tab === 'confirmed'} onClick={() => setTab('confirmed')} count={confirmedAppts.length}>
                {t('appointments.status.confirmed')}
              </FilterChip>
            </div>
          </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
              {tab === 'pending' ? (
                <tr>
                  <th className="px-3 py-2">{t('doctorPortal.col_ref')}</th>
                  <th className="px-3 py-2">{t('doctorPortal.col_patient')}</th>
                  <th className="px-3 py-2">{t('doctorPortal.col_type')}</th>
                  <th className="px-3 py-2">{t('doctorPortal.col_department')}</th>
                  <th className="px-3 py-2">{t('doctorPortal.col_date')}</th>
                  <th className="px-3 py-2">{t('doctorPortal.col_time')}</th>
                  <th className="px-3 py-2 text-right">{t('doctorPortal.col_actions')}</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-3 py-2">{t('doctorPortal.col_ref')}</th>
                  <th className="px-3 py-2">{t('doctorPortal.col_patient')}</th>
                  <th className="px-3 py-2">{t('doctorPortal.col_type')}</th>
                  <th className="px-3 py-2">{t('doctorPortal.col_department')}</th>
                  <th className="px-3 py-2">{t('doctorPortal.col_date')}</th>
                  <th className="px-3 py-2">{t('doctorPortal.col_time')}</th>
                  <th className="px-3 py-2 text-right">{t('doctorPortal.col_action')}</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tab === 'pending' ? (
                !pendingAppts.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                      {t('doctorPortal.no_pending')}
                    </td>
                  </tr>
                ) : (
                  pendingAppts.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2 font-mono text-xs font-bold text-blue-600">
                        {a.appointment_id || `#A-${a.id}`}
                      </td>
                      <td className="px-3 py-2 font-bold">{a.patient_name || '—'}</td>
                      <td className="px-3 py-2">
                        <ApptTypeBadge visitType={a.visit_type} t={t} />
                      </td>
                      <td className="px-3 py-2 text-slate-500">{a.department || '—'}</td>
                      <td className="px-3 py-2">{a.date ? formatDate(a.date) : '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{a.time || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <form action={`/appointments/${a.id}/confirm`} method="POST" className="inline">
                          <button type="submit" className="hms-btn hms-btn-success text-xs">
                            {t('doctorPortal.confirm')}
                          </button>
                        </form>
                        <button
                          type="button"
                          className="ml-1 hms-btn hms-btn-outline-danger text-xs"
                          onClick={() => setDeclineAppt(a)}
                        >
                          {t('doctorPortal.decline')}
                        </button>
                      </td>
                    </tr>
                  ))
                )
              ) : !confirmedAppts.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                    {t('doctorPortal.no_confirmed')}
                  </td>
                </tr>
              ) : (
                confirmedAppts.map((a) => {
                  const vt = String(a.visit_type || 'in_person').toLowerCase();
                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-2 font-mono text-xs font-bold text-blue-600">
                        {a.appointment_id || `#A-${a.id}`}
                      </td>
                      <td className="px-3 py-2 font-bold">{a.patient_name || '—'}</td>
                      <td className="px-3 py-2">
                        <ApptTypeBadge visitType={a.visit_type} t={t} />
                      </td>
                      <td className="px-3 py-2 text-slate-500">{a.department || '—'}</td>
                      <td className="px-3 py-2">{a.date ? formatDate(a.date) : '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{a.time || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {vt === 'telemedicine' && a.meeting_room ? (
                          <a href={`/telemedicine/${a.id}`} target="_blank" rel="noreferrer" className="hms-btn hms-btn-primary text-xs">
                            {t('doctorPortal.start_consultation')}
                          </a>
                        ) : (
                          <a href={`/patient-chart/${a.patient_id}`} className="hms-btn hms-btn-outline-primary text-xs">
                            {t('doctorPortal.open_chart')}
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {recentConsults.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{t('doctorPortal.recent_consultations')}</h2>
          <div className="space-y-2">
            {recentConsults.map((c) => (
              <a
                key={c.id}
                href={`/patient-chart/${c.patient_id}`}
                className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
              >
                <span className="font-semibold">
                  {c.first_name} {c.last_name}
                </span>
                <span className="text-slate-400">{c.created_at ? formatDate(c.created_at) : ''}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <DeclineApptModal open={!!declineAppt} appt={declineAppt} onClose={() => setDeclineAppt(null)} t={t} />
      </div>
    </div>
  );
}
