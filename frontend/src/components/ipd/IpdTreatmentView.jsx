import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/listUi';
import { confirmModal } from '../../lib/modalBridge';
import { todayIsoDate } from '../../lib/prescriptionDate';
import { IpdAdminProtocol } from './IpdAdminProtocol';
import { IpdPrescriptionList } from './IpdPrescriptionList';
import { IpdRxFields } from './IpdRxFields';

function patientInitials(admission) {
  const a = (admission.first_name || '?')[0] || '?';
  const b = (admission.last_name || '?')[0] || '?';
  return `${a}${b}`.toUpperCase();
}

function NavPill({ href, icon, label, tone = 'amber' }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-500 hover:bg-amber-600 hover:text-white',
    sky: 'border-sky-200 bg-sky-50 text-sky-900 hover:border-sky-500 hover:bg-sky-600 hover:text-white',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900 hover:border-indigo-500 hover:bg-indigo-600 hover:text-white',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-500 hover:bg-emerald-600 hover:text-white'};
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${tones[tone] || tones.amber}`}
    >
      <i className={`fa ${icon}`} aria-hidden="true" />
      {label}
    </a>
  );
}

function SectionCard({ icon, iconBg, title, subtitle, children, border = 'border-amber-200', bg = 'bg-white' }) {
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

export function IpdTreatmentView({
  admission = {},
  treatments = [],
  active = null,
  prescriptions = [],
  doseSlots = [],
  canEdit = false,
  canAdminister = false,
  maternityContext = null}) {
  const { t } = useTranslation('ipd');
  const [inventory, setInventory] = useState([]);
  const [showAddRx, setShowAddRx] = useState(false);
  const admissionId = admission.id;
  const initials = patientInitials(admission);

  useEffect(() => {
    fetch('/api/pharmacy/inventory-for-charge', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => setInventory(Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : []))
      .catch(() => setInventory([]));
  }, []);

  const terminateTreatment = async (ev) => {
    ev.preventDefault();
    const ok = await confirmModal({
      title: t('treatment.terminate_title'),
      message: t('treatment.terminate_confirm'),
      confirmLabel: t('treatment.terminate_btn'),
      tone: 'danger'});
    if (ok) ev.target.submit();
  };

  const treatmentActive = active && active.status === 'active';
  const wardLabel = [admission.ward_name, admission.bed_label].filter(Boolean).join(' · ');

  return (
    <div className="ipd-treatment-page">
      {maternityContext ? (
        <div className="mb-4 rounded-2xl border border-pink-300 bg-gradient-to-r from-pink-50 to-rose-50 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-pink-950">
              <i className="fa fa-female mr-2 text-pink-600" aria-hidden="true" />
              <span className="font-bold">
                {maternityContext.kind === 'baby'
                  ? t('treatment.maternity_baby_banner', {
                      neonatal: maternityContext.neonatal_number || '',
                      mother: maternityContext.mother_name || ''})
                  : maternityContext.kind === 'mother_anc'
                    ? t('treatment.maternity_anc_banner', { number: maternityContext.antenatal_number || '' })
                    : t('treatment.maternity_mother_banner', {
                        number: maternityContext.antenatal_number || '',
                        status: maternityContext.labor_status || ''})}
              </span>
            </div>
            {maternityContext.chart_url ? (
              <a href={maternityContext.chart_url} className="rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-pink-700">
                {t('treatment.open_maternity_chart')}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
      {/* Hero header */}
      <div className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-800 via-amber-700 to-orange-800 text-white shadow-lg">
        <div className="relative p-5 sm:p-6">
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl font-black text-white shadow-inner ring-2 ring-white/25">
                {initials}
              </div>
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-100">
                    <i className="fa fa-hospital-o" aria-hidden="true" />
                    {t('treatment.ipd_badge')}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-400/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                    <i className="fa fa-hashtag" aria-hidden="true" />
                    {admissionId}
                  </span>
                </div>
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">{t('pages.treatment_title')}</h1>
                <p className="mt-0.5 text-sm font-semibold text-amber-100">
                  {admission.first_name} {admission.last_name}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <NavPill href={`/ipd/chart/${admissionId}`} icon="fa-heartbeat" label={t('treatment.drug_chart')} tone="sky" />
              <NavPill href={`/ipd/audit/${admissionId}`} icon="fa-history" label={t('treatment.audit_trail')} tone="indigo" />
              <NavPill href={`/ipd/running-bill/${admissionId}`} icon="fa-money" label={t('pages.running_bill_label')} tone="emerald" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-amber-900/40 text-center text-[11px] font-bold sm:grid-cols-4">
          <div className="bg-amber-900/30 px-3 py-2.5">
            <i className="fa fa-bed mr-1 text-amber-300" aria-hidden="true" />
            {wardLabel || '—'}
          </div>
          <div className="bg-amber-900/30 px-3 py-2.5">
            <i className="fa fa-user-md mr-1 text-amber-300" aria-hidden="true" />
            {admission.doctor_name || '—'}
          </div>
          <div className="bg-amber-900/30 px-3 py-2.5">
            <i className="fa fa-flask mr-1 text-amber-300" aria-hidden="true" />
            {t('pages.prescriptions', { count: prescriptions.length })}
          </div>
          <div className="bg-amber-900/30 px-3 py-2.5">
            <i
              className={`fa mr-1 ${treatmentActive ? 'fa-check-circle text-emerald-300' : 'fa-pause-circle text-amber-300'}`}
              aria-hidden="true"
            />
            {treatmentActive ? t('pages.active_label', { diagnosis: active.diagnosis }) : t('treatment.no_active')}
          </div>
        </div>
      </div>

      {/* Active treatment */}
      {active ? (
        <section className="mb-4 overflow-hidden rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-teal-50/60 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-200/80 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3.5 text-white sm:px-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-lg shadow-sm">
                <i className="fa fa-heartbeat" aria-hidden="true" />
              </span>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-100">
                  {t('treatment.active_banner')}
                </div>
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
                {t('treatment.doses_progress', { given: active.slots_given || 0, total: active.slots_total || 0 })}
              </span>
            </div>
            {active.slots_total > 0 ? (
              <DoseProgressBar
                given={active.slots_given || 0}
                total={active.slots_total || 0}
                progressLabel={t('treatment.progress_label')}
              />
            ) : null}
            {canEdit ? (
              <form
                method="POST"
                action={`/ipd/treatment/${active.id}/terminate`}
                className="mt-4"
                onSubmit={terminateTreatment}
              >
                <input type="hidden" name="reason" value="Completed per doctor" />
                <button
                  type="submit"
                  className="hms-btn hms-btn-outline-danger hms-btn-sm"
                >
                  <i className="fa fa-stop-circle" aria-hidden="true" />
                  {t('pages.terminate')}
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : canEdit ? (
        <SectionCard
          icon="fa-plus-circle"
          iconBg="bg-gradient-to-br from-amber-500 to-orange-600"
          title={t('pages.start_treatment')}
          subtitle={t('treatment.no_active')}
          border="border-amber-200"
          bg="bg-gradient-to-br from-amber-50/50 via-white to-orange-50/30"
        >
          <form method="POST" action="/ipd/treatment/create">
            <input type="hidden" name="admission_id" value={admissionId} />
            <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-950">
              <i className="fa fa-stethoscope text-amber-600" aria-hidden="true" />
              {t('treatment.diagnosis_label')}
            </label>
            <input
              name="diagnosis"
              className="hms-input mb-4 w-full border-amber-200 focus:border-amber-500"
              required
              placeholder={t('treatment.diagnosis_ph')}
            />
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <i className="fa fa-calendar text-amber-600" aria-hidden="true" />
                  {t('charge_modal.treatment_start')}
                </label>
                <input
                  type="date"
                  name="start_date"
                  className="hms-input w-full border-amber-200"
                  defaultValue={todayIsoDate()}
                  required
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <i className="fa fa-clock-o text-amber-600" aria-hidden="true" />
                  {t('treatment.est_duration_days')}
                </label>
                <input
                  type="number"
                  name="est_duration_days"
                  min="1"
                  max="365"
                  className="hms-input w-full border-amber-200"
                  placeholder="7"
                />
              </div>
            </div>
            <button
              type="submit"
              className="hms-btn hms-btn-action-start"
            >
              <i className="fa fa-play-circle" aria-hidden="true" />
              {t('pages.start_btn')}
            </button>
          </form>
        </SectionCard>
      ) : (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-4 py-5 text-sm text-amber-900">
          <i className="fa fa-info-circle text-lg text-amber-500" aria-hidden="true" />
          {t('treatment.no_active')}
        </div>
      )}

      {/* Prescriptions */}
      <SectionCard
        icon="fa-flask"
        iconBg="bg-gradient-to-br from-indigo-500 to-violet-600"
        title={t('pages.prescriptions', { count: prescriptions.length })}
        subtitle={t('treatment.select_rx_list_hint')}
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
              {showAddRx ? t('treatment.cancel_add') : t('treatment.add_prescription')}
            </button>
          ) : null}
        </div>

        {showAddRx && active ? (
          <form
            method="POST"
            action="/ipd/prescription/add"
            className="mb-4 overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/50 p-4 shadow-sm"
          >
            <input type="hidden" name="treatment_id" value={active.id} />
            <p className="mb-3 flex items-start gap-2 text-xs font-semibold text-emerald-900">
              <i className="fa fa-lightbulb-o mt-0.5 text-amber-600" aria-hidden="true" />
              {t('treatment.add_rx_hint')}
            </p>
            <IpdRxFields inventory={inventory} prefix="add-" />
            <button
              type="submit"
              className="hms-btn hms-btn-action-save mt-3"
            >
              <i className="fa fa-save" aria-hidden="true" />
              {t('treatment.save_prescription')}
            </button>
          </form>
        ) : null}

        <IpdPrescriptionList
          prescriptions={prescriptions}
          canEdit={canEdit}
          inventory={inventory}
          treatmentActive={!!treatmentActive}
        />
      </SectionCard>

      {active && doseSlots.length > 0 ? (
        <IpdAdminProtocol
          doseSlots={doseSlots}
          prescriptions={prescriptions}
          inventory={inventory}
          canEdit={canEdit}
          canAdminister={canAdminister}
          treatmentActive={!!treatmentActive}
          returnTo="treatment"
        />
      ) : null}

      {treatments.length > 1 ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <i className="fa fa-folder-open text-amber-600" aria-hidden="true" />
          {t('pages.episodes', { count: treatments.length })}
        </div>
      ) : null}
    </div>
  );
}
