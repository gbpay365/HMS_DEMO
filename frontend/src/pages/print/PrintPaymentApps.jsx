import { useTranslation } from 'react-i18next';
import { PaymentGroupedServicesList } from '../../components/print/PaymentGroupedServicesList';
import { PrintPaymentCodeHero, PrintServiceCodesHero } from '../../components/print/PrintPaymentCode';
import { ServiceCodesPanel } from '../../components/print/ServiceCodesPanel';
import {
  formatPrintServiceCodesSummary,
  hasPrintServiceCodes,
  hasServiceCodesPanelContent} from '../../lib/collectPrintServiceCodes';
import { printPaymentMethodLabel } from '../../lib/printPaymentMethod';
import { PrintToolbar } from '../../components/PrintToolbar';
import { formatDate, formatMoney } from '../../lib/listUi';

function SlipValidityBlock({ validityInfo }) {
  const { t } = useTranslation('print');

  if (!validityInfo) {
    return (
      <p className="mt-4 text-center text-sm font-bold text-slate-700">
        {t('slip.valid_default')}
      </p>
    );
  }

  if (validityInfo.pending_payment) {
    return (
      <div className="mt-4 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-950">
        {t('slip.present_cashier')}
        {validityInfo.rule_label ? <div className="mt-1.5 text-sm font-bold">{validityInfo.rule_label}</div> : null}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-sm font-bold text-slate-900">
      {validityInfo.expires_display ? (
        <div>{t('slip.valid_until', { date: validityInfo.expires_display })}</div>
      ) : null}
      {validityInfo.remaining_uses != null ? (
        <div className="mt-1.5">{t('slip.remaining_uses', { count: validityInfo.remaining_uses })}</div>
      ) : null}
      {validityInfo.rule_label ? <div className="mt-1.5">{validityInfo.rule_label}</div> : null}
    </div>
  );
}

export function PrintPaymentSlipApp({
  ticket = {},
  facilityName = 'ZAIZENS',
  validityInfo = null,
  sectionCodes = {},
  prescriptionItems = [],
  paymentSettled = false,
  paymentCode = null}) {
  const { t } = useTranslation('print');
  const lines = ticket.lines || [];
  const patientName = `${ticket.first_name || ''} ${ticket.last_name || ''}`.trim() || '—';
  const lineTotal = lines.reduce((sum, ln) => {
    const patientDue = Number(ln.patient_due);
    if (Number.isFinite(patientDue) && patientDue >= 0) return sum + patientDue;
    return sum + Number(ln.list_unit_price || ln.unit_price || 0) * Number(ln.quantity || 1);
  }, 0);
  const total = Number(ticket.total_amount || 0) || lineTotal;
  const displayCode = String(paymentCode || ticket.ticket_code || '').trim();
  const serviceCodesSummary = formatPrintServiceCodesSummary(sectionCodes);
  const showServicePanel = paymentSettled && hasServiceCodesPanelContent(sectionCodes, prescriptionItems);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 print:bg-white">
      <PrintToolbar backHref="/cashier" extra={serviceCodesSummary || null} />

      <div className="mx-auto max-w-md p-4 print:max-w-none print:p-0">
        <article className="overflow-hidden rounded-2xl border-2 border-dashed border-teal-500 bg-white shadow-lg print:rounded-none print:border-2 print:border-black print:shadow-none">
          <header className="border-b border-slate-200 px-6 py-4 text-center print:border-black">
            <div className="text-base font-extrabold uppercase leading-tight tracking-wide text-slate-900">
              {facilityName}
            </div>
            <h1 className="mt-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-900">{t('slip.title')}</h1>
          </header>

          <div className="px-6 py-5">
            {displayCode ? (
              <PrintPaymentCodeHero code={displayCode} large className="mb-5" />
            ) : !paymentSettled ? (
              <div className="mb-5 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-4 text-center text-sm font-semibold text-amber-950 print:border-black print:bg-white print:text-black">
                {t('slip.code_after_payment')}
              </div>
            ) : null}

            {paymentSettled && hasPrintServiceCodes(sectionCodes) ? (
              <PrintServiceCodesHero
                sectionCodes={sectionCodes}
                label={t('receipt.service_codes')}
                hint={t('prescription.present_codes_hint')}
                className="mb-5"
              />
            ) : null}

            <dl className="space-y-2 border-b border-slate-200 pb-4 text-sm print:border-black">
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 font-bold uppercase text-[10px] tracking-wide text-slate-500 print:text-black">{t('slip.patient')}</dt>
                <dd className="text-right font-semibold text-slate-900">{patientName}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 font-bold uppercase text-[10px] tracking-wide text-slate-500 print:text-black">{t('slip.amount')}</dt>
                <dd className="text-right text-lg font-extrabold text-teal-800 print:text-black">{formatMoney(total)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 font-bold uppercase text-[10px] tracking-wide text-slate-500 print:text-black">{t('slip.issued')}</dt>
                <dd className="text-right font-medium text-slate-700 print:text-black">{formatDate(ticket.created_at)}</dd>
              </div>
            </dl>

            <PaymentGroupedServicesList lines={lines} t={t} />

            {showServicePanel ? (
              <ServiceCodesPanel sectionCodes={sectionCodes} prescriptionItems={prescriptionItems} compact className="mt-4" />
            ) : null}

            <SlipValidityBlock validityInfo={validityInfo} />
          </div>
        </article>
      </div>

      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 8mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

export function PrintPaymentTicketApp({
  ticket = {},
  facilityName = 'ZAIZENS',
  sectionCodes = {},
  prescriptionItems = [],
  paymentSettled = false,
  paymentCode = null}) {
  const { t } = useTranslation('print');
  const lines = ticket.lines || [];
  const refundLine = lines.find((l) => l?.kind === 'ipd_refund');
  const patientName = `${ticket.first_name || ''} ${ticket.last_name || ''}`.trim() || '—';
  const displayCode = String(paymentCode || ticket.ticket_code || '').trim();
  const serviceCodesSummary = formatPrintServiceCodesSummary(sectionCodes);
  const showServicePanel = paymentSettled && hasServiceCodesPanelContent(sectionCodes, prescriptionItems);

  return (
    <div className="min-h-screen bg-slate-100 font-mono text-sm text-slate-900 print:bg-white">
      <PrintToolbar backHref="/cashier" extra={serviceCodesSummary || null} />

      <div className="mx-auto max-w-xs p-4 print:p-0">
        <article className="rounded-xl border-2 border-slate-800 bg-white p-4 shadow-lg print:rounded-none print:border-black print:shadow-none">
          <div className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 print:text-black">
            {facilityName}
          </div>
          <div className="mt-1 text-center text-xs font-bold uppercase">{t('ticket.title')}</div>
          {displayCode ? (
            <PrintPaymentCodeHero code={displayCode} large className="my-3" />
          ) : !paymentSettled ? (
            <div className="my-3 border-2 border-dashed border-amber-500 bg-amber-50 py-3 text-center text-xs font-semibold text-amber-950">
              {t('slip.code_after_payment')}
            </div>
          ) : null}
          {paymentSettled && hasPrintServiceCodes(sectionCodes) ? (
            <PrintServiceCodesHero
              sectionCodes={sectionCodes}
              label={t('receipt.service_codes')}
              compact
              showDeptLabels={false}
              className="my-3"
            />
          ) : null}
          <div className="space-y-0.5 text-xs">
            <div>{t('ticket.date')} {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : '—'}</div>
            <div>{t('ticket.cashier')} #{ticket.created_by || '—'}</div>
          </div>
          <hr className="my-3 border-dashed border-slate-400 print:border-black" />
          <div className="text-xs font-bold uppercase">{t('ticket.patient')}</div>
          <div>{patientName}</div>
          <div>{t('ticket.tel')} {ticket.phone || 'N/A'}</div>
          <hr className="my-3 border-dashed border-slate-400 print:border-black" />
          <PaymentGroupedServicesList
            lines={lines.filter((l) => l?.kind !== 'ipd_refund')}
            t={t}
            titleKey="ticket.services"
            serviceFallbackKey="ticket.service"
            compact
          />
          <div className="mt-3 text-right text-sm font-extrabold">{t('ticket.total')} {formatMoney(ticket.total_amount || 0)}</div>
          {refundLine && Number(refundLine.unit_price || 0) < 0 ? (
            <div className="text-right text-sm font-extrabold">
              {t('ticket.refund')} {formatMoney(Math.abs(Number(refundLine.unit_price || 0)))}
            </div>
          ) : null}
          <hr className="my-3 border-dashed border-slate-400 print:border-black" />
          {showServicePanel ? (
            <ServiceCodesPanel sectionCodes={sectionCodes} prescriptionItems={prescriptionItems} compact className="mb-3" />
          ) : null}
          <p className="text-center text-[10px] leading-relaxed text-slate-600 print:text-black">
            {t('ticket.footer')}
            <br />
            {t('ticket.thanks')}
          </p>
        </article>
      </div>

      <style>{`@media print { @page { size: 80mm auto; margin: 4mm; } body { background: white !important; } }`}</style>
    </div>
  );
}

function BatchSummaryCover({ bounds = {}, summary = {}, count = 0, facilityName = 'ZAIZENS' }) {
  const { t } = useTranslation('print');
  const methods = Object.entries(summary.byPaymentMethod || {});
  const kinds = Object.entries(summary.byLineKind || {});

  return (
    <article className="mb-6 break-after-page overflow-hidden rounded-2xl border-2 border-slate-800 bg-white p-6 shadow-lg print:mb-0 print:rounded-none print:shadow-none">
      <header className="border-b border-slate-200 pb-4 text-center print:border-black">
        <div className="text-base font-extrabold uppercase">{facilityName}</div>
        <h1 className="mt-2 text-sm font-extrabold uppercase tracking-wide">{t('batch_slips.title')}</h1>
        <p className="mt-1 text-xs font-semibold text-slate-600 print:text-black">
          {bounds.label || bounds.start || '—'}
          {bounds.period ? ` · ${bounds.period}` : ''}
        </p>
      </header>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="font-bold uppercase text-[10px] text-slate-500">{t('batch_slips.tickets')}</dt>
          <dd className="font-extrabold">{count}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="font-bold uppercase text-[10px] text-slate-500">{t('batch_slips.collected')}</dt>
          <dd className="font-extrabold text-teal-800 print:text-black">{formatMoney(summary.totalCollected || 0)}</dd>
        </div>
      </dl>
      {methods.length ? (
        <div className="mt-4 border-t border-slate-200 pt-3 print:border-black">
          <div className="text-[10px] font-bold uppercase text-slate-500">{t('batch_slips.by_method')}</div>
          <ul className="mt-2 space-y-1 text-xs">
            {methods.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-2">
                <span className="capitalize">{k}</span>
                <span className="font-bold">{formatMoney(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {kinds.length ? (
        <div className="mt-4 border-t border-slate-200 pt-3 print:border-black">
          <div className="text-[10px] font-bold uppercase text-slate-500">{t('batch_slips.by_category')}</div>
          <ul className="mt-2 space-y-1 text-xs">
            {kinds.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-2">
                <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                <span className="font-bold">{formatMoney(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function PrintPaymentSlipBatchApp({
  bounds = {},
  summary = {},
  slips = [],
  count = 0,
  format = 'slip',
  facilityName = 'ZAIZENS'}) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 print:bg-white">
      <PrintToolbar backHref="/cashier" extra={`${count} slips`} />

      <div className="mx-auto max-w-md space-y-0 p-4 print:max-w-none print:p-0">
        <BatchSummaryCover bounds={bounds} summary={summary} count={count} facilityName={facilityName} />

        {(slips || []).map((item, idx) => {
          const ticket = item.ticket || {};
          ticket.lines = ticket.lines || [];
          const Slip = format === 'receipt' ? PrintPaymentTicketApp : PrintPaymentSlipApp;
          return (
            <div key={ticket.id || ticket.ticket_code || idx} className="break-after-page print:break-after-page">
              <Slip
                ticket={ticket}
                facilityName={item.facilityName || facilityName}
                validityInfo={item.validityInfo}
                sectionCodes={item.sectionCodes || {}}
                prescriptionItems={item.prescriptionItems || []}
                paymentSettled={item.paymentSettled !== false}
                paymentCode={item.paymentCode}
              />
            </div>
          );
        })}

        {count === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No paid tickets for this period.
          </p>
        ) : null}
      </div>

      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 8mm; }
          body { background: white !important; }
          .break-after-page { break-after: page; page-break-after: always; }
        }
      `}</style>
    </div>
  );
}
