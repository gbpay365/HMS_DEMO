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

const REFUND_METHODS = [
  { value: 'Cash', key: 'cash' },
  { value: 'MOMO', key: 'momo' },
  { value: 'OM', key: 'om' },
  { value: 'Bank', key: 'bank' },
  { value: 'Wallet', key: 'wallet' },
];

export function IpdSettleModal({ open, onClose, admission }) {
  const { t } = useTranslation('ipd');
  if (!admission) return null;
  const total = parseFloat(admission.total_charges || 0) || 0;
  const deposit = parseFloat(admission.deposit_amount || 0) || 0;
  const balance = typeof admission.balance === 'number' ? admission.balance : Math.max(0, total - deposit);
  const refund = typeof admission.refund === 'number' ? admission.refund : Math.max(0, deposit - total);
  const wardBed = [admission.ward_name, admission.bed_label].filter(Boolean).join(' · ') || '—';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.settle_title')}
      subtitle={`${admission.first_name || ''} ${admission.last_name || ''}`.trim()}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="hms-ipd-settle-form" variant="warning" label={t('modals.settle_confirm')} />
        </>
      }
    >
      <form id="hms-ipd-settle-form" method="post" action="/cashier/ipd-settle" className="space-y-4">
        <input type="hidden" name="admission_id" value={admission.admission_id} />
        <input type="hidden" name="refund_amount" value={refund > 0 ? refund : 0} />
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t('modals.settle_hint')}
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <div className="font-bold text-amber-950">
            {admission.first_name} {admission.last_name}
          </div>
          <div className="text-xs text-slate-600">{wardBed}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-emerald-50 p-3">
            <div className="text-[10px] font-bold uppercase text-slate-500">{t('modals.total_charges')}</div>
            <div className="text-lg font-extrabold">{formatMoney(total)}</div>
          </div>
          <div className="rounded-xl bg-sky-50 p-3">
            <div className="text-[10px] font-bold uppercase text-slate-500">{t('modals.deposit_paid')}</div>
            <div className="text-lg font-extrabold text-sky-800">{formatMoney(deposit)}</div>
          </div>
          <div className="rounded-xl bg-red-50 p-3">
            <div className="text-[10px] font-bold uppercase text-red-600">{refund > 0 ? t('modals.refund') : t('modals.balance_due')}</div>
            <div className="text-lg font-extrabold text-red-700">{formatMoney(refund > 0 ? refund : balance)}</div>
          </div>
        </div>
        <div>
          <label className="hms-label">{t('modals.payment_method')}</label>
          <select name="payment_method" className="hms-input" defaultValue="Cash">
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {t(`modals.pay_methods.${m.key}`)}
              </option>
            ))}
          </select>
        </div>
        {refund > 0 ? (
          <div>
            <label className="hms-label">{t('modals.refund_method')}</label>
            <select name="refund_method" className="hms-input" required defaultValue="">
              <option value="">{t('modals.select')}</option>
              {REFUND_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {t(`modals.pay_methods.${m.key}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {balance === 0 && refund === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {t('modals.zero_balance')}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
