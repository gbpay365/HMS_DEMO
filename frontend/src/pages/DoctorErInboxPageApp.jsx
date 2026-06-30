import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';

const ACUITY = {
  1: 'L1 Resuscitation',
  2: 'L2 Emergent',
  3: 'L3 Urgent',
  4: 'L4 Less urgent',
  5: 'L5 Non-urgent'};

function alertHeadline(t, alertType) {
  return alertType === 'patient_arrival'
    ? t('doctor_er_inbox.arrival_headline')
    : t('doctor_er_inbox.awaiting_headline');
}

function ErAlertCard({ alert: a, inboxPath }) {
  const { t } = useTranslation('clinical');
  const acuity = a.acuity_level ? ACUITY[a.acuity_level] || `Level ${a.acuity_level}` : '—';
  const visitHref = a.opd_visit_id ? `/emergency/visit/${a.opd_visit_id}` : inboxPath;

  return (
    <div className="dea-inbox-card-er mb-4 overflow-hidden rounded-2xl border-4 border-red-300 bg-gradient-to-br from-red-900 via-red-950 to-black p-5 text-white shadow-2xl">
      <style>{`
        @keyframes deaInboxPulseEr {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 100, 100, 0.5); }
          50% { box-shadow: 0 0 0 12px rgba(255, 100, 100, 0); }
        }
        .dea-inbox-card-er { animation: deaInboxPulseEr 2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .dea-inbox-card-er { animation: none; } }
      `}</style>
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="rounded-full border-2 border-red-200 bg-red-950/60 px-3 py-1 text-xs font-black uppercase tracking-wider">
          {t('doctor_er_strip.ae_alert')}
        </span>
        <span className="rounded-full border-2 border-red-200 bg-red-950/60 px-3 py-1 text-xs font-black uppercase tracking-wider">
          {t('doctor_er_strip.stat')}
        </span>
        {!a.target_doctor_id ? (
          <span className="rounded-full border-2 border-amber-200 bg-amber-950/50 px-3 py-1 text-xs font-black uppercase">
            {t('doctor_er_strip.unassigned')}
          </span>
        ) : null}
      </div>
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-red-100">
        {alertHeadline(t, a.alert_type)}
      </p>
      <h3 className="mb-3 text-2xl font-black text-white">{a.patient_display || '—'}</h3>
      <div className="space-y-1 text-sm font-bold text-red-50">
        <p>
          {t('doctor_er_strip.location')} {a.location_display || 'Emergency / A&E'}
        </p>
        <p>
          {t('doctor_er_strip.ward')} {a.ward_display || '—'} · {t('doctor_er_strip.bed')}{' '}
          {a.bed_display || '—'}
        </p>
        <p>
          {t('doctor_er_strip.complaint')} {a.chief_complaint || '—'}
        </p>
        <p>
          {t('doctor_er_strip.acuity')} {acuity}
          {a.ticket_number ? ` · ${t('doctor_er_strip.ticket')} ${a.ticket_number}` : ''}
        </p>
        <p className="text-xs font-normal text-red-200/80">
          {a.created_at ? new Date(a.created_at).toLocaleString() : ''}
        </p>
      </div>
      <form method="POST" action={`/api/doctor-er-alerts/${a.id}/ack`} className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="_return" value={inboxPath} />
        <button type="submit" name="action" value="open_visit" className="hms-btn hms-btn-primary text-xs">
          {t('doctor_er_strip.open_visit')}
        </button>
        <a href={visitHref} className="hms-btn hms-btn-secondary text-xs">
          {t('doctor_er_inbox.view_chart')}
        </a>
        <button type="submit" name="action" value="seen" className="hms-btn hms-btn-outline-danger text-xs">
          {t('doctor_er_inbox.mark_seen')}
        </button>
      </form>
    </div>
  );
}

