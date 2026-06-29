import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogSearchSelect } from '../CatalogSearchSelect';
import { formatMoney, priceUnitLabel } from '../../lib/hmsLocale';
import { todayIsoDate } from '../../lib/prescriptionDate';
import { calcMedQuantity } from '../../lib/calcMedQuantity';

const MEAL_TIMING = [
  { value: 'Before meals', key: 'rx_before_food' },
  { value: 'After meals', key: 'rx_after_food' },
  { value: 'With meals', key: 'rx_with_food' },
  { value: '', key: 'rx_meal_na' },
];

const FREQ_FROM_DOSES = [
  { doses: 1, value: 'Only Once' },
  { doses: 1, value: 'Once daily' },
  { doses: 2, value: 'Twice daily' },
  { doses: 3, value: 'Three times daily' },
  { doses: 4, value: 'Four times daily' },
];

function catalogUnitPrice(pharmacyCatalog, catalogName) {
  const key = String(catalogName || '').trim().toLowerCase();
  if (!key) return 0;
  const hit = (pharmacyCatalog || []).find((item) => String(item.name || '').trim().toLowerCase() === key);
  return hit ? Math.round(parseFloat(hit.price != null ? hit.price : 0) || 0) : 0;
}

function resolveMedDrugFields(med, pharmacyCatalog) {
  const name = String(med?.name || med?.catalog_name || '').trim();
  const custom = String(med?.custom_name || '').trim();
  if (custom) return { catalogName: String(med?.catalog_name || '').trim(), customName: custom };
  if (!name) return { catalogName: '', customName: '' };
  const hit = (pharmacyCatalog || []).find(
    (item) => String(item.name || '').trim().toLowerCase() === name.toLowerCase()
  );
  if (hit) return { catalogName: hit.name, customName: '' };
  return { catalogName: '', customName: name };
}

function resolveMedName(row) {
  return String(row.customName || '').trim() || String(row.catalogName || '').trim();
}

function inferGenericName(catalogName, pharmacyCatalog) {
  const hit = (pharmacyCatalog || []).find(
    (item) => String(item.name || '').trim().toLowerCase() === String(catalogName || '').trim().toLowerCase()
  );
  if (hit?.generic_name) return String(hit.generic_name).trim();
  const name = String(catalogName || '').trim();
  if (!name) return '';
  const stripped = name.replace(/\s+\d+(\.\d+)?\s*(MG|MCG|GM|G|ML|TAB|CAP|SYP|INJ|AMP|IU|%)\b/gi, '').trim();
  return stripped && stripped.length >= 3 ? stripped.toUpperCase() : '';
}

export function emptyMedRow() {
  return {
    catalogName: '',
    customName: '',
    medType: '',
    genericName: '',
    dosage: '',
    frequency: '',
    duration: '',
    timing: '',
    instructions: '',
    quantity: '1',
    treatmentStart: todayIsoDate(),
    unitPrice: 0,
    doseMorn: 0,
    doseNoon: 0,
    doseEve: 0,
    doseNight: 0,
    qtyManual: false,
  };
}

export function medRowFromLegacy(med, pharmacyCatalog) {
  const drug = resolveMedDrugFields(med, pharmacyCatalog);
  const row = {
    ...emptyMedRow(),
    catalogName: drug.catalogName,
    customName: drug.customName,
    medType: med?.med_type || med?.type || '',
    genericName: med?.generic_name || inferGenericName(drug.catalogName, pharmacyCatalog),
    dosage: med?.dosage || '',
    frequency: med?.frequency || '',
    duration: med?.duration != null && med?.duration !== '' ? String(med.duration) : '',
    timing: med?.timing || '',
    instructions: med?.instructions || '',
    treatmentStart: med?.treatment_start ? String(med.treatment_start).slice(0, 10) : todayIsoDate(),
    doseMorn: Number(med?.dose_morn) || 0,
    doseNoon: Number(med?.dose_noon) || 0,
    doseEve: Number(med?.dose_eve) || 0,
    doseNight: Number(med?.dose_night) || 0,
  };
  const auto = calcMedQuantity({ dosage: row.dosage, frequency: row.frequency, days: row.duration });
  row.quantity =
    med?.quantity != null && med?.quantity !== '' ? String(med.quantity) : auto != null ? String(auto) : '1';
  row.unitPrice =
    med?.unit_price != null && parseFloat(med.unit_price) >= 0
      ? Math.round(parseFloat(med.unit_price) || 0)
      : drug.customName
        ? 0
        : catalogUnitPrice(pharmacyCatalog, drug.catalogName);
  return row;
}

