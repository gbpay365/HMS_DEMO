import { useTranslation } from 'react-i18next';

/** Screen-only toolbar for React print pages (hidden when printing). */
export function PrintToolbar({ backHref = '/cashier', backLabel, extra = null }) {
  const { t } = useTranslation('print');
  const label = backLabel ?? t('back_cashier');
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 print:hidden">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
        onClick={() => window.print()}
      >
        <span aria-hidden="true">🖨</span>
        {t('print')}
      </button>
      <a
        href={backHref}
        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        {label}
      </a>
      {extra ? <div className="ml-auto text-xs text-slate-500">{extra}</div> : null}
    </div>
  );
}
