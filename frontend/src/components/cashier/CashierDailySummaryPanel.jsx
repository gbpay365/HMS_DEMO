import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { formatMoney } from '../../lib/hmsLocale';
import {
  CategoryLabel,
  PaymentMethodChip,
  ReportError,
  ReportKpiTile,
  ReportLoading,
  ReportTh,
} from './CashierReportUi';

export function CashierDailySummaryPanel() {
  const { t } = useTranslation('clinical');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('day');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ period, date });
      const res = await fetch(`/api/cashier/daily-summary?${qs.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || t('cashier.daily_summary.load_failed', { defaultValue: 'Could not load summary.' }));
      }
      setReport(data.report || null);
    } catch (e) {
      setError(e.message || String(e));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [period, date, t]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const summary = report?.summary || {};
  const categoryRows = report?.categoryRows || [];
  const paymentRows = report?.paymentRows || [];

  return (
    <div className="rpt-daily cs-rpt-panel cs-ledger-panel">
      <div className="rpt-daily-toolbar cs-ledger-toolbar">
        <div className="rpt-daily-filters">
          <label className="rpt-daily-filter">
            <span>
              <FaIcon name="calendar-o" className="cs-ledger-filter-icon" />{' '}
              {t('cashier.daily_summary.period', { defaultValue: 'Period' })}
            </span>
            <select className="cs-select" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="day">{t('cashier.daily_summary.period_day', { defaultValue: 'Day' })}</option>
              <option value="week">{t('cashier.daily_summary.period_week', { defaultValue: 'Week' })}</option>
              <option value="month">{t('cashier.daily_summary.period_month', { defaultValue: 'Month' })}</option>
            </select>
          </label>
          <label className="rpt-daily-filter">
            <span>
              <FaIcon name="calendar" className="cs-ledger-filter-icon" />{' '}
              {t('cashier.daily_summary.date', { defaultValue: 'Date' })}
            </span>
            <input className="cs-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button
            type="button"
            className={`cs-btn cs-btn-sm cs-ledger-apply${loading ? ' cs-ledger-apply--spin' : ''}`}
            onClick={loadReport}
            disabled={loading}
          >
            <FaIcon name="refresh" /> {t('cashier.daily_summary.apply', { defaultValue: 'Apply' })}
          </button>
        </div>
        <div className="rpt-daily-actions">
          <a
            href={`/cashier/daily-summary/print?period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="cs-btn cs-btn-sm"
          >
            <FaIcon name="print" /> {t('cashier.daily_summary.print', { defaultValue: 'Print' })}
          </a>
          <a href="/cashier/daily-summary" className="cs-btn cs-btn-sm">
            <FaIcon name="external-link" /> {t('cashier.daily_summary.open_full', { defaultValue: 'Full page' })}
          </a>
        </div>
      </div>

      {loading ? <ReportLoading message={t('cashier.daily_summary.loading', { defaultValue: 'Loading summary…' })} /> : null}
      {error ? <ReportError message={error} /> : null}

      {!loading && report ? (
        <div className="cs-ledger-content">
          <div className="row rpt-daily-kpi-row">
            <ReportKpiTile
              icon="money"
              label={t('cashier.daily_summary.grand_total', { defaultValue: 'Grand total' })}
              value={summary.grandTotal_fmt || formatMoney(summary.grandTotal || 0)}
              sub={report.bounds?.label || ''}
              tone="accent"
              delay={0.04}
            />
            <ReportKpiTile
              icon="file-text-o"
              label={t('cashier.daily_summary.ticket_count', { defaultValue: 'Receipts' })}
              value={summary.ticketCount || 0}
              tone="primary"
              delay={0.08}
            />
            <ReportKpiTile
              icon="list"
              label={t('cashier.daily_summary.line_count', { defaultValue: 'Line items' })}
              value={summary.lineCount || 0}
              tone="muted"
              delay={0.12}
            />
          </div>

          <div className="row cs-rpt-split">
            <div className="col-6">
              <div className="cs-card rpt-daily-card cs-ledger-card cs-ledger-card--balances">
                <div className="cs-card-head">
                  <div className="cs-card-title">
                    <FaIcon name="pie-chart" className="cs-ledger-card-icon" />{' '}
                    {t('cashier.daily_summary.by_category', { defaultValue: 'By category' })}
                  </div>
                </div>
                <div className="cs-card-body-0 cs-ledger-scroll">
                  <table className="cs-ledger-table cs-ledger-table--summary">
                    <colgroup>
                      <col className="cs-ledger-col--ref" />
                      <col className="cs-ledger-col--amount" />
                      <col className="cs-ledger-col--amount-sm" />
                    </colgroup>
                    <thead>
                      <tr>
                        <ReportTh icon="folder-open">{t('cashier.daily_summary.category', { defaultValue: 'Category' })}</ReportTh>
                        <ReportTh icon="money" numeric>
                          {t('cashier.daily_summary.amount', { defaultValue: 'Amount' })}
                        </ReportTh>
                        <ReportTh icon="percent" numeric>
                          {t('cashier.daily_summary.share', { defaultValue: 'Share' })}
                        </ReportTh>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="cs-empty cs-ledger-empty">
                            <FaIcon name="inbox" className="cs-ledger-empty-icon" />
                            {t('cashier.daily_summary.empty', { defaultValue: 'No collections in this period.' })}
                          </td>
                        </tr>
                      ) : (
                        categoryRows.map((row, idx) => (
                          <tr key={row.key} className="cs-ledger-row" style={{ animationDelay: `${idx * 0.04}s` }}>
                            <td>
                              <CategoryLabel
                                categoryKey={row.key}
                                label={t(`cashier.daily_summary.cat_${row.key}`, { defaultValue: row.key })}
                              />
                            </td>
                            <td className="cs-ledger-num cs-ledger-num--strong">{row.amount_fmt || formatMoney(row.amount)}</td>
                            <td className="cs-ledger-num">{row.share_pct || 0}%</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-6">
              <div className="cs-card rpt-daily-card cs-ledger-card cs-ledger-card--txns">
                <div className="cs-card-head">
                  <div className="cs-card-title">
                    <FaIcon name="credit-card" className="cs-ledger-card-icon" />{' '}
                    {t('cashier.daily_summary.by_method', { defaultValue: 'By payment method' })}
                  </div>
                </div>
                <div className="cs-card-body-0 cs-ledger-scroll">
                  <table className="cs-ledger-table cs-ledger-table--summary">
                    <colgroup>
                      <col className="cs-ledger-col--method" />
                      <col className="cs-ledger-col--amount" />
                      <col className="cs-ledger-col--amount-sm" />
                    </colgroup>
                    <thead>
                      <tr>
                        <ReportTh icon="credit-card">{t('cashier.daily_summary.method', { defaultValue: 'Method' })}</ReportTh>
                        <ReportTh icon="money" numeric>
                          {t('cashier.daily_summary.amount', { defaultValue: 'Amount' })}
                        </ReportTh>
                        <ReportTh icon="percent" numeric>
                          {t('cashier.daily_summary.share', { defaultValue: 'Share' })}
                        </ReportTh>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="cs-empty cs-ledger-empty">
                            <FaIcon name="inbox" className="cs-ledger-empty-icon" />
                            {t('cashier.daily_summary.empty', { defaultValue: 'No collections in this period.' })}
                          </td>
                        </tr>
                      ) : (
                        paymentRows.map((row, idx) => (
                          <tr key={row.key} className="cs-ledger-row" style={{ animationDelay: `${idx * 0.04}s` }}>
                            <td>
                              <PaymentMethodChip method={row.key} label={row.label} />
                            </td>
                            <td className="cs-ledger-num cs-ledger-num--strong">{row.amount_fmt || formatMoney(row.amount)}</td>
                            <td className="cs-ledger-num">{row.share_pct || 0}%</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
