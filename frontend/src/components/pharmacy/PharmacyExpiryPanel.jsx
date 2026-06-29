import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pager } from '../Pager';
import { SearchField } from '../SearchField';
import { useClientPagination } from '../../hooks/useClientPagination';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';

const DAY_OPTIONS = [30, 60, 90, 180];

function severityBadge(severity, expired, t) {
  if (expired) {
    return { cls: 'ph-badge-rx-out', label: t('pharmacy.expiry_severity_expired') };
  }
  if (severity === 'critical') {
    return { cls: 'ph-badge-rx-partial', label: t('pharmacy.expiry_severity_critical') };
  }
  if (severity === 'warning') {
    return { cls: 'ph-badge-rx-prep', label: t('pharmacy.expiry_severity_warning') };
  }
  return { cls: 'ph-badge-rx-ready', label: t('pharmacy.expiry_severity_ok') };
}

export function PharmacyExpiryPanel({ expiryItems = [], expiryStats = {}, expiryDays = 30 }) {
  const { t } = useTranslation('ops');
  const [search, setSearch] = useState('');
  const [daysFilter, setDaysFilter] = useState(expiryDays);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expiryItems.filter((item) => {
      const matchSearch =
        !q || [item.name, item.sku, item.category, item.location].join(' ').toLowerCase().includes(q);
      let matchSeverity = true;
      if (severityFilter === 'expired') matchSeverity = item.expired;
      else if (severityFilter === 'critical') matchSeverity = !item.expired && item.severity === 'critical';
      else if (severityFilter === 'warning') matchSeverity = !item.expired && item.severity === 'warning';
      return matchSearch && matchSeverity;
    });
  }, [expiryItems, search, severityFilter]);

  const { setPage, pager, rows } = useClientPagination(filtered, {
    pageSize,
    resetKeys: [search, severityFilter, pageSize],
  });

  const kpis = [
    { key: 'total', labelKey: 'pharmacy.expiry_kpi_total', color: 'var(--pha-expiry-alert, #7c3aed)' },
    { key: 'expired', labelKey: 'pharmacy.expiry_kpi_expired', color: '#991b1b' },
    { key: 'critical', labelKey: 'pharmacy.expiry_kpi_critical', color: '#854d0e' },
    { key: 'warning', labelKey: 'pharmacy.expiry_kpi_warning', color: '#5b21b6' },
  ];

  return (
    <>
      {expiryStats.expired > 0 || expiryStats.critical > 0 ? (
        <div className="ph-expiry-alert-banner mb-3">
          <i className="fa fa-exclamation-triangle" aria-hidden="true" />
          <div>
            <div className="ph-expiry-banner-title">{t('pharmacy.expiry_banner_title')}</div>
            <div>{t('pharmacy.expiry_banner_body', { expired: expiryStats.expired, critical: expiryStats.critical })}</div>
          </div>
        </div>
      ) : null}

      <div className="ph-rx-kpi-row ph-rx-kpi-row--4">
        {kpis.map((k) => (
          <div key={k.key} className="ph-rx-kpi-card sm:col-span-1" style={{ borderTopColor: k.color }}>
            <div className="ph-rx-kpi-label">{t(k.labelKey)}</div>
            <div className="ph-rx-kpi-value" style={{ color: k.color }}>
              {expiryStats[k.key] ?? 0}
            </div>
          </div>
        ))}
      </div>

      <div className="ph-rx-panel">
        <div className="ph-rx-panel-head">
          <i className="fa fa-clock-o" aria-hidden="true" />
          {t('pharmacy.expiry_queue_title')}
        </div>

        <div className="ph-rx-filter-bar">
          <form
            className="flex items-center gap-1"
            onSubmit={(ev) => {
              ev.preventDefault();
              window.location.href = `/pharmacy?view=expiry&days=${encodeURIComponent(daysFilter)}`;
            }}
          >
            <label className="sr-only" htmlFor="expiry-days">{t('pharmacy.expiry_within')}</label>
            <select id="expiry-days" value={daysFilter} onChange={(ev) => setDaysFilter(Number(ev.target.value))} className="hms-input h-10 w-40 text-sm">
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {t('pharmacy.expiry_days_option', { count: d })}
                </option>
              ))}
            </select>
            <button type="submit" className="pha-btn-secondary h-10 px-3 text-sm">
              {t('pharmacy.dispense_go_day')}
            </button>
          </form>
          <select value={severityFilter} onChange={(ev) => setSeverityFilter(ev.target.value)} className="hms-input h-10 w-44 text-sm">
            <option value="all">{t('pharmacy.rx_filter_all')}</option>
            <option value="expired">{t('pharmacy.expiry_severity_expired')}</option>
            <option value="critical">{t('pharmacy.expiry_severity_critical')}</option>
            <option value="warning">{t('pharmacy.expiry_severity_warning')}</option>
          </select>
          <div className="w-full max-w-[240px] [&_.hms-input]:h-10 [&_.hms-input]:text-sm">
            <SearchField value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder={t('shared.search')} />
          </div>
          <span className="ph-rx-count">{t('pharmacy.rx_count', { count: filtered.length })}</span>
        </div>

        <div className="ph-rx-table-wrap">
          <table className="ph-rx-table">
            <thead>
              <tr>
                <th>{t('pharmacy.col_drug')}</th>
                <th>{t('pharmacy.col_batch')}</th>
                <th className="text-right">{t('pharmacy.col_stock')}</th>
                <th>{t('pharmacy.col_expiry')}</th>
                <th>{t('pharmacy.expiry_col_days_left')}</th>
                <th>{t('pharmacy.expiry_col_location')}</th>
                <th>{t('pharmacy.expiry_col_severity')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="ph-rx-empty">
                    {t('pharmacy.expiry_empty')}
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const badge = severityBadge(item.severity, item.expired, t);
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="font-semibold text-[var(--pha-primary,#4b1528)]">{item.name}</div>
                        <div className="ph-rx-sub">{item.category}</div>
                      </td>
                      <td className="font-mono text-sm">{item.sku || '—'}</td>
                      <td className="text-right tabular-nums font-semibold">{item.quantity}</td>
                      <td className={item.expired ? 'pha-text-expired font-semibold' : item.severity === 'critical' ? 'pha-text-expiry-alert font-semibold' : ''}>
                        {item.expiry_date}
                      </td>
                      <td className={item.days_left != null && item.days_left <= 14 ? 'pha-text-expiry-alert font-semibold' : 'text-slate-600'}>
                        {item.expired
                          ? t('pharmacy.expired')
                          : item.days_left != null
                            ? t('pharmacy.expiry_days', { count: item.days_left })
                            : '—'}
                      </td>
                      <td className="text-sm text-slate-600">{item.location}</td>
                      <td>
                        <span className={`ph-rx-badge ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="text-right">
                        <a href={`/pharmacy/products/${item.id}/movements`} className="pha-btn-secondary px-3 py-1.5 text-sm">
                          {t('pharmacy.view_movements')}
                        </a>
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
