import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { CashierBillsWorkflowPanel, CashierBillsWorkflowTabs } from './CashierBillsWorkflowPanel';
import { CashierPatientBillsPanel } from './CashierPatientBillsPanel';
import { CashierReportHubBar } from './CashierReportHubBar';

export function CashierPatientBillsWorkspace({
  workflowTab,
  onWorkflowTabChange,
  lookupCode,
  onLookupCodeChange,
  pendingRows = [],
  pendingSearch,
  onPendingSearchChange,
  history = [],
  histQ = '',
  historyPager = null,
  opdRows = [],
  opdCount = 0,
  opdSearch,
  onOpdSearchChange,
  ipdPending = [],
  ipdSearch,
  onIpdSearchChange,
  codesStatus = [],
  codesSearch,
  onCodesSearchChange,
  doctorPrescriptions = [],
  rxSearch,
  onRxSearchChange,
  erPending = [],
  emgSettle = [],
  labWalkinRows = [],
  labWalkinSearch,
  onLabWalkinSearchChange,
  radWalkinRows = [],
  radWalkinSearch,
  onRadWalkinSearchChange,
  selectedReceiptCodes,
  toggleReceiptCode,
  toggleAllPaidOnPage,
  clearReceiptSelection,
  allPaidSelected,
  selectPatientReceipts,
  batchDate,
  setBatchDate,
  batchFormat,
  setBatchFormat,
  openBatchPrint,
  printSelectedReceipts,
  retryBusy,
  onBetterPayRetry,
  onBetterPayContinue,
  onOpdBill,
  onOpdRefund,
  onIpdSettle,
  onErSettle,
  billingInvoices = [],
  billingSummary = {},
  billingTotal = 0,
  billsRefreshToken = 0,
  billsSearchSeed = '',
  onNewBill,
}) {
  const { t } = useTranslation('clinical');
  const { t: tOps } = useTranslation('ops');

  const tabCounts = useMemo(
    () => ({
      pending: pendingRows.length,
      history: historyPager?.total ?? history.length,
      opd: opdCount,
      ipd: ipdPending.length,
      codes: codesStatus.length,
      rx: doctorPrescriptions.length,
      emergency: emgSettle.length + erPending.length,
      lab_walkin: labWalkinRows.length,
      rad_walkin: radWalkinRows.length,
    }),
    [
      pendingRows.length,
      historyPager,
      history.length,
      opdCount,
      ipdPending.length,
      codesStatus.length,
      doctorPrescriptions.length,
      emgSettle.length,
      erPending.length,
      labWalkinRows.length,
      radWalkinRows.length,
    ]
  );

  return (
    <div className="bills-page">
      <CashierPatientBillsPanel
        initialInvoices={billingInvoices}
        initialSummary={billingSummary}
        initialTotal={billingTotal}
        refreshToken={billsRefreshToken}
        externalSearch={billsSearchSeed}
        onNewBill={onNewBill}
      />

      <div className="cs-card bills-report-section-card">
        <div className="cs-card-head bills-card-head">
          <div className="cs-card-title">
            <FaIcon name="bar-chart" className="bills-card-icon" />
            {tOps('cashier_odoo.reports', { defaultValue: 'Reports & shift' })}
          </div>
        </div>
        <div className="bills-report-section-body">
          <CashierReportHubBar linkMode activeTab="revenue" />
        </div>
      </div>

      <div className="bills-workflow-section">
        <div className="cs-card bills-lookup-card">
        <div className="cs-card-head bills-card-head">
          <div className="cs-card-title">
            <FaIcon name="search" className="bills-card-icon" />
            {t('cashier.lookup_title')}
          </div>
        </div>
        <div className="bills-lookup-body">
          <form action="/cashier/lookup" method="POST" className="bills-lookup-form">
            <div className="cs-search-wrap bills-search bills-lookup-search">
              <FaIcon name="search" className="cs-search-icon" />
              <input
                name="code"
                className="cs-search"
                value={lookupCode}
                onChange={(e) => onLookupCodeChange?.(e.target.value)}
                required
                placeholder={t('cashier.lookup_ph')}
              />
            </div>
            <button type="submit" className="cs-btn cs-btn-primary">
              {t('cashier.find')}
            </button>
          </form>
        </div>
      </div>

      <div className="cs-card bills-workflow-card">
        <CashierBillsWorkflowTabs
          activeTab={workflowTab}
          onTabChange={onWorkflowTabChange}
          counts={tabCounts}
        />
        <div className="cs-card-body-0">
          <CashierBillsWorkflowPanel
            activeTab={workflowTab}
            pendingRows={pendingRows}
            pendingSearch={pendingSearch}
            onPendingSearchChange={onPendingSearchChange}
            history={history}
            histQ={histQ}
            historyPager={historyPager}
            opdRows={opdRows}
            opdSearch={opdSearch}
            onOpdSearchChange={onOpdSearchChange}
            ipdPending={ipdPending}
            ipdSearch={ipdSearch}
            onIpdSearchChange={onIpdSearchChange}
            codesStatus={codesStatus}
            codesSearch={codesSearch}
            onCodesSearchChange={onCodesSearchChange}
            doctorPrescriptions={doctorPrescriptions}
            rxSearch={rxSearch}
            onRxSearchChange={onRxSearchChange}
            erPending={erPending}
            emgSettle={emgSettle}
            labWalkinRows={labWalkinRows}
            labWalkinSearch={labWalkinSearch}
            onLabWalkinSearchChange={onLabWalkinSearchChange}
            radWalkinRows={radWalkinRows}
            radWalkinSearch={radWalkinSearch}
            onRadWalkinSearchChange={onRadWalkinSearchChange}
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
            onBetterPayRetry={onBetterPayRetry}
            onBetterPayContinue={onBetterPayContinue}
            onOpdBill={onOpdBill}
            onOpdRefund={onOpdRefund}
            onIpdSettle={onIpdSettle}
            onErSettle={onErSettle}
          />
        </div>
      </div>
      </div>
    </div>
  );
}
