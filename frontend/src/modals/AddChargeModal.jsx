import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPharmacyInventory, fetchServiceCatalog } from '../lib/addChargeApi';
import { formatMoney } from '../lib/hmsLocale';
import { notifyAlert } from '../lib/notifyBridge';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';

const SECTIONS = [
  'consultation',
  'service',
  'ward',
  'laboratory',
  'radiology',
  'pharmacy',
  'misc',
];

const DRUG_TYPES = ['tablet', 'injection', 'drip', 'oral_liquid', 'topical', 'other'];
const ROUTES = ['oral', 'iv', 'im', 'sc', 'topical', 'inhalation', 'rectal', 'sublingual'];
const FREQUENCIES = ['OD', 'BD', 'TDS', 'QID', 'Q6H', 'Q4H', 'STAT', 'PRN'];

let pharmacyInventoryCache = null;

const EMPTY_CLINICAL = {
  drug_type: 'tablet',
  route: 'oral',
  dosage: '',
  unit_price: '0',
  frequency_label: 'TDS',
  times_per_day: '3',
  duration_days: '5',
  scheduled_times: '',
  notes: ''};

function catalogCacheKey() {
  return '__hmsAddChargeCatCache';
}

function getCatalogCache() {
  if (typeof window === 'undefined') return {};
  if (!window[catalogCacheKey()]) window[catalogCacheKey()] = {};
  return window[catalogCacheKey()];
}

function resetFormState() {
  return {
    section: '',
    catalogItems: [],
    catalogLoading: false,
    catalogHint: '',
    catalogSelect: '',
    pharmacyItems: null,
    pharmacyLoading: false,
    pharmacyQuery: '',
    pharmacyOpen: false,
    description: '',
    amount: '',
    sourceModule: '',
    sourcePk: '',
    contextValue: '',
    clinical: { ...EMPTY_CLINICAL },
    formError: ''};
}

