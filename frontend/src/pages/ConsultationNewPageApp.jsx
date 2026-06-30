import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogOrderPicker } from '../components/CatalogOrderPicker';
import { CustomCatalogRows } from '../components/CustomCatalogRows';
import { formatMoney, priceUnitLabel } from '../lib/hmsLocale';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { SoapPlanField } from '../components/SoapPlanField';
import { SoapPickField } from '../components/SoapPickField';
import {
  SOAP_ASSESSMENT_DIAGNOSIS,
  SOAP_CHIEF_COMPLAINTS,
  SOAP_EXAMINATION_OBJECTIVE,
  SOAP_HISTORY_SUBJECTIVE} from '../lib/soapClinicalCatalog';
import { postForm } from '../lib/listUi';
import { confirmModal } from '../lib/modalBridge';
import {
  ConsultationPrescriptionSection,
  initialMedRows,
  validateMedicationRows} from '../components/consultation/ConsultationPrescriptionSection';

const MED_DOSAGE_VALUES = [
  { value: '1 tab', key: 'dosage_1_tab' },
  { value: '2 tabs', key: 'dosage_2_tabs' },
  { value: '5 mg', key: 'dosage_5_mg' },
  { value: '10 mg', key: 'dosage_10_mg' },
  { value: '25 mg', key: 'dosage_25_mg' },
  { value: '50 mg', key: 'dosage_50_mg' },
  { value: '100 mg', key: 'dosage_100_mg' },
  { value: '250 mg', key: 'dosage_250_mg' },
  { value: '500 mg', key: 'dosage_500_mg' },
  { value: '1 g', key: 'dosage_1_g' },
  { value: '5 ml', key: 'dosage_5_ml' },
  { value: '10 ml', key: 'dosage_10_ml' },
  { value: '1 ampoule', key: 'dosage_1_ampoule' },
];

const MED_FREQUENCY_VALUES = [
  { value: 'Only Once', key: 'freq_only_once' },
  { value: 'Once daily', key: 'freq_once_daily' },
  { value: 'Twice daily', key: 'freq_twice_daily' },
  { value: 'Three times daily', key: 'freq_three_daily' },
  { value: 'Four times daily', key: 'freq_four_daily' },
  { value: 'Every 6 hours', key: 'freq_every_6h' },
  { value: 'Every 4 hours', key: 'freq_every_4h' },
  { value: 'STAT', key: 'freq_stat' },
  { value: 'PRN', key: 'freq_prn' },
];

const MED_TIMING_VALUES = [
  { value: 'Before meals', key: 'timing_before_meals' },
  { value: 'After meals', key: 'timing_after_meals' },
  { value: 'With meals', key: 'timing_with_meals' },
  { value: 'Morning', key: 'timing_morning' },
  { value: 'Afternoon', key: 'timing_afternoon' },
  { value: 'Evening', key: 'timing_evening' },
  { value: 'Night', key: 'timing_night' },
  { value: 'Empty stomach', key: 'timing_empty_stomach' },
];

const NEXT_CONSULTATION_VALUES = [
  { value: '1 week', key: 'interval_1_week' },
  { value: '2 weeks', key: 'interval_2_weeks' },
  { value: '3 weeks', key: 'interval_3_weeks' },
  { value: '1 month', key: 'interval_1_month' },
  { value: '2 months', key: 'interval_2_months' },
  { value: '3 months', key: 'interval_3_months' },
  { value: '6 months', key: 'interval_6_months' },
  { value: '1 year', key: 'interval_1_year' },
];

const inputClass = 'consult-mocdoc-field';
const selectClass = 'consult-mocdoc-field';
const lockedInputClass = 'consult-mocdoc-field consult-mocdoc-field--locked';

