/** Create invoice — patient + service/pharmacy line items (LinkHMS New Invoice). */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormErrorBanner } from '../components/FormErrorBanner';
import { FormField } from '../components/FormField';
import { HmsButton } from '../components/HmsButton';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { formatMoney } from '../lib/listUi';
import { notifySuccess } from '../lib/notifyBridge';

const SERVICE_TYPE_IDS = ['consultation', 'laboratory', 'radiology', 'maternity', 'surgery', 'pharmacy', 'hospitalisation'];

function emptyLine(serviceCategory = 'consultation') {
  return { catalog_id: '', description: '', unit_price: '', quantity: '1', service_category: serviceCategory };
}

function catalogForCategory(cat, catalogs) {
  const {
    consultCatalog,
    labCatalog,
    imagingCatalog,
    maternityCatalog,
    surgeryCatalog,
    svcCatalog,
    pharmacyCatalog,
    serviceCatalog} = catalogs;
  if (cat === 'consultation' && consultCatalog.length) return consultCatalog;
  if (cat === 'laboratory' && labCatalog.length) return labCatalog;
  if (cat === 'radiology' && imagingCatalog.length) return imagingCatalog;
  if (cat === 'maternity' && maternityCatalog.length) return maternityCatalog;
  if (cat === 'surgery' && surgeryCatalog.length) return surgeryCatalog;
  if (cat === 'pharmacy' && pharmacyCatalog.length) return pharmacyCatalog;
  if (cat === 'hospitalisation' && svcCatalog.length) return svcCatalog;
  return serviceCatalog;
}

function serviceCategoryLabel(t, id) {
  if (id === 'hospitalisation') {
    return t('modals.cashierPrepay.service_other');
  }
  return t(`cashier.billing_cat_${id}`);
}

function lineKindForCategory(serviceType) {
  return serviceType === 'hospitalisation' ? 'service' : serviceType;
}

