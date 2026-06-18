import { useTranslation } from 'react-i18next';
import { hasPrintServiceCodes } from '../../lib/collectPrintServiceCodes';
import { PrintPaymentCodeDeptRow } from './PrintPaymentCode';

const DEPT_ORDER = ['laboratory', 'radiology', 'pharmacy'];

const DEPT_LABEL = {
  laboratory: 'receipt.laboratory',
  radiology: 'receipt.radiology',
  pharmacy: 'receipt.pharmacy'};

export function ServiceCodesPanel({
  sectionCodes = {},
  prescriptionItems = [],
  compact = false,
  hideCodes = false,
  hideHint = false,
  itemsOnly = false,
  className = ''}) {
  const { t } = useTranslation('print');
  const hasCodes = hasPrintServiceCodes(sectionCodes);
  const rxItems = (prescriptionItems || []).filter((it) =>
    ['laboratory', 'radiology', 'pharmacy'].includes(it.item_type)
  );

  if (!hasCodes && !rxItems.length) return null;
  if (hideCodes && !rxItems.length) return null;

  const grouped = { laboratory: [], radiology: [], pharmacy: [] };
  for (const it of rxItems) {
    if (grouped[it.item_type]) grouped[it.item_type].push(it);
  }

  const panelClass = itemsOnly
    ? `text-xs print:text-[9pt] ${className}`.trim()
    : compact
      ? `hms-print-service-codes-panel p-2 text-[10px] print:p-1.5 print:text-[9pt] ${className}`.trim()
      : `hms-print-service-codes-panel text-xs print:p-2 print:text-[9pt] ${className}`.trim();

  return (
    <div className={panelClass}>
      {!hideCodes ? <div className="hms-print-service-codes-panel__title">{t('receipt.service_codes')}</div> : null}
      <div className="space-y-1 print:space-y-0.5">
        {DEPT_ORDER.map((kind) => {
          const code = sectionCodes[kind];
          const items = grouped[kind] || [];
          if (!code && !items.length) return null;
          return (
            <div key={kind}>
              {code && !hideCodes ? <PrintPaymentCodeDeptRow label={t(DEPT_LABEL[kind])} code={code} /> : null}
              {items.length ? (
                <ul
                  className={`ml-1 list-disc space-y-0.5 pl-4 text-slate-700 ${code ? 'mt-1.5' : ''} print:text-black`}
                >
                  {items.map((it, idx) => (
                    <li key={`${kind}-${idx}`} className="print:font-semibold">
                      {it.item_name}
                      {Number(it.quantity || 1) > 1 ? ` × ${it.quantity}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
      {!hideHint ? (
        <div className="mt-2 border-t border-slate-300 pt-1.5 text-xs font-semibold text-slate-700 print:mt-1 print:border-black print:pt-1 print:text-[8.5pt] print:text-black">
          {t('prescription.present_codes_hint')}
        </div>
      ) : null}
    </div>
  );
}
