import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { notifyError } from '../lib/notifyBridge';
import { formatMoney, postForm } from '../lib/listUi';

function normItemId(id) {
  return parseInt(String(id ?? ''), 10) || 0;
}

function itemNeedsPrice(it) {
  if (it?.pharmacist_available) return false;
  if (it && it.needs_price != null) return !!it.needs_price;
  const catalogId = it?.catalog_id != null ? parseInt(it.catalog_id, 10) : null;
  const unitPrice = parseFloat(it?.unit_price || 0) || 0;
  return !catalogId || unitPrice <= 0;
}

function itemAwaitingPharmacy(it) {
  if (it && it.awaiting_pharmacy != null) return !!it.awaiting_pharmacy;
  const catalogId = it?.catalog_id != null ? parseInt(it.catalog_id, 10) : null;
  const unitPrice = parseFloat(it?.unit_price || 0) || 0;
  const isCustomZero = !catalogId || unitPrice <= 0;
  return isCustomZero && !it?.pharmacist_available;
}

function itemAwaitingPharmacistPrice(it) {
  if (it && it.awaiting_pharmacist_price != null) return !!it.awaiting_pharmacist_price;
  const unitPrice = parseFloat(it?.unit_price || 0) || 0;
  return !!it?.pharmacist_available && unitPrice <= 0;
}

function itemCanPayNow(it) {
  if (itemAwaitingPharmacy(it) || itemAwaitingPharmacistPrice(it)) return false;
  if (it?.ready_for_cashier) return true;
  const unitPrice = parseFloat(it?.unit_price || 0) || 0;
  const catalogId = it?.catalog_id != null ? parseInt(it.catalog_id, 10) : null;
  if (it?.pharmacist_available && unitPrice > 0) return true;
  return unitPrice > 0 || (catalogId && catalogId > 0);
}

