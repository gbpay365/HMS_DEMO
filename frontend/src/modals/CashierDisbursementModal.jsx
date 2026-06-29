import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../components/FaIcon';
import { priceUnitLabel } from '../lib/hmsLocale';
import {
  DISBURSEMENT_TYPES,
  DISBURSEMENT_CATEGORIES,
  resolveDisbursementPaymentMethods,
} from '../lib/cashierDisbursementOptions';

export function CashierDisbursementModal({ open, onClose, onSuccess }) {
  const { t } = useTranslation('clinical');
  const [txnType, setTxnType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('utilities');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [narration, setNarration] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [subAccountPrompt, setSubAccountPrompt] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);

  const methods = useMemo(() => resolveDisbursementPaymentMethods(), []);

  if (!open) return null;

  const payloadFromForm = () => ({
    txn_type: txnType,
    amount: parseFloat(amount) || 0,
    category,
    payment_method: paymentMethod,
    narration: narration.trim(),
  });

  function submitViaForm(body, autoCreateSubAccounts = false) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/cashier/disbursement';
    const fields = {
      txn_type: body.txn_type,
      amount: body.amount,
      category: body.category,
      payment_method: body.payment_method,
      narration: body.narration,
    };
    if (autoCreateSubAccounts) fields.auto_create_sub_accounts = '1';
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = String(value ?? '');
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  async function submitDisbursement(body, autoCreateSubAccounts = false) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/cashier/disbursement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...body, autoCreateSubAccounts }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) {
        submitViaForm(body, autoCreateSubAccounts);
        return;
      }
      if (res.status === 422 && data.needsSubAccounts) {
        setPendingPayload(body);
        setSubAccountPrompt(data.missing || []);
        return;
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || t('cashier.disbursement.failed', { defaultValue: 'Disbursement failed.' }));
      }
      setSubAccountPrompt(null);
      setPendingPayload(null);
      if (onSuccess) onSuccess(data);
      else window.location.assign(`/cashier/ledger?msg=${encodeURIComponent(data.message || 'Disbursement recorded.')}`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await submitDisbursement(payloadFromForm(), false);
  }

  async function confirmAutoCreate() {
    if (!pendingPayload) return;
    await submitDisbursement(pendingPayload, true);
  }

  return (
    <div className="cs-profile-modal-backdrop" role="dialog" aria-modal="true">
      <div className="cs-profile-modal">
        <div className="cs-profile-modal__head">
          <div className="cs-profile-modal__head-text">
            <h2>{t('cashier.disbursement.title')}</h2>
            <p className="cs-profile-modal__subtitle">{t('cashier.disbursement.subtitle')}</p>
          </div>
          <button
            type="button"
            className="cs-profile-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <FaIcon name="times" />
          </button>
        </div>

        {subAccountPrompt ? (
          <>
            <div className="cs-profile-modal__body">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <p className="font-semibold">{t('cashier.disbursement.subaccounts_title')}</p>
                <p className="mt-2">{t('cashier.disbursement.subaccounts_body')}</p>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  {subAccountPrompt.map((row) => (
                    <li key={`${row.role}-${row.motherCode}`}>
                      <span className="font-medium capitalize">{row.role}</span>: {row.motherCode} ({row.motherLabel}) →{' '}
                      <span className="font-mono">{row.proposedCode}</span>
                      {row.proposedLabel ? ` — ${row.proposedLabel}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="cs-profile-modal__actions">
              <button
                type="button"
                className="cs-btn"
                disabled={busy}
                onClick={() => {
                  setSubAccountPrompt(null);
                  setPendingPayload(null);
                }}
              >
                {t('cashier.disbursement.cancel')}
              </button>
              <button type="button" className="cs-btn cs-btn-primary" disabled={busy} onClick={confirmAutoCreate}>
                {busy ? t('cashier.disbursement.working') : t('cashier.disbursement.subaccounts_confirm')}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="cs-profile-modal__form">
            <div className="cs-profile-modal__body space-y-4">
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
              ) : null}
              <div className="cs-profile-field">
                <label className="cs-profile-field__label">{t('cashier.disbursement.type')}</label>
                <select name="txn_type" className="hms-input cs-profile-input w-full" value={txnType} onChange={(e) => setTxnType(e.target.value)}>
                  {DISBURSEMENT_TYPES.map((row) => (
                    <option key={row.value} value={row.value}>
                      {t(row.labelKey, { defaultValue: row.value.replace(/_/g, ' ') })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cs-profile-field">
                <label className="cs-profile-field__label">
                  {t('cashier.disbursement.amount', { currency: priceUnitLabel(), defaultValue: `Amount (${priceUnitLabel()})` })}
                </label>
                <input
                  name="amount"
                  type="number"
                  min="1"
                  step="1"
                  required
                  className="hms-input cs-profile-input w-full"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="cs-profile-field">
                <label className="cs-profile-field__label">{t('cashier.disbursement.category')}</label>
                <select name="category" className="hms-input cs-profile-input w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {DISBURSEMENT_CATEGORIES.map((row) => (
                    <option key={row.value} value={row.value}>
                      {t(row.labelKey, { defaultValue: row.value.replace(/_/g, ' ') })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cs-profile-field">
                <label className="cs-profile-field__label">{t('cashier.disbursement.method')}</label>
                <select
                  name="payment_method"
                  className="hms-input cs-profile-input w-full"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="cs-profile-field">
                <label className="cs-profile-field__label">{t('cashier.disbursement.description')}</label>
                <textarea
                  name="narration"
                  required
                  rows={3}
                  className="hms-input cs-profile-input cs-profile-textarea w-full"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder={t('cashier.disbursement.description_ph')}
                />
              </div>
            </div>
            <div className="cs-profile-modal__actions">
              <button type="button" className="cs-btn" onClick={onClose} disabled={busy}>
                {t('cashier.disbursement.cancel')}
              </button>
              <button type="submit" className="cs-btn cs-btn-primary" disabled={busy}>
                {busy ? t('cashier.disbursement.working') : t('cashier.disbursement.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
