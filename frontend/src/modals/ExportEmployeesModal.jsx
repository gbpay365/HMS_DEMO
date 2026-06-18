import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { HmsButton } from '../components/HmsButton';
import { ModalCancelButton } from '../components/ModalActions';

function buildExportUrl(path, columns, search) {
  const params = new URLSearchParams();
  params.set('cols', columns.join(','));
  if (search && String(search).trim()) params.set('q', String(search).trim());
  return `${path}?${params.toString()}`;
}

export function ExportEmployeesModal({
  open,
  onClose,
  search = '',
  exportColumns = [],
  defaultColumns = []}) {
  const { t } = useTranslation('ops');
  const columnDefs = useMemo(
    () => (exportColumns.length ? exportColumns : []),
    [exportColumns]
  );
  const fallbackKeys = useMemo(
    () => (defaultColumns.length ? defaultColumns : columnDefs.map((c) => c.key)),
    [defaultColumns, columnDefs]
  );

  const [selected, setSelected] = useState(() => new Set(fallbackKeys));

  useEffect(() => {
    if (open) setSelected(new Set(fallbackKeys));
  }, [open, fallbackKeys]);

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return next;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(columnDefs.map((c) => c.key)));
  const clearToDefault = () => setSelected(new Set(fallbackKeys));

  const cols = [...selected];
  const canExport = cols.length > 0;

  const exportExcel = () => {
    if (!canExport) return;
    window.location.href = buildExportUrl('/employees/export/xlsx', cols, search);
    onClose?.();
  };

  const exportPdf = () => {
    if (!canExport) return;
    window.open(buildExportUrl('/employees/export/print', cols, search), '_blank', 'noopener,noreferrer');
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('employees.export_title')}
      subtitle={t('employees.export_subtitle')}
      size="md"
      footer={
        <>
          <ModalCancelButton onClick={onClose} label={t('employees.export_cancel')} />
          <HmsButton type="button" variant="secondary" disabled={!canExport} onClick={exportPdf} icon="file-pdf-o">
            {t('employees.export_pdf')}
          </HmsButton>
          <HmsButton type="button" variant="primary" disabled={!canExport} onClick={exportExcel} icon="file-excel-o">
            {t('employees.export_excel')}
          </HmsButton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t('employees.export_scope_hint')}</p>

        <div className="flex flex-wrap gap-2">
          <HmsButton type="button" variant="secondary" size="sm" onClick={selectAll}>
            {t('employees.export_select_all')}
          </HmsButton>
          <HmsButton type="button" variant="secondary" size="sm" onClick={clearToDefault}>
            {t('employees.export_reset')}
          </HmsButton>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {columnDefs.map((col) => (
            <label
              key={col.key}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                checked={selected.has(col.key)}
                onChange={() => toggle(col.key)}
              />
              <span>{col.label}</span>
            </label>
          ))}
        </div>

        {search.trim() ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t('employees.export_filtered', { q: search.trim() })}
          </p>
        ) : (
          <p className="text-xs text-slate-500">{t('employees.export_all_rows')}</p>
        )}
      </div>
    </Modal>
  );
}
