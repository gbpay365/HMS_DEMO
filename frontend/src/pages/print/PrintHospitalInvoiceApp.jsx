import { useTranslation } from 'react-i18next';
import { BillingGroupedLinesTable, BillingGroupedLinesTableHead } from '../../components/print/BillingGroupedLinesTable';
import { PrintServiceCodesFooter } from '../../components/print/PrintPaymentCode';
import { PrintToolbar } from '../../components/PrintToolbar';
import { hasPrintServiceCodes } from '../../lib/collectPrintServiceCodes';
import { formatMoney } from '../../lib/hmsLocale';
import { printPaymentMethodLabel } from '../../lib/printPaymentMethod';

function fmt(n) {
  return formatMoney(n);
}

function formatDisplayDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusMeta(status, t) {
  const key = String(status || 'pending').toLowerCase();
  const map = {
    paid: { label: t('hospital_invoice.status_paid'), tone: 'paid' },
    pending: { label: t('hospital_invoice.status_pending'), tone: 'pending' },
    partial: { label: t('hospital_invoice.status_partial'), tone: 'partial' },
    overdue: { label: t('hospital_invoice.status_overdue'), tone: 'overdue' },
    refunded: { label: t('hospital_invoice.status_refunded'), tone: 'refunded' },
    canceled: { label: t('hospital_invoice.status_canceled'), tone: 'canceled' },
  };
  return map[key] || map.pending;
}

function MetaField({ label, value }) {
  return (
    <div className="hi-meta-field">
      <dt className="hi-meta-label">{label}</dt>
      <dd className="hi-meta-value">{value || '—'}</dd>
    </div>
  );
}

