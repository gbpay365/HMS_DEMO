import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogSearchSelect } from '../CatalogSearchSelect';
import { todayIsoDate } from '../../lib/prescriptionDate';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const lockedInputClass =
  'w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700';
const selectClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200';

const FREQ_OPTIONS = [
  { labelKey: 'freq_od', value: 'OD', times: 1 },
  { labelKey: 'freq_bd', value: 'BD', times: 2 },
  { labelKey: 'freq_tds', value: 'TDS', times: 3 },
  { labelKey: 'freq_qid', value: 'QID', times: 4 },
  { labelKey: 'freq_q6h', value: 'Q6H', times: 4 },
  { labelKey: 'freq_q4h', value: 'Q4H', times: 6 },
  { labelKey: 'freq_stat', value: 'STAT', times: 1 },
  { labelKey: 'freq_prn', value: 'PRN', times: 1 },
];

export function resolveDrugName(catalogName, customName) {
  return String(customName || '').trim() || String(catalogName || '').trim();
}

function resolveUnitPrice(inventory, catalogName, customName) {
  if (String(customName || '').trim()) return 0;
  const key = String(catalogName || '').trim().toLowerCase();
  if (!key) return 0;
  const hit = (inventory || []).find((x) => String(x.name || '').trim().toLowerCase() === key);
  return hit ? Math.round(parseFloat(hit.price != null ? hit.price : 0) || 0) : 0;
}

