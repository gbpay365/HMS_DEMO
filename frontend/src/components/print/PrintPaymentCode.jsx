import { useTranslation } from 'react-i18next';
import { collectPrintServiceCodes } from '../../lib/collectPrintServiceCodes';

/** Bold, high-contrast codes for screen preview and thermal/A4 print. */
const CODE_BASE =
  'hms-print-pay-code font-mono font-black text-black [-webkit-print-color-adjust:exact] [print-color-adjust:exact]';

export function PrintPaymentCodeHero({ code, label, hint, className = '', compact = false, large = false }) {
  if (!code) return null;
  const valueClass = compact
    ? 'hms-print-pay-code-hero__value hms-print-pay-code-hero__value--compact'
    : large
      ? 'hms-print-pay-code-hero__value hms-print-pay-code-hero__value--large'
      : 'hms-print-pay-code-hero__value';
  return (
    <div className={`hms-print-pay-code-hero w-full ${className}`.trim()}>
      {label ? <div className="hms-print-pay-code-label">{label}</div> : null}
      <div className={`${CODE_BASE} block w-full text-center ${valueClass}`}>{code}</div>
      {hint ? <div className="hms-print-pay-code-hint">{hint}</div> : null}
    </div>
  );
}

/** Hero box listing all department service codes (LAB / RAD / PHA), one per line. */
export function PrintServiceCodesHero({
  sectionCodes = {},
  label,
  hint,
  className = '',
  compact = false,
  showDeptLabels = true}) {
  const { t } = useTranslation('print');
  const entries = collectPrintServiceCodes(sectionCodes);
  if (!entries.length) return null;

  const valueClass = compact
    ? 'hms-print-pay-code-hero__value hms-print-pay-code-hero__value--compact'
    : 'hms-print-pay-code-hero__value';

  const deptLabel = {
    laboratory: t('receipt.laboratory'),
    radiology: t('receipt.radiology'),
    pharmacy: t('receipt.pharmacy')};

  return (
    <div className={`hms-print-pay-code-hero ${className}`.trim()}>
      {label ? <div className="hms-print-pay-code-label">{label}</div> : null}
      <div className="hms-print-service-codes-hero__stack">
        {entries.map((entry, index) => (
          <div
            key={entry.kind}
            className={
              index > 0
                ? 'hms-print-service-codes-hero__row hms-print-service-codes-hero__row--sep border-t border-black/25 pt-3 print:border-black'
                : 'hms-print-service-codes-hero__row'
            }
          >
            {showDeptLabels && entries.length > 1 ? (
              <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-700 print:text-black">
                {deptLabel[entry.kind]}
              </div>
            ) : null}
            <div className={`${CODE_BASE} ${valueClass}`}>{entry.code}</div>
          </div>
        ))}
      </div>
      {hint ? <div className="hms-print-pay-code-hint">{hint}</div> : null}
    </div>
  );
}

export function PrintServiceCodesFooter({ sectionCodes = {}, className = '' }) {
  const { t } = useTranslation('print');
  const entries = collectPrintServiceCodes(sectionCodes);
  if (!entries.length) return null;

  const deptLabel = {
    laboratory: t('receipt.laboratory'),
    radiology: t('receipt.radiology'),
    pharmacy: t('receipt.pharmacy')};

  return (
    <div
      className={`hms-billing-print__service-codes w-full rounded-lg border-2 border-dashed border-slate-400 bg-slate-50 px-2 py-1 print:rounded-none print:border-black print:bg-white print:px-1 print:py-0.5 ${className}`.trim()}
    >
      <div className="hms-billing-print__service-codes-heading mb-0.5 text-xs font-bold uppercase tracking-wide text-slate-700 print:mb-0 print:text-[8pt] print:text-black">
        {t('receipt.service_code_heading')}
      </div>
      <div className="divide-y divide-slate-300 print:divide-black">
        {entries.map((entry) => (
          <div key={entry.kind} className="hms-billing-print__service-code-row py-1 first:pt-0 last:pb-0 print:py-0.5">
            <div className="text-[10px] font-bold uppercase leading-none tracking-wide text-slate-500 print:text-[7.5pt] print:text-black">
              {deptLabel[entry.kind]}
            </div>
            <div className="hms-billing-print__service-code-value mt-0.5 w-full break-all font-mono text-lg font-black leading-none tracking-wide text-black print:mt-0 print:text-[11pt]">
              {entry.code}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrintPaymentCodeInline({ code, className = '' }) {
  if (!code) return null;
  return <span className={`${CODE_BASE} hms-print-pay-code-inline ${className}`.trim()}>{code}</span>;
}

export function PrintServiceCodesInline({ sectionCodes = {}, className = '' }) {
  const entries = collectPrintServiceCodes(sectionCodes);
  if (!entries.length) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`.trim()}>
      {entries.map((entry, index) => (
        <span key={entry.kind} className="inline-flex items-center gap-x-2">
          {index > 0 ? <span className="font-black text-black" aria-hidden="true">|</span> : null}
          <PrintPaymentCodeInline code={entry.code} />
        </span>
      ))}
    </span>
  );
}

export function PrintPaymentCodeDeptRow({ label, code }) {
  if (!code) return null;
  return (
    <div className="hms-print-pay-code-dept">
      <span className="hms-print-pay-code-dept__label">{label}</span>
      <span className={`${CODE_BASE} hms-print-pay-code-dept__value`}>{code}</span>
    </div>
  );
}
