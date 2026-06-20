import { categoryLabelKey, groupLineItemsByCategory, lineItemAmount, normalizeLineCategory } from '../../lib/billingPrintGroups';
import { formatMoney } from '../../lib/listUi';

const SKIP_KINDS = new Set(['ipd_refund', 'ipd_deposit', 'ipd_total']);

function fmtUnit(n) {
  return Number(n || 0).toLocaleString('fr-FR');
}

function mapSlipLine(ln) {
  const qty = Number(ln.quantity || 1) || 1;
  const unit = Number(ln.list_unit_price || ln.unit_price || 0) || 0;
  return {
    description: ln.description || ln.name || '',
    unit_price: unit,
    quantity: qty,
    amount: lineItemAmount({
      unit_price: unit,
      quantity: qty,
      patient_due: ln.patient_due,
      amount: ln.amount ?? ln.total,
    }),
    comments: String(ln.comments || '').trim(),
    kind: ln.kind,
    category: normalizeLineCategory(ln.kind || ln.category),
  };
}

function LineTableHead({ t, compact = false }) {
  return (
    <thead>
      <tr className="border-b border-slate-200 text-[9px] font-bold uppercase tracking-wide text-slate-500 print:border-black print:text-black">
        <th className="pb-1.5 pr-2 text-left">{t('receipt.col_description')}</th>
        <th className={`pb-1.5 text-right ${compact ? 'w-14' : 'w-20'}`}>{t('receipt.col_up')}</th>
        <th className={`pb-1.5 text-right ${compact ? 'w-8' : 'w-12'}`}>{t('receipt.col_qty')}</th>
        <th className={`pb-1.5 pl-1 text-right ${compact ? 'w-16' : 'w-20'}`}>{t('receipt.col_total')}</th>
      </tr>
    </thead>
  );
}

export function PaymentGroupedServicesList({
  lines = [],
  t,
  titleKey = 'slip.services',
  serviceFallbackKey = 'slip.service',
  showSectionHeaders = true,
  compact = false,
}) {
  const groups = groupLineItemsByCategory(
    (lines || []).filter((ln) => ln && !SKIP_KINDS.has(ln.kind)).map(mapSlipLine)
  );
  if (!groups.length) return null;

  const showHeaders =
    showSectionHeaders &&
    (groups.length > 1 || !['other', 'service'].includes(groups[0].key));

  return (
    <section className="mt-4">
      <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 print:text-black">
        {t(titleKey)}
      </h2>
      {groups.map((group) => (
        <div key={group.key} className="mb-3 last:mb-0">
          {showHeaders ? (
            <h3 className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 print:text-black">
              {t(categoryLabelKey(group.key))}
            </h3>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-slate-100 print:border-black">
            <table className="w-full border-collapse text-xs">
              <LineTableHead t={t} compact={compact} />
              <tbody className="divide-y divide-slate-100 print:divide-black">
                {group.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-2 py-2 align-top font-medium leading-snug text-slate-800 print:text-black">
                      {it.description || t(serviceFallbackKey)}
                      {it.comments ? (
                        <div className="mt-0.5 text-[10px] font-normal text-slate-500 print:text-black">{it.comments}</div>
                      ) : null}
                    </td>
                    <td className="px-1 py-2 text-right align-top font-mono tabular-nums text-slate-700 print:text-black">
                      {fmtUnit(it.unit_price)}
                    </td>
                    <td className="px-1 py-2 text-right align-top tabular-nums text-slate-700 print:text-black">
                      {it.quantity}
                    </td>
                    <td className="px-2 py-2 text-right align-top font-bold tabular-nums text-slate-900 print:text-black">
                      {formatMoney(it.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-start justify-between gap-3 rounded-b-lg border border-t-0 border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold print:border-black print:bg-white">
            <span className="uppercase tracking-wide text-slate-600 print:text-black">
              {t('receipt.subtotal_section', { section: t(categoryLabelKey(group.key)) })}
            </span>
            <span className="shrink-0 tabular-nums text-slate-900 print:text-black">
              {formatMoney(group.subtotal)}
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}
