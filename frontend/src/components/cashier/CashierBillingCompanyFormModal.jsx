import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';

const EMPTY = {
  name: '',
  tax_id: '',
  billing_address: '',
  phone: '',
  email: '',
};

export function CashierBillingCompanyFormModal({ open, initialName = '', onClose, onSaved }) {
  const { t: tOps } = useTranslation('ops');
  const [form, setForm] = useState({ ...EMPTY, name: initialName });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, name: String(initialName || '').trim() });
    setError('');
    setBusy(false);
  }, [open, initialName]);

  if (!open) return null;

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const save = async () => {
    const name = String(form.name || '').trim();
    if (!name) {
      setError(tOps('cashier_odoo.company_err_name', { defaultValue: 'Company name is required.' }));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/cashier/billing-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name,
          tax_id: form.tax_id.trim() || null,
          billing_address: form.billing_address.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok || !data.company) {
        setError(data.error || tOps('cashier_odoo.company_err_save', { defaultValue: 'Could not save company.' }));
        return;
      }
      onSaved?.(data.company);
      onClose?.();
    } catch {
      setError(tOps('cashier_odoo.company_err_save', { defaultValue: 'Could not save company.' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inv-company-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-company-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inv-company-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inv-company-head">
          <h3 id="inv-company-title">
            {tOps('cashier_odoo.company_form_title', { defaultValue: 'New billing company' })}
          </h3>
          <button type="button" className="inv-new-close" onClick={onClose} aria-label="Close">
            <FaIcon name="times" />
          </button>
        </div>
        <div className="inv-company-body">
          {error ? <div className="inv-new-error">{error}</div> : null}
          <label className="inv-new-field">
            <span>
              {tOps('cashier_odoo.company_name', { defaultValue: 'Company name' })}
              <span className="inv-new-req">*</span>
            </span>
            <input
              className="cs-input inv-new-input"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              autoFocus
            />
          </label>
          <label className="inv-new-field">
            <span>{tOps('cashier_odoo.company_tax_id', { defaultValue: 'Tax ID / NIU' })}</span>
            <input
              className="cs-input inv-new-input"
              value={form.tax_id}
              onChange={(e) => setField('tax_id', e.target.value)}
            />
          </label>
          <label className="inv-new-field">
            <span>{tOps('cashier_odoo.company_address', { defaultValue: 'Billing address' })}</span>
            <textarea
              className="cs-input inv-new-input inv-new-textarea"
              rows={3}
              value={form.billing_address}
              onChange={(e) => setField('billing_address', e.target.value)}
            />
          </label>
          <div className="inv-company-row">
            <label className="inv-new-field">
              <span>{tOps('cashier_odoo.company_phone', { defaultValue: 'Phone' })}</span>
              <input
                className="cs-input inv-new-input"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </label>
            <label className="inv-new-field">
              <span>{tOps('cashier_odoo.company_email', { defaultValue: 'Email' })}</span>
              <input
                type="email"
                className="cs-input inv-new-input"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="inv-company-foot">
          <button type="button" className="cs-btn inv-new-btn-outline" onClick={onClose} disabled={busy}>
            {tOps('cashier_odoo.invoice_cancel', { defaultValue: 'Cancel' })}
          </button>
          <button type="button" className="cs-btn cs-btn-primary" onClick={save} disabled={busy}>
            {tOps('cashier_odoo.company_save', { defaultValue: 'Save company' })}
          </button>
        </div>
      </div>
    </div>
  );
}
