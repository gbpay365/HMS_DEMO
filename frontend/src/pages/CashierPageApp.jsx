/** Cashier UI — localized via clinical + ipd namespaces. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { formatMoney } from '../lib/listUi';
import { notifyError } from '../lib/notifyBridge';
import { CashierPrepayModal } from '../modals/CashierPrepayModal';
import { IpdSettleModal } from '../modals/IpdSettleModal';
import { ErSettleModal } from '../modals/ErSettleModal';
import { OpdOrdersBillModal } from '../modals/OpdOrdersBillModal';
import { OpdRefundModal } from '../modals/OpdRefundModal';
import { CashierBillingModal } from '../modals/CashierBillingModal';
import { CashierDisbursementModal } from '../modals/CashierDisbursementModal';
import {
  CashierReferenceShell,
  CashierPageSection,
} from '../components/cashier/CashierReferenceShell';
import { CashierPosPanel } from '../components/cashier/CashierPosPanel';
import { CashierPatientBillsWorkspace } from '../components/cashier/CashierPatientBillsWorkspace';
import { CashierInvoicesPanel } from '../components/cashier/CashierInvoicesPanel';
import { CashierInsurancePanel } from '../components/cashier/CashierInsurancePanel';
import { CashierShiftPanel } from '../components/cashier/CashierShiftPanel';
import { CashierRefundsPanel } from '../components/cashier/CashierRefundsPanel';
import { CashierNewInvoiceOdooModal } from '../components/cashier/CashierNewInvoiceOdooModal';
import { CashierSubmitInsuranceClaimModal } from '../components/cashier/CashierSubmitInsuranceClaimModal';
import { CashierOverviewPanel } from '../components/cashier/CashierOverviewPanel';
import { CashierReportsPanel } from '../components/cashier/CashierReportsPanel';
import { REPORT_HUB_TABS } from '../components/cashier/CashierReportHubBar';
import { CashierProfileModal } from '../components/cashier/CashierProfileModal';
import { openWalletTopup } from '../lib/walletModalBridge';

const CASHIER_PAGES = ['dashboard', 'pos', 'bills', 'invoices', 'insurance', 'shift', 'refunds', 'reports'];
const TAB_TO_PAGE = {
  pending: 'bills',
  opd: 'bills',
  ipd: 'bills',
  codes: 'bills',
  rx: 'bills',
  emergency: 'bills',
  lab_walkin: 'bills',
  rad_walkin: 'bills',
  history: 'bills',
  billing: 'invoices',
};

const REPORT_HUB_IDS = new Set(REPORT_HUB_TABS.map((t) => t.id));

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
  insuranceClaims = [],
  insuranceSummary = {},
  insuranceMonthLabel = '',
  shiftSummary = {},
  refundSummary = {},
  cashierRefunds = [],
  refundMonthLabel = '',
  serviceCatalogForInvoice = [],
  pharmacyCatalogForInvoice = [],
  kpi = {},
  overviewKpi = {},
  overviewRevenueChart = [],
  reportsData = {},
  todayTotals = {},
  consultCatalog = [],
  labCatalog = [],
  imagingCatalog = [],
  maternityCatalog = [],
  surgeryCatalog = [],
  svcCatalog = [],
  doctors = [],
  specialistSpecialisations = [],
  paymentMethods = [],
  patients = [],
  flash = null,
  error = null,
  cashierIdentity = null,
  selfProfile = null,
  profileDepartments = [],
  cashierPage: initialPage = 'dashboard',
  cashierTab: initialTab = 'pending',
  cashierReport: initialReport = 'revenue',
}) {
  const { t } = useTranslation('clinical');
  const { t: tIpd } = useTranslation('ipd');
  const { t: tOps } = useTranslation('ops');
  const [page, setPage] = useState(CASHIER_PAGES.includes(initialPage) ? initialPage : 'dashboard');
  const [workflowTab, setWorkflowTab] = useState(initialTab || 'pending');
  const [posPatientSeed, setPosPatientSeed] = useState(null);
  const [billsSearchSeed, setBillsSearchSeed] = useState('');
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
  const [labWalkinSearch, setLabWalkinSearch] = useState('');
  const [labWalkins, setLabWalkins] = useState([]);
  const [radWalkinSearch, setRadWalkinSearch] = useState('');
  const [radWalkins, setRadWalkins] = useState([]);
  const [rxSearch, setRxSearch] = useState('');
  const [pendingRows, setPendingRows] = useState(pending);
  const [betterPayRetryRef, setBetterPayRetryRef] = useState(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [prepayDefaults, setPrepayDefaults] = useState(null);
  const [billingOpen, setBillingOpen] = useState(false);
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [newClaimOpen, setNewClaimOpen] = useState(false);
  const [invoicesRefreshToken, setInvoicesRefreshToken] = useState(0);
  const [claimsRefreshToken, setClaimsRefreshToken] = useState(0);
  const [billsRefreshToken, setBillsRefreshToken] = useState(0);
  const [disbursementOpen, setDisbursementOpen] = useState(false);
  const [profileModal, setProfileModal] = useState(null);
  const [reportHubTab, setReportHubTab] = useState(
    REPORT_HUB_IDS.has(initialReport) ? initialReport : 'revenue',
  );
  const [batchDate, setBatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [batchFormat, setBatchFormat] = useState('receipt');
  const [selectedReceiptCodes, setSelectedReceiptCodes] = useState(() => new Set());

  const paidHistoryRows = useMemo(
    () => history.filter((row) => String(row.status || '').toLowerCase() === 'paid'),
    [history]
  );

  const clearReceiptSelection = useCallback(() => {
    setSelectedReceiptCodes(new Set());
  }, []);

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
    const hadFlashParams = params.has('msg') || params.has('err');
    params.delete('msg');
    params.delete('err');
    const ref = params.get('retry_betterpay');
    if (ref) {
      setBetterPayRetryRef(ref);
      setPrepayOpen(true);
      setPage('bills');
      setWorkflowTab('pending');
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
      setPage('pos');
      setWorkflowTab('pending');
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
    const pageParam = params.get('page');
    if (pageParam && CASHIER_PAGES.includes(pageParam)) {
      setPage(pageParam);
    }
    const reportParam = params.get('report');
    if (reportParam && REPORT_HUB_IDS.has(reportParam)) {
      setReportHubTab(reportParam);
      setPage('reports');
    }
    const tabParam = params.get('tab');
    if (tabParam === 'billing') {
      setPage('invoices');
      setNewInvoiceOpen(true);
    } else if (tabParam && TAB_TO_PAGE[tabParam]) {
      setPage(TAB_TO_PAGE[tabParam]);
      if (tabParam !== 'billing') setWorkflowTab(tabParam);
    }
    if (params.get('walkin_id')) {
      setPage('bills');
      if (tabParam === 'rad_walkin') setWorkflowTab('rad_walkin');
      else setWorkflowTab('lab_walkin');
    }
    if (params.get('disbursement') === '1' || params.get('disbursement') === 'true') {
      setDisbursementOpen(true);
      params.delete('disbursement');
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `/cashier?${qs}` : '/cashier');
    }
    if (params.get('wallet_topup') === '1' || params.get('wallet_topup') === 'true') {
      queueMicrotask(() => openWalletTopup());
      params.delete('wallet_topup');
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `/cashier?${qs}` : '/cashier');
    }
    if (params.get('edit_profile') === '1' || params.get('edit_profile') === 'true') {
      setProfileModal('profile');
      params.delete('edit_profile');
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `/cashier?${qs}` : '/cashier');
    }
    if (hadFlashParams) {
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `/cashier?${qs}` : '/cashier');
    }
  }, []);

  const refreshLabWalkins = useCallback(() => {
    fetch('/api/cashier/lab-walkins', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.walkins)) setLabWalkins(data.walkins);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshLabWalkins();
  }, [refreshLabWalkins]);

  const refreshRadWalkins = useCallback(() => {
    fetch('/api/cashier/rad-walkins', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.walkins)) setRadWalkins(data.walkins);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshRadWalkins();
  }, [refreshRadWalkins]);

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


  const opdRows = useMemo(
    () =>
      opdPendingGroups.map((g) => ({
        ...g,
        patient_name: `${g.first_name || ''} ${g.last_name || ''}`.trim(),
        total_due: g.pending_total,
        _search: `${g.first_name || ''} ${g.last_name || ''} ${g.consultation_id || ''} ${g.pending_total || ''}`.toLowerCase()})),
    [opdPendingGroups]
  );

  const labWalkinRows = useMemo(
    () =>
      (labWalkins || []).map((w) => ({
        ...w,
        patient_name: `${w.first_name || ''} ${w.last_name || ''}`.trim(),
        _search: `${w.first_name || ''} ${w.last_name || ''} ${w.registration_no || ''} ${w.tests_summary || ''} ${w.mobile || ''}`.toLowerCase()})),
    [labWalkins]
  );

  const radWalkinRows = useMemo(
    () =>
      (radWalkins || []).map((w) => ({
        ...w,
        patient_name: `${w.first_name || ''} ${w.last_name || ''}`.trim(),
        _search: `${w.first_name || ''} ${w.last_name || ''} ${w.registration_no || ''} ${w.tests_summary || ''} ${w.mobile || ''}`.toLowerCase()})),
    [radWalkins]
  );


  const switchPage = useCallback((nextPage) => {
    setPage(nextPage);
    const params = new URLSearchParams(window.location.search);
    params.set('page', nextPage);
    params.delete('tab');
    window.history.replaceState({}, '', `/cashier?${params}`);
  }, []);

  const switchWorkflowTab = useCallback((nextTab) => {
    setPage('bills');
    setWorkflowTab(nextTab);
    const params = new URLSearchParams(window.location.search);
    params.set('page', 'bills');
    params.set('tab', nextTab);
    window.history.replaceState({}, '', `/cashier?${params}`);
  }, []);

  const timeLabel = useMemo(
    () =>
      new Date().toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );

  const handleSearchNavigate = useCallback((item) => {
    if (!item?.type) return;
    if (item.type === 'patient') {
      setPosPatientSeed({ id: item.patient_id, name: item.label });
      setPage('pos');
      return;
    }
    if (item.type === 'bill') {
      const st = String(item.status || '').toLowerCase();
      if (st === 'pending' || (item.balance_due || 0) > 0.005) {
        if (item.ticket_id) {
          window.location.href = `/cashier/settle/${item.ticket_id}`;
          return;
        }
      }
      setBillsSearchSeed(item.ticket_code || item.label || '');
      setPage('bills');
      return;
    }
    if (item.type === 'receipt') {
      if (item.ticket_id) {
        window.open(`/cashier/print-receipt/${item.ticket_id}`, '_blank', 'noopener');
        return;
      }
      if (item.billing_doc_id) {
        window.open(`/cashier/print-receipt/${item.billing_doc_id}`, '_blank', 'noopener');
        return;
      }
      setBillsSearchSeed(item.label || '');
      setPage('bills');
    }
  }, []);

  const handleOverviewPayBill = useCallback((row) => {
    if (row?.ticket_id) {
      window.location.href = `/cashier/settle/${row.ticket_id}`;
    }
  }, []);

  const userInitials = useMemo(() => {
    const name = cashierIdentity?.identity || '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'ZA';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [cashierIdentity]);

  return (
    <>
      <CashierReferenceShell
        page={page}
        onPageChange={switchPage}
        onSearchNavigate={handleSearchNavigate}
        onNewBill={() => setPrepayOpen(true)}
        pendingCount={pendingRows.length}
        billingPendingCount={billingSummary.pending_count ?? 0}
        insurancePendingCount={insuranceSummary.pending_count ?? 0}
        userInitials={userInitials}
        cashierName={cashierIdentity?.identity || ''}
        cashierCode={cashierIdentity?.code || ''}
        dateTimeLabel={timeLabel}
        balanceLabel={formatMoney(todayTotals?.balance?.value ?? 0)}
        tOps={tOps}
        onEditProfile={() => setProfileModal('profile')}
        onChangePassword={() => setProfileModal('password')}
      >
        <div className="cs-flash-wrap">
          <FlashMessages flash={flash} error={error} />
        </div>

        <CashierPageSection page={page} id="dashboard">
          <CashierOverviewPanel
            initialKpi={overviewKpi}
            initialRevenueChart={overviewRevenueChart}
            onPayBill={handleOverviewPayBill}
          />
        </CashierPageSection>

        <CashierPageSection page={page} id="pos">
          <CashierPosPanel
            consultCatalog={consultCatalog}
            labCatalog={labCatalog}
            imagingCatalog={imagingCatalog}
            pharmacyCatalog={pharmacyCatalogForInvoice}
            maternityCatalog={maternityCatalog}
            surgeryCatalog={surgeryCatalog}
            svcCatalog={svcCatalog}
            doctors={doctors}
            specialistSpecialisations={specialistSpecialisations}
            paymentMethods={paymentMethods}
            patients={patients}
            patientSeed={posPatientSeed}
            onSaveAsBill={() => setBillingOpen(true)}
            onNeedsPrepayModal={(defaults) => {
              setPrepayDefaults(defaults);
              setPrepayOpen(true);
            }}
          />
        </CashierPageSection>

        <CashierPageSection page={page} id="bills">
          <CashierPatientBillsWorkspace
            workflowTab={workflowTab}
            onWorkflowTabChange={switchWorkflowTab}
            lookupCode={lookupCode}
            onLookupCodeChange={setLookupCode}
            kpi={kpi}
            todayTotals={todayTotals}
            pendingRows={pendingRows}
            pendingSearch={pendingSearch}
            onPendingSearchChange={setPendingSearch}
            history={history}
            histQ={histQ}
            historyPager={historyPager}
            opdRows={opdRows}
            opdCount={opdCount}
            opdSearch={opdSearch}
            onOpdSearchChange={setOpdSearch}
            ipdPending={ipdPending}
            ipdSearch={ipdSearch}
            onIpdSearchChange={setIpdSearch}
            codesStatus={codesStatus}
            codesSearch={codesSearch}
            onCodesSearchChange={setCodesSearch}
            doctorPrescriptions={doctorPrescriptions}
            rxSearch={rxSearch}
            onRxSearchChange={setRxSearch}
            erPending={erPending}
            emgSettle={emgSettle}
            labWalkinRows={labWalkinRows}
            labWalkinSearch={labWalkinSearch}
            onLabWalkinSearchChange={setLabWalkinSearch}
            radWalkinRows={radWalkinRows}
            radWalkinSearch={radWalkinSearch}
            onRadWalkinSearchChange={setRadWalkinSearch}
            selectedReceiptCodes={selectedReceiptCodes}
            toggleReceiptCode={toggleReceiptCode}
            toggleAllPaidOnPage={toggleAllPaidOnPage}
            clearReceiptSelection={clearReceiptSelection}
            allPaidSelected={allPaidSelected}
            selectPatientReceipts={selectPatientReceipts}
            batchDate={batchDate}
            setBatchDate={setBatchDate}
            batchFormat={batchFormat}
            setBatchFormat={setBatchFormat}
            openBatchPrint={openBatchPrint}
            printSelectedReceipts={printSelectedReceipts}
            retryBusy={retryBusy}
            onBetterPayRetry={handleBetterPayRetry}
            onBetterPayContinue={(ref) => {
              setBetterPayRetryRef(ref);
              setPrepayOpen(true);
            }}
            onOpdBill={(payload) => setOpdBill({ open: true, ...payload })}
            onOpdRefund={(payload) => setOpdRefund({ open: true, ...payload })}
            onIpdSettle={setIpdAdm}
            onErSettle={setErVisit}
            billingInvoices={billingInvoices}
            billingSummary={billingSummary}
            billingTotal={billingTotal}
            billsRefreshToken={billsRefreshToken}
            billsSearchSeed={billsSearchSeed}
            onNewBill={() => setPage('pos')}
          />
        </CashierPageSection>

        <CashierPageSection page={page} id="invoices">
          <CashierInvoicesPanel
            initialInvoices={billingInvoices}
            initialTotal={billingTotal}
            refreshToken={invoicesRefreshToken}
            onNewInvoice={() => setNewInvoiceOpen(true)}
          />
        </CashierPageSection>

        <CashierPageSection page={page} id="insurance">
          <CashierInsurancePanel
            initialClaims={insuranceClaims}
            initialSummary={insuranceSummary}
            initialMonthLabel={insuranceMonthLabel}
            refreshToken={claimsRefreshToken}
            onNewClaim={() => setNewClaimOpen(true)}
          />
        </CashierPageSection>

        <CashierPageSection page={page} id="shift">
          <CashierShiftPanel initialSummary={shiftSummary} />
        </CashierPageSection>

        <CashierPageSection page={page} id="refunds">
          <CashierRefundsPanel
            initialRefunds={cashierRefunds}
            initialSummary={refundSummary}
            initialMonthLabel={refundMonthLabel}
            onBillsChanged={() => {
              setBillsRefreshToken((n) => n + 1);
              setInvoicesRefreshToken((n) => n + 1);
            }}
          />
        </CashierPageSection>

        <CashierPageSection page={page} id="reports">
          <CashierReportsPanel initialData={reportsData} initialHubTab={reportHubTab} />
        </CashierPageSection>
      </CashierReferenceShell>

      <CashierSubmitInsuranceClaimModal
        open={newClaimOpen}
        onClose={() => setNewClaimOpen(false)}
        onCreated={() => setClaimsRefreshToken((n) => n + 1)}
      />
      <CashierNewInvoiceOdooModal
        open={newInvoiceOpen}
        onClose={() => setNewInvoiceOpen(false)}
        onCreated={() => setInvoicesRefreshToken((n) => n + 1)}
        serviceCatalog={serviceCatalogForInvoice}
        pharmacyCatalog={pharmacyCatalogForInvoice}
        consultCatalog={consultCatalog}
        labCatalog={labCatalog}
        imagingCatalog={imagingCatalog}
        surgeryCatalog={surgeryCatalog}
        svcCatalog={svcCatalog}
      />
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
      <CashierDisbursementModal open={disbursementOpen} onClose={() => setDisbursementOpen(false)} />
      <CashierProfileModal
        open={profileModal != null}
        mode={profileModal || 'profile'}
        initialProfile={selfProfile}
        initialDepartments={profileDepartments}
        onClose={() => setProfileModal(null)}
        tOps={tOps}
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
        pharmacyCatalog={pharmacyCatalogForInvoice}
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
    </>
  );
}
