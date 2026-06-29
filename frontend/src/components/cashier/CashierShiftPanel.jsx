import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { formatMoney } from '../../lib/hmsLocale';
import { useClientPagination } from '../../hooks/useClientPagination';

const PAGE_SIZE = 12;

function formatChartTick(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
}

function ShiftMethodChart({ series = [] }) {
  const maxVal = Math.max(...series.map((s) => s.value || 0), 1);
  const scaleMax = Math.max(
    1_200_000,
    Math.ceil(maxVal / 300_000) * 300_000,
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(scaleMax * p));

  return (
    <div className="shift-chart" aria-hidden="false">
      <div className="shift-chart__y">
        {[...ticks].reverse().map((tick) => (
          <span key={tick} className="shift-chart__tick">{formatChartTick(tick)}</span>
        ))}
      </div>
      <div className="shift-chart__plot">
        <div className="shift-chart__grid">
          {ticks.map((tick) => (
            <div key={`g-${tick}`} className="shift-chart__gridline" />
          ))}
        </div>
        <div className="shift-chart__bars">
          {series.map((item) => {
            const pct = Math.max(4, Math.round(((item.value || 0) / scaleMax) * 100));
            return (
              <div key={item.key} className="shift-chart__col">
                <div className="shift-chart__bar-wrap">
                  <div
                    className="shift-chart__bar"
                    style={{ height: `${pct}%`, background: item.color }}
                    title={`${item.label}: ${formatMoney(item.value)}`}
                  />
                </div>
                <span className="shift-chart__label">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CashierShiftPanel({ initialSummary = {} }) {
  const { t: tOps } = useTranslation('ops');
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);

  const loadShift = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cashier/shift-summary', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.summary) setSummary(data.summary);
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShift();
  }, [loadShift]);

  const methodTotals = summary.methodTotals || {};
  const cashSummary = summary.cashSummary || {};
  const transactions = summary.transactions || [];
  const chartSeries = summary.chartSeries || [];

  const { pager, rows: pageRows, setPage } = useClientPagination(transactions, {
    pageSize: PAGE_SIZE,
    resetKeys: [transactions.length],
  });

  const kpiCards = useMemo(
    () => [
      {
        key: 'cash',
        label: tOps('cashier_odoo.shift_kpi_cash', { defaultValue: 'Cash collected' }),
        value: methodTotals.cash_fmt || formatMoney(methodTotals.cash || 0),
        tone: 'teal',
      },
      {
        key: 'card',
        label: tOps('cashier_odoo.shift_kpi_card', { defaultValue: 'Card transactions' }),
        value: methodTotals.card_fmt || formatMoney(methodTotals.card || 0),
        tone: 'blue',
      },
      {
        key: 'mobile',
        label: tOps('cashier_odoo.shift_kpi_mobile', { defaultValue: 'Mobile money' }),
        value: methodTotals.mobile_fmt || formatMoney(methodTotals.mobile || 0),
        tone: 'purple',
      },
      {
        key: 'insurance',
        label: tOps('cashier_odoo.shift_kpi_insurance', { defaultValue: 'Insurance' }),
        value: methodTotals.insurance_fmt || formatMoney(methodTotals.insurance || 0),
        tone: 'teal-dark',
      },
    ],
    [methodTotals, tOps],
  );

  return (
    <div className="shift-page">
      <div className="row shift-kpi-row">
        {kpiCards.map((card) => (
          <div key={card.key} className="col-4">
            <div className={`cs-kpi shift-kpi shift-kpi--${card.tone}`}>
              <div className="cs-kpi-label">{card.label}</div>
              <div className="cs-kpi-value">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row shift-main-row">
        <div className="col-7">
          <div className="cs-card shift-log-card">
            <div className="cs-card-head">
              <div className="cs-card-title">
                <FaIcon name="list" className="shift-card-icon" />
                {tOps('cashier_odoo.shift_log', { defaultValue: "Today's transaction log" })}
              </div>
            </div>
            <div className="cs-card-body-0">
              {loading ? (
                <div className="cs-empty">{tOps('cashier_odoo.shift_loading', { defaultValue: 'Loading transactions…' })}</div>
              ) : (
                <>
                  <div className="cs-table-wrap">
                    <table className="cs-table shift-table">
                      <thead>
                        <tr>
                          <th className="shift-num">#</th>
                          <th>{tOps('cashier_odoo.shift_col_patient', { defaultValue: 'Patient' })}</th>
                          <th>{tOps('cashier_odoo.shift_col_service', { defaultValue: 'Service' })}</th>
                          <th className="shift-amt">{tOps('cashier_odoo.shift_col_amount', { defaultValue: 'Amount' })}</th>
                          <th>{tOps('cashier_odoo.shift_col_method', { defaultValue: 'Method' })}</th>
                          <th>{tOps('cashier_odoo.shift_col_time', { defaultValue: 'Time' })}</th>
                          <th>{tOps('cashier_odoo.shift_col_cashier', { defaultValue: 'Cashier' })}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="cs-empty">
                              {tOps('cashier_odoo.shift_empty', { defaultValue: 'No transactions recorded today.' })}
                            </td>
                          </tr>
                        ) : (
                          pageRows.map((row) => (
                            <tr key={row.ticket_id}>
                              <td className="shift-num">{row.seq}</td>
                              <td className="shift-patient">{row.patient_name}</td>
                              <td className="shift-service">{row.service_label}</td>
                              <td className="shift-amt">{row.amount_fmt || formatMoney(row.amount)}</td>
                              <td>
                                <span className={`shift-method shift-method--${String(row.payment_method_key || 'cash').toLowerCase()}`}>
                                  {row.payment_method}
                                </span>
                              </td>
                              <td className="shift-time">{row.paid_time}</td>
                              <td className="shift-cashier">{row.cashier_name}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {pager.totalPages > 1 ? (
                    <div className="shift-pager">
                      {Array.from({ length: pager.totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`shift-pager-btn${p === pager.page ? ' active' : ''}`}
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

        <div className="col-5x shift-side">
          <div className="cs-card shift-cash-card">
            <div className="cs-card-head">
              <div className="cs-card-title">
                <FaIcon name="money" className="shift-card-icon" />
                {tOps('cashier_odoo.cash_summary', { defaultValue: 'Cash summary' })}
              </div>
            </div>
            <div className="cs-card-body shift-cash-body">
              <div className="shift-cash-line">
                <span>{tOps('cashier_odoo.shift_opening_float', { defaultValue: 'Opening float' })}</span>
                <strong>{cashSummary.opening_float_fmt || formatMoney(cashSummary.opening_float || 0)}</strong>
              </div>
              <div className="shift-cash-line shift-cash-line--pos">
                <span>{tOps('cashier_odoo.shift_cash_sales', { defaultValue: 'Cash sales' })}</span>
                <strong>+{cashSummary.cash_sales_fmt || formatMoney(cashSummary.cash_sales || 0)}</strong>
              </div>
              <div className="shift-cash-line shift-cash-line--neg">
                <span>{tOps('cashier_odoo.shift_cash_refunds', { defaultValue: 'Cash refunds' })}</span>
                <strong>-{cashSummary.cash_refunds_fmt || formatMoney(cashSummary.cash_refunds || 0)}</strong>
              </div>
              <div className="shift-cash-divider" />
              <div className="shift-cash-line shift-cash-line--total">
                <span>{tOps('cashier_odoo.shift_expected_cash', { defaultValue: 'Expected cash' })}</span>
                <strong>{cashSummary.expected_cash_fmt || formatMoney(cashSummary.expected_cash || 0)}</strong>
              </div>
              <a href="/cashier?page=reports&report=eod" className="cs-btn cs-btn-primary shift-close-btn">
                <FaIcon name="lock" />
                {tOps('cashier_odoo.shift_close_print', { defaultValue: 'Close shift & print Z-report' })}
              </a>
            </div>
          </div>

          <div className="cs-card shift-chart-card">
            <div className="cs-card-head">
              <div className="cs-card-title">
                <FaIcon name="bar-chart" className="shift-card-icon" />
                {tOps('cashier_odoo.shift_collections_chart', { defaultValue: 'Collections by method' })}
              </div>
            </div>
            <div className="cs-card-body shift-chart-body">
              <ShiftMethodChart series={chartSeries} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
