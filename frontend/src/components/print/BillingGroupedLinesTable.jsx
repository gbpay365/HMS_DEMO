import { categoryLabelKey, flattenGroupedLineRows, groupLineItemsByCategory } from '../../lib/billingPrintGroups';

function fmt(n) {
  return Number(n || 0).toLocaleString('fr-FR');
}

export function BillingGroupedLinesTable({
  lineItems = [],
  t,
  cellPad = 'px-2 py-2',
  headPad = 'px-2 py-2',
  showSubtotals = true}) {
  const groups = groupLineItemsByCategory(lineItems);
  const rows = flattenGroupedLineRows(groups, { subtotals: showSubtotals && groups.length > 0 });

  return (
    <>
      {rows.map((row, idx) => {
        if (row.type === 'subtotal') {
          const section = t(categoryLabelKey(row.groupKey));
          return (
            <tr key={`sub-${row.groupKey}-${idx}`} className="border-t border-slate-200 bg-slate-50 print:bg-white print:text-black">
              <td colSpan={4} className={`${cellPad} text-right text-xs font-bold uppercase leading-none tracking-wide text-slate-600 print:py-0`}>
                {t('receipt.subtotal_section', { section })}
              </td>
              <td className={`${cellPad} text-right font-mono text-sm font-bold leading-none text-slate-900 print:py-0`}>
                {fmt(row.subtotal)} XAF
              </td>
            </tr>
          );
        }
        const it = row.item;
        return (
          <tr key={`item-${idx}-${row.rowNo}`} className="border-t border-slate-100">
            <td className={`${cellPad} text-center`}>{row.rowNo}</td>
            <td className={cellPad}>
              {it.description}
              {it.department ? <div className="text-[11px] text-slate-500">{it.department}</div> : null}
            </td>
            <td className={`${cellPad} text-right font-mono`}>{fmt(it.unit_price)}</td>
            <td className={`${cellPad} text-right`}>{it.quantity}</td>
            <td className={`${cellPad} text-right font-mono`}>{fmt(it.amount)}</td>
          </tr>
        );
      })}
    </>
  );
}

export function BillingGroupedLinesTableHead({ t, headPad = 'px-2 py-2' }) {
  return (
    <tr className="hms-billing-print__thead bg-slate-900 text-left text-[10px] font-bold uppercase tracking-wide text-white print:bg-white print:text-black">
      <th className={`w-10 ${headPad} text-center`}>{t('receipt.col_no')}</th>
      <th className={headPad}>{t('receipt.col_description')}</th>
      <th className={`w-28 ${headPad} text-right`}>{t('receipt.col_up')}</th>
      <th className={`w-16 ${headPad} text-right`}>{t('receipt.col_qty')}</th>
      <th className={`w-28 ${headPad} text-right`}>{t('receipt.col_total')}</th>
    </tr>
  );
}