function useConsultationMedOptions(t) {
  return useMemo(
    () => ({
      dosage: MED_DOSAGE_VALUES.map(({ value, key }) => ({
        value,
        label: t(`consultation.${key}`)})),
      frequency: MED_FREQUENCY_VALUES.map(({ value, key }) => ({
        value,
        label: t(`consultation.${key}`)})),
      timing: MED_TIMING_VALUES.map(({ value, key }) => ({
        value,
        label: t(`consultation.${key}`)})),
      nextConsult: NEXT_CONSULTATION_VALUES.map(({ value, key }) => ({
        value,
        label: t(`consultation.${key}`)}))}),
    [t]
  );
}

function normalizeVitals(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    bpSys: raw.blood_pressure_systolic ?? raw.bp_sys ?? raw.bp_systolic ?? '',
    bpDia: raw.blood_pressure_diastolic ?? raw.bp_dia ?? raw.bp_diastolic ?? '',
    pulse: raw.pulse ?? raw.heart_rate ?? '',
    temp: raw.temperature ?? raw.temp_c ?? raw.temp_celsius ?? '',
    spo2: raw.spo2 ?? '',
    weight: raw.weight ?? raw.weight_kg ?? ''};
}

function parseMeds(editRow) {
  try {
    const list = JSON.parse(editRow?.medications_json || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function soapDefaults(editRow, editObservations) {
  const obs = editObservations && typeof editObservations === 'object' ? editObservations : {};
  return {
    chief: editRow?.chief_complaint || obs.chief_complaint || '',
    history: obs.history || editRow?.investigations || '',
    examination: obs.examination || editRow?.advice || '',
    diagnosis: editRow?.diagnosis || obs.diagnosis || '',
    plan: editRow?.assessment || obs.treatment_plan || '',
    referral: editRow?.referral_to || obs.referral_to || '',
    fee: editRow?.consult_fee_xaf ?? ''};
}

function followUpDefaults(editObservations) {
  const obs = editObservations && typeof editObservations === 'object' ? editObservations : {};
  const flag = obs.followup_visit_requested;
  const followupRequested =
    flag === true ||
    flag === 1 ||
    flag === '1' ||
    String(flag || '').toLowerCase() === 'true' ||
    String(flag || '').toLowerCase() === 'on';
  let followUpDate = String(obs.follow_up_date || '').trim();
  if (followUpDate && followUpDate.includes('/')) {
    const parts = followUpDate.split(/[/-]/);
    if (parts.length === 3 && parts[2].length === 4) {
      followUpDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return {
    nextConsultation: obs.next_consultation || '',
    emptyStomach: obs.empty_stomach || '',
    followUpDate,
    followupRequested};
}

function normalizeNextConsultValue(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  const key = v.toLowerCase();
  const hit = NEXT_CONSULTATION_VALUES.find((o) => o.value === key);
  return hit ? hit.value : v;
}

function pickOptionValue(value, options) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (options.some((o) => o.value === v)) return v;
  return v;
}

function MedPickSelect({ name, value, placeholder, options }) {
  const v = pickOptionValue(value, options);
  const hasCustom = v && !options.some((o) => o.value === v);

  return (
    <select name={name} className={selectClass} defaultValue={hasCustom ? v : v || ''}>
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
      {hasCustom ? <option value={v}>{v}</option> : null}
    </select>
  );
}

function FieldLabel({ children, required }) {
  return (
    <label className="consult-mocdoc-label">
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

function SectionCard({ icon, title, action, children, flush = false, className = '' }) {
  return (
    <div className={`consult-mocdoc-section ${className}`}>
      <div className="consult-mocdoc-section-head">
        <h2 className="consult-mocdoc-section-title">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <div className={`consult-mocdoc-section-body${flush ? ' consult-mocdoc-section-body--flush' : ''}`}>{children}</div>
    </div>
  );
}


export function ConsultationNewPageApp({
  patient = null,
  opdVisit = null,
  visitId = null,
  patientGender = '',
  patientAge = '',
  vitals = null,
  labCatalog = [],
  radCatalog = [],
  pharmacyCatalog = [],
  editId = null,
  editRow = null,
  editObservations = null,
  existingLabIds = [],
  existingRadIds = [],
  existingLabCustom = [],
  existingRadCustom = [],
  consultPaymentBlocked = false,
  consultPaymentError = '',
  admitOrderBlocked = false,
  autoDoctorName = '',
  autoConsultType = '',
  autoConsultFee = '',
  flash = null,
  error = null}) {
  const { t } = useTranslation('clinical');
  const medOptions = useConsultationMedOptions(t);
  const existingMeds = useMemo(() => parseMeds(editRow), [editRow]);
  const [medRows, setMedRows] = useState(() => initialMedRows(existingMeds, pharmacyCatalog));
  const [medError, setMedError] = useState('');

  if (!patient || !visitId) {
    return (
      <div className="page-wrapper hms-surface-module">
        <div className="px-4 py-16 text-center sm:px-6">
          <p className="text-sm text-slate-500">{t('consultation.select_patient_hint')}</p>
          <a href="/opd-queue" className="hms-btn-primary mt-4 inline-flex text-sm">
            {t('consultation.opd_queue_link')}
          </a>
        </div>
      </div>
    );
  }

  const blocked = consultPaymentBlocked;
  const v = normalizeVitals(vitals);
  const soap = soapDefaults(editRow, editObservations);
  const followUp = followUpDefaults(editObservations);
  const lockedReferral = autoDoctorName || soap.referral || '';
  const lockedFee =
    autoConsultFee != null && autoConsultFee !== ''
      ? autoConsultFee
      : soap.fee != null && soap.fee !== ''
        ? soap.fee
        : '';
  const nextConsultValue = normalizeNextConsultValue(followUp.nextConsultation);
  const hasCustomNextConsult =
    nextConsultValue && !NEXT_CONSULTATION_VALUES.some((o) => o.value === nextConsultValue.toLowerCase());

  const initials = `${(patient.first_name || '?')[0] || ''}${(patient.last_name || '')[0] || ''}`.toUpperCase();
  const patientLabel = [
    patientAge && t('consultation.patient_years', { age: patientAge }),
    patientGender,
    patient.patient_code || `P-${String(patient.id).padStart(5, '0')}`,
  ]
    .filter(Boolean)
    .join(' • ');
  const visitStarted = opdVisit?.created_at
    ? new Date(opdVisit.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  const handleSubmit = (e) => {
    setMedError('');
    if (blocked) {
      e.preventDefault();
      return;
    }
    const err = validateMedicationRows(e.currentTarget, t);
    if (err) {
      e.preventDefault();
      setMedError(err);
    }
  };

  const dash = '—';
  const vitalsBar = [
    [t('consultation.vital_bp'), `${v?.bpSys || dash}/${v?.bpDia || dash}`],
    [t('consultation.vital_pulse'), v?.pulse ? t('consultation.vital_pulse_value', { value: v.pulse }) : dash],
    [t('consultation.vital_temp'), v?.temp ? t('consultation.vital_temp_value', { value: v.temp }) : dash],
    [t('consultation.vital_spo2'), v?.spo2 ? t('consultation.vital_spo2_value', { value: v.spo2 }) : dash],
    [t('consultation.vital_weight'), v?.weight ? t('consultation.vital_weight_value', { value: v.weight }) : dash],
  ];
  const hasAnyVitals = Boolean(v?.bpSys || v?.bpDia || v?.pulse || v?.temp || v?.spo2 || v?.weight);
  const vitalsRecordedCount = [v?.bpSys || v?.bpDia, v?.pulse, v?.temp, v?.spo2, v?.weight].filter(Boolean).length;

  const requestRetakeVitals = async () => {
    const ok = await confirmModal({
      title: t('consultation.retake_vitals'),
      message: t('consultation.retake_vitals_confirm'),
      confirmLabel: t('consultation.retake_vitals')});
    if (!ok) return;
    postForm('/consultation-new/retake-vitals', {
      patient_id: patient.id,
      opd_visit_id: visitId});
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
      <FlashMessages flash={flash} error={error} />

      {blocked ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>{t('consultation.payment_required')}</strong>{' '}
          {consultPaymentError || t('consultation.payment_validate')}
        </div>
      ) : null}

      <SurfaceHero
        badge={initials}
        title={`${patient.first_name} ${patient.last_name}`}
        subtitle={patientLabel}
      >
        {visitStarted ? (
          <p className="mt-1 text-sm opacity-90">
            {t('consultation.started', { time: visitStarted })}
          </p>
        ) : null}
        <div className="hms-surface-hero-chips mt-3">
          <span className="hms-icon-chip">
            <i className="fa fa-clock-o" aria-hidden="true" />
            {t('consultation.opd_visit', { id: visitId })}
          </span>
          {vitalsBar.map(([label, value]) => (
            <span key={label} className="hms-icon-chip">
              {label}: {value}
            </span>
          ))}
        </div>
        {hasAnyVitals && !blocked ? (
          <div className="hms-surface-hero-actions mt-4">
            <button
              type="button"
              onClick={requestRetakeVitals}
              className="hms-btn-secondary text-xs"
              title={t('consultation.retake_vitals_hint')}
            >
              <i className="fa fa-refresh" aria-hidden="true" />
              {t('consultation.retake_vitals')}
            </button>
            <a href="/opd-queue" className="hms-btn-secondary text-xs">
              {t('consultation.opd_queue_link')}
            </a>
          </div>
        ) : null}
      </SurfaceHero>

      <div className="hms-compact-kpi-grid hms-compact-kpi-grid--3 mb-3">
        <StatCard label={t('consultation.stat_visit')} value={visitId} tone="brand" icon="ticket" />
        <StatCard
          label={t('consultation.stat_vitals')}
          value={`${vitalsRecordedCount}/5`}
          hint={hasAnyVitals ? t('consultation.stat_vitals_ok') : t('consultation.stat_vitals_missing')}
          tone={hasAnyVitals ? 'brand' : 'warning'}
          icon="heartbeat"
        />
        <StatCard
          label={t('consultation.stat_mode')}
          value={editId ? t('consultation.update') : t('consultation.stat_mode_new')}
          tone="default"
          icon="edit"
        />
      </div>

      <form method="POST" action="/consultation-new" id="consultationForm" onSubmit={handleSubmit}>
        <input type="hidden" name="patient_id" value={patient.id} />
        <input type="hidden" name="opd_visit_id" value={visitId} />
        {editId ? <input type="hidden" name="edit_id" value={editId} /> : null}

        <div className="consult-mocdoc">
          <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
            <div className="flex flex-col gap-0 lg:col-span-8">
              <SectionCard icon={<i className="fa fa-edit" aria-hidden />} title={t('consultation.soap_title')}>
                <SoapPickField
                  label={t('consultation.chief_complaint')}
                  name="chief_complaint"
                  catalog={SOAP_CHIEF_COMPLAINTS}
                  rows={2}
                  required
                  placeholder={t('consultation.chief_ph')}
                  defaultValue={soap.chief}
                />
                <SoapPickField
                  label={t('consultation.history')}
                  name="history"
                  catalog={SOAP_HISTORY_SUBJECTIVE}
                  rows={3}
                  placeholder={t('consultation.history_ph')}
                  defaultValue={soap.history}
                />
                <SoapPickField
                  label={t('consultation.examination')}
                  name="examination"
                  catalog={SOAP_EXAMINATION_OBJECTIVE}
                  rows={3}
                  placeholder={t('consultation.examination_ph')}
                  defaultValue={soap.examination}
                />
                <SoapPickField
                  label={t('consultation.diagnosis')}
                  name="diagnosis"
                  catalog={SOAP_ASSESSMENT_DIAGNOSIS}
                  rows={2}
                  placeholder={t('consultation.diagnosis_ph')}
                  defaultValue={soap.diagnosis}
                />
                <SoapPlanField label={t('consultation.plan')} name="treatment_plan" defaultValue={soap.plan} />
              </SectionCard>

              <SectionCard
                icon={<i className="fa fa-medkit" aria-hidden />}
                title={t('consultation.medications')}
                flush
                className="mb-0"
              >
                <div className="p-3">
                <ConsultationPrescriptionSection
                  medRows={medRows}
                  setMedRows={setMedRows}
                  pharmacyCatalog={pharmacyCatalog}
                  medOptions={medOptions}
                  patientAge={patientAge}
                  patientGender={patientGender}
                  medError={medError}
                  visitId={visitId}
                />
                <p className="mt-2 text-xs text-slate-600">{t('consultation.meds_custom_hint')}</p>
                </div>
              </SectionCard>
            </div>

            <div className="flex flex-col gap-0 lg:col-span-4">
              <SectionCard icon={<i className="fa fa-list" aria-hidden />} title={t('consultation.orders_title')}>
                <div className="consult-mocdoc-order">
                  <CatalogOrderPicker
                    name="lab_catalog_id[]"
                    catalog={labCatalog}
                    initialIds={existingLabIds}
                    theme="lab"
                    iconLetter="L"
                    title={t('consultation.lab_tests')}
                    addLabel={t('consultation.lab_add_hint')}
                    hint={t('consultation.lab_order_hint')}
                    placeholder={t('consultation.catalog_search_ph')}
                    emptyMessage={
                      labCatalog.length ? t('consultation.catalog_no_match') : t('consultation.no_catalog_items')
                    }
                    priceLabel={priceUnitLabel()}
                    inputClassName={inputClass}
                  />
                  <CustomCatalogRows
                    name="lab_custom_name[]"
                    theme="lab"
                    title={t('consultation.custom_lab_section')}
                    fieldLabel={t('consultation.custom_lab_field')}
                    placeholder={t('consultation.custom_lab_field_ph')}
                    hint={t('consultation.custom_lab_field_hint')}
                    addLabel={t('consultation.custom_lab_add')}
                    initialNames={existingLabCustom}
                    inputClassName={inputClass}
                    t={t}
                  />
                </div>
                <div className="consult-mocdoc-order">
                  <CatalogOrderPicker
                    name="rad_catalog_id[]"
                    catalog={radCatalog}
                    initialIds={existingRadIds}
                    theme="radiology"
                    iconLetter="R"
                    title={t('consultation.radiology')}
                    addLabel={t('consultation.rad_add_hint')}
                    hint={t('consultation.rad_order_hint')}
                    placeholder={t('consultation.catalog_search_ph')}
                    emptyMessage={
                      radCatalog.length ? t('consultation.catalog_no_match') : t('consultation.no_catalog_items')
                    }
                    priceLabel={priceUnitLabel()}
                    inputClassName={inputClass}
                  />
                  <CustomCatalogRows
                    name="rad_custom_name[]"
                    theme="radiology"
                    title={t('consultation.custom_rad_section')}
                    fieldLabel={t('consultation.custom_rad_field')}
                    placeholder={t('consultation.custom_rad_field_ph')}
                    hint={t('consultation.custom_rad_field_hint')}
                    addLabel={t('consultation.custom_rad_add')}
                    initialNames={existingRadCustom}
                    inputClassName={inputClass}
                    t={t}
                  />
                </div>
              </SectionCard>

              <SectionCard icon={<i className="fa fa-user-md" aria-hidden />} title={t('consultation.referral_title')}>
                <div className="consult-mocdoc-field-group">
                  <FieldLabel>{t('consultation.refer_to')}</FieldLabel>
                  <input name="referral_to" className={lockedInputClass} defaultValue={lockedReferral} readOnly tabIndex={-1} />
                  <p className="consult-mocdoc-hint">{t('consultation.refer_locked')}</p>
                </div>
                <div className="consult-mocdoc-field-group">
                  <FieldLabel>{t('consultation.consult_type')}</FieldLabel>
                  <input name="consult_type" className={lockedInputClass} defaultValue={autoConsultType || ''} readOnly tabIndex={-1} />
                </div>
                <div className="consult-mocdoc-field-group">
                  <FieldLabel>{t('consultation.consult_fee', { currency: priceUnitLabel(), defaultValue: `Consultation fee (${priceUnitLabel()})` })}</FieldLabel>
                  <input
                    name="consult_fee_xaf"
                    type="number"
                    step="1"
                    min="0"
                    className={lockedInputClass}
                    defaultValue={lockedFee}
                    readOnly
                    tabIndex={-1}
                  />
                  <p className="consult-mocdoc-hint">{t('consultation.fee_locked')}</p>
                </div>
              </SectionCard>

              <SectionCard icon={<i className="fa fa-calendar-check-o" aria-hidden />} title={t('consultation.follow_up_title')}>
                <div className="consult-mocdoc-field-group">
                  <FieldLabel>{t('consultation.next_interval')}</FieldLabel>
                  <select
                    name="next_consultation"
                    className={selectClass}
                    defaultValue={hasCustomNextConsult ? nextConsultValue : nextConsultValue || ''}
                  >
                    <option value="">{t('consultation.select_interval')}</option>
                    {medOptions.nextConsult.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                    {hasCustomNextConsult ? <option value={nextConsultValue}>{nextConsultValue}</option> : null}
                  </select>
                  <p className="consult-mocdoc-hint">{t('consultation.interval_hint')}</p>
                </div>
                <div className="consult-mocdoc-field-group">
                  <FieldLabel>{t('consultation.empty_stomach')}</FieldLabel>
                  <select name="empty_stomach" className={selectClass} defaultValue={followUp.emptyStomach || ''}>
                    <option value="">{t('consultation.select')}</option>
                    <option value="Yes">{t('shared.yes')}</option>
                    <option value="No">{t('shared.no')}</option>
                  </select>
                </div>
                <div className="consult-mocdoc-field-group">
                  <FieldLabel>{t('consultation.follow_up_date')}</FieldLabel>
                  <input type="date" name="follow_up_date" className={inputClass} defaultValue={followUp.followUpDate || ''} />
                </div>
                {!editId ? (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 border-t border-orange-200 pt-4 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="followup_visit_requested"
                      value="1"
                      className="consult-mocdoc-checkbox mt-0.5"
                      defaultChecked={followUp.followupRequested}
                    />
                    <span>{t('consultation.follow_up_check')}</span>
                  </label>
                ) : followUp.followupRequested ? (
                  <input type="hidden" name="followup_visit_requested" value="1" />
                ) : null}
                {!editId ? (
                  <p className="consult-mocdoc-hint mt-2">
                    <i className="fa fa-info-circle mr-1" />
                    {t('consultation.follow_up_info')}
                  </p>
                ) : followUp.followupRequested ? (
                  <p className="mt-4 border-t border-orange-200 pt-4 text-xs font-semibold text-emerald-700">
                    <i className="fa fa-check-circle mr-1" />
                    {t('consultation.follow_up_requested')}
                  </p>
                ) : null}
              </SectionCard>

              {!admitOrderBlocked ? (
                <SectionCard icon={<i className="fa fa-bed" aria-hidden />} title={t('consultation.admission_title')}>
                  <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      name="admit_recommendation"
                      className="consult-mocdoc-checkbox"
                    />
                    {t('consultation.admit_recommend')}
                  </label>
                  <input
                    name="admit_indication"
                    className={inputClass}
                    placeholder={t('consultation.admit_indication_ph')}
                  />
                </SectionCard>
              ) : null}

              <div className="consult-mocdoc-submit sticky top-5">
                <button
                  type="submit"
                  disabled={blocked}
                  className="consult-mocdoc-submit-btn"
                >
                  <i className="fa fa-save mr-2" />
                  {editId ? t('consultation.update') : t('consultation.complete')}
                </button>
                <a href="/opd-queue" className="consult-mocdoc-cancel-btn">
                  <i className="fa fa-times mr-2 text-red-500" />
                  {t('shared.cancel')}
                </a>
                <hr className="consult-mocdoc-divider" />
                <p className="consult-mocdoc-submit-info">
                  <i className="fa fa-info-circle mr-1" />
                  {t('consultation.complete_hint')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </form>
      </div>
    </div>
  );
}

/** Alias for bootReactPage key `consultation-session` (legacy route name). */
export const ConsultationSessionPageApp = ConsultationNewPageApp;