function OpdMedAlertCard({ alert: a, inboxPath }) {
  const { t } = useTranslation('clinical');
  const treatmentHref = a.opd_visit_id ? `/opd/treatment/${a.opd_visit_id}` : inboxPath;

  return (
    <div className="dea-inbox-card-opd mb-4 overflow-hidden rounded-2xl border-4 border-amber-300 bg-gradient-to-br from-amber-500 via-yellow-600 to-amber-900 p-5 text-amber-950 shadow-2xl">
      <style>{`
        @keyframes deaInboxPulseOpd {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.55); }
          50% { box-shadow: 0 0 0 12px rgba(251, 191, 36, 0); }
        }
        .dea-inbox-card-opd { animation: deaInboxPulseOpd 2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .dea-inbox-card-opd { animation: none; } }
      `}</style>
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="rounded-full border-2 border-amber-100 bg-amber-800/30 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-50">
          {t('doctor_opd_inbox.opd_alert')}
        </span>
        <span className="rounded-full border-2 border-amber-100 bg-amber-800/30 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-50">
          {t('doctor_opd_inbox.med_given')}
        </span>
      </div>
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-amber-100">
        {t('doctor_opd_inbox.headline')}
      </p>
      <h3 className="mb-3 text-2xl font-black text-white">{a.patient_display || '—'}</h3>
      <div className="space-y-1 text-sm font-bold text-amber-50">
        <p>
          {t('doctor_opd_inbox.drug')} {a.drug_display || '—'}
          {a.dose_display ? ` · ${a.dose_display}` : ''}
        </p>
        <p>
          {t('doctor_opd_inbox.nurse')} {a.nurse_display || '—'}
        </p>
        <p>
          {t('doctor_opd_inbox.visit')}
          {a.visit_department || 'OPD'}
          {a.ticket_number ? ` · ${t('doctor_er_strip.ticket')} ${a.ticket_number}` : ''}
        </p>
        <p className="text-xs font-normal text-amber-100/90">
          {a.created_at ? new Date(a.created_at).toLocaleString() : ''}
        </p>
      </div>
      <form method="POST" action={`/api/doctor-opd-med-alerts/${a.id}/ack`} className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="_return" value={inboxPath} />
        <button type="submit" name="action" value="open_treatment" className="hms-btn hms-btn-primary text-xs">
          {t('doctor_opd_inbox.open_treatment')}
        </button>
        <a href={treatmentHref} className="hms-btn hms-btn-secondary text-xs">
          {t('doctor_opd_inbox.view_treatment')}
        </a>
        <button type="submit" name="action" value="seen" className="hms-btn hms-btn-outline-danger text-xs">
          {t('doctor_er_inbox.mark_seen')}
        </button>
      </form>
    </div>
  );
}

function InboxAlertCard({ alert, inboxPath }) {
  if (alert.inbox_kind === 'opd') {
    return <OpdMedAlertCard alert={alert} inboxPath={inboxPath} />;
  }
  return <ErAlertCard alert={alert} inboxPath={inboxPath} />;
}

function recentSummary(t, a) {
  if (a.inbox_kind === 'opd') {
    return `${t('doctor_opd_inbox.headline')} · ${a.drug_display || '—'} · ${a.nurse_display || '—'}`;
  }
  return `${alertHeadline(t, a.alert_type)} · ${a.location_display || 'ER'} · ${a.ward_display || '—'} / ${a.bed_display || '—'}`;
}

export function DoctorErInboxPageApp({ unacked = [], recent = [], flash, error }) {
  const { t } = useTranslation('clinical');
  const inboxPath = '/portal/doctor/er-alerts';

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="bell" title={t('doctor_er_inbox.title')} subtitle={t('doctor_er_inbox.blurb')}>
          <div className="hms-surface-hero-actions mt-4">
            <a href="/portal/doctor" className="hms-btn-secondary text-xs">
              {t('doctor_er_inbox.back_portal')}
            </a>
            <a href="/emergency" className="hms-btn-outline-danger text-xs">
              {t('doctor_er_inbox.open_er')}
            </a>
            <a href="/opd-queue" className="hms-btn-secondary text-xs">
              {t('doctor_opd_inbox.open_opd')}
            </a>
          </div>
          <div className="hms-surface-hero-chips mt-3">
            <span className="hms-icon-chip">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
              {t('doctor_er_inbox.legend_er')}
            </span>
            <span className="hms-icon-chip">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
              {t('doctor_opd_inbox.legend_opd')}
            </span>
          </div>
        </SurfaceHero>

        <div className="hms-compact-kpi-grid mb-4">
          <StatCard label={t('doctor_er_inbox.needs_attention')} value={unacked.length} tone="danger" icon="exclamation-circle" />
          <StatCard label={t('doctor_er_inbox.recent')} value={recent.length} tone="default" icon="history" />
        </div>

        <h2 className="mb-3 font-bold text-ink">{t('doctor_er_inbox.needs_attention')}</h2>
      {!unacked.length ? (
        <p className="mb-6 rounded-xl border bg-slate-50 p-6 text-center text-slate-500">
          {t('doctor_er_inbox.no_new_alerts')}
        </p>
      ) : (
        unacked.map((a) => <InboxAlertCard key={`${a.inbox_kind}-${a.id}`} alert={a} inboxPath={inboxPath} />)
      )}

      <h2 className="mb-3 mt-8 font-bold">{t('doctor_er_inbox.recent')}</h2>
      {!recent.length ? (
        <p className="text-sm text-slate-400">{t('doctor_er_inbox.no_history')}</p>
      ) : (
        recent.map((a) => (
          <div
            key={`${a.inbox_kind}-${a.id}`}
            className={`mb-2 rounded-xl border p-4 text-sm ${
              a.inbox_kind === 'opd' ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="text-xs text-slate-500">
              {a.created_at ? new Date(a.created_at).toLocaleString() : ''}
              {a.inbox_kind === 'opd' ? (
                <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                  {t('doctor_opd_inbox.opd_alert')}
                </span>
              ) : (
                <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-800">
                  {t('doctor_er_strip.ae_alert')}
                </span>
              )}
            </div>
            <div className="font-bold">{a.patient_display || '—'}</div>
            <div className="text-slate-500">{recentSummary(t, a)}</div>
          </div>
        ))
      )}
      </div>
    </div>
  );
}
