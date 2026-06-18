import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { formatMoney } from '../lib/listUi';

const PAYMENT_METHODS = [
  { value: 'Cash', key: 'cash' },
  { value: 'Mobile Money', key: 'mobile_money' },
  { value: 'Orange Money', key: 'orange_money' },
  { value: 'Bank Transfer', key: 'bank_transfer' },
  { value: 'Insurance', key: 'insurance' },
  { value: 'Wallet', key: 'wallet' },
];

export function ErSettleModal({ open, onClose, visit }) {
  const { t } = useTranslation('clinical');
  if (!visit) return null;
  const balance = parseFloat(visit.balance_due || 0) || 0;
  const total = parseFloat(visit.total_charges || 0) || 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('erDischarge.settle_title')}
      subtitle={`${visit.first_name || ''} ${visit.last_name || ''}`.trim()}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="hms-er-settle-form" variant="danger" label={t('erDischarge.settle_confirm')} />
        </>
      }
    >
      <form id="hms-er-settle-form" method="post" action="/cashier/er-settle" className="space-y-4">
        <input type="hidden" name="visit_id" value={visit.visit_id} />
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {t('erDischarge.settle_hint')}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-bold">
            {visit.first_name} {visit.last_name}
          </div>
          <div className="text-xs text-slate-500">
            {visit.ticket_number || `Visit #${visit.visit_id}`}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center text-sm">
          <div className="rounded-xl bg-emerald-50 p-3">
            <div className="text-[10px] font-bold uppercase text-slate-500">{t('erDischarge.total_charges')}</div>
            <div className="text-lg font-extrabold">{formatMoney(total)}</div>
          </div>
          <div className="rounded-xl bg-red-50 p-3">
            <div className="text-[10px] font-bold uppercase text-red-600">{t('erDischarge.balance_due')}</div>
            <div className="text-lg font-extrabold text-red-700">{formatMoney(balance)}</div>
          </div>
        </div>
        <div>
          <label className="hms-label">{t('erDischarge.payment_method')}</label>
          <select name="payment_method" className="hms-input" defaultValue="Cash">
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {t(`ipd:modals.pay_methods.${m.key}`)}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
  );
}
