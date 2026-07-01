import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { CashierBillingCompanyFormModal } from './CashierBillingCompanyFormModal';
import { formatAmount } from '../../lib/hmsLocale';
import { notifySuccess } from '../../lib/notifyBridge';

const INVOICE_CATEGORIES = [
  'consultation',
  'laboratory',
  'radiology',
  'pharmacy',
  'surgery',
  'other',
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dueDefaultIso() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function lineKey() {
  return `ln-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyLine(serviceCategory = 'consultation') {
  return {
    key: lineKey(),
    service_category: serviceCategory,
    description: '',
    unit_price: '',
    quantity: '1',
    catalog_id: '',
  };
}

function normalizeCatalog(catalog) {
  if (!Array.isArray(catalog)) return [];
  return catalog
    .map((c) => ({
      id: c.id,
      name: String(c.name || '').trim(),
      price: parseFloat(c.price) || 0,
    }))
    .filter((c) => c.name);
}

function catalogForCategory(cat, bundles) {
  const {
    consultCatalog,
    labCatalog,
    imagingCatalog,
    surgeryCatalog,
    pharmacyCatalog,
    svcCatalog,
    serviceCatalog,
  } = bundles;
  if (cat === 'consultation') return consultCatalog;
  if (cat === 'laboratory') return labCatalog;
  if (cat === 'radiology') return imagingCatalog;
  if (cat === 'pharmacy') return pharmacyCatalog;
  if (cat === 'surgery') return surgeryCatalog;
  if (cat === 'other') {
    const merged = [...svcCatalog];
    const seen = new Set(merged.map((c) => c.id));
    for (const c of serviceCatalog) {
      if (!seen.has(c.id)) merged.push(c);
    }
    return merged;
  }
  return serviceCatalog;
}

function lineKindForCategory(cat) {
  return cat === 'other' ? 'service' : cat;
}

function lineTotal(ln) {
  const qty = parseFloat(ln.quantity) || 0;
  const unit = parseFloat(ln.unit_price) || 0;
  return Math.round(qty * unit * 100) / 100;
}

export function CashierNewInvoiceOdooModal({
  open,
  onClose,
  onCreated,
  serviceCatalog = [],
  pharmacyCatalog = [],
  consultCatalog = [],
  labCatalog = [],
  imagingCatalog = [],
  surgeryCatalog = [],
  svcCatalog = [],
}) {
  const { t: tOps } = useTranslation('ops');
  const { t: tClinical } = useTranslation('clinical');
  const [billToType, setBillToType] = useState('patient');
  const [patientQ, setPatientQ] = useState('');
  const [patientId, setPatientId] = useState('');
  const [patientLabel, setPatientLabel] = useState('');
  const [companyQ, setCompanyQ] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [companyLabel, setCompanyLabel] = useState('');
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [companyFormOpen, setCompanyFormOpen] = useState(false);
  const [companyFormSeed, setCompanyFormSeed] = useState('');
  const [contact, setContact] = useState('');
  const [issueDate, setIssueDate] = useState(todayIso);
  const [dueDate, setDueDate] = useState(dueDefaultIso);
  const [lines, setLines] = useState([emptyLine()]);
  const [discountPct, setDiscountPct] = useState('0');
  const [taxPct, setTaxPct] = useState('0');
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const catalogBundles = useMemo(
    () => ({
      consultCatalog: normalizeCatalog(consultCatalog),
      labCatalog: normalizeCatalog(labCatalog),
      imagingCatalog: normalizeCatalog(imagingCatalog),
      surgeryCatalog: normalizeCatalog(surgeryCatalog),
      pharmacyCatalog: normalizeCatalog(pharmacyCatalog),
      svcCatalog: normalizeCatalog(svcCatalog),
      serviceCatalog: normalizeCatalog(serviceCatalog),
    }),
    [consultCatalog, labCatalog, imagingCatalog, surgeryCatalog, pharmacyCatalog, svcCatalog, serviceCatalog],
  );

  const categoryOptions = useMemo(
    () =>
      INVOICE_CATEGORIES.map((id) => ({
        id,
        label:
          id === 'other'
            ? tOps('cashier_odoo.invoice_cat_other', { defaultValue: 'Other Services' })
            : tClinical(`cashier.billing_cat_${id}`, { defaultValue: id }),
      })),
    [tOps, tClinical],
  );

  const subtotal = useMemo(
    () => lines.reduce((sum, ln) => sum + lineTotal(ln), 0),
    [lines],
  );

  const reset = useCallback(() => {
    setBillToType('patient');
    setPatientQ('');
    setPatientId('');
    setPatientLabel('');
    setCompanyQ('');
    setCompanyId('');
    setCompanyLabel('');
    setCompanySuggestions([]);
    setCompanyFormOpen(false);
    setCompanyFormSeed('');
    setContact('');
    setIssueDate(todayIso());
    setDueDate(dueDefaultIso());
    setLines([emptyLine()]);
    setDiscountPct('0');
    setTaxPct('0');
    setSuggestions([]);
    setFormError('');
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open || billToType !== 'patient' || patientId) {
      if (billToType !== 'patient') setSuggestions([]);
      return undefined;
    }
    const q = patientQ.trim();
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
  }, [patientQ, open, patientId, billToType]);

  useEffect(() => {
    if (!open || billToType !== 'company' || companyId) {
      if (billToType !== 'company') setCompanySuggestions([]);
      return undefined;
    }
    const q = companyQ.trim();
    if (q.length < 1) {
      setCompanySuggestions([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      fetch(`/api/cashier/billing-companies?q=${encodeURIComponent(q)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })
        .then((r) => r.json())
        .then((data) => setCompanySuggestions(Array.isArray(data.companies) ? data.companies.slice(0, 8) : []))
        .catch(() => setCompanySuggestions([]));
    }, 280);
    return () => clearTimeout(timer);
  }, [companyQ, open, companyId, billToType]);

  const switchBillToType = (type) => {
    setBillToType(type);
    setFormError('');
    if (type === 'patient') {
      setCompanyId('');
      setCompanyLabel('');
      setCompanyQ('');
      setCompanySuggestions([]);
    } else {
      setPatientId('');
      setPatientLabel('');
      setPatientQ('');
      setSuggestions([]);
    }
  };

  const pickPatient = (p) => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    const code = p.patient_code ? ` · ${p.patient_code}` : '';
    const phone = p.phone ? ` · ${p.phone}` : '';
    setPatientLabel(`${name}${code}${phone}`.trim());
    setPatientId(String(p.id));
    setPatientQ('');
    if (!contact.trim() && p.phone) setContact(String(p.phone));
    setSuggestions([]);
    setFormError('');
  };

  const clearPatient = () => {
    setPatientId('');
    setPatientLabel('');
    setPatientQ('');
    setFormError('');
  };

  const pickCompany = (c) => {
    const tax = c.tax_id ? ` · ${c.tax_id}` : '';
    const phone = c.phone ? ` · ${c.phone}` : '';
    setCompanyLabel(`${c.name || ''}${tax}${phone}`.trim());
    setCompanyId(String(c.id));
    setCompanyQ('');
    if (!contact.trim()) {
      setContact(String(c.email || c.phone || '').trim());
    }
    setCompanySuggestions([]);
    setFormError('');
  };

  const clearCompany = () => {
    setCompanyId('');
    setCompanyLabel('');
    setCompanyQ('');
    setFormError('');
  };

  const openCompanyForm = (seed = '') => {
    setCompanyFormSeed(seed || companyQ.trim());
    setCompanyFormOpen(true);
    setCompanySuggestions([]);
  };

  const onCompanySaved = (company) => {
    pickCompany(company);
    setCompanyFormOpen(false);
  };

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((ln, i) => (i === index ? { ...ln, ...patch } : ln)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine()]);
  };

  const removeLine = (index) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const onCategoryChange = (index, category) => {
    updateLine(index, {
      service_category: category,
      catalog_id: '',
      description: '',
      unit_price: '',
    });
  };

  const onCatalogPick = (index, catalogId) => {
    const lineCategory = lines[index]?.service_category || 'consultation';
    const lineCatalog = catalogForCategory(lineCategory, catalogBundles);
    const item = lineCatalog.find((c) => String(c.id) === String(catalogId));
    if (!item) {
      updateLine(index, { catalog_id: '', description: '', unit_price: '' });
      return;
    }
    updateLine(index, {
      catalog_id: String(item.id),
      description: item.name,
      unit_price: String(item.price),
      service_category: lineCategory,
    });
  };

  const payloadLines = () =>
    lines
      .map((ln) => ({
        description: String(ln.description || '').trim(),
        quantity: Math.max(1, parseInt(ln.quantity, 10) || 1),
        unit_price: parseFloat(ln.unit_price) || 0,
        kind: lineKindForCategory(ln.service_category || 'consultation'),
        catalog_id: ln.catalog_id ? parseInt(ln.catalog_id, 10) : null,
      }))
      .filter((ln) => ln.description && ln.unit_price > 0);

  const submit = async (mode) => {
    setFormError('');
    if (billToType === 'patient') {
      if (!patientId) {
        setFormError(
          tOps('cashier_odoo.invoice_err_patient', {
            defaultValue: 'Select a registered patient.',
          }),
        );
        return;
      }
    } else if (!companyId) {
      setFormError(
        tOps('cashier_odoo.invoice_err_company', {
          defaultValue: 'Select a company or add a new company profile.',
        }),
      );
      return;
    }
    if (!dueDate) {
      setFormError(tOps('cashier_odoo.invoice_err_due', { defaultValue: 'Due date is required.' }));
      return;
    }
    const normalized = payloadLines();
    if (!normalized.length) {
      setFormError(tOps('cashier_odoo.invoice_err_lines', { defaultValue: 'Add at least one line item.' }));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/cashier/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          patient_id: billToType === 'patient' ? patientId : undefined,
          billing_company_id: billToType === 'company' ? companyId : undefined,
          bill_to_name:
            billToType === 'company'
              ? companyLabel.split('·')[0].trim()
              : patientLabel.split('·')[0].trim(),
          bill_to_contact: contact.trim() || null,
          issue_date: issueDate || todayIso(),
          due_date: dueDate,
          discount_pct: parseFloat(discountPct) || 0,
          tax_pct: parseFloat(taxPct) || 0,
          lines: normalized,
          service_category: normalized[0]?.kind || 'consultation',
          invoice_status: mode === 'draft' ? 'draft' : 'sent',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        setFormError(data.error || tOps('cashier_odoo.invoice_err_save', { defaultValue: 'Could not save invoice.' }));
        return;
      }
      notifySuccess(
        mode === 'draft'
          ? tOps('cashier_odoo.invoice_draft_saved', { defaultValue: 'Invoice draft saved.' })
          : tOps('cashier_odoo.invoice_sent', { defaultValue: 'Invoice sent.' }),
      );
      onCreated?.(data);
      onClose();
    } catch {
      setFormError(tOps('cashier_odoo.invoice_err_save', { defaultValue: 'Could not save invoice.' }));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="inv-new-backdrop" role="presentation" onClick={onClose}>
      <div
        className="inv-new-modal inv-new-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inv-new-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inv-new-head">
          <h2 id="inv-new-title">{tOps('cashier_odoo.new_invoice', { defaultValue: 'New invoice' })}</h2>
          <button type="button" className="inv-new-close" onClick={onClose} aria-label="Close">
            <FaIcon name="times" />
          </button>
        </div>

        <div className="inv-new-body">
          {formError ? <div className="inv-new-error">{formError}</div> : null}

          <div className="inv-new-grid">
            <div className="inv-new-field inv-new-field--full">
              <span>{tOps('cashier_odoo.invoice_bill_to_type', { defaultValue: 'Bill to' })}</span>
              <div className="inv-new-billto-toggle" role="radiogroup" aria-label="Bill to">
                <button
                  type="button"
                  role="radio"
                  aria-checked={billToType === 'patient'}
                  className={`inv-new-billto-opt${billToType === 'patient' ? ' is-active' : ''}`}
                  onClick={() => switchBillToType('patient')}
                >
                  <FaIcon name="user" />
                  {tOps('cashier_odoo.invoice_patient', { defaultValue: 'Patient' })}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={billToType === 'company'}
                  className={`inv-new-billto-opt${billToType === 'company' ? ' is-active' : ''}`}
                  onClick={() => switchBillToType('company')}
                >
                  <FaIcon name="building" />
                  {tOps('cashier_odoo.invoice_company', { defaultValue: 'Company' })}
                </button>
              </div>
            </div>

            {billToType === 'patient' ? (
            <label className="inv-new-field inv-new-field--full">
              <span>{tOps('cashier_odoo.invoice_patient', { defaultValue: 'Patient' })}</span>
              <div className="inv-new-billto-wrap">
                {patientId ? (
                  <div className="inv-new-patient-pick">
                    <span className="inv-new-patient-pick__label">{patientLabel}</span>
                    <button type="button" className="inv-new-patient-pick__clear" onClick={clearPatient}>
                      {tOps('cashier_odoo.invoice_clear_patient', { defaultValue: 'Clear' })}
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      className="cs-input inv-new-input"
                      value={patientQ}
                      onChange={(e) => {
                        setPatientQ(e.target.value);
                        setFormError('');
                      }}
                      placeholder={tOps('cashier_odoo.invoice_patient_ph', {
                        defaultValue: 'Search name, phone, or patient code…',
                      })}
                      autoComplete="off"
                    />
                    {suggestions.length > 0 ? (
                      <ul className="inv-new-suggest">
                        {suggestions.map((p) => (
                          <li key={p.id}>
                            <button type="button" onClick={() => pickPatient(p)}>
                              {p.first_name} {p.last_name}
                              {p.patient_code ? (
                                <span className="inv-new-suggest-meta">{p.patient_code}</span>
                              ) : null}
                              {p.phone ? <span className="inv-new-suggest-meta">{p.phone}</span> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>
              <p className="inv-new-hint">
                {tOps('cashier_odoo.invoice_patient_hint', {
                  defaultValue: 'Search and select a registered patient.',
                })}
              </p>
            </label>
            ) : (
            <label className="inv-new-field inv-new-field--full">
              <span>{tOps('cashier_odoo.invoice_company', { defaultValue: 'Company' })}</span>
              <div className="inv-new-billto-wrap">
                {companyId ? (
                  <div className="inv-new-patient-pick">
                    <span className="inv-new-patient-pick__label">{companyLabel}</span>
                    <button type="button" className="inv-new-patient-pick__clear" onClick={clearCompany}>
                      {tOps('cashier_odoo.invoice_clear_company', { defaultValue: 'Clear' })}
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      className="cs-input inv-new-input"
                      value={companyQ}
                      onChange={(e) => {
                        setCompanyQ(e.target.value);
                        setFormError('');
                      }}
                      placeholder={tOps('cashier_odoo.invoice_company_search_ph', {
                        defaultValue: 'Search company name, tax ID, email…',
                      })}
                      autoComplete="off"
                    />
                    {(companySuggestions.length > 0 || companyQ.trim().length > 0) ? (
                      <ul className="inv-new-suggest">
                        {companySuggestions.map((c) => (
                          <li key={c.id}>
                            <button type="button" onClick={() => pickCompany(c)}>
                              {c.name}
                              {c.tax_id ? <span className="inv-new-suggest-meta">{c.tax_id}</span> : null}
                              {c.phone ? <span className="inv-new-suggest-meta">{c.phone}</span> : null}
                            </button>
                          </li>
                        ))}
                        <li>
                          <button type="button" className="inv-new-suggest-add" onClick={() => openCompanyForm(companyQ)}>
                            <FaIcon name="plus" />
                            {tOps('cashier_odoo.invoice_add_company', { defaultValue: 'Add new company…' })}
                          </button>
                        </li>
                      </ul>
                    ) : null}
                  </>
                )}
              </div>
              <p className="inv-new-hint">
                {tOps('cashier_odoo.invoice_company_search_hint', {
                  defaultValue: 'Search saved companies or add a new corporate billing profile.',
                })}
              </p>
            </label>
            )}

            <label className="inv-new-field">
              <span>{tOps('cashier_odoo.invoice_contact', { defaultValue: 'Contact / email' })}</span>
              <input
                className="cs-input inv-new-input"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={tOps('cashier_odoo.invoice_contact_ph', { defaultValue: 'email or phone' })}
              />
            </label>

            <label className="inv-new-field">
              <span>{tOps('cashier_odoo.invoice_issue_date', { defaultValue: 'Issue date' })}</span>
              <input
                type="date"
                className="cs-input inv-new-input inv-new-date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </label>

            <label className="inv-new-field">
              <span>
                {tOps('cashier_odoo.invoice_due_date', { defaultValue: 'Due date' })}
                <span className="inv-new-req">*</span>
              </span>
              <input
                type="date"
                className="cs-input inv-new-input inv-new-date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </label>

            <div className="inv-new-field inv-new-field--full inv-new-lines-wrap">
              <div className="inv-new-lines-head">
                <span>{tOps('cashier_odoo.invoice_line_items', { defaultValue: 'Line items' })}</span>
                <button type="button" className="inv-new-add-line" onClick={addLine}>
                  <FaIcon name="plus" /> {tOps('cashier_odoo.invoice_add_line', { defaultValue: 'Add line' })}
                </button>
              </div>

              <div className="inv-new-lines-table-wrap">
                <table className="inv-new-lines-table">
                  <thead>
                    <tr>
                      <th>{tOps('cashier_odoo.invoice_col_service', { defaultValue: 'Service' })}</th>
                      <th className="inv-new-col-num">{tOps('cashier_odoo.invoice_col_unit', { defaultValue: 'Unit price' })}</th>
                      <th className="inv-new-col-qty">{tOps('cashier_odoo.invoice_col_qty', { defaultValue: 'Qty' })}</th>
                      <th className="inv-new-col-num">{tOps('cashier_odoo.invoice_col_total', { defaultValue: 'Total' })}</th>
                      <th className="inv-new-col-act" aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((ln, idx) => {
                      const lineCategory = ln.service_category || 'consultation';
                      const lineCatalog = catalogForCategory(lineCategory, catalogBundles);
                      const total = lineTotal(ln);
                      return (
                        <tr key={ln.key}>
                          <td>
                            <div className="inv-new-line-service-stack">
                              <select
                                className="cs-input inv-new-input inv-new-line-select inv-new-line-cat"
                                value={lineCategory}
                                onChange={(e) => onCategoryChange(idx, e.target.value)}
                                aria-label={tOps('cashier_odoo.invoice_pick_category', { defaultValue: 'Service type' })}
                              >
                                {categoryOptions.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="cs-input inv-new-input inv-new-line-select"
                                value={ln.catalog_id}
                                onChange={(e) => onCatalogPick(idx, e.target.value)}
                                aria-label={tOps('cashier_odoo.invoice_pick_item', { defaultValue: 'Service item' })}
                              >
                                <option value="">
                                  {tOps('cashier_odoo.invoice_pick_item', { defaultValue: 'Select item…' })}
                                </option>
                                {lineCatalog.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="cs-input inv-new-input inv-new-line-num"
                              value={ln.unit_price}
                              onChange={(e) => updateLine(idx, { unit_price: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              className="cs-input inv-new-input inv-new-line-qty"
                              value={ln.quantity}
                              onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                            />
                          </td>
                          <td className="inv-new-line-total">{formatAmount(total)}</td>
                          <td className="inv-new-line-act">
                            {lines.length > 1 ? (
                              <button
                                type="button"
                                className="inv-new-line-remove"
                                onClick={() => removeLine(idx)}
                                aria-label={tOps('cashier_odoo.invoice_remove_line', { defaultValue: 'Remove line' })}
                              >
                                <FaIcon name="times" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="inv-new-lines-subtotal">
                <span>{tOps('cashier_odoo.invoice_subtotal', { defaultValue: 'Subtotal' })}</span>
                <strong>{formatAmount(subtotal)}</strong>
              </div>
            </div>

            <label className="inv-new-field">
              <span>{tOps('cashier_odoo.invoice_discount', { defaultValue: 'Discount (%)' })}</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="cs-input inv-new-input"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
              />
            </label>

            <label className="inv-new-field">
              <span>{tOps('cashier_odoo.invoice_tax', { defaultValue: 'Tax (%)' })}</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="cs-input inv-new-input"
                value={taxPct}
                onChange={(e) => setTaxPct(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="inv-new-foot">
          <button type="button" className="cs-btn inv-new-btn-outline" onClick={onClose} disabled={busy}>
            {tOps('cashier_odoo.invoice_cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            className="cs-btn inv-new-btn-outline"
            onClick={() => submit('draft')}
            disabled={busy}
          >
            {tOps('cashier_odoo.invoice_save_draft', { defaultValue: 'Save draft' })}
          </button>
          <button
            type="button"
            className="cs-btn cs-btn-primary"
            onClick={() => submit('send')}
            disabled={busy}
          >
            {tOps('cashier_odoo.invoice_send', { defaultValue: 'Send invoice' })}
          </button>
        </div>
      </div>

      <CashierBillingCompanyFormModal
        open={companyFormOpen}
        initialName={companyFormSeed}
        onClose={() => setCompanyFormOpen(false)}
        onSaved={onCompanySaved}
      />
    </div>
  );
}