export function AddChargeModal({
  open,
  onClose,
  formAction,
  contextName = 'admission_id',
  contextValue = '',
  submitLabel}) {
  const { t } = useTranslation('ipd');
  const [state, setState] = useState(resetFormState);
  const pharmDebounce = useRef(null);
  const suggestRef = useRef(null);

  const patch = useCallback((partial) => setState((s) => ({ ...s, ...partial })), []);

  const applyCatalogItem = useCallback((item) => {
    if (!item) {
      patch({ catalogSelect: '', description: '', amount: '', sourceModule: '', sourcePk: '' });
      return;
    }
    const price = Math.max(0, Math.round(parseFloat(item.price) || 0));
    patch({
      catalogSelect: String(item.id),
      description: String(item.name || '').trim(),
      amount: String(price),
      sourceModule: 'service_catalog',
      sourcePk: String(item.id)});
  }, [patch]);

  const applyPharmacyItem = useCallback((item) => {
    if (!item) return;
    const price = Math.max(0, Math.round(parseFloat(item.price) || 0));
    patch({
      description: String(item.name || '').trim(),
      amount: String(price),
      sourceModule: 'inventory',
      sourcePk: String(item.id),
      pharmacyQuery: String(item.name || '').trim(),
      pharmacyOpen: false});
  }, [patch]);

  const loadCatalogSection = useCallback(
    async (cat) => {
      patch({ catalogLoading: true, catalogHint: '', catalogSelect: '', description: '', amount: '', sourceModule: '', sourcePk: '' });
      const cache = getCatalogCache();
      try {
        let items = cache[cat];
        if (!items) {
          items = await fetchServiceCatalog(cat);
          if (items.length) cache[cat] = items;
        }
        patch({ catalogItems: items, catalogLoading: false });
        if (!items.length) {
          patch({
            catalogHint: 'error',
            description: '',
            amount: ''});
          return;
        }
        patch({ catalogHint: 'ok', catalogItems: items });
        if (items.length === 1) applyCatalogItem(items[0]);
      } catch {
        patch({ catalogLoading: false, catalogItems: [], catalogHint: 'load_failed' });
      }
    },
    [applyCatalogItem, patch]
  );

  const loadPharmacy = useCallback(async () => {
    patch({
      pharmacyLoading: true,
      pharmacyQuery: '',
      description: '',
      amount: '',
      sourceModule: '',
      sourcePk: '',
      clinical: { ...EMPTY_CLINICAL }});
    try {
      if (!pharmacyInventoryCache) {
        pharmacyInventoryCache = await fetchPharmacyInventory();
      }
      patch({ pharmacyItems: pharmacyInventoryCache, pharmacyLoading: false, pharmacyOpen: true });
    } catch {
      pharmacyInventoryCache = [];
      patch({ pharmacyItems: [], pharmacyLoading: false, catalogHint: 'inventory_failed' });
    }
  }, [patch]);

  const onSectionChange = useCallback(
    (section) => {
      if (!section) {
        setState({
          ...resetFormState(),
          contextValue: state.contextValue});
        return;
      }
      if (section === 'misc') {
        setState({
          ...resetFormState(),
          section: 'misc',
          contextValue: state.contextValue});
        return;
      }
      if (section === 'pharmacy') {
        setState({
          ...resetFormState(),
          section: 'pharmacy',
          contextValue: state.contextValue});
        loadPharmacy();
        return;
      }
      setState({
        ...resetFormState(),
        section,
        contextValue: state.contextValue});
      loadCatalogSection(section);
    },
    [loadCatalogSection, loadPharmacy, state.contextValue]
  );

  useEffect(() => {
    if (!open) return;
    const base = resetFormState();
    base.contextValue = contextValue != null ? String(contextValue) : '';
    setState(base);
  }, [open, contextValue]);

  useEffect(() => {
    if (!open || state.section !== 'pharmacy' || !state.pharmacyItems?.length) return;
    patch({ pharmacyOpen: true });
  }, [open, patch, state.pharmacyItems, state.section]);

  useEffect(() => {
    const onDoc = (ev) => {
      if (suggestRef.current && !suggestRef.current.contains(ev.target)) {
        patch({ pharmacyOpen: false });
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [patch]);

  const isMisc = state.section === 'misc';
  const isPharmacy = state.section === 'pharmacy';
  const showCatalogCol = state.section && !isMisc;
  const lockDescAmt = !isMisc;
  const showClinical = isPharmacy;

  const pharmacyHits = useMemo(() => {
    const items = state.pharmacyItems || [];
    const q = state.pharmacyQuery.trim().toLowerCase();
    if (!q) return items.slice(0, 120);
    return items.filter((it) => String(it.name || '').toLowerCase().includes(q)).slice(0, 100);
  }, [state.pharmacyItems, state.pharmacyQuery]);

  const catalogHintText = useMemo(() => {
    if (state.catalogHint === 'error') return t('charge_modal.no_services_section');
    if (state.catalogHint === 'load_failed') return t('charge_modal.could_not_load_catalog');
    if (state.catalogHint === 'inventory_failed') return t('charge_modal.could_not_load_inventory');
    if (isPharmacy && state.pharmacyLoading) return t('charge_modal.loading_meds');
    if (isPharmacy && state.pharmacyItems) {
      return state.pharmacyItems.length
        ? t('charge_modal.meds_hint', { count: state.pharmacyItems.length })
        : t('charge_modal.no_inventory_items');
    }
    if (state.catalogHint === 'ok' && state.catalogItems.length) {
      return t('charge_modal.items_in_catalog', { count: state.catalogItems.length });
    }
    return '';
  }, [isPharmacy, state, t]);

  const warn = (titleKey, messageKey) => {
    notifyAlert({
      title: t(titleKey),
      message: t(messageKey),
      type: 'warning'});
  };

  const handleSubmit = (ev) => {
    patch({ formError: '' });
    const sec = state.section;
    if (!sec) {
      ev.preventDefault();
      return;
    }
    if (sec === 'misc') {
      const d = state.description.trim();
      const a = parseFloat(state.amount) || 0;
      if (!d) {
        ev.preventDefault();
        warn('charge_modal.desc_required_title', 'charge_modal.desc_required_text');
        return;
      }
      if (a <= 0) {
        ev.preventDefault();
        warn('charge_modal.invalid_amount_title', 'charge_modal.invalid_amount_text');
        return;
      }
      return;
    }
    if (sec === 'pharmacy') {
      if (state.sourceModule !== 'inventory' || !state.sourcePk) {
        ev.preventDefault();
        warn('charge_modal.select_medication_title', 'charge_modal.select_medication_text');
      }
      return;
    }
    if (!state.catalogSelect) {
      ev.preventDefault();
      warn('charge_modal.select_catalog_title', 'charge_modal.select_catalog_text');
    }
  };

  const onCatalogPick = (id) => {
    patch({ catalogSelect: id });
    const hit = state.catalogItems.find((it) => String(it.id) === String(id));
    applyCatalogItem(hit || null);
  };

  const lockedInputCls = lockDescAmt ? 'bg-slate-100 text-slate-700' : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('charge_modal.title')}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} label={t('charge_modal.cancel')} />
          <ModalSubmitButton form="hms-add-charge-form" label={submitLabel || t('charge_modal.submit')} icon="save" />
        </>
      }
    >
      <form id="hms-add-charge-form" method="POST" action={formAction} onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name={contextName} value={state.contextValue} />
        <input type="hidden" name="source_module" value={state.sourceModule} />
        <input type="hidden" name="source_pk" value={state.sourcePk} />

        <p className="text-sm text-slate-500">{t('charge_modal.intro')}</p>

        <div className={`grid gap-4 ${showCatalogCol ? 'sm:grid-cols-2' : ''}`}>
          <FormField label={t('charge_modal.bill_section')} htmlFor="add-charge-section" required>
            <select
              id="add-charge-section"
              name="charge_type"
              className="hms-input w-full"
              required
              value={state.section}
              onChange={(ev) => onSectionChange(ev.target.value)}
            >
              <option value="">{t('charge_modal.select_section')}</option>
              {SECTIONS.map((sec) => (
                <option key={sec} value={sec}>
                  {t(`charge_modal.section_${sec}`)}
                </option>
              ))}
            </select>
          </FormField>

          {showCatalogCol ? (
            <div>
              {isPharmacy ? (
                <FormField label={t('charge_modal.medication')} htmlFor="add-charge-pharm-search" required>
                  <div className="relative" ref={suggestRef}>
                    <input
                      id="add-charge-pharm-search"
                      type="search"
                      className="hms-input w-full"
                      autoComplete="off"
                      disabled={state.pharmacyLoading}
                      placeholder={t('charge_modal.pharmacy_search_ph')}
                      value={state.pharmacyQuery}
                      onChange={(ev) => {
                        const v = ev.target.value;
                        patch({ pharmacyQuery: v, pharmacyOpen: true });
                        clearTimeout(pharmDebounce.current);
                        pharmDebounce.current = setTimeout(() => patch({ pharmacyOpen: true }), 80);
                      }}
                      onFocus={() => patch({ pharmacyOpen: true })}
                    />
                    {state.pharmacyOpen && state.pharmacyItems ? (
                      <div className="absolute left-0 right-0 top-full z-[1060] mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                        {!pharmacyHits.length ? (
                          <div className="px-3 py-2 text-sm text-slate-500">
                            {state.pharmacyQuery.trim()
                              ? t('charge_modal.no_matches')
                              : t('charge_modal.no_meds_inventory')}
                          </div>
                        ) : (
                          pharmacyHits.map((it) => (
                            <button
                              key={it.id}
                              type="button"
                              className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
                              onMouseDown={(ev) => {
                                ev.preventDefault();
                                applyPharmacyItem(it);
                              }}
                            >
                              <span className="font-semibold">{it.name}</span>
                              <span className="text-slate-500"> — {formatMoney(it.price)}</span>
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </FormField>
              ) : (
                <FormField label={t('charge_modal.catalog_item')} htmlFor="add-charge-catalog" required>
                  <select
                    id="add-charge-catalog"
                    className="hms-input w-full"
                    value={state.catalogSelect}
                    disabled={state.catalogLoading}
                    onChange={(ev) => onCatalogPick(ev.target.value)}
                  >
                    <option value="">
                      {state.catalogLoading
                        ? t('charge_modal.loading')
                        : state.section
                          ? t('charge_modal.select_catalog_item')
                          : t('charge_modal.choose_section_first')}
                    </option>
                    {state.catalogItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} — {formatMoney(it.price)}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              {catalogHintText ? (
                <p
                  className={`mt-1 text-xs ${state.catalogHint === 'error' ? 'text-red-600' : 'text-slate-500'}`}
                >
                  {catalogHintText}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <FormField label={t('charge_modal.description')} htmlFor="add-charge-desc" required>
            <input
              id="add-charge-desc"
              name="description"
              className={`hms-input w-full ${lockedInputCls}`}
              required
              readOnly={lockDescAmt}
              placeholder={t('charge_modal.desc_ph')}
              value={state.description}
              onChange={(ev) => patch({ description: ev.target.value })}
            />
          </FormField>
          <FormField label={t('charge_modal.amount')} htmlFor="add-charge-amt" required>
            <input
              id="add-charge-amt"
              name="amount"
              type="number"
              min="1"
              step="1"
              className={`hms-input w-full ${lockedInputCls}`}
              required
              readOnly={lockDescAmt}
              placeholder="0"
              value={state.amount}
              onChange={(ev) => patch({ amount: ev.target.value })}
            />
          </FormField>
        </div>

        {showClinical ? (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-500">{t('charge_modal.clinical_intro')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('charge_modal.form_label')} htmlFor="add-charge-drug-type">
                <select
                  id="add-charge-drug-type"
                  name="drug_type"
                  className="hms-input w-full"
                  value={state.clinical.drug_type}
                  onChange={(ev) => patch({ clinical: { ...state.clinical, drug_type: ev.target.value } })}
                >
                  {DRUG_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {t(`charge_modal.drug_${v}`)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={t('charge_modal.route')} htmlFor="add-charge-route">
                <select
                  id="add-charge-route"
                  name="route"
                  className="hms-input w-full"
                  value={state.clinical.route}
                  onChange={(ev) => patch({ clinical: { ...state.clinical, route: ev.target.value } })}
                >
                  {ROUTES.map((v) => (
                    <option key={v} value={v}>
                      {t(`charge_modal.route_${v}`)}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label={t('charge_modal.dosage')} htmlFor="add-charge-dosage">
                <input
                  id="add-charge-dosage"
                  name="dosage"
                  className="hms-input w-full"
                  placeholder={t('charge_modal.dosage_ph')}
                  value={state.clinical.dosage}
                  onChange={(ev) => patch({ clinical: { ...state.clinical, dosage: ev.target.value } })}
                />
              </FormField>
              <FormField label={t('charge_modal.unit_price')} htmlFor="add-charge-unit-price">
                <input
                  id="add-charge-unit-price"
                  name="unit_price"
                  type="number"
                  step="0.01"
                  min="0"
                  className="hms-input w-full"
                  value={state.clinical.unit_price}
                  onChange={(ev) => patch({ clinical: { ...state.clinical, unit_price: ev.target.value } })}
                />
              </FormField>
              <FormField label={t('charge_modal.frequency')} htmlFor="add-charge-freq">
                <select
                  id="add-charge-freq"
                  name="frequency_label"
                  className="hms-input w-full"
                  value={state.clinical.frequency_label}
                  onChange={(ev) => patch({ clinical: { ...state.clinical, frequency_label: ev.target.value } })}
                >
                  {FREQUENCIES.map((v) => (
                    <option key={v} value={v}>
                      {t(`charge_modal.freq_${v.toLowerCase()}`)}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label={t('charge_modal.times_per_day')} htmlFor="add-charge-tpd">
                <input
                  id="add-charge-tpd"
                  name="times_per_day"
                  type="number"
                  min="1"
                  max="8"
                  className="hms-input w-full"
                  value={state.clinical.times_per_day}
                  onChange={(ev) => patch({ clinical: { ...state.clinical, times_per_day: ev.target.value } })}
                />
              </FormField>
              <FormField label={t('charge_modal.duration_days')} htmlFor="add-charge-dur">
                <input
                  id="add-charge-dur"
                  name="duration_days"
                  type="number"
                  min="1"
                  max="365"
                  className="hms-input w-full"
                  value={state.clinical.duration_days}
                  onChange={(ev) => patch({ clinical: { ...state.clinical, duration_days: ev.target.value } })}
                />
              </FormField>
              <FormField label={t('charge_modal.scheduled_times')} htmlFor="add-charge-sched">
                <input
                  id="add-charge-sched"
                  name="scheduled_times"
                  className="hms-input w-full"
                  placeholder={t('charge_modal.sched_ph')}
                  value={state.clinical.scheduled_times}
                  onChange={(ev) => patch({ clinical: { ...state.clinical, scheduled_times: ev.target.value } })}
                />
              </FormField>
            </div>
            <FormField label={t('charge_modal.notes')} htmlFor="add-charge-notes">
              <textarea
                id="add-charge-notes"
                name="notes"
                rows={2}
                className="hms-input w-full"
                placeholder={t('charge_modal.notes_ph')}
                value={state.clinical.notes}
                onChange={(ev) => patch({ clinical: { ...state.clinical, notes: ev.target.value } })}
              />
            </FormField>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
