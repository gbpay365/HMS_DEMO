import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ActionMenu';
import { FlashMessages } from '../components/FlashMessages';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatusBadge } from '../components/StatusBadge';
import { useClientPagination } from '../hooks/useClientPagination';
import {
  isRadRowPrintable,
  openDiagPatientBatchPrint,
  radResultPrintId,
} from '../lib/diagBatchPrint';
import { formatDate } from '../lib/listUi';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';

function examLabel(id) {
  return `#RAD-${String(id).padStart(5, '0')}`;
}

function radStatus(status, revisionPending, t) {
  if (Number(revisionPending) === 1) {
    return { variant: 'warning', label: t('radiologyRegistry.status_revision'), key: 'revision' };
  }
  const s = String(status || '').toLowerCase();
  if (s === 'received' || s === 'done' || s === 'completed') {
    return { variant: 'success', label: t('radiologyRegistry.status_done'), key: 'done' };
  }
  if (s === 'in_progress') {
    return { variant: 'info', label: t('radiologyRegistry.status_in_progress'), key: 'in_progress' };
  }
  if (s === 'pending' || s === 'submitted') {
    return { variant: 'pending', label: t('radiologyRegistry.status_submitted'), key: 'pending' };
  }
  return { variant: 'muted', label: status || t('shared.pending'), key: s || 'pending' };
}

