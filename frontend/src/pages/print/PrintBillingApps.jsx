import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BillingGroupedLinesTable, BillingGroupedLinesTableHead } from '../../components/print/BillingGroupedLinesTable';
import { PrintPaymentCodeInline, PrintServiceCodesFooter } from '../../components/print/PrintPaymentCode';
import { ReceiptVatPreviewToolbar } from '../../components/print/ReceiptVatPreviewToolbar';
import { PrintToolbar } from '../../components/PrintToolbar';
import { categoryLabelKey } from '../../lib/billingPrintGroups';
import {
  hasPrintServiceCodes} from '../../lib/collectPrintServiceCodes';
import {
  normalizeDoctorPrescription,
  prescriptionItemLabel,
  prescriptionItemTotal} from '../../lib/doctorPrescriptionPrint';
import { formatMoney } from '../../lib/listUi';
import { vatRateStandard } from '../../lib/hmsLocale';
import { amountWordsForLocale, printPaymentMethodLabel } from '../../lib/printPaymentMethod';

function fmt(n) {
  return formatMoney(n);
}

function defaultVatRate() {
  const v = vatRateStandard();
  return v > 0 ? v : 19.25;
}

function calcVatTotals(subtotal, rate = defaultVatRate()) {
  const base = Number(subtotal) || 0;
  const vatAmount = Math.round(base * (rate / 100));
  return {
    vatAmount,
    grandTotal: base + vatAmount,
    vatRateLabel: `${rate}%`};
}

function buildRxLines(lineItems, ipdDetails, receipt, t) {
  if (Array.isArray(lineItems) && lineItems.length) return lineItems;
  if (ipdDetails) {
    return [
      {
        description: t('receipt.ipd_charges'),
        unit_price: Number(ipdDetails.total || 0),
        quantity: 1,
        amount: Number(ipdDetails.total || 0),
        category: 'other'},
    ];
  }
  return [
    {
      description: t('receipt.medical_fees'),
      unit_price: Number(receipt?.total_amount || 0),
      quantity: 1,
      amount: Number(receipt?.total_amount || 0),
      category: 'other'},
  ];
}

