import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ActionMenu';
import { FlashMessages } from '../components/FlashMessages';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { StatusBadge } from '../components/StatusBadge';
import { useClientPagination } from '../hooks/useClientPagination';
import {
  isRadRowPrintable,
  openDiagPatientBatchPrint,
  radResultPrintId} from '../lib/diagBatchPrint';
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

export function RadiologyPageApp({
  results = [],
  radTotal = 0,
  stats = {},
  flash = null,
  error = null,
  canView = true}) {
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
    resetKeys: [search, pageSize]});

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
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero
          icon="film"
          title={t('radiologyRegistry.results_title')}
          subtitle={t('radiologyRegistry.results_subtitle')}
        >
          <div className="hms-surface-hero-actions mt-4">
            <a href="/radiology/workflow" className="hms-btn-secondary text-xs">
              <i className="fa fa-columns" aria-hidden="true" />
              {t('radiologyRegistry.workflow_board')}
            </a>
            <a href="/radiology/templates" className="hms-btn-secondary text-xs">
              <i className="fa fa-file-text-o" aria-hidden="true" />
              {t('radiologyRegistry.templates')}
            </a>
            <a href="/radiology/validate" className="hms-btn-primary text-xs">
              <i className="fa fa-qrcode" aria-hidden="true" />
              {t('radiologyRegistry.new_exam')}
            </a>
          </div>
        </SurfaceHero>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard label={t('radiologyRegistry.kpi_today_open')} value={stats.today_open ?? 0} tone="brand" icon="calendar" />
          <StatCard label={t('radiologyRegistry.kpi_awaiting')} value={stats.pending_submit ?? 0} tone="warning" icon="clock-o" />
          <StatCard label={t('radiologyRegistry.kpi_in_progress')} value={stats.in_progress ?? 0} tone="default" icon="spinner" />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchField
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              placeholder={t('radiologyRegistry.search_results_ph')}
            />
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              {t('radiologyRegistry.total_count', {
                total: radTotal || results.length,
                count: filtered.length})}
            </span>
          </div>
        </div>

        {selectedCount > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 shadow-card">
            <span className="text-xs font-bold text-sky-900">
              {t('radiologyRegistry.print_selected_count', { count: selectedCount })}
            </span>
            <button
              type="button"
              className="rounded-full bg-sky-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-800"
              onClick={() => {
                openDiagPatientBatchPrint('radiology', printSelection.patientId, {
                  print: true,
                  ids: [...printSelection.ids]});
              }}
            >
              {t('radiologyRegistry.print_selected_btn')}
            </button>
            <button
              type="button"
              className="rounded-full border border-sky-300 bg-white px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100"
              onClick={() => openDiagPatientBatchPrint('radiology', printSelection.patientId)}
            >
              {t('radiologyRegistry.print_choose_all')}
            </button>
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-sky-700 hover:underline"
              onClick={clearPrintSelection}
            >
              {t('radiologyRegistry.print_clear_selection')}
            </button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3" aria-label={t('radiologyRegistry.col_select')} />
                  <th className="px-4 py-3">{t('radiologyRegistry.col_exam_id')}</th>
                  <th className="px-4 py-3">{t('radiologyRegistry.col_patient')}</th>
                  <th className="px-4 py-3">{t('radiologyRegistry.col_exam')}</th>
                  <th className="px-4 py-3">{t('radiologyRegistry.col_prescriber')}</th>
                  <th className="px-4 py-3">{t('radiologyRegistry.col_date')}</th>
                  <th className="px-4 py-3">{t('radiologyRegistry.col_status')}</th>
                  <th className="px-4 py-3 text-right">{t('radiologyRegistry.col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
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
                        icon: '📄'});
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
                          }});
                        if (row.patient_id) {
                          items.push({
                            label: t('radiologyRegistry.print_all_patient'),
                            icon: '📑',
                            onClick: () => openDiagPatientBatchPrint('radiology', row.patient_id)});
                        }
                      }
                    }
                    return (
                      <tr key={row.id} className={`hover:bg-slate-50/80${checked ? ' bg-sky-50/60' : ''}`}>
                        <td className="px-3 py-3">
                          {printable ? (
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                              checked={checked}
                              aria-label={t('radiologyRegistry.select_for_print')}
                              onChange={() => togglePrintSelect(row)}
                            />
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-bold text-brand">{examLabel(row.id)}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-ink">
                            {row.p_fn} {row.p_ln}
                          </div>
                          <div className="text-xs text-slate-500">ID: #P-{row.patient_id}</div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-ink">{row.exam_name || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{refLabel}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {formatDate(row.scheduled_at || row.appointment_date || row.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge variant={st.variant} label={st.label} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {items.length ? <ActionMenu items={items} /> : null}
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
      </div>
    </div>
  );
}
