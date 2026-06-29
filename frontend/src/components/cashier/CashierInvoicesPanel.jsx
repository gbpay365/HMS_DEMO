import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { CsBadge } from './CashierReferenceShell';
import { BillNumberLink } from './CashierBillLinks';
import { cashierInvoiceUrls } from './CashierInvoiceActions';
import { formatMoney } from '../../lib/hmsLocale';
import { useClientPagination } from '../../hooks/useClientPagination';

const STATUS_FILTERS = ['all', 'overdue', 'pending', 'paid', 'refunded'];
const INVOICE_TERMS_DAYS = 30;
const PAGE_SIZE = 7;

function dateLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function invoiceDisplayRef(inv) {
  return String(inv.invoice_number || inv.invoice_ref || inv.ticket_code || '').trim() || '—';
}

function resolveInvoiceStatus(inv) {
  const pay = String(inv.payment_status || '').toLowerCase();
  if (pay === 'refunded' || String(inv.invoice_doc_status || '').toLowerCase() === 'refunded') {
    return 'refunded';
  }
  if (pay === 'paid') return 'paid';
  if (pay === 'canceled' || pay === 'cancelled') return 'canceled';
  const dueIso = inv.due_date || addDays(inv.created_at, INVOICE_TERMS_DAYS);
  if (dueIso && (inv.balance_due || 0) > 0) {
    const due = new Date(`${dueIso}T23:59:59`);
    if (!Number.isNaN(due.getTime()) && Date.now() > due.getTime()) return 'overdue';
  }
  return 'pending';
}

function statusTone(status) {
  if (status === 'paid') return 'paid';
  if (status === 'refunded') return 'refunded';
  if (status === 'overdue') return 'overdue';
  return 'pending';
}

