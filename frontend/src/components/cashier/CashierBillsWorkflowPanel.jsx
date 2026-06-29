import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { Pager } from '../Pager';
import { CashierInvoiceActions } from './CashierInvoiceActions';
import { CashierPrintLink } from '../CashierPrintLinks';
import { InnerWorkflowTab } from './CashierReferenceShell';
import { useClientPagination } from '../../hooks/useClientPagination';
import { formatDate, formatMoney } from '../../lib/listUi';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

const WORKFLOW_TABS = [
  { id: 'pending', icon: 'clock-o', labelKey: 'cashier.tab_pending' },
  { id: 'history', icon: 'history', labelKey: 'cashier.tab_history' },
  { id: 'opd', icon: 'stethoscope', labelKey: 'cashier.tab_opd' },
  { id: 'ipd', icon: 'hospital-o', labelKey: 'cashier.tab_ipd' },
  { id: 'codes', icon: 'clipboard', labelKey: 'cashier.tab_codes' },
  { id: 'rx', icon: 'medkit', labelKey: 'cashier.tab_rx' },
  { id: 'emergency', icon: 'ambulance', labelKey: 'cashier.tab_emergency' },
  { id: 'lab_walkin', icon: 'flask', labelKey: 'cashier.tab_lab_walkin' },
  { id: 'rad_walkin', icon: 'medkit', labelKey: 'cashier.tab_rad_walkin' },
];

const RX_CODE_KEYS = {
  laboratory: 'cashier.rx_lab',
  radiology: 'cashier.rx_rad',
  pharmacy: 'cashier.rx_pharm',
};

function RxCodeBadges({ codes = {} }) {
  const { t } = useTranslation('clinical');
  const entries = [
    { type: 'laboratory', code: codes.laboratory },
    { type: 'radiology', code: codes.radiology },
    { type: 'pharmacy', code: codes.pharmacy },
  ].filter((e) => e.code);

  if (!entries.length) return <span className="bills-workflow-muted">—</span>;

  const toneClass = {
    laboratory: 'bg-partial',
    radiology: 'bg-paid',
    pharmacy: 'bg-pending',
  };

  return (
    <div className="bills-rx-codes">
      {entries.map(({ type, code }) => (
        <span key={type} className={`cs-badge ${toneClass[type] || 'bg-pending'} bills-rx-code`}>
          <span className="bills-rx-code__type">{t(RX_CODE_KEYS[type])}</span>
          <span className="bills-rx-code__val">{code}</span>
        </span>
      ))}
    </div>
  );
}

function WorkflowSearch({ value, onChange, placeholder }) {
  return (
    <div className="cs-search-wrap bills-search bills-workflow-search">
      <FaIcon name="search" className="cs-search-icon" />
      <input
        className="cs-search"
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function WorkflowTable({ rows, search, columns, emptyLabel }) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      if (r._search) return r._search.includes(q);
      return JSON.stringify(r).toLowerCase().includes(q);
    });
  }, [rows, search]);

  const { pager, rows: pageRows, setPage } = useClientPagination(filtered, {
    pageSize: DEFAULT_PAGE_SIZE,
    resetKeys: [search],
  });

  return (
    <>
      <div className="cs-table-wrap">
        <table className="cs-table bills-workflow-table">
          <thead>{columns.header}</thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.colSpan} className="cs-empty">
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

function TicketPrintActions({ ticketCode, status }) {
  const { t } = useTranslation('print');
  const code = encodeURIComponent(ticketCode || '');
  const st = String(status || '').toLowerCase();

  if (st === 'paid') {
    return (
      <span className="bills-workflow-actions">
        <a href={`/cashier/print-slip/${code}`} target="_blank" rel="noreferrer" className="cs-btn cs-btn-sm bills-workflow-btn--ticket">
          {t('link_ticket')}
        </a>
        <a
          href={`/cashier/print-receipt-classic-by-code/${code}`}
          target="_blank"
          rel="noreferrer"
          className="cs-btn cs-btn-sm bills-workflow-btn--receipt"
        >
          {t('link_receipt')}
        </a>
      </span>
    );
  }

  return (
    <span className="bills-workflow-actions">
      <a href={`/cashier/print-slip/${code}`} target="_blank" rel="noreferrer" className="cs-btn cs-btn-sm bills-workflow-btn--ticket">
        {t('link_ticket')}
      </a>
      <a href={`/cashier/print-ticket/${code}`} target="_blank" rel="noreferrer" className="cs-btn cs-btn-sm bills-workflow-btn--detail">
        {t('link_payment_detail')}
      </a>
    </span>
  );
}

