import { useTranslation } from 'react-i18next';

const VARIANTS = {
  ticket:
    'inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-900 hover:bg-violet-100',
  receipt:
    'inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-900 hover:bg-teal-100',
  rx: 'inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-900 hover:bg-rose-100'};

export function CashierPrintLink({ href, label, variant = 'ticket', title }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={VARIANTS[variant] || VARIANTS.ticket}
      title={title || label}
    >
      <i className="fa fa-print text-[10px] opacity-80" aria-hidden="true" />
      {label}
    </a>
  );
}

export function CashierPrintGroup({ ticketCode, status = 'pending' }) {
  const { t } = useTranslation('print');
  const code = ticketCode || '';
  const st = String(status || '').toLowerCase();

  if (st === 'paid') {
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1">
        <CashierPrintLink href={`/cashier/print-slip/${encodeURIComponent(code)}`} label={t('link_ticket')} variant="ticket" />
        <CashierPrintLink
          href={`/cashier/print-receipt-classic-by-code/${encodeURIComponent(code)}`}
          label={t('link_receipt')}
          variant="receipt"
        />
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <CashierPrintLink href={`/cashier/print-slip/${encodeURIComponent(code)}`} label={t('link_ticket')} variant="ticket" />
      <CashierPrintLink
        href={`/cashier/print-ticket/${encodeURIComponent(code)}`}
        label={t('link_payment_detail')}
        variant="ticket"
        title={t('link_payment_detail_title')}
      />
    </span>
  );
}
