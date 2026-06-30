import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal';
import { ModalCancelButton } from '../ModalActions';
import { Pager } from '../Pager';
import { SearchField } from '../SearchField';
import { StatCard } from '../StatCard';
import { hasPerm } from '../../lib/listUi';
import { DEFAULT_PAGE_SIZE } from '../../lib/pagination';
import { useClientPagination } from '../../hooks/useClientPagination';
import { NewPrescriptionModal } from '../../modals/NewPrescriptionModal';
import { PharmacyRxBadge, rxStatusStep } from './PharmacyRxBadge';

const KPI_ITEMS = [
  { key: 'today', labelKey: 'pharmacy.rx_kpi_today', tone: 'default', accentColor: '#4b1528', icon: 'calendar' },
  { key: 'new', labelKey: 'pharmacy.rx_kpi_new', tone: 'brand', accentColor: '#2563eb', icon: 'inbox' },
  { key: 'preparing', labelKey: 'pharmacy.rx_kpi_preparing', tone: 'warning', accentColor: '#d97706', icon: 'flask' },
  { key: 'ready', labelKey: 'pharmacy.rx_kpi_ready', tone: 'success', accentColor: '#059669', icon: 'check-circle' },
  { key: 'dispensed', labelKey: 'pharmacy.rx_kpi_dispensed', tone: 'brand', accentColor: '#d4537e', icon: 'medkit' },
];

const WORKFLOW_STEPS = [
  'pharmacy.rx_step_received',
  'pharmacy.rx_step_preparing',
  'pharmacy.rx_step_ready',
  'pharmacy.rx_step_dispensed',
];

const STATUS_FILTERS = [
  { value: 'all', labelKey: 'pharmacy.rx_filter_all' },
  { value: 'rx-new', labelKey: 'pharmacy.rx_status_new' },
  { value: 'rx-preparing', labelKey: 'pharmacy.rx_status_preparing' },
  { value: 'rx-ready', labelKey: 'pharmacy.rx_status_ready' },
  { value: 'rx-dispensed', labelKey: 'pharmacy.rx_status_dispensed' },
  { value: 'rx-out-of-stock', labelKey: 'pharmacy.rx_status_out_of_stock' },
  { value: 'rx-partial', labelKey: 'pharmacy.rx_status_partial' },
];

