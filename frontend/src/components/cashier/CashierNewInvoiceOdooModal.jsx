import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
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
  const [billTo, setBillTo] = useState('');
  const [contact, setContact] = useState('');
  const [patientId, setPatientId] = useState('');
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
    setBillTo('');
    setContact('');
    setPatientId('');
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
    if (!open || patientId) {
      setSuggestions([]);
      return undefined;
    }
    const q = billTo.trim();
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
  }, [billTo, open, patientId]);

  const pickPatient = (p) => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    setBillTo(name);
    setPatientId(String(p.id));
    if (!contact.trim() && p.phone) setContact(String(p.phone));
    setSuggestions([]);
    setFormError('');
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
    const name = billTo.trim();
    if (!name) {
      setFormError(tOps('cashier_odoo.invoice_err_bill_to', { defaultValue: 'Bill to is required.' }));
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
          patient_id: patientId || undefined,
          bill_to_name: name,
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
            <label className="inv-new-field">
              <span>
                {tOps('cashier_odoo.invoice_bill_to', { defaultValue: 'Bill to (patient / corp)' })}
                <span className="inv-new-req">*</span>
              </span>
              <div className="inv-new-billto-wrap">
                <input
                  className="cs-input inv-new-input"
                  value={billTo}
                  onChange={(e) => {
                    setBillTo(e.target.value);
                    setPatientId('');
                    setFormError('');
                  }}
                  placeholder={tOps('cashier_odoo.invoice_bill_to_ph', { defaultValue: 'Name or company' })}
                  autoComplete="off"
                />
                {suggestions.length > 0 ? (
                  <ul className="inv-new-suggest">
                    {suggestions.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => pickPatient(p)}>
                          {p.first_name} {p.last_name}
                          {p.phone ? <span className="inv-new-suggest-meta">{p.phone}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <p className="inv-new-hint">
                {tOps('cashier_odoo.invoice_bill_to_hint', {
                  defaultValue: 'Pick a registered patient from suggestions, or type a company / walk-in name.',
                })}
              </p>
            </label>

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
    </div>
  );
}
