import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { formatMoney } from '../../lib/hmsLocale';
import {
  CategoryLabel,
  PaymentMethodChip,
  ReportError,
  ReportFlash,
  ReportKpiTile,
  ReportLoading,
  ReportTh,
} from './CashierReportUi';

function declaredSeed(report) {
  const out = {};
  const saved = report?.declaredTotals || {};
  for (const row of report?.reconciliationRows || []) {
    if (saved[row.key] != null) out[row.key] = String(saved[row.key]);
    else if (row.declared != null) out[row.key] = String(row.declared);
    else out[row.key] = '';
  }
  return out;
}

export function CashierEodPanel() {
  const { t } = useTranslation('clinical');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [declared, setDeclared] = useState({});
  const [openingFloat, setOpeningFloat] = useState('');
  const [notes, setNotes] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    setFlash('');
    try {
      const qs = new URLSearchParams({ date });
      const res = await fetch(`/api/cashier/eod-reconciliation?${qs.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || t('cashier.eod.load_failed', { defaultValue: 'Could not load reconciliation.' }));
      }
      const next = data.report || null;
      setReport(next);
      setDeclared(declaredSeed(next));
      setOpeningFloat(next?.openingFloat != null && next.openingFloat !== '' ? String(next.openingFloat) : '');
      setNotes(next?.saved?.notes || '');
    } catch (e) {
      setError(e.message || String(e));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [date, t]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const summary = report?.summary?.summary || {};
  const categoryRows = report?.summary?.categoryRows || [];
  const cashierBreakdown = report?.cashierBreakdown || [];
  const reconciliationRows = report?.reconciliationRows || [];
  const dayStats = report?.dayStats || {};

  const totalVarianceFmt = useMemo(
    () => report?.totalVariance_fmt || formatMoney(report?.totalVariance || 0),
    [report]
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!report) return;
    setSaving(true);
    setError('');
    setFlash('');
    try {
      const body = { date, opening_float: openingFloat, notes };
      for (const row of reconciliationRows) {
        body[`declared_${row.key}`] = declared[row.key] ?? '';
      }
      const res = await fetch('/api/cashier/eod-reconciliation', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || t('cashier.eod.save_failed', { defaultValue: 'Could not save reconciliation.' }));
      }
      setFlash(data.message || t('cashier.eod.saved', { defaultValue: 'Reconciliation saved.' }));
      if (data.report) {
        setReport(data.report);
        setDeclared(declaredSeed(data.report));
        setNotes(data.report?.saved?.notes || '');
      } else {
        await loadReport();
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rpt-daily cs-rpt-panel cs-ledger-panel">
      <div className="rpt-daily-toolbar cs-ledger-toolbar">
        <div className="rpt-daily-filters">
          <label className="rpt-daily-filter">
            <span>
              <FaIcon name="calendar" className="cs-ledger-filter-icon" />{' '}
              {t('cashier.eod.business_date', { defaultValue: 'Business date' })}
            </span>
            <input className="cs-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button
            type="button"
            className={`cs-btn cs-btn-sm cs-ledger-apply${loading ? ' cs-ledger-apply--spin' : ''}`}
            onClick={loadReport}
            disabled={loading}
          >
            <FaIcon name="refresh" /> {t('cashier.eod.load', { defaultValue: 'Load report' })}
          </button>
        </div>
        <div className="rpt-daily-actions">
          <a
            href={`/cashier/eod-reconciliation/print?date=${encodeURIComponent(date)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="cs-btn cs-btn-sm"
          >
            <FaIcon name="print" /> {t('cashier.eod.print', { defaultValue: 'Print report' })}
          </a>
          <a href={`/cashier/eod-reconciliation?date=${encodeURIComponent(date)}`} className="cs-btn cs-btn-sm" target="_blank" rel="noopener noreferrer">
            <FaIcon name="external-link" /> {t('cashier.daily_summary.open_full', { defaultValue: 'Full page' })}
          </a>
        </div>
      </div>

      {loading ? <ReportLoading message={t('cashier.eod.loading', { defaultValue: 'Loading reconciliation…' })} /> : null}
      {error ? <ReportError message={error} /> : null}
      {flash ? <ReportFlash message={flash} /> : null}
      {report?.saved ? (
        <ReportFlash icon="lock" message={t('cashier.eod.saved_hint', { defaultValue: 'Reconciliation submitted for this date.' })} />
      ) : null}

      {!loading && report ? (
        <div className="cs-ledger-content">
          <div className="row rpt-daily-kpi-row">
            <ReportKpiTile
              icon="money"
              label={t('cashier.daily_summary.kpi_collected', { defaultValue: 'Total collected' })}
              value={summary.grandTotal_fmt || formatMoney(summary.grandTotal || 0)}
              tone="accent"
              delay={0.04}
            />
            <ReportKpiTile
              icon="ticket"
              label={t('cashier.daily_summary.kpi_tickets', { defaultValue: 'Paid tickets' })}
              value={summary.ticketCount || 0}
              tone="primary"
              delay={0.08}
            />
            <ReportKpiTile
              icon="clock-o"
              label={t('cashier.eod.pending_open', { defaultValue: 'Open pending' })}
              value={dayStats.pending_count || 0}
              sub={`${dayStats.pending_total_fmt || formatMoney(dayStats.pending_total || 0)}`}
              tone="warn"
              delay={0.12}
            />
            <ReportKpiTile
              icon="undo"
              label={t('cashier.eod.refunds', { defaultValue: 'Refunds today' })}
              value={dayStats.refund_count || 0}
              sub={`${dayStats.refund_total_fmt || formatMoney(dayStats.refund_total || 0)}`}
              tone="danger"
              delay={0.16}
            />
          </div>

          <form className="cs-card rpt-daily-card cs-ledger-card rpt-eod-form cs-rpt-eod-form" onSubmit={handleSubmit}>
            <div className="cs-card-head">
              <div className="cs-card-title">
                <FaIcon name="balance-scale" className="cs-ledger-card-icon" />{' '}
                {t('cashier.eod.reconciliation', { defaultValue: 'Reconciliation' })}
              </div>
              <div className="cs-card-sub">{t('cashier.eod.reconciliation_hint', { defaultValue: 'Enter physical / terminal counts. Variance = declared − system.' })}</div>
            </div>
            <div className="cs-card-body-0 cs-ledger-scroll">
              <table className="cs-ledger-table cs-ledger-table--eod">
                <colgroup>
                  <col className="cs-ledger-col--method" />
                  <col className="cs-ledger-col--amount" />
                  <col className="cs-ledger-col--amount" />
                  <col className="cs-ledger-col--amount" />
                </colgroup>
                <thead>
                  <tr>
                    <ReportTh icon="credit-card">{t('cashier.daily_summary.col_method', { defaultValue: 'Method' })}</ReportTh>
                    <ReportTh icon="desktop" numeric>
                      {t('cashier.eod.col_system', { defaultValue: 'System' })}
                    </ReportTh>
                    <ReportTh icon="edit" numeric>
                      {t('cashier.eod.col_declared', { defaultValue: 'Declared count' })}
                    </ReportTh>
                    <ReportTh icon="exchange" numeric>
                      {t('cashier.eod.col_variance', { defaultValue: 'Variance' })}
                    </ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationRows.map((row, idx) => (
                    <tr
                      key={row.key}
                      className={`cs-ledger-row${row.balanced ? '' : ' rpt-eod-variance-row'}`}
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      <td>
                        <PaymentMethodChip method={row.key} label={row.label} />
                      </td>
                      <td className="cs-ledger-num">{row.system_fmt || formatMoney(row.system)}</td>
                      <td className="cs-ledger-num">
                        <input
                          className="cs-input cs-input--num cs-rpt-input-num"
                          type="number"
                          min="0"
                          step="1"
                          value={declared[row.key] ?? ''}
                          onChange={(ev) => setDeclared((prev) => ({ ...prev, [row.key]: ev.target.value }))}
                        />
                      </td>
                      <td className={`cs-ledger-num ${row.balanced ? 'rpt-var-ok' : row.variance > 0 ? 'rpt-var-over' : 'rpt-var-under'}`}>
                        {row.variance_fmt || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="cs-rpt-foot-row">
                    <td>{t('cashier.eod.total_variance', { defaultValue: 'Net variance' })}</td>
                    <td colSpan={2} />
                    <td className={`cs-ledger-num cs-ledger-num--strong ${report.isBalanced ? 'rpt-var-ok' : 'rpt-var-under'}`}>
                      {totalVarianceFmt}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="rpt-eod-form-foot">
              <label className="rpt-daily-filter">
                <span>
                  <FaIcon name="money" className="cs-ledger-filter-icon" />{' '}
                  {t('cashier.eod.opening_float', { defaultValue: 'Opening float (cash)' })}
                </span>
                <input className="cs-input" type="number" min="0" step="1" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
              </label>
              <label className="rpt-daily-filter rpt-eod-notes">
                <span>
                  <FaIcon name="calculator" className="cs-ledger-filter-icon" />{' '}
                  {t('cashier.eod.expected_drawer', { defaultValue: 'Expected cash in drawer' })}
                </span>
                <div className="cs-input cs-input--readonly">{report.expectedCashDrawer_fmt || formatMoney(report.expectedCashDrawer || 0)}</div>
              </label>
              <label className="rpt-daily-filter rpt-eod-notes">
                <span>
                  <FaIcon name="sticky-note-o" className="cs-ledger-filter-icon" />{' '}
                  {t('cashier.eod.notes', { defaultValue: 'Notes / explanation of variance' })}
                </span>
                <textarea className="cs-input cs-profile-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <button type="submit" className="cs-btn cs-btn-primary" disabled={saving}>
                <FaIcon name="save" /> {saving ? t('cashier.eod.saving', { defaultValue: 'Saving…' }) : t('cashier.eod.submit', { defaultValue: 'Submit reconciliation' })}
              </button>
            </div>
          </form>

          <div className="row cs-rpt-split">
            <div className="col-6">
              <div className="cs-card rpt-daily-card cs-ledger-card">
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
                    </colgroup>
                    <thead>
                      <tr>
                        <ReportTh icon="folder-open">{t('cashier.daily_summary.category', { defaultValue: 'Category' })}</ReportTh>
                        <ReportTh icon="money" numeric>
                          {t('cashier.daily_summary.amount', { defaultValue: 'Amount' })}
                        </ReportTh>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="cs-empty cs-ledger-empty">
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
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-6">
              <div className="cs-card rpt-daily-card cs-ledger-card">
                <div className="cs-card-head">
                  <div className="cs-card-title">
                    <FaIcon name="users" className="cs-ledger-card-icon" />{' '}
                    {t('cashier.eod.by_cashier', { defaultValue: 'By cashier' })}
                  </div>
                </div>
                <div className="cs-card-body-0 cs-ledger-scroll">
                  <table className="cs-ledger-table cs-ledger-table--summary">
                    <colgroup>
                      <col className="cs-ledger-col--employee" />
                      <col className="cs-ledger-col--amount-sm" />
                      <col className="cs-ledger-col--amount" />
                    </colgroup>
                    <thead>
                      <tr>
                        <ReportTh icon="user">{t('cashier.eod.cashier', { defaultValue: 'Cashier' })}</ReportTh>
                        <ReportTh icon="ticket" numeric>
                          {t('cashier.daily_summary.kpi_tickets', { defaultValue: 'Paid tickets' })}
                        </ReportTh>
                        <ReportTh icon="money" numeric>
                          {t('cashier.daily_summary.amount', { defaultValue: 'Amount' })}
                        </ReportTh>
                      </tr>
                    </thead>
                    <tbody>
                      {cashierBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="cs-empty cs-ledger-empty">
                            <FaIcon name="inbox" className="cs-ledger-empty-icon" />—
                          </td>
                        </tr>
                      ) : (
                        cashierBreakdown.map((row, idx) => (
                          <tr key={row.cashier_name || row.user_id} className="cs-ledger-row" style={{ animationDelay: `${idx * 0.04}s` }}>
                            <td>{row.cashier_name}</td>
                            <td className="cs-ledger-num">{row.ticket_count}</td>
                            <td className="cs-ledger-num cs-ledger-num--strong">{row.total_collected_fmt || formatMoney(row.total_collected)}</td>
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
