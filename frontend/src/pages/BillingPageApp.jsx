import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { SurfaceHero } from '../components/SurfaceHero';
import { formatDate, formatMoney, transactionStatus, transactionStatusLabel } from '../lib/listUi';

export function BillingPageApp({ stats = {}, transactions = [], pager = null, searchQ = '', flash = null, error = null }) {
  const { t } = useTranslation('ops');
  const [search, setSearch] = useState(searchQ || '');
  const query = search.trim() ? { q: search.trim() } : {};

  const onSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    window.location.href = q ? `/billing?q=${encodeURIComponent(q)}` : '/billing';
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="credit-card" title={t('billing.title')} subtitle={t('billing.subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            <a href="/billing/receipts" className="hms-btn-secondary text-xs">
              {t('billing.receipts_link')}
            </a>
          </div>
        </SurfaceHero>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <StatCard
            label={t('billing.kpi_total')}
            value={formatMoney(stats.total || 0)}
            hint={t('billing.kpi_total_hint')}
            tone="brand"
            icon="money"
          />
          <StatCard
            label={t('billing.kpi_today')}
            value={formatMoney(stats.today || 0)}
            hint={t('billing.kpi_today_hint')}
            tone="brand"
            icon="calendar-check-o"
          />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <SearchField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('billing.search_ph')}
            onSubmit={onSearch}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('billing.col_txn')}</th>
                  <th className="px-4 py-3">{t('billing.col_patient')}</th>
                  <th className="px-4 py-3">{t('billing.col_method')}</th>
                  <th className="px-4 py-3">{t('billing.col_description')}</th>
                  <th className="px-4 py-3">{t('billing.col_amount')}</th>
                  <th className="px-4 py-3">{t('billing.col_date')}</th>
                  <th className="px-4 py-3">{t('billing.col_status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      {t('billing.empty')}
                    </td>
                  </tr>
                ) : (
                  transactions.map((txn) => {
                    const st = transactionStatus(txn.status);
                    const patientName =
                      txn.first_name || txn.last_name
                        ? `${txn.first_name || ''} ${txn.last_name || ''}`.trim()
                        : '—';
                    return (
                      <tr key={txn.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold text-brand">#{txn.id}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">{patientName}</div>
                          {txn.patient_id ? (
                            <div className="text-xs text-slate-500">#P-{txn.patient_id}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{txn.payment_method || '—'}</td>
                        <td className="px-4 py-3 text-ink">{txn.description || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-ink">{formatMoney(txn.amount)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(txn.transaction_date)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge variant={st.variant} label={transactionStatusLabel(t, txn.status)} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pager pager={pager} basePath="/billing" query={query} />
        </div>
      </div>
    </div>
  );
}