export function PrintReceiptApp({
  receipt = {},
  ipdDetails = null,
  sectionCodes = {},
  prescriptionItems = [],
  paymentCode = null,
  lineItems = [],
  amountWords = null,
  grandPaid = null,
  paymentSettled = false,
  hideToolbar = false}) {
  const { t, i18n } = useTranslation('print');
  const payMethodLabel = printPaymentMethodLabel(receipt.payment_method, t);
  const cashierDisplay = receipt.cashier_name || receipt.created_by || '—';
  const grand =
    typeof grandPaid === 'number' && !Number.isNaN(grandPaid)
      ? grandPaid
      : ipdDetails
        ? Number(ipdDetails.balance || 0)
        : Number(receipt.total_amount || 0);
  const subtotal = ipdDetails ? Number(ipdDetails.total || 0) : Number(receipt.total_amount || 0);
  const deposit = ipdDetails ? Number(ipdDetails.deposit || 0) : 0;
  const refund = ipdDetails ? Number(ipdDetails.refund || 0) : 0;
  const rxLines = buildRxLines(lineItems, ipdDetails, receipt, t);
  const showServiceCodes = paymentSettled && hasPrintServiceCodes(sectionCodes);
  const words = amountWordsForLocale(amountWords, grand, fmt, i18n.language);

  return (
    <div className="hms-billing-print min-h-screen bg-slate-100 text-slate-900 print:min-h-0 print:bg-white">
      {!hideToolbar ? (
        <div className="toolbar sticky top-0 z-50 flex gap-2 border-b border-slate-200 bg-white px-4 py-3 print:hidden">
          <button type="button" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white" onClick={() => window.print()}>
            {t('print_receipt')}
          </button>
          <a href="/cashier" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">
            {t('back_cashier_title')}
          </a>
        </div>
      ) : null}

      <div className="mx-auto max-w-[820px] p-4 print:max-w-none print:p-0">
        <div className="hms-billing-print__sheet overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg print:rounded-none print:border-0 print:shadow-none">
          <div className="hms-billing-print__titlebar flex items-end justify-between gap-3 border-b-2 border-slate-900 px-6 pb-2 pt-2 print:gap-1 print:px-0 print:pb-0.5 print:pt-1">
            <div>
              <div className="text-4xl font-black tracking-tight print:text-xl print:leading-none">{t('receipt.title')}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 print:text-[8pt] print:leading-tight print:text-black">{t('receipt.fiscal')}</div>
            </div>
            <div className="text-right text-xs leading-tight print:text-[8.5pt]">
              <div className="font-bold uppercase text-slate-500 print:text-black">{t('receipt.official_no')} {receipt.doc_number}</div>
              <div className="font-bold uppercase text-slate-500 print:text-black">
                {t('receipt.date')} {receipt.created_at ? new Date(receipt.created_at).toLocaleString('fr-FR') : '—'}
              </div>
              <span className="mt-1 inline-block rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white print:mt-0 print:rounded-none print:border print:border-black print:bg-white print:px-1 print:py-0 print:text-[8pt] print:text-black">{t('receipt.paid')}</span>
            </div>
          </div>

          <div className="hms-billing-print__meta px-6 py-2 print:px-0 print:py-0.5">
            <div className="rounded-xl border border-slate-200 p-2 print:rounded-none print:border-0 print:p-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 print:text-[8pt] print:text-black">{t('receipt.bill_to')}</div>
              <div className="text-lg font-extrabold leading-tight print:text-[10pt]">
                {receipt.first_name} {receipt.last_name}
              </div>
              <div className="text-sm leading-tight text-slate-500 print:text-[9pt] print:text-black">
                {t('receipt.patient_id', { id: receipt.patient_id })}
                {receipt.payment_method ? ` · ${payMethodLabel}` : ''}
              </div>
            </div>
          </div>

          <table className="hms-billing-print__items mx-6 mb-1 w-[calc(100%-3rem)] border-collapse text-sm print:mx-0 print:mb-0 print:w-full print:text-[9pt]">
            <thead>
              <BillingGroupedLinesTableHead t={t} headPad="px-1.5 py-1 print:px-0.5 print:py-0" />
            </thead>
            <tbody>
              <BillingGroupedLinesTable lineItems={rxLines} t={t} cellPad="px-1.5 py-1 print:px-0.5 print:py-0" />
            </tbody>
          </table>

          <div className="mx-6 mb-1 flex justify-end print:mx-0 print:mb-0">
            <table className="hms-billing-print__totals min-w-[240px] text-sm print:min-w-[200px] print:text-[9pt]">
              <tbody>
                {ipdDetails ? (
                  <>
                    <tr>
                      <td className="px-2 py-1 text-slate-500 print:px-1 print:py-0.5">{t('receipt.total_charges')}</td>
                      <td className="px-2 py-1 text-right font-bold print:px-1 print:py-0.5">{fmt(subtotal)}</td>
                    </tr>
                    {deposit > 0 ? (
                      <tr>
                        <td className="px-2 py-1 text-slate-500 print:px-1 print:py-0.5">{t('receipt.deposit')}</td>
                        <td className="px-2 py-1 text-right font-bold print:px-1 print:py-0.5">− {fmt(deposit)}</td>
                      </tr>
                    ) : null}
                    {refund > 0 ? (
                      <tr>
                        <td className="px-2 py-1 text-slate-500 print:px-1 print:py-0.5">{t('receipt.deposit_refund')}</td>
                        <td className="px-2 py-1 text-right font-bold print:px-1 print:py-0.5">− {fmt(refund)}</td>
                      </tr>
                    ) : null}
                  </>
                ) : (
                  <tr>
                    <td className="px-2 py-1 text-slate-500 print:px-1 print:py-0.5">{t('receipt.subtotal')}</td>
                    <td className="px-2 py-1 text-right font-bold print:px-1 print:py-0.5">{fmt(subtotal)}</td>
                  </tr>
                )}
                <tr className="bg-slate-900 text-white print:bg-white print:text-black">
                  <td className="px-2 py-1 font-bold print:border print:border-black print:px-1 print:py-0.5">{t('receipt.total_received')}</td>
                  <td className="px-2 py-1 text-right font-extrabold print:border print:border-black print:px-1 print:py-0.5">{fmt(grand)}</td>
                </tr>
                {Number(receipt.cash_tendered) > 0 ? (
                  <>
                    <tr>
                      <td className="px-2 py-1 text-slate-500 print:px-1 print:py-0.5">{t('receipt.cash_tendered')}</td>
                      <td className="px-2 py-1 text-right font-bold print:px-1 print:py-0.5">{fmt(Number(receipt.cash_tendered))}</td>
                    </tr>
                    {Number(receipt.change_amount) > 0 ? (
                      <tr>
                        <td className="px-2 py-1 text-slate-500 print:px-1 print:py-0.5">{t('receipt.change_given')}</td>
                        <td className="px-2 py-1 text-right font-bold print:px-1 print:py-0.5">{fmt(Number(receipt.change_amount))}</td>
                      </tr>
                    ) : null}
                  </>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="hms-billing-print__footer space-y-0.5 border-t border-slate-100 px-6 py-1.5 text-sm leading-tight print:space-y-0 print:border-black print:px-0 print:py-0.5 print:text-[9pt]">
            <div className="print:leading-snug">
              <span className="font-bold text-slate-500 print:text-black">{t('receipt.received_by')}</span> {cashierDisplay}
            </div>
            <div className="print:leading-snug">
              <span className="font-bold text-slate-500 print:text-black">{t('receipt.amount_words')}</span> {words}
            </div>
            <div className="flex w-full flex-col gap-0.5 pt-0.5 print:gap-0 print:pt-0">
              <div className="text-xs print:text-[9pt]">
                <span className="font-bold">{t('receipt.method')}</span> · {payMethodLabel}
              </div>
              {showServiceCodes ? <PrintServiceCodesFooter sectionCodes={sectionCodes} className="w-full" /> : null}
            </div>
          </div>
        </div>
      </div>

      <style>{`@media print { @page { margin: 8mm 10mm; size: auto; } body { background: white !important; } .toolbar { display: none !important; } }`}</style>
    </div>
  );
}

export function PrintInvoiceApp({
  doc = {},
  paymentCode = null,
  lineItems = [],
  sectionCodes = {},
  prescriptionItems = [],
  subtotal = 0,
  vatEnabled = false,
  vatRateLabel = `${defaultVatRate()}%`,
  vatAmount = 0,
  grandTotal = 0,
  paymentSettled = false,
  hideToolbar = false}) {
  const { t } = useTranslation('print');
  const [withVat, setWithVat] = useState(vatEnabled);
  const payMethodLabel = printPaymentMethodLabel(doc.payment_method, t);
  const showServiceCodes = paymentSettled && hasPrintServiceCodes(sectionCodes);
  const baseSubtotal = Number(subtotal) || 0;
  const vatTotals = calcVatTotals(
    baseSubtotal,
    parseFloat(String(vatRateLabel).replace('%', '')) || defaultVatRate()
  );
  const showInvoice = hideToolbar || withVat;

  if (!showInvoice) {
    return (
      <div className="hms-billing-print min-h-screen bg-slate-100 text-slate-900 print:min-h-0 print:bg-white">
        {!hideToolbar ? (
          <ReceiptVatPreviewToolbar withVat={withVat} onVatChange={setWithVat} backLabel={t('back_cashier_title')} />
        ) : null}
        <PrintReceiptApp
          hideToolbar
          receipt={doc}
          paymentCode={paymentCode}
          lineItems={lineItems}
          sectionCodes={sectionCodes}
          prescriptionItems={prescriptionItems}
          grandPaid={baseSubtotal}
          paymentSettled={paymentSettled}
        />
      </div>
    );
  }

  return (
    <div className="hms-billing-print min-h-screen bg-slate-100 text-slate-900 print:min-h-0 print:bg-white">
      {!hideToolbar ? (
        <ReceiptVatPreviewToolbar withVat={withVat} onVatChange={setWithVat} backLabel={t('back_cashier_title')} />
      ) : null}

      <div className="mx-auto max-w-[920px] p-4 print:max-w-none print:p-0">
        <div className="hms-billing-print__sheet overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg print:rounded-none print:border-0 print:shadow-none">
          <div className="hms-billing-print__titlebar mx-5 mt-1 flex items-center justify-between rounded-xl bg-slate-900 px-3 py-1.5 text-white print:mx-0 print:mt-0 print:rounded-none print:border print:border-black print:bg-white print:px-0 print:py-0.5 print:text-black">
            <div className="text-sm font-black uppercase tracking-widest print:text-[10pt]">{t('invoice.title')}</div>
            <div className="font-mono text-sm font-bold print:text-[9pt]">N° {doc.invoice_doc_number || doc.doc_number}</div>
          </div>

          <div className="hms-billing-print__meta grid gap-2 p-4 md:grid-cols-2 print:gap-1 print:p-1 print:px-0">
            <div className="rounded-xl border border-slate-200 p-2 print:rounded-none print:border-0 print:p-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 print:text-[8pt] print:text-black">{t('invoice.bill_to')}</div>
              <div className="text-lg font-extrabold leading-tight print:text-[10pt]">
                {doc.first_name} {doc.last_name}
              </div>
              <div className="text-sm leading-tight text-slate-500 print:text-[9pt] print:text-black">
                {t('invoice.patient_id', { id: doc.patient_id })}
                {doc.payment_method ? ` · ${payMethodLabel}` : ''}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-2 text-sm leading-tight print:rounded-none print:border-0 print:p-0 print:text-[9pt]">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 print:text-[8pt] print:text-black">{t('invoice.details')}</div>
              <div>{t('invoice.date')} {doc.created_at ? new Date(doc.created_at).toLocaleString('fr-FR') : '—'}</div>
              <div>{t('invoice.status')} {String(doc.status || 'paid').toUpperCase()}</div>
            </div>
          </div>

          <div className="hms-billing-print__items mx-5 mb-1 overflow-hidden rounded-xl border border-slate-200 print:mx-0 print:mb-0 print:rounded-none print:border-black">
            <table className="w-full text-sm print:text-[9pt]">
              <thead>
                <BillingGroupedLinesTableHead t={t} headPad="px-1.5 py-1 print:px-0.5 print:py-0" />
              </thead>
              <tbody>
                <BillingGroupedLinesTable lineItems={lineItems || []} t={t} cellPad="px-1.5 py-1 print:px-0.5 print:py-0" />
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 px-5 pb-2 md:grid-cols-2 print:gap-1 print:px-0 print:pb-1">
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2 text-sm leading-snug text-slate-600 print:rounded-none print:border-black print:bg-white print:p-1 print:text-[8pt] print:text-black">
              <span className="text-xs font-bold uppercase print:text-[8pt]">{t('invoice.notes_title')}</span>{' '}
              {t('invoice.notes_body')}
            </div>
            <div className="hms-billing-print__totals overflow-hidden rounded-xl border border-slate-200 print:rounded-none print:border-black">
              <div className="flex justify-between border-b border-slate-100 px-2 py-1 print:border-black print:px-1 print:py-0.5 print:text-[9pt]">
                <span className="text-xs font-bold uppercase text-slate-500 print:text-black">{t('invoice.subtotal')}</span>
                <span className="font-bold">{fmt(subtotal)}</span>
              </div>
              {vatEnabled || withVat || hideToolbar ? (
                <div className="flex justify-between border-b border-slate-100 px-2 py-1 print:border-black print:px-1 print:py-0.5 print:text-[9pt]">
                  <span className="text-xs font-bold uppercase text-slate-500 print:text-black">{t('invoice.vat', { rate: vatRateLabel || vatTotals.vatRateLabel })}</span>
                  <span className="font-bold">{fmt(vatAmount || vatTotals.vatAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between bg-slate-900 px-2 py-1 text-white print:border-t print:border-black print:bg-white print:px-1 print:py-0.5 print:text-[9pt] print:text-black">
                <span className="text-xs font-bold uppercase">{t('invoice.total')}</span>
                <span className="font-extrabold">{fmt(grandTotal || vatTotals.grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="hms-billing-print__footer w-full border-t border-slate-100 px-5 py-1 text-sm leading-tight print:border-black print:px-0 print:py-0.5 print:text-[9pt]">
            <div className="flex w-full flex-col gap-0.5 print:gap-0">
              <div>
                <span className="font-bold">{t('receipt.method')}</span> · {payMethodLabel}
              </div>
              {showServiceCodes ? <PrintServiceCodesFooter sectionCodes={sectionCodes} className="w-full" /> : null}
            </div>
          </div>
        </div>
      </div>

      <style>{`@media print { @page { margin: 8mm 10mm; size: auto; } body { background: white !important; } .toolbar { display: none !important; } }`}</style>
    </div>
  );
}

export function PrintReceiptClassicApp({
  receipt = {},
  paymentCode = null,
  lineItems = [],
  sectionCodes = {},
  prescriptionItems = [],
  grandPaid = 0,
  paymentSettled = false}) {
  const { t } = useTranslation('print');
  const [withVat, setWithVat] = useState(false);
  const lines = Array.isArray(lineItems) ? lineItems : [];
  const svc = lines[0];
  const showServiceCodes = paymentSettled && hasPrintServiceCodes(sectionCodes);
  const baseSubtotal =
    lines.reduce((sum, it) => sum + (Number(it.amount || 0) || 0), 0) || Number(grandPaid) || 0;
  const vatTotals = calcVatTotals(baseSubtotal);

  if (withVat) {
    return (
      <div className="min-h-screen bg-white">
        <ReceiptVatPreviewToolbar withVat={withVat} onVatChange={setWithVat} backLabel={t('back')} />
        <PrintInvoiceApp
          hideToolbar
          doc={receipt}
          paymentCode={paymentCode}
          paymentSettled={paymentSettled}
          lineItems={lines}
          sectionCodes={sectionCodes}
          prescriptionItems={prescriptionItems}
          subtotal={baseSubtotal}
          vatEnabled
          vatRateLabel={vatTotals.vatRateLabel}
          vatAmount={vatTotals.vatAmount}
          grandTotal={vatTotals.grandTotal}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <ReceiptVatPreviewToolbar withVat={withVat} onVatChange={setWithVat} backLabel={t('back')} />
      <div className="flex justify-center p-4">
        <div className="w-full max-w-md border border-slate-300 p-4 shadow-lg print:shadow-none">
          <div className="text-center text-sm font-black tracking-widest">{t('receipt.title')}</div>
          <div className="my-3 rounded-xl border-2 border-dashed border-slate-400 p-3 text-center font-mono font-bold">{receipt.doc_number}</div>
          <ClassicRow k={t('classic.patient')} v={`${receipt.first_name} ${receipt.last_name}`} />
          <ClassicRow k={t('classic.service')} v={svc?.description || '—'} />
          <ClassicRow k={t('classic.patient_due')} v={`${fmt(grandPaid)}`} />
          <ClassicRow k={t('classic.payment_method')} v={printPaymentMethodLabel(receipt.payment_method, t)} />
          {showServiceCodes ? (
            <div className="w-full border-b border-slate-100 py-2">
              <PrintServiceCodesFooter sectionCodes={sectionCodes} className="w-full" />
            </div>
          ) : null}
          <ClassicRow k={t('classic.issued')} v={receipt.created_at ? new Date(receipt.created_at).toLocaleString('fr-FR') : '—'} />
        </div>
      </div>
      <style>{`@media print { .toolbar { display: none; } }`}</style>
    </div>
  );
}

function ClassicRow({ k, v }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm">
      <span className="font-semibold text-slate-600">{k}</span>
      <span className="text-right font-bold">{v}</span>
    </div>
  );
}

export function PrintReceiptPremiumApp({
  receipt = {},
  paymentCode = null,
  lineItems = [],
  sectionCodes = {},
  prescriptionItems = [],
  subtotal = 0,
  grandTotal = 0,
  amountWords = null,
  paymentSettled = false}) {
  const { t } = useTranslation('print');
  const [withVat, setWithVat] = useState(false);
  const lines = lineItems.length
    ? lineItems
    : [{ description: t('premium.medical_services'), amount: grandTotal || subtotal, quantity: 1, unit_price: grandTotal || subtotal }];
  const baseSubtotal = Number(subtotal) || Number(grandTotal) || 0;
  const vatTotals = calcVatTotals(baseSubtotal);

  return (
    <div className="min-h-screen bg-slate-100">
      <ReceiptVatPreviewToolbar withVat={withVat} onVatChange={setWithVat} backLabel={t('back')} />
      {withVat ? (
        <PrintInvoiceApp
          hideToolbar
          doc={receipt}
          paymentCode={paymentCode}
          paymentSettled={paymentSettled}
          lineItems={lines}
          sectionCodes={sectionCodes}
          prescriptionItems={prescriptionItems}
          subtotal={baseSubtotal}
          vatEnabled
          vatRateLabel={vatTotals.vatRateLabel}
          vatAmount={vatTotals.vatAmount}
          grandTotal={vatTotals.grandTotal}
        />
      ) : (
        <PrintReceiptApp
          receipt={receipt}
          paymentCode={paymentCode}
          paymentSettled={paymentSettled}
          lineItems={lines}
          grandPaid={grandTotal || subtotal}
          amountWords={amountWords}
          sectionCodes={sectionCodes}
          prescriptionItems={prescriptionItems}
          hideToolbar
        />
      )}
    </div>
  );
}

function BatchReceiptCover({ bounds, patientLabel, summary = {}, count = 0 }) {
  const { t } = useTranslation('print');
  return (
    <article className="mb-4 break-after-page rounded-2xl border border-slate-200 bg-white p-5 shadow-card print:mb-0 print:rounded-none print:shadow-none">
      <h1 className="text-lg font-extrabold text-ink">{t('batch_receipts.title')}</h1>
      {patientLabel ? (
        <p className="mt-1 text-sm font-semibold text-slate-700">
          {t('batch_receipts.patient')}: {patientLabel}
        </p>
      ) : null}
      {bounds?.label ? (
        <p className="mt-1 text-xs text-slate-500">
          {t('batch_receipts.period')}: {bounds.label}
        </p>
      ) : null}
      <dl className="mt-3 flex flex-wrap gap-4 text-sm">
        <div>
          <dt className="text-[10px] font-bold uppercase text-slate-400">{t('batch_receipts.count')}</dt>
          <dd className="font-extrabold text-ink">{count}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase text-slate-400">{t('batch_receipts.total')}</dt>
          <dd className="font-extrabold text-brand">{fmt(summary.totalCollected || 0)}</dd>
        </div>
      </dl>
    </article>
  );
}

export function PrintReceiptBatchApp({
  receipts = [],
  bounds = null,
  patientLabel = null,
  summary = {},
  count = 0}) {
  const { t } = useTranslation('print');
  const [withVat, setWithVat] = useState(false);
  const items = Array.isArray(receipts) ? receipts : [];

  return (
    <div className="min-h-screen bg-slate-100">
      <ReceiptVatPreviewToolbar withVat={withVat} onVatChange={setWithVat} backLabel={t('back_cashier_title')} />
      <div className="mx-auto max-w-[820px] space-y-0 p-4 print:max-w-none print:p-0">
        <BatchReceiptCover bounds={bounds} patientLabel={patientLabel} summary={summary} count={count || items.length} />
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            {t('batch_receipts.empty')}
          </p>
        ) : (
          items.map((item, idx) => {
            const lines = item.lineItems?.length
              ? item.lineItems
              : [{ description: t('premium.medical_services'), amount: item.grandTotal, quantity: 1, unit_price: item.grandTotal }];
            const baseSubtotal = Number(item.subtotal) || Number(item.grandTotal) || 0;
            const vatTotals = calcVatTotals(baseSubtotal);
            return (
              <div key={item.ticket_code || item.receipt?.id || idx} className="break-after-page print:break-after-page">
                {withVat ? (
                  <PrintInvoiceApp
                    hideToolbar
                    doc={item.receipt}
                    paymentCode={item.paymentCode}
                    paymentSettled={item.paymentSettled}
                    lineItems={lines}
                    sectionCodes={item.sectionCodes}
                    prescriptionItems={item.prescriptionItems}
                    subtotal={baseSubtotal}
                    vatEnabled
                    vatRateLabel={vatTotals.vatRateLabel}
                    vatAmount={vatTotals.vatAmount}
                    grandTotal={vatTotals.grandTotal}
                  />
                ) : (
                  <PrintReceiptApp
                    hideToolbar
                    receipt={item.receipt}
                    paymentCode={item.paymentCode}
                    paymentSettled={item.paymentSettled}
                    lineItems={lines}
                    grandPaid={item.grandTotal}
                    amountWords={item.amountWords}
                    sectionCodes={item.sectionCodes}
                    prescriptionItems={item.prescriptionItems}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
      <style>{`
        @media print {
          @page { margin: 8mm 10mm; size: auto; }
          body { background: white !important; }
          .break-after-page { break-after: page; page-break-after: always; }
        }
      `}</style>
    </div>
  );
}

export function PrintDoctorPrescriptionApp({ data = {}, verifyUrl = null, title }) {
  const { t } = useTranslation('print');
  const rx = normalizeDoctorPrescription(data);
  const activeSections = rx.sections.filter((sec) => sec.items?.length);
  const displayTitle = title || t('prescription.title_default');
  const metaKey = rx.item_count === 1 ? 'prescription.meta' : 'prescription.meta_plural';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 print:bg-white">
      <PrintToolbar
        backHref="/cashier"
        backLabel={t('back_cashier')}
        extra={
          verifyUrl ? (
            <a href={verifyUrl} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">
              {t('prescription.verify')}
            </a>
          ) : null
        }
      />

      <div className="mx-auto max-w-3xl p-4 print:max-w-none print:p-0">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg print:rounded-none print:border-0 print:shadow-none">
          <div className="border-b border-slate-200 px-6 py-4">
            <h1 className="text-lg font-extrabold text-slate-900">{displayTitle}</h1>
            <p className="text-xs text-slate-500">
              {t('prescription.consultation', { id: rx.consultation_id || '—' })} ·{' '}
              {t(metaKey, { date: rx.consult_date_label, count: rx.item_count, total: rx.total_label })}
            </p>
          </div>

          <div className="grid gap-4 px-6 py-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('prescription.patient')}</div>
              <div className="font-extrabold text-slate-900">{rx.patient.name || '—'}</div>
              {rx.patient.phone ? <div className="text-xs text-slate-600">{rx.patient.phone}</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('prescription.doctor')}</div>
              <div className="font-extrabold text-slate-900">{rx.doctor_name}</div>
              {rx.doctor_department ? <div className="text-xs text-slate-600">{rx.doctor_department}</div> : null}
              {rx.doctor_qualification ? <div className="text-xs text-slate-500">{rx.doctor_qualification}</div> : null}
            </div>
          </div>

          {activeSections.length === 0 ? (
            <div className="mx-6 mb-6 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              {t('prescription.empty')}
            </div>
          ) : (
            activeSections.map((sec) => {
              const sectionSubtotal = (sec.items || []).reduce(
                (sum, it) => sum + prescriptionItemTotal(it),
                0
              );
              return (
              <section key={sec.key} className="mx-6 mb-4 overflow-hidden rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-2 text-white">
                  <div className="font-bold">{sec.title}</div>
                  {sec.code ? (
                    <div className="font-mono text-xs tracking-wide opacity-90">{sec.code}</div>
                  ) : null}
                </div>
                <ul className="divide-y divide-slate-100">
                  {sec.items.map((it, i) => (
                    <li key={it.id || i} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900">{prescriptionItemLabel(it)}</div>
                        {Number(it.quantity || 1) > 1 ? (
                          <div className="text-xs text-slate-500">{t('prescription.qty', { n: it.quantity })}</div>
                        ) : null}
                        {it.status ? (
                          <div className="text-[10px] uppercase tracking-wide text-slate-400">{it.status}</div>
                        ) : null}
                      </div>
                      <div className="shrink-0 font-bold tabular-nums text-slate-900">
                        {formatMoney(prescriptionItemTotal(it))}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-slate-700">
                    {t('receipt.subtotal_section', { section: t(categoryLabelKey(sec.key)) })}
                  </span>
                  <span className="font-bold tabular-nums text-slate-900">{formatMoney(sectionSubtotal)}</span>
                </div>
              </section>
              );
            })
          )}

          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 print:text-black">
              {rx.codes.laboratory ? (
                <span>
                  {t('receipt.laboratory')}: <PrintPaymentCodeInline code={rx.codes.laboratory} />
                </span>
              ) : null}
              {rx.codes.radiology ? (
                <span>
                  {t('receipt.radiology')}: <PrintPaymentCodeInline code={rx.codes.radiology} />
                </span>
              ) : null}
              {rx.codes.pharmacy ? (
                <span>
                  {t('receipt.pharmacy')}: <PrintPaymentCodeInline code={rx.codes.pharmacy} />
                </span>
              ) : null}
              {!rx.codes.laboratory && !rx.codes.radiology && !rx.codes.pharmacy ? (
                <span>{t('prescription.codes_after_payment')}</span>
              ) : null}
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('prescription.total')}</div>
              <div className="text-xl font-extrabold text-teal-800">{rx.total_label}</div>
            </div>
          </div>
        </article>
      </div>

      <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } body { background: white !important; } }`}</style>
    </div>
  );
}

export function PrintEmergencyMlcApp({ visit = {}, mlc = {}, user = {} }) {
  const { t } = useTranslation('print');
  const copies = [
    t('mlc.copy_hospital'),
    t('mlc.copy_police'),
    t('mlc.copy_patient'),
  ];
  const mlcSections = [
    ['narrative', mlc.narrative],
    ['examination', mlc.examination],
    ['injuries', mlc.injuries],
    ['provisional_dx', mlc.provisional_dx],
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="toolbar flex justify-center gap-2 p-4 print:hidden">
        <button type="button" className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white" onClick={() => window.print()}>
          {t('mlc.print_btn')}
        </button>
        <a href={`/emergency/visit/${visit.id}`} className="rounded border px-4 py-2 text-sm">
          {t('mlc.back_er')}
        </a>
      </div>
      {copies.map((copyLabel) => (
        <div key={copyLabel} className="break-after-page p-8">
          <div className="mb-2 text-right text-xs font-extrabold uppercase tracking-widest text-red-900">{copyLabel}</div>
          <h1 className="mb-4 text-lg font-extrabold">{t('mlc.title')}</h1>
          <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
            <MlcField k={t('mlc.mlc_number')} v={mlc.mlc_number} />
            <MlcField k={t('mlc.visit_ticket')} v={visit.ticket_number} />
            <MlcField k={t('mlc.patient')} v={`${visit.first_name} ${visit.last_name}`} />
            <MlcField k={t('mlc.case_type')} v={mlc.case_type} />
            <MlcField k={t('mlc.incident_time')} v={mlc.incident_at ? new Date(mlc.incident_at).toLocaleString() : '—'} />
            <MlcField k={t('mlc.incident_place')} v={mlc.incident_place} />
            <MlcField k={t('mlc.police_station')} v={mlc.police_station} />
            <MlcField k={t('mlc.officer')} v={mlc.officer_name} />
          </div>
          {mlcSections.map(([key, val]) => (
            <div key={key} className="mb-3">
              <h3 className="border-b text-sm font-bold">{t(`mlc.${key}`)}</h3>
              <p className="whitespace-pre-wrap text-sm">{val || '—'}</p>
            </div>
          ))}
          {mlc.locked ? (
            <div className="inline-block rotate-[-2deg] border-2 border-red-900 px-4 py-2 font-extrabold text-red-900">
              {t('mlc.locked')} · {mlc.locked_at ? new Date(mlc.locked_at).toLocaleString() : ''}
            </div>
          ) : null}
          <div className="mt-12 grid grid-cols-2 gap-8 border-t pt-4 text-xs">
            <div>{t('mlc.sig_doctor')}</div>
            <div>{t('mlc.sig_officer')}</div>
          </div>
          <div className="mt-4 text-center text-[10px] text-slate-500">
            {t('mlc.prepared_by', { name: `${user.first_name || ''} ${user.last_name || ''}`.trim() })}
          </div>
        </div>
      ))}
      <style>{`@media print { .toolbar { display: none; } .break-after-page { page-break-after: always; } }`}</style>
    </div>
  );
}

function MlcField({ k, v }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase text-slate-500">{k}</div>
      <div className="font-semibold">{v || '—'}</div>
    </div>
  );
}
