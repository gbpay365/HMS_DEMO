import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ActionMenu';
import { FlashMessages } from '../components/FlashMessages';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { SurfaceHero } from '../components/SurfaceHero';
import { formatDate, hasPerm } from '../lib/listUi';
import { NewPrescriptionModal } from '../modals/NewPrescriptionModal';

function prescriptionStatusLabel(status, t) {
  const s = String(status || 'ORDERED').toUpperCase();
  if (/DISPENS|COMPLET|FILLED/.test(s)) {
    return { variant: 'completed', label: /DISPENS/.test(s) ? t('prescriptions.status_dispensed') : t('prescriptions.status_completed') };
  }
  if (/CANCEL/.test(s)) return { variant: 'cancelled', label: t('prescriptions.status_cancelled') };
  if (/PARTIAL/.test(s)) return { variant: 'info', label: t('prescriptions.status_partial') };
  return { variant: 'pending', label: t('prescriptions.status_ordered') };
}

export function PrescriptionsPageApp({
  prescriptions = [],
  patients = [],
  pager = null,
  searchQ = '',
  flash = null,
  error = null,
  userPerms = []}) {
  const { t } = useTranslation('clinical');
  const [search, setSearch] = useState(searchQ || '');
  const [rxOpen, setRxOpen] = useState(false);
  const preselectPatientId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('patient_id') || '';
  }, []);

  const canWrite = hasPerm(userPerms, [
    'prescription.write',
    'pharmacy.write',
    'clinical.write',
    '*',
  ]);

  const query = search.trim() ? { q: search.trim() } : {};

  const menuFor = (rx) => {
    const items = [];
    if (hasPerm(userPerms, ['prescription.read', 'pharmacy.read', 'clinical.read'])) {
      items.push({
        href: `/prescriptions/${rx.id}`,
        label: t('prescriptions.view_details'),
        icon: <span className="text-brand">👁</span>});
    }
    if (hasPerm(userPerms, ['prescription.read', 'pharmacy.read'])) {
      items.push({
        href: `/prescriptions/${rx.id}/print`,
        label: t('prescriptions.print_rx'),
        icon: <span className="text-brand">🖨</span>});
    }
    if (hasPerm(userPerms, ['chart.read', 'patient.read'])) {
      items.push({
        href: `/patient-chart/${rx.patient_id}`,
        label: t('prescriptions.patient_chart'),
        icon: <span className="text-brand">📁</span>});
    }
    return items;
  };

  const onSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    window.location.href = q ? `/prescriptions?q=${encodeURIComponent(q)}` : '/prescriptions';
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="file-medical" title={t('prescriptions.title')} subtitle={t('prescriptions.subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            <a href="/pharmacy" className="hms-btn-secondary text-xs">
              {t('prescriptions.pharmacy_hub')}
            </a>
            {canWrite ? (
              <button type="button" className="hms-btn-primary text-xs" onClick={() => setRxOpen(true)}>
                {t('prescriptions.new')}
              </button>
            ) : null}
          </div>
        </SurfaceHero>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <StatCard label={t('prescriptions.stat_total')} value={pager?.total ?? prescriptions.length} tone="brand" icon="list" />
          <StatCard label={t('prescriptions.stat_page')} value={prescriptions.length} tone="default" icon="file" />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <SearchField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('prescriptions.search_ph')}
            onSubmit={onSearch}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('prescriptions.col_rx_id')}</th>
                  <th className="px-4 py-3">{t('prescriptions.col_patient')}</th>
                  <th className="px-4 py-3">{t('prescriptions.col_title')}</th>
                  <th className="px-4 py-3">{t('prescriptions.col_status')}</th>
                  <th className="px-4 py-3">{t('prescriptions.col_created')}</th>
                  <th className="px-4 py-3 text-right">{t('prescriptions.col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prescriptions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      {t('prescriptions.empty')}
                    </td>
                  </tr>
                ) : (
                  prescriptions.map((rx) => {
                    const st = prescriptionStatusLabel(rx.status, t);
                    const items = menuFor(rx);
                    return (
                      <tr key={rx.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold">
                          <a href={`/prescriptions/${rx.id}`} className="text-brand hover:underline">
                            #RX-{rx.id}
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-ink">
                            {rx.first_name} {rx.last_name}
                          </div>
                          <div className="text-xs text-slate-500">ID: #P-{rx.patient_id}</div>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{rx.title || t('prescriptions.default_title')}</td>
                        <td className="px-4 py-3">
                          <StatusBadge variant={st.variant} label={st.label} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(rx.created_at)}</td>
                        <td className="px-4 py-3 text-right">{items.length ? <ActionMenu items={items} /> : null}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pager pager={pager} basePath="/prescriptions" query={query} />
        </div>
      </div>

      <NewPrescriptionModal
        open={rxOpen}
        onClose={() => setRxOpen(false)}
        patients={patients}
        initialPatientId={preselectPatientId}
      />
    </div>
  );
}
