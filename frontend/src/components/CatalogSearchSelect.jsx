import { useEffect, useMemo, useRef, useState } from 'react';

function itemHaystack(item, groupKey) {
  return [item.id, item.name, item[groupKey], item.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function fmtPrice(n) {
  const v = parseFloat(n || 0);
  return Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR') : '0';
}

export function CatalogSearchSelect({
  items = [],
  name,
  value = '',
  onChange,
  placeholder = 'Search…',
  emptyMessage = 'No matching items',
  groupKey = 'used_for',
  showPrice = false,
  priceLabel = 'FCFA',
  required = false,
  inputClassName = 'hms-input'}) {
  const [query, setQuery] = useState(value || '');
  const [selected, setSelected] = useState(value || '');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const v = String(value || '');
    setSelected(v);
    setQuery(v);
  }, [value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (selected && query === selected) return [];
    const list = q ? items.filter((item) => itemHaystack(item, groupKey).includes(q)) : items;
    return list.slice(0, 24);
  }, [items, query, selected, groupKey]);

  const groupedMatches = useMemo(() => {
    const groups = new Map();
    for (const item of matches) {
      const key = String(item[groupKey] || '').trim() || '—';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [matches, groupKey]);

  useEffect(() => {
    function onDoc(ev) {
      if (wrapRef.current && !wrapRef.current.contains(ev.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(item) {
    const label = String(item.name || '').trim();
    setSelected(label);
    setQuery(label);
    setOpen(false);
    onChange?.(label);
  }

  function clear() {
    setSelected('');
    setQuery('');
    setOpen(true);
    onChange?.('');
  }

  return (
    <div ref={wrapRef} className="relative">
      {name ? <input type="hidden" name={name} value={selected} required={required && !selected} /> : null}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
          <i className="fa fa-search text-xs" />
        </span>
        <input
          type="search"
          className={`${inputClassName} pl-9 pr-9`}
          value={query}
          onChange={(ev) => {
            setQuery(ev.target.value);
            setSelected('');
            onChange?.('');
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          required={required && !selected}
        />
        {selected ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-xs font-bold text-slate-400 hover:text-red-600"
            onClick={clear}
            aria-label="Clear"
          >
            ✕
          </button>
        ) : null}
      </div>
      {open && matches.length > 0 ? (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {groupedMatches.map(([group, groupItems]) => (
            <div key={group}>
              {groupedMatches.length > 1 ? (
                <div className="sticky top-0 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {group}
                </div>
              ) : null}
              {groupItems.map((item) => (
                <button
                  key={item.id ?? item.name}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-indigo-50"
                  onClick={() => pick(item)}
                >
                  <div className="font-semibold text-slate-800">{item.name}</div>
                  {showPrice ? (
                    <div className="text-xs text-slate-500">
                      {fmtPrice(item.price)} {priceLabel}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {open && query.trim() && matches.length === 0 ? (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-lg">
          {emptyMessage}
        </div>
      ) : null}
    </div>
  );
}
