import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { CsBadge } from './CashierReferenceShell';
import { BillNumberLink, BillDocumentActions } from './CashierBillLinks';
import { formatAmount, formatMoney } from '../../lib/hmsLocale';
import { useClientPagination } from '../../hooks/useClientPagination';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

const STATUS_FILTERS = ['all', 'paid', 'partial', 'pending', 'refunded', 'insurance', 'overdue'];
const OVERDUE_DAYS = 14;
const PAGE_SIZE = 8;

function patientInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return `${parts[0][0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

function billDateLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function daysSince(iso) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function resolveBillStatus(inv) {
  const pay = String(inv.payment_status || '').toLowerCase();
  if (pay === 'refunded') return 'refunded';
  if (pay === 'paid') return 'paid';
  if (pay === 'canceled' || pay === 'cancelled') return 'canceled';
  if (pay === 'partial') return 'partial';
  const ins = parseFloat(inv.insurance_pct) > 0
    || ['claimed', 'pending'].includes(String(inv.claim_status || '').toLowerCase());
  if (ins && (inv.balance_due || 0) > 0) return 'insurance';
  if (daysSince(inv.created_at) >= OVERDUE_DAYS) return 'overdue';
  return 'pending';
}

function statusTone(status) {
  if (status === 'paid') return 'paid';
  if (status === 'refunded') return 'refunded';
  if (status === 'partial') return 'partial';
  if (status === 'insurance') return 'insurance';
  if (status === 'overdue') return 'overdue';
  return 'pending';
}

function BillsStatCard({ label, value, tone }) {
  return (
    <div className={`bills-stat-card bills-stat-card--${tone}`}>
      <div className="bills-stat-card__label">{label}</div>
      <div className="bills-stat-card__value">{value}</div>
    </div>
  );
}

export function CashierPatientBillsPanel({
  initialInvoices = [],
  initialSummary = {},
  initialTotal = 0,
  refreshToken = 0,
  externalSearch = '',
  onNewBill,
  hideKpis = false,
}) {
  const { t: tOps } = useTranslation('ops');
  const [rows, setRows] = useState(initialInvoices);
  const [summary, setSummary] = useState(initialSummary);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cashier/billing-invoices?limit=500', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setRows(Array.isArray(data.invoices) ? data.invoices : []);
        setSummary(data.summary || {});
        setTotal(data.total || 0);
      }
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills, refreshToken]);

  useEffect(() => {
    if (externalSearch) setSearchQ(externalSearch);
  }, [externalSearch]);

  const departments = useMemo(() => {
    const set = new Set();
    for (const r of rows) {
      const d = String(r.department || r.category_label || '').trim();
      if (d) set.add(d);
    }
    return [...set].sort();
  }, [rows]);

  const enriched = useMemo(
    () => rows.map((r) => ({ ...r, bill_status: resolveBillStatus(r) })),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return enriched.filter((inv) => {
      if (statusFilter !== 'all' && inv.bill_status !== statusFilter) return false;
      if (deptFilter !== 'all') {
        const dept = String(inv.department || inv.category_label || '').trim();
        if (dept !== deptFilter) return false;
      }
      if (!q) return true;
      const hay = [
        inv.ticket_code,
        inv.patient_name,
        inv.department,
        inv.category_label,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [enriched, searchQ, statusFilter, deptFilter]);

  const { pager, rows: pageRows, setPage } = useClientPagination(filtered, {
    pageSize: PAGE_SIZE,
    resetKeys: [searchQ, statusFilter, deptFilter, filtered.length],
  });

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusLabel = (key) => tOps(`cashier_odoo.bill_status_${key}`, {
    defaultValue: key.charAt(0).toUpperCase() + key.slice(1),
  });

  const kpiTotalBilled = summary.total_billed ?? enriched.reduce((s, r) => s + (r.amount || 0), 0);
  const kpiCollected = summary.collected ?? enriched.reduce((s, r) => s + (r.amount_paid || 0), 0);
  const kpiOutstanding = summary.outstanding ?? enriched.reduce((s, r) => s + (r.balance_due || 0), 0);
  const kpiCount = summary.bills_count ?? total ?? enriched.length;

  return (
    <div className="bills-page">
      {!hideKpis ? (
        <div className="bills-stat-row">
          <BillsStatCard
            tone="billed"
            label={tOps('cashier_odoo.bills_total_billed', { defaultValue: 'Total billed' })}
            value={formatMoney(kpiTotalBilled)}
          />
          <BillsStatCard
            tone="collected"
            label={tOps('cashier_odoo.bills_collected', { defaultValue: 'Collected' })}
            value={formatMoney(kpiCollected)}
          />
          <BillsStatCard
            tone="outstanding"
            label={tOps('cashier_odoo.bills_outstanding', { defaultValue: 'Outstanding' })}
            value={formatMoney(kpiOutstanding)}
          />
          <BillsStatCard
            tone="count"
            label={tOps('cashier_odoo.bills_count', { defaultValue: 'Bills count' })}
            value={kpiCount}
          />
        </div>
      ) : null}

      <div className="cs-card bills-card">
        <div className="cs-card-head bills-card-head">
          <div className="cs-card-title">
            <FaIcon name="file-text-o" className="bills-card-icon" />
            {tOps('cashier_odoo.patient_bills', { defaultValue: 'Patient bills' })}
          </div>
          <button type="button" className="cs-btn cs-btn-primary cs-btn-sm" onClick={onNewBill}>
            <FaIcon name="plus" /> {tOps('cashier_odoo.new_bill', { defaultValue: 'New bill' })}
          </button>
        </div>

        <div className="bills-toolbar">
          <div className="cs-search-wrap bills-search">
            <FaIcon name="search" className="cs-search-icon" />
            <input
              className="cs-search"
              type="search"
              placeholder={tOps('cashier_odoo.bills_search_ph', { defaultValue: 'Search patient or bill #…' })}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
          <select
            className="cs-input bills-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status filter"
          >
            <option value="all">{tOps('cashier_odoo.bills_all_statuses', { defaultValue: 'All statuses' })}</option>
            {STATUS_FILTERS.filter((s) => s !== 'all').map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
          <select
            className="cs-input bills-filter-select"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Service filter"
          >
            <option value="all">{tOps('cashier_odoo.bills_all_departments', { defaultValue: 'All services' })}</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span className="bills-count-label">
            {tOps('cashier_odoo.bills_showing', {
              defaultValue: '{{shown}} of {{total}} bills',
              shown: filtered.length,
              total: total || enriched.length,
            })}
          </span>
        </div>

        <div className="cs-card-body-0">
          {loading ? (
            <div className="cs-empty">{tOps('cashier_odoo.bills_loading', { defaultValue: 'Loading bills…' })}</div>
          ) : (
            <>
              <div className="cs-table-wrap">
                <table className="cs-table bills-table">
                  <thead>
                    <tr>
                      <th>{tOps('cashier_odoo.bills_col_number', { defaultValue: 'Bill #' })}</th>
                      <th>{tOps('cashier_odoo.bills_col_patient', { defaultValue: 'Patient' })}</th>
                      <th>{tOps('cashier_odoo.bills_col_department', { defaultValue: 'Service' })}</th>
                      <th className="bills-num">{tOps('cashier_odoo.bills_col_items', { defaultValue: 'Items' })}</th>
                      <th className="bills-num">{tOps('cashier_odoo.bills_col_total', { defaultValue: 'Total' })}</th>
                      <th className="bills-num">{tOps('cashier_odoo.bills_col_paid', { defaultValue: 'Paid' })}</th>
                      <th className="bills-num">{tOps('cashier_odoo.bills_col_balance', { defaultValue: 'Balance' })}</th>
                      <th>{tOps('cashier_odoo.bills_col_date', { defaultValue: 'Date' })}</th>
                      <th>{tOps('cashier_odoo.bills_col_status', { defaultValue: 'Status' })}</th>
                      <th>{tOps('cashier_odoo.bills_col_action', { defaultValue: 'Action' })}</th>
                      <th className="bills-check-col" aria-label="Select" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="cs-empty">
                          {tOps('cashier_odoo.bills_empty', { defaultValue: 'No bills match your filters.' })}
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((inv) => {
                        const dept = inv.department || inv.category_label || '—';
                        const unpaid = inv.balance_due > 0 && !['paid', 'refunded'].includes(inv.bill_status);
                        return (
                          <tr key={inv.ticket_id}>
                            <td className="bills-code-cell">
                              <BillNumberLink ticketCode={inv.ticket_code} />
                            </td>
                            <td>
                              <div className="bills-patient-cell">
                                <div className="cs-avatar bills-patient-avatar">{patientInitials(inv.patient_name)}</div>
                                <div>
                                  <div className="bills-patient-name">{inv.patient_name}</div>
                                  <div className="bills-patient-dept">{dept}</div>
                                </div>
                              </div>
                            </td>
                            <td>{dept}</td>
                            <td className="bills-num">{inv.item_count || 1}</td>
                            <td className="bills-num">{formatAmount(inv.amount)}</td>
                            <td className="bills-num">{formatAmount(inv.amount_paid)}</td>
                            <td className={`bills-num${unpaid ? ' bills-balance--due' : ''}`}>
                              {inv.balance_due > 0 ? formatAmount(inv.balance_due) : '0'}
                            </td>
                            <td className="bills-date">{billDateLabel(inv.created_at)}</td>
                            <td>
                              <CsBadge tone={statusTone(inv.bill_status)}>
                                {statusLabel(inv.bill_status)}
                              </CsBadge>
                            </td>
                            <td className="bills-action-cell">
                              {unpaid ? (
                                <a href={`/cashier/settle/${inv.ticket_id}`} className="cs-btn cs-btn-primary cs-btn-sm bills-pay-btn">
                                  {tOps('cashier_odoo.bills_pay', { defaultValue: 'Pay' })}
                                </a>
                              ) : (
                                <BillDocumentActions ticketCode={inv.ticket_code} isPaid />
                              )}
                            </td>
                            <td className="bills-check-col">
                              <input
                                type="checkbox"
                                className="bills-check"
                                checked={selected.has(inv.ticket_id)}
                                onChange={() => toggleSelect(inv.ticket_id)}
                                aria-label={`Select ${inv.ticket_code}`}
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
                <div className="bills-pager">
                  {Array.from({ length: pager.totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`bills-pager-btn${p === pager.page ? ' active' : ''}`}
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