function doseTotal(row) {
  return (
    (Number(row.doseMorn) || 0) +
    (Number(row.doseNoon) || 0) +
    (Number(row.doseEve) || 0) +
    (Number(row.doseNight) || 0)
  );
}

function frequencyFromSchedule(row) {
  const total = doseTotal(row);
  if (total <= 0) return row.frequency;
  if (total === 1 && !row.frequency) return 'Only Once';
  const hit = FREQ_FROM_DOSES.find((f) => f.doses === total);
  return hit ? hit.value : row.frequency || `${total} times daily`;
}

function scheduleFromFrequency(freq) {
  const f = String(freq || '').toLowerCase();
  if (f.includes('only once') || f === 'stat') return { doseMorn: 1, doseNoon: 0, doseEve: 0, doseNight: 0 };
  if (f.includes('once')) return { doseMorn: 1, doseNoon: 0, doseEve: 0, doseNight: 0 };
  if (f.includes('twice') || f === 'bd') return { doseMorn: 1, doseNoon: 0, doseEve: 1, doseNight: 0 };
  if (f.includes('three') || f === 'tds') return { doseMorn: 1, doseNoon: 1, doseEve: 1, doseNight: 0 };
  if (f.includes('four') || f === 'qid') return { doseMorn: 1, doseNoon: 1, doseEve: 1, doseNight: 1 };
  return null;
}

function recalcQuantity(row, patch) {
  const next = { ...row, ...patch };
  if (next.qtyManual) return next;
  const auto = calcMedQuantity({ dosage: next.dosage, frequency: next.frequency, days: next.duration });
  if (auto != null && auto > 0) next.quantity = String(auto);
  return next;
}

function patchRow(rows, idx, patch) {
  return rows.map((row, i) => (i === idx ? recalcQuantity(row, patch) : row));
}

function MedRowHiddenFields({ row }) {
  const resolvedName = resolveMedName(row);
  const isCustom = !!String(row.customName || '').trim();
  const unitPrice = isCustom ? 0 : row.unitPrice || 0;
  return (
    <div className="hidden" aria-hidden>
      <input type="hidden" name="med_name[]" value={resolvedName} />
      <input type="hidden" name="med_catalog_name[]" value={row.catalogName} />
      <input type="hidden" name="med_custom_name[]" value={row.customName} />
      <input type="hidden" name="med_dosage[]" value={row.dosage} />
      <input type="hidden" name="med_frequency[]" value={row.frequency} />
      <input type="hidden" name="med_duration[]" value={row.duration} />
      <input type="hidden" name="med_quantity[]" value={row.quantity} />
      <input type="hidden" name="med_treatment_start[]" value={row.treatmentStart} />
      <input type="hidden" name="med_unit_price[]" value={unitPrice} />
      <input type="hidden" name="med_timing[]" value={row.timing} />
      <input type="hidden" name="med_instructions[]" value={row.instructions} />
      <input type="hidden" name="med_generic[]" value={row.genericName} />
      <input type="hidden" name="med_type[]" value={row.medType} />
      <input type="hidden" name="med_dose_morn[]" value={row.doseMorn} />
      <input type="hidden" name="med_dose_noon[]" value={row.doseNoon} />
      <input type="hidden" name="med_dose_eve[]" value={row.doseEve} />
      <input type="hidden" name="med_dose_night[]" value={row.doseNight} />
    </div>
  );
}

