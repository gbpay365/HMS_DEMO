import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { CsBadge, CsKpi } from './CashierReferenceShell';
import { formatMoney } from '../../lib/hmsLocale';

function formatCompactMoney(amount) {
  const n = Number(amount) || 0;
  const code = formatMoney(0).split(' ').pop() || '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${code}`.trim();
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K ${code}`.trim();
  return formatMoney(n);
}

function RevenueDonut({ series = [] }) {
  const total = series.reduce((s, x) => s + (Number(x.value) || 0), 0);
  let cumulative = 0;
  const stops = total
    ? series
        .filter((s) => (Number(s.value) || 0) > 0)
        .map((seg) => {
          const start = (cumulative / total) * 100;
          cumulative += Number(seg.value) || 0;
          const end = (cumulative / total) * 100;
          return `${seg.color} ${start}% ${end}%`;
        })
        .join(', ')
    : '';

  return (
    <div className="cs-donut-layout">
      <div
        className="cs-donut"
        style={{ background: stops ? `conic-gradient(${stops})` : '#e5e7eb' }}
        aria-hidden="true"
      >
        <div className="cs-donut-hole" />
      </div>
      <div className="cs-donut-legend">
        {series.map((item) => (
          <div key={item.key} className="cs-donut-legend__row">
            <span className="cs-donut-legend__dot" style={{ background: item.color }} />
            <span className="cs-donut-legend__label">{item.label}</span>
            <span className="cs-donut-legend__value">{formatMoney(item.value || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function statusTone(status) {
  if (status === 'partial') return 'partial';
  if (status === 'overdue') return 'overdue';
  if (status === 'insurance') return 'insurance';
  return 'pending';
}

function statusLabel(status, tOps) {
  const map = {
    partial: tOps('cashier_odoo.status_partial', { defaultValue: 'Partial' }),
    overdue: tOps('cashier_odoo.status_overdue', { defaultValue: 'Overdue' }),
    insurance: tOps('cashier_odoo.status_insurance', { defaultValue: 'Insurance' }),
    pending: tOps('cashier_odoo.status_pending', { defaultValue: 'Pending' }),
  };
  return map[status] || map.pending;
}

export function CashierOverviewPanel({ initialKpi = {}, initialRevenueChart = [], onPayBill }) {
  const { t } = useTranslation('clinical');
  const { t: tOps } = useTranslation('ops');
  const [kpi, setKpi] = useState(initialKpi);
  const [recent, setRecent] = useState([]);
  const [revenueChart, setRevenueChart] = useState(initialRevenueChart);
  const [loading, setLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cashier/overview', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        if (data.kpi) setKpi(data.kpi);
        if (Array.isArray(data.recent_transactions)) setRecent(data.recent_transactions);
        if (Array.isArray(data.revenue_chart)) setRevenueChart(data.revenue_chart);
      }
    } catch {
      /* keep SSR data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    const id = setInterval(loadOverview, 60000);
    return () => clearInterval(id);
  }, [loadOverview]);

  const revenueSub = useMemo(() => {
    const pct = Number(kpi.revenue_delta_pct) || 0;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}% ${tOps('cashier_odoo.vs_yesterday', { defaultValue: 'vs yesterday' })}`;
  }, [kpi.revenue_delta_pct, tOps]);

  const revenueSubPositive = (Number(kpi.revenue_delta_pct) || 0) >= 0;
  const pendingBills = kpi.pending_bills || [];
  const todayCount = kpi.today_count || 0;

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="col-4">
          <CsKpi
            label={tOps('cashier_odoo.revenue_today', { defaultValue: 'Revenue today' })}
            value={formatCompactMoney(kpi.today_revenue || 0)}
            sub={revenueSub}
            color="var(--cs-accent)"
            icon="line-chart"
            subColor={revenueSubPositive ? '#059669' : '#DC2626'}
          />
        </div>
        <div className="col-4">
          <CsKpi
            label={tOps('cashier_odoo.transactions_today', { defaultValue: 'Transactions today' })}
            value={todayCount}
            sub={tOps('cashier_odoo.transactions_completed_count', {
              defaultValue: '{{count}} completed',
              count: todayCount,
            })}
            color="var(--cs-primary)"
            icon="exchange"
          />
        </div>
        <div className="col-4">
          <CsKpi
            label={tOps('cashier_odoo.pending_bills', { defaultValue: 'Pending bills' })}
            value={kpi.pending_count || 0}
            sub={tOps('cashier_odoo.requires_collection', { defaultValue: 'requires collection' })}
            color="var(--cs-pending-text)"
            icon="clock-o"
          />
        </div>
        <div className="col-4">
          <CsKpi
            label={tOps('cashier_odoo.overdue_bills', { defaultValue: 'Overdue bills' })}
            value={kpi.overdue_count || 0}
            sub={tOps('cashier_odoo.action_required', { defaultValue: 'action required' })}
            color="#DC2626"
            icon="exclamation-circle"
          />
        </div>
      </div>

      <div className="row">
        <div className="col-7">
          <div className="cs-card">
            <div className="cs-card-head">
              <div className="cs-card-title">
                <FaIcon name="file-text-o" style={{ color: 'var(--cs-accent)', fontSize: 15 }} />{' '}
                {tOps('cashier_odoo.recent_transactions', { defaultValue: 'Recent transactions' })}
              </div>
              <span className="cs-badge bg-paid" style={{ fontSize: 10 }}>
                {tOps('cashier_odoo.live', { defaultValue: 'Live' })}
              </span>
            </div>
            <div className="cs-card-body-0" style={{ overflowX: 'auto' }}>
              <table className="cs-table">
                <thead>
                  <tr>
                    <th>{tOps('cashier_odoo.col_receipt', { defaultValue: 'Receipt #' })}</th>
                    <th>{t('cashier.col_patient')}</th>
                    <th>{t('cashier.col_amount')}</th>
                    <th>{tOps('cashier_odoo.col_method', { defaultValue: 'Method' })}</th>
                    <th>{tOps('cashier_odoo.col_time', { defaultValue: 'Time' })}</th>
                    <th>{t('cashier.col_status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="cs-empty">
                        {loading
                          ? tOps('cashier_odoo.loading', { defaultValue: 'Loading…' })
                          : tOps('cashier_odoo.no_recent_tx', { defaultValue: 'No transactions yet today' })}
                      </td>
                    </tr>
                  ) : (
                    recent.map((row) => (
                      <tr key={row.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--cs-primary)' }}>
                          {row.receipt_number || row.ticket_code}
                        </td>
                        <td style={{ fontWeight: 500 }}>{row.patient_name}</td>
                        <td style={{ fontWeight: 500 }}>{row.amount_fmt || formatMoney(row.amount)}</td>
                        <td style={{ fontSize: 12 }}>{row.payment_method}</td>
                        <td style={{ fontSize: 11, color: '#9CA3AF' }}>{row.paid_time}</td>
                        <td>
                          <CsBadge tone="paid">{tOps('cashier_odoo.status_paid', { defaultValue: 'Paid' })}</CsBadge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-5x" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="cs-card">
            <div className="cs-card-head">
              <div className="cs-card-title">
                <FaIcon name="pie-chart" style={{ color: 'var(--cs-accent)', fontSize: 14 }} />{' '}
                {tOps('cashier_odoo.revenue_by_method', { defaultValue: 'Revenue by method today' })}
              </div>
            </div>
            <div className="cs-card-body">
              <RevenueDonut series={revenueChart} />
            </div>
          </div>

          <div className="cs-card">
            <div className="cs-card-head">
              <div className="cs-card-title">
                <FaIcon name="clock-o" style={{ color: 'var(--cs-accent)', fontSize: 14 }} />{' '}
                {tOps('cashier_odoo.pending_bills', { defaultValue: 'Pending bills' })}
              </div>
              {(kpi.pending_count || 0) > 0 ? (
                <span className="cs-badge bg-pending">{kpi.pending_count}</span>
              ) : null}
            </div>
            <div className="cs-card-body-0">
              {pendingBills.length === 0 ? (
                <div className="cs-empty">{t('cashier.empty_pending')}</div>
              ) : (
                pendingBills.map((row) => (
                  <div key={row.ticket_id} className="cs-pending-item">
                    <div
                      className="cs-avatar"
                      style={{
                        background: 'var(--cs-light)',
                        color: 'var(--cs-primary)',
                        width: 28,
                        height: 28,
                        fontSize: 10,
                      }}
                    >
                      {row.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cs-primary)' }}>
                        {row.patient_name}
                      </div>
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {row.ticket_code} · {row.balance_due_fmt} {tOps('cashier_odoo.due', { defaultValue: 'due' })}
                      </div>
                    </div>
                    <CsBadge tone={statusTone(row.display_status)}>
                      {statusLabel(row.display_status, tOps)}
                    </CsBadge>
                    <button
                      type="button"
                      className="cs-btn cs-btn-primary cs-btn-sm"
                      onClick={() => onPayBill?.(row)}
                    >
                      {tOps('cashier_odoo.pay', { defaultValue: 'Pay' })}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
