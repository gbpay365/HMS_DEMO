import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmModal } from '../lib/modalBridge';

const FILE_ACCEPT =
  '.xlsx,.xls,.csv,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/csv';

const DEPT_GROUPS = [
  {
    id: 'pharmacy',
    tab: 'pharmacy',
    icon: 'fa-medkit',
    accent: 'border-emerald-200 bg-emerald-50/60',
    iconBg: 'bg-emerald-100 text-emerald-700',
    actions: [
      {
        kind: 'post',
        action: '/catalog/pharmacy/import-price-list',
        labelKey: 'import_pharmacy',
        descKey: 'import_pharmacy_desc',
        confirmKey: 'import_pharmacy_confirm'},
      {
        kind: 'file',
        action: '/catalog/pharmacy/import-file',
        labelKey: 'import_upload',
        descKey: 'import_upload_desc',
        confirmKey: 'import_pharmacy_file_confirm'},
    ]},
  {
    id: 'laboratory',
    tab: 'laboratory',
    icon: 'fa-flask',
    accent: 'border-violet-200 bg-violet-50/60',
    iconBg: 'bg-violet-100 text-violet-700',
    actions: [
      {
        kind: 'post',
        action: '/catalog/laboratory/import-price-list',
        labelKey: 'import_lab',
        descKey: 'import_lab_desc',
        confirmKey: 'import_lab_confirm'},
      {
        kind: 'file',
        action: '/catalog/laboratory/import-file',
        labelKey: 'import_upload',
        descKey: 'import_upload_desc',
        confirmKey: 'import_lab_file_confirm'},
    ]},
  {
    id: 'radiology',
    tab: 'scans_imaging',
    icon: 'fa-film',
    accent: 'border-sky-200 bg-sky-50/60',
    iconBg: 'bg-sky-100 text-sky-700',
    actions: [
      {
        kind: 'post',
        action: '/catalog/radiology/import-price-list',
        labelKey: 'import_rad',
        descKey: 'import_rad_desc',
        confirmKey: 'import_rad_confirm'},
      {
        kind: 'file',
        action: '/catalog/radiology/import-file',
        labelKey: 'import_upload',
        descKey: 'import_upload_desc',
        confirmKey: 'import_rad_file_confirm'},
      {
        kind: 'post',
        action: '/catalog/scan/import-price-list',
        labelKey: 'import_scan',
        descKey: 'import_scan_desc',
        confirmKey: 'import_scan_confirm'},
      {
        kind: 'post',
        action: '/catalog/scans-imaging/merge',
        labelKey: 'import_merge',
        descKey: 'import_merge_desc',
        confirmKey: 'import_merge_confirm'},
    ]},
];

function groupHasImports(group, access) {
  return (group.actions || []).some((a) => access.canImportAction(a.action));
}

function ActionButton({ action, onRun }) {
  const { t } = useTranslation('ops');
  return (
    <button
      type="button"
      onClick={() => onRun(action)}
      className="flex w-full flex-col rounded-xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md"
    >
      <span className="text-sm font-bold text-ink">{t(`catalog.${action.labelKey}`)}</span>
      <span className="mt-1 text-xs leading-snug text-slate-500">{t(`catalog.${action.descKey}`)}</span>
    </button>
  );
}

function DeptImportCard({ group, access, onRunPost }) {
  const { t } = useTranslation('ops');
  const fileRefs = useRef({});
  const visibleActions = (group.actions || []).filter((a) => access.canImportAction(a.action));
  if (!visibleActions.length) return null;

  const handleRun = (action) => {
    if (action.kind === 'file') {
      fileRefs.current[action.action]?.click();
      return;
    }
    onRunPost(action);
  };

  const handleFile = (action) => async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const ok = await confirmModal({
      title: t(`catalog.${action.labelKey}`),
      message: t(`catalog.${action.confirmKey}`),
      confirmLabel: t('catalog.import_confirm_btn')});
    if (!ok) {
      ev.target.value = '';
      return;
    }
    ev.target.form?.submit();
  };

  const fileActions = visibleActions.filter((a) => a.kind === 'file');

  return (
    <div className={`rounded-2xl border p-4 ${group.accent}`}>
      <div className="mb-3 flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${group.iconBg}`}>
          <i className={`fa ${group.icon}`} aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-extrabold text-ink">{t(`catalog.import_dept_${group.id}`)}</h3>
          <p className="text-xs text-slate-500">{t(`catalog.import_dept_${group.id}_hint`)}</p>
        </div>
      </div>
      <div className={`grid gap-2 ${visibleActions.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {visibleActions.map((action) => (
          <ActionButton key={action.action + action.labelKey} action={action} onRun={handleRun} />
        ))}
      </div>
      {fileActions.map((action) => (
        <form
          key={action.action}
          method="post"
          action={action.action}
          encType="multipart/form-data"
          className="hidden"
        >
          <input
            ref={(el) => {
              fileRefs.current[action.action] = el;
            }}
            type="file"
            name="file"
            accept={FILE_ACCEPT}
            onChange={handleFile(action)}
          />
        </form>
      ))}
    </div>
  );
}

/** Department-aware import hub — Pharmacy, Laboratory, Radiology/Imaging. */
export function CatalogImportPanel({ access, activeCat = '__all' }) {
  const { t } = useTranslation('ops');

  const onRunPost = async (action) => {
    const ok = await confirmModal({
      title: t(`catalog.${action.labelKey}`),
      message: t(`catalog.${action.confirmKey}`),
      confirmLabel: t('catalog.import_confirm_btn')});
    if (!ok) return;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = action.action;
    document.body.appendChild(form);
    form.submit();
  };

  const visibleGroups = DEPT_GROUPS.filter((g) => groupHasImports(g, access)).filter((g) =>
    activeCat === '__all' ? true : g.tab === activeCat
  );

  if (!visibleGroups.length) return null;

  const singleDept = activeCat !== '__all' && visibleGroups.length === 1;

  return (
    <div className={`mb-4 ${singleDept ? '' : 'rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-card'}`}>
      {!singleDept ? (
        <div className="mb-3">
          <h2 className="text-sm font-extrabold text-ink">{t('catalog.import_panel_title')}</h2>
          <p className="text-xs text-slate-500">{t('catalog.import_panel_subtitle')}</p>
        </div>
      ) : (
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t('catalog.import_panel_title')}</p>
      )}
      <div className={`grid gap-3 ${visibleGroups.length > 1 ? 'md:grid-cols-2 lg:grid-cols-3' : ''}`}>
        {visibleGroups.map((group) => (
          <DeptImportCard key={group.id} group={group} access={access} onRunPost={onRunPost} />
        ))}
      </div>
    </div>
  );
}

export { DEPT_GROUPS, FILE_ACCEPT };