export function IpdRxFields({
  inventory = [],
  defaults = {},
  showDrugPicker = true,
  drugNameInputName = 'drug_name',
  prefix = ''}) {
  const { t } = useTranslation('ipd');
  const [catalogDrug, setCatalogDrug] = useState(defaults.drug_name || '');
  const [customDrug, setCustomDrug] = useState('');
  const resolvedDrug = resolveDrugName(catalogDrug, customDrug);
  const isCustom = !!String(customDrug || '').trim();
  const [unitPrice, setUnitPrice] = useState(() => {
    if (defaults.unit_price != null && parseFloat(defaults.unit_price) > 0) {
      return Math.round(parseFloat(defaults.unit_price) || 0);
    }
    return resolveUnitPrice(inventory, defaults.drug_name, '');
  });

  useEffect(() => {
    if (isCustom) {
      setUnitPrice(0);
      return;
    }
    setUnitPrice(resolveUnitPrice(inventory, catalogDrug, customDrug));
  }, [catalogDrug, customDrug, isCustom, inventory]);

  const freqOpts = useMemo(
    () => FREQ_OPTIONS.map((o) => ({ ...o, label: t(`charge_modal.${o.labelKey}`) })),
    [t]
  );
  const defaultFreq = defaults.frequency_label || 'TDS';
  const defaultTimes =
    defaults.times_per_day ||
    freqOpts.find((o) => o.value === defaultFreq)?.times ||
    3;
  const treatmentStart = defaults.treatment_start
    ? String(defaults.treatment_start).slice(0, 10)
    : todayIsoDate();

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {showDrugPicker ? (
        <>
          <input type="hidden" name={drugNameInputName} value={resolvedDrug} />
          <input type="hidden" name="custom_drug_name" value={customDrug} />
          <div className="mb-1 grid grid-cols-1 gap-3 sm:col-span-2 lg:col-span-3 lg:grid-cols-2">
            <div className="rounded-xl border border-violet-200/70 bg-gradient-to-br from-violet-50/60 via-white to-indigo-50/30 p-3 shadow-sm ring-1 ring-violet-100/50">
              <div className="mb-2.5 flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
                  <i className="fa fa-search text-xs" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wide text-violet-900">{t('charge_modal.medication')}</div>
                  <p className="mt-0.5 text-[11px] leading-snug text-violet-700/80">{t('treatment.catalog_drug_hint')}</p>
                </div>
              </div>
              <CatalogSearchSelect
                items={inventory}
                value={catalogDrug}
                onChange={setCatalogDrug}
                placeholder={t('charge_modal.pharmacy_search_ph')}
                emptyMessage={t('charge_modal.no_matches')}
                showPrice
                priceLabel={t('shared.fcfa')}
                inputClassName={`${inputClass} border-violet-200/80 focus:border-violet-400 focus:ring-violet-200`}
              />
            </div>
            <div
              className={`rounded-xl border p-3 shadow-sm transition ${
                isCustom
                  ? 'border-amber-300/80 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/40 ring-2 ring-amber-200/70'
                  : 'border-amber-200/60 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/20 ring-1 ring-amber-100/50'
              }`}
            >
              <div className="mb-2.5 flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
                  <i className="fa fa-pencil text-xs" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wide text-amber-900">{t('treatment.custom_drug_field')}</div>
                  <p className="mt-0.5 text-[11px] leading-snug text-amber-800/75">{t('treatment.custom_drug_field_hint')}</p>
                </div>
              </div>
              <input
                className={`${inputClass} border-amber-200/80 font-semibold focus:border-amber-400 focus:ring-amber-200`}
                value={customDrug}
                onChange={(ev) => setCustomDrug(ev.target.value)}
                placeholder={t('treatment.custom_drug_field_ph')}
                autoComplete="off"
              />
            </div>
          </div>
        </>
      ) : null}

      <div>
        <label className="mb-1 block text-xs font-bold">{t('charge_modal.treatment_start')}</label>
        <input
          type="date"
          name="treatment_start"
          className={inputClass}
          defaultValue={treatmentStart}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">{t('charge_modal.form_label')}</label>
        <select name="drug_type" className={selectClass} defaultValue={defaults.drug_type || 'tablet'}>
          <option value="tablet">{t('charge_modal.drug_tablet')}</option>
          <option value="injection">{t('charge_modal.drug_injection')}</option>
          <option value="drip">{t('charge_modal.drug_drip')}</option>
          <option value="oral_liquid">{t('charge_modal.drug_oral_liquid')}</option>
          <option value="topical">{t('charge_modal.drug_topical')}</option>
          <option value="other">{t('charge_modal.drug_other')}</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">{t('charge_modal.route')}</label>
        <select name="route" className={selectClass} defaultValue={defaults.route || 'oral'}>
          <option value="oral">{t('charge_modal.route_oral')}</option>
          <option value="iv">{t('charge_modal.route_iv')}</option>
          <option value="im">{t('charge_modal.route_im')}</option>
          <option value="sc">{t('charge_modal.route_sc')}</option>
          <option value="topical">{t('charge_modal.route_topical')}</option>
          <option value="inhalation">{t('charge_modal.route_inhalation')}</option>
          <option value="rectal">{t('charge_modal.route_rectal')}</option>
          <option value="sublingual">{t('charge_modal.route_sublingual')}</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">{t('charge_modal.dosage')} *</label>
        <input
          name="dosage"
          className={inputClass}
          placeholder={t('charge_modal.dosage_ph')}
          defaultValue={defaults.dosage || ''}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">{t('charge_modal.frequency')}</label>
        <select
          name="frequency_label"
          className={selectClass}
          defaultValue={defaultFreq}
          onChange={(ev) => {
            const hit = freqOpts.find((o) => o.value === ev.target.value);
            const timesEl = document.getElementById(`${prefix}rx-times-per-day`);
            if (timesEl && hit) timesEl.value = String(hit.times);
          }}
        >
          {freqOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">{t('charge_modal.times_per_day')}</label>
        <input
          id={`${prefix}rx-times-per-day`}
          name="times_per_day"
          type="number"
          min="1"
          max="8"
          className={inputClass}
          defaultValue={defaultTimes}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">{t('charge_modal.duration_days')} *</label>
        <input
          name="duration_days"
          type="number"
          min="1"
          max="90"
          className={inputClass}
          defaultValue={defaults.duration_days || 1}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">{t('charge_modal.scheduled_times')}</label>
        <input
          name="scheduled_times"
          className={inputClass}
          placeholder={t('charge_modal.sched_ph')}
          defaultValue={defaults.scheduled_times || ''}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">{t('charge_modal.unit_price')}</label>
        <input
          type="text"
          readOnly
          tabIndex={-1}
          className={lockedInputClass}
          value={isCustom ? t('charge_modal.custom_price_zero') : `${unitPrice} ${t('shared.fcfa')}`}
          title={isCustom ? t('charge_modal.custom_price_hint') : t('charge_modal.catalog_price_locked')}
        />
        <input type="hidden" name="unit_price" value={unitPrice} />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="mb-1 block text-xs font-bold">{t('charge_modal.notes')}</label>
        <input
          name="notes"
          className={inputClass}
          placeholder={t('charge_modal.notes_ph')}
          defaultValue={defaults.notes || ''}
        />
      </div>
    </div>
  );
}
