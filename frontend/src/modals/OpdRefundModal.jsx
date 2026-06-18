import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { notifyError } from '../lib/notifyBridge';
import { formatMoney, postForm } from '../lib/listUi';

const REFUND_METHODS = [
  { value: 'Cash', key: 'cash' },
  { value: 'MOMO', key: 'momo' },
  { value: 'OM', key: 'om' },
  { value: 'Bank', key: 'bank' },
  { value: 'Wallet', key: 'wallet' },
];

const REFUND_REASONS = [
  { value: 'not_available', key: 'not_available' },
  { value: 'out_of_stock', key: 'out_of_stock' },
  { value: 'not_in_catalog', key: 'not_in_catalog' },
];

function normItemId(id) {
  return parseInt(String(id ?? ''), 10) || 0;
}

function flattenRefundableItems(data) {
  if (!data) return [];
  const out = [];
  for (const type of ['laboratory', 'radiology', 'pharmacy']) {
    const section = data.sections?.[type];
    const items = section?.items || data[type] || [];
    for (const it of items) {
      if (it && it.refundable) out.push({ ...it, item_type: it.item_type || type });
    }
  }
  return out;
}

function statusLabel(t, it) {
  const st = String(it.status || '').toLowerCase();
  if (st === 'refunded') return t('modals.opdRefund.status_refunded');
  if (st === 'paid') return t('modals.opdRefund.status_paid');
  if (st === 'served' || st === 'dispensed') return t('modals.opdRefund.status_served');
  return it.status || '—';
}

export function OpdRefundModal({ open, onClose, consultationId, patientName, doctorName }) {
  const { t } = useTranslation('clinical');
  const { t: tIpd } = useTranslation('ipd');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [refundMethod, setRefundMethod] = useState('Cash');
  const [reasonCode, setReasonCode] = useState('not_available');
  const [reasonNotes, setReasonNotes] = useState('');

  useEffect(() => {
    if (!open || !consultationId) return;
    setLoading(true);
    setError('');
    setData(null);
    setSelected(new Set());
    setRefundMethod('Cash');
    setReasonCode('not_available');
    setReasonNotes('');
    fetch(`/cashier/prescriptions/${encodeURIComponent(consultationId)}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error || t('modals.opdRefund.failed_load'));
        setData(d.data || null);
        const refundable = flattenRefundableItems(d.data);
        setSelected(new Set(refundable.map((it) => normItemId(it.id)).filter((id) => id > 0)));
      })
      .catch((e) => setError(e.message || t('modals.opdRefund.load_failed')))
      .finally(() => setLoading(false));
  }, [open, consultationId, t]);

  const refundableItems = useMemo(() => flattenRefundableItems(data), [data]);
  const allItems = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (const type of ['laboratory', 'radiology', 'pharmacy']) {
      const section = data.sections?.[type];
      const items = section?.items || data[type] || [];
      for (const it of items) out.push({ ...it, item_type: it.item_type || type });
    }
    return out;
  }, [data]);

  const total = useMemo(() => {
    let sum = 0;
    for (const it of refundableItems) {
      const id = normItemId(it.id);
      if (selected.has(id)) sum += Number(it.line_total) || (Number(it.unit_price) || 0) * (Number(it.quantity) || 1);
    }
    return sum;
  }, [refundableItems, selected]);

  const toggle = (rawId) => {
    const id = normItemId(rawId);
    if (id < 1) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const submit = () => {
    const ids = [...selected].map(normItemId).filter((id) => id > 0);
    if (!ids.length) {
      notifyError(t('modals.opdRefund.select_item'), t('modals.opdRefund.title'));
      return;
    }
    const reasonLabel = t(`modals.opdRefund.reasons.${reasonCode}`);
    const refundReason = reasonNotes.trim() ? `${reasonLabel} — ${reasonNotes.trim()}` : reasonLabel;
    postForm('/cashier/opd-orders/refund', {
      consultation_id: consultationId,
      order_item_ids: ids.join(','),
      refund_method: refundMethod,
      refund_reason: refundReason,
      refund_reason_code: reasonCode});
  };

  const subtitle = [patientName, doctorName].filter(Boolean).join(' · ');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.opdRefund.title')}
      subtitle={subtitle}
      size="xl"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton
            type="button"
            variant="danger"
            onClick={submit}
            label={t('modals.opdRefund.confirm', { amount: formatMoney(total) })}
            disabled={loading || !selected.size}
          />
        </>
      }
    >
      {loading ? <p className="py-8 text-center text-slate-500">{t('modals.opdRefund.loading')}</p> : null}
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {!loading && !error ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {t('modals.opdRefund.hint')}
        </div>
      ) : null}
      {!loading && !error && refundableItems.length === 0 ? (
        <p className="py-8 text-center text-slate-500">{t('modals.opdRefund.no_refundable')}</p>
      ) : null}
      {!loading && allItems.length > 0 ? (
        <>
          <div className="mb-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t('modals.opdRefund.col_refund')}</th>
                  <th className="px-3 py-2">{t('modals.opdRefund.col_type')}</th>
                  <th className="px-3 py-2">{t('modals.opdRefund.col_item')}</th>
                  <th className="px-3 py-2">{t('modals.opdRefund.col_status')}</th>
                  <th className="px-3 py-2 text-right">{t('modals.opdRefund.col_amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allItems.map((it) => {
                  const id = normItemId(it.id);
                  const lineTotal = Number(it.line_total) || (Number(it.unit_price) || 0) * (Number(it.quantity) || 1);
                  const canRefund = !!it.refundable;
                  return (
                    <tr key={id} className={canRefund ? undefined : 'opacity-60'}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          disabled={!canRefund}
                          onChange={() => toggle(id)}
                          aria-label={t('modals.opdRefund.col_refund')}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs uppercase">{it.item_type}</td>
                      <td className="px-3 py-2 font-medium">{it.name}</td>
                      <td className="px-3 py-2 text-xs">{statusLabel(t, it)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatMoney(lineTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="hms-label">{tIpd('modals.refund_method')}</label>
              <select className="hms-input" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                {REFUND_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {tIpd(`modals.pay_methods.${m.key}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hms-label">{t('modals.opdRefund.reason_label')}</label>
              <select className="hms-input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                {REFUND_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t(`modals.opdRefund.reasons.${r.key}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="hms-label">{t('modals.opdRefund.notes_label')}</label>
              <input
                className="hms-input"
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder={t('modals.opdRefund.notes_ph')}
              />
            </div>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
