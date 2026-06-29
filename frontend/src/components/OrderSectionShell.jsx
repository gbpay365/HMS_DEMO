import { ORDER_THEMES } from '../lib/lineItemUi';

export function OrderSectionShell({
  theme = 'plan',
  iconLetter = 'P',
  title,
  addLabel,
  onAdd,
  hint,
  children,
  empty}) {
  const th = ORDER_THEMES[theme] || ORDER_THEMES.plan;

  if (th.variant === 'mocdoc') {
    return (
      <div className="consult-mocdoc-lines consult-mocdoc-order">
        <div className="consult-mocdoc-lines-head">
          <div className="consult-mocdoc-lines-head-title">
            <span className="consult-mocdoc-lines-head-badge">{iconLetter}</span>
            {title}
          </div>
          {onAdd ? (
            <button type="button" onClick={onAdd} className="consult-mocdoc-lines-add">
              <span className="text-base leading-none">+</span>
              {addLabel}
            </button>
          ) : null}
        </div>
        <div className="consult-mocdoc-lines-body">
          {children}
          {empty ? <p className="py-3 text-center text-sm text-slate-500">{empty}</p> : null}
        </div>
        {hint ? (
          <div className="consult-mocdoc-lines-footer">
            <i className="fa fa-lightbulb-o mr-1" />
            {hint}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`hms-surface-card overflow-hidden rounded-2xl border bg-white shadow-sm ${th.shell}`}>
      <div className={`flex items-center justify-between border-b px-4 py-2.5 ${th.header}`}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br text-[10px] font-extrabold text-white shadow-sm ${th.icon}`}
          >
            {iconLetter}
          </span>
          {title}
        </div>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className={`inline-flex items-center gap-1 rounded-full border bg-white px-3 py-1 text-xs font-bold shadow-sm transition ${th.addBtn}`}
          >
            <span className="text-base leading-none">+</span>
            {addLabel}
          </button>
        ) : null}
      </div>

      <div className="space-y-2 p-3 md:p-4">
        {children}
        {empty ? <p className="py-4 text-center text-sm text-slate-500">{empty}</p> : null}
      </div>

      {hint ? (
        <div className={`border-t px-4 py-2 text-[11px] ${th.footer}`}>
          <i className="fa fa-lightbulb-o mr-1" />
          {hint}
        </div>
      ) : null}
    </div>
  );
}
