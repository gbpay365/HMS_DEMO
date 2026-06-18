import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function cashierInvoiceUrls(code) {
  const c = encodeURIComponent(code || '');
  return {
    view: `/cashier/print-ticket/${c}`,
    ticket: `/cashier/print-slip/${c}`,
    receipt: `/cashier/print-receipt-classic-by-code/${c}`};
}

function openInNewTab(href) {
  if (!href) return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

export function CashierInvoiceActions({ ticketCode }) {
  const { t } = useTranslation('clinical');
  const { t: tp } = useTranslation('print');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const urls = cashierInvoiceUrls(ticketCode);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const printItems = [
    { key: 'ticket', label: tp('link_ticket'), href: urls.ticket },
    { key: 'receipt', label: tp('link_receipt'), href: urls.receipt },
  ];

  return (
    <span ref={rootRef} className="relative inline-flex items-center justify-end gap-1.5">
      <button
        type="button"
        className="hms-btn-secondary inline-flex px-3 py-1.5 text-xs"
        onClick={() => openInNewTab(urls.view)}
      >
        <i className="fa fa-eye mr-1" aria-hidden="true" />
        {t('cashier.billing_view')}
      </button>
      <span className="relative">
        <button
          type="button"
          className="hms-btn-secondary inline-flex px-3 py-1.5 text-xs"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
        >
          <i className="fa fa-print mr-1" aria-hidden="true" />
          {t('cashier.billing_print')}
          <i className={`fa fa-chevron-${open ? 'up' : 'down'} ml-1 text-[10px] opacity-70`} aria-hidden="true" />
        </button>
        {open ? (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-slate-100 bg-white py-1 shadow-lg"
          >
            {printItems.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-brand/[0.06]"
                onClick={() => {
                  setOpen(false);
                  openInNewTab(item.href);
                }}
              >
                <i className="fa fa-print w-3 text-[10px] text-slate-400" aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </span>
    </span>
  );
}