export function CashierBillsWorkflowTabs({ activeTab, onTabChange, counts }) {
  const { t } = useTranslation('clinical');

  return (
    <div className="cs-inner-tabs" role="tablist" aria-label={t('cashier.sections_aria')}>
      {WORKFLOW_TABS.map((tab) => (
        <InnerWorkflowTab
          key={tab.id}
          active={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          icon={tab.icon}
          label={t(tab.labelKey)}
          count={counts[tab.id] ?? 0}
        />
      ))}
    </div>
  );
}

export function CashierBillsWorkflowPanel({
  activeTab,
  pendingRows = [],
  pendingSearch = '',
  onPendingSearchChange,
  history = [],
  histQ = '',
  historyPager = null,
  opdRows = [],
  opdSearch = '',
  onOpdSearchChange,
  ipdPending = [],
  ipdSearch = '',
  onIpdSearchChange,
  codesStatus = [],
  codesSearch = '',
  onCodesSearchChange,
  doctorPrescriptions = [],
  rxSearch = '',
  onRxSearchChange,
  erPending = [],
  emgSettle = [],
  labWalkinRows = [],
  labWalkinSearch = '',
  onLabWalkinSearchChange,
  radWalkinRows = [],
  radWalkinSearch = '',
  onRadWalkinSearchChange,
  paidHistoryRows = [],
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
  retryBusy = false,
  onBetterPayRetry,
  onBetterPayContinue,
  onOpdBill,
  onOpdRefund,
  onIpdSettle,
  onErSettle,
}) {
  const { t } = useTranslation('clinical');
  const { t: tIpd } = useTranslation('ipd');
  const histQuery = histQ ? { hist_q: histQ } : {};

  if (activeTab === 'pending') {
    return (
      <div className="bills-workflow-panel">
        <WorkflowSearch value={pendingSearch} onChange={onPendingSearchChange} placeholder={t('cashier.filter_pending')} />
        <WorkflowTable
          rows={pendingRows}
          search={pendingSearch}
          emptyLabel={t('cashier.empty_pending')}
          columns={{
            colSpan: 6,
            header: (
              <tr>
                <th>{t('cashier.col_ticket')}</th>
                <th>{t('cashier.col_patient')}</th>
                <th className="rfd-num">{t('cashier.col_amount')}</th>
                <th>{t('cashier.col_status')}</th>
                <th>{t('cashier.col_issued')}</th>
                <th className="bills-action-cell">{t('cashier.col_action')}</th>
              </tr>
            ),
            renderRow: (tRow) => {
              const tc = String(tRow.ticket_code || '');
              const isEmg =
                tc.startsWith('EMG-') ||
                tc.startsWith('EMG-SET-') ||
                (tRow.emergency_visit_id != null && parseInt(tRow.emergency_visit_id, 10) > 0);
              const bpSt = String(tRow.betterpay_status || '').toLowerCase();
              const isBetterPayFail = bpSt === 'timeout' || bpSt === 'failed';
              const isBetterPayPending =
                String(tRow.payment_method || '') === 'BetterPay' && (!bpSt || bpSt === 'pending');
              const statusLabel = bpSt === 'timeout'
                ? t('cashier.betterpay_status_timeout')
                : bpSt === 'failed'
                  ? t('cashier.betterpay_status_failed')
                  : isBetterPayPending
                    ? t('modals.cashierPrepay.waiting_payment')
                    : '—';

              return (
                <tr key={tRow.id}>
                  <td>
                    <span className="bills-code">{tRow.ticket_code}</span>
                    {isEmg ? <span className="cs-badge bg-overdue bills-workflow-badge">{t('cashier.ae_badge')}</span> : null}
                    {String(tRow.payment_method || '') === 'BetterPay' ? (
                      <span className="cs-badge bg-partial bills-workflow-badge">{t('cashier.betterpay_pending_badge')}</span>
                    ) : null}
                  </td>
                  <td>
                    <div className="bills-patient-name">
                      {tRow.first_name} {tRow.last_name}
                    </div>
                    <div className="bills-patient-dept">#P-{tRow.patient_id}</div>
                  </td>
                  <td className="rfd-num bills-num">{formatMoney(tRow.total_amount)}</td>
                  <td>
                    {isBetterPayFail ? (
                      <span className="bills-workflow-status bills-workflow-status--error">{statusLabel}</span>
                    ) : isBetterPayPending ? (
                      <span className="bills-workflow-status bills-workflow-status--warn">{statusLabel}</span>
                    ) : (
                      <span className="bills-workflow-muted">{statusLabel}</span>
                    )}
                  </td>
                  <td className="bills-date">{formatDate(tRow.created_at)}</td>
                  <td className="bills-action-cell">
                    {isBetterPayFail ? (
                      <button
                        type="button"
                        disabled={retryBusy}
                        className="cs-btn cs-btn-sm cs-btn-primary"
                        onClick={() => onBetterPayRetry?.(tc)}
                      >
                        {t('cashier.retry_payment')}
                      </button>
                    ) : isBetterPayPending ? (
                      <button
                        type="button"
                        className="cs-btn cs-btn-sm cs-btn-primary"
                        onClick={() => onBetterPayContinue?.(tc)}
                      >
                        {t('cashier.continue_payment')}
                      </button>
                    ) : (
                      <>
                        <TicketPrintActions ticketCode={tRow.ticket_code} status={tRow.status || 'pending'} />
                        <a href={`/cashier/settle/${tRow.id}`} className="cs-btn cs-btn-sm cs-btn-primary bills-workflow-collect">
                          {t('cashier.collect')}
                        </a>
                      </>
                    )}
                  </td>
                </tr>
              );
            },
          }}
        />
      </div>
    );
  }

  if (activeTab === 'history') {
    return (
      <div className="bills-workflow-panel">
        <div className="bills-workflow-batch">
          <div className="bills-workflow-batch__row">
            <span className="bills-workflow-batch__label">{t('cashier.batch_print')}</span>
            <span className="bills-workflow-format-toggle" role="group" aria-label={t('cashier.batch_format_aria')}>
              <button
                type="button"
                className={`cs-btn cs-btn-sm${batchFormat === 'slip' ? ' cs-btn-primary' : ''}`}
                onClick={() => setBatchFormat?.('slip')}
              >
                {t('cashier.batch_format_slips')}
              </button>
              <button
                type="button"
                className={`cs-btn cs-btn-sm${batchFormat === 'receipt' ? ' cs-btn-primary' : ''}`}
                onClick={() => setBatchFormat?.('receipt')}
              >
                {t('cashier.batch_format_receipts')}
              </button>
            </span>
            <input type="date" value={batchDate} onChange={(e) => setBatchDate?.(e.target.value)} className="cs-input bills-workflow-date" />
            <button type="button" className="cs-btn cs-btn-sm" onClick={() => openBatchPrint?.('day')}>
              {batchFormat === 'receipt' ? t('cashier.batch_today_receipts') : t('cashier.batch_today')}
            </button>
            <button type="button" className="cs-btn cs-btn-sm" onClick={() => openBatchPrint?.('week')}>
              {batchFormat === 'receipt' ? t('cashier.batch_week_receipts') : t('cashier.batch_week')}
            </button>
            <button type="button" className="cs-btn cs-btn-sm" onClick={() => openBatchPrint?.('month')}>
              {batchFormat === 'receipt' ? t('cashier.batch_month_receipts') : t('cashier.batch_month')}
            </button>
          </div>
          <div className="bills-workflow-batch__row">
            <span className="bills-count-label">
              {t('cashier.batch_selected_count', { count: selectedReceiptCodes?.size || 0 })}
            </span>
            <button
              type="button"
              className="cs-btn cs-btn-sm cs-btn-primary"
              disabled={!selectedReceiptCodes?.size}
              onClick={() => printSelectedReceipts?.()}
            >
              <FaIcon name="print" /> {t('cashier.batch_print_selected')}
            </button>
            {selectedReceiptCodes?.size > 0 ? (
              <button type="button" className="cs-btn cs-btn-sm" onClick={() => clearReceiptSelection?.()}>
                {t('cashier.batch_clear_selection')}
              </button>
            ) : null}
          </div>
        </div>
        <form method="get" action="/cashier" className="bills-workflow-hist-form">
          <input type="hidden" name="page" value="bills" />
          <input type="hidden" name="tab" value="history" />
          <div className="cs-search-wrap bills-search bills-workflow-search">
            <FaIcon name="search" className="cs-search-icon" />
            <input name="hist_q" defaultValue={histQ} className="cs-search" placeholder={t('cashier.hist_ph')} />
          </div>
          <button type="submit" className="cs-btn cs-btn-sm cs-btn-primary">
            {t('common:actions.search', { defaultValue: 'Search' })}
          </button>
          {histQ ? (
            <a href="/cashier?page=bills&tab=history" className="cs-btn cs-btn-sm">
              {t('cashier.clear')}
            </a>
          ) : null}
        </form>
        <div className="cs-table-wrap">
          <table className="cs-table bills-workflow-table">
            <thead>
              <tr>
                <th className="bills-check-col">
                  <input
                    type="checkbox"
                    className="bills-check"
                    checked={allPaidSelected}
                    onChange={toggleAllPaidOnPage}
                    aria-label={t('cashier.batch_select_all')}
                  />
                </th>
                <th>{t('cashier.col_code')}</th>
                <th>{t('cashier.col_patient')}</th>
                <th>{t('cashier.col_service')}</th>
                <th className="rfd-num">{t('cashier.col_amount')}</th>
                <th>{t('cashier.col_status')}</th>
                <th>{t('cashier.col_date')}</th>
                <th className="bills-action-cell">{t('cashier.col_print')}</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="cs-empty">
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
                  const checked = selectedReceiptCodes?.has(row.ticket_code);
                  return (
                    <tr key={row.id} className={checked ? 'bills-workflow-row--selected' : ''}>
                      <td className="bills-check-col">
                        {isPaid ? (
                          <input
                            type="checkbox"
                            className="bills-check"
                            checked={checked}
                            onChange={() => toggleReceiptCode?.(row.ticket_code)}
                            aria-label={t('cashier.batch_select_row')}
                          />
                        ) : null}
                      </td>
                      <td className="bills-code">{row.ticket_code}</td>
                      <td>
                        <button
                          type="button"
                          className="bills-code-link"
                          title={t('cashier.batch_select_patient')}
                          onClick={() => isPaid && selectPatientReceipts?.(row)}
                        >
                          {row.first_name} {row.last_name}
                        </button>
                      </td>
                      <td className="bills-workflow-muted">{svcName}</td>
                      <td className="rfd-num bills-num">{formatMoney(row.total_amount)}</td>
                      <td>{st}</td>
                      <td className="bills-date">{formatDate(row.created_at)}</td>
                      <td className="bills-action-cell">
                        {isPaid ? <CashierInvoiceActions ticketCode={row.ticket_code} /> : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pager pager={historyPager} basePath="/cashier" query={{ ...histQuery, page: 'bills', tab: 'history' }} pageParam="page" />
      </div>
    );
  }

  if (activeTab === 'opd') {
    return (
      <div className="bills-workflow-panel">
        <WorkflowSearch value={opdSearch} onChange={onOpdSearchChange} placeholder={t('cashier.filter_opd')} />
        <WorkflowTable
          rows={opdRows}
          search={opdSearch}
          emptyLabel={t('cashier.empty_opd')}
          columns={{
            colSpan: 5,
            header: (
              <tr>
                <th>{t('cashier.col_patient')}</th>
                <th>{t('cashier.col_consult')}</th>
                <th className="rfd-num">{t('cashier.col_items')}</th>
                <th className="rfd-num">{t('cashier.col_total')}</th>
                <th className="bills-action-cell">{t('cashier.col_action')}</th>
              </tr>
            ),
            renderRow: (g) => (
              <tr key={g.consultation_id || g.patient_id}>
                <td className="bills-patient-name">{g.patient_name || '—'}</td>
                <td>#{g.consultation_id || '—'}</td>
                <td className="rfd-num">{g.pending_count || 0}</td>
                <td className="rfd-num bills-num">{formatMoney(g.pending_total || 0)}</td>
                <td className="bills-action-cell">
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
                    className="cs-btn cs-btn-sm bills-workflow-btn--opd"
                    onClick={() =>
                      onOpdBill?.({
                        patientId: g.patient_id,
                        patientName: g.patient_name,
                        consultationId: g.consultation_id || 0,
                      })
                    }
                  >
                    {t('cashier.view_bill')}
                  </button>
                </td>
              </tr>
            ),
          }}
        />
      </div>
    );
  }

  if (activeTab === 'ipd') {
    return (
      <div className="bills-workflow-panel">
        <WorkflowSearch value={ipdSearch} onChange={onIpdSearchChange} placeholder={tIpd('cashier.filter_ph')} />
        <WorkflowTable
          rows={ipdPending}
          search={ipdSearch}
          emptyLabel={tIpd('cashier.empty')}
          columns={{
            colSpan: 7,
            header: (
              <tr>
                <th>{tIpd('cashier.col_patient')}</th>
                <th>{tIpd('cashier.col_ward_bed')}</th>
                <th>{tIpd('cashier.col_dept')}</th>
                <th className="rfd-num">{tIpd('cashier.col_charges')}</th>
                <th className="rfd-num">{tIpd('cashier.col_deposit')}</th>
                <th className="rfd-num">{tIpd('cashier.col_balance')}</th>
                <th className="bills-action-cell">{tIpd('cashier.col_action')}</th>
              </tr>
            ),
            renderRow: (r) => (
              <tr key={r.admission_id}>
                <td className="bills-patient-name">
                  {r.first_name} {r.last_name}
                </td>
                <td className="bills-workflow-muted">
                  {[r.ward_name, r.bed_label].filter(Boolean).join(' · ') || '—'}
                </td>
                <td>{r.admitting_department || '—'}</td>
                <td className="rfd-num">{formatMoney(r.total_charges || 0)}</td>
                <td className="rfd-num">{formatMoney(r.deposit_amount || 0)}</td>
                <td className="rfd-num bills-balance--due">
                  {r.refund > 0 ? `-${formatMoney(r.refund)}` : formatMoney(r.balance || 0)}
                </td>
                <td className="bills-action-cell">
                  {r.refund > 0 ? (
                    <span className="bills-workflow-status bills-workflow-status--warn">{tIpd('cashier.refund')}</span>
                  ) : r.balance === 0 ? (
                    <button type="button" className="cs-btn cs-btn-sm" onClick={() => onIpdSettle?.(r)}>
                      {tIpd('cashier.zero_confirm')}
                    </button>
                  ) : (
                    <button type="button" className="cs-btn cs-btn-sm cs-btn-primary" onClick={() => onIpdSettle?.(r)}>
                      {tIpd('cashier.settle_bill')}
                    </button>
                  )}
                </td>
              </tr>
            ),
          }}
        />
      </div>
    );
  }

  if (activeTab === 'codes') {
    return (
      <div className="bills-workflow-panel">
        <WorkflowSearch value={codesSearch} onChange={onCodesSearchChange} placeholder={t('cashier.filter_codes')} />
        <WorkflowTable
          rows={codesStatus}
          search={codesSearch}
          emptyLabel={t('cashier.empty_codes')}
          columns={{
            colSpan: 6,
            header: (
              <tr>
                <th>{t('cashier.col_code')}</th>
                <th>{t('cashier.col_type')}</th>
                <th>{t('cashier.col_patient')}</th>
                <th>{t('cashier.col_service')}</th>
                <th>{t('cashier.col_status')}</th>
                <th>{t('cashier.col_generated')}</th>
              </tr>
            ),
            renderRow: (c, i) => (
              <tr key={`${c.code_value}-${i}`}>
                <td className="bills-code">{c.code_value}</td>
                <td>{c.code_type}</td>
                <td>
                  {c.first_name} {c.last_name}
                </td>
                <td className="bills-workflow-muted">{c.service_label || '—'}</td>
                <td>{c.code_status || c.active_yes_no || '—'}</td>
                <td className="bills-date">{formatDate(c.date_generated)}</td>
              </tr>
            ),
          }}
        />
      </div>
    );
  }

  if (activeTab === 'rx') {
    return (
      <div className="bills-workflow-panel">
        <WorkflowSearch value={rxSearch} onChange={onRxSearchChange} placeholder={t('cashier.filter_rx')} />
        <WorkflowTable
          rows={doctorPrescriptions}
          search={rxSearch}
          emptyLabel={t('cashier.empty_rx')}
          columns={{
            colSpan: 7,
            header: (
              <tr>
                <th>{t('cashier.col_patient')}</th>
                <th>{t('cashier.col_doctor')}</th>
                <th>{t('cashier.col_date')}</th>
                <th>{t('cashier.col_codes')}</th>
                <th className="rfd-num">{t('cashier.col_items')}</th>
                <th className="rfd-num">{t('cashier.col_total')}</th>
                <th className="bills-action-cell">{t('cashier.col_action')}</th>
              </tr>
            ),
            renderRow: (rx) => {
              const items =
                (rx.counts?.laboratory || 0) + (rx.counts?.radiology || 0) + (rx.counts?.pharmacy || 0);
              return (
                <tr key={rx.consultation_id}>
                  <td className="bills-patient-name">{rx.patient_name}</td>
                  <td>{rx.doctor_name}</td>
                  <td className="bills-date">{formatDate(rx.consult_at)}</td>
                  <td>
                    <RxCodeBadges codes={rx.codes} />
                  </td>
                  <td className="rfd-num">{items}</td>
                  <td className="rfd-num bills-num">{formatMoney(rx.total_amount)}</td>
                  <td className="bills-action-cell">
                    <button
                      type="button"
                      className="cs-btn cs-btn-sm bills-workflow-btn--refund"
                      onClick={() =>
                        onOpdRefund?.({
                          consultationId: rx.consultation_id,
                          patientName: rx.patient_name,
                          doctorName: rx.doctor_name,
                        })
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
            },
          }}
        />
      </div>
    );
  }

  if (activeTab === 'emergency') {
    return (
      <div className="bills-workflow-panel bills-workflow-panel--er">
        <div className="bills-workflow-er-block">
          <h3 className="bills-workflow-er-title">{t('erDischarge.cashier_final_title')}</h3>
          <p className="bills-workflow-er-hint">{t('erDischarge.cashier_final_hint')}</p>
          <div className="cs-table-wrap">
            <table className="cs-table bills-workflow-table">
              <thead>
                <tr>
                  <th>{t('cashier.col_patient')}</th>
                  <th>{t('erDischarge.ticket')}</th>
                  <th className="rfd-num">{t('erDischarge.balance_due')}</th>
                  <th className="bills-action-cell">{t('cashier.col_action')}</th>
                </tr>
              </thead>
              <tbody>
                {erPending.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="cs-empty">
                      {t('erDischarge.cashier_none')}
                    </td>
                  </tr>
                ) : (
                  erPending.map((v) => (
                    <tr key={v.visit_id}>
                      <td className="bills-patient-name">
                        {v.first_name} {v.last_name}
                      </td>
                      <td className="bills-code">{v.ticket_number || `#${v.visit_id}`}</td>
                      <td className="rfd-num bills-num">{formatMoney(v.balance_due)}</td>
                      <td className="bills-action-cell">
                        <button type="button" className="cs-btn cs-btn-sm cs-btn-primary" onClick={() => onErSettle?.(v)}>
                          {t('erDischarge.settle_btn')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <h3 className="bills-workflow-section-title">{t('cashier.tab_emergency')}</h3>
        <p className="bills-workflow-er-hint">{t('cashier.emg_hint')}</p>
        <div className="cs-table-wrap">
          <table className="cs-table bills-workflow-table">
            <thead>
              <tr>
                <th>{t('cashier.col_ticket')}</th>
                <th>{t('cashier.col_patient')}</th>
                <th className="rfd-num">{t('cashier.col_amount')}</th>
                <th className="bills-action-cell">{t('cashier.col_action')}</th>
              </tr>
            </thead>
            <tbody>
              {emgSettle.length === 0 ? (
                <tr>
                  <td colSpan={4} className="cs-empty">
                    {t('cashier.empty_emg')}
                  </td>
                </tr>
              ) : (
                emgSettle.map((tRow) => (
                  <tr key={tRow.id}>
                    <td className="bills-code">{tRow.ticket_code}</td>
                    <td className="bills-patient-name">
                      {tRow.first_name} {tRow.last_name}
                    </td>
                    <td className="rfd-num bills-num">{formatMoney(tRow.total_amount)}</td>
                    <td className="bills-action-cell">
                      <TicketPrintActions ticketCode={tRow.ticket_code} status={tRow.status || 'pending'} />
                      <a href={`/cashier/settle/${tRow.id}`} className="cs-btn cs-btn-sm cs-btn-primary bills-workflow-collect">
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
    );
  }

  if (activeTab === 'lab_walkin') {
    return (
      <div className="bills-workflow-panel">
        <p className="bills-workflow-hint">{t('cashier.lab_walkin_hint')}</p>
        <WorkflowSearch
          value={labWalkinSearch}
          onChange={onLabWalkinSearchChange}
          placeholder={t('cashier.filter_lab_walkin')}
        />
        <WorkflowTable
          rows={labWalkinRows}
          search={labWalkinSearch}
          emptyLabel={t('cashier.empty_lab_walkin')}
          columns={{
            colSpan: 6,
            header: (
              <tr>
                <th>{t('cashier.col_reg_no')}</th>
                <th>{t('cashier.col_patient')}</th>
                <th>{t('cashier.col_tests')}</th>
                <th className="rfd-num">{t('cashier.col_amount')}</th>
                <th>{t('cashier.col_status')}</th>
                <th className="bills-action-cell">{t('cashier.col_action')}</th>
              </tr>
            ),
            renderRow: (w) => {
              const hasTicket = w.payment_ticket_id && w.ticket_code;
              return (
                <tr key={w.id}>
                  <td className="bills-code">{w.registration_no}</td>
                  <td className="bills-patient-name">{w.patient_name || `${w.first_name || ''} ${w.last_name || ''}`.trim()}</td>
                  <td className="bills-workflow-muted">{w.tests_summary || w.line_count || '—'}</td>
                  <td className="rfd-num bills-num">{formatMoney(w.total_amount)}</td>
                  <td>{w.status || '—'}</td>
                  <td className="bills-action-cell">
                    {hasTicket ? (
                      <a href={`/cashier/settle/${w.payment_ticket_id}`} className="cs-btn cs-btn-sm cs-btn-primary">
                        {t('cashier.lab_walkin_continue')}
                      </a>
                    ) : (
                      <form method="post" action={`/cashier/lab-walkin/${w.id}/bill`} className="bills-workflow-inline-form">
                        <button type="submit" className="cs-btn cs-btn-sm cs-btn-primary">
                          {t('cashier.lab_walkin_collect')}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            },
          }}
        />
      </div>
    );
  }

  if (activeTab === 'rad_walkin') {
    return (
      <div className="bills-workflow-panel">
        <p className="bills-workflow-hint">{t('cashier.rad_walkin_hint')}</p>
        <WorkflowSearch
          value={radWalkinSearch}
          onChange={onRadWalkinSearchChange}
          placeholder={t('cashier.filter_rad_walkin')}
        />
        <WorkflowTable
          rows={radWalkinRows}
          search={radWalkinSearch}
          emptyLabel={t('cashier.empty_rad_walkin')}
          columns={{
            colSpan: 6,
            header: (
              <tr>
                <th>{t('cashier.col_reg_no')}</th>
                <th>{t('cashier.col_patient')}</th>
                <th>{t('cashier.col_tests')}</th>
                <th className="rfd-num">{t('cashier.col_amount')}</th>
                <th>{t('cashier.col_status')}</th>
                <th className="bills-action-cell">{t('cashier.col_action')}</th>
              </tr>
            ),
            renderRow: (w) => {
              const hasTicket = w.payment_ticket_id && w.ticket_code;
              return (
                <tr key={w.id}>
                  <td className="bills-code">{w.registration_no}</td>
                  <td className="bills-patient-name">{w.patient_name || `${w.first_name || ''} ${w.last_name || ''}`.trim()}</td>
                  <td className="bills-workflow-muted">{w.tests_summary || w.line_count || '—'}</td>
                  <td className="rfd-num bills-num">{formatMoney(w.total_amount)}</td>
                  <td>{w.status || '—'}</td>
                  <td className="bills-action-cell">
                    {hasTicket ? (
                      <a href={`/cashier/settle/${w.payment_ticket_id}`} className="cs-btn cs-btn-sm cs-btn-primary">
                        {t('cashier.rad_walkin_continue')}
                      </a>
                    ) : (
                      <form method="post" action={`/cashier/rad-walkin/${w.id}/bill`} className="bills-workflow-inline-form">
                        <button type="submit" className="cs-btn cs-btn-sm cs-btn-primary">
                          {t('cashier.rad_walkin_collect')}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            },
          }}
        />
      </div>
    );
  }

  return null;
}
