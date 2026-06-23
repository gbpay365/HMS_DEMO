import { useEffect, useMemo, useRef, useState } from 'react';

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

/**
 * Searchable item picker — filters by line type, supports inventory + catalog + custom new items.
 */
export function ClinicalDeptItemPicker({
  itemType,
  options = [],
  value,
  inventoryItemId,
  onChange,
  inputName = 'description',
  hiddenInvName = 'inventory_item_id',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const wrapRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = norm(query);
    const list = Array.isArray(options) ? options : [];
    if (!q) return list.slice(0, 80);
    return list.filter((opt) => norm(opt.name).includes(q) || norm(opt.sku).includes(q)).slice(0, 80);
  }, [options, query]);

  const exactMatch = useMemo(() => {
    const q = norm(query);
    if (!q) return false;
    return (options || []).some((opt) => norm(opt.name) === q);
  }, [options, query]);

  const pick = (opt) => {
    const name = opt?.name || '';
    setQuery(name);
    setOpen(false);
    onChange?.({
      description: name,
      inventory_item_id: opt?.inventory_item_id ? String(opt.inventory_item_id) : '',
      custom: !opt?.inventory_item_id,
    });
  };

  const pickCustom = () => {
    const name = String(query || '').trim();
    if (!name) return;
    setOpen(false);
    onChange?.({ description: name, inventory_item_id: '', custom: true });
  };

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name={hiddenInvName} value={inventoryItemId || ''} />
      <label className="hms-label text-[10px]">Item</label>
      <input
        className="hms-input text-sm w-full"
        name={inputName}
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          onChange?.({ description: v, inventory_item_id: '', custom: true });
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search or type item name…"
        autoComplete="off"
        required
      />
      {open && (filtered.length > 0 || (query.trim() && !exactMatch)) ? (
        <div
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
          role="listbox"
        >
          {filtered.map((opt) => (
            <button
              key={opt.id || opt.name}
              type="button"
              className="flex w-full flex-col items-start border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-sky-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(opt)}
            >
              <span className="font-medium text-ink">{opt.name}</span>
              {opt.source === 'inventory' ? (
                <span className="text-[10px] text-slate-500">
                  In stock · {opt.qty ?? '—'} {opt.sku ? `· ${opt.sku}` : ''}
                </span>
              ) : opt.source === 'custom' ? (
                <span className="text-[10px] uppercase text-emerald-600">Added this session</span>
              ) : (
                <span className="text-[10px] uppercase text-slate-400">Catalog</span>
              )}
            </button>
          ))}
          {query.trim() && !exactMatch ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={pickCustom}
            >
              <i className="fa fa-plus-circle" aria-hidden="true" />
              Add new item: &ldquo;{query.trim()}&rdquo;
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
