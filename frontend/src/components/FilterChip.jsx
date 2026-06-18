/** Brand-aligned tab / filter chip — matches catalog & hms-chip pattern. */
export function FilterChip({ active, onClick, children, count, className = '' }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
        active
          ? 'bg-brand text-white ring-brand'
          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
      } ${className}`.trim()}
    >
      {children}
      {count != null ? (
        <span
          className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
            active ? 'bg-white/20' : count > 0 ? 'bg-brand text-white' : 'bg-slate-200 text-slate-600'
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