export function CashierNewInvoiceModal({
  open,
  onClose,
  onCreated,
  serviceCatalog = [],
  pharmacyCatalog = [],
  consultCatalog = [],
  labCatalog = [],
  imagingCatalog = [],
  maternityCatalog = [],
  surgeryCatalog = [],
  svcCatalog = []}) {
  const { t } = useTranslation('clinical');
  const [serviceType, setServiceType] = useState('consultation');
  const [patientQ, setPatientQ] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [patientLabel, setPatientLabel] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [claimStatus, setClaimStatus] = useState('not_claimed');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const catalogBundles = useMemo(
    () => ({
      consultCatalog,
      labCatalog,
      imagingCatalog,
      maternityCatalog,
      surgeryCatalog,
      svcCatalog,
      pharmacyCatalog,
      serviceCatalog}),
    [consultCatalog, labCatalog, imagingCatalog, maternityCatalog, surgeryCatalog, svcCatalog, pharmacyCatalog, serviceCatalog]
  );

  const serviceTypes = useMemo(
    () => SERVICE_TYPE_IDS.map((id) => ({ id, label: serviceCategoryLabel(t, id) })),
    [t]
  );

  const total = useMemo(
    () =>
      lines.reduce((s, ln) => {
        const qty = parseFloat(ln.quantity) || 1;
        const unit = parseFloat(ln.unit_price) || 0;
        return s + qty * unit;
      }, 0),
    [lines]
  );

  const reset = useCallback(() => {
    setServiceType('consultation');
    setPatientQ('');
    setPatientResults([]);
    setPatientId('');
    setPatientLabel('');
    setLines([emptyLine()]);
    setNotes('');
    setClaimStatus('not_claimed');
    setFormError('');
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
  }, [open, reset]);

  useEffect(() => {
    if (!patientQ.trim() || patientId) {
      setPatientResults([]);
      return undefined;
    }
    const tmr = setTimeout(() => {
      fetch(`/api/patients/search?q=${encodeURIComponent(patientQ.trim())}`)
        .then((r) => r.json())
        .then((rows) => setPatientResults(Array.isArray(rows) ? rows.slice(0, 12) : []))
        .catch(() => setPatientResults([]));
    }, 280);
    return () => clearTimeout(tmr);
  }, [patientQ, patientId]);

  const pickPatient = (p) => {
    setPatientId(String(p.id));
    setPatientLabel(`${p.first_name || ''} ${p.last_name || ''}${p.phone ? ` · ${p.phone}` : ''}`.trim());
    setPatientQ('');
    setPatientResults([]);
    setFormError('');
  };

  const updateLine = (idx, patch) => {
    setLines((prev) => prev.map((ln, i) => (i === idx ? { ...ln, ...patch } : ln)));
  };

  const onCatalogPick = (idx, catalogId) => {
    const lineCategory = lines[idx]?.service_category || serviceType;
    const lineCatalog = catalogForCategory(lineCategory, catalogBundles);
    const item = lineCatalog.find((c) => String(c.id) === String(catalogId));
    if (!item) {
      updateLine(idx, { catalog_id: catalogId, service_category: lineCategory });
      return;
    }
    updateLine(idx, {
      catalog_id: String(item.id),
      description: item.name || '',
      unit_price: String(item.price ?? ''),
      service_category: lineCategory});
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine(serviceType)]);
  const removeLine = (idx) => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!patientId) {
      setFormError(t('cashier.invoice_err_patient'));
      return;
    }
    const payloadLines = lines
      .map((ln) => ({
        kind: lineKindForCategory(ln.service_category || serviceType),
        description: ln.description,
        unit_price: parseFloat(ln.unit_price) || 0,
        quantity: parseInt(ln.quantity, 10) || 1,
        catalog_id: ln.catalog_id ? parseInt(ln.catalog_id, 10) : null,
        department: ''}))
      .filter((ln) => ln.description && ln.unit_price > 0);

    if (!payloadLines.length) {
      setFormError(t('cashier.invoice_err_lines'));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/cashier/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          service_category: serviceType,
          lines: payloadLines,
          notes,
          claim_status: claimStatus})});
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        setFormError(data.error || t('cashier.invoice_err_save'));
        return;
      }
      notifySuccess(t('cashier.invoice_created', { code: data.ticket_code }));
      onCreated?.(data);
      onClose();
    } catch (err) {
      setFormError(err.message || t('cashier.invoice_err_save'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cashier.invoice_new_title')}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <FormErrorBanner message={formError} />

        <div>
          <span className="hms-label">{t('cashier.billing_service_category')}</span>
          <div className="flex flex-wrap gap-1.5">
            {serviceTypes.map((st) => (
              <button
                key={st.id}
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  serviceType === st.id ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'
                }`}
                onClick={() => setServiceType(st.id)}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <FormField label={t('cashier.col_patient')} htmlFor="cni-patient-q" required className="relative">
          {patientId ? (
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 shadow-sm">
              <span className="text-sm font-semibold">{patientLabel}</span>
              <button
                type="button"
                className="text-xs font-semibold text-brand"
                onClick={() => {
                  setPatientId('');
                  setPatientLabel('');
                  setFormError('');
                }}
              >
                {t('cashier.clear')}
              </button>
            </div>
          ) : (
            <>
              <input
                id="cni-patient-q"
                className="hms-input w-full"
                value={patientQ}
                onChange={(e) => { setPatientQ(e.target.value); setFormError(''); }}
                placeholder={t('cashier.invoice_patient_ph')}
              />
              {patientResults.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => pickPatient(p)}
                      >
                        {p.first_name} {p.last_name}
                        <span className="ml-2 text-xs text-slate-500">#P-{p.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </FormField>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-bold uppercase text-slate-500">
              {t('cashier.invoice_lines')}
            </label>
            <button type="button" className="text-xs font-bold text-brand" onClick={addLine}>
              + {t('cashier.invoice_add_line')}
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((ln, idx) => {
              const lineCategory = ln.service_category || serviceType;
              const lineCatalog = catalogForCategory(lineCategory, catalogBundles);
              return (
              <div key={idx} className="grid gap-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <select
                    className="hms-input w-full text-sm"
                    value={ln.catalog_id}
                    onChange={(e) => onCatalogPick(idx, e.target.value)}
                  >
                    <option value="">{t('cashier.invoice_pick_catalog')}</option>
                    {lineCatalog.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {formatMoney(c.price)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {serviceCategoryLabel(t, lineCategory)}
                  </p>
                </div>
                <div className="sm:col-span-4">
                  <input
                    className="hms-input w-full text-sm"
                    value={ln.description}
                    onChange={(e) => updateLine(idx, { description: e.target.value })}
                    placeholder={t('cashier.col_service')}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="hms-input w-full text-sm"
                    value={ln.unit_price}
                    onChange={(e) => updateLine(idx, { unit_price: e.target.value })}
                    placeholder={t('cashier.col_amount')}
                    required
                  />
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <input
                    type="number"
                    min="1"
                    className="hms-input w-full text-sm"
                    value={ln.quantity}
                    onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                  />
                  {lines.length > 1 ? (
                    <HmsButton type="button" variant="secondary" size="sm" className="shrink-0 px-2" onClick={() => removeLine(idx)} icon="times" aria-label={t('shared.remove')} />
                  ) : null}
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('cashier.billing_filter_claim')} htmlFor="cni-claim">
            <select id="cni-claim" className="hms-input w-full" value={claimStatus} onChange={(e) => setClaimStatus(e.target.value)}>
              <option value="not_claimed">{t('cashier.claim_not_claimed')}</option>
              <option value="claimed">{t('cashier.claim_claimed')}</option>
              <option value="denied">{t('cashier.claim_denied')}</option>
            </select>
          </FormField>
          <FormField label={t('cashier.col_total')}>
            <div className="rounded-xl border border-brand/20 bg-brand/5 px-3 py-2.5 text-lg font-extrabold text-brand">
              {formatMoney(total)}
            </div>
          </FormField>
        </div>

        <FormField label={t('cashier.invoice_notes')} htmlFor="cni-notes">
          <textarea id="cni-notes" className="hms-input w-full text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <ModalCancelButton onClick={onClose} disabled={busy} />
          <ModalSubmitButton
            disabled={busy}
            label={busy ? t('cashier.billing_loading') : t('cashier.invoice_create_btn')}
          />
        </div>
      </form>
    </Modal>
  );
}