function effectiveUnitPrice(it, priceEdits) {
  const id = normItemId(it.id);
  if (id > 0 && priceEdits[id] != null && priceEdits[id] !== '') {
    const n = parseFloat(priceEdits[id]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return parseFloat(it.unit_price || 0) || 0;
}

/** Visual indicator: patient will obtain this service outside the hospital. */
function ExternalStrike({ active, children, className = '' }) {
  if (!active) return <span className={className}>{children}</span>;
  return (
    <span className={`relative inline-block w-full text-red-700 ${className}`.trim()}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[38%] z-10 border-t-[2.5px] border-red-600"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[58%] z-10 border-t-[2.5px] border-red-600"
      />
      <span className="relative opacity-90">{children}</span>
    </span>
  );
}

export function OpdOrdersBillModal({ open, onClose, patientId, patientName, consultationId }) {
  const { t } = useTranslation('clinical');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [external, setExternal] = useState(new Set());
  const [priceEdits, setPriceEdits] = useState({});

  useEffect(() => {
    if (!open || !patientId) return;
    setLoading(true);
    setError('');
    setSelected(new Set());
    setExternal(new Set());
    setPriceEdits({});
    let url = `/cashier/opd-orders/pending?patient_id=${encodeURIComponent(patientId)}`;
    if (consultationId) url += `&consultation_id=${encodeURIComponent(consultationId)}`;
    fetch(url, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || t('modals.opdOrdersBill.failed_load'));
        const list = Array.isArray(d.items) ? d.items : [];
        setItems(list);
        setSelected(new Set(list.map((it) => normItemId(it.id)).filter((id) => id > 0 && itemCanPayNow(list.find((row) => normItemId(row.id) === id)))));
      })
      .catch((e) => setError(e.message || t('modals.opdOrdersBill.load_failed')))
      .finally(() => setLoading(false));
  }, [open, patientId, consultationId, t]);

  const payIds = useMemo(
    () => items.map((it) => normItemId(it.id)).filter((id) => id > 0 && selected.has(id) && !external.has(id)),
    [items, selected, external]
  );

  const deferredCount = useMemo(() => {
    let n = 0;
    for (const it of items) {
      const id = normItemId(it.id);
      if (id < 1 || external.has(id)) continue;
      if (!selected.has(id)) n += 1;
    }
    return n;
  }, [items, selected, external]);

  const needsPriceCount = useMemo(() => {
    let n = 0;
    for (const id of payIds) {
      const it = items.find((row) => normItemId(row.id) === id);
      if (it && itemNeedsPrice(it)) n += 1;
    }
    return n;
  }, [items, payIds]);

  const total = useMemo(() => {
    let sum = 0;
    for (const it of items) {
      const id = normItemId(it.id);
      if (selected.has(id) && !external.has(id)) {
        sum += effectiveUnitPrice(it, priceEdits) * (Number(it.quantity) || 1);
      }
    }
    return sum;
  }, [items, selected, external, priceEdits]);

  const setPaySelection = (ids) => {
    const next = new Set(ids.map(normItemId).filter((id) => id > 0));
    const nextExt = new Set(external);
    for (const id of nextExt) {
      if (next.has(id)) nextExt.delete(id);
    }
    setSelected(next);
    setExternal(nextExt);
  };

  const toggle = (rawId, field) => {
    const id = normItemId(rawId);
    if (id < 1) return;

    if (field === 'external') {
      const nextExt = new Set(external);
      const nextSel = new Set(selected);
      if (nextExt.has(id)) {
        nextExt.delete(id);
      } else {
        nextExt.add(id);
        nextSel.delete(id);
      }
      setExternal(nextExt);
      setSelected(nextSel);
      return;
    }

    const it = items.find((row) => normItemId(row.id) === id);
    if (!itemCanPayNow(it) && field === 'pay') return;

    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const setPrice = (rawId, value) => {
    const id = normItemId(rawId);
    if (id < 1) return;
    setPriceEdits((prev) => ({ ...prev, [id]: value }));
  };

  const submit = () => {
    const orderIds = payIds;
    const extIds = [...external].map(normItemId).filter((id) => id > 0);
    if (!orderIds.length && !extIds.length) {
      notifyError(t('modals.opdOrdersBill.select_item'), t('modals.opdOrdersBill.billing'));
      return;
    }

    const priceOverrides = {};
    for (const id of orderIds) {
      const it = items.find((row) => normItemId(row.id) === id);
      if (!it || !itemNeedsPrice(it)) continue;
      const raw = priceEdits[id];
      const price = parseFloat(raw);
      if (!Number.isFinite(price) || price <= 0) {
        notifyError(
          t('modals.opdOrdersBill.price_required', { item: it.item_name || t('modals.opdOrdersBill.col_item') }),
          t('modals.opdOrdersBill.billing')
        );
        return;
      }
      priceOverrides[id] = price;
    }

    const fields = {
      order_item_ids: orderIds.join(','),
      external_item_ids: extIds.join(',')};
    if (Object.keys(priceOverrides).length) {
      fields.price_overrides = JSON.stringify(priceOverrides);
    }
    postForm('/cashier/opd-orders/create-ticket', fields);
  };

  const subtitle = patientName
    ? `${patientName}${consultationId ? t('modals.opdOrdersBill.consult_prefix', { id: consultationId }) : ''}`
    : '';

  const canSubmit = payIds.length > 0 || external.size > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.opdOrdersBill.title')}
      subtitle={subtitle}
      size="xl"
      footer={
        <>
          {consultationId ? (
            <a
              href={`/cashier/prescriptions/${consultationId}/print`}
              target="_blank"
              rel="noreferrer"
              className="mr-auto inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900 hover:bg-rose-100"
            >
              🖨 {t('modals.opdOrdersBill.print_rx')}
            </a>
          ) : null}
          <div className="mr-auto hidden text-xs text-slate-500 sm:block">
            {t('modals.opdOrdersBill.summary', {
              paying: payIds.length,
              deferred: deferredCount})}
          </div>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton
            type="button"
            onClick={submit}
            label={t('modals.opdOrdersBill.create_ticket', { amount: formatMoney(total) })}
            disabled={loading || !canSubmit}
          />
        </>
      }
    >
      {loading ? <p className="py-8 text-center text-slate-500">{t('modals.opdOrdersBill.loading')}</p> : null}
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {!loading && !error && items.length > 0 ? (
        <div className="mb-4 space-y-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {t('modals.opdOrdersBill.partial_pay_hint')}
          </div>
          {items.some(itemAwaitingPharmacistPrice) ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
              {t('modals.opdOrdersBill.awaiting_pharmacist_price_hint')}
            </div>
          ) : null}
          {items.some(itemAwaitingPharmacy) ? (
            <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
              {t('modals.opdOrdersBill.awaiting_pharmacy_hint')}
            </div>
          ) : null}
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="py-8 text-center text-slate-500">{t('modals.opdOrdersBill.no_pending')}</p>
      ) : null}
      {!loading && items.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() =>
                setPaySelection(items.map((it) => normItemId(it.id)).filter((id) => id > 0 && !external.has(id)))
              }
            >
              {t('modals.opdOrdersBill.select_all_pay')}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => setPaySelection([])}
            >
              {t('modals.opdOrdersBill.clear_pay')}
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">{t('modals.opdOrdersBill.col_pay')}</th>
                <th className="px-3 py-2">{t('modals.opdOrdersBill.col_ext')}</th>
                <th className="px-3 py-2">{t('modals.opdOrdersBill.col_type')}</th>
                <th className="px-3 py-2">{t('modals.opdOrdersBill.col_item')}</th>
                <th className="px-3 py-2 text-right">{t('modals.opdOrdersBill.col_unit_price')}</th>
                <th className="px-3 py-2">{t('modals.opdOrdersBill.col_code')}</th>
                <th className="px-3 py-2 text-right">{t('modals.opdOrdersBill.col_total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => {
                const id = normItemId(it.id);
                const needsPrice = itemNeedsPrice(it);
                const awaitingPharmacy = itemAwaitingPharmacy(it);
                const awaitingPharmacistPrice = itemAwaitingPharmacistPrice(it);
                const canPay = itemCanPayNow(it);
                const unitPrice = effectiveUnitPrice(it, priceEdits);
                const lineTotal = unitPrice * (Number(it.quantity) || 1);
                const isExternal = external.has(id);
                const isPaying = selected.has(id) && !isExternal && canPay;
                const isDeferred = !isExternal && !isPaying && canPay;
                const showPriceInput = needsPrice && isPaying && !it?.pharmacist_available;
                return (
                  <tr
                    key={id}
                    className={
                      isExternal
                        ? 'bg-red-50/60'
                        : awaitingPharmacy || awaitingPharmacistPrice
                          ? 'bg-teal-50/50'
                          : isDeferred
                            ? 'bg-slate-50/80 opacity-75'
                            : needsPrice && isPaying
                              ? 'bg-violet-50/50'
                              : undefined
                    }
                    title={
                      isExternal
                        ? t('modals.opdOrdersBill.external_hint')
                        : awaitingPharmacistPrice
                          ? t('modals.opdOrdersBill.awaiting_pharmacist_price_row_hint')
                          : awaitingPharmacy
                            ? t('modals.opdOrdersBill.awaiting_pharmacy_row_hint')
                            : isDeferred
                              ? t('modals.opdOrdersBill.deferred_hint')
                              : needsPrice
                                ? t('modals.opdOrdersBill.enter_price_hint')
                                : undefined
                    }
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isPaying}
                        disabled={isExternal || !canPay}
                        aria-label={t('modals.opdOrdersBill.col_pay')}
                        onChange={() => toggle(id, 'pay')}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isExternal}
                        aria-label={t('modals.opdOrdersBill.col_ext')}
                        onChange={() => toggle(id, 'external')}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs uppercase">
                      <ExternalStrike active={isExternal}>{it.item_type}</ExternalStrike>
                    </td>
                    <td className="px-3 py-2">
                      <ExternalStrike active={isExternal}>
                        {it.item_name}
                        {awaitingPharmacistPrice ? (
                          <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
                            {t('modals.opdOrdersBill.awaiting_pharmacist_price_badge')}
                          </span>
                        ) : null}
                        {awaitingPharmacy ? (
                          <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-800">
                            {t('modals.opdOrdersBill.awaiting_pharmacy_badge')}
                          </span>
                        ) : null}
                        {it?.pharmacist_available && unitPrice > 0 ? (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                            {t('modals.opdOrdersBill.off_catalog_badge')}
                          </span>
                        ) : null}
                        {isDeferred ? (
                          <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                            {t('modals.opdOrdersBill.pay_later_badge')}
                          </span>
                        ) : null}
                      </ExternalStrike>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {showPriceInput ? (
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="w-28 rounded-lg border border-violet-300 bg-white px-2 py-1 text-right text-sm font-semibold text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                          placeholder={t('modals.opdOrdersBill.price_ph')}
                          value={priceEdits[id] ?? ''}
                          onChange={(e) => setPrice(id, e.target.value)}
                        />
                      ) : (
                        <ExternalStrike active={isExternal} className="font-medium text-slate-700">
                          {formatMoney(unitPrice)}
                        </ExternalStrike>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 font-mono text-xs text-slate-400"
                      title={t('modals.opdOrdersBill.code_after_payment')}
                    >
                      —
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      <ExternalStrike active={isExternal}>{formatMoney(lineTotal)}</ExternalStrike>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Modal>
  );
}
