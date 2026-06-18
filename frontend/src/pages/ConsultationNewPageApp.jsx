import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogOrderPicker } from '../components/CatalogOrderPicker';
import { CustomCatalogRows } from '../components/CustomCatalogRows';
import { CatalogSearchSelect } from '../components/CatalogSearchSelect';
import { OrderSectionShell } from '../components/OrderSectionShell';
import { todayIsoDate } from '../lib/prescriptionDate';
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
import { calcMedQuantity, formatMedQuantityFormula } from '../lib/calcMedQuantity';

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

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200';
const selectClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const lockedInputClass = `${inputClass} cursor-not-allowed bg-slate-100 text-slate-600`;

function catalogUnitPrice(pharmacyCatalog, catalogName) {
  const key = String(catalogName || '').trim().toLowerCase();
  if (!key) return 0;
  const hit = (pharmacyCatalog || []).find((item) => String(item.name || '').trim().toLowerCase() === key);
  return hit ? Math.round(parseFloat(hit.price != null ? hit.price : 0) || 0) : 0;
}

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

function fmtPrice(n) {
  const v = parseFloat(n || 0);
  return Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR') : '0';
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
    <label className="mb-2 block text-sm font-bold text-slate-800">
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

function SectionCard({ icon, title, action, children }) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hms-surface-card">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 md:px-5">
        <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-800">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </div>
  );
}

const medRxInputBase =
  'w-full rounded-lg border px-2.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2';

const medRxBoxWrap = 'border-slate-200/80 bg-white ring-1 ring-slate-100/80';
const medRxIconBg = 'bg-brand';
const medRxInput = `${medRxInputBase} border-slate-200 bg-white focus:border-brand focus:ring-brand/20`;

const MED_RX_THEMES = {
  dosage: {
    wrap: medRxBoxWrap,
    icon: 'fa-flask',
    iconBg: medRxIconBg,
    input: medRxInput},
  frequency: {
    wrap: medRxBoxWrap,
    icon: 'fa-repeat',
    iconBg: medRxIconBg,
    input: medRxInput},
  days: {
    wrap: medRxBoxWrap,
    icon: 'fa-calendar',
    iconBg: medRxIconBg,
    input: medRxInput},
  qty: {
    wrap: medRxBoxWrap,
    icon: 'fa-calculator',
    iconBg: medRxIconBg,
    input: medRxInput},
  qtyAuto: {
    input: `${medRxInputBase} border-emerald-200 bg-emerald-50/80 font-bold text-emerald-900 focus:border-emerald-500 focus:ring-emerald-200/80`},
  start: {
    wrap: medRxBoxWrap,
    icon: 'fa-calendar-check-o',
    iconBg: medRxIconBg,
    input: medRxInput}};

