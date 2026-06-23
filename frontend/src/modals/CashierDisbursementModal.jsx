import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../components/FaIcon';
import {
  DISBURSEMENT_TYPES,
  DISBURSEMENT_CATEGORIES,
  resolveDisbursementPaymentMethods,
} from '../lib/cashierDisbursementOptions';

export function CashierDisbursementModal({ open, onClose, paymentMethods = [] }) {
  const { t } = useTranslation('clinical');
  const [txnType, setTxnType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('utilities');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [narration, setNarration] = useState('');

  const methods = useMemo(() => resolveDisbursementPaymentMethods(paymentMethods), [paymentMethods]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">{t('cashier.disbursement.title')}</h2>
            <p className="text-sm text-slate-500">{t('cashier.disbursement.subtitle')}</p>
          </div>
          <button type="button" className="text-slate-400 hover:text-ink" onClick={onClose} aria-label="Close">
            <FaIcon name="times" />
          </button>
        </div>
        <form action="/cashier/disbursement" method="POST" className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold">{t('cashier.disbursement.type')}</label>
            <select name="txn_type" className="hms-input w-full" value={txnType} onChange={(e) => setTxnType(e.target.value)}>
              {DISBURSEMENT_TYPES.map((row) => (
                <option key={row.value} value={row.value}>
                  {t(row.labelKey, { defaultValue: row.value.replace(/_/g, ' ') })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">{t('cashier.disbursement.amount')}</label>
            <input name="amount" type="number" min="1" step="1" required className="hms-input w-full" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">{t('cashier.disbursement.category')}</label>
            <select name="category" className="hms-input w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
              {DISBURSEMENT_CATEGORIES.map((row) => (
                <option key={row.value} value={row.value}>
                  {t(row.labelKey, { defaultValue: row.value.replace(/_/g, ' ') })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">{t('cashier.disbursement.method')}</label>
            <select name="payment_method" className="hms-input w-full" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {methods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">{t('cashier.disbursement.description')}</label>
            <textarea name="narration" required rows={3} className="hms-input w-full" value={narration} onChange={(e) => setNarration(e.target.value)} placeholder={t('cashier.disbursement.description_ph')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="hms-btn-secondary" onClick={onClose}>{t('cashier.disbursement.cancel')}</button>
            <button type="submit" className="hms-btn-primary">{t('cashier.disbursement.submit')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