function RxWorkflowSteps({ current, t }) {
  return (
    <div className="ph-rx-steps">
      {WORKFLOW_STEPS.map((key, idx) => {
        const done = idx < current;
        const active = idx === current;
        return (
          <div key={key} className={`ph-rx-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}>
            <span className="ph-rx-step-dot">{idx + 1}</span>
            <span className="ph-rx-step-label">{t(key)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function PharmacyPrescriptionsPanel({
  prescriptions = [],
  rxStats = {},
  patients = [],
  userPerms = [],
}) {
  const { t } = useTranslation('ops');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [rxOpen, setRxOpen] = useState(false);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const canWrite = hasPerm(userPerms, ['prescription.write', 'pharmacy.write', 'clinical.write', '*']);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prescriptions.filter((rx) => {
      const matchSearch = !q
        || rx.patient?.toLowerCase().includes(q)
        || rx.rxNumber?.toLowerCase().includes(q)
        || rx.patientId?.toLowerCase().includes(q)
        || rx.doctor?.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || rx.workflowStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [prescriptions, search, statusFilter]);

  const { setPage, pager, rows } = useClientPagination(filtered, {
    pageSize,
    resetKeys: [search, statusFilter, pageSize],
  });

  const kpis = KPI_ITEMS;

  const canDispense =
    selected &&
    selected.workflowStatus !== 'rx-dispensed' &&
    selected.workflowStatus !== 'rx-cancelled' &&
    canWrite;

  return (
    <div className="hms-pharmacy-rx-page">
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        {canWrite ? (
          <button type="button" className="pha-btn-primary px-3 py-1.5 text-[11px]" onClick={() => setRxOpen(true)}>
            <i className="fa fa-plus mr-1" aria-hidden="true" />
            {t('pharmacy.rx_new')}
          </button>
        ) : null}
      </div>

      <div className="hms-compact-kpi-grid hms-compact-kpi-grid--5 mb-3">
        {kpis.map((k) => (
          <StatCard
            key={k.key}
            label={t(k.labelKey)}
            value={rxStats[k.key] ?? 0}
            size="dense"
            tone={k.tone}
            accentColor={k.accentColor}
            icon={k.icon}
          />
        ))}
      </div>

      <div className="ph-rx-panel">
        <div className="ph-rx-panel-head">
          <i className="fa fa-file-text-o" aria-hidden="true" />
          {t('pharmacy.rx_queue_title')}
        </div>

        <div className="ph-rx-filter-bar">
          <div className="w-full max-w-[250px] [&_.hms-input]:h-8 [&_.hms-input]:text-xs">
            <SearchField
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              placeholder={t('pharmacy.rx_search_ph')}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(ev) => setStatusFilter(ev.target.value)}
            className="hms-input w-[170px]"
            aria-label={t('pharmacy.rx_filter_status')}
          >
            {STATUS_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
          <span className="ph-rx-count">
            {t('pharmacy.rx_count', { count: filtered.length })}
          </span>
        </div>

        <div className="ph-rx-table-wrap">
          <table className="ph-rx-table">
            <thead>
              <tr>
                <th>{t('pharmacy.col_rx_num')}</th>
                <th>{t('shared.patient')}</th>
                <th>{t('pharmacy.rx_col_doctor')}</th>
                <th>{t('pharmacy.rx_col_drugs')}</th>
                <th>{t('pharmacy.rx_col_time')}</th>
                <th>{t('shared.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-xs text-slate-500">
                    {t('pharmacy.rx_empty')}
                  </td>
                </tr>
              ) : (
                rows.map((rx) => (
                  <tr key={rx.id}>
                    <td>
                      <span className="ph-rx-num">{rx.rxNumber}</span>
                    </td>
                    <td>
                      <div className="ph-rx-patient-cell">
                        <span className="ph-rx-avatar">{rx.initials}</span>
                        <div>
                          <div className="ph-rx-patient-name">{rx.patient}</div>
                          <div className="ph-rx-patient-id">{rx.patientId}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>{rx.doctor}</div>
                      <div className="ph-rx-sub">{rx.department}</div>
                    </td>
                    <td>
                      <div className="ph-rx-drugs" title={rx.drugs?.map((d) => d.drug).join(' · ')}>
                        {rx.drugs?.length
                          ? rx.drugs.map((d) => d.drug).join(' · ')
                          : rx.title || '—'}
                      </div>
                    </td>
                    <td>
                      <span className="ph-rx-sub">{rx.receivedAt}</span>
                    </td>
                    <td>
                      <PharmacyRxBadge status={rx.workflowStatus} t={t} />
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="pha-btn-primary px-3 py-1 text-[11px]"
                        onClick={() => setSelected(rx)}
                      >
                        {t('pharmacy.rx_view')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pager pager={pager} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          selected ? (
            <div className="ph-rx-modal-title">
              <i className="fa fa-file-text-o text-[var(--pha-accent,#d4537e)]" aria-hidden="true" />
              <span>{selected.rxNumber}</span>
              <PharmacyRxBadge status={selected.workflowStatus} t={t} />
            </div>
          ) : ''
        }
        size="lg"
        footer={
          <>
            <ModalCancelButton onClick={() => setSelected(null)} />
            {canDispense ? (
              <form
                method="post"
                action={`/pharmacy/prescriptions/${selected.id}/dispense`}
                className="inline"
              >
                <button type="submit" className="pha-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
                  <i className="fa fa-medkit" aria-hidden="true" />
                  {t('pharmacy.rx_mark_dispensed')}
                </button>
              </form>
            ) : null}
            {selected ? (
              <a href={selected.detailUrl} className="hms-btn-secondary text-sm">
                {t('pharmacy.rx_open_detail')}
              </a>
            ) : null}
          </>
        }
      >
        {selected ? (
          <div className="space-y-4 pt-1">
            <RxWorkflowSteps current={rxStatusStep(selected.workflowStatus)} t={t} />

            <div className="ph-rx-detail-grid">
              <div>
                <div className="ph-rx-detail-label">{t('shared.patient')}</div>
                <div className="ph-rx-detail-value">{selected.patient}</div>
              </div>
              <div>
                <div className="ph-rx-detail-label">{t('pharmacy.rx_patient_id')}</div>
                <div className="ph-rx-detail-value">{selected.patientId}</div>
              </div>
              <div>
                <div className="ph-rx-detail-label">{t('pharmacy.rx_prescribing_doctor')}</div>
                <div className="ph-rx-detail-value">{selected.doctor}</div>
              </div>
              <div>
                <div className="ph-rx-detail-label">{t('pharmacy.rx_department')}</div>
                <div className="ph-rx-detail-value">{selected.department}</div>
              </div>
              <div>
                <div className="ph-rx-detail-label">{t('pharmacy.rx_received_at')}</div>
                <div className="ph-rx-detail-value">{selected.receivedAt}</div>
              </div>
              {selected.title ? (
                <div>
                  <div className="ph-rx-detail-label">{t('pharmacy.col_title')}</div>
                  <div className="ph-rx-detail-value">{selected.title}</div>
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('pharmacy.rx_prescribed_drugs')}
              </div>
              {(selected.drugs?.length ? selected.drugs : [{ drug: selected.title || '—', inStock: true }]).map(
                (d, idx) => (
                  <div
                    key={idx}
                    className={`ph-rx-drug-row ${d.inStock !== false ? 'in-stock' : 'out-stock'}`}
                  >
                    <div>
                      <div className="ph-rx-drug-name">{d.drug}</div>
                      {(d.dosage || d.qty != null) && (
                        <div className="ph-rx-drug-meta">
                          {[d.dosage, d.qty != null ? `${t('pharmacy.col_qty')}: ${d.qty}` : ''].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <span className={`ph-rx-stock-tag ${d.inStock !== false ? 'in-stock' : 'out-stock'}`}>
                      {d.inStock !== false ? t('pharmacy.stock_in') : t('pharmacy.stock_out')}
                    </span>
                  </div>
                )
              )}
            </div>

            {selected.notes ? (
              <div className="ph-rx-notes">
                <i className="fa fa-info-circle mr-1.5" aria-hidden="true" />
                {selected.notes}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <NewPrescriptionModal open={rxOpen} onClose={() => setRxOpen(false)} patients={patients} theme="pharmacy" returnUrl="/pharmacy?view=prescriptions" />
    </div>
  );
}
