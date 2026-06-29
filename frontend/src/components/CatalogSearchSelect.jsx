import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatAmount, priceSuffixLabel } from '../lib/hmsLocale';

function itemHaystack(item, groupKey) {
  return [item.id, item.name, item[groupKey], item.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function fmtPrice(n) {
  const v = parseFloat(n || 0);
  return Number.isFinite(v) ? formatAmount(v) : '0';
}

function usePortalDropdownStyle(open, anchorRef, dropdownMinWidth, deps = []) {
  const [style, setStyle] = useState(null);

  useEffect(() => {
    if (!open || !anchorRef.current) {
      setStyle(null);
      return undefined;
    }

    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.max(dropdownMinWidth, rect.width);
      let left = rect.left;
      if (left + width > window.innerWidth - 16) {
        left = Math.max(16, window.innerWidth - width - 16);
      }
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const maxHeight = Math.min(340, Math.max(140, spaceBelow));
      setStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left,
        width,
        maxHeight,
        zIndex: 10050,
      });
    }

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, dropdownMinWidth, anchorRef, ...deps]);

  return style;
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
  priceLabel = priceSuffixLabel(),
  required = false,
  inputClassName = 'hms-input',
  portalDropdown = false,
  dropdownMinWidth = 280,
  maxResults = 24,
  minQueryLength = 0,
  searchHint = '',
  variant = 'default',
  allowCustomPick = false,
  onCustomPick,
  customPickFormatter,
}) {
  const [query, setQuery] = useState(value || '');
  const [selected, setSelected] = useState(value || '');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const anchorRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const v = String(value || '');
    setSelected(v);
    setQuery(v);
  }, [value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (selected && query === selected) return [];
    if (minQueryLength > 0 && q.length < minQueryLength) return [];
    const list = q ? items.filter((item) => itemHaystack(item, groupKey).includes(q)) : items;
    return list.slice(0, maxResults);
  }, [items, query, selected, groupKey, minQueryLength, maxResults]);

  const groupedMatches = useMemo(() => {
    const groups = new Map();
    for (const item of matches) {
      const key = String(item[groupKey] || '').trim() || '—';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [matches, groupKey]);

  const portalStyle = usePortalDropdownStyle(
    portalDropdown && open,
    anchorRef,
    dropdownMinWidth,
    [query, matches.length, groupedMatches.length]
  );

  useEffect(() => {
    function onDoc(ev) {
      const inWrap = wrapRef.current?.contains(ev.target);
      const inDropdown = dropdownRef.current?.contains(ev.target);
      if (!inWrap && !inDropdown) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pickCustom(label) {
    const v = String(label || '').trim();
    if (!v) return;
    setOpen(false);
    setQuery('');
    setSelected('');
    onCustomPick?.(v);
  }

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

  const trimmedQuery = query.trim();
  const qLen = trimmedQuery.length;
  const exactCatalogMatch = useMemo(() => {
    if (!qLen) return null;
    return items.find((item) => String(item.name || '').trim().toLowerCase() === trimmedQuery.toLowerCase()) || null;
  }, [items, trimmedQuery, qLen]);
  const showCustomPick =
    allowCustomPick &&
    qLen >= minQueryLength &&
    !selected &&
    trimmedQuery &&
    !exactCatalogMatch;
  const customPickLabel = customPickFormatter
    ? customPickFormatter(trimmedQuery)
    : `Use "${trimmedQuery}" as custom drug`;

  const isRx = variant === 'rx';
  const showHint = open && minQueryLength > 0 && qLen < minQueryLength && !selected;
  const showResults = open && matches.length > 0;
  const showEmpty = open && qLen >= minQueryLength && matches.length === 0 && !selected;

  function renderCustomPickButton() {
    if (!showCustomPick) return null;
    return (
      <button type="button" className="rx-drug-search-custom-pick" onClick={() => pickCustom(trimmedQuery)}>
        <i className="fa fa-plus-circle mr-1" aria-hidden />
        {customPickLabel}
      </button>
    );
  }

  function onSearchKeyDown(ev) {
    if (ev.key !== 'Enter' || !allowCustomPick || !trimmedQuery || selected) return;
    if (exactCatalogMatch) {
      ev.preventDefault();
      pick(exactCatalogMatch);
      return;
    }
    if (showCustomPick) {
      ev.preventDefault();
      pickCustom(trimmedQuery);
    }
  }

  const hintText =
    searchHint ||
    `Type at least ${minQueryLength} character${minQueryLength > 1 ? 's' : ''} to search…`;

  function renderItem(item) {
    if (isRx) {
      const category = String(item[groupKey] || '').trim();
      return (
        <button
          key={item.id ?? item.name}
          type="button"
          className="rx-drug-search-item"
          onClick={() => pick(item)}
        >
          <div className="rx-drug-search-item__name">{item.name}</div>
          <div className="rx-drug-search-item__meta">
            {category ? <span className="rx-drug-search-item__cat">{category}</span> : null}
            {showPrice ? (
              <span className="rx-drug-search-item__price">
                {fmtPrice(item.price)} {priceLabel}
              </span>
            ) : null}
          </div>
        </button>
      );
    }

    return (
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
    );
  }

  function renderDropdown() {
    if (!showHint && !showResults && !showEmpty) return null;

    const baseClass = isRx
      ? 'rx-drug-search-dropdown'
      : 'catalog-search-dropdown absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg';

    const style = portalDropdown ? portalStyle : undefined;

    if (showHint) {
      return (
        <div ref={dropdownRef} className={baseClass} style={style}>
          <div className={isRx ? 'rx-drug-search-hint' : 'px-3 py-2 text-xs text-slate-500'}>{hintText}</div>
        </div>
      );
    }

    if (showEmpty) {
      return (
        <div ref={dropdownRef} className={baseClass} style={style}>
          <div className={isRx ? 'rx-drug-search-empty' : 'px-3 py-2 text-xs text-slate-500'}>
            {emptyMessage}
          </div>
          {renderCustomPickButton()}
        </div>
      );
    }

    return (
      <div ref={dropdownRef} className={baseClass} style={style}>
        {groupedMatches.map(([group, groupItems]) => (
          <div key={group}>
            {groupedMatches.length > 1 ? (
              <div
                className={
                  isRx
                    ? 'rx-drug-search-group'
                    : 'sticky top-0 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500'
                }
              >
                {group}
              </div>
            ) : null}
            {groupItems.map((item) => renderItem(item))}
          </div>
        ))}
        {renderCustomPickButton()}
      </div>
    );
  }

  const dropdown = renderDropdown();

  return (
    <div ref={wrapRef} className="relative">
      {name ? <input type="hidden" name={name} value={selected} required={required && !selected} /> : null}
      <div ref={anchorRef} className="relative">
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
          onKeyDown={onSearchKeyDown}
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
      {portalDropdown && dropdown ? createPortal(dropdown, document.body) : dropdown}
    </div>
  );
}
