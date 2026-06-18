/** Premium invoices workspace — aligned with HMS surface / cashier theme. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CashierInvoiceActions } from './CashierInvoiceActions';
import { Pager } from '../Pager';
import { StatCard } from '../StatCard';
import { StatusBadge } from '../StatusBadge';
import { CashierNewInvoiceModal } from '../../modals/CashierNewInvoiceModal';
import { formatDate, formatMoney } from '../../lib/listUi';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';
import { useClientPagination } from '../../hooks/useClientPagination';

const STATUS_FILTERS = ['all', 'unpaid', 'partial', 'paid', 'canceled'];
const CLAIM_FILTERS = ['all', 'not_claimed', 'claimed', 'canceled', 'denied'];
const SERVICE_CATEGORY_FILTERS = ['all', 'consultation', 'laboratory', 'radiology', 'maternity', 'surgery', 'pharmacy'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function BillingFilterSelect({ id, label, value, options, onChange, labelFn }) {
  return (
    <div className="min-w-0 flex-1 sm:max-w-[11rem]">
      <label htmlFor={id} className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="hms-input w-full py-2 text-xs font-semibold text-ink"
      >
        {options.map((key) => (
          <option key={key} value={key}>
            {labelFn(key)}
          </option>
        ))}
      </select>
    </div>
  );
}

function BillingFilterBar({
  statusFilter,
  claimFilter,
  categoryFilter,
  dateFrom,
  dateTo,
  searchQ,
  onStatusChange,
  onClaimChange,
  onCategoryChange,
  onDateFromChange,
  onDateToChange,
  onSearchChange,
  onReset,
  hasActiveFilters,
  statusLabel,
  claimLabel,
  categoryLabel,
  t}) {
  return (
    <div className="border-b border-slate-100 bg-slate-50/40 px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
          <BillingFilterSelect
            id="billing-filter-status"
            label={t('cashier.billing_filter_status')}
            value={statusFilter}
            options={STATUS_FILTERS}
            onChange={onStatusChange}
            labelFn={statusLabel}
          />
          <BillingFilterSelect
            id="billing-filter-claim"
            label={t('cashier.billing_filter_claim')}
            value={claimFilter}
            options={CLAIM_FILTERS}
            onChange={onClaimChange}
            labelFn={claimLabel}
          />
          <BillingFilterSelect
            id="billing-filter-category"
            label={t('cashier.billing_service_category')}
            value={categoryFilter}
            options={SERVICE_CATEGORY_FILTERS}
            onChange={onCategoryChange}
            labelFn={categoryLabel}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end lg:max-w-xl">
          <div className="min-w-0 flex-1">
            <label htmlFor="billing-filter-search" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {t('cashier.billing_search_label')}
            </label>
            <div className="relative">
              <i className="fa fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true" />
              <input
                id="billing-filter-search"
                type="search"
                value={searchQ}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t('cashier.billing_search_ph')}
                className="hms-input w-full py-2 pl-9 text-xs"
              />
            </div>
          </div>
          <div className="min-w-0 sm:w-auto">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {t('cashier.billing_date_range')}
            </span>
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
              <input
                type="date"
                className="hms-input min-w-0 flex-1 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                aria-label={t('cashier.billing_date_from')}
              />
              <span className="text-slate-300">—</span>
              <input
                type="date"
                className="hms-input min-w-0 flex-1 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                aria-label={t('cashier.billing_date_to')}
              />
            </div>
          </div>
          <button
            type="button"
            className="hms-btn-secondary shrink-0 text-xs"
            onClick={onReset}
            disabled={!hasActiveFilters}
          >
            <i className="fa fa-undo mr-1" aria-hidden="true" />
            {t('cashier.billing_reset')}
          </button>
        </div>
      </div>
    </div>
  );
}

function paymentVariant(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'success';
  if (s === 'partial') return 'info';
  if (s === 'canceled') return 'cancelled';
  return 'warning';
}

function claimVariant(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'claimed') return 'success';
  if (s === 'denied') return 'danger';
  if (s === 'canceled') return 'cancelled';
  return 'pending';
}

function EmptyInvoices({ onCreate, t }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center sm:py-20">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200/80">
        <i className="fa fa-file-text-o text-3xl text-slate-400" aria-hidden="true" />
      </div>
      <p className="max-w-sm text-base font-medium text-slate-600">
        {t('cashier.invoices_empty')}
      </p>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        {t('cashier.invoices_empty_hint')}
      </p>
      <button type="button" className="hms-btn-primary mt-6 text-sm" onClick={onCreate}>
        <i className="fa fa-plus mr-1.5" aria-hidden="true" />
        {t('cashier.invoice_new_btn')}
      </button>
    </div>
  );
}

export function CashierBillingTab({
  initialInvoices = [],
  initialSummary = {},
  initialTotal = 0,
  serviceCatalog = [],
  pharmacyCatalog = [],
  consultCatalog = [],
  labCatalog = [],
  imagingCatalog = [],
  maternityCatalog = [],
  surgeryCatalog = [],
  svcCatalog = [],
  embedded = false}) {
  const { t } = useTranslation('clinical');
  const [statusFilter, setStatusFilter] = useState('all');
  const [claimFilter, setClaimFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(monthStartIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [rows, setRows] = useState(initialInvoices);
  const [summary, setSummary] = useState(initialSummary);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQ.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchQ]);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (claimFilter !== 'all') qs.set('claim', claimFilter);
      if (categoryFilter !== 'all') qs.set('category', categoryFilter);
      if (dateFrom) qs.set('from', dateFrom);
      if (dateTo) qs.set('to', dateTo);
      if (debouncedSearch) qs.set('q', debouncedSearch);
      const res = await fetch(`/api/cashier/billing-invoices?${qs.toString()}`, {
        headers: { Accept: 'application/json' }});
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setRows(Array.isArray(data.invoices) ? data.invoices : []);
        setSummary(data.summary || {});
        setTotal(data.total || 0);
      }
    } catch (_) {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, [statusFilter, claimFilter, categoryFilter, dateFrom, dateTo, debouncedSearch]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const resetFilters = () => {
    setStatusFilter('all');
    setClaimFilter('all');
    setCategoryFilter('all');
    setSearchQ('');
    setDebouncedSearch('');
    setDateFrom(monthStartIso());
    setDateTo(todayIso());
  };

  const statusLabel = useCallback((key) => t(`cashier.billing_status_${key}`), [t]);
  const claimLabel = useCallback((key) => t(`cashier.claim_${key}`), [t]);
  const categoryLabel = useCallback((key) => t(`cashier.billing_cat_${key}`), [t]);

  const { pager, rows: pageRows, setPage } = useClientPagination(rows, {
    pageSize: DEFAULT_PAGE_SIZE,
    resetKeys: [statusFilter, claimFilter, categoryFilter, dateFrom, dateTo, debouncedSearch, rows.length]});

  const empty = !loading && pageRows.length === 0;
  const hasActiveFilters =
    statusFilter !== 'all' ||
    claimFilter !== 'all' ||
    categoryFilter !== 'all' ||
    debouncedSearch !== '' ||
    dateFrom !== monthStartIso() ||
    dateTo !== todayIso();

  return (
    <div className={embedded ? 'px-0 pb-0 pt-0' : 'animate-[hmsSurfaceIn_0.35s_ease-out] px-1 pb-2 pt-1 sm:px-2'}>
      {embedded ? (
        <div className="mb-3 flex justify-end">
          <button type="button" className="hms-btn-primary text-sm" onClick={() => setNewOpen(true)}>
            <i className="fa fa-plus mr-1.5" aria-hidden="true" />
            {t('cashier.invoice_new_btn')}
          </button>
        </div>
      ) : (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
              {t('cashier.invoices_title')}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {t('cashier.invoices_subtitle')}
            </p>
          </div>
          <button type="button" className="hms-btn-primary shrink-0 text-sm" onClick={() => setNewOpen(true)}>
            <i className="fa fa-plus mr-1.5" aria-hidden="true" />
            {t('cashier.invoice_new_btn')}
          </button>
        </div>
      )}

      {/* KPI strip */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('cashier.billing_kpi_unpaid')}
          value={summary.unpaid_count ?? summary.pending_count ?? 0}
          hint={formatMoney(summary.unpaid_total ?? summary.pending_total ?? 0)}
          tone="warning"
          icon="clock-o"
        />
        <StatCard
          label={t('cashier.billing_kpi_partial')}
          value={summary.partial_count ?? 0}
          hint={t('cashier.billing_kpi_partial_sub')}
          tone="default"
          icon="adjust"
        />
        <StatCard
          label={t('cashier.billing_kpi_paid')}
          value={summary.paid_count ?? 0}
          hint={t('cashier.billing_kpi_paid_sub')}
          tone="brand"
          icon="check-circle"
        />
        <StatCard
          label={t('cashier.billing_kpi_list')}
          value={total}
          hint={t('cashier.billing_kpi_list_sub')}
          tone="brand"
          icon="list-alt"
        />
      </div>

      {/* Filters + table card */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
        <BillingFilterBar
          statusFilter={statusFilter}
          claimFilter={claimFilter}
          categoryFilter={categoryFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          searchQ={searchQ}
          onStatusChange={setStatusFilter}
          onClaimChange={setClaimFilter}
          onCategoryChange={setCategoryFilter}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onSearchChange={setSearchQ}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
          statusLabel={statusLabel}
          claimLabel={claimLabel}
          categoryLabel={categoryLabel}
          t={t}
        />

        <div className="border-t border-slate-100 bg-white px-4 py-2 sm:px-5">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500">
              <i className="fa fa-spinner fa-spin text-brand" aria-hidden="true" />
              {t('cashier.billing_loading')}
            </p>
          ) : empty ? (
            <EmptyInvoices onCreate={() => setNewOpen(true)} t={t} />
          ) : (
            <>
              <p className="mb-2 text-xs font-medium text-slate-500">
                {t('cashier.billing_count', { count: total })}
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">{t('cashier.col_patient')}</th>
                      <th className="px-4 py-3">{t('cashier.billing_col_category')}</th>
                      <th className="px-4 py-3 text-right">{t('cashier.billing_col_amount')}</th>
                      <th className="px-4 py-3 text-right">{t('cashier.billing_col_paid')}</th>
                      <th className="px-4 py-3 text-right">{t('cashier.billing_col_balance')}</th>
                      <th className="px-4 py-3">{t('cashier.col_status')}</th>
                      <th className="px-4 py-3">{t('cashier.billing_col_claim')}</th>
                      <th className="px-4 py-3">{t('cashier.col_date')}</th>
                      <th className="px-4 py-3 text-right">{t('cashier.col_action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRows.map((inv) => {
                      const unpaid = ['unpaid', 'partial', 'pending'].includes(
                        String(inv.payment_status).toLowerCase()
                      );
                      const dateVal = unpaid ? inv.created_at : inv.paid_at || inv.created_at;
                      const payStatusKey =
                        inv.payment_status === 'partial'
                          ? 'partial'
                          : inv.payment_status === 'unpaid' || inv.payment_status === 'pending'
                            ? 'unpaid'
                            : inv.payment_status;
                      return (
                        <tr key={inv.ticket_id} className="transition hover:bg-brand/[0.03]">
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-ink">{inv.patient_name}</div>
                            <div className="mt-0.5 font-mono text-[11px] font-bold text-brand">{inv.invoice_ref}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {categoryLabel(inv.service_category || inv.category)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold text-ink">{formatMoney(inv.amount)}</td>
                          <td className="px-4 py-3.5 text-right font-medium text-emerald-700">
                            {formatMoney(inv.amount_paid)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-amber-800">
                            {inv.balance_due > 0 ? formatMoney(inv.balance_due) : '—'}
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge variant={paymentVariant(inv.payment_status)} label={statusLabel(payStatusKey)} />
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge variant={claimVariant(inv.claim_status)} label={claimLabel(inv.claim_status)} />
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-500">{formatDate(dateVal)}</td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            {unpaid && inv.payment_status !== 'canceled' ? (
                              <a href={`/cashier/settle/${inv.ticket_id}`} className="hms-btn-primary inline-flex px-3 py-1.5 text-xs">
                                {t('cashier.billing_pay')}
                              </a>
                            ) : inv.payment_status === 'paid' ? (
                              <CashierInvoiceActions ticketCode={inv.ticket_code} />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 pb-2">
                <Pager pager={pager} onPageChange={setPage} />
              </div>
            </>
          )}
        </div>
      </div>

      <CashierNewInvoiceModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => loadInvoices()}
        serviceCatalog={serviceCatalog}
        pharmacyCatalog={pharmacyCatalog}
        consultCatalog={consultCatalog}
        labCatalog={labCatalog}
        imagingCatalog={imagingCatalog}
        maternityCatalog={maternityCatalog}
        surgeryCatalog={surgeryCatalog}
        svcCatalog={svcCatalog}
      />
    </div>
  );
}
