import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { CsBadge } from './CashierReferenceShell';
import { BillNumberLink } from './CashierBillLinks';
import { formatAmount, formatMoney } from '../../lib/hmsLocale';
import { useClientPagination } from '../../hooks/useClientPagination';
import { notifyError, notifySuccess } from '../../lib/notifyBridge';

const PAGE_SIZE = 8;

const REASON_OPTIONS = [
  'overpayment',
  'service_not_rendered',
  'insurance_covered',
  'duplicate_payment',
  'patient_cancellation',
];

const METHOD_OPTIONS = ['Cash', 'Card', 'Wallet'];

function normalizeBillCode(raw) {
  return String(raw || '')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/\s+/g, '')
    .trim();
}

/** Payment / receipt / invoice style reference (CON-5253-LDPER635, RCT-2026-00000001, …). */
function looksLikeBillCode(raw) {
  const c = normalizeBillCode(raw).toUpperCase();
  if (!c) return false;
  return (
    /^[A-Z]{2,5}-\d{3,6}-[A-Z0-9]{3,14}$/.test(c)
    || /^[A-Z]{2,5}-\d{4}-\d{4,10}$/.test(c)
    || /^BL-\d{4}-\d{3,6}$/.test(c)
  );
}

function dateLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function formatCompactMoney(amount) {
  const n = Number(amount) || 0;
  const code = formatMoney(0).split(' ').pop() || '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${code}`.trim();
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K ${code}`.trim();
  return formatMoney(n);
}

function statusTone(status) {
  if (status === 'paid') return 'paid';
  return 'pending';
}

function RequestRefundModal({ open, onClose, onCreated }) {
  const { t: tOps } = useTranslation('ops');
  const [ticketCode, setTicketCode] = useState('');
  const [patientQ, setPatientQ] = useState('');
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState(REASON_OPTIONS[0]);
  const [method, setMethod] = useState('Cash');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [billFound, setBillFound] = useState(false);
  const [billTicketId, setBillTicketId] = useState('');
  const [refundableAmount, setRefundableAmount] = useState(null);
  const [alreadyRefundedNote, setAlreadyRefundedNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setTicketCode('');
    setPatientQ('');
    setPatientId('');
    setPatientName('');
    setAmount('');
    setReason(REASON_OPTIONS[0]);
    setMethod('Cash');
    setBillFound(false);
    setBillTicketId('');
    setRefundableAmount(null);
    setAlreadyRefundedNote('');
  }, [open]);

  const applyBillLookup = (bill) => {
    const name = String(bill.patient_name || '').trim();
    const refundable = Number(bill.refundable_amount);
    const maxRefundable = Number.isFinite(refundable) ? Math.max(0, refundable) : 0;
    setPatientId(String(bill.patient_id || ''));
    setPatientName(name);
    setPatientQ(name);
    setBillFound(true);
    setRefundableAmount(maxRefundable);
    if (bill.ticket_id) setBillTicketId(String(bill.ticket_id));
    if (bill.ticket_code) setTicketCode(bill.ticket_code);
    if (maxRefundable > 0) {
      setAmount(String(maxRefundable));
    } else {
      setAmount('');
      const ref = Array.isArray(bill.paid_refund_refs) ? bill.paid_refund_refs[0] : '';
      const note = ref
        ? tOps('cashier_odoo.refund_already_done', {
          defaultValue: 'This bill was already refunded ({{ref}}). No further refund is available.',
          ref,
        })
        : tOps('cashier_odoo.refund_none_left', {
          defaultValue: 'No refundable balance remains on this bill.',
        });
      setAlreadyRefundedNote(note);
      notifyError(note);
    }
    if (bill.suggested_refund_method) setMethod(bill.suggested_refund_method);
  };

  const findBillOrPatient = async () => {
    const billField = normalizeBillCode(ticketCode);
    const patientField = patientQ.trim();
    const codeFromPatient = looksLikeBillCode(patientField) ? normalizeBillCode(patientField) : '';
    const codeToLookup = billField || codeFromPatient;

    if (!codeToLookup && !patientField) {
      notifyError(tOps('cashier_odoo.refund_find_required', {
        defaultValue: 'Enter a bill number or patient name first.',
      }));
      return;
    }

    setSearching(true);
    try {
      if (codeToLookup) {
        const res = await fetch(`/api/cashier/bills/lookup?code=${encodeURIComponent(codeToLookup)}`, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok || !data.bill) {
          const msg = data.error
            || (res.status === 404
              ? tOps('cashier_odoo.refund_bill_not_found', { defaultValue: 'No bill found with that number.' })
              : tOps('cashier_odoo.refund_bill_lookup_failed', {
                defaultValue: 'Could not look up that bill. Refresh the page and try again.',
              }));
          notifyError(msg);
          setBillFound(false);
          setPatientId('');
          setPatientName('');
          return;
        }
        applyBillLookup(data.bill);
        return;
      }

      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(patientField)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const rows = await res.json().catch(() => []);
      const first = Array.isArray(rows) ? rows[0] : null;
      if (!first) {
        notifyError(tOps('cashier_odoo.refund_patient_not_found', { defaultValue: 'No patient found.' }));
        return;
      }
      const name = `${first.first_name || ''} ${first.last_name || ''}`.trim();
      setPatientId(String(first.id));
      setPatientName(name);
      setPatientQ(name);
      setBillFound(false);
    } catch {
      notifyError(tOps('cashier_odoo.refund_bill_lookup_failed', {
        defaultValue: 'Could not look up that bill. Refresh the page and try again.',
      }));
    } finally {
      setSearching(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!patientId) {
      notifyError(tOps('cashier_odoo.refund_patient_required', { defaultValue: 'Select a patient first.' }));
      return;
    }
    const refundAmt = parseFloat(amount) || 0;
    if (refundableAmount != null && refundAmt > refundableAmount + 0.005) {
      notifyError(
        tOps('cashier_odoo.refund_exceeds_available', {
          defaultValue: 'Refund amount exceeds available balance on this bill.',
        })
      );
      return;
    }
    if (refundAmt <= 0) {
      notifyError(alreadyRefundedNote || tOps('cashier_odoo.refund_none_left', {
        defaultValue: 'No refundable balance remains on this bill.',
      }));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/cashier/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          patient_id: patientId,
          ticket_id: billTicketId || undefined,
          ticket_code: ticketCode.trim() || null,
          amount: parseFloat(amount) || 0,
          reason,
          refund_method: method,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        notifyError(data.error || tOps('cashier_odoo.refund_create_failed', { defaultValue: 'Could not create refund request.' }));
        return;
      }
      notifySuccess(tOps('cashier_odoo.refund_created', { defaultValue: 'Refund request submitted for approval.' }));
      onCreated?.();
      onClose();
    } catch {
      notifyError(tOps('cashier_odoo.refund_create_failed', { defaultValue: 'Could not create refund request.' }));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="rfd-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="rfd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="rfd-modal-head">
          <h3>{tOps('cashier_odoo.refund_request_title', { defaultValue: 'Request refund' })}</h3>
          <button type="button" className="rfd-modal-close" onClick={onClose} aria-label="Close">
            <FaIcon name="times" />
          </button>
        </div>
        <form className="rfd-modal-body" onSubmit={submit}>
          <label className="rfd-field">
            <span>{tOps('cashier_odoo.refund_original_bill', { defaultValue: 'Original bill #' })}</span>
            <div className="rfd-bill-search">
              <input
                className="cs-input"
                value={ticketCode}
                onChange={(e) => {
                setTicketCode(e.target.value);
                setBillFound(false);
                setBillTicketId('');
                setPatientId('');
                  setPatientName('');
                  setPatientQ('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    findBillOrPatient();
                  }
                }}
                placeholder="CON-5253-LDPER635"
              />
              <button
                type="button"
                className="cs-btn cs-btn-sm rfd-find-btn"
                onClick={findBillOrPatient}
                disabled={searching}
              >
                {tOps('cashier_odoo.refund_find', { defaultValue: 'Find' })}
              </button>
            </div>
          </label>
          <label className="rfd-field">
            <span>{tOps('cashier_odoo.refund_patient', { defaultValue: 'Patient' })}</span>
            <div className="rfd-patient-search">
              <input
                className="cs-input"
                value={patientQ}
                onChange={(e) => {
                  setPatientQ(e.target.value);
                  if (billFound) {
                    setBillFound(false);
                    setPatientId('');
                    setPatientName('');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    findBillOrPatient();
                  }
                }}
                placeholder={tOps('cashier_odoo.refund_patient_ph', { defaultValue: 'Search patient name…' })}
                readOnly={billFound}
              />
            </div>
            {billFound && patientName ? (
              <div className="rfd-patient-picked">{patientName}</div>
            ) : null}
          </label>
          <label className="rfd-field">
            <span>{tOps('cashier_odoo.refund_amount', { defaultValue: 'Amount' })}</span>
            <input className="cs-input" type="number" min="0" step="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            {refundableAmount != null && refundableAmount > 0 ? (
              <div className="rfd-field-hint">
                {tOps('cashier_odoo.refund_max_available', {
                  defaultValue: 'Maximum refundable: {{amount}}',
                  amount: formatMoney(refundableAmount),
                })}
              </div>
            ) : null}
            {alreadyRefundedNote ? (
              <div className="rfd-field-hint rfd-field-hint--warn">{alreadyRefundedNote}</div>
            ) : null}
          </label>
          <label className="rfd-field">
            <span>{tOps('cashier_odoo.refund_reason', { defaultValue: 'Reason' })}</span>
            <select className="cs-input" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASON_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {tOps(`cashier_odoo.refund_reason_${r}`, { defaultValue: r.replace(/_/g, ' ') })}
                </option>
              ))}
            </select>
          </label>
          <label className="rfd-field">
            <span>{tOps('cashier_odoo.refund_method', { defaultValue: 'Method' })}</span>
            <select className="cs-input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHOD_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <div className="rfd-modal-actions">
            <button type="button" className="cs-btn" onClick={onClose}>{tOps('cashier_odoo.refund_cancel', { defaultValue: 'Cancel' })}</button>
            <button type="submit" className="cs-btn cs-btn-primary" disabled={saving}>
              {tOps('cashier_odoo.refund_submit', { defaultValue: 'Submit request' })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CashierRefundsPanel({
  initialRefunds = [],
  initialSummary = {},
  initialMonthLabel = '',
  onBillsChanged,
}) {
  const { t: tOps } = useTranslation('ops');
  const [rows, setRows] = useState(initialRefunds);
  const [summary, setSummary] = useState(initialSummary);
  const [monthLabel, setMonthLabel] = useState(initialMonthLabel);
  const [loading, setLoading] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [approvingId, setApprovingId] = useState(null);

  const loadRefunds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cashier/refunds?limit=500', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setRows(Array.isArray(data.refunds) ? data.refunds : []);
        setSummary(data.summary || {});
        setMonthLabel(data.month_label || '');
      }
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRefunds();
  }, [loadRefunds]);

  const { pager, rows: pageRows, setPage } = useClientPagination(rows, {
    pageSize: PAGE_SIZE,
    resetKeys: [rows.length],
  });

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const approveRefund = async (requestId) => {
    if (!requestId) return;
    setApprovingId(requestId);
    try {
      const res = await fetch(`/api/cashier/refunds/${requestId}/approve`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        notifyError(data.error || tOps('cashier_odoo.refund_approve_failed', { defaultValue: 'Approval failed.' }));
        return;
      }
      notifySuccess(tOps('cashier_odoo.refund_approved', { defaultValue: 'Refund approved.' }));
      loadRefunds();
      onBillsChanged?.();
    } catch {
      notifyError(tOps('cashier_odoo.refund_approve_failed', { defaultValue: 'Approval failed.' }));
    } finally {
      setApprovingId(null);
    }
  };

  const statusLabel = (key) => tOps(`cashier_odoo.refund_status_${key}`, {
    defaultValue: key.charAt(0).toUpperCase() + key.slice(1),
  });

  const month = monthLabel || new Date().toLocaleString('en', { month: 'short' });
  const kpiMonthTotal = summary.month_total ?? 0;
  const kpiMonthCount = summary.month_count ?? 0;
  const kpiPending = summary.pending_count ?? 0;
  const kpiAvg = summary.avg_refund ?? 0;

  return (
    <div className="rfd-page">
      <div className="cs-info-strip rfd-notice">
        <FaIcon name="info-circle" className="rfd-notice-icon" />
        <div>
          <div className="rfd-notice-title">
            {tOps('cashier_odoo.refund_notice_title', { defaultValue: 'Refunds require supervisor approval' })}
          </div>
          <div className="rfd-notice-body">
            {tOps('cashier_odoo.refund_notice_body', {
              defaultValue: 'All refund requests are logged and require a valid reason. Cash refunds above 50,000 FCFA need countersignature.',
            })}
          </div>
        </div>
      </div>

      <div className="row rfd-kpi-row">
        <div className="col-4">
          <div className="cs-kpi rfd-kpi rfd-kpi--teal">
            <div className="cs-kpi-label">
              {tOps('cashier_odoo.refund_kpi_total', { defaultValue: 'Total refunded ({{month}})', month })}
            </div>
            <div className="cs-kpi-value">{formatCompactMoney(kpiMonthTotal)}</div>
            <div className="cs-kpi-sub">
              {tOps('cashier_odoo.refund_kpi_total_sub', {
                defaultValue: '{{code}} across {{count}} transactions',
                code: formatMoney(0).split(' ').pop() || '',
                count: kpiMonthCount,
              })}
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className="cs-kpi rfd-kpi rfd-kpi--warn">
            <div className="cs-kpi-label">{tOps('cashier_odoo.refund_kpi_pending', { defaultValue: 'Pending approval' })}</div>
            <div className="cs-kpi-value">{kpiPending}</div>
            <div className="cs-kpi-sub">
              {tOps('cashier_odoo.refund_kpi_pending_sub', { defaultValue: 'awaiting supervisor sign-off' })}
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className="cs-kpi rfd-kpi rfd-kpi--danger">
            <div className="cs-kpi-label">{tOps('cashier_odoo.refund_kpi_avg', { defaultValue: 'Avg. refund' })}</div>
            <div className="cs-kpi-value">{formatAmount(kpiAvg)}</div>
            <div className="cs-kpi-sub">
              {tOps('cashier_odoo.refund_kpi_avg_sub', {
                defaultValue: '{{code}} per transaction',
                code: formatMoney(0).split(' ').pop() || '',
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="cs-card rfd-card">
        <div className="cs-card-head rfd-card-head">
          <div className="cs-card-title">
            <FaIcon name="undo" className="rfd-card-icon" />
            {tOps('cashier_odoo.refund_log', { defaultValue: 'Refund log' })}
          </div>
          <button type="button" className="cs-btn cs-btn-primary cs-btn-sm" onClick={() => setRequestOpen(true)}>
            <FaIcon name="plus" /> {tOps('cashier_odoo.refund_request_btn', { defaultValue: 'Request refund' })}
          </button>
        </div>

        <div className="cs-card-body-0">
          {loading ? (
            <div className="cs-empty">{tOps('cashier_odoo.refund_loading', { defaultValue: 'Loading refunds…' })}</div>
          ) : (
            <>
              <div className="cs-table-wrap">
                <table className="cs-table rfd-table">
                  <thead>
                    <tr>
                      <th>{tOps('cashier_odoo.refund_col_ref', { defaultValue: 'Ref #' })}</th>
                      <th>{tOps('cashier_odoo.refund_col_bill', { defaultValue: 'Original bill' })}</th>
                      <th>{tOps('cashier_odoo.refund_col_patient', { defaultValue: 'Patient' })}</th>
                      <th>{tOps('cashier_odoo.refund_col_reason', { defaultValue: 'Reason' })}</th>
                      <th className="rfd-num">{tOps('cashier_odoo.refund_col_amount', { defaultValue: 'Amount' })}</th>
                      <th>{tOps('cashier_odoo.refund_col_method', { defaultValue: 'Method' })}</th>
                      <th>{tOps('cashier_odoo.refund_col_date', { defaultValue: 'Date' })}</th>
                      <th>{tOps('cashier_odoo.refund_col_status', { defaultValue: 'Status' })}</th>
                      <th>{tOps('cashier_odoo.refund_col_actions', { defaultValue: 'Actions' })}</th>
                      <th className="rfd-check-col" aria-label="Select" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="cs-empty">
                          {tOps('cashier_odoo.refund_empty', { defaultValue: 'No refund requests in this session.' })}
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row) => {
                        const isTicketLink = row.ticket_code && !String(row.ticket_code).startsWith('C-') && !String(row.ticket_code).startsWith('IPD-');
                        return (
                          <tr key={row.refund_id}>
                            <td className="rfd-ref">{row.refund_ref}</td>
                            <td className="rfd-bill-cell">
                              {isTicketLink ? (
                                <BillNumberLink ticketCode={row.ticket_code} label={row.ticket_code} />
                              ) : (
                                <span className="rfd-bill">{row.ticket_code}</span>
                              )}
                            </td>
                            <td>
                              <a href={`/patients/${row.patient_id}`} className="rfd-patient-link">
                                {row.patient_name}
                              </a>
                            </td>
                            <td className="rfd-reason">{row.reason}</td>
                            <td className="rfd-num rfd-amount">{row.amount_fmt || formatMoney(row.amount)}</td>
                            <td>{row.refund_method}</td>
                            <td className="rfd-date">{dateLabel(row.refund_date)}</td>
                            <td>
                              <CsBadge tone={statusTone(row.display_status)}>
                                {statusLabel(row.display_status)}
                              </CsBadge>
                            </td>
                            <td className="rfd-action-cell">
                              {row.can_approve ? (
                                <button
                                  type="button"
                                  className="cs-btn cs-btn-primary cs-btn-sm rfd-approve-btn"
                                  disabled={approvingId === row.request_id}
                                  onClick={() => approveRefund(row.request_id)}
                                >
                                  {tOps('cashier_odoo.refund_approve', { defaultValue: 'Approve' })}
                                </button>
                              ) : null}
                            </td>
                            <td className="rfd-check-col">
                              <input
                                type="checkbox"
                                className="rfd-check"
                                checked={selected.has(row.refund_id)}
                                onChange={() => toggleSelect(row.refund_id)}
                                aria-label={`Select ${row.refund_ref}`}
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {pager.totalPages > 1 ? (
                <div className="rfd-pager">
                  {Array.from({ length: pager.totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`rfd-pager-btn${p === pager.page ? ' active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <RequestRefundModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        onCreated={loadRefunds}
      />
    </div>
  );
}
