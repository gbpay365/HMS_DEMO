import { useMemo, useState } from 'react';
import { fmtCatalogPrice, lineGradient, ORDER_THEMES } from '../lib/lineItemUi';
import { OrderSectionShell } from './OrderSectionShell';

function itemHaystack(item) {
  return [item.id, item.name].filter(Boolean).join(' ').toLowerCase();
}

export function CatalogOrderPicker({
  name,
  catalog = [],
  initialIds = [],
  theme = 'lab',
  iconLetter = 'L',
  title,
  addLabel,
  hint,
  placeholder = 'Search by name…',
  emptyMessage = 'No matching items',
  priceLabel = 'FCFA',
  inputClassName = 'hms-input'}) {
  const th = ORDER_THEMES[theme] || ORDER_THEMES.lab;
  const catalogById = useMemo(() => {
    const m = new Map();
    for (const item of catalog) m.set(String(item.id), item);
    return m;
  }, [catalog]);

  const [orderedIds, setOrderedIds] = useState(() =>
    (initialIds || []).map((id) => String(id)).filter((id) => catalogById.has(id))
  );
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selectedItems = orderedIds.map((id) => catalogById.get(id)).filter(Boolean);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const picked = new Set(orderedIds);
    const pool = catalog.filter((item) => !picked.has(String(item.id)));
    if (!q) return pool.slice(0, 12);
    return pool.filter((item) => itemHaystack(item).includes(q)).slice(0, 12);
  }, [catalog, query, orderedIds]);

  const addItem = (id) => {
    const key = String(id);
    if (!catalogById.has(key) || orderedIds.includes(key)) return;
    setOrderedIds((prev) => [...prev, key]);
    setQuery('');
    setOpen(false);
  };

  const removeAt = (index) => {
    setOrderedIds((prev) => prev.filter((_, i) => i !== index));
  };

  if (!catalog.length) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <OrderSectionShell
      theme={theme}
      iconLetter={iconLetter}
      title={title}
      hint={hint}
      empty={selectedItems.length === 0 ? emptyMessage : null}
    >
      {orderedIds.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {selectedItems.map((item, index) => (
        <div
          key={item.id}
          className={`group flex items-center gap-2.5 rounded-xl border border-slate-100/80 bg-white/90 px-2.5 py-2 shadow-sm transition hover:bg-white hover:shadow-md ${th.rowHover}`}
        >
          <div
            className={`flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-extrabold text-white shadow-md ${lineGradient(index)}`}
          >
            {index + 1}
          </div>
          <span className={`shrink-0 text-base font-bold ${th.dash}`}>—</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{item.name}</div>
            <div className="text-[11px] font-medium text-slate-500">
              {fmtCatalogPrice(item.price)} {priceLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeAt(index)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      ))}

      <div className="relative pt-1">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <i className="fa fa-search text-xs" />
          </span>
          <input
            type="search"
            className={`${inputClassName} pl-9`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            autoComplete="off"
          />
        </div>
        {open && suggestions.length > 0 ? (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {suggestions.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => addItem(item.id)}
              >
                <span className="mt-0.5 font-bold text-slate-400">+</span>
                <span>
                  <span className="font-medium text-slate-800">{item.name}</span>
                  <span className="text-slate-500">
                    {' '}
                    — {fmtCatalogPrice(item.price)} {priceLabel}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {open && query && suggestions.length === 0 ? (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-xs text-slate-500 shadow-lg">
            {emptyMessage}
          </div>
        ) : null}
      </div>

      {addLabel ? (
        <p className="text-center text-[11px] text-slate-500">
          {addLabel}
        </p>
      ) : null}
    </OrderSectionShell>
  );
}