function RadStatCard({ label, value, tone = 'default' }) {
  return (
    <div className={`o_stat_card o_stat_card--${tone}`}>
      <div className="n">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export function RadiologyPageApp({
  results = [],
  radTotal = 0,
  stats = {},
  flash = null,
  error = null,
  canView = true,
}) {
  const { t } = useTranslation('clinical');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [printSelection, setPrintSelection] = useState({ patientId: null, ids: new Set() });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return results;
    return results.filter((row) => {
      const patientName = `${row.p_fn || ''} ${row.p_ln || ''}`.trim();
      const refLabel = row.ref_display || (row.ref_fn ? `Dr. ${row.ref_fn} ${row.ref_ln || ''}` : '');
      const hay = [
        examLabel(row.id),
        row.id,
        row.request_no,
        patientName,
        row.exam_name,
        refLabel,
        row.status,
        row.service_code,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [results, search]);

  const { setPage, pager, rows } = useClientPagination(filtered, {
    pageSize,
    resetKeys: [search, pageSize],
  });

  function togglePrintSelect(row) {
    const rid = radResultPrintId(row);
    const pid = parseInt(String(row.patient_id || ''), 10) || 0;
    if (!rid || !pid || !isRadRowPrintable(row)) return;
    setPrintSelection((prev) => {
      if (prev.patientId && prev.patientId !== pid) {
        return { patientId: pid, ids: new Set([rid]) };
      }
      const next = new Set(prev.ids);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return { patientId: next.size ? pid : null, ids: next };
    });
  }

  function clearPrintSelection() {
    setPrintSelection({ patientId: null, ids: new Set() });
  }

  const selectedCount = printSelection.ids.size;

  return (
    <div className="o_content rad-registry-page">
      <FlashMessages flash={flash} error={error} />

      <div className="o_stat_row rad-stat-row">
        <RadStatCard label={t('radiologyRegistry.kpi_today_open')} value={stats.today_open ?? 0} tone="brand" />
        <RadStatCard label={t('radiologyRegistry.kpi_awaiting')} value={stats.pending_submit ?? 0} tone="warning" />
        <RadStatCard label={t('radiologyRegistry.kpi_in_progress')} value={stats.in_progress ?? 0} tone="info" />
      </div>

      <div className="rad-toolbar">
        <div className="o_searchbar rad-searchbar">
          <SearchField
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder={t('radiologyRegistry.search_results_ph')}
          />
          <span className="rad-toolbar__count">
            {t('radiologyRegistry.total_count', {
              total: radTotal || results.length,
              count: filtered.length,
            })}
          </span>
        </div>
      </div>

      {selectedCount > 0 ? (
        <div className="rad-print-bar">
          <span className="rad-print-bar__label">
            {t('radiologyRegistry.print_selected_count', { count: selectedCount })}
          </span>
          <button
            type="button"
            className="o_btn_primary rad-print-bar__btn"
            onClick={() => {
              openDiagPatientBatchPrint('radiology', printSelection.patientId, {
                print: true,
                ids: [...printSelection.ids],
              });
            }}
          >
            {t('radiologyRegistry.print_selected_btn')}
          </button>
          <button
            type="button"
            className="o_btn_secondary rad-print-bar__btn"
            onClick={() => openDiagPatientBatchPrint('radiology', printSelection.patientId)}
          >
            {t('radiologyRegistry.print_choose_all')}
          </button>
          <button type="button" className="rad-print-bar__clear" onClick={clearPrintSelection}>
            {t('radiologyRegistry.print_clear_selection')}
          </button>
        </div>
      ) : null}

      <div className="rad-table-wrap">
        <table className="o_list_table rad-list-table">
          <thead>
            <tr>
              <th className="rad-col-check" aria-label={t('radiologyRegistry.col_select')} />
              <th>{t('radiologyRegistry.col_exam_id')}</th>
              <th>{t('radiologyRegistry.col_patient')}</th>
              <th>{t('radiologyRegistry.col_exam')}</th>
              <th>{t('radiologyRegistry.col_prescriber')}</th>
              <th>{t('radiologyRegistry.col_date')}</th>
              <th>{t('radiologyRegistry.col_status')}</th>
              <th className="rad-col-action">{t('radiologyRegistry.col_action')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="rad-empty">
                  {t('radiologyRegistry.empty_results')}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const st = radStatus(row.status, row.revision_pending, t);
                const printable = isRadRowPrintable(row);
                const rid = radResultPrintId(row);
                const checked = printable && printSelection.ids.has(rid);
                const refLabel =
                  row.ref_display ||
                  (row.ref_fn ? `Dr. ${row.ref_fn} ${row.ref_ln || ''}` : t('radiologyRegistry.self_referral'));
                const items = [];
                if (canView && rid) {
                  items.push({
                    href: `/radiology/report/${rid}`,
                    label: t('radiologyRegistry.action_report'),
                    icon: '📄',
                  });
                  if (printable) {
                    items.push({
                      label: t('radiologyRegistry.print_copy'),
                      icon: '🖨',
                      onClick: () => {
                        if (window.HmsDiagHandover?.printByApi) {
                          window.HmsDiagHandover.printByApi('radiology', rid);
                          return;
                        }
                        window.open(`/radiology/report/${rid}?print=1`, '_blank');
                      },
                    });
                    if (row.patient_id) {
                      items.push({
                        label: t('radiologyRegistry.print_all_patient'),
                        icon: '📑',
                        onClick: () => openDiagPatientBatchPrint('radiology', row.patient_id),
                      });
                    }
                  }
                }
                return (
                  <tr key={row.id} className={checked ? 'is-selected' : undefined}>
                    <td className="rad-col-check">
                      {printable ? (
                        <input
                          type="checkbox"
                          className="rad-row-check"
                          checked={checked}
                          aria-label={t('radiologyRegistry.select_for_print')}
                          onChange={() => togglePrintSelect(row)}
                        />
                      ) : (
                        <span className="rad-row-check-spacer" aria-hidden="true" />
                      )}
                    </td>
                    <td className="rad-col-id">{examLabel(row.id)}</td>
                    <td>
                      <div className="rad-patient-name">
                        {row.p_fn} {row.p_ln}
                      </div>
                      <div className="rad-patient-meta">ID: #P-{row.patient_id}</div>
                    </td>
                    <td className="rad-col-exam">{row.exam_name || '—'}</td>
                    <td className="rad-col-ref">{refLabel}</td>
                    <td className="rad-col-date">
                      {formatDate(row.scheduled_at || row.appointment_date || row.created_at)}
                    </td>
                    <td>
                      <StatusBadge variant={st.variant} label={st.label} />
                    </td>
                    <td className="rad-col-action">
                      {items.length ? <ActionMenu items={items} /> : <span className="rad-action-empty">—</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pager pager={pager} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
    </div>
  );
}