function openTab(href) {
  if (!href) return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

function InvoiceRowActions({ ticketCode, isPaid }) {
  const { t: tOps } = useTranslation('ops');
  const urls = cashierInvoiceUrls(ticketCode);
  const code = String(ticketCode || '').trim();
  if (!code) return null;

  return (
    <span className="inv-doc-actions">
      <button
        type="button"
        className="inv-icon-btn"
        onClick={() => openTab(urls.view)}
        title={tOps('cashier_odoo.invoices_view', { defaultValue: 'View' })}
        aria-label={tOps('cashier_odoo.invoices_view', { defaultValue: 'View' })}
      >
        <FaIcon name="eye" />
      </button>
      <button
        type="button"
        className="inv-icon-btn"
        onClick={() => openTab(isPaid ? urls.receipt : urls.ticket)}
        title={tOps('cashier_odoo.invoices_print', { defaultValue: 'Print' })}
        aria-label={tOps('cashier_odoo.invoices_print', { defaultValue: 'Print' })}
      >
        <FaIcon name="print" />
      </button>
    </span>
  );
}

export function CashierInvoicesPanel({
  initialInvoices = [],
  initialTotal = 0,
  refreshToken = 0,
  onNewInvoice,
}) {
  const { t: tOps } = useTranslation('ops');
  const [rows, setRows] = useState(initialInvoices);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cashier/billing-invoices?limit=500', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setRows(Array.isArray(data.invoices) ? data.invoices : []);
        setTotal(data.total || 0);
      }
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices, refreshToken]);

  const enriched = useMemo(
    () => rows
      .filter((r) => !['canceled', 'cancelled'].includes(String(r.payment_status || '').toLowerCase()))
      .map((r) => {
      const due_date = r.due_date || addDays(r.created_at, INVOICE_TERMS_DAYS);
      return {
        ...r,
        due_date,
        invoice_status: resolveInvoiceStatus({ ...r, due_date }),
      };
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return enriched.filter((inv) => {
      if (statusFilter !== 'all' && inv.invoice_status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        invoiceDisplayRef(inv),
        inv.ticket_code,
        inv.patient_name,
        inv.bill_to_name,
        inv.notes,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [enriched, searchQ, statusFilter]);

  const { pager, rows: pageRows, setPage } = useClientPagination(filtered, {
    pageSize: PAGE_SIZE,
    resetKeys: [searchQ, statusFilter, filtered.length],
  });

  const statusLabel = (key) => tOps(`cashier_odoo.invoice_status_${key}`, {
    defaultValue: key.charAt(0).toUpperCase() + key.slice(1),
  });

  return (
    <div className="inv-page">
      <div className="cs-card inv-card">
        <div className="cs-card-head inv-card-head">
          <div className="cs-card-title">
            <FaIcon name="file-text-o" className="inv-card-icon" />
            {tOps('cashier_odoo.invoices', { defaultValue: 'Invoices' })}
          </div>
          <button type="button" className="cs-btn cs-btn-primary cs-btn-sm" onClick={onNewInvoice}>
            <FaIcon name="plus" /> {tOps('cashier_odoo.new_invoice', { defaultValue: 'New invoice' })}
          </button>
        </div>

        <div className="inv-toolbar">
          <div className="cs-search-wrap inv-search">
            <FaIcon name="search" className="cs-search-icon" />
            <input
              className="cs-search"
              type="search"
              placeholder={tOps('cashier_odoo.invoices_search_ph', { defaultValue: 'Search invoice or patient…' })}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
          <select
            className="cs-input inv-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status filter"
          >
            <option value="all">{tOps('cashier_odoo.invoices_all_statuses', { defaultValue: 'All statuses' })}</option>
            {STATUS_FILTERS.filter((s) => s !== 'all').map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
          <span className="inv-count-label">
            {tOps('cashier_odoo.invoices_count', {
              defaultValue: '{{count}} Invoices',
              count: filtered.length,
            })}
          </span>
        </div>

        <div className="cs-card-body-0">
          {loading ? (
            <div className="cs-empty">{tOps('cashier_odoo.invoices_loading', { defaultValue: 'Loading invoices…' })}</div>
          ) : (
            <>
              <div className="cs-table-wrap">
                <table className="cs-table inv-table">
                  <thead>
                    <tr>
                      <th>{tOps('cashier_odoo.invoices_col_number', { defaultValue: 'Invoice #' })}</th>
                      <th>{tOps('cashier_odoo.invoices_col_patient', { defaultValue: 'Patient / Corp' })}</th>
                      <th>{tOps('cashier_odoo.invoices_col_issued', { defaultValue: 'Issued' })}</th>
                      <th>{tOps('cashier_odoo.invoices_col_due', { defaultValue: 'Due' })}</th>
                      <th className="inv-num">{tOps('cashier_odoo.invoices_col_amount', { defaultValue: 'Amount' })}</th>
                      <th>{tOps('cashier_odoo.invoices_col_status', { defaultValue: 'Status' })}</th>
                      <th className="inv-actions-col">{tOps('cashier_odoo.invoices_col_actions', { defaultValue: 'Actions' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="cs-empty">
                          {tOps('cashier_odoo.invoices_empty', { defaultValue: 'No invoices match your filters.' })}
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((inv) => {
                        const isPaid = inv.invoice_status === 'paid';
                        const isOverdue = inv.invoice_status === 'overdue';
                        return (
                          <tr key={inv.ticket_id}>
                            <td className="inv-code-cell">
                              <BillNumberLink ticketCode={inv.ticket_code} label={invoiceDisplayRef(inv)} />
                            </td>
                            <td className="inv-patient-cell">{inv.bill_to_name || inv.patient_name || '—'}</td>
                            <td className="inv-date">{dateLabel(inv.issue_date || inv.created_at)}</td>
                            <td className={`inv-date${isOverdue ? ' inv-due--overdue' : ''}`}>
                              {dateLabel(inv.due_date)}
                            </td>
                            <td className="inv-num">{formatMoney(inv.amount)}</td>
                            <td>
                              <CsBadge tone={statusTone(inv.invoice_status)}>
                                {statusLabel(inv.invoice_status)}
                              </CsBadge>
                            </td>
                            <td className="inv-actions-col">
                              <InvoiceRowActions ticketCode={inv.ticket_code} isPaid={isPaid} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {pager.totalPages > 1 ? (
                <div className="inv-pager">
                  {Array.from({ length: pager.totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`inv-pager-btn${p === pager.page ? ' active' : ''}`}
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
    </div>
  );
}
