import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pager } from '../Pager';
import { SearchField } from '../SearchField';
import { formatAmount } from '../../lib/hmsLocale';
import { useClientPagination } from '../../hooks/useClientPagination';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

export function PharmacySalesPanel({
  salesStats = {},
  salesLines = [],
  pendingSales = [],
  salesDay = '',
}) {
  const { t } = useTranslation('ops');
  const [search, setSearch] = useState('');
  const [dayFilter, setDayFilter] = useState(salesDay || new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState('served');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const list = tab === 'pending' ? pendingSales : salesLines;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row) =>
      [row.item_name, row.patient_name, row.service_code, row.pharmacist_name]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [list, search]);

  const { setPage, pager, rows } = useClientPagination(filtered, {
    pageSize,
    resetKeys: [search, tab, pageSize],
  });

  const kpis = [
    { key: 'salesToday', labelKey: 'pharmacy.sales_kpi_today', color: 'var(--pha-accent, #d4537e)' },
    { key: 'dispensedToday', labelKey: 'pharmacy.sales_kpi_dispensed', color: 'var(--pha-primary, #4b1528)' },
    { key: 'salesMonth', labelKey: 'pharmacy.sales_kpi_month', color: '#14532d', money: true },
    { key: 'pendingPaidAmount', labelKey: 'pharmacy.sales_kpi_pending', color: '#854d0e', money: true },
  ];

  return (
    <>
      <div className="ph-rx-kpi-row">
        {kpis.map((k) => (
          <div key={k.key} className="ph-rx-kpi-card" style={{ borderTopColor: k.color }}>
            <div className="ph-rx-kpi-label">{t(k.labelKey)}</div>
            <div className="ph-rx-kpi-value" style={{ color: k.color }}>
              {k.money ? formatAmount(salesStats[k.key] || 0) : salesStats[k.key] ?? 0}
            </div>
            {k.key === 'pendingPaidAmount' && salesStats.pendingPaidCount != null ? (
              <div className="ph-rx-kpi-hint">
                {t('pharmacy.sales_pending_lines', { count: salesStats.pendingPaidCount })}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="ph-rx-panel">
        <div className="ph-rx-panel-head">
          <i className="fa fa-credit-card" aria-hidden="true" />
          {t('pharmacy.sales_queue_title')}
        </div>

        <div className="ph-rx-filter-bar">
          <div className="ph-rx-tab-toggle flex rounded-full border border-[var(--pha-soft-border,#f4c0d1)] bg-white p-0.5 font-semibold">
            <button
              type="button"
              className={`rounded-full px-4 py-2 text-sm ${tab === 'served' ? 'pha-btn-primary text-white' : 'text-slate-600'}`}
              onClick={() => {
                setTab('served');
                setSearch('');
              }}
            >
              {t('pharmacy.sales_tab_served')}
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-2 text-sm ${tab === 'pending' ? 'pha-btn-primary text-white' : 'text-slate-600'}`}
              onClick={() => {
                setTab('pending');
                setSearch('');
              }}
            >
              {t('pharmacy.sales_tab_pending')} ({pendingSales.length})
            </button>
          </div>
          {tab === 'served' ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(ev) => {
                ev.preventDefault();
                window.location.href = `/pharmacy?view=sales&day=${encodeURIComponent(dayFilter)}`;
              }}
            >
              <input type="date" value={dayFilter} onChange={(ev) => setDayFilter(ev.target.value)} className="hms-input h-10 text-sm" />
              <button type="submit" className="pha-btn-secondary h-10 px-3 text-sm">
                {t('pharmacy.dispense_go_day')}
              </button>
            </form>
          ) : null}
          <div className="w-full max-w-[240px] [&_.hms-input]:h-10 [&_.hms-input]:text-sm">
            <SearchField value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder={t('shared.search')} />
          </div>
          <span className="ph-rx-count">{t('pharmacy.rx_count', { count: filtered.length })}</span>
        </div>

        <div className="ph-rx-table-wrap">
          <table className="ph-rx-table">
            <thead>
              <tr>
                <th>{tab === 'pending' ? t('pharmacy.col_code') : t('pharmacy.col_dispensed_at')}</th>
                <th>{t('shared.patient')}</th>
                <th>{t('pharmacy.col_medication')}</th>
                <th className="text-right">{t('pharmacy.col_qty')}</th>
                <th className="text-right">{t('pharmacy.sales_col_amount')}</th>
                <th>{tab === 'pending' ? t('shared.status') : t('pharmacy.col_pharmacist')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ph-rx-empty">
                    {tab === 'pending' ? t('pharmacy.sales_empty_pending') : t('pharmacy.sales_empty')}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const servedAt = row.served_at ? new Date(row.served_at) : null;
                  return (
                    <tr key={`${tab}-${row.id}`}>
                      <td className="font-mono text-sm">
                        {tab === 'pending' ? (
                          <code className="rounded bg-slate-100 px-1.5 py-0.5">{row.service_code || `#${row.id}`}</code>
                        ) : (
                          servedAt
                            ? servedAt.toLocaleString(undefined, {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'
                        )}
                      </td>
                      <td>{row.patient_name || '—'}</td>
                      <td>{row.item_name || '—'}</td>
                      <td className="text-right tabular-nums">{row.quantity ?? '—'}</td>
                      <td className="text-right font-semibold tabular-nums">{formatAmount(row.line_total || 0)}</td>
                      <td className="text-sm">
                        {tab === 'pending' ? (
                          <span className="ph-rx-badge ph-badge-rx-prep">{t('pharmacy.status_awaiting')}</span>
                        ) : (
                          row.pharmacist_name || '—'
                        )}
                      </td>
                      <td className="text-right">
                        {row.service_code ? (
                          <a href={`/pharmacy/validate/${encodeURIComponent(row.service_code)}`} className="pha-btn-primary px-3 py-1.5 text-sm">
                            {tab === 'pending' ? t('pharmacy.open_validate') : t('shared.open')}
                          </a>
                        ) : tab === 'pending' ? (
                          <a href="/pharmacy/validate" className="pha-btn-secondary px-3 py-1.5 text-sm">
                            {t('pharmacy.validate_code')}
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pager pager={pager} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </div>
    </>
  );
}
