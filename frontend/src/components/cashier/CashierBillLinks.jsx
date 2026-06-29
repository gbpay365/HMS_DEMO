import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import { cashierInvoiceUrls } from './CashierInvoiceActions';

function openTab(href) {
  if (!href) return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

/** Blue bill # link — opens payment ticket view (print from that page). */
export function BillNumberLink({ ticketCode, label }) {
  const { t: tOps } = useTranslation('ops');
  const urls = cashierInvoiceUrls(ticketCode);
  const code = String(ticketCode || '').trim();
  if (!code) return '—';
  const text = String(label || code).trim() || code;

  const onClick = (e) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      openTab(urls.ticket);
    }
  };

  return (
    <a
      href={urls.view}
      target="_blank"
      rel="noreferrer"
      className="bills-code-link"
      onClick={onClick}
      title={tOps('cashier_odoo.bills_open_hint', {
        defaultValue: 'View bill — Ctrl+click to open print slip',
      })}
    >
      {text}
    </a>
  );
}

/** View + print menu for paid bills (action column). */
export function BillDocumentActions({ ticketCode, isPaid = false }) {
  const { t: tOps } = useTranslation('ops');
  const { t: tp } = useTranslation('print');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const urls = cashierInvoiceUrls(ticketCode);
  const code = String(ticketCode || '').trim();
  if (!code) return null;

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

  const printItems = isPaid
    ? [
        { key: 'ticket', label: tp('link_ticket'), href: urls.ticket },
        { key: 'receipt', label: tp('link_receipt'), href: urls.receipt },
      ]
    : [
        { key: 'ticket', label: tp('link_ticket'), href: urls.ticket },
        { key: 'view', label: tp('link_payment_detail'), href: urls.view },
      ];

  return (
    <span ref={rootRef} className="bills-doc-actions">
      <button
        type="button"
        className="cs-btn cs-btn-sm bills-doc-view-btn"
        onClick={() => openTab(urls.view)}
      >
        <FaIcon name="eye" />
        {tOps('cashier_odoo.bills_view', { defaultValue: 'View' })}
      </button>
      <span className="bills-doc-print-wrap">
        <button
          type="button"
          className="cs-btn cs-btn-sm bills-doc-print-btn"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
        >
          <FaIcon name="print" />
          {tOps('cashier_odoo.bills_print', { defaultValue: 'Print' })}
          <FaIcon name={`chevron-${open ? 'up' : 'down'}`} />
        </button>
        {open ? (
          <div className="bills-doc-print-menu" role="menu">
            {printItems.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className="bills-doc-print-menu__item"
                onClick={() => {
                  setOpen(false);
                  openTab(item.href);
                }}
              >
                <FaIcon name="print" />
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </span>
    </span>
  );
}