function RxTableRow({
  row,
  rowIndex,
  active,
  onSelect,
  onChange,
  onRemove,
  pharmacyCatalog,
  medOptions,
  t,
}) {
  const resolvedName = resolveMedName(row);
  const drugLocked = !!(row.catalogName || row.customName);
  const [customDraft, setCustomDraft] = useState('');

  useEffect(() => {
    if (!row.customName && !row.catalogName) setCustomDraft('');
  }, [row.customName, row.catalogName]);

  function pickCatalogName(v) {
    const hit = (pharmacyCatalog || []).find((x) => x.name === v);
    onChange({
      catalogName: v,
      customName: v ? '' : row.customName,
      unitPrice: hit ? Math.round(parseFloat(hit.price) || 0) : 0,
      genericName: inferGenericName(v, pharmacyCatalog),
      medType: hit?.used_for || row.medType,
    });
  }

  function pickCustomName(name) {
    const v = String(name || '').trim();
    if (!v) return;
    onChange({
      catalogName: '',
      customName: v,
      unitPrice: 0,
      genericName: row.genericName || inferGenericName(v, pharmacyCatalog),
    });
  }

  function clearDrug() {
    setCustomDraft('');
    onChange({
      catalogName: '',
      customName: '',
      unitPrice: 0,
      genericName: '',
      medType: '',
    });
  }

  return (
    <tr className={`rx-mocdoc-row${active ? ' is-active' : ''}`}>
      <td>
        <div className="rx-mocdoc-cell">
          <button type="button" className="rx-mocdoc-serial" onClick={onSelect} title="Select row">
            {rowIndex + 1}
          </button>
        </div>
      </td>
      <td>
        <div className="rx-mocdoc-cell">
          <input
            className="rx-mocdoc-field"
            value={row.medType}
            placeholder="—"
            onChange={(ev) => onChange({ medType: ev.target.value })}
            onFocus={onSelect}
          />
        </div>
      </td>
      <td>
        <div className={`rx-mocdoc-cell rx-mocdoc-cell--name${drugLocked ? ' rx-mocdoc-cell--name-selected' : ''}`}>
          {drugLocked ? (
            <div className="rx-mocdoc-selected-drug">
              <div className="rx-mocdoc-selected-drug__body">
                <span className="rx-mocdoc-selected-drug__name">{row.catalogName || row.customName}</span>
                {row.catalogName ? (
                  <span className="rx-mocdoc-selected-drug__price">
                    {formatMoney(row.unitPrice || catalogUnitPrice(pharmacyCatalog, row.catalogName))}
                  </span>
                ) : (
                  <span className="rx-mocdoc-selected-drug__badge">{t('consultation.custom_drug_badge')}</span>
                )}
              </div>
              <button
                type="button"
                className="rx-mocdoc-selected-drug__clear"
                onClick={clearDrug}
                aria-label={t('consultation.rx_change_drug')}
                title={t('consultation.rx_change_drug')}
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <CatalogSearchSelect
                items={pharmacyCatalog}
                value={row.catalogName}
                onChange={pickCatalogName}
                onCustomPick={pickCustomName}
                allowCustomPick
                customPickFormatter={(name) => t('consultation.catalog_use_custom', { name })}
                placeholder={t('consultation.catalog_search_ph')}
                emptyMessage={t('consultation.catalog_no_match')}
                searchHint={t('consultation.catalog_search_type_hint')}
                groupKey="used_for"
                showPrice
                priceLabel={priceUnitLabel()}
                inputClassName="rx-mocdoc-field hms-input"
                variant="rx"
                portalDropdown
                dropdownMinWidth={440}
                minQueryLength={1}
                maxResults={30}
              />
              <input
                className="rx-mocdoc-field rx-mocdoc-field--custom"
                placeholder={t('consultation.custom_drug_field_ph')}
                value={customDraft}
                onFocus={onSelect}
                onChange={(ev) => setCustomDraft(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') {
                    ev.preventDefault();
                    pickCustomName(customDraft);
                    setCustomDraft('');
                  }
                }}
                onBlur={() => {
                  const v = customDraft.trim();
                  if (v) {
                    pickCustomName(v);
                    setCustomDraft('');
                  }
                }}
              />
            </>
          )}
        </div>
      </td>
      <td>
        <div className="rx-mocdoc-cell">
          <input
            className="rx-mocdoc-field"
            value={row.genericName}
            placeholder="—"
            onChange={(ev) => onChange({ genericName: ev.target.value })}
            onFocus={onSelect}
          />
        </div>
      </td>
      <td>
        <div className="rx-mocdoc-cell">
          <input
            className="rx-mocdoc-field"
            list={`rx-dose-${rowIndex}`}
            value={row.dosage}
            placeholder="—"
            onChange={(ev) => onChange({ dosage: ev.target.value, qtyManual: false })}
            onFocus={onSelect}
            required={!!resolvedName}
          />
          <datalist id={`rx-dose-${rowIndex}`}>
            {medOptions.dosage.map((opt) => (
              <option key={opt.value} value={opt.value} />
            ))}
          </datalist>
        </div>
      </td>
      <td>
        <div className="rx-mocdoc-cell">
          <input
            className="rx-mocdoc-field"
            list={`rx-freq-${rowIndex}`}
            value={row.frequency}
            placeholder="—"
            onChange={(ev) => {
              const freq = ev.target.value;
              const sched = scheduleFromFrequency(freq);
              onChange({
                frequency: freq,
                qtyManual: false,
                ...(sched || {}),
              });
            }}
            onFocus={onSelect}
            required={!!resolvedName}
          />
          <datalist id={`rx-freq-${rowIndex}`}>
            {medOptions.frequency.map((opt) => (
              <option key={opt.value} value={opt.value} />
            ))}
          </datalist>
        </div>
      </td>
      <td>
        <div className="rx-mocdoc-cell rx-mocdoc-cell--days">
          <input
            className="rx-mocdoc-field rx-mocdoc-field--days"
            type="number"
            min="1"
            max="365"
            value={row.duration}
            placeholder="—"
            onChange={(ev) => onChange({ duration: ev.target.value, qtyManual: false })}
            onFocus={onSelect}
            required={!!resolvedName}
          />
          <span className="rx-mocdoc-days-suffix">{t('consultation.rx_days_suffix', { defaultValue: 'days' })}</span>
        </div>
      </td>
      <td>
        <div className="rx-mocdoc-cell">
          <input
            className="rx-mocdoc-field"
            value={row.instructions}
            placeholder="N/A"
            onChange={(ev) => onChange({ instructions: ev.target.value })}
            onFocus={onSelect}
          />
        </div>
      </td>
      <td>
        <div className="rx-mocdoc-cell">
          <button
            type="button"
            className="rx-mocdoc-remove"
            title={t('consultation.remove')}
            onClick={onRemove}
          >
            ×
          </button>
        </div>
      </td>
    </tr>
  );
}