function MedRxParamBox({ themeKey, label, required, badge, children, footer }) {
  const theme = MED_RX_THEMES[themeKey];
  return (
    <div className={`flex h-full min-h-[5.5rem] flex-col rounded-xl border p-2.5 shadow-sm ${theme.wrap}`}>
      <div className="mb-2 flex min-h-[1.5rem] flex-wrap items-center gap-1.5">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] text-white shadow-sm ${theme.iconBg}`}
        >
          <i className={`fa ${theme.icon}`} aria-hidden="true" />
        </span>
        <span className="text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-700">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </span>
        {badge}
      </div>
      <div className="flex-1">{children}</div>
      {footer ? <div className="mt-1.5">{footer}</div> : null}
    </div>
  );
}

function MedComboInput({ name, value, options, placeholder, listId, required, onChange, inputClassName }) {
  const controlled = typeof onChange === 'function';
  const cls = inputClassName || inputClass;
  return (
    <>
      <input
        name={name}
        list={listId}
        className={cls}
        placeholder={placeholder}
        {...(controlled
          ? { value: value ?? '', onChange: (e) => onChange(e.target.value) }
          : {})}
        required={required}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} />
        ))}
      </datalist>
    </>
  );
}

function resolveMedDrugFields(med, pharmacyCatalog) {
  const name = String(med?.name || '').trim();
  if (!name) return { catalogName: '', customName: '' };
  const hit = (pharmacyCatalog || []).find(
    (item) => String(item.name || '').trim().toLowerCase() === name.toLowerCase()
  );
  if (hit) return { catalogName: hit.name, customName: '' };
  return { catalogName: '', customName: name };
}

function resolveMedName(catalogName, customName) {
  return String(customName || '').trim() || String(catalogName || '').trim();
}

function validateMedicationRows(formEl, t) {
  if (!formEl) return '';
  const fd = new FormData(formEl);
  const catalogNames = fd.getAll('med_catalog_name[]');
  const customNames = fd.getAll('med_custom_name[]');
  const dosages = fd.getAll('med_dosage[]');
  const freqs = fd.getAll('med_frequency[]');
  const durations = fd.getAll('med_duration[]');
  const quantities = fd.getAll('med_quantity[]');
  const maxLen = Math.max(
    catalogNames.length,
    customNames.length,
    dosages.length,
    freqs.length,
    durations.length,
    quantities.length
  );
  for (let i = 0; i < maxLen; i++) {
    const name = resolveMedName(catalogNames[i], customNames[i]);
    if (!name) continue;
    const dosage = String(dosages[i] || '').trim();
    const frequency = String(freqs[i] || '').trim();
    const duration = String(durations[i] || '').trim();
    const daysNum = parseInt(duration, 10);
    if (!dosage || !frequency || !duration || !Number.isFinite(daysNum) || daysNum < 1) {
      return t('consultation.err_med_incomplete', { drug: name });
    }
  }
  return '';
}

function MedicationRow({ med, pharmacyCatalog, medOptions, t, rowIndex, onRemove }) {
  const initialDrug = useMemo(() => resolveMedDrugFields(med, pharmacyCatalog), [med, pharmacyCatalog]);
  const [catalogName, setCatalogName] = useState(initialDrug.catalogName);
  const [customName, setCustomName] = useState(initialDrug.customName);
  const resolvedName = resolveMedName(catalogName, customName);
  const isCustom = !!String(customName || '').trim();
  const [unitPrice, setUnitPrice] = useState(() => {
    if (med?.unit_price != null && parseFloat(med.unit_price) >= 0) return Math.round(parseFloat(med.unit_price) || 0);
    if (isCustom) return 0;
    return catalogUnitPrice(pharmacyCatalog, catalogName);
  });
  const dosageListId = `consult-dose-${rowIndex}`;
  const freqListId = `consult-freq-${rowIndex}`;
  const treatmentStart = med?.treatment_start ? String(med.treatment_start).slice(0, 10) : todayIsoDate();

  const [dosage, setDosage] = useState(med.dosage || '');
  const [frequency, setFrequency] = useState(med.frequency || '');
  const [days, setDays] = useState(med.duration != null && med.duration !== '' ? String(med.duration) : '');
  const [qtyManual, setQtyManual] = useState(false);
  const [quantity, setQuantity] = useState(() => {
    const auto = calcMedQuantity({
      dosage: med.dosage,
      frequency: med.frequency,
      days: med.duration});
    if (med.quantity != null && med.quantity !== '') return String(med.quantity);
    return auto != null ? String(auto) : '1';
  });

  const qtyFormula = useMemo(
    () => formatMedQuantityFormula({ dosage, frequency, days }),
    [dosage, frequency, days]
  );

  useEffect(() => {
    if (qtyManual) return;
    const auto = calcMedQuantity({ dosage, frequency, days });
    if (auto != null && auto > 0) setQuantity(String(auto));
  }, [dosage, frequency, days, qtyManual]);

  useEffect(() => {
    if (isCustom) {
      setUnitPrice(0);
      return;
    }
    setUnitPrice(catalogUnitPrice(pharmacyCatalog, catalogName));
  }, [catalogName, customName, isCustom, pharmacyCatalog]);

  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <input type="hidden" name="med_name[]" value={resolvedName} />
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-extrabold text-white shadow-md">
          {rowIndex + 1}
        </div>
        <span className="hidden text-base font-bold text-slate-400 sm:inline">—</span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
            <i className="fa fa-medkit text-sm" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-600">
              {t('consultation.med_line_label')}
            </div>
            {resolvedName ? (
              <div className="truncate text-sm font-semibold text-slate-800">{resolvedName}</div>
            ) : (
              <div className="text-[11px] text-slate-500">{t('consultation.med_pick_drug_hint')}</div>
            )}
          </div>
        </div>
        {isCustom ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            <i className="fa fa-star text-[9px]" aria-hidden />
            {t('consultation.custom_drug_badge')}
          </span>
        ) : catalogName ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand-light px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand">
            <i className="fa fa-check text-[9px]" aria-hidden />
            {t('consultation.catalog_drug_badge')}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 opacity-70 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
          title={t('consultation.remove')}
        >
          <i className="fa fa-times" aria-hidden />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div
          className={`rounded-xl border p-3 shadow-sm transition ${
            !isCustom && catalogName
              ? 'border-brand/40 bg-brand-light/30 ring-2 ring-brand/15'
              : 'border-slate-200 bg-slate-50/50 ring-1 ring-slate-100'
          }`}
        >
          <div className="mb-2.5 flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
              <i className="fa fa-search text-xs" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-700">
                {t('consultation.med_drug')}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{t('consultation.catalog_drug_hint')}</p>
            </div>
          </div>
          <CatalogSearchSelect
            items={pharmacyCatalog}
            name="med_catalog_name[]"
            value={catalogName}
            onChange={setCatalogName}
            placeholder={t('consultation.catalog_search_ph')}
            emptyMessage={t('consultation.catalog_no_match')}
            groupKey="used_for"
            showPrice
            priceLabel={t('consultation.price_fcfa_short')}
            inputClassName={`${inputClass} border-slate-200 bg-white font-semibold focus:border-brand focus:ring-brand/20`}
          />
        </div>

        <div
          className={`rounded-xl border p-3 shadow-sm transition ${
            isCustom
              ? 'border-amber-300/80 bg-amber-50/40 ring-2 ring-amber-200/50'
              : 'border-slate-200 bg-slate-50/30 ring-1 ring-slate-100'
          }`}
        >
          <div className="mb-2.5 flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
              <i className="fa fa-pencil text-xs" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-wide text-amber-900">
                {t('consultation.custom_drug_field')}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-amber-800/75">{t('consultation.custom_drug_field_hint')}</p>
            </div>
          </div>
          <input
            name="med_custom_name[]"
            className={`${inputClass} border-amber-200/80 bg-white font-semibold focus:border-amber-400 focus:ring-amber-200`}
            placeholder={t('consultation.custom_drug_field_ph')}
            value={customName}
            onChange={(ev) => setCustomName(ev.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-stretch">
        <div className="lg:col-span-2">
          <MedRxParamBox themeKey="dosage" label={t('consultation.med_dosage')} required={!!resolvedName}>
            <MedComboInput
              name="med_dosage[]"
              value={dosage}
              onChange={(v) => {
                setQtyManual(false);
                setDosage(v);
              }}
              placeholder={t('consultation.custom_dosage_ph')}
              options={medOptions.dosage}
              listId={dosageListId}
              required={!!resolvedName}
              inputClassName={MED_RX_THEMES.dosage.input}
            />
          </MedRxParamBox>
        </div>
        <div className="lg:col-span-2">
          <MedRxParamBox themeKey="frequency" label={t('consultation.med_frequency')} required={!!resolvedName}>
            <MedComboInput
              name="med_frequency[]"
              value={frequency}
              onChange={(v) => {
                setQtyManual(false);
                setFrequency(v);
              }}
              placeholder={t('consultation.custom_frequency_ph')}
              options={medOptions.frequency}
              listId={freqListId}
              required={!!resolvedName}
              inputClassName={MED_RX_THEMES.frequency.input}
            />
          </MedRxParamBox>
        </div>
        <div className="lg:col-span-2">
          <MedRxParamBox themeKey="days" label={t('consultation.med_days')} required={!!resolvedName}>
            <input
              name="med_duration[]"
              type="number"
              min="1"
              max="365"
              className={MED_RX_THEMES.days.input}
              placeholder={t('consultation.days_ph')}
              value={days}
              onChange={(e) => {
                setQtyManual(false);
                setDays(e.target.value);
              }}
              required={!!resolvedName}
            />
          </MedRxParamBox>
        </div>
        <div className="lg:col-span-3">
          <MedRxParamBox
            themeKey="qty"
            label={t('consultation.med_quantity')}
            required={!!resolvedName}
            badge={
              !qtyManual && qtyFormula ? (
                <span className="inline-flex items-center rounded-full bg-emerald-600/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-800">
                  {t('consultation.med_qty_auto')}
                </span>
              ) : null
            }
            footer={
              qtyFormula ? (
                <p className="text-[10px] leading-snug text-emerald-800/80">
                  {t('consultation.med_qty_formula', {
                    dose: qtyFormula.perDose,
                    freq: qtyFormula.perDay,
                    days: qtyFormula.dayCount,
                    total: qtyFormula.total})}
                  {qtyManual ? (
                    <button
                      type="button"
                      className="ml-1 font-bold text-indigo-600 hover:underline"
                      onClick={() => setQtyManual(false)}
                    >
                      {t('consultation.med_qty_recalc')}
                    </button>
                  ) : null}
                </p>
              ) : (
                <p className="text-[10px] text-amber-700/90">
                  {t('consultation.med_qty_fill_dose')}
                </p>
              )
            }
          >
            <input
              name="med_quantity[]"
              type="number"
              min="1"
              max="9999"
              step="1"
              className={!qtyManual && qtyFormula ? MED_RX_THEMES.qtyAuto.input : MED_RX_THEMES.qty.input}
              placeholder="1"
              value={quantity}
              onChange={(e) => {
                setQtyManual(true);
                setQuantity(e.target.value);
              }}
              required={!!resolvedName}
              title={t('consultation.med_quantity_hint')}
            />
          </MedRxParamBox>
        </div>
        <div className="lg:col-span-3">
          <MedRxParamBox themeKey="start" label={t('consultation.med_treatment_start')}>
            <input
              name="med_treatment_start[]"
              type="date"
              className={MED_RX_THEMES.start.input}
              defaultValue={treatmentStart}
              required={!!resolvedName}
            />
          </MedRxParamBox>
        </div>
      </div>
      <input type="hidden" name="med_unit_price[]" value={unitPrice} />
      <div className="mt-3 grid gap-3 md:grid-cols-12">
        <div className="md:col-span-4">
          <FieldLabel>{t('consultation.med_timing')}</FieldLabel>
          <MedPickSelect
            name="med_timing[]"
            value={med.timing}
            placeholder={t('consultation.select_timing')}
            options={medOptions.timing}
          />
        </div>
        <div className="md:col-span-8">
          <FieldLabel>{t('consultation.med_instructions')}</FieldLabel>
          <input
            name="med_instructions[]"
            className={inputClass}
            placeholder={t('consultation.med_instructions_ph')}
            defaultValue={med.instructions || ''}
          />
        </div>
      </div>
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
  const [medRows, setMedRows] = useState(() =>
    existingMeds.length
      ? existingMeds
      : [{ name: '', dosage: '', frequency: '', duration: '', timing: '', instructions: '' }]
  );
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

  const addMedRow = () =>
    setMedRows((rows) => [...rows, { name: '', dosage: '', frequency: '', duration: '', timing: '', instructions: '' }]);
  const removeMedRow = (idx) =>
    setMedRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)));

  const handleSubmit = (e) => {
    setMedError('');
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

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
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

        <fieldset disabled={blocked} className="m-0 min-w-0 border-0 p-0">
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <SectionCard icon={<i className="fa fa-edit text-indigo-600" />} title={t('consultation.soap_title')}>
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

              <SectionCard icon={<i className="fa fa-medkit text-brand" aria-hidden />} title={t('consultation.medications')}>
                {visitId ? (
                  <div className="mb-3 rounded-xl border border-brand/20 bg-brand-light/40 px-3 py-2 text-xs text-slate-700">
                    <i className="fa fa-info-circle mr-1" />
                    {t('opd.treatment.consult_link_hint')}{' '}
                    <a href={`/opd/treatment/${visitId}`} className="font-bold underline">
                      {t('opd.treatment.link_label')}
                    </a>
                  </div>
                ) : null}
                {medError ? (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {medError}
                  </div>
                ) : null}
                <OrderSectionShell
                  theme="plan"
                  iconLetter="M"
                  title={t('consultation.med_items_label')}
                  addLabel={t('consultation.add_drug')}
                  onAdd={addMedRow}
                  hint={t('consultation.meds_custom_hint')}
                  empty={medRows.length === 0 ? t('consultation.no_meds') : null}
                >
                  {medRows.map((med, i) => (
                    <MedicationRow
                      key={i}
                      rowIndex={i}
                      med={med}
                      pharmacyCatalog={pharmacyCatalog}
                      medOptions={medOptions}
                      t={t}
                      onRemove={() => removeMedRow(i)}
                    />
                  ))}
                </OrderSectionShell>
                {!pharmacyCatalog.length ? (
                  <p className="mt-2 text-xs text-slate-500">
                    <i className="fa fa-info-circle mr-1" />
                    {t('consultation.no_pharmacy_catalog')}
                  </p>
                ) : null}
              </SectionCard>
            </div>

            <div className="lg:col-span-4">
              <SectionCard icon={<i className="fa fa-list text-amber-600" />} title={t('consultation.orders_title')}>
                <div className="mb-4">
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
                    priceLabel={t('consultation.price_fcfa_short')}
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
                <div>
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
                    priceLabel={t('consultation.price_fcfa_short')}
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

              <SectionCard icon={<i className="fa fa-user-md text-indigo-600" />} title={t('consultation.referral_title')}>
                <div className="mb-4">
                  <FieldLabel>{t('consultation.refer_to')}</FieldLabel>
                  <input name="referral_to" className={lockedInputClass} defaultValue={lockedReferral} readOnly tabIndex={-1} />
                  <p className="mt-1 text-xs text-slate-500">{t('consultation.refer_locked')}</p>
                </div>
                <div className="mb-4">
                  <FieldLabel>{t('consultation.consult_type')}</FieldLabel>
                  <input name="consult_type" className={lockedInputClass} defaultValue={autoConsultType || ''} readOnly tabIndex={-1} />
                </div>
                <div>
                  <FieldLabel>{t('consultation.consult_fee')}</FieldLabel>
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
                  <p className="mt-1 text-xs text-slate-500">{t('consultation.fee_locked')}</p>
                </div>
              </SectionCard>

              <SectionCard icon={<i className="fa fa-calendar-check-o text-brand" aria-hidden />} title={t('consultation.follow_up_title')}>
                <div className="mb-4">
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
                  <p className="mt-1 text-xs text-slate-500">{t('consultation.interval_hint')}</p>
                </div>
                <div className="mb-4">
                  <FieldLabel>{t('consultation.empty_stomach')}</FieldLabel>
                  <select name="empty_stomach" className={selectClass} defaultValue={followUp.emptyStomach || ''}>
                    <option value="">{t('consultation.select')}</option>
                    <option value="Yes">{t('shared.yes')}</option>
                    <option value="No">{t('shared.no')}</option>
                  </select>
                </div>
                <div className="mb-0">
                  <FieldLabel>{t('consultation.follow_up_date')}</FieldLabel>
                  <input type="date" name="follow_up_date" className={inputClass} defaultValue={followUp.followUpDate || ''} />
                </div>
                {!editId ? (
                  <label className="mt-4 flex cursor-pointer items-start gap-2 border-t border-slate-100 pt-4 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="followup_visit_requested"
                      value="1"
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      defaultChecked={followUp.followupRequested}
                    />
                    <span>{t('consultation.follow_up_check')}</span>
                  </label>
                ) : followUp.followupRequested ? (
                  <input type="hidden" name="followup_visit_requested" value="1" />
                ) : null}
                {!editId ? (
                  <p className="mt-2 text-xs text-slate-500">
                    <i className="fa fa-info-circle mr-1" />
                    {t('consultation.follow_up_info')}
                  </p>
                ) : followUp.followupRequested ? (
                  <p className="mt-4 border-t border-slate-100 pt-4 text-xs font-semibold text-emerald-700">
                    <i className="fa fa-check-circle mr-1" />
                    {t('consultation.follow_up_requested')}
                  </p>
                ) : null}
              </SectionCard>

              {!admitOrderBlocked ? (
                <SectionCard icon={<i className="fa fa-bed text-slate-600" />} title={t('consultation.admission_title')}>
                  <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      name="admit_recommendation"
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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

              <div className="sticky top-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <button
                  type="submit"
                  className="hms-btn-primary mb-3 w-full py-3 text-sm font-bold disabled:opacity-50"
                >
                  <i className="fa fa-save mr-2" />
                  {editId ? t('consultation.update') : t('consultation.complete')}
                </button>
                <a
                  href="/opd-queue"
                  className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
                >
                  <i className="fa fa-times mr-2 text-red-500" />
                  {t('shared.cancel')}
                </a>
                <hr className="my-3 border-slate-100" />
                <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <i className="fa fa-info-circle mr-1" />
                  {t('consultation.complete_hint')}
                </p>
              </div>
            </div>
          </div>
        </fieldset>
      </form>
      </div>
    </div>
  );
}

/** Alias for bootReactPage key `consultation-session` (legacy route name). */
export const ConsultationSessionPageApp = ConsultationNewPageApp;
