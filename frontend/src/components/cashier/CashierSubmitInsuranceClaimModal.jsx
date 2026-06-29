import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { currencyCode } from '../../lib/hmsLocale';
import { notifySuccess } from '../../lib/notifyBridge';

const COVER_TYPES = [
  { id: 'full_cover', labelKey: 'claim_cover_full', defaultLabel: 'Full cover' },
  { id: 'partial_cover', labelKey: 'claim_cover_partial', defaultLabel: 'Partial cover' },
  { id: 'copay', labelKey: 'claim_cover_copay', defaultLabel: 'Co-pay' },
  { id: 'exclusion', labelKey: 'claim_cover_exclusion', defaultLabel: 'Exclusion list' },
];

export function CashierSubmitInsuranceClaimModal({ open, onClose, onCreated }) {
  const { t: tOps } = useTranslation('ops');
  const [patientQuery, setPatientQuery] = useState('');
  const [patientId, setPatientId] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [carriers, setCarriers] = useState([]);
  const [policyNumber, setPolicyNumber] = useState('');
  const [linkedBill, setLinkedBill] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [coverType, setCoverType] = useState('full_cover');
  const [diagnosis, setDiagnosis] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const reset = useCallback(() => {
    setPatientQuery('');
    setPatientId('');
    setCarrierId('');
    setPolicyNumber('');
    setLinkedBill('');
    setClaimAmount('');
    setCoverType('full_cover');
    setDiagnosis('');
    setSuggestions([]);
    setFormError('');
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    fetch('/api/cashier/insurance-carriers', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then((r) => r.json())
      .then((data) => {
        const rows = Array.isArray(data.carriers) ? data.carriers : [];
        setCarriers(rows);
        if (rows.length) {
          const cnps = rows.find((c) => String(c.code || c.name || '').toUpperCase().includes('CNPS'));
          setCarrierId(String((cnps || rows[0]).id));
        }
      })
      .catch(() => setCarriers([]));
  }, [open, reset]);

  useEffect(() => {
    if (!open || patientId) {
      setSuggestions([]);
      return undefined;
    }
    const q = patientQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      fetch(`/api/patients/search?q=${encodeURIComponent(q)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })
        .then((r) => r.json())
        .then((rows) => setSuggestions(Array.isArray(rows) ? rows.slice(0, 8) : []))
        .catch(() => setSuggestions([]));
    }, 280);
    return () => clearTimeout(timer);
  }, [patientQuery, open, patientId]);

  const pickPatient = (p) => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    setPatientQuery(name);
    setPatientId(String(p.id));
    setSuggestions([]);
    setFormError('');
  };

  const submit = async () => {
    setFormError('');
    const query = patientQuery.trim();
    if (!query) {
      setFormError(tOps('cashier_odoo.claim_err_patient', { defaultValue: 'Patient is required.' }));
      return;
    }
    if (!carrierId) {
      setFormError(tOps('cashier_odoo.claim_err_provider', { defaultValue: 'Insurance provider is required.' }));
      return;
    }
    if (!policyNumber.trim()) {
      setFormError(tOps('cashier_odoo.claim_err_policy', { defaultValue: 'Policy number is required.' }));
      return;
    }
    const amount = parseFloat(claimAmount);
    if (!amount || amount <= 0) {
      setFormError(tOps('cashier_odoo.claim_err_amount', { defaultValue: 'Claim amount must be greater than zero.' }));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/cashier/insurance-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          patient_id: patientId || undefined,
          patient_query: query,
          carrier_id: carrierId,
          policy_number: policyNumber.trim(),
          linked_ticket_code: linkedBill.trim() || null,
          billed_amount: amount,
          cover_type: coverType,
          diagnosis: diagnosis.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        setFormError(data.error || tOps('cashier_odoo.claim_err_save', { defaultValue: 'Could not submit claim.' }));
        return;
      }
      notifySuccess(
        tOps('cashier_odoo.claim_submitted', {
          defaultValue: 'Insurance claim submitted.',
          ref: data.claim_ref || '',
        }),
      );
      onCreated?.(data);
      onClose();
    } catch {
      setFormError(tOps('cashier_odoo.claim_err_save', { defaultValue: 'Could not submit claim.' }));
    } finally {
      setBusy(false);
    }
  };

  const amountLabel = tOps('cashier_odoo.claim_amount', {
    defaultValue: 'Claim amount ({{code}})',
    code: currencyCode() || 'FCFA',
  });

  if (!open) return null;

  return (
    <div className="ins-claim-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ins-claim-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ins-claim-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ins-claim-head">
          <h2 id="ins-claim-title">
            {tOps('cashier_odoo.claim_submit_title', { defaultValue: 'Submit insurance claim' })}
          </h2>
          <button type="button" className="ins-claim-close" onClick={onClose} aria-label="Close">
            <FaIcon name="times" />
          </button>
        </div>

        <div className="ins-claim-body">
          {formError ? <div className="ins-claim-error">{formError}</div> : null}

          <div className="ins-claim-grid">
            <label className="ins-claim-field">
              <span>
                {tOps('cashier_odoo.claim_patient', { defaultValue: 'Patient' })}
                <span className="ins-claim-req">*</span>
              </span>
              <div className="ins-claim-patient-wrap">
                <input
                  className="cs-input ins-claim-input"
                  value={patientQuery}
                  onChange={(e) => {
                    setPatientQuery(e.target.value);
                    setPatientId('');
                    setFormError('');
                  }}
                  placeholder={tOps('cashier_odoo.claim_patient_ph', { defaultValue: 'Name or ID' })}
                  autoComplete="off"
                />
                {suggestions.length > 0 ? (
                  <ul className="ins-claim-suggest">
                    {suggestions.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => pickPatient(p)}>
                          {p.first_name} {p.last_name}
                          <span className="ins-claim-suggest-meta">#{p.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </label>

            <label className="ins-claim-field">
              <span>
                {tOps('cashier_odoo.claim_provider', { defaultValue: 'Insurance provider' })}
                <span className="ins-claim-req">*</span>
              </span>
              <select
                className="cs-input ins-claim-input ins-claim-select"
                value={carrierId}
                onChange={(e) => setCarrierId(e.target.value)}
              >
                {carriers.length === 0 ? (
                  <option value="">{tOps('cashier_odoo.claim_loading_providers', { defaultValue: 'Loading…' })}</option>
                ) : (
                  carriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="ins-claim-field">
              <span>
                {tOps('cashier_odoo.claim_policy', { defaultValue: 'Policy number' })}
                <span className="ins-claim-req">*</span>
              </span>
              <input
                className="cs-input ins-claim-input"
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
                placeholder={tOps('cashier_odoo.claim_policy_ph', { defaultValue: 'Policy #' })}
              />
            </label>

            <label className="ins-claim-field">
              <span>{tOps('cashier_odoo.claim_linked_bill', { defaultValue: 'Linked bill #' })}</span>
              <input
                className="cs-input ins-claim-input"
                value={linkedBill}
                onChange={(e) => setLinkedBill(e.target.value)}
                placeholder={tOps('cashier_odoo.claim_linked_bill_ph', { defaultValue: 'BL-2026-…' })}
              />
            </label>

            <label className="ins-claim-field">
              <span>
                {amountLabel}
                <span className="ins-claim-req">*</span>
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="cs-input ins-claim-input"
                value={claimAmount}
                onChange={(e) => setClaimAmount(e.target.value)}
                placeholder="0"
              />
            </label>

            <label className="ins-claim-field">
              <span>{tOps('cashier_odoo.claim_cover_type', { defaultValue: 'Cover type' })}</span>
              <select
                className="cs-input ins-claim-input ins-claim-select"
                value={coverType}
                onChange={(e) => setCoverType(e.target.value)}
              >
                {COVER_TYPES.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {tOps(`cashier_odoo.${ct.labelKey}`, { defaultValue: ct.defaultLabel })}
                  </option>
                ))}
              </select>
            </label>

            <label className="ins-claim-field ins-claim-field--full">
              <span>{tOps('cashier_odoo.claim_diagnosis', { defaultValue: 'Diagnosis / ICD code' })}</span>
              <input
                className="cs-input ins-claim-input"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder={tOps('cashier_odoo.claim_diagnosis_ph', {
                  defaultValue: 'e.g. J06.9 – Acute URI',
                })}
              />
            </label>
          </div>
        </div>

        <div className="ins-claim-foot">
          <button type="button" className="cs-btn ins-claim-btn-outline" onClick={onClose} disabled={busy}>
            {tOps('cashier_odoo.claim_cancel', { defaultValue: 'Cancel' })}
          </button>
          <button type="button" className="cs-btn cs-btn-primary" onClick={submit} disabled={busy}>
            {tOps('cashier_odoo.claim_submit', { defaultValue: 'Submit claim' })}
          </button>
        </div>
      </div>
    </div>
  );
}