function RxSchedulePanel({ row, rowIndex, onChange, medOptions, patientAge, patientGender, pharmacyCatalog, t }) {
  const resolvedName = resolveMedName(row);

  function setSchedule(field, value) {
    const num = Math.max(0, Math.min(9, parseInt(value, 10) || 0));
    const next = { ...row, [field]: num };
    onChange({
      [field]: num,
      frequency: frequencyFromSchedule(next),
      qtyManual: false,
    });
  }

  function pickCatalog(item) {
    onChange({
      catalogName: item.name,
      customName: '',
      medType: item.used_for || '',
      genericName: inferGenericName(item.name, pharmacyCatalog),
      unitPrice: Math.round(parseFloat(item.price) || 0),
    });
  }

  const mealValue = row.timing || '';

  return (
    <aside className="rx-mocdoc-side">
      <div className="rx-mocdoc-side-head">
        <div className="rx-mocdoc-side-meta">
          {[patientAge, patientGender].filter(Boolean).join(' · ') || '—'}
        </div>
        <div className="rx-mocdoc-side-title">{t('consultation.rx_panel_title')}</div>
        {resolvedName ? (
          <div className="mt-1 truncate text-xs font-bold text-slate-600">
            #{rowIndex + 1} · {resolvedName}
          </div>
        ) : null}
      </div>
      <div className="rx-mocdoc-side-body">
        <div className="rx-mocdoc-schedule-label">{t('consultation.rx_dose_schedule')}</div>
        <div className="rx-mocdoc-schedule-grid">
          {[
            ['doseMorn', t('consultation.rx_morn')],
            ['doseNoon', t('consultation.rx_noon')],
            ['doseEve', t('consultation.rx_eve')],
            ['doseNight', t('consultation.rx_night')],
          ].map(([field, label]) => (
            <div key={field}>
              <label>{label}</label>
              <input
                type="number"
                min="0"
                max="9"
                value={row[field]}
                onChange={(ev) => setSchedule(field, ev.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="rx-mocdoc-or">(or)</div>
        <select
          className="rx-mocdoc-freq-select"
          value={row.frequency}
          onChange={(ev) => {
            const freq = ev.target.value;
            const sched = scheduleFromFrequency(freq);
            onChange({
              frequency: freq,
              qtyManual: false,
              ...(sched || {}),
            });
          }}
        >
          <option value="">{t('consultation.select_frequency')}</option>
          {medOptions.frequency.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="rx-mocdoc-schedule-label">{t('consultation.rx_meal_timing')}</div>
        <div className="rx-mocdoc-meal-radios">
          {MEAL_TIMING.map(({ value, key }) => (
            <label key={key}>
              <input
                type="radio"
                name={`rx_meal_${rowIndex}`}
                checked={(mealValue || '') === value}
                onChange={() => onChange({ timing: value })}
              />
              {t(`consultation.${key}`)}
            </label>
          ))}
        </div>

        <div className="rx-mocdoc-meta-box">
          <strong>{t('consultation.med_quantity')}: {row.quantity}</strong>
          <label className="block font-semibold text-slate-700">{t('consultation.med_treatment_start')}</label>
          <input
            type="date"
            value={row.treatmentStart}
            onChange={(ev) => onChange({ treatmentStart: ev.target.value })}
          />
        </div>
      </div>
      <div className="rx-mocdoc-strip">
        {(pharmacyCatalog || []).slice(0, 24).map((item) => (
          <button
            key={item.id ?? item.name}
            type="button"
            className="rx-mocdoc-strip-item"
            onClick={() => pickCatalog(item)}
            title={t('consultation.rx_quick_add')}
          >
            <span>{item.name}</span>
            <span>{formatMoney(item.price)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function ConsultationPrescriptionSection({
  medRows,
  setMedRows,
  pharmacyCatalog = [],
  medOptions,
  patientAge = '',
  patientGender = '',
  medError = '',
  visitId = null,
}) {
  const { t } = useTranslation('clinical');
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (activeIdx >= medRows.length) setActiveIdx(Math.max(0, medRows.length - 1));
  }, [medRows.length, activeIdx]);

  const activeRow = medRows[activeIdx] || medRows[0] || emptyMedRow();

  const addRow = () => {
    setMedRows((rows) => {
      const next = [...rows, emptyMedRow()];
      setActiveIdx(next.length - 1);
      return next;
    });
  };

  const removeRow = (idx) => {
    setMedRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)));
    if (activeIdx >= idx && activeIdx > 0) setActiveIdx((i) => i - 1);
  };

  const updateRow = (idx, patch) => {
    setMedRows((rows) => patchRow(rows, idx, patch));
  };

  return (
    <div className="rx-mocdoc">
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
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{medError}</div>
      ) : null}

      <div className="rx-mocdoc-grid">
        <div className="rx-mocdoc-main">
          <div className="rx-mocdoc-rail" aria-hidden>
            <span className="rx-mocdoc-rail-btn"><i className="fa fa-calendar" /></span>
            <span className="rx-mocdoc-rail-btn is-active"><i className="fa fa-users" /></span>
            <span className="rx-mocdoc-rail-btn"><i className="fa fa-user-md" /></span>
            <span className="rx-mocdoc-rail-btn"><i className="fa fa-video-camera" /></span>
          </div>
          <div className="rx-mocdoc-form-wrap">
            <div className="rx-mocdoc-form-toolbar">
              <strong className="text-sm font-extrabold text-slate-700">{t('consultation.med_items_label')}</strong>
              <button type="button" className="rx-mocdoc-add-btn" onClick={addRow}>
                <i className="fa fa-plus" aria-hidden />
                {t('consultation.add_drug')}
              </button>
            </div>
            {medRows.length === 0 ? (
              <div className="rx-mocdoc-empty">{t('consultation.no_meds')}</div>
            ) : (
              <div className="rx-mocdoc-table-scroll">
                <table className="rx-mocdoc-table">
                  <colgroup>
                    <col className="rx-col-sno" />
                    <col className="rx-col-type" />
                    <col className="rx-col-name" />
                    <col className="rx-col-generic" />
                    <col className="rx-col-dose" />
                    <col className="rx-col-freq" />
                    <col className="rx-col-days" />
                    <col className="rx-col-inst" />
                    <col className="rx-col-action" />
                  </colgroup>
                  <thead>
                  <tr>
                    <th>{t('consultation.rx_col_sno')}</th>
                    <th>{t('consultation.rx_col_type')}</th>
                    <th>{t('consultation.rx_col_name')}</th>
                    <th>{t('consultation.rx_col_generic')}</th>
                    <th>{t('consultation.med_dosage')}</th>
                    <th>{t('consultation.med_frequency')}</th>
                    <th>{t('consultation.med_days')}</th>
                    <th>{t('consultation.rx_col_instruction')}</th>
                    <th>{t('consultation.rx_col_action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {medRows.map((row, i) => (
                    <RxTableRow
                      key={i}
                      row={row}
                      rowIndex={i}
                      active={i === activeIdx}
                      onSelect={() => setActiveIdx(i)}
                      onChange={(patch) => updateRow(i, patch)}
                      onRemove={() => removeRow(i)}
                      pharmacyCatalog={pharmacyCatalog}
                      medOptions={medOptions}
                      t={t}
                    />
                  ))}
                </tbody>
                </table>
              </div>
            )}
            {medRows.map((row, i) => (
              <MedRowHiddenFields key={`med-hidden-${i}`} row={row} />
            ))}
            {!pharmacyCatalog.length ? (
              <p className="mt-2 text-xs text-slate-500">
                <i className="fa fa-info-circle mr-1" />
                {t('consultation.no_pharmacy_catalog')}
              </p>
            ) : null}
          </div>
        </div>
        <RxSchedulePanel
          row={activeRow}
          rowIndex={activeIdx}
          onChange={(patch) => updateRow(activeIdx, patch)}
          medOptions={medOptions}
          patientAge={patientAge}
          patientGender={patientGender}
          pharmacyCatalog={pharmacyCatalog}
          t={t}
        />
      </div>
    </div>
  );
}

export function validateMedicationRows(formEl, t) {
  if (!formEl) return '';
  const fd = new FormData(formEl);
  const catalogNames = fd.getAll('med_catalog_name[]');
  const customNames = fd.getAll('med_custom_name[]');
  const dosages = fd.getAll('med_dosage[]');
  const freqs = fd.getAll('med_frequency[]');
  const durations = fd.getAll('med_duration[]');
  const maxLen = Math.max(catalogNames.length, customNames.length, dosages.length, freqs.length, durations.length);
  for (let i = 0; i < maxLen; i++) {
    const name = String(customNames[i] || '').trim() || String(catalogNames[i] || '').trim();
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

export function initialMedRows(existingMeds, pharmacyCatalog) {
  if (existingMeds.length) return existingMeds.map((m) => medRowFromLegacy(m, pharmacyCatalog));
  return [emptyMedRow()];
}