export function PrintHospitalInvoiceApp({
  brand = {},
  invoice = {},
  lineItems = [],
  sectionCodes = {},
  paymentSettled = false,
  paymentCode = null,
}) {
  const { t } = useTranslation('print');
  const status = statusMeta(invoice.payment_status, t);
  const payMethodLabel = printPaymentMethodLabel(invoice.payment_method, t);
  const showServiceCodes = paymentSettled && hasPrintServiceCodes(sectionCodes);
  const patientName = `${invoice.first_name || ''} ${invoice.last_name || ''}`.trim() || '—';
  const billTo = invoice.bill_to_name || patientName;
  const displayRef = invoice.invoice_number || '—';

  return (
    <div className="hi-root min-h-screen bg-slate-100 text-slate-900 print:min-h-0 print:bg-white">
      <PrintToolbar backHref="/cashier?page=invoices" backLabel={t('back_cashier_title')} />

      <div className="hi-page mx-auto max-w-[920px] p-4 print:max-w-none print:p-0">
        <article className="hi-sheet relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl print:rounded-none print:border-0 print:shadow-none">
          {status.tone === 'paid' ? (
            <div className="hi-watermark pointer-events-none absolute inset-0 flex items-center justify-center print:flex" aria-hidden="true">
              <span className="hi-watermark-text">{t('hospital_invoice.paid_stamp')}</span>
            </div>
          ) : null}

          <header className="hi-header border-b border-teal-100 bg-gradient-to-r from-teal-950 via-teal-900 to-emerald-900 px-8 py-6 text-white print:border-black print:bg-white print:px-0 print:py-4 print:text-black">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex min-w-0 items-start gap-4">
                {brand.logoPath ? (
                  <img
                    src={brand.logoPath}
                    alt=""
                    className="hi-logo h-14 w-auto shrink-0 rounded-lg bg-white/95 p-1.5 print:h-12 print:bg-white print:p-1"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="text-xl font-black uppercase tracking-wide print:text-lg">
                    {brand.facilityName || brand.orgName || 'Hospital'}
                  </div>
                  {brand.legalName && brand.legalName !== brand.facilityName ? (
                    <div className="mt-0.5 text-xs font-semibold text-teal-100/90 print:text-slate-600">
                      {brand.legalName}
                    </div>
                  ) : null}
                  {brand.tagline ? (
                    <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-teal-100/80 print:text-slate-500">
                      {brand.tagline}
                    </div>
                  ) : null}
                  {brand.websiteUrl ? (
                    <div className="mt-1 text-xs text-teal-100/75 print:text-slate-500">{brand.websiteUrl}</div>
                  ) : null}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-teal-100/80 print:text-slate-500">
                  {t('hospital_invoice.doc_title')}
                </div>
                <div className={`hi-status hi-status--${status.tone} mt-2 inline-flex`}>{status.label}</div>
              </div>
            </div>
          </header>

          <div className="hi-ref-bar flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-8 py-3 print:border-black print:bg-white print:px-0">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 print:text-black">
                {t('hospital_invoice.invoice_no')}
              </div>
              <div className="font-mono text-lg font-black tracking-wide text-slate-900 print:text-base">{displayRef}</div>
            </div>
            {invoice.ticket_code && invoice.ticket_code !== displayRef ? (
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 print:text-black">
                  {t('hospital_invoice.payment_ref')}
                </div>
                <div className="font-mono text-sm font-bold text-slate-800">{invoice.ticket_code}</div>
              </div>
            ) : null}
          </div>

          <div className="hi-meta-grid grid gap-4 border-b border-slate-200 px-8 py-5 md:grid-cols-2 print:gap-3 print:border-black print:px-0 print:py-3">
            <section className="hi-panel rounded-xl border border-slate-200 bg-white p-4 print:rounded-none print:border-black print:p-2">
              <h2 className="hi-panel-title">{t('hospital_invoice.bill_to')}</h2>
              <div className="mt-2 text-lg font-extrabold leading-tight text-slate-900 print:text-base">{billTo}</div>
              {invoice.bill_to_company ? (
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 print:text-xs">
                  {invoice.bill_to_company}
                </div>
              ) : null}
              <dl className="mt-3 grid gap-2 text-sm print:gap-1 print:text-xs">
                <MetaField label={t('hospital_invoice.patient')} value={patientName} />
                {invoice.patient_code ? (
                  <MetaField label={t('hospital_invoice.mrn')} value={invoice.patient_code} />
                ) : invoice.patient_id ? (
                  <MetaField label={t('hospital_invoice.patient_id')} value={`P-${String(invoice.patient_id).padStart(5, '0')}`} />
                ) : null}
                {invoice.phone ? <MetaField label={t('hospital_invoice.phone')} value={invoice.phone} /> : null}
                {invoice.gender ? <MetaField label={t('hospital_invoice.gender')} value={invoice.gender} /> : null}
                {invoice.bill_to_contact ? (
                  <MetaField label={t('hospital_invoice.contact')} value={invoice.bill_to_contact} />
                ) : null}
              </dl>
            </section>

            <section className="hi-panel rounded-xl border border-slate-200 bg-white p-4 print:rounded-none print:border-black print:p-2">
              <h2 className="hi-panel-title">{t('hospital_invoice.invoice_details')}</h2>
              <dl className="mt-3 grid gap-2 text-sm print:gap-1 print:text-xs">
                <MetaField label={t('hospital_invoice.issue_date')} value={formatDisplayDate(invoice.issue_date)} />
                <MetaField label={t('hospital_invoice.due_date')} value={formatDisplayDate(invoice.due_date)} />
                {invoice.paid_at ? (
                  <MetaField label={t('hospital_invoice.paid_date')} value={formatDisplayDate(invoice.paid_at)} />
                ) : null}
                {invoice.payment_method ? (
                  <MetaField label={t('hospital_invoice.payment_method')} value={payMethodLabel} />
                ) : null}
                {invoice.cashier_name ? (
                  <MetaField label={t('hospital_invoice.issued_by')} value={invoice.cashier_name} />
                ) : null}
                {invoice.receipt_number ? (
                  <MetaField label={t('hospital_invoice.receipt_no')} value={invoice.receipt_number} />
                ) : null}
              </dl>
            </section>
          </div>

          <div className="hi-table-wrap mx-8 my-5 overflow-hidden rounded-xl border border-slate-200 print:mx-0 print:my-3 print:rounded-none print:border-black">
            <table className="hi-table w-full border-collapse text-sm print:text-[9pt]">
              <thead>
                <BillingGroupedLinesTableHead t={t} headPad="px-3 py-2.5 print:px-1 print:py-1" />
              </thead>
              <tbody>
                <BillingGroupedLinesTable
                  lineItems={lineItems}
                  t={t}
                  cellPad="px-3 py-2 print:px-1 print:py-0.5"
                />
              </tbody>
            </table>
          </div>

          <div className="hi-bottom grid gap-4 px-8 pb-6 md:grid-cols-[1fr_280px] print:gap-3 print:px-0 print:pb-4">
            <section className="hi-notes rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 print:rounded-none print:border-black print:bg-white print:p-2 print:text-[9pt] print:text-black">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500 print:text-black">
                {t('hospital_invoice.terms_title')}
              </div>
              <p className="mt-2">
                {invoice.notes || t('hospital_invoice.terms_default')}
              </p>
              {status.tone === 'pending' || status.tone === 'overdue' ? (
                <p className="mt-2 font-semibold text-amber-900 print:text-black">
                  {t('hospital_invoice.pay_at_cashier')}
                </p>
              ) : null}
              {paymentCode ? (
                <p className="mt-2">
                  <span className="font-bold">{t('hospital_invoice.service_code')}:</span>{' '}
                  <span className="font-mono font-bold">{paymentCode}</span>
                </p>
              ) : null}
            </section>

            <section className="hi-totals overflow-hidden rounded-xl border border-slate-200 print:rounded-none print:border-black">
              <div className="flex justify-between border-b border-slate-100 px-4 py-2.5 text-sm print:px-2 print:py-1 print:text-[9pt]">
                <span className="font-semibold text-slate-600 print:text-black">{t('invoice.subtotal')}</span>
                <span className="font-bold tabular-nums">{fmt(invoice.subtotal)}</span>
              </div>
              {invoice.discountAmount > 0 ? (
                <div className="flex justify-between border-b border-slate-100 px-4 py-2.5 text-sm print:px-2 print:py-1 print:text-[9pt]">
                  <span className="font-semibold text-slate-600 print:text-black">
                    {t('hospital_invoice.discount', { pct: invoice.discountPct })}
                  </span>
                  <span className="font-bold tabular-nums text-emerald-700 print:text-black">
                    − {fmt(invoice.discountAmount)}
                  </span>
                </div>
              ) : null}
              {invoice.taxAmount > 0 ? (
                <div className="flex justify-between border-b border-slate-100 px-4 py-2.5 text-sm print:px-2 print:py-1 print:text-[9pt]">
                  <span className="font-semibold text-slate-600 print:text-black">
                    {t('invoice.vat', { rate: `${invoice.taxPct}%` })}
                  </span>
                  <span className="font-bold tabular-nums">{fmt(invoice.taxAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between bg-teal-950 px-4 py-3 text-white print:border-t print:border-black print:bg-white print:px-2 print:py-2 print:text-black">
                <span className="text-sm font-bold uppercase tracking-wide">{t('invoice.total')}</span>
                <span className="text-lg font-black tabular-nums print:text-base">{fmt(invoice.grandTotal)}</span>
              </div>
              {invoice.amountPaid > 0 ? (
                <div className="flex justify-between border-t border-slate-100 px-4 py-2.5 text-sm print:px-2 print:py-1 print:text-[9pt]">
                  <span className="font-semibold text-slate-600 print:text-black">{t('hospital_invoice.amount_paid')}</span>
                  <span className="font-bold tabular-nums text-emerald-700 print:text-black">
                    {fmt(invoice.amountPaid)}
                  </span>
                </div>
              ) : null}
              {invoice.balanceDue > 0.005 ? (
                <div className="flex justify-between border-t-2 border-amber-400 bg-amber-50 px-4 py-2.5 text-sm print:border-black print:bg-white print:px-2 print:py-1 print:text-[9pt]">
                  <span className="font-bold text-amber-950 print:text-black">{t('hospital_invoice.balance_due')}</span>
                  <span className="font-black tabular-nums text-amber-950 print:text-black">
                    {fmt(invoice.balanceDue)}
                  </span>
                </div>
              ) : null}
            </section>
          </div>

          {showServiceCodes ? (
            <div className="hi-service-codes border-t border-slate-200 px-8 py-4 print:border-black print:px-0 print:py-2">
              <PrintServiceCodesFooter sectionCodes={sectionCodes} className="w-full" />
            </div>
          ) : null}

          <footer className="hi-footer border-t border-slate-200 bg-slate-50 px-8 py-4 text-center text-xs leading-relaxed text-slate-500 print:border-black print:bg-white print:px-0 print:py-2 print:text-[8pt] print:text-black">
            <div className="font-semibold text-slate-700 print:text-black">{t('hospital_invoice.thank_you')}</div>
            <div className="mt-1">
              {brand.facilityName || brand.orgName}
              {brand.websiteUrl ? ` · ${brand.websiteUrl}` : ''}
            </div>
          </footer>
        </article>
      </div>

      <style>{`
        .hi-meta-field { display: grid; grid-template-columns: 7rem 1fr; gap: 0.5rem; align-items: baseline; }
        .hi-meta-label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin: 0; }
        .hi-meta-value { margin: 0; font-weight: 600; color: #0f172a; word-break: break-word; }
        .hi-panel-title { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; color: #0f766e; }
        .hi-status { border-radius: 9999px; padding: 0.35rem 0.85rem; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
        .hi-status--paid { background: #dcfce7; color: #166534; }
        .hi-status--pending { background: #fef3c7; color: #92400e; }
        .hi-status--partial { background: #dbeafe; color: #1d4ed8; }
        .hi-status--overdue { background: #fee2e2; color: #b91c1c; }
        .hi-status--refunded { background: #f1f5f9; color: #475569; }
        .hi-status--canceled { background: #f1f5f9; color: #64748b; }
        .hi-watermark { z-index: 0; opacity: 0.06; }
        .hi-watermark-text {
          transform: rotate(-24deg);
          font-size: 5.5rem;
          font-weight: 900;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #059669;
          border: 6px solid #059669;
          padding: 0.5rem 1.5rem;
        }
        .hi-table .hms-billing-print__thead th { background: #0f766e !important; color: #fff !important; }
        @media print {
          .hi-table .hms-billing-print__thead th { background: #fff !important; color: #000 !important; border: 1px solid #000; }
          .hi-status { border: 1px solid #000; background: #fff !important; color: #000 !important; }
          .hi-watermark { opacity: 0.08; }
          @page { size: A4 portrait; margin: 10mm 12mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
