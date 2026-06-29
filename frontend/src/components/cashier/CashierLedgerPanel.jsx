import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { formatMoney } from '../../lib/hmsLocale';
import {
  PaymentMethodChip,
  ReportError,
  ReportLoading,
  ReportTh,
  TxnTypeBadge,
} from './CashierReportUi';

export function CashierLedgerPanel() {
  const { t } = useTranslation('clinical');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashierCode, setCashierCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ date });
      if (cashierCode.trim()) qs.set('cashier_code', cashierCode.trim());
      if (paymentMethod.trim()) qs.set('payment_method', paymentMethod.trim());
      const res = await fetch(`/api/cashier/ledger?${qs.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || t('cashier.ledger.load_failed', { defaultValue: 'Could not load till register.' }));
      }
      setReport(data.report || null);
    } catch (e) {
      setError(e.message || String(e));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [date, cashierCode, paymentMethod, t]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const closingBalances = report?.closingBalances || [];
  const rows = report?.rows || [];

  return (
    <div className="rpt-daily cs-rpt-panel cs-ledger-panel">
      <div className="rpt-daily-toolbar cs-ledger-toolbar">
        <div className="rpt-daily-filters">
          <label className="rpt-daily-filter">
            <span>
              <FaIcon name="calendar" className="cs-ledger-filter-icon" />{' '}
              {t('cashier.ledger.date', { defaultValue: 'Date' })}
            </span>
            <input className="cs-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="rpt-daily-filter">
            <span>
              <FaIcon name="id-badge" className="cs-ledger-filter-icon" />{' '}
              {t('cashier.ledger.cashier_code', { defaultValue: 'Cashier code' })}
            </span>
            <input
              className="cs-input"
              type="text"
              value={cashierCode}
              onChange={(e) => setCashierCode(e.target.value)}
              placeholder="CA01"
            />
          </label>
          <label className="rpt-daily-filter">
            <span>
              <FaIcon name="credit-card" className="cs-ledger-filter-icon" />{' '}
              {t('cashier.ledger.payment_method', { defaultValue: 'Method' })}
            </span>
            <input
              className="cs-input"
              type="text"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="Cash"
            />
          </label>
          <button
            type="button"
            className={`cs-btn cs-btn-sm cs-ledger-apply${loading ? ' cs-ledger-apply--spin' : ''}`}
            onClick={loadReport}
            disabled={loading}
          >
            <FaIcon name="refresh" /> {t('cashier.ledger.apply', { defaultValue: 'Apply' })}
          </button>
        </div>
        <div className="rpt-daily-actions">
          <a href={`/cashier/ledger?date=${encodeURIComponent(date)}`} className="cs-btn cs-btn-sm" target="_blank" rel="noopener noreferrer">
            <FaIcon name="external-link" /> {t('cashier.ledger.open_full', { defaultValue: 'Full page' })}
          </a>
        </div>
      </div>

      {loading ? <ReportLoading message={t('cashier.ledger.loading', { defaultValue: 'Loading till register…' })} /> : null}
      {error ? <ReportError message={error} /> : null}

      {!loading && report ? (
        <div className="cs-ledger-content">
          {closingBalances.length ? (
            <div className="cs-card rpt-daily-card cs-ledger-card cs-ledger-card--balances">
              <div className="cs-card-head">
                <div className="cs-card-title">
                  <FaIcon name="balance-scale" className="cs-ledger-card-icon" />{' '}
                  {t('cashier.ledger.closing_balances', { defaultValue: 'Closing balances (end of day)' })}
                </div>
              </div>
              <div className="cs-card-body-0 cs-ledger-scroll">
                <table className="cs-ledger-table cs-ledger-table--balances">
                  <colgroup>
                    <col className="cs-ledger-col--code" />
                    <col className="cs-ledger-col--identity" />
                    <col className="cs-ledger-col--employee" />
                    <col className="cs-ledger-col--method" />
                    <col className="cs-ledger-col--amount" />
                  </colgroup>
                  <thead>
                    <tr>
                      <ReportTh icon="barcode">{t('cashier.ledger.cashier_code', { defaultValue: 'Code' })}</ReportTh>
                      <ReportTh icon="user">{t('cashier.ledger.cashier_identity', { defaultValue: 'Identity' })}</ReportTh>
                      <ReportTh icon="id-card">{t('cashier.ledger.employee_name', { defaultValue: 'Employee' })}</ReportTh>
                      <ReportTh icon="credit-card">{t('cashier.ledger.payment_method', { defaultValue: 'Method' })}</ReportTh>
                      <ReportTh icon="money" numeric>
                        {t('cashier.ledger.closing_balance', { defaultValue: 'Closing' })}
                      </ReportTh>
                    </tr>
                  </thead>
                  <tbody>
                    {closingBalances.map((row, idx) => (
                      <tr key={`${row.cashier_code}-${row.payment_method}`} className="cs-ledger-row" style={{ animationDelay: `${idx * 0.05}s` }}>
                        <td>
                          <span className="cs-ledger-code">{row.cashier_code}</span>
                        </td>
                        <td>{row.cashier_identity}</td>
                        <td>{row.employee_name || '—'}</td>
                        <td>
                          <PaymentMethodChip method={row.payment_method} />
                        </td>
                        <td className="cs-ledger-num cs-ledger-num--strong">
                          {row.closing_balance_fmt || formatMoney(row.closing_balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="cs-card rpt-daily-card cs-ledger-card cs-ledger-card--txns">
            <div className="cs-card-head">
              <div className="cs-card-title">
                <FaIcon name="list-alt" className="cs-ledger-card-icon" />{' '}
                {t('cashier.ledger.transactions', { defaultValue: 'Transactions' })}{' '}
                <span className="cs-ledger-count">{report.total_count || rows.length}</span>
              </div>
            </div>
            <div className="cs-card-body-0 cs-ledger-scroll">
              <table className="cs-ledger-table cs-ledger-table--txns">
                <colgroup>
                  <col className="cs-ledger-col--time" />
                  <col className="cs-ledger-col--code" />
                  <col className="cs-ledger-col--employee" />
                  <col className="cs-ledger-col--type" />
                  <col className="cs-ledger-col--ref" />
                  <col className="cs-ledger-col--amount" />
                  <col className="cs-ledger-col--amount" />
                  <col className="cs-ledger-col--amount" />
                  <col className="cs-ledger-col--amount" />
                </colgroup>
                <thead>
                  <tr>
                    <ReportTh icon="clock-o">{t('cashier.ledger.time', { defaultValue: 'Time' })}</ReportTh>
                    <ReportTh icon="barcode">{t('cashier.ledger.cashier_code', { defaultValue: 'Code' })}</ReportTh>
                    <ReportTh icon="id-card">{t('cashier.ledger.employee_name', { defaultValue: 'Employee' })}</ReportTh>
                    <ReportTh icon="exchange">{t('cashier.ledger.type', { defaultValue: 'Type' })}</ReportTh>
                    <ReportTh icon="file-text-o">{t('cashier.ledger.reference', { defaultValue: 'Ref' })}</ReportTh>
                    <ReportTh icon="sign-in" numeric>
                      {t('cashier.ledger.opening_balance', { defaultValue: 'Opening' })}
                    </ReportTh>
                    <ReportTh icon="minus-circle" numeric>
                      {t('cashier.ledger.debit', { defaultValue: 'Debit' })}
                    </ReportTh>
                    <ReportTh icon="plus-circle" numeric>
                      {t('cashier.ledger.credit', { defaultValue: 'Credit' })}
                    </ReportTh>
                    <ReportTh icon="money" numeric>
                      {t('cashier.ledger.closing_balance', { defaultValue: 'Closing' })}
                    </ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="cs-empty cs-ledger-empty">
                        <FaIcon name="inbox" className="cs-ledger-empty-icon" />
                        {t('cashier.ledger.empty', { defaultValue: 'No ledger entries for this date.' })}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr key={row.id} className="cs-ledger-row" style={{ animationDelay: `${idx * 0.04}s` }}>
                        <td className="cs-ledger-time">{row.created_at_fmt || row.created_at}</td>
                        <td>
                          <span className="cs-ledger-code">{row.cashier_code}</span>
                          <div className="cs-muted-xs">{row.cashier_identity}</div>
                        </td>
                        <td>{row.employee_name || '—'}</td>
                        <td>
                          <TxnTypeBadge type={row.txn_type} />
                          <div className="cs-ledger-method-inline">
                            <PaymentMethodChip method={row.payment_method} />
                          </div>
                        </td>
                        <td className="cs-ledger-ref">
                          <span className="cs-ledger-ref__code">{row.reference || '—'}</span>
                          {row.narration ? <div className="cs-muted-xs">{String(row.narration).slice(0, 48)}</div> : null}
                        </td>
                        <td className="cs-ledger-num">{row.opening_balance_fmt || formatMoney(row.opening_balance)}</td>
                        <td className={`cs-ledger-num${Number(row.debit_amount) > 0 ? ' cs-ledger-num--debit' : ''}`}>
                          {Number(row.debit_amount) > 0 ? row.debit_amount_fmt || formatMoney(row.debit_amount) : '—'}
                        </td>
                        <td className={`cs-ledger-num${Number(row.credit_amount) > 0 ? ' cs-ledger-num--credit' : ''}`}>
                          {Number(row.credit_amount) > 0 ? row.credit_amount_fmt || formatMoney(row.credit_amount) : '—'}
                        </td>
                        <td className="cs-ledger-num cs-ledger-num--strong">
                          {row.closing_balance_fmt || formatMoney(row.closing_balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
