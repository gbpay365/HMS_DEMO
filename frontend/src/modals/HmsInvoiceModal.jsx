import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ModalCancelButton } from '../components/ModalActions';
import { HmsButton } from '../components/HmsButton';
import { FormErrorBanner } from '../components/FormErrorBanner';
import { notifyError } from '../lib/notifyBridge';
import { formatMoney, hasPerm } from '../lib/listUi';
import { readBootUserPerms } from '../lib/readBootUserPerms';

export function HmsInvoiceModal({ open, visitId, onClose }) {
  const { t } = useTranslation('legacy');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [creating, setCreating] = useState(false);
  const userPerms = useMemo(() => readBootUserPerms(), []);
  const canSettle = hasPerm(userPerms, 'cashier.write');

  useEffect(() => {
    if (!open || !visitId) {
      setData(null);
      setError('');
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/hms/api/visit/${visitId}/billing`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setLoading(false);
        if (!j.ok) {
          setError(j.error || t('hms_invoice_modal.load_error'));
          return;
        }
        setData(j);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(t('hms_invoice_modal.network_error'));
      });
    return () => {
      cancelled = true;
    };
  }, [open, visitId, t]);

  const visit = data?.visit;
  const items = data?.pendingItems || [];
  const pendingTotal = data?.pendingTotal || 0;
  const showCashierLink = canSettle && visit?.ticket_status === 'pending' && visit?.ticket_id;
  const showCreate =
    canSettle && items.length > 0 && !(visit?.ticket_status === 'pending' && visit?.ticket_id);

  const ticketPart = visit?.ticket_number ? ` · ${visit.ticket_number}` : '';

  const createTicket = async () => {
    setCreating(true);
    try {
      const r = await fetch(`/hms/api/visit/${visitId}/create-ticket`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }});
      const j = await r.json();
      if (j.ok && j.redirect) {
        window.location.href = j.redirect;
        return;
      }
      notifyError(j.error || t('hms_invoice_modal.create_error'));
    } catch {
      notifyError(t('hms_invoice_modal.request_failed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('hms_invoice_modal.title')}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} label={t('portal_shared.close')} />
          {showCashierLink ? (
            <HmsButton
              as="a"
              variant="secondary"
              href={`/cashier/settle/${visit.ticket_id}`}
              target="_blank"
              rel="noopener noreferrer"
              icon="external-link"
            >
              {t('hms_invoice_modal.open_cashier')}
            </HmsButton>
          ) : null}
          {showCreate ? (
            <HmsButton variant="primary" icon="money" disabled={creating} onClick={createTicket}>
              {t('hms_invoice_modal.create_ticket')}
            </HmsButton>
          ) : null}
        </>
      }
    >
      {loading ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <i className="fa fa-spinner fa-spin text-brand" aria-hidden="true" />
          {t('hms_invoice_modal.loading')}
        </p>
      ) : null}

      {error ? <FormErrorBanner message={error} /> : null}

      {!loading && !error && visit ? (
        <div>
          <p className="mb-2">
            <strong className="text-ink">
              {visit.first_name} {visit.last_name}
            </strong>
            <span className="ml-1 text-sm text-slate-500">
              {t('hms_invoice_modal.visit_meta', { id: visit.id, ticket: ticketPart })}
            </span>
          </p>
          <p className="mb-4 text-sm text-slate-600">
            {visit.ticket_code
              ? t('hms_invoice_modal.ticket_line', {
                  code: visit.ticket_code,
                  status: visit.ticket_status || ''})
              : t('hms_invoice_modal.no_ticket')}
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('hms_invoice_modal.col_item')}</th>
                  <th className="px-4 py-3 text-right">{t('hms_invoice_modal.col_qty')}</th>
                  <th className="px-4 py-3 text-right">{t('hms_invoice_modal.col_amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!items.length ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      {t('hms_invoice_modal.no_pending')}
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => {
                    const amt = (parseFloat(it.unit_price) || 0) * (parseFloat(it.quantity) || 1);
                    return (
                      <tr key={idx}>
                        <td className="px-4 py-3 font-medium text-ink">
                          {it.item_name || t('hms_invoice_modal.service_fallback')}
                        </td>
                        <td className="px-4 py-3 text-right">{it.quantity || 1}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatMoney(amt)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {items.length ? (
                <tfoot className="bg-slate-50 font-bold text-ink">
                  <tr>
                    <th colSpan={2} className="px-4 py-3 text-right">
                      {t('hms_invoice_modal.total')}
                    </th>
                    <th className="px-4 py-3 text-right">{formatMoney(pendingTotal)}</th>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
