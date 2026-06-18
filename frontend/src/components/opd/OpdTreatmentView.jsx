import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SurfaceHero } from '../SurfaceHero';
import { formatDate } from '../../lib/listUi';
import { confirmModal } from '../../lib/modalBridge';
import { todayIsoDate } from '../../lib/prescriptionDate';
import { IpdPrescriptionList } from '../ipd/IpdPrescriptionList';
import { IpdRxFields } from '../ipd/IpdRxFields';

function patientInitials(visit) {
  const a = (visit.first_name || '?')[0] || '?';
  const b = (visit.last_name || '?')[0] || '?';
  return `${a}${b}`.toUpperCase();
}

function NavPill({ href, icon, label, tone = 'violet' }) {
  const tones = {
    violet: 'border-violet-200 bg-violet-50 text-violet-900 hover:border-violet-500 hover:bg-violet-600 hover:text-white',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900 hover:border-indigo-500 hover:bg-indigo-600 hover:text-white',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-500 hover:bg-emerald-600 hover:text-white',
    sky: 'border-sky-200 bg-sky-50 text-sky-900 hover:border-sky-500 hover:bg-sky-600 hover:text-white'};
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${tones[tone] || tones.violet}`}
    >
      <i className={`fa ${icon}`} aria-hidden="true" />
      {label}
    </a>
  );
}

function SectionCard({ icon, iconBg, title, subtitle, children, border = 'border-violet-200', bg = 'bg-white' }) {
  return (
    <section className={`mb-4 overflow-hidden rounded-2xl border shadow-card ${border} ${bg}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80 px-4 py-3.5 sm:px-5">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base text-white shadow-sm ${iconBg}`}
          >
            <i className={`fa ${icon}`} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 sm:text-lg">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function DoseProgressBar({ given = 0, total = 0, progressLabel = 'Progress' }) {
  const pct = total > 0 ? Math.min(100, Math.round((given / total) * 100)) : 0;
  return (
    <div className="mt-2 max-w-xs">
      <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wide text-emerald-800">
        <span>{progressLabel}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-emerald-200/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function OpdTreatmentView({
  visit = {},
  treatments = [],
  active = null,
  prescriptions = [],
  doseSlots = [],
  canEdit = false,
  canAdminister = false}) {
  const { t } = useTranslation('clinical');
  const [inventory, setInventory] = useState([]);
  const [showAddRx, setShowAddRx] = useState(false);
  const visitId = visit.id;
  const initials = patientInitials(visit);

  useEffect(() => {
    fetch('/api/pharmacy/inventory-for-charge', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => setInventory(Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : []))
      .catch(() => setInventory([]));
  }, []);

  const terminateTreatment = async (ev) => {
    ev.preventDefault();
    const ok = await confirmModal({
      title: t('opd.treatment.terminate_title'),
      message: t('opd.treatment.terminate_confirm'),
      confirmLabel: t('opd.treatment.terminate_btn'),
      tone: 'danger'});
    if (ok) ev.target.submit();
  };

  const treatmentActive = active && active.status === 'active';

  return (
    <div className="opd-treatment-page">
      <SurfaceHero icon="medkit" badge={initials} title={t('opd.treatment.title')} subtitle={`${visit.first_name} ${visit.last_name}`}>
        <div className="hms-surface-hero-chips mt-3">
          <span className="hms-icon-chip">OPD</span>
          {visit.ticket_number ? (
            <span className="hms-icon-chip">
              <i className="fa fa-ticket" aria-hidden="true" />
              {visit.ticket_number}
            </span>
          ) : null}
          <span className="hms-icon-chip">
            <i className="fa fa-user-md" aria-hidden="true" />
            {visit.doctor_name || '—'}
          </span>
          <span className="hms-icon-chip">
            <i className="fa fa-calendar" aria-hidden="true" />
            {visit.visit_date ? formatDate(visit.visit_date) : '—'}
          </span>
          <span className="hms-icon-chip">
            <i className="fa fa-flask" aria-hidden="true" />
            {t('opd.treatment.prescriptions', { count: prescriptions.length })}
          </span>
          <span className="hms-icon-chip">
            <i className={`fa ${treatmentActive ? 'fa-check-circle' : 'fa-pause-circle'}`} aria-hidden="true" />
            {treatmentActive ? t('opd.treatment.active_label', { diagnosis: active.diagnosis }) : t('opd.treatment.no_active')}
          </span>
        </div>
        <div className="hms-surface-hero-actions mt-4">
          <NavPill href={`/opd/chart/${visitId}`} icon="fa-heartbeat" label={t('opd.treatment.drug_chart')} tone="sky" />
          <NavPill
            href={`/consultation-new?patient_id=${visit.patient_id}&visit_id=${visitId}`}
            icon="fa-stethoscope"
            label={t('opd.treatment.consultation')}
            tone="indigo"
          />
          <NavPill href="/cashier" icon="fa-money" label={t('opd.treatment.cashier')} tone="emerald" />
        </div>
      </SurfaceHero>

      {/* Active treatment */}
      {active ? (
        <section className="mb-4 overflow-hidden rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-teal-50/60 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-200/80 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3.5 text-white sm:px-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-lg shadow-sm">
                <i className="fa fa-heartbeat" aria-hidden="true" />
              </span>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-100">{t('opd.treatment.active_banner')}</div>
                <div className="text-lg font-extrabold">{active.diagnosis}</div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
              <i className="fa fa-calendar-check-o" aria-hidden="true" />
              {active.start_date ? formatDate(active.start_date) : '—'}
            </span>
          </div>
          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3 text-sm text-emerald-900">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold">
                <i className="fa fa-medkit" aria-hidden="true" />
                {t('opd.treatment.doses_progress', { given: active.slots_given || 0, total: active.slots_total || 0 })}
              </span>
              {Number(active.alert_on_administer) === 1 ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">
                  <i className="fa fa-bell" aria-hidden="true" />
                  {t('opd.treatment.alerts_on')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                  <i className="fa fa-bell-slash" aria-hidden="true" />
                  {t('opd.treatment.alerts_off')}
                </span>
              )}
            </div>
            {active.slots_total > 0 ? (
              <DoseProgressBar
                given={active.slots_given || 0}
                total={active.slots_total || 0}
                progressLabel={t('opd.treatment.progress_label')}
              />
            ) : null}

            {canEdit ? (
              <form method="POST" action={`/opd/treatment/${active.id}/alerts`} className="mt-4">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-white/80 p-3.5 text-sm shadow-sm transition hover:border-emerald-300 hover:bg-white">
                  <input
                    type="checkbox"
                    name="alert_on_administer"
                    value="1"
                    defaultChecked={Number(active.alert_on_administer) === 1}
                    className="mt-1 h-4 w-4 accent-emerald-600"
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  />
                  <span>
                    <span className="flex items-center gap-2 font-bold text-emerald-900">
                      <i className="fa fa-bell text-amber-600" aria-hidden="true" />
                      {t('opd.treatment.alert_on_administer')}
                    </span>
                    <span className="mt-1 block text-xs text-emerald-800">{t('opd.treatment.alert_on_administer_hint')}</span>
                    {Number(active.alert_on_administer) === 1 ? (
                      <a
                        href="/portal/doctor/er-alerts"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-800 underline"
                      >
                        <i className="fa fa-inbox" aria-hidden="true" />
                        {t('opd.treatment.inbox_link')}
                      </a>
                    ) : null}
                  </span>
                </label>
              </form>
            ) : (
              <div className="mt-3 text-sm text-emerald-800">
                {Number(active.alert_on_administer) === 1 ? (
                  <a href="/portal/doctor/er-alerts" className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 underline">
                    <i className="fa fa-inbox" aria-hidden="true" />
                    {t('opd.treatment.inbox_link')}
                  </a>
                ) : null}
              </div>
            )}

            {canEdit ? (
              <form method="POST" action={`/opd/treatment/${active.id}/terminate`} className="mt-4" onSubmit={terminateTreatment}>
                <input type="hidden" name="reason" value="Completed per doctor" />
                <button
                  type="submit"
                  className="hms-btn hms-btn-outline-danger hms-btn-sm"
                >
                  <i className="fa fa-stop-circle" aria-hidden="true" />
                  {t('opd.treatment.terminate')}
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : canEdit ? (
        <SectionCard
          icon="fa-plus-circle"
          iconBg="bg-gradient-to-br from-violet-500 to-indigo-600"
          title={t('opd.treatment.start_treatment')}
          subtitle={t('opd.treatment.no_active')}
          border="border-violet-200"
          bg="bg-gradient-to-br from-violet-50/50 via-white to-indigo-50/30"
        >
          <form method="POST" action="/opd/treatment/create">
            <input type="hidden" name="opd_visit_id" value={visitId} />
            <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-violet-900">
              <i className="fa fa-stethoscope text-violet-500" aria-hidden="true" />
              {t('opd.treatment.diagnosis_label')}
            </label>
            <input
              name="diagnosis"
              className="hms-input mb-4 w-full border-violet-200 focus:border-violet-500"
              required
              placeholder={t('opd.treatment.diagnosis_ph')}
            />
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <i className="fa fa-calendar text-violet-500" aria-hidden="true" />
                  {t('opd.treatment.treatment_start')}
                </label>
                <input
                  type="date"
                  name="start_date"
                  className="hms-input w-full border-violet-200"
                  defaultValue={todayIsoDate()}
                  required
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <i className="fa fa-clock-o text-violet-500" aria-hidden="true" />
                  {t('opd.treatment.est_duration_days')}
                </label>
                <input
                  type="number"
                  name="est_duration_days"
                  min="1"
                  max="365"
                  className="hms-input w-full border-violet-200"
                  placeholder="7"
                />
              </div>
            </div>
            <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-sm">
              <input type="checkbox" name="alert_on_administer" value="1" className="mt-1 h-4 w-4 accent-amber-600" />
              <span>
                <span className="flex items-center gap-2 font-bold text-amber-950">
                  <i className="fa fa-bell" aria-hidden="true" />
                  {t('opd.treatment.alert_on_administer')}
                </span>
                <span className="mt-1 block text-xs text-amber-800">{t('opd.treatment.alert_on_administer_hint')}</span>
              </span>
            </label>
            <button
              type="submit"
              className="hms-btn hms-btn-action-start"
            >
              <i className="fa fa-play-circle" aria-hidden="true" />
              {t('opd.treatment.start_btn')}
            </button>
          </form>
        </SectionCard>
      ) : (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          <i className="fa fa-info-circle text-lg text-slate-400" aria-hidden="true" />
          {t('opd.treatment.no_active')}
        </div>
      )}

      {/* Prescriptions */}
      <SectionCard
        icon="fa-flask"
        iconBg="bg-gradient-to-br from-indigo-500 to-violet-600"
        title={t('opd.treatment.prescriptions', { count: prescriptions.length })}
        subtitle={t('opd.treatment.bill_hint')}
        border="border-indigo-200"
        bg="bg-gradient-to-br from-indigo-50/40 via-white to-violet-50/20"
      >
        <div className="mb-4 flex flex-wrap justify-end">
          {canEdit && treatmentActive ? (
            <button
              type="button"
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold shadow-sm transition hover:-translate-y-0.5 ${
                showAddRx
                  ? 'border border-slate-300 bg-slate-100 text-slate-700'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:shadow-md'
              }`}
              onClick={() => setShowAddRx((v) => !v)}
            >
              <i className={`fa ${showAddRx ? 'fa-times' : 'fa-plus'}`} aria-hidden="true" />
              {showAddRx ? t('opd.treatment.cancel_add') : t('opd.treatment.add_prescription')}
            </button>
          ) : null}
        </div>

        {showAddRx && active ? (
          <form
            method="POST"
            action="/opd/prescription/add"
            className="mb-4 overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/50 p-4 shadow-sm"
          >
            <input type="hidden" name="treatment_id" value={active.id} />
            <p className="mb-3 flex items-start gap-2 text-xs font-semibold text-emerald-900">
              <i className="fa fa-lightbulb-o mt-0.5 text-amber-600" aria-hidden="true" />
              {t('opd.treatment.add_rx_hint')}
            </p>
            <IpdRxFields inventory={inventory} prefix="opd-add-" />
            <button
              type="submit"
              className="hms-btn hms-btn-action-save mt-3"
            >
              <i className="fa fa-save" aria-hidden="true" />
              {t('opd.treatment.save_prescription')}
            </button>
          </form>
        ) : null}

        {!treatmentActive && prescriptions.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-6 py-10 text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-2xl text-indigo-500">
              <i className="fa fa-medkit" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-indigo-900">{t('opd.treatment.no_active')}</p>
          </div>
        ) : (
          <IpdPrescriptionList
            prescriptions={prescriptions}
            canEdit={canEdit}
            inventory={inventory}
            treatmentActive={!!treatmentActive}
            routePrefix="/opd"
          />
        )}
      </SectionCard>

      {/* Administration schedule */}
      {active && doseSlots.length > 0 ? (
        <SectionCard
          icon="fa-calendar-check-o"
          iconBg="bg-gradient-to-br from-sky-500 to-blue-600"
          title={t('opd.treatment.protocol_title')}
          subtitle={t('opd.treatment.protocol_hint')}
          border="border-sky-200"
          bg="bg-gradient-to-br from-sky-50/50 via-white to-blue-50/30"
        >
          <div className="max-h-72 overflow-y-auto rounded-xl border border-sky-100 bg-white/80">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gradient-to-r from-sky-100 to-blue-50 text-xs uppercase tracking-wide text-sky-800">
                <tr>
                  <th className="px-3 py-2.5 font-bold">
                    <i className="fa fa-clock-o mr-1" aria-hidden="true" />
                    {t('opd.treatment.col_when')}
                  </th>
                  <th className="px-3 py-2.5 font-bold">
                    <i className="fa fa-flask mr-1" aria-hidden="true" />
                    {t('opd.treatment.col_drug')}
                  </th>
                  <th className="px-3 py-2.5 font-bold">
                    <i className="fa fa-flag mr-1" aria-hidden="true" />
                    {t('opd.treatment.col_status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {doseSlots.slice(0, 40).map((s) => (
                  <tr key={s.id} className="border-b border-sky-50 transition hover:bg-sky-50/50">
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-700">{formatDate(s.scheduled_at)}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-slate-900">{s.drug_name}</span>
                      <span className="ml-1 text-slate-500">{s.dosage}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {s.administered ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          <i className="fa fa-check" aria-hidden="true" />
                          {t('opd.treatment.given')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                          <i className="fa fa-hourglass-half" aria-hidden="true" />
                          {t('opd.treatment.pending')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canAdminister ? (
            <a
              href={`/opd/chart/${visitId}`}
              className="hms-btn hms-btn-primary hms-btn-sm mt-4"
            >
              <i className="fa fa-heartbeat" aria-hidden="true" />
              {t('opd.treatment.open_chart')}
            </a>
          ) : null}
        </SectionCard>
      ) : null}
    </div>
  );
}
