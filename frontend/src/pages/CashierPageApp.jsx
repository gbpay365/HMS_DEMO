/** Cashier UI — localized via clinical + ipd namespaces. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { CashierPrintGroup, CashierPrintLink } from '../components/CashierPrintLinks';
import { CashierInvoiceActions } from '../components/cashier/CashierInvoiceActions';
import { FilterChip } from '../components/FilterChip';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { useClientPagination } from '../hooks/useClientPagination';
import { formatDate, formatMoney } from '../lib/listUi';
import { notifyError } from '../lib/notifyBridge';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';
import { CashierPrepayModal } from '../modals/CashierPrepayModal';
import { IpdSettleModal } from '../modals/IpdSettleModal';
import { ErSettleModal } from '../modals/ErSettleModal';
import { OpdOrdersBillModal } from '../modals/OpdOrdersBillModal';
import { OpdRefundModal } from '../modals/OpdRefundModal';
import { CashierBillingModal } from '../modals/CashierBillingModal';
import { FaIcon } from '../components/FaIcon';

const RX_CODE_KEYS = {
  laboratory: 'cashier.rx_lab',
  radiology: 'cashier.rx_rad',
  pharmacy: 'cashier.rx_pharm'};

function DoctorRxCodeBadges({ codes = {} }) {
  const { t } = useTranslation('clinical');
  const entries = [
    { type: 'laboratory', code: codes.laboratory },
    { type: 'radiology', code: codes.radiology },
    { type: 'pharmacy', code: codes.pharmacy },
  ].filter((e) => e.code);

  if (!entries.length) return <span className="text-sm text-slate-400">—</span>;

  const styles = {
    laboratory: 'border-violet-300 bg-violet-100 text-violet-950',
    radiology: 'border-sky-300 bg-sky-100 text-sky-950',
    pharmacy: 'border-rose-300 bg-rose-100 text-rose-950'};

  return (
    <div className="flex min-w-[240px] flex-col gap-1.5 py-0.5">
      {entries.map(({ type, code }) => (
        <div
          key={type}
          className={`inline-flex w-fit max-w-full items-center gap-2 rounded-lg border-2 px-2.5 py-1.5 shadow-sm ${styles[type]}`}
        >
          <span className="shrink-0 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide">
            {t(RX_CODE_KEYS[type])}
          </span>
          <span className="break-all font-mono text-sm font-extrabold leading-tight tracking-tight">{code}</span>
        </div>
      ))}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, count }) {
  return (
    <FilterChip active={active} onClick={onClick} count={count}>
      <FaIcon name={icon} className="text-sm" />
      {label}
    </FilterChip>
  );
}

function ClientTable({ rows, search, columns, emptyLabel }) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [rows, search]);

  const { pager, rows: pageRows, setPage } = useClientPagination(filtered, { pageSize: DEFAULT_PAGE_SIZE, resetKeys: [search] });

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">{columns.header}</thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.colSpan} className="px-4 py-12 text-center text-slate-500">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => columns.renderRow(row, i))
            )}
          </tbody>
        </table>
      </div>
      <Pager pager={pager} onPageChange={setPage} />
    </>
  );
}

export function CashierPageApp({
  pending = [],
  history = [],
  hist_q: histQ = '',
  historyPager = null,
  opdPendingGroups = [],
  ipdPending = [],
  erPending = [],
  codesStatus = [],
  doctorPrescriptions = [],
  billingInvoices = [],
  billingSummary = {},
  billingTotal = 0,
  serviceCatalogForInvoice = [],
  pharmacyCatalogForInvoice = [],
  kpi = {},
  consultCatalog = [],
  labCatalog = [],
  imagingCatalog = [],
  maternityCatalog = [],
  surgeryCatalog = [],
  svcCatalog = [],
  doctors = [],
  specialistSpecialisations = [],
  paymentMethods = [],
  flash = null,
  error = null}) {
  const { t } = useTranslation('clinical');
  const { t: tIpd } = useTranslation('ipd');
  const [tab, setTab] = useState('pending');
  const [prepayOpen, setPrepayOpen] = useState(false);
  const [opdBill, setOpdBill] = useState({ open: false, patientId: 0, patientName: '', consultationId: 0 });
  const [opdRefund, setOpdRefund] = useState({ open: false, consultationId: 0, patientName: '', doctorName: '' });
  const [ipdAdm, setIpdAdm] = useState(null);
  const [erVisit, setErVisit] = useState(null);
  const [lookupCode, setLookupCode] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [opdSearch, setOpdSearch] = useState('');
  const [ipdSearch, setIpdSearch] = useState('');
  const [codesSearch, setCodesSearch] = useState('');
  const [rxSearch, setRxSearch] = useState('');
  const [pendingRows, setPendingRows] = useState(pending);
  const [betterPayRetryRef, setBetterPayRetryRef] = useState(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [prepayDefaults, setPrepayDefaults] = useState(null);
  const [billingOpen, setBillingOpen] = useState(false);
  const [batchDate, setBatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [batchFormat, setBatchFormat] = useState('receipt');
  const [selectedReceiptCodes, setSelectedReceiptCodes] = useState(() => new Set());

  const paidHistoryRows = useMemo(
    () => history.filter((row) => String(row.status || '').toLowerCase() === 'paid'),
    [history]
  );

  const toggleReceiptCode = useCallback((code) => {
    const c = String(code || '').trim();
    if (!c) return;
    setSelectedReceiptCodes((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }, []);

  const allPaidSelected =
    paidHistoryRows.length > 0 && paidHistoryRows.every((row) => selectedReceiptCodes.has(row.ticket_code));

  const toggleAllPaidOnPage = useCallback(() => {
    if (allPaidSelected) {
      setSelectedReceiptCodes(new Set());
      return;
    }
    setSelectedReceiptCodes(new Set(paidHistoryRows.map((row) => row.ticket_code).filter(Boolean)));
  }, [allPaidSelected, paidHistoryRows]);

  const selectPatientReceipts = useCallback(
    (row) => {
      const pid = row.patient_id;
      const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
      const codes = history
        .filter((h) => {
          if (String(h.status || '').toLowerCase() !== 'paid') return false;
          if (pid && h.patient_id === pid) return true;
          return name && `${h.first_name || ''} ${h.last_name || ''}`.trim() === name;
        })
        .map((h) => h.ticket_code)
        .filter(Boolean);
      setSelectedReceiptCodes(new Set(codes));
    },
    [history]
  );

  const openBatchPrint = useCallback(
    (period) => {
      const d = batchDate || new Date().toISOString().slice(0, 10);
      if (batchFormat === 'receipt') {
        const codes = [...selectedReceiptCodes];
        if (codes.length) {
          window.open(`/cashier/print-receipt-batch?codes=${codes.map(encodeURIComponent).join(',')}`, '_blank', 'noopener');
          return;
        }
        const qs = new URLSearchParams({ period: period || 'day', date: d });
        window.open(`/cashier/print-receipt-batch?${qs.toString()}`, '_blank', 'noopener');
        return;
      }
      window.open(
        `/cashier/print-batch?period=${encodeURIComponent(period || 'day')}&date=${encodeURIComponent(d)}&format=slip`,
        '_blank',
        'noopener'
      );
    },
    [batchDate, batchFormat, selectedReceiptCodes]
  );

  const printSelectedReceipts = useCallback(() => {
    const codes = [...selectedReceiptCodes];
    if (!codes.length) return;
    window.open(`/cashier/print-receipt-batch?codes=${codes.map(encodeURIComponent).join(',')}`, '_blank', 'noopener');
  }, [selectedReceiptCodes]);

  useEffect(() => {
    setPendingRows(pending);
  }, [pending]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('retry_betterpay');
    if (ref) {
      setBetterPayRetryRef(ref);
      setPrepayOpen(true);
      setTab('pending');
      params.delete('retry_betterpay');
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `/cashier?${qs}` : '/cashier');
    }
    if (params.get('prepay') === '1') {
      setPrepayDefaults({
        patientId: params.get('baby_patient_id') || params.get('patient_id') || '',
        serviceType: params.get('service') || 'maternity',
        catalogId: params.get('catalog_id') || '',
        maternityPatientId: params.get('maternity_id') || '',
        maternityEvent: params.get('maternity_event') || ''});
      setPrepayOpen(true);
      setTab('pending');
      params.delete('prepay');
      params.delete('patient_id');
      params.delete('baby_patient_id');
      params.delete('service');
      params.delete('catalog_id');
      params.delete('maternity_id');
      params.delete('maternity_event');
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `/cashier?${qs}` : '/cashier');
    }
    const receiptId = params.get('print_receipt');
    if (receiptId) {
      window.open(`/cashier/print-receipt-premium/${encodeURIComponent(receiptId)}`, '_blank', 'noopener');
      params.delete('print_receipt');
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `/cashier?${qs}` : '/cashier');
    }
    const tabParam = params.get('tab');
    if (tabParam === 'billing') {
      setBillingOpen(true);
    } else if (tabParam && ['pending', 'history', 'opd', 'ipd', 'codes', 'rx', 'emergency'].includes(tabParam)) {
      setTab(tabParam);
    }
  }, []);

  const refreshPending = useCallback(() => {
    fetch('/api/cashier/pending-payments')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.pending)) setPendingRows(data.pending);
      })
      .catch(() => {});
  }, []);

  const handleBetterPayRetry = useCallback(async (ref) => {
    setRetryBusy(true);
    try {
      const res = await fetch('/api/cashier/prepay/betterpay/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ref })});
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || t('cashier.retry_failed'));
      setBetterPayRetryRef(ref);
      setPrepayOpen(true);
    } catch (e) {
      notifyError(e.message || t('cashier.retry_failed'));
    } finally {
      setRetryBusy(false);
    }
  }, [t]);

  const opdCount = opdPendingGroups.reduce((s, g) => s + (parseInt(g.pending_count, 10) || 0), 0);
  const emgSettle = pending.filter((t) => {
    const c = String(t.ticket_code || '');
    return c.startsWith('EMG-') || c.startsWith('EMG-SET-') || (t.emergency_visit_id != null && parseInt(t.emergency_visit_id, 10) > 0);
  });

  const histQuery = histQ ? { hist_q: histQ } : {};

  const opdRows = useMemo(
    () =>
      opdPendingGroups.map((g) => ({
        ...g,
        patient_name: `${g.first_name || ''} ${g.last_name || ''}`.trim(),
        total_due: g.pending_total,
        _search: `${g.first_name || ''} ${g.last_name || ''} ${g.consultation_id || ''} ${g.pending_total || ''}`.toLowerCase()})),
    [opdPendingGroups]
  );

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="money-bill-wave" title={t('cashier.title')} subtitle={t('cashier.subtitle')}>
          <div className="hms-surface-hero-actions mt-4 flex flex-wrap gap-3">
            <button type="button" className="hms-btn-primary px-6 py-3 text-base" onClick={() => setPrepayOpen(true)}>
              <FaIcon name="ticket" /> {t('cashier.issue_payment')}
            </button>
            <button type="button" className="hms-btn-secondary px-6 py-3 text-base" onClick={() => setBillingOpen(true)}>
              <FaIcon name="file-text-o" /> {t('cashier.tab_billing')}
              {(billingSummary.pending_count ?? 0) > 0 ? (
                <span className="ml-1.5 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand">
                  {billingSummary.pending_count}
                </span>
              ) : null}
            </button>
          </div>
        </SurfaceHero>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('cashier.kpi_revenue')}
            value={formatMoney(kpi.today_revenue || 0)}
            hint={t('cashier.kpi_revenue_sub', { count: kpi.today_count || 0 })}
            tone="brand"
            icon="chart-line"
          />
          <StatCard
            label={t('cashier.kpi_pending')}
            value={kpi.pending_count ?? pending.length}
            hint={t('cashier.kpi_pending_sub')}
            tone="warning"
            icon="clock"
          />
          <StatCard
            label={t('cashier.kpi_wallet')}
            value={formatMoney(kpi.today_wallet || 0)}
            hint={t('cashier.kpi_wallet_sub')}
            tone="brand"
            icon="wallet"
          />
          <StatCard
            label={t('cashier.kpi_quick')}
            value={t('cashier.kpi_wallet_hub')}
            hint={
              <a href="/wallet" className="font-semibold text-brand hover:underline">
                {t('cashier.kpi_wallet_link')}
              </a>
            }
            tone="brand"
            icon="link"
          />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
            <FaIcon name="search" className="text-brand" />
            {t('cashier.lookup_title')}
          </h2>
          <form action="/cashier/lookup" method="POST" className="flex gap-2">
            <div className="relative flex-1">
              <FaIcon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                name="code"
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value)}
                required
                className="hms-input w-full pl-9"
                placeholder={t('cashier.lookup_ph')}
              />
            </div>
            <button type="submit" className="hms-btn-primary shrink-0">
              {t('cashier.find')}
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div
            className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/50 p-3"
            role="tablist"
            aria-label={t('cashier.sections_aria')}
          >
            <TabBtn active={tab === 'pending'} onClick={() => setTab('pending')} icon="clock-o" label={t('cashier.tab_pending')} count={pendingRows.length} />
            <TabBtn active={tab === 'history'} onClick={() => setTab('history')} icon="history" label={t('cashier.tab_history')} count={historyPager?.total ?? history.length} />
            <TabBtn active={tab === 'opd'} onClick={() => setTab('opd')} icon="stethoscope" label={t('cashier.tab_opd')} count={opdCount} />
            <TabBtn active={tab === 'ipd'} onClick={() => setTab('ipd')} icon="hospital-o" label={t('cashier.tab_ipd')} count={ipdPending.length} />
            <TabBtn active={tab === 'codes'} onClick={() => setTab('codes')} icon="clipboard" label={t('cashier.tab_codes')} count={codesStatus.length} />
            <TabBtn active={tab === 'rx'} onClick={() => setTab('rx')} icon="medkit" label={t('cashier.tab_rx')} count={doctorPrescriptions.length} />
            <TabBtn active={tab === 'emergency'} onClick={() => setTab('emergency')} icon="ambulance" label={t('cashier.tab_emergency')} count={emgSettle.length + erPending.length} />
          </div>

          <div className="p-0">
            {tab === 'pending' ? (
              <div className="p-4">
                <div className="mb-3">
                  <SearchField
                    value={pendingSearch}
                    onChange={(e) => setPendingSearch(e.target.value)}
                    placeholder={t('cashier.filter_pending')}
                  />
                </div>
                <ClientTable
                  rows={pendingRows}
                  search={pendingSearch}
                  emptyLabel={t('cashier.empty_pending')}
                  columns={{
                    colSpan: 6,
                    header: (
                      <tr>
                        <th className="px-4 py-3">{t('cashier.col_ticket')}</th>
                        <th className="px-4 py-3">{t('cashier.col_patient')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_amount')}</th>
                        <th className="px-4 py-3">{t('cashier.col_status')}</th>
                        <th className="px-4 py-3">{t('cashier.col_issued')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_action')}</th>
                      </tr>
                    ),
                    renderRow: (tRow) => {
                      const tc = String(tRow.ticket_code || '');
                      const isEmg = tc.startsWith('EMG-') || tc.startsWith('EMG-SET-') || (tRow.emergency_visit_id != null && parseInt(tRow.emergency_visit_id, 10) > 0);
                      const bpSt = String(tRow.betterpay_status || '').toLowerCase();
                      const isBetterPayFail = bpSt === 'timeout' || bpSt === 'failed';
                      const isBetterPayPending = String(tRow.payment_method || '') === 'BetterPay' && (!bpSt || bpSt === 'pending');
                      const statusLabel = bpSt === 'timeout'
                        ? t('cashier.betterpay_status_timeout')
                        : bpSt === 'failed'
                          ? t('cashier.betterpay_status_failed')
                          : isBetterPayPending
                            ? t('modals.cashierPrepay.waiting_payment')
                            : '—';
                      return (
                        <tr key={tRow.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">
                            {tRow.ticket_code}
                            {isEmg ? <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-800">{t('cashier.ae_badge')}</span> : null}
                            {String(tRow.payment_method || '') === 'BetterPay' ? (
                              <span className="ml-1 rounded bg-cyan-100 px-1 text-[10px] text-cyan-900">{t('cashier.betterpay_pending_badge')}</span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold">
                              {tRow.first_name} {tRow.last_name}
                            </div>
                            <div className="text-xs text-slate-500">#P-{tRow.patient_id}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-blue-800">{formatMoney(tRow.total_amount)}</td>
                          <td className="px-4 py-3 text-xs font-semibold">
                            {isBetterPayFail ? (
                              <span className="text-red-700">{statusLabel}</span>
                            ) : isBetterPayPending ? (
                              <span className="text-amber-700">{statusLabel}</span>
                            ) : (
                              <span className="text-slate-500">{statusLabel}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{formatDate(tRow.created_at)}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {isBetterPayFail ? (
                              <button
                                type="button"
                                disabled={retryBusy}
                                className="inline-flex rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-800 disabled:opacity-50"
                                onClick={() => handleBetterPayRetry(tc)}
                              >
                                {t('cashier.retry_payment')}
                              </button>
                            ) : isBetterPayPending ? (
                              <button
                                type="button"
                                className="inline-flex rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-800"
                                onClick={() => {
                                  setBetterPayRetryRef(tc);
                                  setPrepayOpen(true);
                                }}
                              >
                                {t('cashier.continue_payment')}
                              </button>
                            ) : (
                              <>
                                <CashierPrintGroup ticketCode={tRow.ticket_code} status={tRow.status || 'pending'} />
                                <a href={`/cashier/settle/${tRow.id}`} className="ml-1 inline-flex rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800">
                                  {t('cashier.collect')}
                                </a>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    }}}
                />
              </div>
            ) : null}

            {tab === 'history' ? (
              <div className="p-4">
                <div className="mb-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase text-slate-500">{t('cashier.batch_print')}</span>
                    <span className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t('cashier.batch_format_aria')}>
                      <button
                        type="button"
                        className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase ${batchFormat === 'slip' ? 'bg-brand text-white' : 'text-slate-500'}`}
                        onClick={() => setBatchFormat('slip')}
                      >
                        {t('cashier.batch_format_slips')}
                      </button>
                      <button
                        type="button"
                        className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase ${batchFormat === 'receipt' ? 'bg-brand text-white' : 'text-slate-500'}`}
                        onClick={() => setBatchFormat('receipt')}
                      >
                        {t('cashier.batch_format_receipts')}
                      </button>
                    </span>
                    <input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} className="hms-input text-sm" />
                    <button type="button" className="hms-btn-secondary text-xs" onClick={() => openBatchPrint('day')}>
                      {batchFormat === 'receipt'
                        ? t('cashier.batch_today_receipts')
                        : t('cashier.batch_today')}
                    </button>
                    <button type="button" className="hms-btn-secondary text-xs" onClick={() => openBatchPrint('week')}>
                      {batchFormat === 'receipt'
                        ? t('cashier.batch_week_receipts')
                        : t('cashier.batch_week')}
                    </button>
                    <button type="button" className="hms-btn-secondary text-xs" onClick={() => openBatchPrint('month')}>
                      {batchFormat === 'receipt'
                        ? t('cashier.batch_month_receipts')
                        : t('cashier.batch_month')}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                    <span className="text-xs text-slate-500">
                      {t('cashier.batch_selected_count', { count: selectedReceiptCodes.size })}
                    </span>
                    <button
                      type="button"
                      className="hms-btn-primary text-xs"
                      disabled={selectedReceiptCodes.size === 0}
                      onClick={printSelectedReceipts}
                    >
                      <i className="fa fa-print mr-1" aria-hidden="true" />
                      {t('cashier.batch_print_selected')}
                    </button>
                    {selectedReceiptCodes.size > 0 ? (
                      <button type="button" className="hms-btn-secondary text-xs" onClick={() => setSelectedReceiptCodes(new Set())}>
                        {t('cashier.batch_clear_selection')}
                      </button>
                    ) : null}
                  </div>
                </div>
                <form method="get" action="/cashier" className="mb-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="page" value="1" />
                  <div className="relative max-w-xs flex-1">
                    <FaIcon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      name="hist_q"
                      defaultValue={histQ}
                      className="hms-input pl-9"
                      placeholder={t('cashier.hist_ph')}
                    />
                  </div>
                  <button type="submit" className="hms-btn-primary shrink-0">
                    {t('common:actions.search')}
                  </button>
                  {histQ ? (
                    <a href="/cashier" className="hms-btn-secondary">
                      {t('cashier.clear')}
                    </a>
                  ) : null}
                </form>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="w-10 px-2 py-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                            checked={allPaidSelected}
                            onChange={toggleAllPaidOnPage}
                            aria-label={t('cashier.batch_select_all')}
                          />
                        </th>
                        <th className="px-4 py-3">{t('cashier.col_code')}</th>
                        <th className="px-4 py-3">{t('cashier.col_patient')}</th>
                        <th className="px-4 py-3">{t('cashier.col_service')}</th>
                        <th className="px-4 py-3">{t('cashier.col_amount')}</th>
                        <th className="px-4 py-3">{t('cashier.col_status')}</th>
                        <th className="px-4 py-3">{t('cashier.col_date')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_print')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                            {t('cashier.empty_history')}
                          </td>
                        </tr>
                      ) : (
                        history.map((row) => {
                          let lines = [];
                          try {
                            lines = JSON.parse(row.lines_json || '[]');
                          } catch {
                            lines = [];
                          }
                          const svcName = lines.length ? lines[0].description || '—' : '—';
                          const st = String(row.status || '').toLowerCase();
                          const isPaid = st === 'paid';
                          const checked = selectedReceiptCodes.has(row.ticket_code);
                          return (
                            <tr key={row.id} className={`hover:bg-slate-50/80 ${checked ? 'bg-brand/[0.04]' : ''}`}>
                              <td className="px-2 py-3 text-center">
                                {isPaid ? (
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                                    checked={checked}
                                    onChange={() => toggleReceiptCode(row.ticket_code)}
                                    aria-label={t('cashier.batch_select_row')}
                                  />
                                ) : null}
                              </td>
                              <td className="px-4 py-3 font-bold">{row.ticket_code}</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  className="text-left font-medium text-ink hover:text-brand hover:underline"
                                  title={t('cashier.batch_select_patient')}
                                  onClick={() => isPaid && selectPatientReceipts(row)}
                                >
                                  {row.first_name} {row.last_name}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500">{svcName}</td>
                              <td className="px-4 py-3 font-bold">{formatMoney(row.total_amount)}</td>
                              <td className="px-4 py-3 text-xs uppercase">{st}</td>
                              <td className="px-4 py-3 text-xs text-slate-500">{formatDate(row.created_at)}</td>
                              <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                                {isPaid ? <CashierInvoiceActions ticketCode={row.ticket_code} /> : null}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager pager={historyPager} basePath="/cashier" query={histQuery} pageParam="page" />
              </div>
            ) : null}

            {tab === 'opd' ? (
              <div className="p-4">
                <div className="mb-3">
                  <SearchField
                    value={opdSearch}
                    onChange={(e) => setOpdSearch(e.target.value)}
                    placeholder={t('cashier.filter_opd')}
                  />
                </div>
                <ClientTable
                  rows={opdRows}
                  search={opdSearch}
                  emptyLabel={t('cashier.empty_opd')}
                  columns={{
                    colSpan: 5,
                    header: (
                      <tr>
                        <th className="px-4 py-3">{t('cashier.col_patient')}</th>
                        <th className="px-4 py-3">{t('cashier.col_consult')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_items')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_total')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_action')}</th>
                      </tr>
                    ),
                    renderRow: (g) => (
                      <tr key={g.consultation_id || g.patient_id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold">{g.patient_name || '—'}</td>
                        <td className="px-4 py-3 text-xs">#{g.consultation_id || '—'}</td>
                        <td className="px-4 py-3 text-right">{g.pending_count || 0}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatMoney(g.pending_total || 0)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {g.consultation_id ? (
                            <CashierPrintLink
                              href={`/cashier/prescriptions/${g.consultation_id}/print`}
                              label={t('print:link_rx', { ns: 'print' })}
                              variant="rx"
                              title={t('cashier.print_rx_title')}
                            />
                          ) : null}
                          <button
                            type="button"
                            className="ml-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100"
                            onClick={() =>
                              setOpdBill({
                                open: true,
                                patientId: g.patient_id,
                                patientName: g.patient_name,
                                consultationId: g.consultation_id || 0})
                            }
                          >
                            {t('cashier.view_bill')}
                          </button>
                        </td>
                      </tr>
                    )}}
                />
              </div>
            ) : null}

            {tab === 'ipd' ? (
              <div className="p-4">
                <div className="mb-3">
                  <SearchField
                    value={ipdSearch}
                    onChange={(e) => setIpdSearch(e.target.value)}
                    placeholder={tIpd('cashier.filter_ph')}
                  />
                </div>
                <ClientTable
                  rows={ipdPending}
                  search={ipdSearch}
                  emptyLabel={tIpd('cashier.empty')}
                  columns={{
                    colSpan: 7,
                    header: (
                      <tr>
                        <th className="px-4 py-3">{tIpd('cashier.col_patient')}</th>
                        <th className="px-4 py-3">{tIpd('cashier.col_ward_bed')}</th>
                        <th className="px-4 py-3">{tIpd('cashier.col_dept')}</th>
                        <th className="px-4 py-3 text-right">{tIpd('cashier.col_charges')}</th>
                        <th className="px-4 py-3 text-right">{tIpd('cashier.col_deposit')}</th>
                        <th className="px-4 py-3 text-right text-red-700">{tIpd('cashier.col_balance')}</th>
                        <th className="px-4 py-3 text-right">{tIpd('cashier.col_action')}</th>
                      </tr>
                    ),
                    renderRow: (r) => (
                      <tr key={r.admission_id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold">
                          {r.first_name} {r.last_name}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {[r.ward_name, r.bed_label].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs">{r.admitting_department || '—'}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(r.total_charges || 0)}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(r.deposit_amount || 0)}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-700">
                          {r.refund > 0 ? `-${formatMoney(r.refund)}` : formatMoney(r.balance || 0)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.refund > 0 ? (
                            <span className="text-xs font-bold text-amber-800">{tIpd('cashier.refund')}</span>
                          ) : r.balance === 0 ? (
                            <button type="button" className="text-xs font-bold text-emerald-700" onClick={() => setIpdAdm(r)}>
                              {tIpd('cashier.zero_confirm')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white"
                              onClick={() => setIpdAdm(r)}
                            >
                              {tIpd('cashier.settle_bill')}
                            </button>
                          )}
                        </td>
                      </tr>
                    )}}
                />
              </div>
            ) : null}

            {tab === 'codes' ? (
              <div className="p-4">
                <div className="mb-3">
                  <SearchField
                    value={codesSearch}
                    onChange={(e) => setCodesSearch(e.target.value)}
                    placeholder={t('cashier.filter_codes')}
                  />
                </div>
                <ClientTable
                  rows={codesStatus}
                  search={codesSearch}
                  emptyLabel={t('cashier.empty_codes')}
                  columns={{
                    colSpan: 6,
                    header: (
                      <tr>
                        <th className="px-4 py-3">{t('cashier.col_code')}</th>
                        <th className="px-4 py-3">{t('cashier.col_type')}</th>
                        <th className="px-4 py-3">{t('cashier.col_patient')}</th>
                        <th className="px-4 py-3">{t('cashier.col_service')}</th>
                        <th className="px-4 py-3">{t('cashier.col_status')}</th>
                        <th className="px-4 py-3">{t('cashier.col_generated')}</th>
                      </tr>
                    ),
                    renderRow: (c, i) => (
                      <tr key={`${c.code_value}-${i}`} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-mono text-xs font-bold">{c.code_value}</td>
                        <td className="px-4 py-3 text-xs">{c.code_type}</td>
                        <td className="px-4 py-3 text-xs">
                          {c.first_name} {c.last_name}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{c.service_label || '—'}</td>
                        <td className="px-4 py-3 text-xs">{c.code_status || c.active_yes_no || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(c.date_generated)}</td>
                      </tr>
                    )}}
                />
              </div>
            ) : null}

            {tab === 'rx' ? (
              <div className="p-4">
                <div className="mb-3">
                  <SearchField
                    value={rxSearch}
                    onChange={(e) => setRxSearch(e.target.value)}
                    placeholder={t('cashier.filter_rx')}
                  />
                </div>
                <ClientTable
                  rows={doctorPrescriptions}
                  search={rxSearch}
                  emptyLabel={t('cashier.empty_rx')}
                  columns={{
                    colSpan: 7,
                    header: (
                      <tr>
                        <th className="px-4 py-3">{t('cashier.col_patient')}</th>
                        <th className="px-4 py-3">{t('cashier.col_doctor')}</th>
                        <th className="px-4 py-3">{t('cashier.col_date')}</th>
                        <th className="min-w-[260px] px-4 py-3">{t('cashier.col_codes')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_items')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_total')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_action')}</th>
                      </tr>
                    ),
                    renderRow: (rx) => {
                      const items = (rx.counts?.laboratory || 0) + (rx.counts?.radiology || 0) + (rx.counts?.pharmacy || 0);
                      return (
                        <tr key={rx.consultation_id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-semibold">{rx.patient_name}</td>
                          <td className="px-4 py-3 text-xs">{rx.doctor_name}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{formatDate(rx.consult_at)}</td>
                          <td className="px-4 py-3 align-top">
                            <DoctorRxCodeBadges codes={rx.codes} />
                          </td>
                          <td className="px-4 py-3 text-right">{items}</td>
                          <td className="px-4 py-3 text-right font-bold">{formatMoney(rx.total_amount)}</td>
                          <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                            <button
                              type="button"
                              className="mr-2 inline-flex rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 font-bold text-red-800 hover:bg-red-100"
                              onClick={() =>
                                setOpdRefund({
                                  open: true,
                                  consultationId: rx.consultation_id,
                                  patientName: rx.patient_name,
                                  doctorName: rx.doctor_name})
                              }
                            >
                              {t('cashier.refund')}
                            </button>
                            <CashierPrintLink
                              href={`/cashier/prescriptions/${rx.consultation_id}/print`}
                              label={t('cashier.print')}
                              variant="rx"
                            />
                          </td>
                        </tr>
                      );
                    }}}
                />
              </div>
            ) : null}

            {tab === 'emergency' ? (
              <div className="border-l-4 border-red-500 p-4">
                <h3 className="mb-2 text-sm font-extrabold text-red-900">{t('erDischarge.cashier_final_title')}</h3>
                <p className="mb-3 text-xs text-slate-600">{t('erDischarge.cashier_final_hint')}</p>
                <div className="mb-6 overflow-x-auto rounded-xl border border-red-200 bg-red-50/40">
                  <table className="min-w-full text-sm">
                    <thead className="bg-red-100/80 text-xs font-semibold uppercase text-red-900">
                      <tr>
                        <th className="px-4 py-3 text-left">{t('cashier.col_patient')}</th>
                        <th className="px-4 py-3 text-left">{t('erDischarge.ticket')}</th>
                        <th className="px-4 py-3 text-right">{t('erDischarge.balance_due')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_action')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100">
                      {erPending.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                            {t('erDischarge.cashier_none')}
                          </td>
                        </tr>
                      ) : (
                        erPending.map((v) => (
                          <tr key={v.visit_id}>
                            <td className="px-4 py-3 font-semibold">
                              {v.first_name} {v.last_name}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">{v.ticket_number || `#${v.visit_id}`}</td>
                            <td className="px-4 py-3 text-right font-bold">{formatMoney(v.balance_due)}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white"
                                onClick={() => setErVisit(v)}
                              >
                                {t('erDischarge.settle_btn')}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <h3 className="mb-2 text-sm font-extrabold text-slate-800">{t('cashier.tab_emergency')}</h3>
                <p className="mb-3 text-xs text-slate-600">{t('cashier.emg_hint')}</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">{t('cashier.col_ticket')}</th>
                        <th className="px-4 py-3">{t('cashier.col_patient')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_amount')}</th>
                        <th className="px-4 py-3 text-right">{t('cashier.col_action')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {emgSettle.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                            {t('cashier.empty_emg')}
                          </td>
                        </tr>
                      ) : (
                        emgSettle.map((tRow) => (
                          <tr key={tRow.id}>
                            <td className="px-4 py-3 font-mono text-xs font-bold">{tRow.ticket_code}</td>
                            <td className="px-4 py-3 font-semibold">
                              {tRow.first_name} {tRow.last_name}
                            </td>
                            <td className="px-4 py-3 text-right font-bold">{formatMoney(tRow.total_amount)}</td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <CashierPrintGroup ticketCode={tRow.ticket_code} status={tRow.status || 'pending'} />
                              <a href={`/cashier/settle/${tRow.id}`} className="ml-1 inline-flex rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">
                                {t('cashier.collect')}
                              </a>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <CashierBillingModal
        open={billingOpen}
        onClose={() => setBillingOpen(false)}
        initialInvoices={billingInvoices}
        initialSummary={billingSummary}
        initialTotal={billingTotal}
        serviceCatalog={serviceCatalogForInvoice}
        pharmacyCatalog={pharmacyCatalogForInvoice}
        consultCatalog={consultCatalog}
        labCatalog={labCatalog}
        imagingCatalog={imagingCatalog}
        maternityCatalog={maternityCatalog}
        surgeryCatalog={surgeryCatalog}
        svcCatalog={svcCatalog}
      />
      <CashierPrepayModal
        open={prepayOpen}
        onClose={() => {
          setPrepayOpen(false);
          setBetterPayRetryRef(null);
          setPrepayDefaults(null);
        }}
        onBetterPayComplete={refreshPending}
        betterPayRetryRef={betterPayRetryRef}
        prepayDefaults={prepayDefaults}
        consultCatalog={consultCatalog}
        labCatalog={labCatalog}
        imagingCatalog={imagingCatalog}
        maternityCatalog={maternityCatalog}
        surgeryCatalog={surgeryCatalog}
        svcCatalog={svcCatalog}
        doctors={doctors}
        specialistSpecialisations={specialistSpecialisations}
        paymentMethods={paymentMethods}
      />
      <OpdOrdersBillModal
        open={opdBill.open}
        onClose={() => setOpdBill({ open: false, patientId: 0, patientName: '', consultationId: 0 })}
        patientId={opdBill.patientId}
        patientName={opdBill.patientName}
        consultationId={opdBill.consultationId}
      />
      <OpdRefundModal
        open={opdRefund.open}
        onClose={() => setOpdRefund({ open: false, consultationId: 0, patientName: '', doctorName: '' })}
        consultationId={opdRefund.consultationId}
        patientName={opdRefund.patientName}
        doctorName={opdRefund.doctorName}
      />
      <IpdSettleModal open={!!ipdAdm} onClose={() => setIpdAdm(null)} admission={ipdAdm} />
      <ErSettleModal open={!!erVisit} onClose={() => setErVisit(null)} visit={erVisit} />
    </div>
  );
}
