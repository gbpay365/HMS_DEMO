import { useMemo, useState } from 'react';
import { priceSuffixLabel } from '../lib/hmsLocale';

function itemHaystack(item) {
  return [item.id, item.name].filter(Boolean).join(' ').toLowerCase();
}

function fmtPrice(n) {
  const v = parseFloat(n || 0);
  return Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR') : '0';
}

export function CatalogMultiPicker({
  name,
  catalog = [],
  initialIds = [],
  placeholder = 'Search…',
  emptyMessage = 'No matching items',
  priceLabel = priceSuffixLabel(),
  inputClassName = 'hms-input'}) {
  const initialSet = useMemo(
    () => new Set((initialIds || []).map((id) => String(id))),
    [initialIds]
  );
  const [selected, setSelected] = useState(() => new Set(initialSet));
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 40);
    return catalog.filter((item) => itemHaystack(item).includes(q)).slice(0, 40);
  }, [catalog, query]);

  const selectedItems = useMemo(
    () => catalog.filter((item) => selected.has(String(item.id))),
    [catalog, selected]
  );

  function toggle(id) {
    const key = String(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function remove(id) {
    const key = String(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  if (!catalog.length) {
    return <p className="px-1 text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {selectedItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-3 py-2">
          {selectedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800"
            >
              {item.name}
              <button
                type="button"
                className="rounded-full px-1 text-indigo-400 hover:text-red-600"
                onClick={() => remove(item.id)}
                aria-label={`Remove ${item.name}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="border-b border-slate-100 p-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <i className="fa fa-search text-xs" />
          </span>
          <input
            type="search"
            className={`${inputClassName} pl-9`}
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="max-h-52 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-slate-500">{emptyMessage}</p>
        ) : (
          filtered.map((item) => {
            const checked = selected.has(String(item.id));
            return (
              <label
                key={item.id}
                className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-sm transition ${
                  checked ? 'bg-indigo-50' : 'hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  checked={checked}
                  onChange={() => toggle(item.id)}
                />
                <span>
                  <span className="font-medium text-slate-800">{item.name}</span>
                  <span className="text-slate-500">
                    {' '}
                    — {fmtPrice(item.price)} {priceLabel}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
