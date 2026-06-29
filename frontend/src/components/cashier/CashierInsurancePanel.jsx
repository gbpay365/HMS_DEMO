import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { CsBadge } from './CashierReferenceShell';
import { BillNumberLink } from './CashierBillLinks';
import { formatAmount, formatMoney } from '../../lib/hmsLocale';
import { useClientPagination } from '../../hooks/useClientPagination';

const STATUS_FILTERS = ['all', 'paid', 'pending', 'overdue', 'partial'];
const PAGE_SIZE = 8;

function dateLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function formatCompactMoney(amount) {
  const n = Number(amount) || 0;
  const code = formatMoney(0).split(' ').pop() || '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${code}`.trim();
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K ${code}`.trim();
  return formatMoney(n);
}

function statusTone(status) {
  if (status === 'paid') return 'paid';
  if (status === 'overdue') return 'overdue';
  if (status === 'partial') return 'partial';
  return 'pending';
}

export function CashierInsurancePanel({
  initialClaims = [],
  initialSummary = {},
  initialMonthLabel = '',
  refreshToken = 0,
  onNewClaim,
}) {
  const { t: tOps } = useTranslation('ops');
  const [rows, setRows] = useState(initialClaims);
  const [summary, setSummary] = useState(initialSummary);
  const [monthLabel, setMonthLabel] = useState(initialMonthLabel);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());

  const loadClaims = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cashier/insurance-claims?limit=500', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setRows(Array.isArray(data.claims) ? data.claims : []);
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
    loadClaims();
  }, [loadClaims, refreshToken]);

  const tableRows = useMemo(
    () => rows.filter((r) => r.display_status !== 'rejected'),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return tableRows.filter((row) => {
      if (statusFilter !== 'all' && row.display_status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        row.claim_ref,
        row.patient_name,
        row.provider_name,
        row.policy_number,
        row.ticket_code,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [tableRows, searchQ, statusFilter]);

  const { pager, rows: pageRows, setPage } = useClientPagination(filtered, {
    pageSize: PAGE_SIZE,
    resetKeys: [searchQ, statusFilter, filtered.length],
  });

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusLabel = (key) => tOps(`cashier_odoo.claim_status_${key}`, {
    defaultValue: key.charAt(0).toUpperCase() + key.slice(1),
  });

  const month = monthLabel || new Date().toLocaleString('en', { month: 'short' });
  const kpiMonthCount = summary.month_count ?? tableRows.length;
  const kpiMonthValue = summary.month_value ?? tableRows.reduce((s, r) => s + (r.claimed_amount || 0), 0);
  const kpiApprovedCount = summary.approved_count ?? 0;
  const kpiApprovedValue = summary.approved_value ?? 0;
  const kpiPendingCount = summary.pending_count ?? 0;
  const kpiPendingValue = summary.pending_value ?? 0;
  const kpiRejectedCount = summary.rejected_count ?? 0;
  const kpiRejectedValue = summary.rejected_value ?? 0;

  return (
    <div className="ins-page">
      <div className="row ins-kpi-row">
        <div className="col-4">
          <div className="cs-kpi ins-kpi ins-kpi--teal">
            <div className="cs-kpi-label">
              {tOps('cashier_odoo.ins_kpi_total', { defaultValue: 'Total claims ({{month}})', month })}
            </div>
            <div className="cs-kpi-value">{kpiMonthCount}</div>
            <div className="cs-kpi-sub">
              {tOps('cashier_odoo.ins_kpi_total_sub', {
                defaultValue: 'valued at {{amount}}',
                amount: formatCompactMoney(kpiMonthValue),
              })}
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className="cs-kpi ins-kpi ins-kpi--ok">
            <div className="cs-kpi-label">{tOps('cashier_odoo.ins_kpi_approved', { defaultValue: 'Approved' })}</div>
            <div className="cs-kpi-value">{kpiApprovedCount}</div>
            <div className="cs-kpi-sub ins-kpi-sub--ok">
              {tOps('cashier_odoo.ins_kpi_approved_sub', {
                defaultValue: '{{amount}} received',
                amount: formatCompactMoney(kpiApprovedValue),
              })}
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className="cs-kpi ins-kpi ins-kpi--warn">
            <div className="cs-kpi-label">{tOps('cashier_odoo.ins_kpi_pending', { defaultValue: 'Pending review' })}</div>
            <div className="cs-kpi-value">{kpiPendingCount}</div>
            <div className="cs-kpi-sub">
              {tOps('cashier_odoo.ins_kpi_pending_sub', {
                defaultValue: '{{amount}} outstanding',
                amount: formatCompactMoney(kpiPendingValue),
              })}
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className="cs-kpi ins-kpi ins-kpi--danger">
            <div className="cs-kpi-label">{tOps('cashier_odoo.ins_kpi_rejected', { defaultValue: 'Rejected' })}</div>
            <div className="cs-kpi-value">{kpiRejectedCount}</div>
            <div className="cs-kpi-sub">
              {tOps('cashier_odoo.ins_kpi_rejected_sub', {
                defaultValue: '{{amount}} — resubmit',
                amount: formatCompactMoney(kpiRejectedValue),
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="cs-card ins-card">
        <div className="cs-card-head ins-card-head">
          <div className="cs-card-title">
            <FaIcon name="shield" className="ins-card-icon" />
            {tOps('cashier_odoo.insurance', { defaultValue: 'Insurance claims' })}
          </div>
          <button type="button" className="cs-btn cs-btn-primary cs-btn-sm" onClick={onNewClaim}>
            <FaIcon name="plus" /> {tOps('cashier_odoo.ins_new_claim', { defaultValue: 'New claim' })}
          </button>
        </div>

        <div className="ins-toolbar">
          <div className="cs-search-wrap ins-search">
            <FaIcon name="search" className="cs-search-icon" />
            <input
              className="cs-search"
              type="search"
              placeholder={tOps('cashier_odoo.ins_search_ph', { defaultValue: 'Search claim, patient, provider…' })}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
          <select
            className="cs-input ins-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status filter"
          >
            <option value="all">{tOps('cashier_odoo.ins_all_statuses', { defaultValue: 'All statuses' })}</option>
            {STATUS_FILTERS.filter((s) => s !== 'all').map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
          <span className="ins-count-label">
            {tOps('cashier_odoo.ins_count', {
              defaultValue: '{{count}} claims',
              count: filtered.length,
            })}
          </span>
        </div>

        <div className="cs-card-body-0">
          {loading ? (
            <div className="cs-empty">{tOps('cashier_odoo.ins_loading', { defaultValue: 'Loading claims…' })}</div>
          ) : (
            <>
              <div className="cs-table-wrap">
                <table className="cs-table ins-table">
                  <thead>
                    <tr>
                      <th>{tOps('cashier_odoo.ins_col_claim', { defaultValue: 'Claim #' })}</th>
                      <th>{tOps('cashier_odoo.ins_col_patient', { defaultValue: 'Patient' })}</th>
                      <th>{tOps('cashier_odoo.ins_col_provider', { defaultValue: 'Provider' })}</th>
                      <th>{tOps('cashier_odoo.ins_col_policy', { defaultValue: 'Policy #' })}</th>
                      <th>{tOps('cashier_odoo.ins_col_submitted', { defaultValue: 'Submitted' })}</th>
                      <th className="ins-num">{tOps('cashier_odoo.ins_col_claimed', { defaultValue: 'Claimed' })}</th>
                      <th className="ins-num">{tOps('cashier_odoo.ins_col_approved', { defaultValue: 'Approved' })}</th>
                      <th>{tOps('cashier_odoo.ins_col_status', { defaultValue: 'Status' })}</th>
                      <th className="ins-check-col" aria-label="Select" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="cs-empty">
                          {tOps('cashier_odoo.ins_empty', { defaultValue: 'No insurance claims match your filters.' })}
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row) => (
                        <tr key={`${row.source}-${row.claim_id}`}>
                          <td className="ins-code-cell">
                            {row.ticket_code ? (
                              <BillNumberLink ticketCode={row.ticket_code} label={row.claim_ref} />
                            ) : (
                              <span className="ins-code">{row.claim_ref}</span>
                            )}
                          </td>
                          <td className="ins-patient-cell">{row.patient_name}</td>
                          <td>{row.provider_name}</td>
                          <td className="ins-policy">{row.policy_number}</td>
                          <td className="ins-date">{dateLabel(row.submitted_at)}</td>
                          <td className="ins-num">{formatAmount(row.claimed_amount)}</td>
                          <td className="ins-num">
                            {row.approved_amount != null && row.approved_amount > 0
                              ? formatAmount(row.approved_amount)
                              : '—'}
                          </td>
                          <td>
                            <CsBadge tone={statusTone(row.display_status)}>
                              {statusLabel(row.display_status)}
                            </CsBadge>
                          </td>
                          <td className="ins-check-col">
                            <input
                              type="checkbox"
                              className="ins-check"
                              checked={selected.has(row.claim_id)}
                              onChange={() => toggleSelect(row.claim_id)}
                              aria-label={`Select ${row.claim_ref}`}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {pager.totalPages > 1 ? (
                <div className="ins-pager">
                  {Array.from({ length: pager.totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`ins-pager-btn${p === pager.page ? ' active' : ''}`}
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
