import { useTranslation } from 'react-i18next';

export function ReceiptVatPreviewToolbar({ withVat, onVatChange, backHref = '/cashier', backLabel }) {
  const { t } = useTranslation('print');
  const tabClass = (active) =>
    `rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
      active ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
    }`;

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 print:hidden">
      <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist" aria-label={t('receipt_vat_tabs_aria')}>
        <button type="button" role="tab" aria-selected={!withVat} className={tabClass(!withVat)} onClick={() => onVatChange(false)}>
          {t('receipt_tab_standard')}
        </button>
        <button type="button" role="tab" aria-selected={withVat} className={tabClass(withVat)} onClick={() => onVatChange(true)}>
          {t('receipt_tab_vat')}
        </button>
      </span>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
        onClick={() => window.print()}
      >
        <i className="fa fa-print text-xs" aria-hidden="true" />
        {withVat ? t('print_invoice') : t('print_receipt')}
      </button>
      <a
        href={backHref}
        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        {backLabel ?? t('back')}
      </a>
    </div>
  );
}
