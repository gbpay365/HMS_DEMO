import { categoryLabelKey, groupLineItemsByCategory, normalizeLineCategory } from '../../lib/billingPrintGroups';
import { formatMoney } from '../../lib/listUi';

const SKIP_KINDS = new Set(['ipd_refund', 'ipd_deposit', 'ipd_total']);

function mapSlipLine(ln) {
  const qty = Number(ln.quantity || 1) || 1;
  const unit = Number(ln.unit_price || 0) || 0;
  return {
    description: ln.description || ln.name || '',
    unit_price: unit,
    quantity: qty,
    amount: Number(ln.amount || 0) || unit * qty,
    kind: ln.kind,
    category: normalizeLineCategory(ln.kind || ln.category)};
}

export function PaymentGroupedServicesList({
  lines = [],
  t,
  titleKey = 'slip.services',
  serviceFallbackKey = 'slip.service',
  showSectionHeaders = true}) {
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
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 print:divide-black print:border-black">
            {group.items.map((it, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 font-medium leading-snug text-slate-800 print:text-black">
                  {it.description || t(serviceFallbackKey)}
                  {Number(it.quantity || 1) > 1 ? ` × ${it.quantity}` : ''}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-slate-900 print:text-black">
                  {formatMoney(it.amount)}
                </span>
              </li>
            ))}
          </ul>
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
