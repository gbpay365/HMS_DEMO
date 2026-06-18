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
  isLabRowPrintable,
  labResultPrintId,
  openDiagPatientBatchPrint} from '../lib/diagBatchPrint';
import { formatDate, labStatus, labStatusLabel, postForm } from '../lib/listUi';
import { confirmModal, promptModal } from '../lib/modalBridge';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';

function testLabel(id) {
  return `#LAB-${String(id).padStart(4, '0')}`;
}

export function LaboratoryPageApp({
  results = [],
  labTotal = 0,
  flash = null,
  error = null,
  canView = true,
  canRecall = false}) {
  const { t } = useTranslation('ops');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [printSelection, setPrintSelection] = useState({ patientId: null, ids: new Set() });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return results;
    return results.filter((row) => {
      const patientName = `${row.p_fn || ''} ${row.p_ln || ''}`.trim();
      const refLabel = row.ref_display || (row.ref_fn ? `Dr. ${row.ref_fn} ${row.ref_ln || ''}` : '');
      const hay = [testLabel(row.id), row.id, patientName, row.test_name, refLabel, row.status].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [results, search]);

  const { setPage, pager, rows } = useClientPagination(filtered, {
    pageSize,
    resetKeys: [search, pageSize]});

  function togglePrintSelect(row) {
    const rid = labResultPrintId(row);
    const pid = parseInt(String(row.patient_id || ''), 10) || 0;
    if (!rid || !pid || !isLabRowPrintable(row)) return;
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
  const revisionCount = useMemo(
    () => results.filter((r) => Number(r.revision_pending) === 1).length,
    [results]
  );

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="flask" title={t('laboratory.title')} subtitle={t('laboratory.subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            <a href="/lims" className="hms-btn-secondary text-xs">
              <i className="fa fa-flask" aria-hidden="true" />
              {t('laboratory.lims_hub')}
            </a>
            <a href="/lab/templates" className="hms-btn-secondary text-xs">
              <i className="fa fa-file-text-o" aria-hidden="true" />
              {t('laboratory.templates')}
            </a>
            <a href="/laboratory/validate" className="hms-btn-primary text-xs">
              <i className="fa fa-qrcode" aria-hidden="true" />
              {t('laboratory.new_test')}
            </a>
          </div>
        </SurfaceHero>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard label={t('laboratory.kpi_total')} value={labTotal || results.length} tone="brand" icon="flask" />
          <StatCard label={t('laboratory.kpi_showing')} value={filtered.length} tone="default" icon="search" />
          <StatCard label={t('laboratory.kpi_revision')} value={revisionCount} tone="warning" icon="undo" />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchField value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder={t('laboratory.search_ph')} />
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              {t('laboratory.total_count', { total: labTotal || results.length, count: filtered.length })}
            </span>
          </div>
        </div>

        {selectedCount > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 shadow-card">
            <span className="text-xs font-bold text-violet-900">
              {t('laboratory.print_selected_count', { count: selectedCount })}
            </span>
            <button
              type="button"
              className="rounded-full bg-violet-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-800"
              onClick={() => {
                openDiagPatientBatchPrint('laboratory', printSelection.patientId, {
                  print: true,
                  ids: [...printSelection.ids]});
              }}
            >
              {t('laboratory.print_selected_btn')}
            </button>
            <button
              type="button"
              className="rounded-full border border-violet-300 bg-white px-3 py-1.5 text-xs font-bold text-violet-800 hover:bg-violet-100"
              onClick={() => openDiagPatientBatchPrint('laboratory', printSelection.patientId)}
            >
              {t('laboratory.print_choose_all')}
            </button>
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-violet-700 hover:underline"
              onClick={clearPrintSelection}
            >
              {t('laboratory.print_clear_selection')}
            </button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3" aria-label={t('laboratory.col_select')} />
                  <th className="px-4 py-3">{t('laboratory.col_test_id')}</th>
                  <th className="px-4 py-3">{t('laboratory.col_patient')}</th>
                  <th className="px-4 py-3">{t('laboratory.col_test_name')}</th>
                  <th className="px-4 py-3">{t('laboratory.col_referred')}</th>
                  <th className="px-4 py-3">{t('laboratory.col_date')}</th>
                  <th className="px-4 py-3">{t('laboratory.col_status')}</th>
                  <th className="px-4 py-3 text-right">{t('laboratory.col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      {t('laboratory.empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const st = labStatus(row.status, row.revision_pending);
                    const printable = isLabRowPrintable(row);
                    const rid = labResultPrintId(row);
                    const checked = printable && printSelection.ids.has(rid);
                    const refLabel =
                      row.ref_display ||
                      (row.referred_by_id && row.ref_fn ? `Dr. ${row.ref_fn} ${row.ref_ln || ''}` : t('laboratory.self_referral'));
                    const items = [];
                    if (canView) {
                      items.push({
                        href: `/laboratory/report/${row.id}`,
                        label: t('laboratory.view_test'),
                        icon: '📄'});
                      if (printable) {
                        items.push({
                          label: t('laboratory.print_copy'),
                          icon: '🖨',
                          onClick: () => {
                            if (window.HmsDiagHandover && window.HmsDiagHandover.printByApi) {
                              window.HmsDiagHandover.printByApi('laboratory', row.id);
                              return;
                            }
                            window.open(`/laboratory/report/${row.id}?print=1`, '_blank');
                          }});
                        if (row.patient_id) {
                          items.push({
                            label: t('laboratory.print_all_patient'),
                            icon: '📑',
                            onClick: () => openDiagPatientBatchPrint('laboratory', row.patient_id)});
                        }
                      }
                    }
                    if (canRecall) {
                      items.push({
                        label: t('laboratory.return_correction'),
                        icon: '↩',
                        onClick: async () => {
                          const note = await promptModal({
                            title: t('laboratory.return_correction'),
                            message: t('laboratory.recall_prompt'),
                            multiline: true,
                            confirmLabel: t('laboratory.return_correction')});
                          if (note === null) return;
                          const ok = await confirmModal({
                            title: t('laboratory.return_correction'),
                            message: t('laboratory.recall_confirm'),
                            confirmLabel: t('laboratory.return_correction'),
                            tone: 'danger'});
                          if (ok) postForm(`/laboratory/registry-recall/${row.id}`, { reason: note || '' });
                        }});
                    }
                    return (
                      <tr key={row.id} className={`hover:bg-slate-50/80${checked ? ' bg-violet-50/60' : ''}`}>
                        <td className="px-3 py-3">
                          {printable ? (
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                              checked={checked}
                              aria-label={t('laboratory.select_for_print', { test: row.test_name })}
                              onChange={() => togglePrintSelect(row)}
                            />
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-bold text-brand">{testLabel(row.id)}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-ink">
                            {row.p_fn} {row.p_ln}
                          </div>
                          <div className="text-xs text-slate-500">ID: #P-{row.patient_id}</div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-ink">{row.test_name}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{refLabel}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(row.appointment_date)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge variant={st.variant} label={labStatusLabel(t, row.status)} />
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
